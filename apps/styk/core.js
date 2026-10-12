// STYK — deterministic battle rules. No DOM dependencies.
export const WORLD={w:760,h:1000};
export const STATS={
  spear:{label:'Копейщики',men:29,speed:47,power:1.10,range:0,armor:1.15,width:118},
  sword:{label:'Мечники',men:27,speed:54,power:1.30,range:0,armor:1.0,width:106},
  bow:{label:'Лучники',men:22,speed:49,power:.50,range:253,armor:.7,width:134},
  horse:{label:'Конница',men:17,speed:87,power:1.80,range:0,armor:.92,width:113}
};
export const SCENARIOS=[
 {name:'У БРОДА',subtitle:'Переправа через Нарву',rounds:11,terrain:'ford',enemySkill:.70,
  friend:[['spear',165,735],['sword',325,755],['bow',340,900],['horse',565,790]],
  enemy:[['spear',188,344],['sword',362,326],['bow',390,194],['horse',597,320]]},
 {name:'РАЗОМКНУТЫЙ ФЛАНГ',subtitle:'Долина гнилых вязов',rounds:12,terrain:'grove',enemySkill:.80,
  friend:[['spear',150,740],['spear',302,730],['sword',472,755],['bow',342,900],['horse',622,790]],
  enemy:[['spear',122,335],['sword',270,322],['spear',440,335],['bow',365,185],['horse',626,300]]},
 {name:'ЧЁРНОЕ ЗНАМЯ',subtitle:'Высота трёх корон',rounds:13,terrain:'hill',enemySkill:.82,
  friend:[['spear',155,752],['sword',300,748],['spear',450,748],['bow',334,905],['horse',629,812]],
  enemy:[['spear',155,336],['sword',310,342],['sword',470,322],['bow',355,190],['horse',622,317],['spear',570,190]]}
];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ang=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function nextRand(s){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296}
function unit(type,side,index,x,y,stage){
 const k=STATS[type],n=k.men+(side==='enemy'&&stage===2?2:0),angle=side==='friend'?-Math.PI/2:Math.PI/2;
 return {id:side[0]+index,type,side,x,y,angle,width:k.width,men:n,maxMen:n,
 morale:side==='friend'?94:89,cohesion:100,bend:0,stamina:100,routed:false,
 target:{x,y,angle,width:k.width,stance:'hold'},cooldown:1+(index%3)*.4,flash:0,loss:0,engaged:false};
}
export function makeGame(stage=0){
 const sc=SCENARIOS[clamp(stage,0,2)],units=[];
 sc.friend.forEach(([t,x,y],i)=>units.push(unit(t,'friend',i,x,y,stage)));
 sc.enemy.forEach(([t,x,y],i)=>units.push(unit(t,'enemy',i,x,y,stage)));
 return {stage:clamp(stage,0,2),round:1,units,seed:(29397+stage*76831)>>>0,
 edited:[],remaining:2,events:[],log:'Выберите отряд и задайте приказ.',winner:null,simulationTime:0};
}
export function orderUnit(g,id,patch){
 const u=g.units.find(x=>x.id===id&&x.side==='friend'&&!x.routed);
 if(!u||g.winner)return false;
 if(!g.edited.includes(id)){
   if(!g.remaining)return false;
   g.remaining--;
   g.edited.push(id);
 }
 let t={...u.target,...patch};
 t.x=clamp(Number(t.x)||0,34,WORLD.w-34);
 t.y=clamp(Number(t.y)||0,40,WORLD.h-35);
 t.width=clamp(Number(t.width)||90,68,226);
 t.angle=Number.isFinite(t.angle)?t.angle:u.angle;
 t.stance=['hold','advance','charge','withdraw'].includes(t.stance)?t.stance:'hold';
 if(patch.stance==='hold'){t.x=u.x;t.y=u.y;}
 u.target=t;
 return true;
}
export function getEnds(x,y,angle,width){
 const px=-Math.sin(angle)*width/2,py=Math.cos(angle)*width/2;
 return [{x:x-px,y:y-py},{x:x+px,y:y+py}];
}
export function lineFromEnds(a,b,oldAngle){
 const dx=b.x-a.x,dy=b.y-a.y;
 const angle=Math.atan2(dy,dx)-Math.PI/2;
 return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,
   angle:oldAngle==null?angle:oldAngle+wrap(angle-oldAngle),
   width:Math.hypot(dx,dy)};
}
export function effective(u){return u.routed?0:u.men*(.5+.5*u.morale/100)*(.65+.35*u.cohesion/100)}
const pointSegmentDistance=(p,a,b)=>{
 const vx=b.x-a.x,vy=b.y-a.y;
 const t=clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/(vx*vx+vy*vy||1),0,1);
 return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));
};
function segmentDistance(u,v){
 const A=getEnds(u.x,u.y,u.angle,u.width);
 const B=getEnds(v.x,v.y,v.angle,v.width);
 return Math.min(pointSegmentDistance(A[0],B[0],B[1]),pointSegmentDistance(A[1],B[0],B[1]),
 pointSegmentDistance(B[0],A[0],A[1]),pointSegmentDistance(B[1],A[0],A[1]));
}
function terrainSlow(s,u){
 if(s.terrain==='ford'&&u.y>460&&u.y<544&&Math.abs(u.x-379)>100)return u.type==='horse'?.38:.65;
 if(s.terrain==='grove'&&((u.x<230&&u.y>390&&u.y<670)||(u.x>570&&u.y>370&&u.y<650)))return u.type==='horse'?.52:.77;
 if(s.terrain==='hill'&&u.y>405&&u.y<600)return .82;
 return 1;
}
function cover(s,u){
 if(s.terrain==='grove'&&((u.x<230&&u.y>390&&u.y<670)||(u.x>570&&u.y>370&&u.y<650)))return .70;
 return 1;
}
export function planEnemy(g){
 const enemies=g.units.filter(u=>u.side==='enemy'&&!u.routed&&u.men>0);
 const friends=g.units.filter(u=>u.side==='friend'&&!u.routed&&u.men>0);
 if(!friends.length)return;
 for(const u of enemies){
   let target=friends.reduce((a,b)=>dist(u,a)<dist(u,b)?a:b);
   // Cavalry hunts exposed bows; infantry remains oriented to the nearest threat.
   if(u.type==='horse'){
    const bows=friends.filter(f=>f.type==='bow');
    if(bows.length)target=bows.reduce((a,b)=>dist(u,a)<dist(u,b)?a:b);
   }
   const d=dist(u,target),theta=ang(u,target);
   const spread=(u.type==='horse'?94:0),side=u.x<target.x?-1:1;
   let x=target.x+Math.cos(theta+Math.PI/2)*spread*side;
   let y=target.y+Math.sin(theta+Math.PI/2)*spread*side;
   let stance=u.type==='horse'?'charge':'advance';
   if(u.type==='bow'){
      stance='advance';
      if(d<175){x=u.x-Math.cos(theta)*105;y=u.y-Math.sin(theta)*105;}
      else if(d<248){x=u.x;y=u.y;stance='hold';}
      else{x=target.x-Math.cos(theta)*200;y=target.y-Math.sin(theta)*200;}
   }
   const desiredAngle=theta;
   const width=u.type==='spear'&&friends.length>2?clamp(u.width+6,92,152):u.width;
   u.target={x:clamp(x,30,730),y:clamp(y,35,965),angle:desiredAngle,width,stance};
 }
}
function takeHit(g,target,raw,from,archer=false){
 const u=target;
 if(u.routed)return;
 const flank=from ? Math.cos(u.angle)*((from.x-u.x)/(dist(u,from)||1))+Math.sin(u.angle)*((from.y-u.y)/(dist(u,from)||1)):1;
 const exposure=archer?1:(flank<-.38?2.0:flank<.35?1.5:1);
 const armor=STATS[u.type].armor;
 const severity=raw*exposure/armor*(archer?cover(SCENARIOS[g.stage],u):1)*(from?.side==='enemy'?SCENARIOS[g.stage].enemySkill:1);
 u.loss+=severity;
 u.cohesion=clamp(u.cohesion-severity*(archer?2.0:3.2),0,100);
 u.morale=clamp(u.morale-severity*(archer?1.5:2.35),0,100);
 u.flash=Math.max(u.flash,.16);
 while(u.loss>=1&&u.men>0){u.men--;u.loss-=1;}
 if(u.men<=0||u.morale<19||(u.cohesion<15&&u.engaged)){
   u.routed=true;
   g.events.push({type:'rout',x:u.x,y:u.y,side:u.side});
   for(const ally of g.units){
    if(ally.side===u.side&&ally.id!==u.id&&!ally.routed&&dist(ally,u)<210){
      ally.morale=clamp(ally.morale-(dist(ally,u)<105?18:10),0,100);
      ally.cohesion=clamp(ally.cohesion-7,0,100);
    }
   }
 }
}
export function stepBattle(g,dt){
 if(g.winner)return;
 const sc=SCENARIOS[g.stage],active=g.units.filter(u=>!u.routed&&u.men>0);
 g.simulationTime+=dt;
 // Advance positions, rotation and formation shape.
 for(const u of active){
   u.flash=Math.max(0,u.flash-dt);
   const t=u.target,dd=Math.hypot(t.x-u.x,t.y-u.y);
   const activeMove=(t.stance!=='hold' || dd>12)&&dd>4;
   const rate=STATS[u.type].speed*(t.stance==='charge'?1.28:t.stance==='withdraw'?1.15:1)*terrainSlow(sc,u);
   const step=Math.min(dd,rate*dt*(u.engaged&&t.stance!=='withdraw'?.25:1));
   if(activeMove){u.x+=((t.x-u.x)/(dd||1))*step;u.y+=((t.y-u.y)/(dd||1))*step;}
   const turn=wrap(t.angle-u.angle);
   u.angle+=clamp(turn,-1.9*dt,1.9*dt);
   u.width+=clamp(t.width-u.width,-37*dt,37*dt);
   if(t.stance==='charge'&&activeMove)u.stamina=clamp(u.stamina-4*dt,10,100);
   else u.stamina=clamp(u.stamina+2*dt,10,100);
   u.engaged=false;
   u.bend=Math.max(0,u.bend-dt*.16);
 }
 // Resolving contacts in deterministic unit order, including line geometry.
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
   const a=active[i],b=active[j];
   if(a.side===b.side)continue;
   const d=segmentDistance(a,b);
   if(d>34)continue;
   a.engaged=true;b.engaged=true;
   const densityA=clamp(128/a.width,.63,1.45);
   const densityB=clamp(128/b.width,.63,1.45);
   const strengthA=STATS[a.type].power*(a.men/a.maxMen)*densityA*(.38+.62*a.cohesion/100)*(.55+.45*a.morale/100);
   const strengthB=STATS[b.type].power*(b.men/b.maxMen)*densityB*(.38+.62*b.cohesion/100)*(.55+.45*b.morale/100);
   const chargeA=a.target.stance==='charge'?1.40:1;
   const chargeB=b.target.stance==='charge'?1.40:1;
   takeHit(g,b,dt*.68*strengthA*chargeA,a);
   takeHit(g,a,dt*.68*strengthB*chargeB,b);
   const push=dt*4;
   a.bend=clamp(a.bend+push*strengthB*.038,0,1);
   b.bend=clamp(b.bend+push*strengthA*.038,0,1);
   // Battle lines resist but yield to the stronger formation.
   const dirx=(b.x-a.x)/(dist(a,b)||1),diry=(b.y-a.y)/(dist(a,b)||1);
   const pressure=dt*5*(strengthA-strengthB);
   a.x=clamp(a.x+dirx*Math.max(-pressure,0)*-.50,20,740);
   b.x=clamp(b.x+dirx*Math.max(pressure,0)*.50,20,740);
   a.y=clamp(a.y+diry*Math.max(-pressure,0)*-.50,35,965);
   b.y=clamp(b.y+diry*Math.max(pressure,0)*.50,35,965);
   if(nextRand(g)<dt*2.2)g.events.push({type:'impact',x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 }
 // Archers shoot at the nearest exposed formation.
 for(const u of active){
   if(u.type!=='bow'||u.routed)continue;
   u.cooldown-=dt;
   if(u.cooldown>0)continue;
   const enemies=active.filter(v=>v.side!==u.side&&!v.routed&&dist(u,v)<STATS.bow.range);
   if(!enemies.length){u.cooldown=.25;continue;}
   const v=enemies.reduce((a,b)=>dist(u,a)<dist(u,b)?a:b);
   const factor=clamp(u.men/u.maxMen,.2,1)*(.7+.3*u.morale/100);
   takeHit(g,v,(1.0+nextRand(g)*.5)*factor,u,true);
   u.cooldown=1.25;
   g.events.push({type:'volley',x:u.x,y:u.y,tx:v.x,ty:v.y,side:u.side});
 }
 // Neighbour support: the defining front-line seam mechanic.
 for(const u of active){
   if(u.routed)continue;
   if(u.engaged){
     const support=active.some(v=>v.side===u.side&&v.id!==u.id&&!v.routed&&dist(u,v)<u.width*.68+v.width*.35&&Math.abs(v.y-u.y)<115);
     if(!support){u.cohesion=clamp(u.cohesion-.8*dt,0,100);u.morale=clamp(u.morale-.34*dt,0,100);}
   }else{
     u.cohesion=clamp(u.cohesion+dt*.75,0,100);
     u.morale=clamp(u.morale+dt*.24,0,100);
   }
   if(u.morale<19||u.men<Math.max(3,u.maxMen*.14)){u.routed=true;g.events.push({type:'rout',x:u.x,y:u.y,side:u.side});}
 }
 if(g.events.length>140)g.events.splice(0,g.events.length-140);
}
export function strength(g,side){return Math.round(g.units.filter(u=>u.side===side).reduce((s,u)=>s+effective(u),0))}
export function status(g){
 const f=g.units.filter(u=>u.side==='friend'&&!u.routed),e=g.units.filter(u=>u.side==='enemy'&&!u.routed);
 const initF=SCENARIOS[g.stage].friend.reduce((s,x)=>s+STATS[x[0]].men,0);
 const initE=SCENARIOS[g.stage].enemy.reduce((s,x)=>s+STATS[x[0]].men+(g.stage===2?2:0),0);
 const sf=strength(g,'friend')/initF,se=strength(g,'enemy')/initE;
 if(!f.length||sf<.23)return 'enemy';
 if(!e.length||se<.26)return 'friend';
 if(g.round>=SCENARIOS[g.stage].rounds)return sf>=se?'friend':'enemy';
 return null;
}
export function closeRound(g){
 g.winner=status(g);
 if(g.winner){g.log=g.winner==='friend'?'Вражеский строй обращён в бегство.':'Ваш фронт не выдержал.';return g.winner;}
 g.round++;
 g.remaining=2;
 g.edited=[];
 const broken=g.units.filter(u=>u.routed&&u.side==='enemy').length;
 g.log=broken?('Разбито вражеских отрядов: '+broken+'.'): 'Линии перестраиваются.';
 return null;
}
export function safeLoad(text){
 try{
  const data=JSON.parse(text);
  if(data?.version!==1||!Number.isInteger(data.stage)||data.stage<0||data.stage>2||
    !Array.isArray(data.units)||data.units.length<6||data.units.length>16||
    !Number.isInteger(data.round)||data.round<1||data.round>20)return null;
  const fresh=makeGame(data.stage);
  if(data.units.length!==fresh.units.length)return null;
  for(let i=0;i<fresh.units.length;i++){
    const raw=data.units[i],u=fresh.units[i];
    if(raw.id!==u.id||raw.type!==u.type||raw.side!==u.side)return null;
    for(const k of ['x','y','angle','width','men','morale','cohesion','stamina','bend','cooldown','loss'])if(!Number.isFinite(raw[k]))return null;
    Object.assign(u,{x:clamp(raw.x,0,760),y:clamp(raw.y,0,1000),angle:raw.angle,width:clamp(raw.width,68,226),
      men:clamp(raw.men,0,u.maxMen),morale:clamp(raw.morale,0,100),cohesion:clamp(raw.cohesion,0,100),stamina:clamp(raw.stamina,0,100),
      bend:clamp(raw.bend,0,1),routed:!!raw.routed,cooldown:clamp(raw.cooldown,0,5),loss:clamp(raw.loss,0,1),
      target:{x:clamp(raw.target?.x??raw.x,34,726),y:clamp(raw.target?.y??raw.y,35,965),
       width:clamp(raw.target?.width??raw.width,68,226),angle:Number.isFinite(raw.target?.angle)?raw.target.angle:raw.angle,
       stance:['hold','advance','charge','withdraw'].includes(raw.target?.stance)?raw.target.stance:'hold'}});
  }
  fresh.round=data.round;fresh.seed=(data.seed>>>0)||fresh.seed;
  fresh.remaining=clamp(data.remaining??2,0,2);
  fresh.edited=Array.isArray(data.edited)?data.edited.filter(x=>fresh.units.some(u=>u.id===x&&u.side==='friend')).slice(0,2):[];
  fresh.winner=['friend','enemy'].includes(data.winner)?data.winner:null;
  fresh.log='Сражение восстановлено.';
  return fresh;
 }catch{return null}
}
export function serialize(g){return JSON.stringify({version:1,stage:g.stage,round:g.round,seed:g.seed,
 remaining:g.remaining,edited:g.edited,winner:g.winner,units:g.units});}
