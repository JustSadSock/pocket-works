import { POCKET_MODULES } from './generated-modules.mjs';
import { sessionTokenKey, findSessionByToken, isSessionToken } from './session-tokens.mjs';
import {AdmissionLimiter} from './admission-limits.mjs';
import {assessZamazkaAwards} from './zamazka-awards.mjs';
import {assessBlockiesAwards} from './blockies-awards.mjs';
import {playerRoomView} from './private-views.mjs';
import {roomJoinView} from './room-join-view.mjs';
import {shouldAnnounceSocketDeparture} from './disconnect-presence.mjs';
import {prepareArtworkStorage} from './art-storage.mjs';
import {reconcileZamazkaPresence} from './zamazka-presence.mjs';
import {ZAMAZKA_ALARM_VERSIONS,nextZamazkaDeadlineAt,shouldAdvanceZamazkaDeadline} from './zamazka-deadlines.mjs';
import {packPrivateZamazkaState} from './zamazka-state-stream.mjs';
import {isChyepukhaSync,canServeChyepukhaSync,checkChyepukhaStateBudget,checkChyepukhaViewBudget} from './chyepukha-transport.mjs';

// All rooms share one small, hibernatable SQLite-backed coordinator. This matches
// the personal/friends deployment (max 32 rooms / 48 sockets) without paid KV/D1.
// Game code is statically bundled from pinned version snapshots; no eval/remote code.
const WIRE_VERSION = 1;
const MAX_PAYLOAD = 16 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_ZAMAZKA_STATE_EVENT = 5 * 1024 * 1024;
const ZAMAZKA_SECURE_COMMANDS = new Set(['sync','time_ping','pulse','submit_begin','submit_resume','resume_with_absent','claim_host','kick_player','art_ready','board_delta','board_clear','emblem','start','draft_chunk','submit_chunk','draft','submit','vote','vote_draft','advance','continue','next','ballot_chunk','ballot_audit']);
const ZAMAZKA_ART_REF = '__zamazka_sqlite_art__';
const MAX_STATE = 256 * 1024;
const MAX_ROOMS = 32;
const MAX_CONNECTIONS = 48;
const MAX_PLAYERS = 8;
// Versioned game modules enforce these caps in onJoin; mirror them for accurate
// discoverability before a player follows an invitation link.
const GAME_SEATS=Object.freeze({'blind-pals':2,flagpost:2,'fog-of-conquest':2,'last-tile-duel':2,'kromka-duel':2,
  folio:6,lipki:4,natyazhenie:5,komnatka:5,blockies:4,'uzel-party':6,'ne-tem-golosom':6,'fog-of-conquest':2});
