// ============================================================================
// server.js
// WebSocket game server with rooms, metadata, tags, and binary relay support
// ============================================================================

const WebSocket = require("ws");
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const defaultMaxClients = 8;
const rooms = {};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function sendJson(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendError(ws, message) {
  sendJson(ws, { type: "error", message });
}

function heartbeat() {
  this.isAlive = true;
}

// ---------------------------------------------------------------------------
// Connection handling
// ---------------------------------------------------------------------------

wss.on("connection", ws => {
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
      // ---------------- Binary relay ----------------
      const room = rooms[ws.roomId];
      if (!room) return;

      // prefix senderId (uint32)
      const out = new ArrayBuffer(message.length + 4);
      const dv = new DataView(out);
      dv.setUint32(0, ws.id);
      new Uint8Array(out, 4).set(new Uint8Array(message));

      if (room.owner && room.owner !== ws) room.owner.send(out);
      room.clients.forEach(c => c !== ws && c.send(out));
      return;
    }

    // ---------------- JSON packets ----------------
    switch (data.type) {

      // -------------------------------------------------------
      // Room creation
      // -------------------------------------------------------
      case "createRoom": {
        if (ws.roomId) {
          sendError(ws, "Already in a room");
          return;
        }

        const roomId = Math.random().toString(36).substr(2, 5).toUpperCase();

        rooms[roomId] = {
          owner: ws,
          ownerId: ws.id,
          clients: [],
          tags: Array.isArray(data.tags) ? data.tags : [],
          maxClients: data.maxClients || defaultMaxClients,
          metaData: data.metaData || { name: "public lobby" }
        };

        ws.roomId = roomId;

        sendJson(ws, {
          type: "roomCreated",
          roomId,
          playerId: ws.id,
          ownerId: ws.id,
          maxClients: rooms[roomId].maxClients,
          metaData: rooms[roomId].metaData
        });
        break;
      }

      // -------------------------------------------------------
      // Join room
      // -------------------------------------------------------
      case "joinRoom": {
        if (ws.roomId) {
          sendError(ws, "Already in a room");
          return;
        }

        const targetId = data.roomId?.toUpperCase();
        const room = rooms[targetId];
        if (!room) {
          sendError(ws, "Room does not exist");
          return;
        }

        // maxClients includes owner
        if (room.clients.length + 1 >= room.maxClients) {
          sendError(ws, "Room full");
          return;
        }

        if (room.tags.includes("closed")) {
          sendError(ws, "Room Closed");
          return;
        }

        room.clients.push(ws);
        ws.roomId = targetId;

        sendJson(ws, {
          type: "roomJoined",
          roomId: ws.roomId,
          playerId: ws.id,
          ownerId: room.ownerId,
          maxClients: room.maxClients,
          metaData: room.metaData
        });

        // notify others someone joined (optional)
        sendJson(room.owner, {
          type: "playerJoined",
          playerId: ws.id,
          roomId: ws.roomId
        });
        room.clients.forEach(c => {
          if (c !== ws) {
            sendJson(c, {
              type: "playerJoined",
              playerId: ws.id,
              roomId: ws.roomId
            });
          }
        });

        break;
      }

      // -------------------------------------------------------
      // Leave room
      // -------------------------------------------------------
      case "leaveRoom": {
        const oldRoomId = ws.roomId;
        leaveRoom(ws);
        sendJson(ws, { type: "leftRoom", roomId: oldRoomId });
        break;
      }

      // -------------------------------------------------------
      // List rooms (filterable by tags, hides private/closed)
      // -------------------------------------------------------
      case "listRooms": {
        const list = [];

        for (const [id, room] of Object.entries(rooms)) {
          if (room.tags.includes("private") || room.tags.includes("closed")) continue;
          if (data.tags && !data.tags.every(t => room.tags.includes(t))) continue;

          list.push({
            roomId: id,
            ownerId: room.ownerId,
            playerCount: room.clients.length + 1,
            maxClients: room.maxClients,
            tags: room.tags,
            metaData: room.metaData
          });
        }

        sendJson(ws, { type: "roomList", rooms: list });
        break;
      }

      // -------------------------------------------------------
      // Relay JSON payload to everyone in room
      // -------------------------------------------------------
      case "relay": {
        const room = rooms[ws.roomId];
        if (!room) return;

        if (room.owner && room.owner !== ws) {
          sendJson(room.owner, {
            type: "relay",
            from: ws.id,
            payload: data.payload
          });
        }

        room.clients.forEach(c => {
          if (c !== ws) {
            sendJson(c, {
              type: "relay",
              from: ws.id,
              payload: data.payload
            });
          }
        });
        break;
      }

      // -------------------------------------------------------
      // Tell owner only
      // -------------------------------------------------------
      case "tellOwner": {
        const room = rooms[ws.roomId];
        if (!room?.owner) return;

        sendJson(room.owner, {
          type: "tellOwner",
          from: ws.id,
          payload: data.payload
        });
        break;
      }

      // -------------------------------------------------------
      // Tell specific player in room
      // -------------------------------------------------------
      case "tellPlayer": {
        const room = rooms[ws.roomId];
        if (!room) return;

        const target =
          room.ownerId === data.playerId
            ? room.owner
            : room.clients.find(c => c.id === data.playerId);

        if (target) {
          sendJson(target, {
            type: "tellPlayer",
            from: ws.id,
            payload: data.payload
          });
        }
        break;
      }

      // -------------------------------------------------------
      // Optional: host updates room metadata
      // -------------------------------------------------------
      case "updateMeta": {
        const room = rooms[ws.roomId];
        if (!room || room.owner !== ws) return;
        if (typeof data.metaData !== "object" || data.metaData === null) return;

        room.metaData = { ...room.metaData, ...data.metaData };

        const payload = {
          type: "roomUpdated",
          roomId: ws.roomId,
          metaData: room.metaData
        };

        sendJson(room.owner, payload);
        room.clients.forEach(c => sendJson(c, payload));
        break;
      }

      // -------------------------------------------------------
      // Optional: host adds/removes tags (e.g. "closed")
      // -------------------------------------------------------
      // -------------------------------------------------------
      // Add a room tag (host only)
      // -------------------------------------------------------
      case "setRoomTag": {
        const room = rooms[ws.roomId];
        if (!room || room.owner !== ws) return;
        if (typeof data.tag !== "string") return;

        // Prevent clients from adding game:* tags
        if (data.tag.startsWith("game:")) return;

        if (!Array.isArray(room.tags)) room.tags = [];

        // Avoid duplicates
        if (!room.tags.includes(data.tag)) {
          room.tags.push(data.tag);
        }

        const payload = {
          type: "roomTagAdded",
          roomId: ws.roomId,
          tag: data.tag,
          tags: room.tags
        };

        sendJson(room.owner, payload);
        room.clients.forEach(c => sendJson(c, payload));
        break;
      }


      // -------------------------------------------------------
      // Remove a room tag (host only)
      // -------------------------------------------------------
      case "clearRoomTag": {
        const room = rooms[ws.roomId];
        if (!room || room.owner !== ws) return;
        if (typeof data.tag !== "string") return;

        // Never remove game:* tags
        if (data.tag.startsWith("game:")) return;

        // Filter out only the requested tag, but ALWAYS keep game:* tags
        room.tags = (room.tags || []).filter(t => {
          if (t.startsWith("game:")) return true; // keep game tags
          return t !== data.tag;                  // remove only the target tag
        });

        const payload = {
          type: "roomTagRemoved",
          roomId: ws.roomId,
          tag: data.tag,
          tags: room.tags
        };

        sendJson(room.owner, payload);
        room.clients.forEach(c => sendJson(c, payload));
        break;
      }
    }
  });

  ws.once("close", () => leaveRoom(ws));
});

