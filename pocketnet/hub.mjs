import { POCKET_MODULES } from './generated-modules.mjs';
import {assessZamazkaAwards} from './zamazka-awards.mjs';
import {assessBlockiesAwards} from './blockies-awards.mjs';
import {playerRoomView} from './private-views.mjs';

// All rooms share one small, hibernatable SQLite-backed coordinator. This matches
// the personal/friends deployment (max 32 rooms / 48 sockets) without paid KV/D1.
// Game code is statically bundled from pinned version snapshots; no eval/remote code.
const WIRE_VERSION = 1;
const MAX_PAYLOAD = 16 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_ZAMAZKA_STATE_EVENT = 5 * 1024 * 1024;
const ZAMAZKA_ART_REF = '__zamazka_sqlite_art__';
const MAX_STATE = 256 * 1024;
const MAX_ROOMS = 32;
const MAX_CONNECTIONS = 48;
const MAX_PLAYERS = 8;
// Versioned game modules enforce these caps in onJoin; mirror them for accurate
// discoverability before a player follows an invitation link.
const GAME_SEATS=Object.freeze({'blind-pals':2,flagpost:2,'fog-of-conquest':2,'last-tile-duel':2,'kromka-duel':2,
  folio:6,lipki:4,natyazhenie:5,komnatka:5,'uzel-party':6,'ne-tem-golosom':6,'fog-of-conquest':2});
const ROOM_TTL = 30 * 60_000;
const SESSION_TTL = 7 * 86400_000;
const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shortCode = /^[0-9a-f]{8}$/i;
const encoder = new TextEncoder();

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const message = (ws, type, payload = {}) => {
  if (ws.readyState === 1) ws.send(JSON.stringify({ wireVersion: WIRE_VERSION, type, ...payload }));
};
const copied = state => structuredClone(state);
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;

