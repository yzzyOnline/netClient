# NetClient v1.2.0

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

net.on("roomCreated", (roomId) => {
  console.log("Room ready:", roomId); // Share this with others
});

net.on("relay", (fromId, payload) => {
  updatePlayer(fromId, payload);
});

net.on("error", (msg) => console.warn("NetClient error:", msg));

// Trigger room creation from user action, not automatically on connect
document.getElementById("createBtn").onclick = () => net.createRoom([], 4, false);
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

The `gameName` acts as a namespace — `listRooms()` automatically filters to only show rooms for the current `gameName`, so players from different games never see each other's lobbies. If omitted, all instances default to `"defaultGame"` and will see each other's rooms.

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `net.playerId` | `number \| null` | Your assigned player ID. `null` before `assignedId` fires. |
| `net.roomId` | `string \| null` | Current room ID (5-character alphanumeric code, e.g. `"AB3XY"`), or `null`. |
| `net.ownerId` | `number \| null` | Player ID of the current room host, or `null`. |
| `net.isHost` | `boolean` | `true` if you are the room host. Updated automatically on host handoff. |

---

## API Reference

### Connection

```js
net.connect()      // Open the WebSocket connection
net.disconnect()   // Close the connection
```

`connect()` is non-blocking — do not call room methods until `connected` or `assignedId` fires. Calling `connect()` while already connected is a no-op. The server immediately sends `assignedId` after the socket opens.

If you navigate away or close the tab without calling `disconnect()`, the server detects the dropped connection via its 30-second heartbeat and cleans up your room slot automatically. `playerLeft` fires for that player on all remaining clients.

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
| `maxClients` | `number` | `8` | Max players including the host. A room with `maxClients: 4` fits 1 host + 3 clients. |
| `isPrivate` | `boolean` | `false` | If `true`, adds the `"private"` tag and hides the room from `listRooms()`. Players can still join directly by room code. |
| `metaData` | `object` | `{}` | Arbitrary JSON attached to the room, e.g. `{ name: "My Lobby", map: "desert" }`. |

Room IDs are 5-character alphanumeric codes (e.g. `"AB3XY"`). `joinRoom()` is case-insensitive. Share the `roomId` from `roomCreated` with other players so they can join.

`listRooms()` returns only public, non-closed rooms tagged with the current `gameName`. Rooms tagged `"private"` or `"closed"` are always excluded. Pass additional tags to narrow results further:

```js
net.listRooms(["ranked"]);

net.on("roomList", (rooms) => {
  // each room has: roomId, ownerId, playerCount, maxClients, tags, metaData
  rooms.forEach(r => console.log(r.roomId, r.playerCount, r.metaData));
});
```

### Messaging

```js
net.sendRelay(payload)              // Broadcast to all other players in the room
net.tellOwner(payload)              // Send privately to the host only
net.tellPlayer(playerId, payload)   // Send privately to one specific player
net.sendBinary(buffer)              // Send a raw ArrayBuffer to all other players
```

`sendRelay` and `sendBinary` both go to every other room member — the sender never receives their own message. `tellOwner` has no effect if called by the host.