// ---------------------------------------------------------------------------
// Room cleanup / host reassignment
// ---------------------------------------------------------------------------

function leaveRoom(ws) {
  const room = rooms[ws.roomId];
  if (!room) {
    ws.roomId = null;
    return;
  }

  const roomId = ws.roomId;

  if (room.owner === ws) {
    // host leaving
    if (room.clients.length > 0) {
      const newOwner = room.clients.shift();
      const oldHostId = ws.id;

      room.owner = newOwner;
      room.ownerId = newOwner.id;

      // notify new host
      sendJson(newOwner, {
        type: "makeHost",
        oldHostId,
        roomId
      });

      // notify remaining clients
      room.clients.forEach(c =>
        sendJson(c, {
          type: "reassignedHost",
          newHostId: newOwner.id,
          oldHostId,
          roomId
        })
      );
    } else {
      // no clients left, delete room
      delete rooms[roomId];
    }
  } else {
    // non-host leaving
    room.clients = room.clients.filter(c => c !== ws);

    // notify host
    if (room.owner) {
      sendJson(room.owner, {
        type: "playerLeft",
        playerId: ws.id,
        roomId
      });
    }

    // notify other clients
    room.clients.forEach(c =>
      sendJson(c, {
        type: "playerLeft",
        playerId: ws.id,
        roomId
      })
    );
  }

  ws.roomId = null;
}

// ---------------------------------------------------------------------------
//— Heartbeat / timeout
// ---------------------------------------------------------------------------

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

console.log(`WebSocket server listening on port ${port}`);