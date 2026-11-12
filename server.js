const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

function code() {
  let value;
  do { value = String(100000 + crypto.randomInt(900000)); }
  while (rooms.has(value));
  return value;
}
function roomInfo(room) {
  return { code: room.code, count: room.members.size, videoId: room.videoId || "" };
}
function emitRoom(room) {
  io.to(room.code).emit("room-update", roomInfo(room));
}

io.on("connection", socket => {
  socket.on("create-room", (name, cb) => {
    const roomCode = code();
    const room = { code: roomCode, host: socket.id, members: new Set([socket.id]), videoId: "", playing: false, time: 0, updatedAt: Date.now() };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost = true;
    cb?.({ ok: true, code: roomCode, host: true });
    emitRoom(room);
  });

  socket.on("join-room", (roomCode, cb) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return cb?.({ ok: false, error: "Room not found. Check the code." });
    room.members.add(socket.id);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = false;
    cb?.({ ok: true, code: room.code, host: false, state: { videoId: room.videoId, playing: room.playing, time: room.time } });
    emitRoom(room);
  });

  socket.on("set-video", videoId => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !socket.data.isHost || !/^[a-zA-Z0-9_-]{11}$/.test(videoId || "")) return;
    room.videoId = videoId;
    room.playing = false;
    room.time = 0;
    room.updatedAt = Date.now();
    io.to(room.code).emit("video-changed", { videoId });
    emitRoom(room);
  });

  socket.on("playback", state => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !socket.data.isHost || !room.videoId) return;
    room.playing = !!state.playing;
    room.time = Math.max(0, Number(state.time) || 0);
    room.updatedAt = Date.now();
    socket.to(room.code).emit("playback", { playing: room.playing, time: room.time, sentAt: Date.now() });
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.members.delete(socket.id);
    if (room.host === socket.id) {
      io.to(roomCode).emit("room-closed");
      rooms.delete(roomCode);
    } else {
      emitRoom(room);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => console.log(`Shared Watch running on ${port}`));