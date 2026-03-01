# NetClient

Lightweight WebSocket networking client for browser games. Rooms, relays, host management, tags, metadata, and binary support — all in one dependency-free ES module.

**[📖 Full Documentation](https://yzzyonline.github.io/netclient)** · Made by [yzzy online](https://github.com/yzzyonline)

---

## Features

- 🚪 **Room Management** — Create, join, and leave rooms with max client limits and privacy controls
- 📡 **Relay Messaging** — Broadcast JSON payloads to all players or target a specific player/host
- 👑 **Host Handoff** — Automatic host reassignment when the current host disconnects
- ⚡ **Binary Support** — Send raw `ArrayBuffer`s for high-frequency position updates
- 🏷️ **Tags & Metadata** — Tag rooms for filtering and attach custom metadata
- 🔌 **Simple Events** — Clean `net.on()` API, no boilerplate

---

## Installation

Drop `netClient.js` into your project. No npm, no bundler required.

```html
<!-- index.html -->
<script type="module" src="./game.js"></script>
```

```js
// game.js
import NetClient from "./netClient.js";
```

---

## Quick Start

```js
import NetClient from "./netClient.js";

const net = new NetClient("wss://your-server.onrender.com", "myGame");

net.connect();

net.on("connected", () => {
  net.createRoom([], 4, false);
});

net.on("roomCreated", (roomId) => {
  console.log("Room ready:", roomId); // Share this with others
});

net.on("relay", (fromId, payload) => {
  updatePlayer(fromId, payload);
});
```

---

## Constructor

```js
const net = new NetClient(url, gameName?);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | WebSocket server URL, e.g. `"wss://your-server.onrender.com"` |
| `gameName` | `string` | Optional namespace. Rooms are auto-tagged `game:<gameName>`. Default: `"defaultGame"` |

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `net.playerId` | `number \| null` | Your assigned player ID |
| `net.roomId` | `string \| null` | Current room ID, or null |
| `net.ownerId` | `number \| null` | Player ID of the room host |
| `net.isHost` | `boolean` | True if you are the room host |

---

## API Reference

### Connection

```js
net.connect()      // Open the WebSocket connection
net.disconnect()   // Close the connection
```

### Rooms

```js
net.createRoom(tags?, maxClients?, isPrivate?, metaData?)
net.joinRoom(roomId)
net.leaveRoom()
net.listRooms(tags?)
```

**`createRoom` parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tags` | `string[]` | `[]` | Extra tags. `game:<gameName>` is always added. |
| `maxClients` | `number` | `8` | Max players including the host |
| `isPrivate` | `boolean` | `false` | Hides room from `listRooms()` |
| `metaData` | `object` | `{}` | Arbitrary JSON, e.g. `{ name: "My Lobby" }` |

### Messaging

```js
net.sendRelay(payload)              // Broadcast to all players in room
net.tellOwner(payload)              // Send privately to the host
net.tellPlayer(playerId, payload)   // Send privately to one player
net.sendBinary(buffer)              // Send a raw ArrayBuffer
```

### Host Controls

> Only take effect when `net.isHost === true`.

```js
net.updateMeta(metaData)    // Merge new key/values into room metadata
net.addTag(tag)             // Add a tag (e.g. "closed" to lock the room)
net.removeTag(tag)          // Remove a tag
```

---

## Events

Register listeners with `net.on(eventName, callback)`.

### Connection Events

| Event | Args | Description |
|-------|------|-------------|
| `connected` | — | WebSocket opened |
| `disconnected` | — | WebSocket closed |
| `assignedId` | `(playerId)` | Server assigned your ID |
| `error` | `(message)` | Server error (room full, not found, etc.) |

### Room Events

| Event | Args | Description |
|-------|------|-------------|
| `roomCreated` | `(roomId, playerId, metaData)` | You created a room |
| `roomJoined` | `(roomId, playerId, ownerId, maxClients, metaData)` | You joined a room |
| `leftRoom` | `(roomId)` | You left the room |
| `playerJoined` | `(playerId)` | Another player joined |
| `playerLeft` | `(playerId)` | Another player left |
| `roomList` | `(rooms)` | Response to `listRooms()` |

### Host Events

| Event | Args | Description |
|-------|------|-------------|
| `makeHost` | `(oldHostId)` | You were promoted to host |
| `reassignedHost` | `(newHostId, oldHostId)` | Host changed (for non-hosts) |
| `roomUpdated` | `(metaData)` | Host updated metadata |
| `roomTagAdded` | `(tag, tags)` | Host added a tag |
| `roomTagRemoved` | `(tag, tags)` | Host removed a tag |

### Message Events

| Event | Args | Description |
|-------|------|-------------|
| `relay` | `(fromId, payload)` | Another player called `sendRelay()` |
| `tellOwner` | `(fromId, payload)` | A player sent a message to the host |
| `tellPlayer` | `(fromId, payload)` | A player sent a message to you |
| `binary` | `(fromId, buffer)` | Binary payload received |

---

## Server Setup

`server.js` is a Node.js WebSocket server using the `ws` package.

```bash
npm install ws
node server.js
# WebSocket server listening on port 8080
```

**Deploy to Render (free):**
1. Push `server.js` + `package.json` to a GitHub repo
2. Create a new Web Service on [Render](https://render.com)
3. Set start command: `node server.js`
4. Your URL: `wss://your-service.onrender.com`

> **Note:** Render's free tier spins down after 15 min of inactivity. The first connection after idle may take 30–60s.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the server listens on. Set automatically by Render. |

---

## Example: Full Game Loop

```js
import NetClient from "./netClient.js";

const net = new NetClient("wss://your-server.onrender.com", "shooter");
const players = {};
let myId = null;

net.connect();
net.on("assignedId", (id) => (myId = id));

// Create or join
net.on("roomCreated", (roomId) => showLobby(roomId));
net.on("roomJoined",  (roomId) => showLobby(roomId));

// Lock room when game starts (host only)
function startGame() {
  if (!net.isHost) return;
  net.addTag("closed");
  net.sendRelay({ type: "start" });
}

// Handle incoming messages
net.on("relay", (fromId, data) => {
  if (data.type === "start") { initGame(); return; }
  if (!players[fromId]) players[fromId] = {};
  Object.assign(players[fromId], data);
});

// Host handles authoritative actions
net.on("tellOwner", (fromId, data) => {
  if (!net.isHost) return;
  if (data.action === "shoot") {
    net.sendRelay({ type: "hit", targetId: data.targetId, by: fromId });
  }
});

// Cleanup
net.on("playerLeft", (id) => { delete players[id]; });
window.addEventListener("beforeunload", () => net.disconnect());
```

---

## License

MIT © yzzy online