
const socket = io();
const $ = id => document.getElementById(id);

let isHost = false;
let currentRoom = "";
let player = null;
let playerReady = false;
let pendingVideo = "";
let lastSent = 0;
let suppressEvents = false;

socket.on("connect", () => {
  $("connection").textContent = "Connected";
});

socket.on("disconnect", () => {
  $("connection").textContent = "Reconnecting…";
});

socket.on("connect_error", () => {
  $("connection").textContent = "Connection error";
});

function showRoom(result) {
  isHost = result.host;
  currentRoom = result.code;

  $("home").classList.add("hidden");
  $("room").classList.remove("hidden");
  $("roomCodeLabel").textContent = currentRoom;
  $("roleLabel").textContent = isHost
    ? "You are the host"
    : "You joined as a viewer";

  $("hostTools").classList.toggle("hidden", !isHost);
  $("viewerNote").classList.toggle("hidden", isHost);

  if (result.state?.videoId) {
    loadPlayer(result.state.videoId, result.state);
  }
}

$("createBtn").onclick = () => {
  $("homeError").textContent = "";

  socket.emit("create-room", $("displayName").value.trim(), result => {
    if (!result?.ok) {
      $("homeError").textContent = "Could not create room.";
      return;
    }
    showRoom(result);
  });
};

$("joinBtn").onclick = () => {
  $("homeError").textContent = "";

  socket.emit("join-room", $("roomCode").value.trim(), result => {
    if (!result?.ok) {
      $("homeError").textContent = result?.error || "Could not join room.";
      return;
    }
    showRoom(result);
  });
};

$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(currentRoom);
    $("copyBtn").textContent = "Copied!";
  } catch {
    $("copyBtn").textContent = currentRoom;
  }
};

$("leaveBtn").onclick = () => location.reload();

$("loadVideoBtn").onclick = () => {
  const id = getVideoId($("youtubeUrl").value.trim());

  if (!id) {
    $("roomError").textContent = "Invalid YouTube link.";
    return;
  }

  $("roomError").textContent = "Loading video...";

  socket.emit("set-video", id);
};

function getVideoId(url) {
  try {
    const u = new URL(url);
    let id = "";

    if (u.hostname.includes("youtu.be")) {
      id = u.pathname.slice(1);
    } else if (u.hostname.includes("youtube.com")) {
      id = u.searchParams.get("v") || "";

      if (!id && u.pathname.includes("/embed/")) {
        id = u.pathname.split("/embed/")[1].split("/")[0];
      }

      if (!id && u.pathname.includes("/shorts/")) {
        id = u.pathname.split("/shorts/")[1].split("/")[0];
      }
    }

    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

window.onYouTubeIframeAPIReady = () => {
  playerReady = true;

  if (pendingVideo) {
    createPlayer(pendingVideo);
  }
};

setTimeout(() => {
  if (!playerReady) {
    $("roomError").textContent =
      "YouTube player did not load. Refresh the page.";
  }
}, 10000);

function loadPlayer(videoId, state) {
  $("emptyPlayer").classList.add("hidden");

  if (!playerReady) {
    pendingVideo = videoId;
    $("roomError").textContent = "Waiting for YouTube player...";
    return;
  }

  if (player && player.loadVideoById) {
    player.loadVideoById(videoId);
  } else {
    createPlayer(videoId);
  }

  if (state) {
    setTimeout(() => applyPlayback(state), 1200);
  }
}

function createPlayer(videoId) {
  pendingVideo = "";

  if (!window.YT || !YT.Player) {
    $("roomError").textContent = "YouTube player is not ready.";
    return;
  }

  player = new YT.Player("player", {
    videoId: videoId,
    playerVars: {
      playsinline: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        $("roomError").textContent =
          "Video loaded. Press play if needed.";

        if (!isHost) {
          player.pauseVideo();
        }
      },

      onStateChange: event => {
        if (!isHost || suppressEvents) return;

        if (
          event.data === YT.PlayerState.PLAYING ||
          event.data === YT.PlayerState.PAUSED
        ) {
          sendPlayback();
        }
      },

      onError: event => {
        $("roomError").textContent =
          "YouTube error code: " + event.data +
          ". Try another video.";
      }
    }
  });
}

function sendPlayback() {
  const now = Date.now();

  if (now - lastSent < 700) return;

  lastSent = now;

  socket.emit("playback", {
    playing: player.getPlayerState() === YT.PlayerState.PLAYING,
    time: player.getCurrentTime() || 0
  });
}

function applyPlayback(state) {
  if (!player || !player.seekTo) return;

  suppressEvents = true;

  const target = Math.max(0, Number(state.time) || 0);
  const drift = Math.abs(
    (player.getCurrentTime() || 0) - target
  );

  if (drift > 2) {
    player.seekTo(target, true);
  }

  if (state.playing) {
    player.playVideo();
  } else {
    player.pauseVideo();
  }

  setTimeout(() => {
    suppressEvents = false;
  }, 800);
}

socket.on("video-changed", ({ videoId }) => {
  $("emptyPlayer").classList.add("hidden");
  loadPlayer(videoId);
});

socket.on("playback", state => {
  if (!isHost) applyPlayback(state);
});

socket.on("room-update", info => {
  $("memberCount").textContent =
    `${info.count} watching`;
});

socket.on("room-closed", () => {
  $("roomError").textContent =
    "The host left. This room has closed.";

  $("hostTools").classList.add("hidden");
  $("viewerNote").classList.add("hidden");
});
