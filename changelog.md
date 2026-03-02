# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v1.1.0] - 2026-03-02

### Added
- **Wake HTTP endpoint** — `GET /wake` returns `{ status, timestamp }` so external uptime monitors (UptimeRobot, BetterUptime, etc.) can ping the server and prevent cold starts on free hosting platforms like Render
- **Wake via WebSocket** — clients can also send `{ type: "wake" }` over an open socket and receive `{ type: "awake", timestamp, playerId }` without needing to be in a room
- **Origin whitelist** — `ORIGIN_WHITELIST` array in `server.js` restricts which origins can connect via HTTP and WebSocket. Empty array or `null` allows all origins
- **CORS headers** — HTTP responses now include proper `Access-Control-Allow-Origin` headers for browser clients on different ports or domains
- **Shared HTTP + WebSocket server** — both run on a single port, required to support the wake endpoint alongside the WebSocket server


## [v1.0.0] - Initial Release

- WebSocket game server with room creation and joining
- Binary relay with sender ID prefixing
- JSON relay, `tellOwner`, `tellPlayer` messaging
- Room tags (`setRoomTag`, `clearRoomTag`) with `game:*` protection
- Room metadata (`updateMeta`)
- Host reassignment on disconnect
- Heartbeat / ping-pong with auto-termination