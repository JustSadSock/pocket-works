export const MIN_PLAYERS=2,MAX_PLAYERS=4;
export const count=m=>m==='team'?4:2;
export function initial(mode,ids){const n=mode==='solo'||mode==='duel'?2:4;return {mode,turn:0,round:0,score:[0,0],winner:null,units:Array.from({length:n},(_,i)=>({id:ids[i]||'bot'+i,team:i%2,x:i%2?6:0,y:n===2?3:i<2?1:5,hp:3})),log:'Захватите центр или уничтожьте противников'};}
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function actions(s){const u=s.units[s.turn];if(s.winner!==null||!u?.hp)return [];const a=[{type:'wait'}];for(let y=0;y<7;y++)for(let x=0;x<7;x++){const d=dist(u,{x,y}),v=s.units.find(v=>v.hp&&v.x===x&&v.y===y);if(v&&v.team!==u.team&&d<=2)a.push({type:'hit',x,y});if(!v&&d===1)a.push({type:'move',x,y});}return a;}
export function play(s,id,a){if(s.units[s.turn]?.id!==id||!actions(s).some(v=>v.type===a?.type&&v.x===a.x&&v.y===a.y))return false;const u=s.units[s.turn];if(a.type==='move'){u.x=a.x;u.y=a.y;}if(a.type==='hit')s.units.find(v=>v.hp&&v.x===a.x&&v.y===a.y).hp--;if(u.x===3&&u.y===3)s.score[u.team]++;s.log=a.type==='hit'?'Попадание!':a.type==='move'?'Манёвр':'Ожидание';if(!s.units.some(v=>v.hp&&v.team!==u.team)||s.score[u.team]>=5)s.winner=u.team;else{do{s.turn=(s.turn+1)%s.units.length;}while(!s.units[s.turn].hp);if(++s.round>=160)s.winner=s.score[0]===s.score[1]?2:s.score[0]>s.score[1]?0:1;}return true;}
export function bot(s){const u=s.units[s.turn],a=actions(s);if(!a.length)return;const enemies=s.units.filter(v=>v.hp&&v.team!==u.team);const rank=v=>v.type==='hit'?100:v.type==='move'?20-dist(v,{x:3,y:3})*2-Math.min(...enemies.map(e=>dist(v,e)))*.2:v.type==='wait'&&u.x===3&&u.y===3?30:0;a.sort((x,y)=>rank(y)-rank(x));play(s,u.id,a[0]);}
function bots(s){for(let i=0;i<4&&s.winner===null&&s.units[s.turn].id.startsWith('bot');i++)bot(s);}
const emit=state=>({state,events:[{type:'state',payload:state}]});
const changed=state=>{state.revision=(state.revision||0)+1;return emit(state)};
export default {
 protocolVersion:1,
 createRoom({player,payload}){
  return {state:{phase:'lobby',host:player.id,mode:['coop','team','duel'].includes(payload?.mode)?payload.mode:'duel',players:[player],match:null,revision:0}};
 },
 onJoin({state,players}){
  if(state.phase==='playing'||players.length>count(state.mode))throw Error('room_full');
  state.players=players;
  return changed(state);
 },
 onLeave({state,player,players}){
  state.players=players;
  if(state.host===player.id)state.host=players[0]?.id||null;
  if(state.phase==='playing'){
   const u=state.match.units.find(u=>u.id===player.id);
   if(u){state.match.winner=1-u.team;state.match.log='Игрок покинул комнату';state.phase='finished';}
  }
  return changed(state);
 },
 onMessage({state,player,players,payload}){
  if(payload?.type==='sync')return emit(state);
  if(!players.some(p=>p.id===player.id))return {state,events:[]};
  if(payload?.revision!==state.revision)return emit(state);
  if(payload?.type==='start'&&player.id===state.host&&state.phase!=='playing'&&players.length===count(state.mode)){
   const ids=players.map(p=>p.id);
   state.match=initial(state.mode,state.mode==='coop'?[ids[0],'bot1',ids[1],'bot3']:ids);
   state.phase='playing';
   return changed(state);
  }
  if(state.phase==='playing'&&payload?.type==='act'&&play(state.match,player.id,payload.action)){
   bots(state.match);
   if(state.match.winner!==null)state.phase='finished';
   return changed(state);
  }
  return emit(state);
 }
};