export class PocketNetHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
    this.rates = new Map();
    this.messageRates = new WeakMap();
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, id TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL
    )`);
    // Additive migration: existing guest sessions and active rooms must survive.
    const sessionColumns = new Set(ctx.storage.sql.exec('PRAGMA table_info(sessions)').toArray().map(c => c.name));
    if (!sessionColumns.has('account_id')) ctx.storage.sql.exec('ALTER TABLE sessions ADD COLUMN account_id TEXT');
    if (!sessionColumns.has('avatar')) ctx.storage.sql.exec('ALTER TABLE sessions ADD COLUMN avatar TEXT');
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS zamazka_award_stats(room_id TEXT PRIMARY KEY, data TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS blockies_award_stats(room_id TEXT PRIMARY KEY, data TEXT NOT NULL)");
    // Large paintings live outside the 256 KiB room metadata snapshot.
    // SQLite's transactionSync commits artwork and phase atomically.
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS zamazka_art_payloads(room_id TEXT NOT NULL, pkey TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(room_id,pkey))");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS achievement_outbox(key TEXT PRIMARY KEY, account_id TEXT NOT NULL, player_id TEXT NOT NULL, achievement_id TEXT NOT NULL, game_id TEXT NOT NULL, room_id TEXT NOT NULL, match_id TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL)");
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL, version TEXT NOT NULL,
      state TEXT NOT NULL, players TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS chyepukha_checkpoints (
      room_id TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL,
      players TEXT NOT NULL, saved_at INTEGER NOT NULL,
      PRIMARY KEY(room_id, revision)
    )`);
  }

  run(task) {
    const queuedAt=Date.now();
    const outcome=this.queue.then(async()=>{
      const waitMs=Date.now()-queuedAt;
      const started=Date.now();
      try{return await task()}
      finally{
        const executionMs=Date.now()-started;
        // Log only pathological delays; do not expose private packet content.
        if(waitMs>=300||executionMs>=300)
          console.warn(JSON.stringify({event:'pocketnet_slow_operation',waitMs,executionMs}));
      }
    });
    this.queue=outcome.catch(error=>console.error(JSON.stringify({event:'pocketnet_error',message:String(error)})));
    return outcome;
  }

  sql(query, ...params) { return this.ctx.storage.sql.exec(query, ...params); }
  countRooms() { return this.sql('SELECT COUNT(*) AS n FROM rooms').one().n; }
  module(gameId, version) {
    const bundle = POCKET_MODULES[gameId];
    const entry = bundle?.versions?.[version || bundle.current];
    return entry?.default?.protocolVersion === 1 ? entry.default : null;
  }
  sockets(roomId) {
    return this.ctx.getWebSockets().filter(ws => ws.readyState === 1 &&
      (!roomId || ws.deserializeAttachment()?.roomId === roomId));
  }
  connected(id, roomId) {
    return this.sockets(roomId).find(ws => ws.deserializeAttachment()?.id === id);
  }
  projectedState(room,player){
    const mod=this.module(room.gameId,room.version);
    if(!mod)throw Error('room_version_unavailable');
    return playerRoomView(mod,room.state,player,room.players);
  }
  joined(ws,room,player){
    const state=this.projectedState(room,player);
    // Legacy rooms may legitimately join with large artwork snapshots.
    // Only new private-view games opt into the small projected-view cap.
    const mod=this.module(room.gameId,room.version);
    if(typeof mod?.viewForPlayer==='function'&&
       bytes({roomId:room.id,gameId:room.gameId,version:room.version,state,players:room.players})>MAX_EVENT_BYTES)
      throw Error('room_view_too_large');
    message(ws,'room_joined',{roomId:room.id,gameId:room.gameId,version:room.version,
      state,players:room.players});
  }
  emit(room, events) {
    if (!Array.isArray(events) || events.length > 32) throw new Error('invalid_module_events');
    for (const event of events) {
      if (typeof event?.type !== 'string' || event.type.length > 64) continue;
      // Opt-in private-view modules receive state events reconstructed from the
      // authoritative current state for each authenticated, joined recipient.
      // Discard event.payload entirely: accidental full-state broadcasts cannot
      // leak secret material, including during reconnect/sync.
      const mod=this.module(room.gameId,room.version);
      if(event.type==='state'&&typeof mod?.viewForPlayer==='function'){
        const recipients=event.to?this.sockets(room.id).filter(ws=>ws.deserializeAttachment()?.id===event.to):this.sockets(room.id);
        for(const ws of recipients){
          const id=ws.deserializeAttachment()?.id;
          const player=room.players.find(p=>p.id===id);
          if(!player)continue;
          const own={...event,payload:this.projectedState(room,player)};
          const packet={roomId:room.id,event:own};
          if(bytes(packet)>MAX_EVENT_BYTES)throw Error('event_too_large');
          message(ws,'game_event',packet);
        }
        continue;
      }
      const packet = { roomId: room.id, event };
      const size=bytes(packet);
      if (size > MAX_EVENT_BYTES) {
        if(room.gameId!=='zamazka'||event.type!=='state'||!event.to||
           size>MAX_ZAMAZKA_STATE_EVENT)throw new Error('event_too_large');
        const target=this.connected(event.to,room.id);
        if(!target)continue;
        // Transparent per-player stream: other PocketNet games retain their
        // original event format. Split only at Unicode codepoint boundaries.
        const text=JSON.stringify(event),parts=text.match(/[\s\S]{1,12000}/gu)||[];
        if(parts.length>512)throw new Error('event_too_large');
        const stream=crypto.randomUUID();
        parts.forEach((part,index)=>message(target,'game_event',{
          roomId:room.id,event:{type:'state_stream',payload:{stream,index,total:parts.length,part}}
        }));
        continue;
      }
      if (event.to) {
        if (!room.players.some(p => p.id === event.to)) continue;
        const target = this.connected(event.to, room.id);
        if (target) message(target, 'game_event', packet);
      } else this.broadcast(room, 'game_event', packet);
    }
  }
  // A module may request a network-level eviction only after validating the
  // curator and removing the guest from its own lobby state. Transport removes
  // the seat even if the kicked browser ignores the notification.
  async applyKicks(room, events, actorId) {
    if (room.gameId !== 'zamazka' || (!room.state?.paused&&room.state?.phase !== 'lobby') || room.state?.host !== actorId) return;
    let changed = false;
    for (const event of events ?? []) {
      if (event?.type !== 'player_kicked' || typeof event.to !== 'string') continue;
      const targetId = event.to;
      if (targetId === actorId || room.state.participants?.some(p => p.id === targetId) ||
          !room.players.some(p => p.id === targetId)) continue;
      const socket = this.connected(targetId, room.id);
      if (socket) {
        message(socket, 'room_kicked', { roomId: room.id, reason: 'curator' });
        this.setRoom(socket, null);
      }
      room.players = room.players.filter(p => p.id !== targetId);
      changed = true;
    }
    if (changed) {
      this.persist(room);
      this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined });
      await this.refreshZamazkaPresence(room);
    }
  }
  // PocketNet preserves authenticated seats after a socket disconnect. For v21+
  // rooms, freeze the authoritative deadline as soon as the last socket closes.
  // A room stays paused across Durable Object hibernation and server restarts.
  async updateBazaarPresence(room,player,online){
    if(room.gameId!=='black-bazaar')return;
    const mod=this.module(room.gameId,room.version);
    if(typeof mod?.onPresence!=='function')return;
    const result=await mod.onPresence({state:copied(room.state),player,online});
    if(result?.state&&result.events?.length){
      room.state=result.state;this.persist(room);this.emit(room,result.events);
    }
  }
  async refreshZamazkaPresence(room){
    if(room.gameId!=='zamazka'||room.state?.resumable!==true)return;
    const state=room.state;
    if(!state||!Array.isArray(state.participants))return;
    const ids=this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean);
    const active=new Set(ids);
    const nextOnline=state.participants.filter(p=>active.has(p.id)).map(p=>p.id);
    const oldOnline=state.onlineIds||[];
    const onlineChanged=nextOnline.length!==oldOnline.length||nextOnline.some((id,i)=>id!==oldOnline[i]);
    const wasPaused=!!state.paused;
    state.onlineIds=nextOnline;
    const waiting=state.phase!=='lobby'&&state.phase!=='results';
    let resumed=false;
    if(waiting&&!state.paused&&state.onlineIds.length===0){
      state.paused=true;
      state.pauseRemainingMs=state.deadline?Math.max(0,state.deadline-Date.now()):null;
      state.pausedAt=Date.now();
    }else if(state.paused&&state.participants.every(p=>active.has(p.id))){
      state.paused=false;
      if(state.deadline&&Number.isFinite(state.pauseRemainingMs))
        state.deadline=Date.now()+state.pauseRemainingMs;
      state.pauseRemainingMs=null;
      state.pausedAt=0;
      resumed=true;
    }
    if(onlineChanged||wasPaused!==!!state.paused)this.persist(room);
    // Send each participant their private snapshot, preserving hidden art.
    if(resumed){
      const mod=this.module(room.gameId,room.version);
      for(const p of room.players){
        if(!active.has(p.id))continue;
        const result=await mod?.onMessage({state:copied(room.state),player:p,players:room.players,payload:{type:'sync'}});
        if(result?.events)this.emit(room,result.events);
      }
    }
  }
  broadcast(room, type, payload) {
    for (const ws of this.sockets(room.id)) message(ws, type, payload);
  }
  readRoom(id) {
    const row = this.sql('SELECT * FROM rooms WHERE id = ?', id).toArray()[0];
    if(!row)return null;
    let state,roomPlayers;
    try{
      state=JSON.parse(row.state);roomPlayers=JSON.parse(row.players);
      if(row.game_id==='chyepukha'&&row.version==='v5'&&
         (!state||state.schema!==1||!Array.isArray(state.sheets)))throw Error('invalid_chyepukha_state');
    }catch(error){
      if(row.game_id!=='chyepukha'||row.version!=='v5')throw error;
      const backups=this.sql('SELECT state,players FROM chyepukha_checkpoints WHERE room_id=? ORDER BY revision DESC LIMIT 4',id).toArray();
      let recovered=false;
      for(const backup of backups){
        try{
          const candidate=JSON.parse(backup.state),members=JSON.parse(backup.players);
          if(candidate?.schema!==1||!Array.isArray(candidate.sheets)||!Array.isArray(members))continue;
          state=candidate;roomPlayers=members;
          this.sql('UPDATE rooms SET state=?,players=? WHERE id=?',backup.state,backup.players,id);
          recovered=true;break;
        }catch{}
      }
      if(!recovered)throw error;
    }
    if(row.game_id==='zamazka'){
      const payloads=this.sql('SELECT pkey,payload FROM zamazka_art_payloads WHERE room_id=?',id).toArray();
      for(const {pkey,payload} of payloads){
        const [kind,user]=pkey.split(':');
        const art=JSON.parse(payload);
        if(kind==='final'&&state.assignments?.[user]?.strokes===ZAMAZKA_ART_REF)state.assignments[user].strokes=art;
        else if(kind==='draft'&&state.drafts?.[user]===ZAMAZKA_ART_REF)state.drafts[user]=art;
        else if(kind==='assembly'&&state.draftAssemblies?.[user]?.strokes===ZAMAZKA_ART_REF)state.draftAssemblies[user].strokes=art;
      }
      for(const item of Object.values(state.assignments||{}))if(item.strokes===ZAMAZKA_ART_REF)throw Error('room_art_missing');
      for(const item of Object.values(state.drafts||{}))if(item===ZAMAZKA_ART_REF)throw Error('room_art_missing');
      for(const item of Object.values(state.draftAssemblies||{}))if(item.strokes===ZAMAZKA_ART_REF)throw Error('room_art_missing');
    }
    return {id:row.id,gameId:row.game_id,version:row.version,
      state,players:roomPlayers,createdAt:row.created_at,updatedAt:row.updated_at};
  }
  persist(room) {
    const pieces=[];
    let state=room.state;
    if(room.gameId==='zamazka'){
      state={...state,assignments:{...state.assignments},drafts:{...state.drafts},
        draftAssemblies:{...state.draftAssemblies}};
      for(const [id,item] of Object.entries(state.assignments||{})){
        if(!Array.isArray(item?.strokes))continue;
        pieces.push(['final:'+id,JSON.stringify(item.strokes)]);
        state.assignments[id]={...item,strokes:ZAMAZKA_ART_REF};
      }
      for(const [id,art] of Object.entries(state.drafts||{})){
        if(!Array.isArray(art))continue;
        pieces.push(['draft:'+id,JSON.stringify(art)]);
        state.drafts[id]=ZAMAZKA_ART_REF;
      }
      for(const [id,item] of Object.entries(state.draftAssemblies||{})){
        if(!Array.isArray(item?.strokes))continue;
        pieces.push(['assembly:'+id,JSON.stringify(item.strokes)]);
        state.draftAssemblies[id]={...item,strokes:ZAMAZKA_ART_REF};
      }
    }
    const encoded=JSON.stringify(state);
    if(bytes(encoded)>MAX_STATE)throw Error('room_state_too_large');
    const players=JSON.stringify(room.players);
    room.updatedAt=Date.now();
    // One transaction avoids a room pointing to incomplete artwork after power loss.
    this.ctx.storage.transactionSync(()=>{
      if(room.gameId==='zamazka'){
        // PocketNet can receive dozens of incremental strokes per second.
        // Touch only changed vectors; never rewrite eight complete paintings
        // just because a deadline pulse or someone else's brush arrived.
        // Query only small keys, not every large artwork payload. SQLite compares
        // the new vector with the stored one in-place in the same transaction.
        const stale=new Set(this.sql('SELECT pkey FROM zamazka_art_payloads WHERE room_id=?',room.id)
          .toArray().map(row=>row.pkey));
        for(const [pkey,payload] of pieces){
          if(bytes(payload)>MAX_ZAMAZKA_STATE_EVENT)throw Error('artwork_too_large');
          this.sql('INSERT INTO zamazka_art_payloads(room_id,pkey,payload) VALUES(?,?,?) ON CONFLICT(room_id,pkey) DO UPDATE SET payload=excluded.payload WHERE payload <> excluded.payload',
            room.id,pkey,payload);
          stale.delete(pkey);
        }
        for(const pkey of stale)
          this.sql('DELETE FROM zamazka_art_payloads WHERE room_id=? AND pkey=?',room.id,pkey);
      }
      this.sql(`INSERT INTO rooms (id, game_id, version, state, players, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state=excluded.state, players=excluded.players, updated_at=excluded.updated_at`,
        room.id,room.gameId,room.version,encoded,players,room.createdAt,room.updatedAt);
      if(room.gameId==='chyepukha'&&room.version==='v5'&&room.state.phase!=='lobby'){
        this.sql(`INSERT INTO chyepukha_checkpoints (room_id,revision,state,players,saved_at)
          VALUES (?,?,?,?,?) ON CONFLICT(room_id,revision) DO UPDATE SET state=excluded.state,players=excluded.players,saved_at=excluded.saved_at`,
          room.id,Number(room.state.revision)||0,encoded,players,room.updatedAt);
        this.sql(`DELETE FROM chyepukha_checkpoints WHERE room_id=? AND revision NOT IN
          (SELECT revision FROM chyepukha_checkpoints WHERE room_id=? ORDER BY revision DESC LIMIT 4)`,room.id,room.id);
      }
    });
    this.ensureAlarm();
  }
  ensureAlarm() {
    // Pending grants survive room closure and are retried until Pocket Social confirms them.
    const waiting=this.sql('SELECT 1 FROM achievement_outbox LIMIT 1').toArray().length>0;
    if (this.countRooms()||waiting) this.ctx.storage.setAlarm(Date.now() + (waiting?20_000:ROOM_TTL)).catch(e=>console.error('pocketnet_alarm',String(e)));
  }
  recordZamazkaRewards(room, previous, next, events, actor) {
    if(room.gameId!=='zamazka')return;
    const changed=previous?.phase!==next?.phase;
    const board=previous?.phase==='lobby'&&next?.phase==='lobby'&&
      events.some(e=>e?.type==='board_delta'&&e.payload?.u===actor);
    const checkpoint=changed&&(next?.phase==='round-review'||next?.phase==='results'||
      previous?.phase==='results'&&next?.phase==='lobby'||previous?.phase==='lobby'&&next?.phase!=='lobby');
    if(!board&&!checkpoint)return; // Most pulses and drawing/voting packets have no award-side effects.
    const row=this.sql('SELECT data FROM zamazka_award_stats WHERE room_id=?',room.id).toArray()[0];
    let stats=null;try{stats=row?JSON.parse(row.data):null}catch{}
    const {data,awards}=assessZamazkaAwards(previous,next,events,actor,stats,crypto.randomUUID());
    this.sql('INSERT INTO zamazka_award_stats(room_id,data) VALUES(?,?) ON CONFLICT(room_id) DO UPDATE SET data=excluded.data',
      room.id,JSON.stringify(data));
    for(const award of awards){
      const member=room.players.find(p=>p.id===award.playerId&&p.accountId&&uuid.test(p.accountId));
      if(!member)continue; // Guest sessions cannot earn account cosmetics.
      const key=[room.id,award.matchId,member.accountId,award.achievementId].join(':');
      this.sql('INSERT OR IGNORE INTO achievement_outbox(key,account_id,player_id,achievement_id,game_id,room_id,match_id,nickname,avatar) VALUES(?,?,?,?,?,?,?,?,?)',
        key,member.accountId,member.id,award.achievementId,'zamazka',room.id,award.matchId,member.name,member.avatar||'clay');
    }
    this.ensureAlarm();
  }
  recordBlockiesRewards(room,previous,next){
    if(room.gameId!=='blockies'||!next?.started||!next?.engine)return;
    const row=this.sql('SELECT data FROM blockies_award_stats WHERE room_id=?',room.id).toArray()[0];
    let stats=null;try{stats=row?JSON.parse(row.data):null}catch{}
    const result=assessBlockiesAwards(previous,next,stats,()=>crypto.randomUUID());
    if(!result.stats)return;
    if(result.awards.length||result.stats.round!==stats?.round){
      this.sql('INSERT INTO blockies_award_stats(room_id,data) VALUES(?,?) ON CONFLICT(room_id) DO UPDATE SET data=excluded.data',
        room.id,JSON.stringify(result.stats));
    }
    for(const award of result.awards){
      const member=room.players.find(p=>p.id===award.playerId&&p.accountId&&uuid.test(p.accountId));
      if(!member)continue;
      const key=[room.id,award.matchId,member.accountId,award.achievementId].join(':');
      this.sql('INSERT OR IGNORE INTO achievement_outbox(key,account_id,player_id,achievement_id,game_id,room_id,match_id,nickname,avatar) VALUES(?,?,?,?,?,?,?,?,?)',
        key,member.accountId,member.id,award.achievementId,'blockies',room.id,award.matchId,member.name,member.avatar||'clay');
    }
    if(result.awards.length)this.ensureAlarm();
  }
  async flushAwards(){
    if(!this.env?.POCKET_SOCIAL)return;
    const items=this.sql('SELECT * FROM achievement_outbox LIMIT 32').toArray();
    if(!items.length)return;
    const social=this.env.POCKET_SOCIAL.get(this.env.POCKET_SOCIAL.idFromName('pocket-social-global-v1'));
    for(const item of items){
      try{
        const result=await social.fetch(new Request('https://internal.invalid/pocket-social/award',{
          method:'POST',headers:{'content-type':'application/json','x-pw-internal':'1'},
          body:JSON.stringify({accountId:item.account_id,nickname:item.nickname,avatar:item.avatar,achievementId:item.achievement_id,gameId:item.game_id,roomId:item.room_id,matchId:item.match_id})
        }));
        if(!result.ok)break;
        const payload=await result.json();
        this.sql('DELETE FROM achievement_outbox WHERE key=?',item.key);
        if(!payload.already){
          const target=this.connected(item.player_id,item.room_id);
          if(target)message(target,'game_event',{roomId:item.room_id,event:{type:'achievement_awarded',to:item.player_id,payload:{id:item.achievement_id}}});
        }
      }catch(e){console.error('zamazka_reward_delivery',String(e));break}
    }
    this.ensureAlarm();
  }
  attachment(ws, value) { ws.serializeAttachment(value); }
  setRoom(ws, roomId) {
    const previous = ws.deserializeAttachment() || {};
    this.attachment(ws, { ...previous, roomId });
  }
  async closeRoom(room) {
    this.sql('DELETE FROM rooms WHERE id = ?', room.id);
    this.sql('DELETE FROM chyepukha_checkpoints WHERE room_id=?',room.id);
    this.sql('DELETE FROM zamazka_art_payloads WHERE room_id=?',room.id);
    this.sql('DELETE FROM zamazka_award_stats WHERE room_id=?',room.id);
    this.sql('DELETE FROM blockies_award_stats WHERE room_id=?',room.id);
    this.broadcast(room, 'room_closed', { roomId: room.id });
    for (const ws of this.sockets(room.id)) this.setRoom(ws, null);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const endpoint = url.pathname.replace(/^\/pocketnet/, '');
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'origin_denied' }, 403);
    if (endpoint === '/health' && request.method === 'GET') {
      return json({ ok: true, transport: 'cloudflare-durable-objects', modules: Object.keys(POCKET_MODULES), rooms: this.countRooms(),
        games: Object.fromEntries(Object.entries(POCKET_MODULES).map(([id, entry]) =>
          [id, { version: entry.current, minPlayers: entry.versions[entry.current].MIN_PLAYERS ?? null,
            rulesVersion: entry.versions[entry.current].RULESET_VERSION ?? null }])) });
    }
    // Internal-only social activity: confirmed Pocket Social friends are passed from
    // the Social Durable Object, never from the public browser. Only actual active
    // PocketNet sockets count as playing, so stale guest sessions cannot advertise rooms.
    if(endpoint==='/social-rooms'&&request.method==='POST'){
      if(request.headers.get('x-pw-internal')!=='1')return json({error:'not_allowed'},403);
      const payload=await request.json().catch(()=>null);
      if(!Array.isArray(payload?.accountIds)||payload.accountIds.length>240||
         payload.accountIds.some(id=>typeof id!=='string'||!uuid.test(id)))
        return json({error:'invalid_request'},400);
      const ids=new Set(payload.accountIds),rooms={};
      if(!ids.size)return json({rooms});
      const live=this.ctx.getWebSockets().filter(ws=>ws.readyState===1)
        .map(ws=>ws.deserializeAttachment()).filter(v=>v?.accountId&&v.roomId&&ids.has(v.accountId));
      if(!live.length)return json({rooms});
      const wanted=new Set(live.map(v=>v.roomId));
      const candidates=this.sql("SELECT id,game_id,version,players,json_extract(state,'$.phase') AS phase FROM rooms").toArray();
      for(const room of candidates){
        if(!wanted.has(room.id))continue;
        const mod=this.module(room.game_id,room.version);
        if(!mod)continue;
        const players=JSON.parse(room.players);
        const max=Math.min(MAX_PLAYERS,GAME_SEATS[room.game_id]||Number(mod.MAX_PLAYERS)||MAX_PLAYERS);
        const lobby=room.phase==='lobby',count=players.length;
        for(const who of live){
          if(who.roomId!==room.id||!players.some(p=>p.accountId===who.accountId))continue;
          const joinable=lobby&&count<max;
          const candidate={gameId:room.game_id,players:count,maxPlayers:max,joinable,
            ...(joinable?{roomId:room.id}:{})};
          if(!rooms[who.accountId]||joinable)rooms[who.accountId]=candidate;
        }
      }
      return json({rooms});
    }
    // Internal-only room inspection: the public edge strips spoofed x-pw-* headers.
    if ((endpoint === '/validate-invite' || endpoint === '/validate-join') && request.method === 'POST') {
      if (request.headers.get('x-pw-internal') !== '1') return json({error:'not_allowed'},403);
      const data = await request.json().catch(() => null);
      if (!uuid.test(data?.roomId || '') || !GAME_ID.test(data?.gameId || '')) return json({error:'invalid_room'},400);
      const room = this.readRoom(data.roomId);
      const module=room&&this.module(room.gameId,room.version);
      const maxSeats=module?Math.min(MAX_PLAYERS,GAME_SEATS[room.gameId]||
        Number(module.MAX_PLAYERS)||MAX_PLAYERS):0;
      if (!room || room.gameId !== data.gameId || room.state?.phase !== 'lobby' ||
          !module || room.players.length>=maxSeats)
        return json({error:'room_unavailable'},409);
      if (endpoint === '/validate-invite' && !room.players.some(p=>p.accountId && p.accountId===request.headers.get('x-pw-account-id')))
        return json({error:'not_room_member'},403);
      return json({ok:true});
    }
    if (endpoint === '/session' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const prior = this.rates.get(ip);
      const now = Date.now();
      const rate = !prior || now - prior.start > 60_000 ? { start: now, count: 0 } : prior;
      this.rates.set(ip, rate);
      if (++rate.count > 20) return json({ error: 'rate_limited' }, 429);
      if (Number(request.headers.get('content-length') || 0) > 1024) return json({ error: 'request_too_large' }, 413);
      let body;
      try { const raw = await request.text(); if (bytes(raw) > 1024) throw Error(); body = JSON.parse(raw); }
      catch { return json({ error: 'invalid_request' }, 400); }
      if (request.headers.get('x-pw-account-incomplete') === '1') return json({error:'profile_incomplete'},409);
      const accountId = request.headers.get('x-pw-account-id') || null;
      const verifiedName = request.headers.get('x-pw-account-name');
      const avatar = request.headers.get('x-pw-account-avatar');
      const guestName = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!accountId && (!guestName || guestName.length > 32)) return json({ error: 'invalid_name' }, 400);
      if (accountId && (!uuid.test(accountId) || !verifiedName || verifiedName.length > 20)) return json({error:'invalid_identity'},401);
      // All guest names are explicitly marked, even when they match a reserved nickname.
      const name = accountId ? verifiedName : 'Гость · ' + guestName.slice(0, 24);
      const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      this.sql('INSERT INTO sessions (token, id, name, expires, account_id, avatar) VALUES (?, ?, ?, ?, ?, ?)',
        token, crypto.randomUUID(), name, now + SESSION_TTL, accountId, accountId ? avatar : null);
      return json({ token, verified: !!accountId, accountId });
    }
    if (endpoint === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS) return json({ error: 'server_at_capacity' }, 503);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      this.attachment(server, { id: null, name: null, roomId: null,
        edgeAccountId: request.headers.get('x-pw-account-id') || null,
        edgeName: request.headers.get('x-pw-account-name') || null,
        edgeAvatar: request.headers.get('x-pw-account-avatar') || null });
      setTimeout(() => {
        if (server.readyState === 1 && !server.deserializeAttachment()?.id) server.close(1008, 'authentication_required');
      }, 5000);
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'not_found' }, 404);
  }

  async webSocketMessage(ws, raw) {
    return this.run(async () => {
      try {
        if (typeof raw !== 'string' || bytes(raw) > MAX_PAYLOAD) throw new Error('message_too_large');
        let msg;
        try { msg = JSON.parse(raw); } catch { throw new Error('invalid_message'); }
        if (!msg || typeof msg !== 'object' || msg.wireVersion !== WIRE_VERSION || typeof msg.type !== 'string') throw new Error('invalid_message');
        const recent = this.messageRates.get(ws);
        const now = Date.now();
        const rate = !recent || now - recent.start > 1000 ? { start: now, count: 0 } : recent;
        this.messageRates.set(ws, rate);
        if (++rate.count > 30) throw new Error('rate_limited');
        let player = ws.deserializeAttachment() || {};
        if (msg.type === 'auth') {
          if (player.id) throw new Error('already_authenticated');
          if (typeof msg.token !== 'string' || msg.token.length !== 64) throw new Error('invalid_token');
          const found = this.sql('SELECT id, name, account_id, avatar FROM sessions WHERE token = ? AND expires > ?', msg.token, Date.now()).toArray()[0];
          if (!found || (found.account_id || null) !== (player.edgeAccountId || null)) throw new Error('invalid_token');
          // A linked user's nickname/portrait may have changed since token issuance.
          // Only edge-validated identity fields may refresh the durable record.
          if (found.account_id && player.edgeName) {
            if (found.name !== player.edgeName || found.avatar !== player.edgeAvatar) {
              found.name = player.edgeName;
              found.avatar = player.edgeAvatar;
              this.sql('UPDATE sessions SET name = ?, avatar = ? WHERE token = ?',found.name,found.avatar,msg.token);
            }
          }
          // Legacy unverified sessions may predate the guest marker.
          if (!found.account_id && !found.name.startsWith('Гость · ')) {
            found.name = 'Гость · ' + found.name.slice(0,24);
            this.sql('UPDATE sessions SET name = ? WHERE token = ?', found.name, msg.token);
          }
          for (const old of this.ctx.getWebSockets()) {
            if (old !== ws && old.deserializeAttachment()?.id === found.id) old.close(4000, 'reconnected');
          }
          player = { id: found.id, name: found.name, roomId: null,
            accountId: found.account_id || null, avatar: found.avatar || null,
            verified: !!found.account_id, edgeAccountId: player.edgeAccountId || null };
          this.attachment(ws, player);
          message(ws, 'authenticated', { player: { id: player.id, name: player.name,
            accountId: player.accountId, avatar: player.avatar, verified: player.verified } });
          return;
        }
        if (!player.id) throw new Error('authentication_required');
        const member = { id: player.id, name: player.name, accountId: player.accountId,
          avatar: player.avatar, verified: player.verified };
        if (msg.type === 'create_room') {
          if (player.roomId && this.readRoom(player.roomId)) throw new Error('already_in_room');
          if (!GAME_ID.test(msg.gameId) || !POCKET_MODULES[msg.gameId]) throw new Error('game_unavailable');
          if (this.countRooms() >= MAX_ROOMS) throw new Error('server_at_capacity');
          const version = POCKET_MODULES[msg.gameId].current;
          const mod = this.module(msg.gameId, version);
          if (!mod) throw new Error('game_unavailable');
          const players = [member];
          const result = await mod.createRoom({ player: member, players, payload: msg.payload ?? null });
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          // Guarantee unique invite prefixes among active rooms.
          let id;
          for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = crypto.randomUUID();
            const existing = this.sql('SELECT id FROM rooms WHERE substr(id, 1, 8) = ? LIMIT 1', candidate.slice(0, 8)).toArray();
            if (!existing.length) { id = candidate; break; }
          }
          if (!id) throw new Error('server_at_capacity');
          const room = { id, gameId: msg.gameId, version, players,
            state: result.state, createdAt: Date.now() };
          this.persist(room);
          this.setRoom(ws, room.id);
          this.joined(ws,room,member);
          if (result.events) this.emit(room, result.events);
          return;
        }
        if (msg.type === 'join_room') {
          if (player.roomId && this.readRoom(player.roomId)) throw new Error('already_in_room');
          const requested = typeof msg.roomId === 'string' ? msg.roomId.trim() : '';
          if (!uuid.test(requested) && !shortCode.test(requested)) throw new Error('room_not_found');
          let resolved = requested.toLowerCase();
          if (shortCode.test(requested)) {
            const matches = this.sql('SELECT id FROM rooms WHERE substr(id, 1, 8) = ? LIMIT 2', resolved).toArray();
            if (matches.length !== 1) throw new Error('room_not_found');
            resolved = matches[0].id;
          }
          const room = this.readRoom(resolved);
          if (!room) throw new Error('room_not_found');
          const mod = this.module(room.gameId, room.version);
          if (!mod) throw new Error('room_version_unavailable');
          const previous = room.players.some(p => p.id === player.id);
          if (!previous && member.accountId && room.players.some(p => p.accountId === member.accountId)) {
            throw new Error('account_already_in_room');
          }
          if (!previous) {
            if (room.players.length >= MAX_PLAYERS) throw new Error('room_full');
            room.players.push(member);
            const result = mod.onJoin
              ? await mod.onJoin({ state: copied(room.state), player: member, players: room.players, payload: null })
              : { state: room.state, events: [] };
            if (!result || !('state' in result)) throw new Error('invalid_module_state');
            room.state = result.state;
            this.persist(room);
            this.setRoom(ws, room.id);
            this.joined(ws,room,member);
            this.emit(room, result.events ?? []);
            await this.refreshZamazkaPresence(room);
          } else {
            // Reconnecting with the same durable token keeps the same seat while
            // propagating a freshly verified nickname/avatar into room snapshots.
            const old = room.players.find(p => p.id === player.id);
            if (old && (old.name !== member.name || old.avatar !== member.avatar || old.accountId !== member.accountId)) {
              const refresh = p => p.id === player.id ? { ...p, ...member } : p;
              room.players = room.players.map(refresh);
              if (Array.isArray(room.state?.participants)) room.state.participants = room.state.participants.map(refresh);
              if (Array.isArray(room.state?.players)) room.state.players = room.state.players.map(refresh);
              this.persist(room);
              this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined });
            }
            this.setRoom(ws, room.id);
            await this.updateBazaarPresence(room,member,true);
            this.joined(ws,room,member);
            await this.refreshZamazkaPresence(room);
          }
          this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined });
          return;
        }
        const room = player.roomId ? this.readRoom(player.roomId) : null;
        if (!room || !room.players.some(p => p.id === player.id)) throw new Error('not_in_room');
        const mod = this.module(room.gameId, room.version);
        if (!mod) throw new Error('room_version_unavailable');
        if (msg.type === 'game_message') {
          const result = await mod.onMessage({ state: copied(room.state), player: member,
            players: room.players, payload: msg.payload,
            ...(room.gameId==='blockies'?{
              connectedIds:[...new Set(this.sockets(room.id).map(peer=>peer.deserializeAttachment()?.id).filter(Boolean))]
            }:{}) });
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          if (!Array.isArray(result.events ?? []) || result.events.length > 32) throw new Error('invalid_module_events');
          // Validate event payloads before modifying persistent game state.
          for (const event of result.events ?? []) if (bytes({ roomId: room.id, event }) > (room.gameId==='zamazka'&&event?.type==='state'&&event?.to?MAX_ZAMAZKA_STATE_EVENT:MAX_EVENT_BYTES)) throw new Error('event_too_large');
          const prior=room.state;
          room.state = result.state;
          // Pure queries do not change room state. Avoid serializing and writing
          // the entire room for every time sync or reconnection snapshot.
          const readOnlyZamazka=room.gameId==='zamazka'&&
            (msg.payload?.type==='sync'||msg.payload?.type==='time_ping'||
             (msg.payload?.type==='pulse'&&(result.events?.length||0)===0));
          if(!readOnlyZamazka)this.persist(room);
          this.recordZamazkaRewards(room,prior,room.state,result.events ?? [],player.id);
          this.recordBlockiesRewards(room,prior,room.state);
          this.emit(room, result.events ?? []);
          await this.applyKicks(room, result.events ?? [], player.id);
          await this.flushAwards();
          if (result.finished) await this.closeRoom(room);
          return;
        }
        if (msg.type === 'leave_room') {
          room.players = room.players.filter(p => p.id !== player.id);
          const result = mod.onLeave
            ? await mod.onLeave({ state: copied(room.state), player: member, players: room.players })
            : { state: room.state, events: [] };
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          room.state = result.state;
          this.setRoom(ws, null);
          const keepVacant=room.gameId==='chyepukha'&&room.version==='v5'&&
            (room.state.phase==='writing'||room.state.phase==='finished');
          if (!room.players.length&&!keepVacant) await this.closeRoom(room);
          else {
            this.persist(room);
            this.emit(room, result.events ?? []);
            this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined });
          }
          return;
        }
        throw new Error('unknown_message');
      } catch (error) {
        message(ws, 'error', { code: String(error?.message || error).slice(0,80) });
      }
    });
  }

  async webSocketClose(ws, code, reason, wasClean) {
    const info = ws.deserializeAttachment();
    if(info?.roomId){
      console.info(JSON.stringify({event:'pocketnet_socket_closed',
        game:'room', roomId:info.roomId, playerId:info.id,
        code:Number.isInteger(code)?code:null,
        reason:typeof reason==='string'?reason.slice(0,80):'',
        clean:wasClean===true,
        replaced:!!this.connected(info.id,info.roomId),
        at:Date.now()}));
    }
    if (info?.roomId) {
      const room = this.readRoom(info.roomId);
      if (room) {
        // A reconnect replaces the old socket. Its late close must not look like
        // a second disconnection if a new socket already owns the player seat.
        const stillConnected=!!this.connected(info.id,room.id);
        if(!stillConnected){
          this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined, disconnected: info.id });
          await this.updateBazaarPresence(room,{id:info.id},false);
        }
        await this.refreshZamazkaPresence(room);
        this.ensureAlarm();
      }
    }
  }

  async alarm() {
    await this.flushAwards();
    const now = Date.now();
    this.sql('DELETE FROM sessions WHERE expires < ?', now);
    const rows = this.sql('SELECT id, updated_at FROM rooms').toArray();
    for (const row of rows) {
      const room = this.readRoom(row.id);
      const ttl=room?.gameId==='chyepukha'&&room.version==='v5'&&room.state?.phase==='writing' ? 72*60*60_000
        : room?.gameId==='chyepukha'&&room.version==='v5'&&room.state?.phase==='finished' ? 7*24*60*60_000
        : room?.gameId==='fog-of-conquest'&&room.state?.phase==='battle' ? 6*24*60*60_000
        : room?.gameId==='zamazka'&&room.state?.paused ? 12*60*60_000 : ROOM_TTL;
      if(now-row.updated_at<ttl||this.sockets(row.id).length)continue;
      if(room)await this.closeRoom(room);
    }
    this.ensureAlarm();
  }
}