**Binary messages** — the server prepends the sender's player ID as a 4-byte big-endian `uint32` before forwarding. The `binary` event on recipients exposes the parsed `fromId` and the original buffer with those bytes already stripped:

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
net.updateMeta(metaData)    // Merge new key/values into room metadata (existing keys preserved)
net.setMeta(metaData)       // Replace all room metadata with the provided object
net.addTag(tag)             // Add a tag to the room
net.removeTag(tag)          // Remove a tag from the room
```

**`updateMeta` vs `setMeta`:**

- `updateMeta({ map: "forest" })` merges — `{ name: "My Lobby", map: "desert" }` becomes `{ name: "My Lobby", map: "forest" }`
- `setMeta({ map: "forest" })` replaces — result is just `{ map: "forest" }`, all previous keys are gone

Both fire `roomUpdated` on all players with the full resulting metadata object. If your `roomUpdated` handler merges into a local copy with `Object.assign`, be careful with `setMeta` — replace the local copy entirely rather than merging into it.

`addTag("closed")` prevents new players from joining via `joinRoom()`. It does not disconnect existing players. Use it when a match starts. `removeTag("closed")` re-opens the room. `game:*` tags cannot be added or removed this way.

---

## Events

Register listeners with `net.on(eventName, callback)`. Multiple listeners per event are supported and all will fire. There is no `off()` method — listeners persist for the lifetime of the instance.

### Connection Events

| Event | Args | Description |
|-------|------|-------------|
| `connected` | — | WebSocket opened successfully. |
| `disconnected` | — | WebSocket closed or lost. All state (`playerId`, `roomId`, `ownerId`, `isHost`) is fully reset before this fires. |
| `assignedId` | `(playerId: number)` | Server assigned you a unique numeric ID. Fires immediately after `connected`. |
| `error` | `(message: string)` | Server sent an error. Possible values: `"Already in a room"`, `"Room does not exist"`, `"Room full"`, `"Room Closed"`. |

### Room Events

| Event | Args | Description |
|-------|------|-------------|
| `roomCreated` | `(roomId, metaData)` | You successfully created a room. `net.isHost` is already `true` when this fires. Your player ID is available as `net.playerId`. |
| `roomJoined` | `(roomId, ownerId, maxClients, metaData)` | You successfully joined a room. Your player ID is available as `net.playerId`. |
| `leftRoom` | `(roomId)` | You left via `leaveRoom()`. `net.roomId` is `null` after this fires. |
| `playerJoined` | `(playerId)` | Another player joined your room. |
| `playerLeft` | `(playerId)` | Another player left or disconnected. Clean up their state here. |
| `roomList` | `(rooms)` | Response to `listRooms()`. Each room: `roomId`, `ownerId`, `playerCount`, `maxClients`, `tags`, `metaData`. |

### Host Events

| Event | Args | Description |
|-------|------|-------------|
| `makeHost` | `(oldHostId)` | You were promoted to host. `net.isHost` is already `true` when this fires. |
| `reassignedHost` | `(newHostId, oldHostId)` | Host changed. Fires on all non-host players. `net.ownerId` is already updated. |
| `roomUpdated` | `(metaData)` | Host called `updateMeta()` or `setMeta()`. Fires on all players. `metaData` is the full resulting object. |
| `roomTagAdded` | `(tag, tags)` | Host added a tag. `tags` is the full updated array. |
| `roomTagRemoved` | `(tag, tags)` | Host removed a tag. `tags` is the full updated array. |

### Message Events

| Event | Args | Description |
|-------|------|-------------|
| `relay` | `(fromId, payload)` | Another player called `sendRelay()`. |
| `tellOwner` | `(fromId, payload)` | A player called `tellOwner()`. Only fires on the host's client. |
| `tellPlayer` | `(fromId, payload)` | A player called `tellPlayer()` targeting you specifically. |
| `binary` | `(fromId, buffer: ArrayBuffer)` | Binary data received. The sender's ID has already been stripped from the buffer. |

---

## Server Setup

`server.js` is a Node.js WebSocket server using the `ws` package. HTTP and WebSocket share a single port.

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
4. Your WebSocket URL: `wss://your-service.onrender.com`

> **Cold starts:** Render's free tier spins down after 15 min of inactivity. Point an uptime monitor (e.g. UptimeRobot) at `GET /wake` every 5 minutes to keep the server alive — or expect the first connection after idle to take 30–60s.

### Wake Endpoint

`GET /wake` is always public regardless of the origin whitelist. Use it to warm up the server before opening a WebSocket connection, or as a health check.

```js
const res  = await fetch("https://your-server.onrender.com/wake");
const data = await res.json();
// → { "status": "awake", "timestamp": 1234567890123 }
```

Also works over an open WebSocket — send `{ type: "wake" }`, receive `{ type: "awake", timestamp, playerId }`.

### Origin Whitelist

Edit `ORIGIN_WHITELIST` in `server.js` to restrict which domains can connect. Origins must include the protocol:

```js
const ORIGIN_WHITELIST = [
  "https://yourgame.com",
  "http://localhost:3000",
];
```

Set to `[]` or `null` to allow all origins (default). Rejected connections receive HTTP 403. `GET /wake` bypasses the whitelist entirely.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Port the server listens on. Shared by HTTP and WebSocket. Set automatically by Render. |

### Server Behaviour

**Heartbeat / Timeout** — The server pings all connected clients every 30 seconds. Clients that do not respond are terminated and removed from their room. `playerLeft` fires for players who drop without calling `leaveRoom()`.

