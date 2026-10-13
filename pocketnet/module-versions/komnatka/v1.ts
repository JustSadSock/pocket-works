// PocketNet / КОМНАТКА. All goals, edits and scoring are validated on the server.
// The memory answer is omitted from building-phase messages, not merely hidden in CSS.
export const MIN_PLAYERS=2;
export const MAX_PLAYERS=5;
export const RULESET_VERSION=1;
const ROOM=3.77;
const FOOT={
 sofa:[2.55,1.26],chair:[1.18,1.18],coffee:[1.58,1.08],shelf:[1.75,.72],bed:[2.3,2.7],
 stool:[.72,.72],floorlamp:[.92,.92],tablelamp:[.55,.55],plant:[.96,.96],
 rug:[2.95,2.12],books:[.52,.36],mug:[.30,.30],frame:[1.37,.1],window:[1.94,.1]
};
const TOP={coffee:.72,shelf:1.02,stool:.52};
const WALL=new Set(['frame','window']),SMALL=new Set(['tablelamp','books','mug']);
const COLORS=['#e8a58f','#d6bd80','#8eae99','#8baab8','#bc9bb5','#e8d8bf','#a58f77','#d2a993'];
const TASKS=[
 {title:'Тёплый вечер',text:'Обустрой уголок для тихих вечеров.',goals:[['sofa',1,'Мягкое место'],['rug',1,'Уютный ковёр'],['floorlamp',1,'Тёплый свет'],['mug',1,'Чашка на столе']]},
 {title:'Зелёная гостиная',text:'Новый жилец любит растения и книги.',goals:[['plant',2,'Два растения'],['chair',1,'Кресло для чтения'],['books',1,'Книги на мебели'],['frame',1,'Картина на стене']]},
 {title:'Первая квартира',text:'Каждой вещи — своё место.',goals:[['bed',1,'Удобная кровать'],['shelf',1,'Комод'],['tablelamp',1,'Лампа на столе'],['rug',1,'Ковёр под ногами']]},
 {title:'Дом для друзей',text:'Собери комнату, где всем будет удобно.',goals:[['sofa',1,'Диван'],['chair',1,'Кресло'],['coffee',1,'Столик'],['plant',1,'Живое растение']]}
];
const TEMPLATES=[
 [
  {type:'rug',x:0,z:.75},{type:'sofa',x:0,z:-2.25,color:'#8eae99'},
  {type:'coffee',x:0,z:-.50},{type:'books',x:-.25,z:-.5,supportIndex:2},
  {type:'mug',x:.50,z:-.5,supportIndex:2,color:'#e8a58f'},
  {type:'chair',x:2.25,z:-.75,color:'#d6bd80'},
  {type:'floorlamp',x:2.75,z:-2.50},{type:'plant',x:-2.75,z:-2.5},
  {type:'frame',x:.25,z:-3.91,y:2.50,wall:'back'}
 ],
 [
  {type:'bed',x:-.75,z:-1.50,color:'#bc9bb5'},
  {type:'shelf',x:2.25,z:-2.75},
  {type:'rug',x:.25,z:1.50,color:'#d6bd80'},
  {type:'tablelamp',x:2.0,z:-2.75,supportIndex:1},
  {type:'books',x:2.50,z:-2.75,supportIndex:1},
  {type:'stool',x:2.75,z:.75},{type:'plant',x:-2.75,z:1.50},
  {type:'frame',x:1.0,z:-3.91,y:2.50,wall:'back'}
 ],
 [
  {type:'sofa',x:-1.25,z:-2.30,color:'#d2a993'},
  {type:'chair',x:2.60,z:-1.50,color:'#8baab8'},
  {type:'rug',x:.50,z:.75,color:'#bc9bb5'},
  {type:'coffee',x:.25,z:-.25},
  {type:'mug',x:.75,z:-.25,supportIndex:3},
  {type:'floorlamp',x:-2.75,z:1.25},
  {type:'plant',x:2.75,z:2.25},
  {type:'window',x:-3.91,z:1.0,y:2.5,wall:'left'}
 ]
];
const now=()=>Date.now();
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const n=v=>typeof v==='number'&&Number.isFinite(v);
const nearest=v=>Math.round(v*4)/4;
const size=item=>item.rot%2?[FOOT[item.type][1],FOOT[item.type][0]]:FOOT[item.type];
const isFloor=item=>!WALL.has(item.type)&&item.type!=='rug'&&!SMALL.has(item.type);
const announce=(s,to)=>[{type:'state',...(to?{to}:{}),payload:view(s)}];
const notice=(id,message)=>[{type:'notice',to:id,payload:message}];
function clean(raw,id){
 if(!raw||typeof raw!=='object'||!FOOT[raw.type]||!n(raw.x)||!n(raw.z))return null;
 const type=raw.type,wall=raw.wall==='left'?'left':'back';
 const rot=WALL.has(type)?(wall==='left'?1:0):limit(Math.floor(Number(raw.rot)||0),0,3);
 const x=WALL.has(type)&&wall==='left'?-3.91:nearest(raw.x),z=WALL.has(type)&&wall==='back'?-3.91:nearest(raw.z);
 const color=typeof raw.color==='string'&&/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:COLORS[2];
 return {id,type,x,z,rot,wall,color,y:WALL.has(type)?nearest(limit(n(raw.y)?raw.y:2.5,1,3.2)):0,
  variant:limit(Math.floor(Number(raw.variant)||0),0,2),support:SMALL.has(type)?String(raw.support||'').slice(0,80):null};
}
function valid(s,item,exclude=item.id){
 const m=FOOT[item.type];if(!m)return false;
 if(WALL.has(item.type)){
  const coord=item.wall==='left'?item.z:item.x;
  if(Math.abs(coord)>ROOM-m[0]/2||item.y<1||item.y>3.2)return false;
  return s.items.every(other=>other.id===exclude||!WALL.has(other.type)||other.wall!==item.wall||
   Math.abs(coord-(item.wall==='left'?other.z:other.x))>(m[0]+FOOT[other.type][0])/2+.05||Math.abs(item.y-other.y)>1.65);
 }
 const [w,d]=size(item);
 if(Math.abs(item.x)+w/2>ROOM||Math.abs(item.z)+d/2>ROOM)return false;
 if(SMALL.has(item.type)){
  const host=s.items.find(i=>i.id===item.support);
  if(!host||!TOP[host.type])return false;
  const [hw,hd]=size(host);
  if(Math.abs(item.x-host.x)>(hw-w)/2-.005||Math.abs(item.z-host.z)>(hd-d)/2-.005)return false;
  return s.items.every(o=>o.id===exclude||o.support!==item.support||
   Math.abs(item.x-o.x)>=(w+size(o)[0])/2-.025||Math.abs(item.z-o.z)>=(d+size(o)[1])/2-.025);
 }
 if(item.type==='rug')return true;
 return s.items.every(o=>o.id===exclude||!isFloor(o)||
  Math.abs(item.x-o.x)>=(w+size(o)[0])/2+.08||Math.abs(item.z-o.z)>=(d+size(o)[1])/2+.08);
}
function targetScene(index){
 const items=TEMPLATES[index%TEMPLATES.length].map((def,i)=>{
  const item=clean({...def,rot:def.wall==='left'?1:0},'reference-'+i);
  if(item&&def.supportIndex!==undefined){
   item.support='reference-'+def.supportIndex;
   item.y=TOP[TEMPLATES[index%TEMPLATES.length][def.supportIndex].type]||0;
  }
  return item;
 }).filter(Boolean);
 return items;
}
function brief(s){
 if(s.mode!=='tenants')return [];
 const template=TASKS[s.template%TASKS.length];
 return template.goals.map(([type,required,label])=>{
  const found=s.items.filter(i=>i.type===type&&(SMALL.has(type)?!!i.support:true)).length;
  return {type,label,required,found,done:found>=required};
 });
}
function scoreMemory(s){
 const reference=s.target||[],choices=[...s.items],used=new Set();
 let points=0;
 for(const expected of reference){
  let best=-1,bestScore=0;
  choices.forEach((candidate,index)=>{
   if(used.has(index)||candidate.type!==expected.type)return;
   const dist=Math.hypot(expected.x-candidate.x,expected.z-candidate.z);
   const pos=limit(1-dist/2.3,0,1);
   const turn=candidate.rot===expected.rot?1:.35;
   const shade=candidate.color===expected.color?1:.6;
   const calc=pos*.7+turn*.2+shade*.1;
   if(calc>bestScore){best=index;bestScore=calc;}
  });
  if(best>=0){used.add(best);points+=bestScore;}
 }
 return Math.round(100*points/Math.max(1,reference.length));
}
function view(s){
 const safe={phase:s.phase,host:s.host,players:s.players,mode:s.mode,template:s.template,round:s.round,
  brief:s.mode==='tenants'?TASKS[s.template%TASKS.length]:null,goals:brief(s),deadline:s.deadline,
  started:s.started,items:s.items,finishes:s.finishes,selections:s.selections,score:s.score,revision:s.revision,
  completed:s.completed};
 if(s.mode==='memory'&&(s.phase==='preview'||s.phase==='result'))safe.target=s.target;
 return safe;
}
function advance(s){
 const t=now();
 if(s.phase==='preview'&&t>=s.deadline){s.phase='build';s.deadline=t+155000;s.items=[];s.selections={};s.revision++;}
 else if(s.phase==='build'&&t>=s.deadline)finish(s);
}
function finish(s){
 s.phase='result';s.completed=now();s.deadline=0;
 s.score=s.mode==='memory'?scoreMemory(s):Math.round(100*brief(s).filter(g=>g.done).length/4);
 s.selections={};s.revision++;
}
function update(s,raw,player){
 if(s.phase!=='build')return {state:s,events:notice(player.id,'Сначала дождитесь начала обустройства.')};
 const act=String(raw.type||''),id=String(raw.id||'').slice(0,80);
 const selected=s.selections||{};
 const current=s.items.find(i=>i.id===id);
 if(act==='add'){
  if(s.items.length>=64)return {state:s,events:notice(player.id,'Комната заполнена.')};
  const item=clean(raw.item,'room-'+(++s.serial));
  if(!item)return {state:s,events:notice(player.id,'Не удалось поставить предмет.')};
  if(SMALL.has(item.type)){
   const host=s.items.find(i=>i.id===item.support);
   item.y=host?TOP[host.type]||0:0;
  }
  if(!valid(s,item))return {state:s,events:notice(player.id,'Здесь нет свободного места.')};
  s.items.push(item);s.revision++;
  return {state:s,events:announce(s)};
 }
 if(!current)return {state:s,events:notice(player.id,'Предмет уже убран.')};
 if(Object.entries(selected).some(([who,mark])=>who!==player.id&&mark?.id===id&&now()-mark.time<7000))
  return {state:s,events:notice(player.id,'Друг уже двигает этот предмет.')};
 if(act==='delete'){
  s.items=s.items.filter(i=>i.id!==id&&i.support!==id);
 }else if(act==='edit'){
  const next=clean({...current,...raw.patch,id},id);
  if(!next||next.type!==current.type)return {state:s,events:notice(player.id,'Нельзя изменить тип предмета.')};
  if(SMALL.has(next.type)){
   const host=s.items.find(i=>i.id===next.support);
   next.y=host?TOP[host.type]||0:0;
  }
  // Supported accessories rotate/move along with the furniture carrying them.
  const children=s.items.filter(i=>i.support===id);
  const moved=children.map(i=>({...i}));
  const quarter=((next.rot-current.rot)%4+4)%4;
  const dx=next.x-current.x,dz=next.z-current.z;
  for(const child of moved){
   const ox=child.x-current.x,oz=child.z-current.z,angle=quarter*Math.PI/2;
   child.x=nearest(next.x+ox*Math.cos(angle)-oz*Math.sin(angle));
   child.z=nearest(next.z+ox*Math.sin(angle)+oz*Math.cos(angle));
  }
  const all=s.items;
  s.items=s.items.map(i=>i.id===id?next:(moved.find(c=>c.id===i.id)||i));
  if(!valid(s,next)||moved.some(c=>!valid(s,c))){s.items=all;return {state:s,events:notice(player.id,'Предмет сюда не помещается.')};}
 }else return {state:s,events:[]};
 delete selected[player.id];s.revision++;return {state:s,events:announce(s)};
}
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,players:[player],mode:'tenants',template:0,
   round:0,started:0,completed:0,deadline:0,items:[],target:[],finishes:{wallColor:0,pattern:'plain',floor:'honey',evening:false},
   selections:{},revision:0,serial:0,score:null}};},
 onJoin({state,players}){
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  state.players=players;state.revision++;return {state,events:announce(state)};
 },
 onLeave({state,player,players}){
  state.players=players;
  if(state.host===player.id)state.host=players[0]?.id||'';
  delete state.selections[player.id];
  state.revision++;return {state,events:announce(state)};
 },
 onMessage({state,player,payload}){
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  advance(state);
  if(p.type==='sync')return {state,events:announce(state,player.id)};
  if(p.type==='start'){
   if(player.id!==state.host)return {state,events:notice(player.id,'Начинает создатель комнаты.')};
   if(state.players.length<MIN_PLAYERS)return {state,events:notice(player.id,'Нужно минимум два игрока.')};
   if(state.phase!=='lobby'&&state.phase!=='result')return {state,events:notice(player.id,'Раунд уже идёт.')};
   if(!['tenants','memory'].includes(p.mode))return {state,events:notice(player.id,'Неизвестный режим.')};
   state.mode=p.mode;state.template=state.round% (state.mode==='tenants'?TASKS.length:TEMPLATES.length);
   state.round++;state.items=[];state.selections={};state.score=null;state.completed=0;state.started=now();
   state.target=state.mode==='memory'?targetScene(state.template):[];
   state.phase=state.mode==='memory'?'preview':'build';
   state.deadline=state.started+(state.mode==='memory'?18000:190000);
   state.revision++;return {state,events:announce(state)};
  }
  if(p.type==='skip_preview'&&state.phase==='preview'&&player.id===state.host){
   state.phase='build';state.items=[];state.selections={};state.deadline=now()+155000;state.revision++;
   return {state,events:announce(state)};
  }
  if(p.type==='finish'&&state.phase==='build'&&player.id===state.host){finish(state);return {state,events:announce(state)};}
  if(p.type==='select'&&state.phase==='build'){
   const id=String(p.id||'').slice(0,80);
   const item=state.items.find(i=>i.id===id);
   if(!item){delete state.selections[player.id];return {state,events:announce(state)};}
   state.selections[player.id]={id,action:['move','rotate','paint','select'].includes(p.action)?p.action:'select',time:now()};
   return {state,events:announce(state)};
  }
  if(['add','edit','delete'].includes(p.type))return update(state,p,player);
  return {state,events:[]};
 }
};
export default module;
