import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// -------------------- LOGGING SYSTEM --------------------
const history = [];
const HISTORY_FILE = "actionHistory.json";

// Load previous logs if available
if (fs.existsSync(HISTORY_FILE)) {
  const data = fs.readFileSync(HISTORY_FILE);
  Object.assign(history, JSON.parse(data));
}

// Save history to file
function saveHistory() {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Add a new log entry
function addLogEntry(source, device, state, user = "Unknown", ip = "N/A") {
  const entry = {
    timestamp: new Date().toLocaleString(),
    source,
    user,
    ip,
    device,
    action: state ? "ON" : "OFF",
  };
  history.push(entry);
  saveHistory();
  console.log(`📜 ${user} (${ip}) turned ${device} ${state ? "ON" : "OFF"}`);
}

// Route to view logs
app.get("/history", (req, res) => {
  res.json(history);
});

// -------------------- WEBSOCKET SERVER --------------------
let espSocket = null;
let webClients = [];

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  const url = req.url;

  if (url === "/esp") {
    console.log(`✅ ESP8266 connected from ${ip}`);
    espSocket = ws;
    ws.clientIP = ip;

    ws.on("message", (message) => {
      console.log("📡 From ESP:", message.toString());
      // Send ESP updates to all web clients
      webClients.forEach((client) => client.send(message.toString()));
    });

    ws.on("close", () => {
      console.log("❌ ESP disconnected");
      espSocket = null;
    });
  } else {
    console.log(`🌐 Web client connected from ${ip}`);
    ws.clientIP = ip;
    webClients.push(ws);

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message);
        console.log(`💻 From Web (${ip}):`, msg);

        // ✅ Log the user action
        addLogEntry("Web", msg.device, msg.state, msg.user || "Unknown", ip);

        // Forward to ESP
        if (espSocket) espSocket.send(message.toString());
      } catch (err) {
        console.error("❌ Error parsing message:", err);
      }
    });

    ws.on("close", () => {
      webClients = webClients.filter((c) => c !== ws);
    });
  }
});

// -------------------- HTTP → WS UPGRADE --------------------
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  console.log("🔗 Upgrading HTTP to WebSocket");
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
