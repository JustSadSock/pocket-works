// ОСИ: Склад — deterministic puzzle rules, generator and shortest-path solver.
// Original axis split preserved: player 1 owns Y, player 2 owns X.
const DIRECTIONS=['up','down','left','right'];
const CAMPAIGN_NAMES=['Синхронный старт','Связанные оси','Переплетение','Зеркальные шаги','Перекрёстные тропы','Разгрузка','Тесный проход','Ложный поворот','Сортировка','Смена маршрута','Двойной замок','Последняя партия'];
function axisOf(dir){return dir==='up'||dir==='down'?'y':dir==='left'||dir==='right'?'x':null}
function step(level,positions,dir){
 const axis=axisOf(dir);if(!axis)return {positions,moved:false,blocked:[false,false]};
 const dx=dir==='left'?-1:dir==='right'?1:0,dy=dir==='up'?-1:dir==='down'?1:0;
 const next=positions.map(p=>({...p}));const blocked=[];
 for(let i=0;i<2;i++){const nx=next[i].x+dx,ny=next[i].y+dy;
  const hit=nx<0||ny<0||nx>=level.width||ny>=level.height||level.map[ny][nx]==='#';
  blocked.push(hit);if(!hit){next[i].x=nx;next[i].y=ny}
 }
 return {positions:next,moved:blocked.some(x=>!x),blocked};
}
function solved(level,p){return p[0].x===level.goals[0].x&&p[0].y===level.goals[0].y&&p[1].x===level.goals[1].x&&p[1].y===level.goals[1].y}
function solve(level,from=level.starts){
 const encode=p=>(p[0].y*level.width+p[0].x)*(level.width*level.height)+(p[1].y*level.width+p[1].x);
 const start=from.map(p=>({...p}));if(solved(level,start))return {steps:0,path:[],explored:1};
 const queue=[start],parents=new Map([[encode(start),null]]),moves=new Map();let head=0;
 while(head<queue.length&&head<35000){
  const state=queue[head++];
  for(const direction of DIRECTIONS){
   const change=step(level,state,direction);if(!change.moved)continue;
   const key=encode(change.positions);if(parents.has(key))continue;
   const previous=encode(state);parents.set(key,previous);moves.set(key,direction);
   if(solved(level,change.positions)){
    const path=[];let cursor=key;while(parents.get(cursor)!==null){path.push(moves.get(cursor));cursor=parents.get(cursor)}
    path.reverse();return {steps:path.length,path,explored:head};
   }
   queue.push(change.positions);
  }
 }
 return null;
}
function limits(optimal){return {easy:optimal+Math.max(6,Math.ceil(optimal*.7)),medium:optimal+Math.max(3,Math.ceil(optimal*.35)),hard:optimal+1}}
function rng(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
const rand=(r,max)=>Math.floor(r()*max);
function generateOnce(seed,tier,attempt){
 const r=rng((seed+Math.imul(attempt+1,0x9e3779b1))>>>0);
 const width=Math.min(10,7+Math.floor(tier/4)),height=Math.min(9,7+Math.floor(tier/7));
 const cells=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'#':' '));
 const density=.065+Math.min(.13,tier*.009);
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(r()<density)cells[y][x]='#';
 const free=[];for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(cells[y][x]===' ')free.push({x,y});
 if(free.length<6)return null;
 const a=free[rand(r,free.length)],b=free.filter(p=>p.x!==a.x||p.y!==a.y);
 const start=[{...a},{...b[rand(r,b.length)]}],level={width,height,map:cells.map(row=>row.join('')),starts:start,goals:[],seed};
 let state=start.map(p=>({...p})),last='';
 for(let i=0;i<17+Math.min(16,tier*2);i++){
  const possible=DIRECTIONS.map(dir=>({dir,result:step(level,state,dir)})).filter(x=>x.result.moved&&x.dir!==({up:'down',down:'up',left:'right',right:'left'}[last]));
  if(!possible.length)break;const chosen=possible[rand(r,possible.length)];state=chosen.result.positions;last=chosen.dir;
 }
 if(state[0].x===state[1].x&&state[0].y===state[1].y)return null;
 level.goals=state;const answer=solve(level);
 if(!answer||answer.steps<Math.min(5,3+Math.floor(tier/2))||answer.steps>55)return null;
 level.optimal=answer.steps;level.moveLimits=limits(answer.steps);
 return level;
}
function generate(seed,tier=0){
 for(let attempt=0;attempt<100;attempt++){const level=generateOnce(seed,tier,attempt);if(level)return level}
 const level={width:7,height:7,map:['#######','#     #','#  #  #','#     #','#  #  #','#     #','#######'],
 starts:[{x:1,y:5},{x:5,y:5}],goals:[{x:1,y:1},{x:5,y:1}],seed};
 const result=solve(level);level.optimal=result?.steps||4;level.moveLimits=limits(level.optimal);return level;
}
function campaign(index){const i=Math.max(0,Math.min(CAMPAIGN_NAMES.length-1,index|0));return {...generate(41717+i*7919,i),name:CAMPAIGN_NAMES[i],index:i}}
function endless(index){const i=Math.max(1,index|0);return {...generate(912371+i*17389,Math.min(15,i+2)),name:'Смена '+String(i).padStart(2,'0'),index:i}}

