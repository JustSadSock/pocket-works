// PocketNet is for internet rooms. PocketLAN remains the offline local transport.
export class PocketNet {
  constructor({ serverUrl, name, token, storage = globalThis.localStorage } = {}) {
    if (!serverUrl || !/^https?:\/\//.test(serverUrl)) throw new TypeError('PocketNet requires an HTTP(S) server URL');
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.name = name;
    this.storage = storage;
    this.storageKey = `pocket-net:${this.serverUrl}`;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(this.storageKey) || 'null'); } catch { /* Storage may be unavailable. */ }
    this.token = token || saved?.token || null;
    this.listeners = new Map();
    this.socket = null;
    this.roomId = saved?.roomId || null;
    this.closed = false;
    this.retry = 0;
  }
  on(type, listener) {
    const group = this.listeners.get(type) || new Set();
    group.add(listener);
    this.listeners.set(type, group);
    return () => group.delete(listener);
  }
  emit(type, value) { for (const listener of this.listeners.get(type) || []) listener(value); }
  persist() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify({ token: this.token, roomId: this.roomId })); } catch { /* Private mode may disable storage. */ }
  }
  async connect() {
    if (this.closed) throw new Error('PocketNet is closed');
    if (!this.token) {
      const response = await fetch(`${this.serverUrl}/session`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.name })
      });
      if (!response.ok) throw new Error(`PocketNet session failed: ${response.status}`);
      this.token = (await response.json()).token;
      this.persist();
    }
    const url = this.serverUrl.replace(/^http/, 'ws') + '/ws';
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      let authenticated = false;
      socket.onopen = () => socket.send(JSON.stringify({ wireVersion: 1, type: 'auth', token: this.token }));
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'authenticated') {
          authenticated = true;
          this.retry = 0;
          if (this.roomId) this.send('join_room', { roomId: this.roomId });
          this.emit('connected', message);
          resolve(this);
        } else if (message.type === 'room_joined') {
          this.roomId = message.roomId;
          this.persist();
          this.emit('room_joined', message);
        } else {
          if (message.type === 'room_closed') { this.roomId = null; this.persist(); }
          if (message.type === 'error' && message.code === 'room_not_found') { this.roomId = null; this.persist(); }
          this.emit(message.type, message);
        }
      };
      socket.onerror = () => { if (!authenticated) reject(new Error('PocketNet connection failed')); };
      socket.onclose = () => {
        if (!authenticated) reject(new Error('PocketNet connection closed'));
        if (this.socket !== socket) return;
        this.emit('disconnected', {});
        if (!this.closed) setTimeout(() => this.connect().catch(error => this.emit('error', error)), Math.min(1000 * 2 ** this.retry++, 15000));
      };
    });
  }
  send(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('PocketNet is disconnected');
    this.socket.send(JSON.stringify({ wireVersion: 1, type, ...payload }));
  }
  createRoom(gameId, payload) { this.send('create_room', { gameId, payload }); }
  joinRoom(roomId) { this.send('join_room', { roomId }); }
  sendGame(payload) { this.send('game_message', { payload }); }
  leaveRoom() { this.send('leave_room'); this.roomId = null; this.persist(); }
  close() { this.closed = true; this.socket?.close(); }
}
