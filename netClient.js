// ============================================================================
// NetClient.js v 1.2.0
// Lightweight WebSocket networking client for browser games
// ============================================================================

export default class NetClient {
    constructor(url, gameName = "defaultGame") {
        this.url = url;
        this.gameName = gameName;
        this.ws = null;

        // connection / room state
        this.playerId = null;
        this.roomId = null;
        this.ownerId = null;
        this.isHost = false;

        // event listeners: eventName → callbacks[]
        this.listeners = {};
    }

    // ------------------------------------------------------------------------
    // Event API
    // ------------------------------------------------------------------------

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, ...args) {
        this.listeners[event]?.forEach(cb => cb(...args));
    }

    // ------------------------------------------------------------------------
    // Connection API
    // ------------------------------------------------------------------------

    connect() {
        // Fix: guard against calling connect() while already connected
        if (this.ws) return;

        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => this.emit("connected");

        this.ws.onclose = () => {
            this.playerId = null;
            this.roomId = null;
            this.ownerId = null;
            this.isHost = false;
            // Fix: null ws here so state is fully reset before emitting
            this.ws = null;
            this.emit("disconnected");
        };

        this.ws.onerror = () => console.warn("WebSocket error");
        this.ws.onmessage = evt => this._handleMessage(evt);
    }

    disconnect() {
        // ws will be nulled in the onclose handler
        this.ws?.close();
    }

    // ------------------------------------------------------------------------
    // Room API
    // ------------------------------------------------------------------------

    createRoom(tags = [], maxClients = 8, isPrivate = false, metaData = {}) {
        this._send({
            type: "createRoom",
            tags: [
                ...tags,
                `game:${this.gameName}`,
                ...(isPrivate ? ["private"] : [])
            ],
            maxClients,
            metaData
        });
    }

    joinRoom(roomId) {
        this._send({ type: "joinRoom", roomId });
    }

    leaveRoom() {
        this._send({ type: "leaveRoom" });
    }

    listRooms(tags = []) {
        this._send({
            type: "listRooms",
            tags: [...tags, `game:${this.gameName}`]
        });
    }

    // ------------------------------------------------------------------------
    // Host-only Room Settings API
    // ------------------------------------------------------------------------

    updateMeta(metaData) {
        this._send({
            type: "updateMeta",
            metaData
        });
    }

    setMeta(metaData) {
        this._send({
            type: "setMeta",
            metaData
        });
    }

    addTag(tag) {
        this._send({
            type: "setRoomTag",
            tag
        });
    }

    removeTag(tag) {
        this._send({
            type: "clearRoomTag",
            tag
        });
    }

    // ------------------------------------------------------------------------
    // Messaging API
    // ------------------------------------------------------------------------

    sendRelay(payload) {
        this._send({ type: "relay", payload });
    }

    tellOwner(payload) {
        this._send({ type: "tellOwner", payload });
    }

    tellPlayer(playerId, payload) {
        this._send({ type: "tellPlayer", playerId, payload });
    }

    sendBinary(buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(buffer);
    }

    // ------------------------------------------------------------------------
    // Internal message handling
    // ------------------------------------------------------------------------

    _handleMessage(evt) {
        // ---------------- Binary ----------------
        if (evt.data instanceof ArrayBuffer) {
            const dv = new DataView(evt.data);
            const fromId = dv.getUint32(0);
            const payload = evt.data.slice(4);
            this.emit("binary", fromId, payload);
            return;
        }

        // ---------------- JSON ----------------
        let data;
        try {
            data = JSON.parse(evt.data);
        } catch {
            return;
        }

        switch (data.type) {

            case "assignId":
                this.playerId = data.playerId;
                this.emit("assignedId", data.playerId);
                break;

            case "roomCreated":
                this.roomId = data.roomId;
                this.ownerId = data.playerId;
                this.isHost = true;
                this.emit("roomCreated", data.roomId, data.metaData);
                break;

            case "roomJoined":
                this.roomId = data.roomId;
                this.ownerId = data.ownerId;
                this.isHost = false;
                this.emit(
                    "roomJoined",
                    data.roomId,
                    data.ownerId,
                    data.maxClients,
                    data.metaData
                );
                break;

            case "playerJoined":
                this.emit("playerJoined", data.playerId);
                break;

            case "leftRoom":
                this.roomId = null;
                this.ownerId = null;
                this.isHost = false;
                this.emit("leftRoom", data.roomId);
                break;

            case "makeHost":
                this.isHost = true;
                this.ownerId = this.playerId;
                this.emit("makeHost", data.oldHostId);
                break;

            case "reassignedHost":
                this.ownerId = data.newHostId;
                this.isHost = this.playerId === data.newHostId;
                this.emit("reassignedHost", data.newHostId, data.oldHostId);
                break;

            case "playerLeft":
                this.emit("playerLeft", data.playerId);
                break;

            case "relay":
                this.emit("relay", data.from, data.payload);
                break;

            case "tellOwner":
                this.emit("tellOwner", data.from, data.payload);
                break;

            case "tellPlayer":
                this.emit("tellPlayer", data.from, data.payload);
                break;

            case "roomList":
                this.emit("roomList", data.rooms);
                break;

            case "roomUpdated":
                this.emit("roomUpdated", data.metaData);
                break;

            case "roomTagAdded":
                this.emit("roomTagAdded", data.tag, data.tags);
                break;

            case "roomTagRemoved":
                this.emit("roomTagRemoved", data.tag, data.tags);
                break;

            case "error":
                this.emit("error", data.message);
                break;
        }
    }

    _send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(obj));
    }
}