// PocketNet authoritative session. No trust in client-owned coordinates or victory.
export const MIN_PLAYERS=2;
export const MAX_PLAYERS=2;
const events=s=>[{type:'state',payload:snapshot(s)}];
const notice=(to,message)=>[{type:'notice',to,payload:message}];
function snapshot(s){return {phase:s.phase,host:s.host,players:s.players,roles:s.roles,kind:s.kind,index:s.index,difficulty:s.difficulty,
 level:s.level,positions:s.positions,steps:s.steps,revision:s.revision,completed:s.completed}}
function reset(s){
 s.level=s.kind==='endless'?endless(s.index):campaign(s.index);
 s.positions=s.level.starts.map(p=>({...p}));s.steps=0;s.completed=false;s.phase='play';s.lastMove=0;s.revision++;
}
function message(s,player,payload){
 const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
 const id=player.id,isHost=id===s.host;
 if(v.type==='sync')return [{type:'state',to:id,payload:snapshot(s)}];
 if(v.type==='difficulty'&&isHost&&['easy','medium','hard'].includes(v.value)&&s.phase!=='play'){
  s.difficulty=v.value;s.revision++;return events(s);
 }
 if(v.type==='kind'&&isHost&&['campaign','endless'].includes(v.value)&&s.phase==='lobby'){
  s.kind=v.value;s.index=v.value==='endless'?1:0;s.revision++;return events(s);
 }
 if(v.type==='start'&&isHost&&(s.phase==='lobby'||s.phase==='complete')){
  if(s.players.length!==2)return notice(id,'Нужны два игрока');
  s.index=s.kind==='endless'?1:0;s.roles=s.players.map(p=>p.id);reset(s);return events(s);
 }
 if(v.type==='restart'&&isHost&&['play','won'].includes(s.phase)){reset(s);return events(s)}
 if(v.type==='next'&&isHost&&s.phase==='won'){
  if(s.kind==='campaign'&&s.index===CAMPAIGN_NAMES.length-1){s.phase='complete';s.revision++;return events(s)}
  s.index++;reset(s);return events(s);
 }
 if(v.type==='hint'&&['play','won'].includes(s.phase)){
  const solution=solve(s.level,s.positions);
  const next=solution?.path?.[0];return notice(id,next?('Подсказка: '+({up:'↑',down:'↓',left:'←',right:'→'}[next])):'Путь не найден');
 }
 if(v.type==='move'&&s.phase==='play'){
  const dir=String(v.direction||'');
  const role=s.roles.indexOf(id);
  if(role<0||!(role===0?['up','down']:['left','right']).includes(dir))return [];
  const now=Date.now();if(now-s.lastMove<55)return [];
  const change=step(s.level,s.positions,dir);
  s.lastMove=now;if(!change.moved)return notice(id,'Оба пути перекрыты');
  s.positions=change.positions;s.steps++;s.revision++;
  if(solved(s.level,s.positions)){s.phase='won';s.completed=true}
  else if(s.steps>=s.level.moveLimits[s.difficulty]){s.phase='lost'}
  return events(s);
 }
 if(v.type==='restart'&&isHost&&s.phase==='lost'){reset(s);return events(s)}
 return [];
}
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,players:[player],roles:[],kind:'campaign',index:0,difficulty:'medium',level:null,positions:[],steps:0,completed:false,revision:0,lastMove:0}}},
 onJoin({state,players}){
  if(players.length>2)throw Error('room_full');
  if(state.phase!=='lobby'&&state.phase!=='complete')throw Error('match_in_progress');
  state.players=players;state.revision++;return {state,events:events(state)};
 },
 onLeave({state,players}){
  state.players=players;state.host=players.some(p=>p.id===state.host)?state.host:players[0]?.id||'';
  state.phase='lobby';state.roles=[];state.level=null;state.positions=[];state.steps=0;state.revision++;
  return {state,events:events(state)};
 },
 onMessage({state,player,payload}){
  if(!state.players.some(p=>p.id===player.id))return {state,events:[]};
  return {state,events:message(state,player,payload)};
 }
};
export default module;
