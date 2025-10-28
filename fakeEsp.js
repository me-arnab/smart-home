// import WebSocket from "ws";

// // Connect to your backend’s ESP endpoint
// const socket = new WebSocket("ws://localhost:8080/esp");

// socket.on("open", () => {
//   console.log("✅ Fake ESP connected to server");

//   // Example: simulate initial state
//   socket.send(JSON.stringify({
//     type: "init",
//     data: {
//       light1: false,
//       light2: false,
//       fan: false,
//       plug: false
//     }
//   }));
// });

// socket.on("message", (msg) => {
//   console.log("📡 Received from server:", msg.toString());

//   // You can simulate ESP action here if needed
// });

// socket.on("close", () => {
//   console.log("❌ Connection closed");
// });
