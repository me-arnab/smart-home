import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serve index.html from public/

const PORT = process.env.PORT || 8080;

// Store current states (in-memory)
let deviceStates = {
  light1: false,
  light2: false,
  fan: false,
  plug: false,
};

// Store logs in a file
const LOG_FILE = "actionHistory.json";
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([]));

function logAction(device, state, user) {
  const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const log = {
    device,
    state,
    user: user || "Unknown",
    time,
  };
  const history = JSON.parse(fs.readFileSync(LOG_FILE));
  history.push(log);
  fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2));
  console.log(`[${time}] ${device} turned ${state ? "ON" : "OFF"} by ${user}`);
}

// WebSocket setup
let espSocket = null;
let webClients = [];

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, req) => {
  const url = req.url;

  if (url === "/esp") {
    console.log("✅ ESP8266 connected");
    espSocket = ws;

    ws.on("message", (message) => {
      console.log("📡 From ESP:", message.toString());
      const msg = JSON.parse(message);
      if (msg.device && typeof msg.state === "boolean") {
        deviceStates[msg.device] = msg.state;
        webClients.forEach((client) =>
          client.send(JSON.stringify({ type: "update", device: msg.device, state: msg.state }))
        );
      }
    });

    ws.on("close", () => {
      console.log("❌ ESP disconnected");
      espSocket = null;
    });

  } else {
    console.log("🌐 Web client connected");
    webClients.push(ws);

    // Send initial states
    ws.send(JSON.stringify({ type: "init", data: deviceStates }));

    ws.on("message", (message) => {
      console.log("💻 From Web:", message.toString());
      const msg = JSON.parse(message);

      if (msg.type === "toggle" && msg.device) {
        deviceStates[msg.device] = msg.state;

        // Log who toggled
        logAction(msg.device, msg.state, msg.user || "Unknown");

        // Send update to ESP
        if (espSocket) espSocket.send(JSON.stringify(msg));

        // Broadcast to all clients
        webClients.forEach((client) => {
          if (client.readyState === 1)
            client.send(JSON.stringify({ type: "update", device: msg.device, state: msg.state }));
        });
      }
    });

    ws.on("close", () => {
      webClients = webClients.filter((c) => c !== ws);
    });
  }
});

// Upgrade HTTP → WebSocket
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
server.on("upgrade", (req, socket, head) => {
  console.log("🔗 Upgrading HTTP to WebSocket");
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
