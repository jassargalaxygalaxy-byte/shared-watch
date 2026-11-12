const socket = io();
const $ = id => document.getElementById(id);
let isHost = false, currentRoom = "", player = null, playerReady = false, pendingVideo = "", lastSent = 0, suppressEvents = false;

socket.on("connect", () => $("connection").textContent = "Connected");
socket.on("disconnect", () => $("connection").textContent = "Reconnecting…");

function showRoom(result) {
  isHost = result.host;
  currentRoom = result.code;
  $("home").classList.add("hidden");
  $("room").classList.remove("hidden");
  $("roomCodeLabel").textContent = currentRoom;
  $("roleLabel").textContent = isHost ? "You are the host" : "You joined as a viewer";
  $("hostTools").classList.toggle("hidden", !isHost);
  $("viewerNote").classList.toggle("hidden", isHost);
  if (result.state?.videoId) loadPlayer(result.state.videoId, result.state);
}
$("createBtn").onclick = () => {
  $("homeError").textContent = "";
  socket.emit("create-room", $("displayName").value.trim(), result => {
    if (!result?.ok) return $("homeError").textContent = "Could not create room. Try again.";
    showRoom(result);
  });
};
$("joinBtn").onclick = () => {
  $("homeError").textContent = "";
  socket.emit("join-room", $("roomCode").value.trim(), result => {
    if (!result?.ok) return $("homeError").textContent = result?.error || "Could not join room.";
    showRoom(result);
  });
};
$("copyBtn").onclick = async () => {
  try { await navigator.clipboard.writeText(currentRoom); $("copyBtn").textContent = "Copied!"; }
  catch { $("copyBtn").textContent = currentRoom; }
};
$("leaveBtn").onclick = () => location.reload();
$("loadVideoBtn").onclick = () => {
  const id = getVideoId($("youtubeUrl").value.trim());
  if (!id) return $("roomError").textContent = "Enter a valid YouTube video link.";
  $("roomError").textContent = "";
  socket.emit("set-video", id);
};
function getVideoId(url) {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v") || (u.pathname.includes("/embed/") ? u.pathname.split("/embed/")[1] : "");
    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}
window.onYouTubeIframeAPIReady = () => { playerReady = true; if (pendingVideo) createPlayer(pendingVideo); };
function loadPlayer(videoId, state) {
  $("emptyPlayer").classList.add("hidden");
  if (!playerReady) { pendingVideo = videoId; return; }
  if (player && player.loadVideoById) {
    player.loadVideoById(videoId);
  } else createPlayer(videoId);
  if (state && player) setTimeout(() => applyPlayback(state), 900);
}
function createPlayer(videoId) {
  pendingVideo = "";
  player = new YT.Player("player", {
    videoId,
    playerVars: { playsinline: 1, rel: 0 },
    events: {
      onReady: () => { if (!isHost) player.pauseVideo(); },
      onStateChange: event => {
        if (!isHost || suppressEvents) return;
        if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) sendPlayback();
      },
      onError: () => $("roomError").textContent = "This video cannot be played here. Try another YouTube video."
    }
  });
}
function sendPlayback() {
  const now = Date.now();
  if (now - lastSent < 700) return;
  lastSent = now;
  socket.emit("playback", { playing: player.getPlayerState() === YT.PlayerState.PLAYING, time: player.getCurrentTime() || 0 });
}
function applyPlayback(state) {
  if (!player || !player.seekTo) return;
  suppressEvents = true;
  const target = Math.max(0, Number(state.time) || 0);
  const drift = Math.abs((player.getCurrentTime() || 0) - target);
  if (drift > 2) player.seekTo(target, true);
  if (state.playing) player.playVideo(); else player.pauseVideo();
  setTimeout(() => suppressEvents = false, 800);
}
socket.on("video-changed", ({videoId}) => {
  $("emptyPlayer").classList.add("hidden");
  loadPlayer(videoId);
});
socket.on("playback", state => { if (!isHost) applyPlayback(state); });
socket.on("room-update", info => {
  $("memberCount").textContent = `${info.count} watching`;
});
socket.on("room-closed", () => {
  $("roomError").textContent = "The host left. This room has closed.";
  $("hostTools").classList.add("hidden");
  $("viewerNote").classList.add("hidden");
});
