// TRAFFICITY v1.6: deterministic, standalone tactical city engine.
// No time, browser globals, or network calls: the client and PocketNet share these rules.
export const TURN_LIMIT=30,COLS=5,ROWS=7,WIDTH=800,HEIGHT=1080;
export const SITES=['Рынок','Кофейня','Сквер','Вокзал','Пекарня','Мастерская','Театр','Причал'];
export const index=(r,c)=>r*COLS+c;
export const makeRandom=seed=>{let x=(seed>>>0)||0x9e3779b9;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};};
const all=n=>Array.from({length:n},(_,i)=>i);
const key=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createMap(seed){
 const rnd=makeRandom(seed),nodes=[],candidates=[],waterRow=3,bridges=[1,3];
 const sx=(WIDTH-154)/(COLS-1),sy=(HEIGHT-162)/(ROWS-1);
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)
  nodes.push({id:index(r,c),x:77+c*sx+(rnd()-.5)*45,y:81+r*sy+(rnd()-.5)*39});
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  if(c<COLS-1)candidates.push([index(r,c),index(r,c+1)]);
  if(r<ROWS-1&&(r!==waterRow||bridges.includes(c)))candidates.push([index(r,c),index(r+1,c)]);
 }
 // Carve neighborhoods while preserving full connectivity. The river can only be crossed on two bridges.
 const edges=candidates.slice(),arterial=new Set(),neighborsFrom=list=>{
 
  const graph=all(nodes.length).map(()=>[]);
  for(const [a,b] of list){graph[a].push(b);graph[b].push(a);}return graph;
 };
 // Continuous, readable arteries. Bridges are extensions of these avenues,
 // never isolated fragments sprinkled among abruptly changing street widths.
 for(const [a,b] of edges){
  const ra=Math.floor(a/COLS),rb=Math.floor(b/COLS),ca=a%COLS,cb=b%COLS;
  if((ca===cb&&(ca===1||ca===3))||(ra===rb&&(ra===1||ra===5)))
   arterial.add(key(a,b));
 }
 for(let i=edges.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[edges[i],edges[j]]=[edges[j],edges[i]];}
 for(let i=edges.length-1;i>=0;i--){
  const [a,b]=edges[i],ra=Math.floor(a/COLS),rb=Math.floor(b/COLS);
  if(arterial.has(key(a,b))||(ra!==rb&&ra===waterRow))continue;
  if(rnd()<.57)continue;
  const removed=edges.splice(i,1)[0],graph=neighborsFrom(edges),seen=new Set([0]),queue=[0];
  for(let k=0;k<queue.length;k++)for(const n of graph[queue[k]])if(!seen.has(n)){seen.add(n);queue.push(n);}
  if(seen.size!==nodes.length)edges.splice(i,0,removed);
 }
 edges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const graph=neighborsFrom(edges),roads={};
 for(const [a,b] of edges){
  const river=Math.min(Math.floor(a/COLS),Math.floor(b/COLS))===waterRow&&Math.max(Math.floor(a/COLS),Math.floor(b/COLS))===waterRow+1;
  roads[key(a,b)]={width:river||arterial.has(key(a,b))||rnd()<.12?'wide':'narrow',bridge:river};
 }
 const pool=all(nodes.length).filter(i=>i%COLS!==0&&i%COLS!==COLS-1&&Math.floor(i/COLS)!==0&&Math.floor(i/COLS)!==ROWS-1);
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const spots=pool.slice(0,8).map((node,i)=>({node,name:SITES[i]}));
 const districts=all((ROWS-1)*(COLS-1)).map(i=>({type:Math.floor(i/(COLS-1))<=1?'old':Math.floor(i/(COLS-1))<=3?'market':'industrial',
  park:rnd()<.15,landmark:rnd()<.1}));
 return {seed,width:WIDTH,height:HEIGHT,nodes,edges,graph,roads,spots,waterRow,bridges,districts};
}
export function shortestPath(map,from,to,weights=null){
 if(!Number.isInteger(from)||!Number.isInteger(to)||!map?.graph?.[from]||!map?.graph?.[to])return [];
 const cost=all(map.nodes.length).map(()=>Infinity),prev=all(map.nodes.length).map(()=>-1),used=new Set();cost[from]=0;
 for(let k=0;k<map.nodes.length;k++){
  let cur=-1;for(let i=0;i<cost.length;i++)if(!used.has(i)&&(cur<0||cost[i]<cost[cur]))cur=i;
  if(cur===-1||cost[cur]===Infinity||cur===to)break;used.add(cur);
  for(const next of map.graph[cur]){
   const weight=weights?weights(cur,next):1;
   if(!Number.isFinite(weight)||weight<=0)continue;
   if(cost[next]>cost[cur]+weight){cost[next]=cost[cur]+weight;prev[next]=cur;}
  }
 }
 if(from===to)return[from];
 if(prev[to]<0)return [];
 const route=[to];while(route[0]!==from)route.unshift(prev[route[0]]);
 return route;
}
function chooseGoal(g,from,avoid){
 const rnd=makeRandom((g.seed^(g.goalCounter++*2654435761))>>>0);
 const available=g.map.spots.filter(x=>x.node!==avoid&&x.node!==from&&shortestPath(g.map,from,x.node).length>=3);
 const candidates=available.length?available:g.map.spots.filter(x=>x.node!==from);
 return candidates[Math.floor(rnd()*candidates.length)].node;
}
const categories=['rush','freight','regular'];
function spawnOffer(g,slot){
 const rnd=makeRandom((g.seed^Math.imul(++g.offerCounter,0x9e3779b9)^(slot*473))>>>0);
 let choices=g.map.spots.filter(p=>!g.offers.some(o=>o.node===p.node));
 if(!choices.length)choices=g.map.spots;
 const site=choices[Math.floor(rnd()*choices.length)],type=categories[Math.floor(rnd()*categories.length)];
 const reward=type==='rush'?54:type==='freight'?43:32;
 const ttl=type==='rush'?9:type==='freight'?14:12;
 return{id:g.offerCounter,node:site.node,type,reward,ttl};
}
export function createGame(seed=123456789,difficulty='standard'){
 const s=(Number(seed)>>>0)||123456789,map=createMap(s),g={
  rulesVersion:3,seed:s,map,goalCounter:1,offerCounter:0,turn:0,limit:TURN_LIMIT,phase:'playing',
  difficulty:['casual','standard','expert'].includes(difficulty)?difficulty:'standard',
  scores:[0,0],deliveries:[0,0],last:[],offers:[],vehicles:[],traffic:[0,0]
 };
 const starts=[index(0,0),index(ROWS-1,COLS-1),index(0,COLS-1),index(ROWS-1,0)];
 for(let side=0;side<2;side++)for(let unit=0;unit<2;unit++){
  const at=starts[side*2+unit];
  g.vehicles.push({id:side*2+unit,side,unit:unit+1,at,goal:chooseGoal(g,at,-1),
   route:[],steps:0,waiting:0,parked:false,stop:null,delivered:0,blocked:0,navigation:'manual',target:null});
 }
 for(let slot=0;slot<2;slot++)g.offers.push(spawnOffer(g,slot));
 return g;
}
export function routeVehicle(g,side,id,path){
 if(g?.phase!=='playing')return false;
 const v=g.vehicles?.[id];if(!v||v.side!==side||!Array.isArray(path)||path.length>34)return false;
 let prev=v.at;for(const n of path){if(!Number.isInteger(n)||!g.map.graph[prev]?.includes(n))return false;prev=n;}
 v.route=path.slice();v.navigation='manual';v.target=null;if(v.stop&&v.stop.node!==v.at&&!v.route.includes(v.stop.node))v.stop=null;return true;
}
export function stopVehicle(g,side,id,node,amount){
 if(g?.phase!=='playing')return false;
 const v=g.vehicles?.[id];if(!v||v.side!==side)return false;
 if(node===null){v.stop=null;return true;}
 if(!Number.isInteger(node)||!Number.isInteger(amount)||amount<1||amount>5)return false;
 if(node!==v.at&&!v.route.includes(node))return false;
 v.stop={node,amount};return true;
}
export function roadWidth(map,a,b){return map.roads?.[key(a,b)]?.width||'narrow';}
// A time-aware approximation of the next turn: occupied junctions, opposing lanes,
// bridges and announced moves cost more than free streets. We still allow a wait
// if every approach is blocked. Deterministic ties are resolved by graph order.
export function weightedPath(g,vehicle,target){
 const others=g.vehicles.filter(v=>v.id!==vehicle.id);
 const blockedFirst=vehicle.blocked>=1;
 return shortestPath(g.map,vehicle.at,target,(a,b)=>{
  const wide=roadWidth(g.map,a,b)==='wide';
  let cost=wide?1:1.16;
  const occupied=others.filter(v=>v.at===b&&!v.parked);
  if(occupied.length){
   cost+=wide?2.5:4.2;
   if(occupied.some(v=>v.route?.[0]===a&&!wide))cost+=10;
   if(occupied.some(v=>!v.route?.length))cost+=13;
   if(blockedFirst&&a===vehicle.at)cost+=7;
  }
  if(others.some(v=>v.route?.[0]===b))cost+=2.1;
  if(g.map.roads?.[key(a,b)]?.bridge&&others.some(v=>v.at===b||v.route?.[0]===b))cost+=3.5;
  // Prefer not to make immediate U-turns after losing a merge conflict.
  if(a===vehicle.at&&vehicle.blocked>0&&vehicle.route?.[0]===b)cost+=3.2;
  return cost;
 });
}
function assignRoute(g,side,id,target,kind,offerId=null){
 const v=g?.vehicles?.[id];
 if(!v||v.side!==side||g.phase!=='playing')return false;
 const path=weightedPath(g,v,target).slice(1);
 if(!path.length&&v.at!==target)return false;
 if(!routeVehicle(g,side,id,path))return false;
 v.navigation='adaptive';
 v.target={kind,node:target,id:offerId};
 return true;
}
export function autoRoute(g,side,id){
 const v=g?.vehicles?.[id];
 return !!v&&v.side===side&&assignRoute(g,side,id,v.goal,'personal');
}
export function offerRoute(g,side,id,offerId){
 const offer=g?.offers?.find(o=>o.id===offerId),v=g?.vehicles?.[id];
 return !!offer&&!!v&&v.side===side&&assignRoute(g,side,id,offer.node,'offer',offer.id);
}
function targetFor(g,v){
 if(v.target?.kind==='offer'){
  const offer=g.offers.find(o=>o.id===v.target.id);
  if(offer)return offer.node;
 }
 return v.goal;
}
export function replanAdaptive(g,v,force=false){
 if(v.navigation!=='adaptive'||g.phase!=='playing')return false;
 const target=targetFor(g,v);
 if(!g.offers.some(o=>o.id===v.target?.id)&&v.target?.kind==='offer')
  v.target={kind:'personal',node:v.goal,id:null};
 const routeEnd=v.route?.at(-1);
 const stuck=v.blocked>=1;
 const next=v.route?.[0];
 // Replan only when the street ahead is at risk, the assignment changed,
 // or a traffic jam already caused a delay. Preserve user-drawn manual paths.
 const hazard=next!==undefined&&g.vehicles.some(o=>o.id!==v.id&&!o.parked&&o.at===next);
 if(!force&&!stuck&&!hazard&&routeEnd===target)return false;
 const candidate=weightedPath(g,v,target).slice(1);
 if(!candidate.length&&v.at!==target)return false;
 if(!force&&candidate.join(',')===v.route.join(','))return false;
 v.route=candidate;
 return true;
}
export function botPlan(g){
 if(g.phase!=='playing')return;
 const bots=g.vehicles.filter(v=>v.side===1);
 const reserved=new Set();
 for(const v of bots){
  if(v.waiting>0||v.stop)continue;
  if(g.difficulty==='casual'){if(!v.route.length)autoRoute(g,1,v.id);continue;}
  const destination=targetFor(g,v);
  const currentValid=!!v.route.length&&v.route.at(-1)===destination&&v.blocked===0;
  const personal=weightedPath(g,v,v.goal),dist=Math.max(1,personal.length-1);
  const personalRate=Math.max(10,40-2*(v.steps+dist))/(dist+1);
  let selected={kind:'personal',node:v.goal,id:null,rate:personalRate};
  if(g.difficulty==='expert'){
   for(const offer of g.offers){
    if(reserved.has(offer.id))continue;
    const route=weightedPath(g,v,offer.node),distance=route.length-1;
    if(distance<0||distance>=offer.ttl)continue;
    const opponentEta=Math.min(...g.vehicles.filter(x=>x.side===0).map(x=>shortestPath(g.map,x.at,offer.node).length-1));
    const feasible=distance<=opponentEta+1;
    const rate=offer.reward/(distance+1)*(feasible?1.1:.40);
    if(rate>selected.rate*1.30)selected={kind:'offer',node:offer.node,id:offer.id,rate};
   }
  }
  // Honour a live assignment rather than oscillating between offers every tick.
  if(v.navigation==='adaptive'&&v.target?.kind==='offer'&&g.offers.some(o=>o.id===v.target.id)&&v.blocked===0){
   const kept=g.offers.find(o=>o.id===v.target.id);
   if(kept&&!reserved.has(kept.id)&&weightedPath(g,v,kept.node).length-1<kept.ttl)selected={kind:'offer',node:kept.node,id:kept.id,rate:Infinity};
  }
  if(selected.kind==='offer')reserved.add(selected.id);
  if(!currentValid||v.target?.kind!==selected.kind||v.target?.id!==selected.id||v.blocked>=1)
   assignRoute(g,1,v.id,selected.node,selected.kind,selected.id);
  else replanAdaptive(g,v);
 }
}
const priority=(g,v)=>(v.side*2+v.unit+g.turn+(g.seed&3))%4;
export function advanceGame(g){
 if(g?.phase!=='playing')return false;
 // Routes tagged adaptive re-evaluate the *next* movement without overriding
 // manually prepared turns. This is authoritative on the server, not only the AI.
 for(const v of g.vehicles)replanAdaptive(g,v);
 const events=[],before=g.vehicles.map(v=>v.at),intents=new Map();
 const passing=new Set();
 for(const v of g.vehicles){
  v.parked=!v.route.length;
  if(v.waiting>0){v.waiting--;v.parked=true;continue;}
  if(v.stop?.node===v.at){v.waiting=v.stop.amount-1;v.stop=null;v.parked=true;events.push({type:'stop',side:v.side,unit:v.unit,node:v.at});continue;}
  if(v.route.length&&g.map.graph[v.at]?.includes(v.route[0]))intents.set(v.id,v.route[0]);
  else if(v.route.length)v.route=[];
 }
 // The same intersection only admits one vehicle this turn; first initiative rotates.
 const targetGroups=new Map();
 for(const [id,target] of intents){const list=targetGroups.get(target)||[];list.push(id);targetGroups.set(target,list);}
 for(const ids of targetGroups.values())if(ids.length>1){
  ids.sort((a,b)=>priority(g,g.vehicles[a])-priority(g,g.vehicles[b]));
  for(const id of ids.slice(1))intents.delete(id);
 }
 // Single-lane head-on: let each driver try a detour first. If neither can
 // clear the street for two turns, resolve a slow pull-out maneuver atomically.
 // This guarantees progress in corridor bottlenecks instead of eternal gridlock.
 for(const [id,target] of [...intents]){
  const opposite=[...intents].find(([other,to])=>other!==id&&to===g.vehicles[id].at&&g.vehicles[other].at===target);
  if(!opposite||!intents.has(id)||!intents.has(opposite[0]))continue;
  if(roadWidth(g.map,g.vehicles[id].at,target)!=='narrow')continue;
  const otherId=opposite[0];
  if(g.vehicles[id].blocked>=2&&g.vehicles[otherId].blocked>=2){
   passing.add(id);passing.add(otherId);
   events.push({type:'yield',side:g.vehicles[id].side,unit:g.vehicles[id].unit,node:target,peer:otherId});
  }else{intents.delete(id);intents.delete(otherId);}
 }
 // Eliminate proposed moves into nodes occupied by cars unable to move away.
 let changed=true;
 while(changed){
  changed=false;
  for(const [id,target] of [...intents]){
   const blocked=g.vehicles.some(v=>v.id!==id&&v.at===target&&!v.parked&&!intents.has(v.id));
   if(blocked){intents.delete(id);changed=true;}
  }
 }
 for(const v of g.vehicles){
  const next=intents.get(v.id);
  if(next===undefined){
   if(v.route.length&&!v.parked){
    v.blocked++;g.traffic[v.side]++;events.push({type:'jam',side:v.side,unit:v.unit,node:v.at});
   }continue;
  }
  v.at=next;v.route.shift();v.steps++;v.blocked=0;
  if(passing.has(v.id))v.waiting=1;
 }
 // Arrival order is deterministic; contested offers go to the first car by initiative.
 for(const v of g.vehicles.slice().sort((a,b)=>priority(g,a)-priority(g,b))){
  const idx=g.offers.findIndex(o=>o.node===v.at&&before[v.id]!==v.at);
  if(idx>=0){
   const offer=g.offers[idx];g.scores[v.side]+=offer.reward;
   events.push({type:'offer',side:v.side,unit:v.unit,points:offer.reward,node:v.at,kind:offer.type});
   g.offers.splice(idx,1);g.offers.push(spawnOffer(g,idx));
  }
  if(v.at===v.goal&&before[v.id]!==v.at){
   const gained=Math.max(10,40-2*v.steps);g.scores[v.side]+=gained;g.deliveries[v.side]++;
   events.push({type:'delivery',side:v.side,unit:v.unit,points:gained,node:v.at});
   v.delivered++;v.steps=0;v.waiting=0;v.parked=false;v.stop=null;v.route=[];v.target=null;
   v.goal=chooseGoal(g,v.at,v.goal);
  }
 }
 g.turn++;
 for(let i=0;i<g.offers.length;i++){
  if(--g.offers[i].ttl<=0){events.push({type:'expired',node:g.offers[i].node});g.offers.splice(i,1);g.offers.push(spawnOffer(g,i));i--;}
 }
 g.last=events.slice(-10);if(g.turn>=g.limit)g.phase='finished';return true;
}
export function winner(g){return Number.isInteger(g.winnerOverride)?g.winnerOverride:g.scores[0]===g.scores[1]?-1:g.scores[0]>g.scores[1]?0:1;}

