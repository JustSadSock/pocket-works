// Verified PocketNet lobbies can invite friends using one shared Pocket Social UI.
let inviteShortcut=null;
const removeInviteShortcut=client=>{
  if(inviteShortcut?.client===client){inviteShortcut.node.remove();inviteShortcut=null;}
};
async function showInviteShortcut(client,room){
  if(!client.accountId||room.state?.phase!=='lobby'||!room.roomId||!room.gameId)return;
  if(['zamazka','blind-pals'].includes(room.gameId))return; // Existing game buttons.
  try{
    if(!window.PocketSocial){
      for(const file of ['identity.css','../pocket-id.css','../pocket-social.css']){
        const href=new URL(file,import.meta.url).href;
        if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){
          const link=document.createElement('link');link.rel='stylesheet';link.href=href;
          link.dataset.pocketSocialAuto='';document.head.append(link);
        }
      }
      await import('../pocket-social.js');
    }
    if(client.closed||client.roomId!==room.roomId||!window.PocketSocial)return;
    if(document.querySelector('[data-social-invite]'))return;
    removeInviteShortcut(client);
    const button=document.createElement('button');button.type='button';
    button.className='pw-net-social-invite';button.textContent='Позвать друзей';
    button.setAttribute('aria-label','Пригласить друзей Pocket ID в игровую комнату');
    Object.assign(button.style,{
      position:'fixed',zIndex:'1550',right:'max(14px, env(safe-area-inset-right))',
      bottom:'max(72px, calc(env(safe-area-inset-bottom) + 64px))',
      padding:'10px 14px',borderRadius:'10px',border:'1px solid #79664f',
      color:'#312920',background:'#f0dfbf',font:'650 12px/1.2 system-ui',
      boxShadow:'0 3px 12px #0003',cursor:'pointer'
    });
    button.addEventListener('click',()=>window.PocketSocial.open(client.roomId,room.gameId));
    document.body.append(button);inviteShortcut={node:button,client};
  }catch(error){console.warn('pocket_social_shortcut_unavailable',String(error))}
}
// PocketNet is for internet rooms. PocketLAN remains the offline local transport.
export class PocketNet {
  constructor({ serverUrl, name, token, identityKey = 'guest', storage = globalThis.localStorage } = {}) {
    if (!serverUrl || !/^https?:\/\//.test(serverUrl)) throw new TypeError('PocketNet requires an HTTP(S) server URL');
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.name = name;
    this.storage = storage;
    this.storageKey = `pocket-net:${this.serverUrl}`;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(this.storageKey) || 'null'); } catch { /* Storage may be unavailable. */ }
    // Tokens belong to one profile revision; never reuse guest tokens after login
    // or an authenticated token after logout / switching accounts.
    this.identityKey = identityKey;
    this.token = token || (saved?.identityKey === identityKey ? saved?.token : null) || null;
    this.listeners = new Map();
    this.socket = null;
    this.roomId = saved?.identityKey === identityKey ? saved?.roomId || null : null;
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
    try { this.storage?.setItem(this.storageKey, JSON.stringify({ token: this.token, roomId: this.roomId, identityKey: this.identityKey })); } catch { /* Private mode may disable storage. */ }
  }
  async connect() {
    if (this.closed) throw new Error('PocketNet is closed');
    if (!this.token) {
      const response = await fetch(`${this.serverUrl}/session`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: this.name })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error === 'profile_incomplete'
          ? 'Заверши создание профиля Pocket ID перед входом в комнату'
          : `PocketNet session failed: ${response.status}`);
      }
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
          this.accountId = message.player?.accountId||null;
          this.retry = 0;
          if (this.roomId) this.send('join_room', { roomId: this.roomId });
          this.emit('connected', message);
          resolve(this);
        } else if (message.type === 'room_joined') {
          this.roomId = message.roomId;
          this.persist();
          this.emit('room_joined', message);
          void showInviteShortcut(this,message);
        } else {
          if (message.type === 'error' && !authenticated) {
            if (message.code === 'invalid_token') { this.token = null; this.persist(); }
            socket.close();
            reject(new Error(`PocketNet authentication failed: ${message.code || 'unknown'}`));
            return;
          }
          if (message.type === 'room_closed' || message.type === 'room_kicked') {
            this.roomId = null;this.persist();removeInviteShortcut(this);
          }
          if(message.type==='game_event'){
            const phase=message.event?.payload?.phase||message.event?.payload?.state?.phase||
              message.event?.payload?.view?.phase;
            if(phase&&phase!=='lobby')removeInviteShortcut(this);
          }
          if (message.type === 'error' && message.code === 'room_not_found') { this.roomId = null; this.persist(); }
          this.emit(message.type, message);
        }
      };
      socket.onerror = () => { if (!authenticated) reject(new Error('PocketNet connection failed')); };
      socket.onclose = () => {
        if (!authenticated) reject(new Error('PocketNet connection closed'));
        if (this.socket !== socket) return;
        removeInviteShortcut(this);
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
  joinRoom(roomId, options = {}) { this.send('join_room', { roomId, ...(options?.claimCode?{claimCode:options.claimCode}:{}) }); }
  sendGame(payload) { this.send('game_message', { payload }); }
  leaveRoom() { this.send('leave_room'); this.roomId = null; this.persist(); removeInviteShortcut(this); }
  close() { this.closed = true; this.socket?.close(); removeInviteShortcut(this); }
}
