import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ✅ Device states stored in memory
let deviceStates = {
  light1: false,
  light2: false,
  fan: false,
  plug: false,
};

// ✅ Load saved device states if available
const stateFile = "./deviceStates.json";
if (fs.existsSync(stateFile)) {
  deviceStates = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  console.log("♻️ Loaded previous device states:", deviceStates);
}

// ✅ Log history (persistent in Render file system for session)
const logFile = "./history.json";
let history = [];
if (fs.existsSync(logFile)) {
  history = JSON.parse(fs.readFileSync(logFile, "utf8"));
}

let espSocket = null;
let webClients = [];

const wss = new WebSocketServer({ noServer: true });

// ------------------ WebSocket Logic ------------------
wss.on("connection", (ws, req) => {
  const url = req.url;

  if (url === "/esp") {
    console.log("✅ ESP8266 connected");
    espSocket = ws;

    ws.send(JSON.stringify({ type: "init", states: deviceStates }));

    ws.on("message", (message) => {
      console.log("📡 From ESP:", message.toString());
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === "update") {
          deviceStates[msg.device] = msg.state;
          fs.writeFileSync(stateFile, JSON.stringify(deviceStates, null, 2)); // ✅ Save new state
          broadcastWeb(JSON.stringify(msg));
          saveLog(msg.user || "ESP", msg.device, msg.state);
        }
      } catch (e) {
        console.log("Invalid ESP message:", e);
      }
    });

    ws.on("close", () => {
      console.log("❌ ESP disconnected");
      espSocket = null;
    });
  } else {
    console.log("🌐 Web client connected");
    webClients.push(ws);

    // Send all device states when user connects
    ws.send(JSON.stringify({ type: "init", states: deviceStates }));

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === "toggle") {
          deviceStates[msg.device] = msg.state;
          fs.writeFileSync(stateFile, JSON.stringify(deviceStates, null, 2)); // ✅ Save to file

          // Send update to ESP
          if (espSocket) espSocket.send(JSON.stringify(msg));

          // Update all web clients
          broadcastWeb(JSON.stringify(msg));

          // Log the change
          saveLog(msg.user || "Web User", msg.device, msg.state);
        }
      } catch (e) {
        console.log("Invalid message from web:", e);
      }
    });

    ws.on("close", () => {
      webClients = webClients.filter((c) => c !== ws);
    });
  }
});

function broadcastWeb(message) {
  webClients.forEach((client) => {
    if (client.readyState === 1) client.send(message);
  });
}

function saveLog(user, device, state) {
  const entry = {
    user,
    device,
    state,
    time: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  };
  history.push(entry);
  fs.writeFileSync(logFile, JSON.stringify(history, null, 2));
  console.log("📝 Log:", entry);
}

// ✅ Serve frontend files
app.use(express.static("public"));

// ✅ API route for history
app.get("/history", (req, res) => {
  res.json(history);
});

// ✅ ESP Connection Status API
app.get("/status", (req, res) => {
  res.json({ connected: espSocket !== null });
});

// ✅ Create HTTP server and upgrade to WebSocket
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
