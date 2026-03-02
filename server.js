// ============================================================================
// server.js v 1.1
// WebSocket game server with rooms, metadata, tags, binary relay, wake endpoint
// ============================================================================

const http = require("http");
const WebSocket = require("ws");

const port = process.env.PORT || 8080;

// ---------------------------------------------------------------------------
// Whitelist — add allowed origins here. Set to null or [] to allow all.
// ---------------------------------------------------------------------------

const ORIGIN_WHITELIST = [
  // "https://yourgame.com",
  // "http://localhost:3000",
];

function isAllowedOrigin(origin) {
  if (!ORIGIN_WHITELIST || ORIGIN_WHITELIST.length === 0) return true;
  if (!origin) return true;
  return ORIGIN_WHITELIST.includes(origin);
}

const httpServer = http.createServer((req, res) => {
  const origin = req.headers.origin || "";

  if (req.method === "GET" && req.url === "/wake") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "awake", timestamp: Date.now() }));
    return;
  }

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({
  server: httpServer,
  verifyClient: ({ origin }, cb) => {
    if (isAllowedOrigin(origin)) {
      cb(true);
    } else {
      console.warn(`[ws] Rejected connection from origin: ${origin}`);
      cb(false, 403, "Forbidden");
    }
  }
});

const defaultMaxClients = 8;
const rooms = {};

