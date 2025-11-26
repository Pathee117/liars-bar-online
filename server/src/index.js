import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
  });

  // Temp test event
  socket.on("ping", (msg) => {
    socket.emit("pong", { msg, at: Date.now() });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("server listening on", PORT);
});