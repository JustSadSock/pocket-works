import { PocketNet } from '../../shared/capabilities/net.js';
import game, { createPractice } from './simulation.js';

const KEY = 'pocket-works:trace-mosaic:';
const PRACTICE_KEY = KEY + 'practice';
const SESSION = {
  getItem: key => { try { return sessionStorage.getItem(KEY + key); } catch { return null; } },
  setItem: (key, value) => { try { sessionStorage.setItem(KEY + key, value); } catch {} },
  removeItem: key => { try { sessionStorage.removeItem(KEY + key); } catch {} },
};
const invitationCode = () => {
  const raw = new URLSearchParams(location.search).get('room') || '';
  return /^[a-f0-9]{8}$/i.test(raw) || /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(raw) ? raw : '';
};
const prefix = id => String(id || '').slice(0, 8).toUpperCase();

export class PocketSocket extends EventTarget {
  static OPEN = 1;
  constructor() {
    super();
    this.readyState = 0;
    this.local = false;
    this.code = null;
    this.id = null;
    this.pendingInvite = invitationCode();
    this.net = new PocketNet({
      serverUrl: location.origin + '/pocketnet',
      name: localStorage.getItem(KEY + 'nickname') || 'Мозаичист',
      storage: SESSION,
    });
    // An invite is an explicit room choice. Do not let an unrelated remembered
    // room silently take precedence (or try two overlapping join requests).
    if (this.pendingInvite && prefix(this.net.roomId) !== prefix(this.pendingInvite)) {
      this.net.roomId = null;
      this.net.persist();
    }
    this.net.on('connected', packet => {
      if (this.local) return;
      this.id = packet.player.id;
      this.readyState = 1;
      this.message('boot', { playerId: this.id });
      this.message('connection_status', { status: this.net.roomId ? 'syncing' : 'connected' });
      if (this.pendingInvite && !this.net.roomId) {
        try { this.net.joinRoom(this.pendingInvite); }
        catch (error) { this.report(error); }
      }
    });
    this.net.on('room_joined', packet => {
      if (this.local || packet.gameId !== 'trace-mosaic') {
        if (packet.gameId !== 'trace-mosaic') this.message('room_lost', { reason: 'Этот код относится к другой игре' });
        return;
      }
      this.code = prefix(packet.roomId);
      this.pendingInvite = '';
      this.apply(packet.state);
      this.message('connection_status', { status: 'connected' });
      this.heartbeat();
    });
    this.net.on('game_event', packet => {
      if (this.local || !this.code) return;
      if (packet.event?.type === 'state') this.apply(packet.event.payload);
      else if (packet.event?.type === 'legacy') this.message(packet.event.payload.type, packet.event.payload.payload);
    });
    this.net.on('presence', packet => {
      if (!this.local && this.code && prefix(packet.roomId) === this.code) this.heartbeat();
    });
    this.net.on('disconnected', () => {
      if (this.local) return;
      this.readyState = 0;
      this.message('connection_status', { status: 'reconnecting' });
    });
    this.net.on('error', packet => {
      if (this.local) return;
      const error = packet.code || packet.message || 'Ошибка соединения';
      if (packet.code === 'room_not_found' || packet.code === 'not_in_room' ||
          packet.code === 'room_version_unavailable') {
        this.code = null;
        this.pendingInvite = '';
        this.message('room_lost', { reason: 'Комната недоступна: ' + error });
      } else this.message('toast', { tone: 'error', message: String(error) });
    });
    for (const type of ['room_closed', 'room_kicked']) {
      this.net.on(type, () => {
        if (this.local) return;
        this.code = null;
        this.pendingInvite = '';
        this.message('room_lost', { reason: type === 'room_closed' ? 'Комната закрыта' : 'Вы исключены из комнаты' });
      });
    }
    this.net.connect()
      .then(() => this.dispatchEvent(new Event('open')))
      .catch(error => this.report(error));
    // Server deadlines are authoritative; the visible tab merely supplies
    // periodic authenticated messages. Hidden tabs may be throttled, so a
    // rejoin and the next pulse always settle an expired round immediately.
    this.timer = setInterval(() => this.heartbeat(), 2500);
  }
  report(error) {
    this.message('connection_status', { status: 'reconnecting' });
    this.message('toast', { tone: 'error', message: error?.message || 'Нет связи. Соло-тренировка доступна без сети.' });
  }
  message(type, payload) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, payload }) }));
  }
  apply(view) {
    if (!view || typeof view !== 'object') return;
    this.message('room_state', { ...view, roomId: this.code });
  }
  heartbeat() {
    if (this.local) {
      if (this.code && this.saved?.room?.phase === 'playing') this.send(JSON.stringify({ type: 'pulse' }));
      return;
    }
    if (this.code && this.readyState === 1) this.send(JSON.stringify({ type: 'pulse' }));
  }
  practice(name, fresh = false) {
    if (!this.local) this.net.close();
    this.local = true;
    this.code = 'СОЛО';
    this.readyState = 1;
    this.member = { id: 'local', name };
    let saved = null;
    if (!fresh) {
      try { saved = JSON.parse(localStorage.getItem(PRACTICE_KEY) || 'null'); } catch {}
    }
    if (!saved?.room?.practice || !Array.isArray(saved.room.players) ||
        !saved.room.players.some(p => p.id === 'local')) saved = createPractice(this.member);
    this.saved = saved;
    this.message('boot', { playerId: this.member.id });
    this.message('connection_status', { status: 'connected' });
    this.apply(game.viewForPlayer({ state: this.saved, player: this.member }));
  }
  resetPractice(name) {
    try { localStorage.removeItem(PRACTICE_KEY); } catch {}
    this.practice(name, true);
  }
  send(text) {
    let packet;
    try { packet = JSON.parse(text); } catch { return false; }
    if (this.local) {
      if (!this.code) return false;
      if (packet.type === 'leave_room') { this.code = null; return true; }
      try {
        const result = game.onMessage({ state: this.saved, player: this.member, payload: packet });
        this.saved = result.state;
        for (const item of result.events) {
          if (item.type === 'legacy') this.message(item.payload.type, item.payload.payload);
        }
        this.apply(game.viewForPlayer({ state: this.saved, player: this.member }));
        try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(this.saved)); } catch {}
        return true;
      } catch (error) { this.report(error); return false; }
    }
    if (this.readyState !== 1) return false;
    try {
      if (packet.type === 'create_room') this.net.createRoom('trace-mosaic', packet.payload);
      else if (packet.type === 'join_room') {
        this.pendingInvite = '';
        this.net.joinRoom(String(packet.payload?.roomId || '').trim());
      } else if (packet.type === 'leave_room') {
        this.net.leaveRoom();
        this.code = null;
      } else {
        if (!this.code) return false;
        this.net.sendGame(packet);
      }
      return true;
    } catch (error) {
      this.report(error);
      return false;
    }
  }
  close() {
    clearInterval(this.timer);
    this.net.close();
    this.readyState = 3;
  }
}