function sendJson(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function sendError(ws, message) { sendJson(ws, { type: "error", message }); }
function heartbeat() { this.isAlive = true; }

wss.on("connection", (ws, req) => {
  ws.id = Math.floor(Math.random() * 1e9);
  ws.roomId = null;
  ws.isAlive = true;

  ws.on("pong", heartbeat);
  sendJson(ws, { type: "assignId", playerId: ws.id });

  ws.on("message", message => {
    let data = null;
    try {
      data = JSON.parse(message.toString());
    } catch {
      const room = rooms[ws.roomId];
      if (!room) return;
      const out = new ArrayBuffer(message.length + 4);
      const dv = new DataView(out);
      dv.setUint32(0, ws.id);
      new Uint8Array(out, 4).set(new Uint8Array(message));
      if (room.owner && room.owner !== ws) room.owner.send(out);
      room.clients.forEach(c => c !== ws && c.send(out));
      return;
    }

    switch (data.type) {

      case "wake": {
        sendJson(ws, { type: "awake", timestamp: Date.now(), playerId: ws.id });
        break;
      }

      case "createRoom": {
        if (ws.roomId) { sendError(ws, "Already in a room"); return; }
        const roomId = Math.random().toString(36).substr(2, 5).toUpperCase();
        rooms[roomId] = {
          owner: ws, ownerId: ws.id, clients: [],
          tags: Array.isArray(data.tags) ? data.tags : [],
          maxClients: data.maxClients || defaultMaxClients,
          metaData: data.metaData || { name: "public lobby" }
        };
        ws.roomId = roomId;
        sendJson(ws, { type: "roomCreated", roomId, playerId: ws.id, ownerId: ws.id, maxClients: rooms[roomId].maxClients, metaData: rooms[roomId].metaData });
        break;
      }

      case "joinRoom": {
        if (ws.roomId) { sendError(ws, "Already in a room"); return; }
        const targetId = data.roomId?.toUpperCase();
        const room = rooms[targetId];
        if (!room) { sendError(ws, "Room does not exist"); return; }
        if (room.clients.length + 1 >= room.maxClients) { sendError(ws, "Room full"); return; }
        if (room.tags.includes("closed")) { sendError(ws, "Room Closed"); return; }
        room.clients.push(ws);
        ws.roomId = targetId;
        sendJson(ws, { type: "roomJoined", roomId: ws.roomId, playerId: ws.id, ownerId: room.ownerId, maxClients: room.maxClients, metaData: room.metaData });
        sendJson(room.owner, { type: "playerJoined", playerId: ws.id, roomId: ws.roomId });
        room.clients.forEach(c => { if (c !== ws) sendJson(c, { type: "playerJoined", playerId: ws.id, roomId: ws.roomId }); });
        break;
      }

      case "leaveRoom": {
        const oldRoomId = ws.roomId;
        leaveRoom(ws);
        sendJson(ws, { type: "leftRoom", roomId: oldRoomId });
        break;
      }

      case "listRooms": {
        const list = [];
        for (const [id, room] of Object.entries(rooms)) {
          if (room.tags.includes("private") || room.tags.includes("closed")) continue;
          if (data.tags && !data.tags.every(t => room.tags.includes(t))) continue;
          list.push({ roomId: id, ownerId: room.ownerId, playerCount: room.clients.length + 1, maxClients: room.maxClients, tags: room.tags, metaData: room.metaData });
        }
        sendJson(ws, { type: "roomList", rooms: list });
        break;
      }

      case "relay": {
        const room = rooms[ws.roomId];
        if (!room) return;
        if (room.owner && room.owner !== ws) sendJson(room.owner, { type: "relay", from: ws.id, payload: data.payload });
        room.clients.forEach(c => { if (c !== ws) sendJson(c, { type: "relay", from: ws.id, payload: data.payload }); });
        break;
      }

      case "tellOwner": {
        const room = rooms[ws.roomId];
        if (!room?.owner) return;
        sendJson(room.owner, { type: "tellOwner", from: ws.id, payload: data.payload });
        break;
      }

      case "tellPlayer": {
        const room = rooms[ws.roomId];
        if (!room) return;
        const target = room.ownerId === data.playerId ? room.owner : room.clients.find(c => c.id === data.playerId);
        if (target) sendJson(target, { type: "tellPlayer", from: ws.id, payload: data.payload });
        break;
      }

      case "updateMeta": {
        const room = rooms[ws.roomId];
        if (!room || room.owner !== ws) return;
        if (typeof data.metaData !== "object" || data.metaData === null) return;
        room.metaData = { ...room.metaData, ...data.metaData };
        const payload = { type: "roomUpdated", roomId: ws.roomId, metaData: room.metaData };
        sendJson(room.owner, payload);
        room.clients.forEach(c => sendJson(c, payload));
        break;
      }

      case "setRoomTag": {
        const room = rooms[ws.roomId];
        if (!room || room.owner !== ws) return;
        if (typeof data.tag !== "string" || data.tag.startsWith("game:")) return;
        if (!Array.isArray(room.tags)) room.tags = [];
        if (!room.tags.includes(data.tag)) room.tags.push(data.tag);
        const payload = { type: "roomTagAdded", roomId: ws.roomId, tag: data.tag, tags: room.tags };
        sendJson(room.owner, payload);
        room.clients.forEach(c => sendJson(c, payload));
        break;
      }

      case "clearRoomTag": {
        const room = rooms[ws.roomId];
        if (!room || room.owner !== ws) return;
        if (typeof data.tag !== "string" || data.tag.startsWith("game:")) return;
        room.tags = (room.tags || []).filter(t => t.startsWith("game:") || t !== data.tag);
        const payload = { type: "roomTagRemoved", roomId: ws.roomId, tag: data.tag, tags: room.tags };
        sendJson(room.owner, payload);
        room.clients.forEach(c => sendJson(c, payload));
        break;
      }
    }
  });

  ws.once("close", () => leaveRoom(ws));
});

function leaveRoom(ws) {
  const room = rooms[ws.roomId];
  if (!room) { ws.roomId = null; return; }
  const roomId = ws.roomId;
  if (room.owner === ws) {
    if (room.clients.length > 0) {
      const newOwner = room.clients.shift();
      const oldHostId = ws.id;
      room.owner = newOwner;
      room.ownerId = newOwner.id;
      sendJson(newOwner, { type: "makeHost", oldHostId, roomId });
      room.clients.forEach(c => sendJson(c, { type: "reassignedHost", newHostId: newOwner.id, oldHostId, roomId }));
    } else {
      delete rooms[roomId];
    }
  } else {
    room.clients = room.clients.filter(c => c !== ws);
    if (room.owner) sendJson(room.owner, { type: "playerLeft", playerId: ws.id, roomId });
    room.clients.forEach(c => sendJson(c, { type: "playerLeft", playerId: ws.id, roomId }));
  }
  ws.roomId = null;
}

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Wake endpoint: http://localhost:${port}/wake`);
});