**Host Reassignment** — When the host disconnects or calls `leaveRoom()`, the server promotes the first remaining client to host. The new host receives `makeHost` with the old host's ID; all other clients receive `reassignedHost`. If no clients remain, the room is deleted.

**Room Capacity** — `maxClients` includes the host. A room with `maxClients: 4` supports 1 host + 3 clients. Joining a full room returns an `error` event with `"Room full"`.

**Closed Rooms** — Adding the `"closed"` tag blocks new joins — `joinRoom()` returns an `error` event with `"Room Closed"`. Existing players are unaffected. Remove the tag with `net.removeTag("closed")` to re-open.

**Binary Protocol** — The server prepends the sender's player ID as a 4-byte big-endian `uint32` to every binary message before forwarding it to all other room members. The `binary` event handler receives the parsed sender ID and the original buffer without the prepended bytes.

---

## Example: Full Game Loop

```js
import NetClient from "./netClient.js";

const net = new NetClient("wss://your-server.onrender.com", "shooter");
const players = {};
let myId = null;

net.connect();
net.on("assignedId", (id) => (myId = id));

// Show lobby on create or join
net.on("roomCreated", (roomId) => showLobby(roomId));
net.on("roomJoined",  (roomId) => showLobby(roomId));

// Host locks and starts the match
function startGame() {
  if (!net.isHost) return;
  net.addTag("closed");
  net.sendRelay({ type: "start" });
  initGame();
}

// Handle incoming state and events
net.on("relay", (fromId, data) => {
  if (data.type === "start") { initGame(); return; }
  if (data.type === "hit")   { applyHit(data.targetId, data.by); return; }
  if (!players[fromId]) players[fromId] = {};
  Object.assign(players[fromId], data);
});

// Host validates and broadcasts authoritative events
net.on("tellOwner", (fromId, data) => {
  if (!net.isHost) return;
  if (data.action === "shoot") {
    net.sendRelay({ type: "hit", targetId: data.targetId, by: fromId });
  }
});

// Handle host promotion mid-game
net.on("makeHost", () => {
  console.log("You are now the host");
});

// Clean up disconnected players
net.on("playerLeft", (id) => { delete players[id]; });

// Always clean up on page unload
window.addEventListener("beforeunload", () => net.disconnect());
```

**Pattern: Host as authority** — use `tellOwner()` for actions that need validation (shooting, scoring, state changes). Use `sendRelay()` for frequent position/animation data that doesn't need checking. This keeps gameplay fair without a dedicated authoritative server.

---

## Known Limitations

**No existing players on join** — `roomJoined` gives you the `ownerId` and room metadata, but no list of other players already in the room. The recommended workaround is to send your state immediately on join and respond to `playerJoined` so others do the same:

```js
net.on("roomJoined", () => {
  net.sendRelay({ type: "hello", x: player.x, y: player.y });
});

net.on("playerJoined", () => {
  net.sendRelay({ type: "hello", x: player.x, y: player.y }); // Announce to newcomer
});

net.on("relay", (fromId, data) => {
  if (data.type === "hello") {
    players[fromId] = { x: data.x, y: data.y };
  }
});
```

This works well in practice but requires all existing players to be connected and listening. A future version may include a `players` array in the `roomJoined` payload.

**No reconnection** — if a player's connection drops, they receive a new `playerId` on reconnect and cannot reclaim their previous slot. Design your game state around players leaving and rejoining as new players.

**No `listRooms` timeout** — `listRooms()` fires the `roomList` event when the server responds, but there is no built-in timeout if the response is slow or lost. If you need one, implement it in userland:

```js
const timeout = setTimeout(() => console.warn("listRooms timed out"), 5000);
net.on("roomList", (rooms) => {
  clearTimeout(timeout);
  // handle rooms
});
net.listRooms();
```

**No `off()` method** — listeners registered with `net.on()` persist for the lifetime of the instance. If you need to stop handling an event, use a flag variable to gate the callback.

**In-memory only** — all room and player state lives in the server process. A server restart wipes everything. Do not build persistence assumptions on top of room state.

**`_send()` is silent when disconnected** — calling any messaging or room method before `connected` fires, or after a disconnect, silently does nothing. In development, check the browser console for any WebSocket errors if messages seem to be disappearing.

---

## License

MIT © yzzy online