// УЗЕЛ / PocketNet rules: one server-authoritative movement step per validated command.
// No LAN transport, external services, timers, or client-owned victory flags.
export const MIN_PLAYERS=2;
export const MAX_PLAYERS=6;
const WIDTH=760,HEIGHT=900,STEP=21,ROPE_LIMIT=340;
const LEVELS=[
 {name:'ПЕРВОЕ КАСАНИЕ',hint:'Заденьте светящиеся кольца общей верёвкой.',pins:[{x:365,y:428,r:52}],rings:[{x:350,y:275},{x:495,y:620}],exit:{x:660,y:765}},
 {name:'ЗМЕИНЫЙ ХОД',hint:'Обойдите колонны с разных сторон.',pins:[{x:265,y:410,r:52},{x:510,y:485,r:52}],rings:[{x:385,y:220},{x:380,y:545},{x:540,y:710}],exit:{x:675,y:790}},
 {name:'ПОСЛЕДНИЙ УЗЕЛ',hint:'Обведите верёвку вокруг столбов.',pins:[{x:350,y:250,r:44},{x:250,y:535,r:48},{x:535,y:560,r:49}],rings:[{x:530,y:260},{x:380,y:420},{x:425,y:690}],exit:{x:650,y:790}},
 {name:'ЗВЁЗДНЫЙ ШОВ',hint:'Работайте вместе, чтобы зажечь все кольца.',pins:[{x:228,y:260,r:44},{x:525,y:320,r:48},{x:360,y:565,r:61}],rings:[{x:365,y:185},{x:170,y:510},{x:565,y:570},{x:385,y:760}],exit:{x:665,y:785}}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const positions=players=>Object.fromEntries(players.map((p,i)=>[p.id,{x:100+Math.floor(i/2)*40+(i%2)*80,y:765+Math.floor(i/2)*38}]));
function distanceSegment(p,a,b){
 const dx=b.x-a.x,dy=b.y-a.y;
 const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function ropeFor(s){
 const nodes=s.players.map(p=>s.positions[p.id]).filter(Boolean),out=[];
 for(let i=0;i<nodes.length-1;i++){
  const a=nodes[i],b=nodes[i+1];if(!out.length)out.push(a);
  let best=null,bestDist=Infinity;
  for(const peg of LEVELS[s.level].pins){
   if(distanceSegment(peg,a,b)<peg.r+4&&near(a,peg)>peg.r&&near(b,peg)>peg.r){
    const d=near(a,peg)+near(b,peg);
    if(d<bestDist){best=peg;bestDist=d;}
   }
  }
  if(best){
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const left=(dx*(best.y-a.y)-dy*(best.x-a.x))>=0?1:-1;
   const nx= -dy/len*left,ny=dx/len*left;
   out.push({x:best.x+nx*(best.r+23),y:best.y+ny*(best.r+23)});
  }
  out.push(b);
 }
 return out;
}
function view(s){
 const level=LEVELS[s.level]||LEVELS[0];
 return {host:s.host,players:s.players,phase:s.phase,level:s.level,lit:s.lit,positions:s.positions,
  revision:s.revision,rope:s.phase==='play'?ropeFor(s):[],layout:level,levels:LEVELS.length};
}
const events=s=>[{type:'state',payload:view(s)}];
const notice=(id,text)=>[{type:'notice',to:id,payload:text}];
function reset(s){s.phase='play';s.level=0;s.lit=[];s.positions=positions(s.players);s.last={};s.dashes={};s.revision++;}
function advance(s){s.level++;s.lit=[];s.positions=positions(s.players);s.last={};s.dashes={};if(s.level>=LEVELS.length){s.level=LEVELS.length-1;s.phase='done';}s.revision++;}
function update(s,id,v){
 const now=Date.now();
 if(now-(s.last[id]||0)<65)return false;
 const dx=Number(v.dx),dy=Number(v.dy);if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
 const mag=Math.hypot(dx,dy);if(mag<0.05||mag>1.2)return false;
 const current=s.positions[id];if(!current)return false;
 const dash=v.dash===true&&now-(s.dashes[id]||0)>2800;
 if(dash)s.dashes[id]=now;
 const step=dash?STEP*2.6:STEP;
 let next={x:clamp(current.x+dx/mag*step,33,WIDTH-33),y:clamp(current.y+dy/mag*step,36,HEIGHT-32)};
 for(const pin of LEVELS[s.level].pins){
  const d=near(next,pin),min=pin.r+24;
  if(d<min){const nx=d>0?(next.x-pin.x)/d:1,ny=d>0?(next.y-pin.y)/d:0;next={x:pin.x+nx*min,y:pin.y+ny*min};}
 }
 const index=s.players.findIndex(p=>p.id===id);
 for(const neighbor of [s.players[index-1],s.players[index+1]].filter(Boolean)){
  const other=s.positions[neighbor.id];if(!other)continue;
  const d=near(next,other);
  if(d>ROPE_LIMIT){next={x:other.x+(next.x-other.x)/d*ROPE_LIMIT,y:other.y+(next.y-other.y)/d*ROPE_LIMIT};}
 }
 next={x:clamp(next.x,33,WIDTH-33),y:clamp(next.y,36,HEIGHT-32)};
 if(near(next,current)<0.2)return false;
 s.positions[id]=next;s.last[id]=now;
 const path=ropeFor(s);
 LEVELS[s.level].rings.forEach((r,i)=>{
  if(s.lit.includes(i))return;
  for(let n=1;n<path.length;n++)if(distanceSegment(r,path[n-1],path[n])<32){s.lit.push(i);break;}
 });
 if(s.lit.length===LEVELS[s.level].rings.length&&s.players.some(p=>near(s.positions[p.id],LEVELS[s.level].exit)<55)){advance(s);}
 s.revision++;return true;
}
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,players:[player],phase:'lobby',level:0,lit:[],positions:positions([player]),last:{},dashes:{},revision:0}};},
 onJoin({state,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  state.players=players;state.positions=positions(players);state.revision++;
  return {state,events:events(state)};
 },
 onLeave({state,players}){
  state.players=players;state.host=players.some(p=>p.id===state.host)?state.host:(players[0]?.id||'');
  for(const id of Object.keys(state.positions))if(!players.some(p=>p.id===id)){delete state.positions[id];delete state.last[id];delete state.dashes[id];}
  if(players.length<2&&state.phase==='play')state.phase='lobby';
  state.revision++;return {state,events:events(state)};
 },
 onMessage({state,player,payload}){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(v.type==='sync')return {state,events:[{type:'state',to:player.id,payload:view(state)}]};
  if(v.type==='start'&&player.id===state.host&&(state.phase==='lobby'||state.phase==='done')){
   if(state.players.length<MIN_PLAYERS)return {state,events:notice(player.id,'Нужно минимум два игрока.')};
   reset(state);return {state,events:events(state)};
  }
  if(v.type==='move'&&state.phase==='play'&&update(state,player.id,v))return {state,events:events(state)};
  return {state,events:[]};
 }
};
export default module;