// PocketNet v3: immutable rules, private projections, rejoining seats and idle adjudication.
const broadcast=()=>[{type:'state'}],notice=(id,message)=>[{type:'notice',to:id,payload:message}];
const sideFor=(s,p)=>s.seats.findIndex(id=>id===p.id);
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,seats:[player.id],players:[player],game:null,ready:[false,false],
  revision:0,lastAction:[Date.now(),Date.now()],missing:[0,0]}};},
 onJoin({state,player,players}){
  const current=sideFor(state,player);
  if(state.phase!=='lobby'&&current<0)throw Error('match_in_progress');
  if(current<0){if(state.seats.length>=2)throw Error('room_full');state.seats.push(player.id);}
  state.players=state.seats.map(id=>players.find(p=>p.id===id)||state.players.find(p=>p.id===id)).filter(Boolean);
  if(current>=0)state.missing[current]=0;
  state.revision++;return {state,events:broadcast()};
 },
 onLeave({state,player,players}){
  const side=sideFor(state,player);
  if(state.phase==='lobby'){
   state.seats=state.seats.filter(x=>x!==player.id);state.players=players;
   if(state.host===player.id)state.host=players[0]?.id||'';
  }else if(side>=0){state.missing[side]=Date.now();}
  state.revision++;return {state,events:broadcast()};
 },
 viewForPlayer({state,player}){
  const side=sideFor(state,player);
  if(side<0)return {phase:state.phase,players:state.players,revision:state.revision};
  const view={...state,players:state.players.map(p=>({id:p.id,name:p.name})),game:state.game?{...state.game,vehicles:state.game.vehicles.map(v=>(
   state.phase==='playing'&&v.side!==side?{...v,route:[],stop:null,goal:-1,waiting:0,navigation:'manual',target:null}: {...v,route:v.route.slice()}
  ))}:null};
  return view;
 },
 onMessage({state,player,payload}){
  const side=sideFor(state,player);if(side<0)return {state,events:[]};
  const cmd=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(cmd.type==='sync')return {state,events:[{type:'state',to:player.id}]};
  const now=Date.now();
  if(cmd.type==='start'||cmd.type==='again'){
   if(state.host!==player.id||state.seats.length!==2||(cmd.type==='start'&&state.phase!=='lobby')||(cmd.type==='again'&&state.phase!=='finished'))
    return {state,events:notice(player.id,'Нужны оба игрока и действие хозяина.')};
   state.game=createGame((now^Math.floor(Math.random()*0xffffffff))>>>0,'expert');
   state.phase='playing';state.ready=[false,false];state.lastAction=[now,now];state.missing=[0,0];state.revision++;
   return {state,events:broadcast()};
  }
  if(state.phase!=='playing'||state.game?.phase!=='playing')return {state,events:[]};
  if(cmd.type==='forfeit'){
   const other=1-side;
   if(now-state.lastAction[other]<180000)return {state,events:notice(player.id,'Сопернику ещё доступно время на ход.')};
   state.game.winnerOverride=side;state.game.phase='finished';state.phase='finished';state.revision++;
   return {state,events:broadcast()};
  }
  if(cmd.type==='route'||cmd.type==='stop'||cmd.type==='auto'||cmd.type==='offer'){
   if(state.ready[side])return {state,events:notice(player.id,'Сначала отмените готовность.')};
   const id=cmd.vehicle;if(!Number.isInteger(id)||id<0||id>3)return {state,events:[]};
   const ok=cmd.type==='route'?routeVehicle(state.game,side,id,cmd.route):
    cmd.type==='auto'?autoRoute(state.game,side,id):
    cmd.type==='offer'?offerRoute(state.game,side,id,cmd.offer):
    stopVehicle(state.game,side,id,cmd.node,cmd.amount);
   if(!ok)return {state,events:notice(player.id,'Маршрут или остановка недоступны.')};
   state.lastAction[side]=now;state.revision++;return {state,events:broadcast()};
  }
  if(cmd.type==='ready'){
   state.ready[side]=cmd.ready===true;state.lastAction[side]=now;
   if(state.ready.every(Boolean)){
    advanceGame(state.game);state.ready=[false,false];state.lastAction=[now,now];
    if(state.game.phase==='finished')state.phase='finished';
   }
   state.revision++;return {state,events:broadcast()};
  }
  return {state,events:[]};
 }
};
export default module;
