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
- 🟢 **Wake Endpoint** — Public `GET /wake` for uptime monitors and cold-start prevention
- 🔒 **Origin Whitelist** — Restrict which domains can connect via HTTP and WebSocket
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

The `gameName` acts as a namespace — `listRooms()` automatically filters to only show rooms for the current `gameName`, so players from different games never see each other's lobbies.

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `net.playerId` | `number \| null` | Your assigned player ID. Set after `assignedId` fires. |
| `net.roomId` | `string \| null` | Current room ID (5-character code), or `null`. |
| `net.ownerId` | `number \| null` | Player ID of the current room host. |
| `net.isHost` | `boolean` | `true` if you are the room host. |

---

## API Reference

### Connection

```js
net.connect()      // Open the WebSocket connection
net.disconnect()   // Close the connection
```

`connect()` is non-blocking — listen for the `connected` event before calling room methods. The server immediately fires `assignedId` after the connection opens.

If you navigate away or close the tab without calling `disconnect()`, the server detects the dropped connection via heartbeat and cleans up your room slot automatically.

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
| `tags` | `string[]` | `[]` | Extra tags. `game:<gameName>` is always added automatically. |
| `maxClients` | `number` | `8` | Max players including the host. |
| `isPrivate` | `boolean` | `false` | If `true`, adds the `"private"` tag and hides the room from `listRooms()`. |
| `metaData` | `object` | `{}` | Arbitrary JSON attached to the room, e.g. `{ name: "My Lobby" }`. |

Room IDs are 5-character alphanumeric codes (e.g. `"AB3XY"`). Share the `roomId` from `roomCreated` with other players so they can call `joinRoom()`.

`listRooms()` returns only public, non-closed rooms tagged with the current `gameName`. Pass additional tags to narrow results further:

```js
net.listRooms(["ranked"]);

net.on("roomList", (rooms) => {
  // each room has: roomId, ownerId, playerCount, maxClients, tags, metaData
  rooms.forEach(r => console.log(r.roomId, r.playerCount, r.metaData));
});
```

### Messaging

```js
net.sendRelay(payload)              // Broadcast to all players in room
net.tellOwner(payload)              // Send privately to the host
net.tellPlayer(playerId, payload)   // Send privately to one player
net.sendBinary(buffer)              // Send a raw ArrayBuffer
```

**Binary messages** are forwarded to all other room members. The server prepends the sender's player ID as a 4-byte big-endian unsigned integer before forwarding. The `binary` event on recipients exposes the stripped `fromId` and the original buffer:

```js
// Sender
const buf = new ArrayBuffer(8);
const dv  = new DataView(buf);
dv.setFloat32(0, player.x);
dv.setFloat32(4, player.y);
net.sendBinary(buf);

// Receiver
net.on("binary", (fromId, buffer) => {
  const dv = new DataView(buffer);
  const x  = dv.getFloat32(0);
  const y  = dv.getFloat32(4);
});
```

Use `sendBinary` for high-frequency data like position updates. Use `sendRelay` for lower-frequency events where JSON readability matters.

### Host Controls

> Only take effect when `net.isHost === true`. The server silently ignores these calls from non-hosts.

```js
net.updateMeta(metaData)    // Merge new key/values into room metadata
net.addTag(tag)             // Add a tag (e.g. "closed" to lock the room)
net.removeTag(tag)          // Remove a tag
```

`addTag("closed")` prevents new players from joining. It does not disconnect existing players. Use it when a match starts. `game:*` tags cannot be removed.

---

## Events

Register listeners with `net.on(eventName, callback)`. Multiple listeners per event are supported.

### Connection Events

| Event | Args | Description |
|-------|------|-------------|
| `connected` | — | WebSocket opened. |
| `disconnected` | — | WebSocket closed or lost. All state (`playerId`, `roomId`, etc.) is reset. |
| `assignedId` | `(playerId: number)` | Server assigned you a unique numeric ID. |
| `error` | `(message: string)` | Server error, e.g. `"Room full"`, `"Room does not exist"`, `"Room Closed"`. |

### Room Events

