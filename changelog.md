# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v1.2.0] - 2026-03-02

### Added

- **`net.setMeta(metaData)`** — host-only method that fully replaces the room's metadata object. Unlike `updateMeta()` which merges, `setMeta()` discards all existing keys and sets only the provided ones. Fires `roomUpdated` on all players with the new metadata object
- **`setMeta` server handler** — new `case "setMeta"` in `server.js` performs a full replace (`room.metaData = { ...data.metaData }`) and broadcasts `roomUpdated` to all room members

### Changed

- **`roomCreated` callback** — `playerId` argument removed. It was always identical to `net.playerId` which is already set by the time this fires. New signature: `(roomId, metaData)`
- **`roomJoined` callback** — `playerId` argument removed for the same reason. New signature: `(roomId, ownerId, maxClients, metaData)`

### Fixed

- **`tellOwner` self-delivery** — the host calling `tellOwner()` no longer receives their own message. The server now silently ignores the call if the sender is the room owner
- **Player ID collision** — player IDs are now guaranteed unique across all connected clients. The server retries generation if a collision is detected
- **Double `connect()` call** — calling `net.connect()` while already connected is now a no-op. Previously a second WebSocket would be created and the first orphaned (`netClient.js`)
- **`ws` null timing** — `this.ws` is now set to `null` inside the `onclose` handler rather than in `disconnect()`, ensuring state is fully reset before the `"disconnected"` event fires (`netClient.js`)

---

## [v1.1.0] - 2026-03-02

### Added

- **Wake HTTP endpoint** — `GET /wake` returns `{ status, timestamp }` so external uptime monitors (UptimeRobot, BetterUptime, etc.) can ping the server and prevent cold starts on free hosting platforms like Render
- **Wake via WebSocket** — clients can also send `{ type: "wake" }` over an open socket and receive `{ type: "awake", timestamp, playerId }` without needing to be in a room
- **Origin whitelist** — `ORIGIN_WHITELIST` array in `server.js` restricts which origins can connect via HTTP and WebSocket. Empty array or `null` allows all origins
- **CORS headers** — HTTP responses now include proper `Access-Control-Allow-Origin` headers for browser clients on different ports or domains
- **Shared HTTP + WebSocket server** — both run on a single port, required to support the wake endpoint alongside the WebSocket server

---

## [v1.0.0] - Initial Release

### Added

- WebSocket game server with room creation and joining
- Binary relay with sender ID prefixing
- JSON relay, `tellOwner`, `tellPlayer` messaging
- Room tags (`addTag`, `removeTag`) with `game:*` namespace protection
- Room metadata (`updateMeta`)
- Host reassignment on disconnect
- Heartbeat / ping-pong with auto-termination