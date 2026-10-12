// LIPKI 1.2 — shared, fixed-step physics. World dimensions are canvas units.
// Every level has a physical puzzle latch: running to the right is never sufficient.
export const W=1040,H=580,R=19;
export const COLORS=['#ed745b','#68b9ae','#d3aa50','#a49acb'];
const p=(x,y,w,h)=>({x,y,w,h});
const gate=(x=847)=>p(x,-100,32,610);
const pad=(x,y=510)=>({x,y});
export const LEVELS=[
 {name:'Первая пуговица',hint:'Нажмите на жёлтую пуговицу',floors:[p(0,510,1040,70)],platforms:[],pads:[pad(425)],gate:gate(800)},
 {name:'Два стежка',hint:'Встаньте на две пуговицы вместе',floors:[p(0,510,1040,70)],platforms:[],pads:[pad(300),pad(600)],gate:gate()},
 {name:'Катушка на метке',hint:'Прикатите катушку на кольцо',floors:[p(0,510,1040,70)],platforms:[],ball:{x:285,y:484},target:pad(675),gate:gate()},
 {name:'Липкие заплатки',hint:'Прилипните к двум отмеченным местам',floors:[p(0,510,1040,70)],platforms:[p(295,430,125,22),p(540,430,150,22)],patches:[pad(350,411),pad(600,411)],gate:gate()},
 {name:'Пружинный цех',hint:'Подпрыгните и соберите две звезды',floors:[p(0,510,1040,70)],platforms:[],springs:[pad(300),pad(580)],sigils:[pad(375,270),pad(655,270)],gate:gate()},
 {name:'Один держит',hint:'Катушка на кольце, герой на кнопке',floors:[p(0,510,1040,70)],platforms:[],ball:{x:265,y:484},target:pad(683),pads:[pad(445)],gate:gate()},
 {name:'Верхний шов',hint:'Прилипните к заплаткам по очереди',floors:[p(0,510,1040,70)],platforms:[p(298,431,142,22),p(515,415,92,22),p(565,350,142,22)],patches:[pad(365,412),pad(635,331)],relay:true,gate:gate()},
 {name:'Мягкие острова',hint:'Перелетите разрывы и зажгите звёзды',floors:[p(0,510,275,70),p(405,510,154,70),p(695,510,345,70)],platforms:[p(302,435,88,22),p(584,432,94,22)],springs:[pad(237),pad(532)],sigils:[pad(335,295),pad(630,295)],gate:gate(849)},
 {name:'Разные высоты',hint:'Удержите две кнопки одновременно',floors:[p(0,510,1040,70)],platforms:[p(283,438,135,22),p(445,420,91,22),p(593,394,145,22)],pads:[pad(350,438),pad(664,394)],gate:gate()},
 {name:'Последний узор',hint:'Прилипните, поймайте звезду, прикатите катушку',floors:[p(0,510,1040,70)],platforms:[p(302,405,144,22)],patches:[pad(365,386)],springs:[pad(500)],sigils:[pad(575,270)],ball:{x:250,y:484},target:pad(735),gate:gate(868)}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const overlap=(x,y,r,s)=>x+r>s.x&&x-r<s.x+s.w&&y+r>s.y&&y-r<s.y+s.h;
const isTouching=(q,x,y,nearX=41,nearY=30)=>Math.abs(q.x-x)<nearX&&Math.abs(q.y-y)<nearY;
function spawnX(i){return 75+i*46}
export function createWorld(members,level=0){
 return {level:clamp(level|0,0,LEVELS.length-1),players:members.map((m,i)=>({
  id:m.id,name:m.name||'Игрок',x:spawnX(i),y:460,vx:0,vy:0,ground:false,coyote:0,
  jumpHeld:false,stickHeld:false,stuck:null,squash:0,face:1,dead:0,springWait:0
 })),inputs:{},pads:[],patches:[],sigils:[],gateOpen:false,ball:null,targetDone:false,clock:0,revision:0,finished:false,falls:0};
}
export function resetLevel(w,level=w.level){
 w.level=clamp(level|0,0,LEVELS.length-1);
 const d=LEVELS[w.level];
 w.pads=(d.pads||[]).map(()=>false);w.patches=(d.patches||[]).map(()=>false);
 w.sigils=(d.sigils||[]).map(()=>false);
 w.gateOpen=false;w.targetDone=false;w.clock=0;w.inputs={};w.finished=false;w.revision++;
 w.ball=d.ball?{x:d.ball.x,y:d.ball.y,vx:0,vy:0,r:26}:null;
 w.players.forEach((q,i)=>Object.assign(q,{x:spawnX(i),y:460,vx:0,vy:0,
  ground:false,coyote:0,jumpHeld:false,stickHeld:false,stuck:null,squash:0,dead:0,springWait:0}));
}
export function initialize(members,level=0){const w=createWorld(members,level);resetLevel(w,level);return w}
export function spawn(w,q){
 const i=w.players.indexOf(q);Object.assign(q,{x:spawnX(i),y:460,vx:0,vy:0,
  ground:false,coyote:0,stuck:null,jumpHeld:false,stickHeld:false,squash:1,dead:.35,springWait:0});
 w.falls++;
}
function solids(w){const d=LEVELS[w.level];return w.gateOpen?[...d.floors,...d.platforms]:[...d.floors,...d.platforms,d.gate]}
function findGrip(w,q){
 let best=null,bestDist=32;
 for(const s of solids(w)){
  const x=clamp(q.x,s.x,s.x+s.w),y=clamp(q.y,s.y,s.y+s.h),dist=Math.hypot(q.x-x,q.y-y);
  if(dist<bestDist){best={kind:'world',x:q.x,y:q.y};bestDist=dist}
 }
 for(const other of w.players){
  if(other===q||other.stuck?.id===q.id)continue;
  const dist=Math.hypot(q.x-other.x,q.y-other.y);
  if(dist<48&&dist-17<bestDist){
   best={kind:'player',id:other.id,dx:clamp(q.x-other.x,-43,43),dy:clamp(q.y-other.y,-43,43)};
   bestDist=dist-17;
  }
 }
 return best;
}
function moveTo(v,target,amount){
 return target>v?Math.min(target,v+amount):Math.max(target,v-amount);
}
function movePlayer(q,step,all){
 const ox=q.x,oy=q.y;
 q.x+=q.vx*step;
 for(const s of all){
  if(!overlap(q.x,q.y,R,s))continue;
  // Only obstruct horizontally if the player's vertical extent crosses
  // the interior, not while resting directly above a platform.
  if(q.y+R<=s.y+2||q.y-R>=s.y+s.h-2)continue;
  if(ox+R<=s.x+5&&q.vx>0){q.x=s.x-R;q.vx=0}
  else if(ox-R>=s.x+s.w-5&&q.vx<0){q.x=s.x+s.w+R;q.vx=0}
 }
 q.x=clamp(q.x,R,W-R);
 q.y+=q.vy*step;
 q.ground=false;
 for(const s of all){
  if(!overlap(q.x,q.y,R,s))continue;
  if(oy+R<=s.y+5&&q.vy>=0){
   q.y=s.y-R;q.vy=0;q.ground=true;q.squash=Math.max(.3,q.squash);
  }else if(oy-R>=s.y+s.h-5&&q.vy<0){q.y=s.y+s.h+R;q.vy=0}
  else if(s.y<=-50){ // Solid gate spans the complete height; never teleport through.
   if(q.x<s.x+s.w/2)q.x=s.x-R;else q.x=s.x+s.w+R;
   q.vx=0;
  }else if(q.y<s.y+s.h/2){
   q.y=s.y-R;q.vy=0;q.ground=true;
  }else{q.y=s.y+s.h+R;q.vy=0}
 }
 q.y=Math.max(R,q.y);
}
function moveBall(w,step,all){
 const b=w.ball;if(!b)return;
 const ox=b.x,oy=b.y;
 b.vy=clamp(b.vy+980*step,-700,640);
 b.vx=moveTo(b.vx,0,(Math.abs(b.vy)<12?105:45)*step);
 b.x+=b.vx*step;
 for(const s of all)if(overlap(b.x,b.y,b.r,s)){
  if(ox+b.r<=s.x+5&&b.vx>=0){b.x=s.x-b.r;b.vx=0}
  else if(ox-b.r>=s.x+s.w-5&&b.vx<=0){b.x=s.x+s.w+b.r;b.vx=0}
 }
 b.y+=b.vy*step;
 for(const s of all)if(overlap(b.x,b.y,b.r,s)){
  if(oy+b.r<=s.y+7&&b.vy>=0){b.y=s.y-b.r;b.vy=0}
  else if(oy-b.r>=s.y+s.h-7&&b.vy<=0){b.y=s.y+s.h+b.r;b.vy=0}
  else if(s.y<-50){b.x=b.x<s.x+s.w/2?s.x-b.r:s.x+s.w+b.r;b.vx=0}
  else if(b.y<s.y+s.h/2){b.y=s.y-b.r;b.vy=0}
  else{b.y=s.y+s.h+b.r;b.vy=0}
 }
 for(const q of w.players){
  const dx=b.x-q.x,dy=b.y-q.y,dist=Math.hypot(dx,dy)||1,limit=b.r+R;
  if(dist<limit&&Math.abs(dy)<35){
   const side=dx>=0?1:-1;
   b.x+=side*(limit-dist)*.88;
   b.vx=clamp(b.vx+q.vx*.18+side*26*step,-155,155);
   q.vx*=.86;
  }
 }
 b.x=clamp(b.x,b.r,W-b.r);
 if(b.y>H+70){const d=LEVELS[w.level];Object.assign(b,{x:d.ball.x,y:d.ball.y,vx:0,vy:0});}
}
function updateGoals(w){
 const d=LEVELS[w.level];
 if(d.pads)w.pads=d.pads.map(s=>w.players.some(q=>
  Math.abs(q.x-s.x)<36&&Math.abs(q.y+R-s.y)<13&&q.ground));
 if(d.patches)for(let i=0;i<d.patches.length;i++){
  if(d.relay&&i>0&&!w.patches[i-1])continue;
  if(w.patches[i])continue;
  const s=d.patches[i];
  if(w.players.some(q=>q.stuck?.kind==='world'&&isTouching(q,s.x,s.y,58,42)))w.patches[i]=true;
 }
 if(d.sigils)for(let i=0;i<d.sigils.length;i++){
  if(w.sigils[i])continue;const s=d.sigils[i];
  if(w.players.some(q=>isTouching(q,s.x,s.y,45,47)))w.sigils[i]=true;
 }
 if(d.target&&w.ball&&Math.abs(w.ball.x-d.target.x)<32&&Math.abs(w.ball.y-(d.target.y-w.ball.r))<13)
  w.targetDone=true;
 const buttons=!d.pads||w.pads.every(Boolean);
 const tags=!d.patches||w.patches.every(Boolean);
 const stars=!d.sigils||w.sigils.every(Boolean);
 const ball=!d.target||w.targetDone;
 if(buttons&&tags&&stars&&ball)w.gateOpen=true;
}
export function simulate(w,dt){
 if(w.finished)return;
 dt=clamp(Number(dt)||0,0,.1);
 let remaining=dt;
 while(remaining>0){
  const step=Math.min(.0125,remaining);remaining-=step;w.clock+=step;
  const d=LEVELS[w.level],all=solids(w);
  for(const q of w.players){
   const input=w.inputs[q.id]||{},dir=clamp(Number(input.x)||0,-1,1);
   const jump=input.jump===true,stick=input.stick===true;
   q.dead=Math.max(0,q.dead-step);q.squash=Math.max(0,q.squash-step*2.2);
   q.springWait=Math.max(0,(q.springWait||0)-step);
   if(stick&&!q.stickHeld){
    if(q.stuck){q.stuck=null;q.vy=Math.min(q.vy,-40)}
    else{const grip=findGrip(w,q);if(grip){q.stuck=grip;q.vx=0;q.vy=0;q.squash=.7}}
   }
   q.stickHeld=stick;
   if(jump&&!q.jumpHeld&&(q.ground||q.coyote>0||q.stuck)){
    q.stuck=null;q.vy=-505;q.y-=2;q.ground=false;q.coyote=0;q.squash=.65;
   }
   q.jumpHeld=jump;
   if(q.stuck?.kind==='world'){
    q.x=clamp(q.x+dir*82*step,R,W-R);
    if(input.up)q.y=Math.max(R,q.y-78*step);
    if(findGrip(w,q)?.kind!=='world')q.stuck=null;
    q.vx=0;q.vy=0;q.ground=false;
    continue;
   }
   if(q.stuck?.kind==='player')continue;
   if(dir)q.face=dir>0?1:-1;
   // Soft inertia: smooth acceleration, a little air steering and gradual stop.
   const speed=183,accel=q.ground?570:385,brake=q.ground?660:245;
   if(dir)q.vx=moveTo(q.vx,dir*speed,accel*step);
   else q.vx=moveTo(q.vx,0,brake*step);
   q.vy=clamp(q.vy+1020*step,-810,685);
   const prevGround=q.ground;
   movePlayer(q,step,all);
   q.coyote=q.ground?.115:prevGround?.115:Math.max(0,q.coyote-step);
   if(q.ground&&q.springWait===0){
    for(const spring of d.springs||[])if(Math.abs(q.x-spring.x)<41&&Math.abs(q.y+R-spring.y)<10){
     q.vy=-760;q.y-=2;q.ground=false;q.coyote=0;q.squash=1;q.springWait=.24;
     break;
    }
   }
   if(q.y>H+65)spawn(w,q);
  }
  // Body-to-body attachments: the other player can carry a friend.
  for(const q of w.players){
   if(q.stuck?.kind!=='player')continue;
   const anchor=w.players.find(a=>a.id===q.stuck.id);
   if(!anchor||anchor===q){q.stuck=null;continue}
   const tx=anchor.x+q.stuck.dx,ty=anchor.y+q.stuck.dy;
   q.vx=(tx-q.x)/step;q.vy=(ty-q.y)/step;
   q.x=clamp(tx,R,W-R);q.y=Math.max(R,ty);q.ground=false;
  }
  for(let i=0;i<w.players.length;i++)for(let j=i+1;j<w.players.length;j++){
   const a=w.players[i],b=w.players[j];
   if(a.stuck?.kind==='player'||b.stuck?.kind==='player')continue;
   const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
   if(dist<2*R-3){const n=(2*R-3-dist)*.5;a.x-=dx/dist*n;b.x+=dx/dist*n}
  }
  moveBall(w,step,all);updateGoals(w);
  if(w.gateOpen&&w.players.length&&w.players.every(q=>q.x>951&&q.y<550)){
   if(w.level===LEVELS.length-1){w.finished=true;}
   else resetLevel(w,w.level+1);
   return;
  }
 }
 w.revision++;
}
export function getView(w){
 const d=LEVELS[w.level];
 const done=(w.patches.filter(Boolean).length)+(w.sigils.filter(Boolean).length)+(w.targetDone?1:0)+
  ((d.pads&&w.pads.every(Boolean))?d.pads.length:0);
 const total=(d.pads?.length||0)+(d.patches?.length||0)+(d.sigils?.length||0)+(d.target?1:0);
 return {level:w.level,players:w.players.map(q=>({id:q.id,name:q.name,x:+q.x.toFixed(1),y:+q.y.toFixed(1),
  vx:+q.vx.toFixed(1),vy:+q.vy.toFixed(1),face:q.face,stuck:q.stuck,squash:+q.squash.toFixed(2),dead:q.dead})),
  ball:w.ball?{x:+w.ball.x.toFixed(1),y:+w.ball.y.toFixed(1),r:w.ball.r}:null,
  pads:w.pads,patches:w.patches,sigils:w.sigils,targetDone:w.targetDone,
  completed:done,total,gateOpen:w.gateOpen,clock:w.clock,falls:w.falls,finished:w.finished,revision:w.revision};
}
