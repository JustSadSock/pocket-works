// LIPKI shared deterministic 2D simulation. Positions are logical canvas pixels.
export const W=1040,H=580,R=19;
export const COLORS=['#ed745b','#68b9ae','#d3aa50','#a49acb'];
const rect=(x,y,w,h)=>({x,y,w,h});
const p=(x,y,w,h)=>rect(x,y,w,h);
export const LEVELS=[
 {name:'Первый стежок',hint:'Доберитесь до кармана вместе',floors:[p(0,510,1040,70)],platforms:[p(250,448,144,22),p(485,400,144,22),p(690,448,130,22)]},
 {name:'Врозь не уйти',hint:'Перепрыгните разрывы',floors:[p(0,510,290,70),p(410,510,240,70),p(760,510,280,70)],platforms:[p(300,450,95,22),p(660,456,90,22)]},
 {name:'Липучий подъём',hint:'Цепляйся, прыгай и помогай',floors:[p(0,510,1040,70)],platforms:[p(300,430,130,22),p(460,342,150,22),p(640,400,180,22)]},
 {name:'Две пуговицы',hint:'Встаньте на обе кнопки одновременно',floors:[p(0,510,1040,70)],platforms:[p(210,442,130,22),p(560,436,116,22)],pads:[{x:265,y:510},{x:602,y:510}],gate:rect(782,355,27,155)},
 {name:'Пружинный цех',hint:'Пружины подбросят вас выше',floors:[p(0,510,1040,70)],platforms:[p(310,372,160,22),p(560,284,160,22),p(735,386,110,22)],springs:[{x:220,y:510},{x:485,y:510},{x:675,y:284}]},
 {name:'Катушка',hint:'Толкните катушку на вышитый знак',floors:[p(0,510,1040,70)],platforms:[p(380,437,110,20),p(660,436,110,20)],ball:{x:300,y:466},target:{x:690,y:510},gate:rect(815,355,27,155)},
 {name:'Тканевые острова',hint:'Прыгай, цепляйся, страхуй',floors:[p(0,510,250,70),p(375,510,195,70),p(715,510,325,70)],platforms:[p(270,415,95,20),p(570,362,116,20),p(682,436,102,20)]},
 {name:'Одной командой',hint:'Держите кнопки и открывайте проход',floors:[p(0,510,1040,70)],platforms:[p(210,420,145,22),p(505,376,150,22),p(690,442,115,22)],pads:[{x:285,y:420},{x:575,y:376}],gate:rect(827,321,25,189)},
 {name:'Не упади',hint:'Пружины и липучки спасут',floors:[p(0,510,260,70),p(410,510,140,70),p(735,510,305,70)],platforms:[p(275,434,110,22),p(545,383,170,22)],springs:[{x:206,y:510},{x:485,y:510}]},
 {name:'Большая заплатка',hint:'Никого не оставляйте позади',floors:[p(0,510,1040,70)],platforms:[p(260,416,145,22),p(472,338,145,22),p(667,422,120,22)],pads:[{x:333,y:416},{x:542,y:338}],springs:[{x:184,y:510}],gate:rect(825,305,28,205)}
];
const clamp=(a,b,c)=>Math.max(b,Math.min(c,a));
const boxHit=(x,y,r,o)=>x+r>o.x&&x-r<o.x+o.w&&y+r>o.y&&y-r<o.y+o.h;
export function createWorld(members,level=0){
 const ids=members.map((m,i)=>({id:m.id,name:m.name||'Игрок',x:80+i*49,y:470,vx:0,vy:0,ground:false,coyote:0,jumpHeld:false,stickHeld:false,stuck:null,squash:0,face:1,dead:0}));
 return {level:clamp(level|0,0,LEVELS.length-1),players:ids,inputs:{},pads:[],gateOpen:false,ball:null,clock:0,revision:0,won:false,finished:false,falls:0};
}
export function resetLevel(w,level=w.level){
 w.level=clamp(level|0,0,LEVELS.length-1);w.pads=[];w.gateOpen=false;w.clock=0;w.won=false;w.revision++;
 const d=LEVELS[w.level];w.ball=d.ball?{x:d.ball.x,y:d.ball.y,vx:0,vy:0,r:26}:null;
 w.players.forEach((q,i)=>{q.x=80+i*49;q.y=467;q.vx=0;q.vy=0;q.ground=false;q.coyote=0;q.jumpHeld=false;q.stickHeld=false;q.stuck=null;q.squash=0;q.dead=0;});
}
export function initialize(members,level=0){const w=createWorld(members,level);resetLevel(w,level);return w}
export function spawn(w,q){let n=w.players.indexOf(q);Object.assign(q,{x:80+n*49,y:467,vx:0,vy:0,stuck:null,coyote:0,ground:false,squash:1,dead:.4});w.falls++;}
function getSolids(w){
 const d=LEVELS[w.level],all=[...d.floors,...d.platforms];
 if(d.gate&&!w.gateOpen)all.push(d.gate);
 return all;
}
function findGrip(w,q){
 const solids=getSolids(w);
 let best=null,dist=36;
 for(const o of solids){
  const x=clamp(q.x,o.x,o.x+o.w),y=clamp(q.y,o.y,o.y+o.h),d=Math.hypot(q.x-x,q.y-y);
  if(d<dist){dist=d;best={kind:'world',x:q.x,y:q.y};}
 }
 for(const o of w.players)if(o!==q&&(!o.stuck||o.stuck.id!==q.id)){
  const d=Math.hypot(q.x-o.x,q.y-o.y);
  if(d<55&&d<dist+19){best={kind:'player',id:o.id,dx:clamp(q.x-o.x,-50,50),dy:clamp(q.y-o.y,-50,50)};dist=d-19;}
 }
 return best;
}
function resolvePlayer(q,ox,oy,solids){
 q.ground=false;
 // Resolve all static rectangles by axis, allowing landing, ceiling bounces and wall contact.
 for(const s of solids){
  if(!boxHit(q.x,q.y,R,s))continue;
  const wasAbove=oy+R<=s.y+8,wasBelow=oy-R>=s.y+s.h-8;
  if(wasAbove&&q.vy>=0){q.y=s.y-R;q.vy=0;q.ground=true;q.squash=Math.max(q.squash,.33);}
  else if(wasBelow&&q.vy<0){q.y=s.y+s.h+R;q.vy=0;}
  else if(ox<=s.x){q.x=s.x-R;if(q.vx>0)q.vx=0;}
  else if(ox>=s.x+s.w){q.x=s.x+s.w+R;if(q.vx<0)q.vx=0;}
  else if(q.y<s.y+s.h/2){q.y=s.y-R;q.vy=0;q.ground=true;}
  else {q.y=s.y+s.h+R;q.vy=0;}
 }
}
export function simulate(w,dt){
 if(w.finished)return;
 dt=clamp(Number(dt)||0,0,.12);
 let remaining=dt;
 while(remaining>0){
  const step=Math.min(.016,remaining);remaining-=step;w.clock+=step;
  const solids=getSolids(w),d=LEVELS[w.level];
  for(const q of w.players){
   const input=w.inputs[q.id]||{},dir=clamp(Number(input.x)||0,-1,1);
   const jump=input.jump===true,stick=input.stick===true;
   q.dead=Math.max(0,q.dead-step);q.squash=Math.max(0,q.squash-step*3.6);
   if(stick&&!q.stickHeld){
    if(q.stuck){q.stuck=null;q.vy=Math.min(q.vy,-80);}
    else {const grip=findGrip(w,q);if(grip){q.stuck=grip;q.vx=0;q.vy=0;q.squash=.8;}}
   }
   q.stickHeld=stick;
   if(jump&&!q.jumpHeld&&(q.ground||q.coyote>0||q.stuck)){
    q.stuck=null;q.vy=-535;q.y-=2;q.ground=false;q.coyote=0;q.squash=.65;
   }
   q.jumpHeld=jump;
   if(q.stuck?.kind==='world'){
    // Gentle crawling along a stuck surface: player can reposition while glued.
    q.x+=dir*95*step;q.y-=Number(input.up===true)*68*step;
    const s=findGrip(w,q);if(!s||s.kind!=='world')q.stuck=null;
    q.vx=0;q.vy=0;continue;
   }
   if(q.stuck?.kind==='player')continue;
   q.face=dir>0.1?1:dir<-.1?-1:q.face;
   const desired=dir*235,rate=q.ground?1900:930;
   q.vx+=clamp(desired-q.vx,-rate*step,rate*step);
   q.vy=clamp(q.vy+1150*step,-750,680);
   const ox=q.x,oy=q.y;
   q.x+=q.vx*step;resolvePlayer(q,ox,oy,solids);
   const iy=q.y;q.y+=q.vy*step;resolvePlayer(q,q.x,iy,solids);
   q.coyote=q.ground?.095:Math.max(0,q.coyote-step);
   if(q.x<R){q.x=R;q.vx=0;}if(q.x>W-R){q.x=W-R;q.vx=0;}
   if(q.y>H+80)spawn(w,q);
   for(const s of d.springs||[]){
    if(Math.abs(q.x-s.x)<41&&Math.abs(q.y+R-s.y)<16&&q.vy>=-20){q.vy=-790;q.ground=false;q.coyote=0;q.squash=1;}
   }
  }
  // Anchored bodies follow their partner while preserving the offset.
  for(let i=0;i<2;i++)for(const q of w.players){
   if(q.stuck?.kind!=='player')continue;
   const anchor=w.players.find(a=>a.id===q.stuck.id);
   if(!anchor||anchor===q){q.stuck=null;continue;}
   const wantedX=anchor.x+q.stuck.dx,wantedY=anchor.y+q.stuck.dy;
   q.vx=(wantedX-q.x)/Math.max(step,.001);q.vy=(wantedY-q.y)/Math.max(step,.001);
   q.x=wantedX;q.y=wantedY;q.ground=false;q.coyote=0;
  }
  // Friendly bodies do not overlap; unattached characters push one another.
  for(let i=0;i<w.players.length;i++)for(let j=i+1;j<w.players.length;j++){
   const a=w.players[i],b=w.players[j];if(a.stuck?.kind==='player'||b.stuck?.kind==='player')continue;
   const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
   if(dist<R*1.7){let n=(R*1.7-dist)*.5;a.x-=dx/dist*n;b.x+=dx/dist*n;}
  }
  if(w.ball){
   const b=w.ball;const ox=b.x,oy=b.y;b.vy+=1060*step;b.x+=b.vx*step;b.y+=b.vy*step;b.vx*=Math.exp(-1.2*step);
   for(const s of solids)if(boxHit(b.x,b.y,b.r,s)){
    if(oy+b.r<=s.y+10&&b.vy>=0){b.y=s.y-b.r;b.vy=0;b.vx*=.97;}
    else if(ox+b.r<=s.x){b.x=s.x-b.r;b.vx=-Math.abs(b.vx)*.3;}
    else if(ox-b.r>=s.x+s.w){b.x=s.x+s.w+b.r;b.vx=Math.abs(b.vx)*.3;}
   }
   for(const q of w.players){
    const dx=b.x-q.x,dy=b.y-q.y,dd=Math.hypot(dx,dy)||1,limit=b.r+R;
    if(dd<limit&&dd>0){const f=(limit-dd)/dd;b.x+=dx*f*.9;b.y+=dy*f*.35;b.vx+=q.vx*.48+dx/dd*50; }
   }
   if(b.y>H+60){b.x=d.ball.x;b.y=d.ball.y;b.vx=0;b.vy=0;}
  }
  if(d.target&&w.ball&&Math.abs(w.ball.x-d.target.x)<45&&Math.abs(w.ball.y-(d.target.y-26))<24)w.gateOpen=true;
  if(d.pads&&!w.gateOpen){
   w.pads=d.pads.map(pad=>w.players.some(q=>Math.abs(q.x-pad.x)<39&&Math.abs((q.y+R)-pad.y)<22));
   if(w.pads.every(Boolean))w.gateOpen=true;
  }
  if(w.players.length&&w.players.every(q=>q.x>955&&q.y<545)){
   w.won=true; if(w.level===LEVELS.length-1){w.finished=true;}
   else resetLevel(w,w.level+1);
   return;
  }
 }
 w.revision++;
}
export function getView(w){
 return {level:w.level,players:w.players.map(q=>({id:q.id,name:q.name,x:+q.x.toFixed(1),y:+q.y.toFixed(1),vx:+q.vx.toFixed(1),vy:+q.vy.toFixed(1),face:q.face,stuck:q.stuck,squash:+q.squash.toFixed(2),dead:q.dead})),ball:w.ball?{x:w.ball.x,y:w.ball.y,r:w.ball.r}:null,pads:w.pads,gateOpen:w.gateOpen,clock:w.clock,falls:w.falls,finished:w.finished,revision:w.revision};
}
