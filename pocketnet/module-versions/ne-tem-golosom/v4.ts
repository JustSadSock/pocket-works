export const MIN_PLAYERS=2;
export const MAX_PLAYERS=6;
export const RULESET_VERSION=3;
export const MAX_AUDIO_BYTES=3_000_000;
const allowed=/^[\p{L}\p{N} .,!?:()_-]{1,35}$/u;
const notice=(id,s)=>[{type:'notice',to:id,payload:s}];
const emit=s=>[{type:'state',payload:s}];
const validRole=v=>typeof v==='string'&&allowed.test(v.trim());
const isCount=c=>Number.isInteger(c)&&c>=1&&c<=90;
const validAudioMeta=(state,meta)=>{
 if(!meta||typeof meta!=='object'||Array.isArray(meta))return false;
 if(typeof meta.id!=='string'||meta.id.length<1||meta.id.length>80||
    typeof meta.owner!=='string'||!state.players.some(p=>p.id===meta.owner)||
    meta.epoch!==state.mediaEpoch||meta.round!==state.round)return false;
 if(!Number.isFinite(meta.start)||!Number.isFinite(meta.end)||!Number.isFinite(meta.offset)||
    meta.start<0||meta.end<=meta.start||meta.end>state.scene.duration+.02||
    meta.offset<0||meta.offset>state.scene.duration+1)return false;
 return isCount(state.counts[meta.owner])&&!!state.ready[meta.owner];
};
const assignRoles=(players,roles)=>{const a=Object.fromEntries(players.map((p,i)=>[p.id,roles[i%roles.length]]));for(let i=players.length;i<roles.length;i++){const p=players[i%players.length];a[p.id]+=' + '+roles[i]}return a;};
const serial=s=>({...s,players:s.players.map(p=>({id:p.id,name:p.name})),revision:s.revision});
const module={
 protocolVersion:1,
 createRoom({player}){
  const scene={id:'wing',title:'WING IT!',start:50,duration:60,roles:['Кот','Пёс','Курица'],custom:false};
  return {state:{phase:'lobby',host:player.id,players:[player],scene,
   assignments:{[player.id]:'Кот'},mediaReady:{[player.id]:true},ready:{},counts:{},mediaEpoch:1,round:1,configured:false,revision:1}};
 },
 onJoin({state,players,player}){
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  if(state.phase!=='lobby')throw Error('match_in_progress');
  state.players=players;
  state.assignments=assignRoles(state.players,state.scene.roles);
  state.mediaReady[player.id]=!state.scene.custom;
  state.revision++;
  return {state,events:emit(serial(state))};
 },
 onLeave({state,players,player}){
  state.players=players;
  delete state.assignments[player.id];delete state.ready[player.id];delete state.mediaReady[player.id];delete state.counts[player.id];
  if(state.host===player.id)state.host=players[0]?.id||'';
  if(state.phase==='recording'&&players.length<2)state.phase='lobby';
  state.revision++;
  return {state,events:emit(serial(state))};
 },
 onMessage({state,player,payload}){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(!state.players.some(p=>p.id===player.id))return {state,events:[]};
  if(v.type==='sync')return {state,events:[{type:'state',to:player.id,payload:serial(state)}]};
  if(v.type==='signal'){
    if(typeof v.to!=='string'||v.to===player.id||!state.players.some(p=>p.id===v.to))return {state,events:[]};
    if(!v.signal||typeof v.signal!=='object'||JSON.stringify(v.signal).length>10000)return {state,events:[]};
    return {state,events:[{type:'signal',to:v.to,payload:{from:player.id,signal:v.signal}}]};
  }
  if(v.type==='relay'&&state.phase==='premiere'){
    if(typeof v.to!=='string'||v.to===player.id||!state.players.some(p=>p.id===v.to))return {state,events:[]};
    const data=v.data;
    if(!data||typeof data!=='object'||Array.isArray(data)||!['begin','part','end'].includes(data.action)||typeof data.token!=='string'||data.token.length>55||data.token.length<6)return {state,events:[]};
    if(JSON.stringify(data).length>8500)return {state,events:[]};
    if(data.action==='begin'){
      const meta=data.meta;
      if(data.kind!=='audio'||!Number.isInteger(data.size)||data.size<1||data.size>MAX_AUDIO_BYTES||!validAudioMeta(state,meta))return {state,events:[]};
      if(player.id!==state.host&&meta.owner!==player.id)return {state,events:[]};
    }
    if(data.action==='part'&&(typeof data.body!=='string'||data.body.length>6400||!Number.isInteger(data.part)||data.part<0||data.part>900))return {state,events:[]};
    return {state,events:[{type:'relay',to:v.to,payload:{from:player.id,data}}]};
  }
  if(v.type==='scene'&&state.phase==='lobby'&&player.id===state.host){
    const x=v.scene;
    if(!x||typeof x!=='object'||typeof x.id!=='string'||x.id.length<1||x.id.length>48||typeof x.title!=='string'||x.title.trim().length<1||x.title.length>55)return {state,events:notice(player.id,'Неверная сцена.')};
    const start=Number(x.start),duration=Number(x.duration);
    if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<10||duration>90||start>3600)return {state,events:notice(player.id,'Длина сцены должна быть от 10 до 90 секунд.')};
    if(!Array.isArray(x.roles)||x.roles.length<1||x.roles.length>12||!x.roles.every(validRole))return {state,events:notice(player.id,'Добавь корректные роли.')};
    state.scene={id:x.id,title:x.title,start,duration,roles:x.roles.map(z=>z.trim()),custom:x.custom===true,cleaned:x.custom===true&&x.cleaned===true};
    state.assignments=assignRoles(state.players,state.scene.roles);
    state.mediaReady=Object.fromEntries(state.players.map(p=>[p.id,!state.scene.custom||p.id===state.host]));
    state.ready={};state.counts={};state.configured=true;state.mediaEpoch=(state.mediaEpoch||0)+1;state.revision++;
    return {state,events:emit(serial(state))};
  }
  if(v.type==='assign'&&state.phase==='lobby'&&player.id===state.host){
    if(typeof v.target!=='string'||!state.players.some(p=>p.id===v.target)||!(typeof v.role==='string'&&(v.role==='Все роли'||(v.role.split(' + ').length<=state.scene.roles.length&&v.role.split(' + ').every(r=>state.scene.roles.includes(r))))))return {state,events:[]};
    state.assignments[v.target]=v.role;state.revision++;return {state,events:emit(serial(state))};
  }
  if(v.type==='media_ready'&&state.phase==='lobby'){
    if(!state.scene.custom||player.id===state.host||
       v.scene!==state.scene.id||v.epoch!==state.mediaEpoch)
      return {state,events:[]};
    state.mediaReady[player.id]=true;
    state.revision++;return {state,events:emit(serial(state))};
  }
  if(v.type==='start'&&state.phase==='lobby'&&player.id===state.host){
    if(!state.configured)return {state,events:notice(player.id,'Ведущий ещё не выбрал сцену.')};
     if(state.players.length<MIN_PLAYERS||!state.players.every(p=>state.mediaReady[p.id]))return {state,events:notice(player.id,'Нужны два участника и видео у каждого.')};
    state.phase='recording';state.ready={};state.counts={};state.revision++;
    return {state,events:emit(serial(state))};
  }
  if(v.type==='ready'&&state.phase==='recording'){
    const count=Number(v.count);
    if(!isCount(count))return {state,events:notice(player.id,'Слишком много фрагментов.')};
    state.ready[player.id]=true;state.counts[player.id]=count;state.revision++;
    return {state,events:emit(serial(state))};
  }
  if(v.type==='unready'&&state.phase==='recording'){
    delete state.ready[player.id];delete state.counts[player.id];state.revision++;
    return {state,events:emit(serial(state))};
  }
  if(v.type==='reveal'&&state.phase==='recording'&&player.id===state.host){
    if(!state.players.every(p=>state.ready[p.id]))return {state,events:notice(player.id,'Ожидаем остальные дорожки.')};
    state.phase='premiere';state.revision++;
    return {state,events:emit(serial(state))};
  }
  if(v.type==='again'&&state.phase==='premiere'&&player.id===state.host){
    state.phase='lobby';state.ready={};state.counts={};state.round=(state.round||1)+1;
    state.revision++;return {state,events:emit(serial(state))};
  }
  return {state,events:[]};
 }
};
export default module;