| Event | Args | Description |
|-------|------|-------------|
| `roomCreated` | `(roomId, playerId, metaData)` | You successfully created a room. You are the host. |
| `roomJoined` | `(roomId, playerId, ownerId, maxClients, metaData)` | You successfully joined a room. |
| `leftRoom` | `(roomId)` | You left the room via `leaveRoom()`. |
| `playerJoined` | `(playerId)` | Another player joined your room. |
| `playerLeft` | `(playerId)` | Another player left or disconnected from the room. |
| `roomList` | `(rooms)` | Response to `listRooms()`. Each room: `roomId`, `ownerId`, `playerCount`, `maxClients`, `tags`, `metaData`. |

### Host Events

| Event | Args | Description |
|-------|------|-------------|
| `makeHost` | `(oldHostId)` | You were promoted to host. `net.isHost` is already `true` when this fires. |
| `reassignedHost` | `(newHostId, oldHostId)` | Host changed (fires on all non-host players). |
| `roomUpdated` | `(metaData)` | Host updated metadata via `updateMeta()`. Fires on all players. |
| `roomTagAdded` | `(tag, tags)` | Host added a tag. `tags` is the full updated array. |
| `roomTagRemoved` | `(tag, tags)` | Host removed a tag. `tags` is the full updated array. |

### Message Events

| Event | Args | Description |
|-------|------|-------------|
| `relay` | `(fromId, payload)` | Another player called `sendRelay()`. |
| `tellOwner` | `(fromId, payload)` | A player sent a message to the host. Only fires on the host. |
| `tellPlayer` | `(fromId, payload)` | A player called `tellPlayer()` targeting you. |
| `binary` | `(fromId, buffer: ArrayBuffer)` | Binary payload received. The sender ID has been stripped from the buffer. |

---

## Server Setup

`server.js` is a Node.js WebSocket server using the `ws` package. HTTP and WebSocket share a single port. Fork the repo on GitHub to get your own copy to deploy and modify, then:

```bash
npm install ws
node server.js
# Server listening on port 8080
# Wake endpoint: http://localhost:8080/wake
```

**Deploy to Render (free):**
1. Fork the repo on GitHub
2. Create a new Web Service on [Render](https://render.com) pointing at your fork
3. Set start command: `node server.js`
4. Your URL: `wss://your-service.onrender.com`

> **Cold starts:** Render's free tier spins down after 15 min of inactivity. Point an uptime monitor (e.g. UptimeRobot) at `GET /wake` every 5 minutes to keep the server alive — or expect the first connection after idle to take 30–60s.

### Wake Endpoint

`GET /wake` is always public regardless of the origin whitelist. Use it to warm up the server before opening a WebSocket connection, or as a health check.

```js
await fetch("https://your-server.onrender.com/wake");
// → { "status": "awake", "timestamp": 1234567890123 }
```

Also works over WebSocket — send `{ type: "wake" }`, receive `{ type: "awake", timestamp, playerId }`.

### Origin Whitelist

Edit `ORIGIN_WHITELIST` in `server.js` to restrict which domains can connect. Origins must include the protocol:

```js
const ORIGIN_WHITELIST = [
  "https://yourgame.com",
  "http://localhost:3000",
];
```

Set to `[]` or `null` to allow all origins. `GET /wake` is always public regardless.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the server listens on. Shared by HTTP and WebSocket. Set automatically by Render. |

### Server Behaviour

**Heartbeat / Timeout** — The server pings all connected clients every 30 seconds. Clients that do not respond are terminated and removed from their room. `playerLeft` fires for players who drop without calling `leaveRoom()`.

**Host Reassignment** — When the host disconnects or calls `leaveRoom()`, the server promotes the first remaining client to host. The new host receives `makeHost`; all others receive `reassignedHost`. If no clients remain, the room is deleted.

**Room Capacity** — `maxClients` includes the host. A room with `maxClients: 4` supports 1 host + 3 clients. Joining a full room returns an `error` event with `"Room full"`.

**Binary Protocol** — The server prepends the sender's player ID as a 4-byte big-endian `uint32` to every binary message before forwarding it to all other room members. The `binary` event handler receives the sender ID and the original buffer (without the prepended bytes).

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