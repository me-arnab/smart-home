import express from "express"; 
import { WebSocketServer } from "ws";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

let espSocket = null;
let webClients = [];

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, req) => {
  const url = req.url;

  if (url === "/esp") {
    console.log("✅ ESP8266 connected");
    espSocket = ws;

    ws.on("message", (message) => {
      console.log("📡 From ESP:", message.toString());
      // Broadcast ESP state to all web clients
      webClients.forEach((client) => client.send(message.toString()));
    });

    ws.on("close", () => {
      console.log("❌ ESP disconnected");
      espSocket = null;
    });

  } else {
    console.log("🌐 Web client connected");
    webClients.push(ws);

    ws.on("message", (message) => {
      console.log("💻 From Web:", message.toString());
      if (espSocket) espSocket.send(message.toString());
    });

    ws.on("close", () => {
      webClients = webClients.filter((c) => c !== ws);
    });
  }
});

// 🟩 ADD THIS BLOCK
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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