const ROOM_TTL = 30 * 60_000;
const SESSION_TTL = 7 * 86400_000;
const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shortCode = /^[0-9a-f]{8}$/i;
const encoder = new TextEncoder();

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const admissionDenied = decision => new Response(JSON.stringify({error:'rate_limited'}),{
  status:429,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'retry-after':String(decision.retryAfter)
  }
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
    // 20 new sessions/minute and up to 120 WebSocket upgrades/minute per
    // network IP. Separate counters prevent websocket churn blocking issuance.
    // Each table is bounded, aged out and never exported with identifying keys.
    this.sessionAdmission=new AdmissionLimiter({limit:20,maxKeys:2048});
    this.socketAdmission=new AdmissionLimiter({limit:120,maxKeys:2048});
    this.messageRates = new WeakMap();
    this.chyepukhaSyncAt = new WeakMap();
    this.zamazkaSyncAt = new WeakMap();
    this.bazaarSyncAt = new WeakMap();
    this.bazaarPingAt = new WeakMap();
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
    return playerRoomView(mod,room.state,player,room.players,room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined);
  }
  joined(ws,room,player){
    const state=roomJoinView(room,()=>this.projectedState(room,player));
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
          if(bytes(packet)<=MAX_EVENT_BYTES){
            message(ws,'game_event',packet);
          }else if(room.gameId==='zamazka'){
            // Project FIRST and split only this recipient's gallery. Streaming
            // the unfiltered module event would disclose hidden originals,
            // competing paintings and vote totals to other participants.
            const chunks=packPrivateZamazkaState(room.id,own,{
              maxPacketBytes:MAX_EVENT_BYTES,
              maxStateBytes:MAX_ZAMAZKA_STATE_EVENT
            });
            for(const chunk of chunks)message(ws,'game_event',chunk);
          }else throw Error('event_too_large');
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
        // ZAMAZKA v35 and pinned earlier room versions send already-private
        // state events through this legacy branch (not viewForPlayer).
        // Chunk the actual wire payload by UTF-8 bytes, not JavaScript chars:
        // multibyte player names and artwork metadata must never grow a
        // WebSocket frame above the transport/client part limit.
        const parts=packPrivateZamazkaState(room.id,event,{
          maxPacketBytes:MAX_EVENT_BYTES,
          maxStateBytes:MAX_ZAMAZKA_STATE_EVENT
        });
        for(const part of parts)message(target,'game_event',part);
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
    const zamazka=room.gameId==='zamazka'&&(room.state?.paused||room.state?.phase==='lobby')&&room.state?.host===actorId;
    const chyepukha=room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)&&room.state?.host===actorId;
    const bazaar=room.gameId==='black-bazaar'&&['v16','v17','v18','v19','v20','v21','v22','v23'].includes(room.version)&&room.state?.host===actorId;
    if(!zamazka&&!chyepukha&&!bazaar)return;
    let changed = false;
    for (const event of events ?? []) {
      if (event?.type !== 'player_kicked' || typeof event.to !== 'string') continue;
      const targetId = event.to;
      if (targetId === actorId || (zamazka&&room.state.participants?.some(p=>p.id===targetId)) ||
          ((chyepukha||bazaar)&&!(room.state.bannedIds||[]).includes(targetId)) ||
          !room.players.some(p => p.id === targetId)) continue;
      const socket = this.connected(targetId, room.id);
      if (socket) {
        message(socket, 'room_kicked', { roomId: room.id, reason:chyepukha||bazaar?'host':'curator' });
        this.setRoom(socket, null);
      }
      if(zamazka&&Number(room.version.slice(1))>=37){
        const accountId=room.players.find(p=>p.id===targetId)?.accountId;
        if(accountId){room.state.bannedAccounts||=[];if(!room.state.bannedAccounts.includes(accountId))room.state.bannedAccounts.push(accountId);}
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
  async updateChyepukhaPresence(room,player,online){
    if(room.gameId!=='chyepukha'||!['v6','v7','v8','v9','v10'].includes(room.version))return;
    const mod=this.module(room.gameId,room.version);
    if(!mod?.onPresence)return;
    const onlineIds=this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean);
    const result=await mod.onPresence({state:copied(room.state),player,online,onlineIds,now:Date.now()});
    if(result?.state){room.state=result.state;this.persist(room);this.emit(room,result.events||[])}
  }
  async updateBazaarPresence(room,player,online){
    if(room.gameId!=='black-bazaar')return;
    const mod=this.module(room.gameId,room.version);
    if(typeof mod?.onPresence!=='function')return;
    const onlineIds=this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean);
    const result=await mod.onPresence({state:copied(room.state),player,online,
      ...(['v17','v18','v19','v20','v21','v22','v23'].includes(room.version)?{onlineIds}: {})});
    if(result?.state&&result.events?.length){
      room.state=result.state;this.persist(room);this.emit(room,result.events);
    }
  }
  // The alarm and commands share the DO mutation queue. A deadline may advance
  // a turn once, regardless of simultaneous clients, hibernation or late packets.
  advanceBazaarDeadline(room,now=Date.now()){
    if(room.gameId!=='black-bazaar'||!['v20','v21','v22','v23'].includes(room.version))return false;
    const mod=this.module(room.gameId,room.version);
    if(!mod?.onDeadline)return false;
    const priorRevision=room.state?.revision;
    const result=mod.onDeadline({state:copied(room.state),now});
    if(!result?.state||result.state.revision===priorRevision)return false;
    room.state=result.state;
    this.persist(room);
    this.emit(room,result.events||[]);
    return true;
  }
  // Alarm, websocket messages and disconnects run on the same durable
  // mutation queue. Reuse the pinned module's ordinary pulse transition,
  // including its unfinished-submission checks and private event projection.
  advanceZamazkaDeadline(room,at=Date.now()){
    if(room.gameId!=='zamazka'||!ZAMAZKA_ALARM_VERSIONS.includes(room.version)||
       !shouldAdvanceZamazkaDeadline(room.state,at))return false;
    const actor=room.players.find(p=>room.state.participants?.some(member=>member.id===p.id));
    if(!actor)return false;
    const mod=this.module(room.gameId,room.version);
    if(!mod?.onMessage)return false;
    const previous=room.state;
    const result=mod.onMessage({state:copied(previous),player:actor,players:room.players,payload:{type:'pulse'}});
    if(!result?.state)return false;
    const next=result.state;
    if(next.phase===previous.phase&&next.round===previous.round&&
       next.turn===previous.turn&&next.deadline===previous.deadline)return false;
    room.state=next;
    // Persist FIRST, then emit private events. No client can see an
    // uncommitted phase or lose its confirmed drawing after a DO restart.
    this.persist(room);
    this.recordZamazkaRewards(room,previous,next,result.events||[],actor.id);
    this.emit(room,result.events||[]);
    return true;
  }
  async refreshZamazkaPresence(room){
    if(room.gameId!=='zamazka'||room.state?.resumable!==true)return;
    const state=room.state;
    if(!state||!Array.isArray(state.participants))return;
    const ids=this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean);
    const active=new Set(ids);
    const {changed,resumed}=reconcileZamazkaPresence(state,ids,Date.now());
    if(changed)this.persist(room);
    // Send each participant their private snapshot, preserving hidden art.
    if(resumed||(changed&&room.version==='v47')){
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
      if(row.game_id==='chyepukha'&&['v5','v6','v7','v8','v9','v10'].includes(row.version)&&
         (!state||state.schema!==1||!Array.isArray(state.sheets)))throw Error('invalid_chyepukha_state');
    }catch(error){
      if(row.game_id!=='chyepukha'||!['v5','v6','v7','v8','v9','v10'].includes(row.version))throw error;
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
        else if(kind==='ballot'&&state.ballotSprites?.[user]===ZAMAZKA_ART_REF)state.ballotSprites[user]=art;
        else if(kind==='ballot-assembly'&&state.ballotAssemblies?.[user]===ZAMAZKA_ART_REF)state.ballotAssemblies[user]=art;
      }
      for(const item of Object.values(state.assignments||{}))if(item.strokes===ZAMAZKA_ART_REF)throw Error('room_art_missing');
      for(const item of Object.values(state.drafts||{}))if(item===ZAMAZKA_ART_REF)throw Error('room_art_missing');
      for(const item of Object.values(state.draftAssemblies||{}))if(item.strokes===ZAMAZKA_ART_REF)throw Error('room_art_missing');
      for(const item of Object.values(state.ballotSprites||{}))if(item===ZAMAZKA_ART_REF)throw Error('room_ballot_missing');
      for(const item of Object.values(state.ballotAssemblies||{}))if(item===ZAMAZKA_ART_REF)throw Error('room_ballot_missing');
    }
    return {id:row.id,gameId:row.game_id,version:row.version,
      state,players:roomPlayers,createdAt:row.created_at,updatedAt:row.updated_at};
  }
  persist(room,{artOwner=null,skipAlarm=false}={}) {
    let state=room.state, pieces=[], activeArtKeys=null;
    if(room.gameId==='zamazka'){
      const projected=prepareArtworkStorage(state,ZAMAZKA_ART_REF,artOwner);
      state=projected.stored;
      pieces=projected.updates;
      activeArtKeys=projected.activeKeys;
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
        }
        // When an artist commits their final work, obsolete draft/assembly
        // rows disappear here without deleting untouched art of other players.
        for(const pkey of stale)if(!activeArtKeys.has(pkey))
          this.sql('DELETE FROM zamazka_art_payloads WHERE room_id=? AND pkey=?',room.id,pkey);
      }
      this.sql(`INSERT INTO rooms (id, game_id, version, state, players, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state=excluded.state, players=excluded.players, updated_at=excluded.updated_at`,
        room.id,room.gameId,room.version,encoded,players,room.createdAt,room.updatedAt);
      if(room.gameId==='chyepukha'&&['v5','v6','v7','v8','v9','v10'].includes(room.version)&&room.state.phase!=='lobby'){
        this.sql(`INSERT INTO chyepukha_checkpoints (room_id,revision,state,players,saved_at)
          VALUES (?,?,?,?,?) ON CONFLICT(room_id,revision) DO UPDATE SET state=excluded.state,players=excluded.players,saved_at=excluded.saved_at`,
          room.id,Number(room.state.revision)||0,encoded,players,room.updatedAt);
        this.sql(`DELETE FROM chyepukha_checkpoints WHERE room_id=? AND revision NOT IN
          (SELECT revision FROM chyepukha_checkpoints WHERE room_id=? ORDER BY revision DESC LIMIT 4)`,room.id,room.id);
      }
    });
    if(!skipAlarm)this.ensureAlarm();
  }
  ensureAlarm() {
    // Pending grants survive room closure and are retried until Pocket Social confirms them.
    const waiting=this.sql('SELECT 1 FROM achievement_outbox LIMIT 1').toArray().length>0;
    if(!this.countRooms()&&!waiting)return;
    const now=Date.now();
    let next=now+(waiting?20_000:ROOM_TTL);
    // Only v20 opts in to authoritative wakeups. Pinned older versions remain unchanged.
    for(const row of this.sql('SELECT state FROM rooms WHERE game_id=? AND version IN (?,?,?,?)','black-bazaar','v20','v21','v22','v23').toArray()){
      const state=JSON.parse(row.state);
      if(state.phase==='play'&&!state.offlinePaused&&Number.isFinite(state.deadlineAt))
        next=Math.min(next,Math.max(now+250,state.deadlineAt+5));
    }
    // New Zamazka rooms advance even if every browser stops sending pulse.
    // Immutable v1–v45 rooms keep their existing wake/heartbeat behavior.
    for(const row of this.sql('SELECT state FROM rooms WHERE game_id=? AND version IN (?,?)','zamazka',...ZAMAZKA_ALARM_VERSIONS).toArray()){
      const due=nextZamazkaDeadlineAt(JSON.parse(row.state));
      if(due!==null)next=Math.min(next,Math.max(now+250,due+5));
    }
    this.ctx.storage.setAlarm(next).catch(e=>console.error('pocketnet_alarm',String(e)));
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
    const connectedIds=[...new Set(this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean))];
    const result=assessBlockiesAwards(previous,next,stats,()=>crypto.randomUUID(),connectedIds);
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
        admission:{sessions:this.sessionAdmission.snapshot(),sockets:this.socketAdmission.snapshot()},
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
      const now = Date.now();
      const admission=this.sessionAdmission.check(ip,now);
      if(!admission.allowed)return admissionDenied(admission);
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
        await sessionTokenKey(token), crypto.randomUUID(), name, now + SESSION_TTL, accountId, accountId ? avatar : null);
      return json({ token, verified: !!accountId, accountId });
    }
    if (endpoint === '/ws' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      // Rate-limit handshakes before allocating a server-side WebSocket.
      const admission=this.socketAdmission.check(request.headers.get('CF-Connecting-IP') || 'local');
      if(!admission.allowed)return admissionDenied(admission);
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
          if (!isSessionToken(msg.token)) throw new Error('invalid_token');
          const found = await findSessionByToken((sql, ...params) => this.sql(sql, ...params), msg.token);
          if (!found || (found.account_id || null) !== (player.edgeAccountId || null)) throw new Error('invalid_token');
          const storedToken = await sessionTokenKey(msg.token);
          // A linked user's nickname/portrait may have changed since token issuance.
          // Only edge-validated identity fields may refresh the durable record.
          if (found.account_id && player.edgeName) {
            if (found.name !== player.edgeName || found.avatar !== player.edgeAvatar) {
              found.name = player.edgeName;
              found.avatar = player.edgeAvatar;
              this.sql('UPDATE sessions SET name = ?, avatar = ? WHERE token = ?',found.name,found.avatar,storedToken);
            }
          }
          // Legacy unverified sessions may predate the guest marker.
          if (!found.account_id && !found.name.startsWith('Гость · ')) {
            found.name = 'Гость · ' + found.name.slice(0,24);
            this.sql('UPDATE sessions SET name = ? WHERE token = ?', found.name, storedToken);
          }
          for (const old of this.ctx.getWebSockets()) {
            const oldSeat=old.deserializeAttachment();
            if(old!==ws&&oldSeat?.id===found.id){
              this.attachment(old,{...oldSeat,serverReplaced:true});
              old.close(4000,'reconnected');
            }
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
          if((room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)||room.gameId==='black-bazaar'&&['v16','v17','v18','v19','v20','v21','v22','v23'].includes(room.version)||room.gameId==='zamazka'&&Number(room.version.slice(1))>=37)&&
             ((room.state.bannedIds||[]).includes(player.id)||(member.accountId&&(room.state.bannedAccounts||[]).includes(member.accountId))))throw Error('room_kicked');
          if(room.gameId==='zamazka'&&Number(room.version.slice(1))>=37&&!previous&&room.state.phase!=='lobby'&&!room.state.participants?.some(p=>p.id===player.id))throw Error('room_in_progress');
          if (!previous && member.accountId && room.players.some(p => p.accountId === member.accountId)) {
            throw new Error('account_already_in_room');
          }
          if (!previous) {
            const authorizedClaim=room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)&&
              typeof msg.claimCode==='string'&&msg.claimCode.toUpperCase()===room.state.claim?.code;
            if(room.players.length>=MAX_PLAYERS&&!authorizedClaim)throw Error('room_full');
            if(authorizedClaim&&this.connected(room.state.claim.seatId,room.id))throw Error('seat_online');
            room.players.push(member);
            const result = mod.onJoin
              ? await mod.onJoin({ state: copied(room.state), player: member, players: room.players,
                   payload:room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)?{claimCode:typeof msg.claimCode==='string'?msg.claimCode.slice(0,40):''}:null })
              : { state: room.state, events: [] };
            if (!result || !('state' in result)) throw new Error('invalid_module_state');
            room.state = result.state;
            if(room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)){
              const banned=new Set(room.state.bannedIds||[]);
              room.players=room.players.filter(p=>!banned.has(p.id));
            }
            this.persist(room);
            this.setRoom(ws, room.id);
            this.joined(ws,room,member);
            this.emit(room, result.events ?? []);
            await this.refreshZamazkaPresence(room);
            await this.updateChyepukhaPresence(room,member,true);
          } else {
            // Reconnecting with the same durable token keeps the same seat while
            // propagating a freshly verified nickname/avatar into room snapshots.
            const old = room.players.find(p => p.id === player.id);
            if (old && (old.name !== member.name || old.avatar !== member.avatar || old.accountId !== member.accountId)) {
              const refresh = p => p.id === player.id ? { ...p, ...member } : p;
              room.players = room.players.map(refresh);
              if (Array.isArray(room.state?.participants)) room.state.participants = room.state.participants.map(refresh);
              if (Array.isArray(room.state?.players)) room.state.players = room.state.players.map(refresh);
               // v19 separates the trusted nickname from the chosen, room-owned SVG avatar.
               // Refresh the verified nickname without overwriting avatar selection.
               if(room.gameId==='black-bazaar'&&['v19','v20','v21','v22','v23'].includes(room.version)){
                 room.state.players=room.state.players.map(p=>p.id===player.id?{...p,name:member.name}:p);
                 room.state.contestants=room.state.contestants?.map(p=>p.id===player.id?{...p,name:member.name,character:member.name}:p)||[];
                 if(Array.isArray(room.state.ranking))room.state.ranking=room.state.ranking.map(p=>p.id===player.id?{...p,name:member.name,character:member.name}:p);
               }
              this.persist(room);
              this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined });
            }
            this.setRoom(ws, room.id);
            await this.updateBazaarPresence(room,member,true);
            this.joined(ws,room,member);
            await this.refreshZamazkaPresence(room);
            await this.updateChyepukhaPresence(room,member,true);
          }
          this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined });
          return;
        }
        // Time echoes must not deserialize up to eight large SQL artwork
        // payloads merely to answer a five-second clock health probe.
        // Authenticate against the durable room seat before taking this fast path.
        if(msg.type==='game_message'&&msg.payload?.type==='time_ping'&&
           player.roomId&&Number.isFinite(msg.payload.stamp)){
          const seat=this.sql('SELECT game_id,players FROM rooms WHERE id=?',player.roomId).toArray()[0];
          if(seat?.game_id==='zamazka'&&JSON.parse(seat.players).some(p=>p.id===player.id)){
            message(ws,'game_event',{roomId:player.roomId,event:{
              type:'time_pong',to:player.id,
              payload:{stamp:msg.payload.stamp,serverNow:Date.now()}
            }});
            return;
          }
        }
        const room = player.roomId ? this.readRoom(player.roomId) : null;
        if (!room || !room.players.some(p => p.id === player.id)) throw new Error('not_in_room');
        const mod = this.module(room.gameId, room.version);
        if (!mod) throw new Error('room_version_unavailable');
        // Read-only sync: project one private view without cloning, persisting
        // or broadcasting the manuscripts to the entire room.
        // Bazaar v20: a heartbeat or time probe cannot rewrite the entire room.
        // Sync is private and throttled; the DO alarm handles unattended deadlines.
        if(msg.type==='game_message'&&room.gameId==='black-bazaar'&&['v20','v21','v22','v23'].includes(room.version)&&
           ['tick','sync','time_ping'].includes(msg.payload?.type)){
          const command=msg.payload.type,now=Date.now();
          this.advanceBazaarDeadline(room,now);
          if(command==='tick')return;
          if(command==='sync'){
            const last=this.bazaarSyncAt.get(ws),revision=room.state.revision;
            // Suppress duplicate snapshots only. A completed trade changes
            // revision and must be immediately resyncable on the same socket.
            if(last&&last.revision===revision&&now-last.at<40)return;
            this.bazaarSyncAt.set(ws,{at:now,revision});
            this.emit(room,[{type:'state',to:player.id}]);
          }else if(Number.isFinite(msg.payload.stamp)){
            if(now-(this.bazaarPingAt.get(ws)||0)<1500)return;
            this.bazaarPingAt.set(ws,now);
            message(ws,'game_event',{roomId:room.id,event:{type:'time_pong',to:player.id,
              payload:{stamp:msg.payload.stamp,serverNow:Date.now(),revision:room.state.revision}}});
          }
          return;
        }
        if (msg.type === 'game_message' && isChyepukhaSync(room.gameId, msg.payload)) {
          const now = Date.now();
          if (canServeChyepukhaSync(this.chyepukhaSyncAt.get(ws), now)) {
            this.chyepukhaSyncAt.set(ws, now);
            this.emit(room, [{ type: 'state', to: player.id }]);
          }
          return;
        }
        if (msg.type === 'game_message'&&room.gameId==='zamazka'&&Number(room.version.slice(1))>=37){
          const command=msg.payload?.type;
          if(!ZAMAZKA_SECURE_COMMANDS.has(command))return;
          if(command==='sync'){
            const time=Date.now();
            if(time-(this.zamazkaSyncAt.get(ws)||0)<1800)return;
            this.zamazkaSyncAt.set(ws,time);
          }
        }
        if (msg.type === 'game_message') {
          const result = await mod.onMessage({ state: copied(room.state), player: member,
            players: room.players, payload: msg.payload,
            ...(room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)?{
              connectedIds:this.sockets(room.id).map(peer=>peer.deserializeAttachment()?.id).filter(Boolean),now:Date.now()
            }:{}),
            ...(room.gameId==='blockies'?{
              connectedIds:[...new Set(this.sockets(room.id).map(peer=>peer.deserializeAttachment()?.id).filter(Boolean))]
            }:{}) });
          if (!result || !('state' in result)) throw new Error('invalid_module_state');
          if (!Array.isArray(result.events ?? []) || result.events.length > 32) throw new Error('invalid_module_events');
          // Validate event payloads before modifying persistent game state.
          for (const event of result.events ?? []) if (bytes({ roomId: room.id, event }) > (room.gameId==='zamazka'&&event?.type==='state'&&event?.to?MAX_ZAMAZKA_STATE_EVENT:MAX_EVENT_BYTES)) throw new Error('event_too_large');
          // Preserve the room-state budget before committing any new answer.
          // An oversized candidate never replaces already accepted manuscripts.
          if (room.gameId === 'chyepukha' &&
              result.state?.revision !== room.state?.revision) {
            const stateFits = checkChyepukhaStateBudget(result.state, MAX_STATE).ok;
            // A finished reader expands questions/attribution for every chapter.
            // Check its largest join/state packet now, not after the final submit.
            const finalViewFits = stateFits && (!result.state.sheets?.length ||
              checkChyepukhaViewBudget(room, mod.viewForPlayer({
                state:{...result.state,phase:'finished'}, player:member, players:room.players
              }), MAX_EVENT_BYTES).ok);
            if (!stateFits || !finalViewFits) {
            const reason = 'Рукописи наблизились до ліміту кімнати. Скороти фрагмент та надішли ще раз — попередні відповіді збережені.';
            const requestId = msg.payload?.requestId;
            const event = msg.payload?.type === 'submit' &&
              typeof requestId === 'string' && /^[a-zA-Z0-9_-]{12,96}$/.test(requestId)
              ? {type:'submission_rejected', to:player.id, payload:{requestId, reason}}
              : {type:'notice', to:player.id, payload:reason};
            this.emit(room, [event]);
            return;
            }
          }
          const prior=room.state;
          room.state = result.state;
          // Pure queries do not change room state. Avoid serializing and writing
          // the entire room for every time sync or reconnection snapshot.
          const peerAudit=room.gameId==='zamazka'&&['v45','v46','v47'].includes(room.version)&&msg.payload?.type==='ballot_audit';
          const acceptedPeerAudit=peerAudit&&result.events?.some(e=>e.type==='audit_update');
          const readOnlyZamazka=room.gameId==='zamazka'&&
            ((peerAudit&&!acceptedPeerAudit)||msg.payload?.type==='sync'||msg.payload?.type==='time_ping'||
             (msg.payload?.type==='pulse'&&(result.events?.length||0)===0)||
             (msg.payload?.type==='submit_resume'&&
              result.events?.some(e=>e.type==='submission_saved')));
          if(!readOnlyZamazka){
            const artworkPacket=room.gameId==='zamazka'&&
              ['draft_chunk','submit_chunk','ballot_chunk'].includes(msg.payload?.type)&&
              prior.phase===room.state.phase&&prior.round===room.state.round;
            // Reports change only tiny diagnostic counters. They MUST NOT
            // rewrite the eight full WebP images (or any final brush vectors).
            this.persist(room,acceptedPeerAudit?{artOwner:'',skipAlarm:true}:
              artworkPacket?{artOwner:player.id,skipAlarm:true}:{});

          }
          this.recordZamazkaRewards(room,prior,room.state,result.events ?? [],player.id);
          this.recordBlockiesRewards(room,prior,room.state);
          const earlyKick=room.gameId==='chyepukha'&&['v6','v7','v8','v9','v10'].includes(room.version)||room.gameId==='black-bazaar'&&['v16','v17','v18','v19','v20','v21','v22','v23'].includes(room.version);
          if(earlyKick)await this.applyKicks(room,result.events ?? [],player.id);
          this.emit(room, result.events ?? []);
          if(!earlyKick)await this.applyKicks(room, result.events ?? [], player.id);
          // Deliver cosmetics independently of bulk artwork packets. Pending awards
          // are durably queued and retried by the existing alarm.
          const bulkZamazka=room.gameId==='zamazka'&&['draft_chunk','submit_chunk','draft','submit_begin','submit_resume','sync','time_ping','pulse','ballot_chunk','ballot_audit'].includes(msg.payload?.type);
          if(!bulkZamazka)await this.flushAwards();
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
          const keepVacant=room.gameId==='chyepukha'&&['v5','v6','v7','v8','v9','v10'].includes(room.version)&&
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
    return this.run(async () => {
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
          if(shouldAnnounceSocketDeparture(info,stillConnected))
            this.broadcast(room, 'presence', { roomId: room.id, players: room.players, onlineIds: room.gameId==='black-bazaar'?this.sockets(room.id).map(ws=>ws.deserializeAttachment()?.id).filter(Boolean):undefined, disconnected: info.id });
          await this.updateBazaarPresence(room,{id:info.id},false);
          await this.updateChyepukhaPresence(room,{id:info.id},false);
        }
        await this.refreshZamazkaPresence(room);
        this.ensureAlarm();
      }
    }
    });
  }

  async alarm() {
    // External reward delivery can be slow and must stay outside the socket
    // queue. Actual room expiration, however, must serialize with join,
    // submission, and disconnect mutations to avoid closing a resumed room.
    const sweep=await this.run(async()=>{
      const now = Date.now();
      this.sql('DELETE FROM sessions WHERE expires < ?', now);
      this.sessionAdmission.sweep(now);
      this.socketAdmission.sweep(now);
      const rows = this.sql('SELECT id, updated_at FROM rooms').toArray();
      for (const row of rows) {
        const room = this.readRoom(row.id);
        const ttl=room?.gameId==='chyepukha'&&['v5','v6','v7','v8','v9','v10'].includes(room.version)&&room.state?.phase==='writing' ? 72*60*60_000
          : room?.gameId==='chyepukha'&&['v5','v6','v7','v8','v9','v10'].includes(room.version)&&room.state?.phase==='finished' ? 7*24*60*60_000
          : room?.gameId==='fog-of-conquest'&&room.state?.phase==='battle' ? 6*24*60*60_000
          : room?.gameId==='zamazka'&&room.state?.paused ? 12*60*60_000
          : room?.gameId==='black-bazaar'&&['v17','v18','v19','v20','v21','v22','v23'].includes(room.version)&&room.state?.phase==='play'&&room.state?.offlinePaused
            ? 24*60*60_000 : ROOM_TTL;
        if(now-row.updated_at>=ttl&&!this.sockets(row.id).length){
          if(room)await this.closeRoom(room);
          continue;
        }
        // Fire a pending turn without waiting for a browser heartbeat.
        if(room){this.advanceBazaarDeadline(room,now);this.advanceZamazkaDeadline(room,now);}
      }
      this.ensureAlarm();
    });
    // An optional remote achievement delivery must never delay a game deadline.
    await this.flushAwards();
    return sweep;
  }
}
