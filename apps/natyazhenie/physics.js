// Shared deterministic gameplay for local co-op, prediction and the pinned PocketNet server.
// 90 Hz substeps; no browser APIs. Hard rope constraints are solved after collisions.
export const WIDTH=1180, HEIGHT=620, RADIUS=18, FLOOR=540;
export const ROPE={slack:128,soft:162,max:242,spring:24,damping:8};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rect=(x,y,w,h)=>({x,y,w,h});
export const CHAPTERS=[
 {name:'В одной связке',hint:'Каждый держит свою кнопку',type:'plates',x:330,spread:480,hold:.65,floors:[[0,540,1180,80]]},
 {name:'Не отпускай',hint:'Перепрыгните яму вместе и соберите искру',type:'gap',x:655,spread:330,hold:.75,floors:[[0,540,438,80],[570,540,610,80]],stars:[[501,413]]},
 {name:'Живой якорь',hint:'Shift / ЯКОРЬ: держись за землю. Натяни ленту через кольцо',type:'beam',floors:[[0,540,1180,80]],beacons:[[524,522]],anchor:true},
 {name:'Небесные пуговицы',hint:'Пружины подбросят к искрам, потом займитесь кнопками',type:'spring',x:655,spread:300,hold:.85,floors:[[0,540,1180,80]],platforms:[[430,424,124,20],[760,420,125,20]],springs:[308,580],stars:[[397,300],[665,320]]},
 {name:'Никого не бросим',hint:'Одновременно удержите свои места, обходя маятник',type:'sync',x:365,spread:490,hold:1.2,floors:[[0,540,1180,80]],hazards:[[288,492,55,1.65,21]]},
 {name:'Силовое поле',hint:'Держите ЯКОРЬ и натягивайте связь, пока не заполнится шкала',type:'tension',floors:[[0,540,1180,80]],tension:true,anchor:true,stars:[[684,404]]},
 {name:'Качели',hint:'Лифт и маятники: держите связку и достаньте искры',type:'lift',x:690,spread:290,hold:.85,floors:[[0,540,1180,80]],platforms:[[398,438,100,18],[810,424,113,18]],lifts:[[548,440,112,18,59,2.8]],hazards:[[705,440,75,2.1,19]],stars:[[600,293],[844,319]]},
 {name:'Подвесной мост',hint:'Прыгайте через островки. Связка удержит товарища',type:'islands',x:765,spread:214,hold:1,floors:[[0,540,306,80],[450,540,200,80],[738,540,442,80]],platforms:[[334,450,110,20],[682,438,96,20]],springs:[246,606],stars:[[372,331],[701,321]]},
 {name:'Последнее натяжение',hint:'Искры, кольцо, натяжение и все кнопки — одновременно',type:'finale',x:733,spread:235,hold:1.2,floors:[[0,540,436,80],[568,540,612,80]],platforms:[[463,431,116,18],[734,422,112,18]],springs:[325],beacons:[[780,522]],stars:[[375,318],[690,306]],tension:true,anchor:true}
];
export const MIN_PLAYERS=2,MAX_PLAYERS=5;
export function stageFor(level,count){
 const spec=CHAPTERS[clamp(level|0,0,CHAPTERS.length-1)],n=clamp(count|0,2,5);
 const span=n===2?Math.min(214,spec.spread||214):spec.spread||0;
 return {index:level,name:spec.name,hint:spec.hint,kind:spec.type,theme:level%6,
 floors:spec.floors.map(a=>rect(...a)),platforms:(spec.platforms||[]).map(a=>rect(...a)),
 lifts:(spec.lifts||[]).map(a=>({x:a[0],y:a[1],w:a[2],h:a[3],amp:a[4],period:a[5]})),
 springs:(spec.springs||[]).map(x=>({x,y:FLOOR})),
 hazards:(spec.hazards||[]).map(a=>({x:a[0],y:a[1],amp:a[2],period:a[3],r:a[4]})),
 stars:(spec.stars||[]).map(([x,y])=>({x,y})),
 beacons:(spec.beacons||[]).map(([x,y])=>({x,y})),
 pads:spec.x?Array.from({length:n},(_,i)=>({x:spec.x+span*i/(n-1),y:FLOOR,owner:i})):[],
 hold:spec.hold||0,tension:!!spec.tension,anchor:!!spec.anchor,
 requiredLinks:spec.tension?Math.max(1,Math.ceil((n-1)*.5)):0,
 gate:rect(1036,0,31,FLOOR),finishX:1102};
}
const spawn=(p,i)=>({id:p.id,name:p.name||'Игрок',x:92+i*42,y:FLOOR-RADIUS,vx:0,vy:0,ground:true,anchor:false,coyote:.1,jumpHeld:false,face:1,falls:0,squash:0,checkpoint:0});
export function worldFor(players,level=0){
 const stage=stageFor(level,players.length);
 return {level,stage,players:players.map(spawn),inputs:{},pads:stage.pads.map(()=>false),
 stars:stage.stars.map(()=>false),beacons:stage.beacons.map(()=>false),
 tensionCharge:0,tensionDone:false,plateCharge:0,gateOpen:false,clock:0,revision:0,finished:false,falls:0};
}
export function reset(w,level=w.level){const v=worldFor(w.players.map(p=>({id:p.id,name:p.name})),level);Object.assign(w,v);}
export function movingPlatforms(s,time){
 return (s.lifts||[]).map(l=>({x:l.x,y:l.y+Math.sin(time*Math.PI*2/l.period)*l.amp,w:l.w,h:l.h,moving:true}));
}
export function movingHazards(s,time){
 return (s.hazards||[]).map(h=>({x:h.x+Math.sin(time*Math.PI*2/h.period)*h.amp,y:h.y,r:h.r}));
}
function solids(w){return [...w.stage.floors,...w.stage.platforms,...movingPlatforms(w.stage,w.clock),...(w.gateOpen?[]:[w.stage.gate])];}
function overlap(p,s){return p.x+RADIUS>s.x&&p.x-RADIUS<s.x+s.w&&p.y+RADIUS>s.y&&p.y-RADIUS<s.y+s.h;}
function resolveMove(p,dt,blocks){
 const ox=p.x,oy=p.y;p.x+=p.vx*dt;
 for(const s of blocks)if(overlap(p,s)){
  if(ox+RADIUS<=s.x+5&&p.vx>0){p.x=s.x-RADIUS;p.vx=0;}
  else if(ox-RADIUS>=s.x+s.w-5&&p.vx<0){p.x=s.x+s.w+RADIUS;p.vx=0;}
 }
 p.x=clamp(p.x,RADIUS,WIDTH-RADIUS);p.y+=p.vy*dt;p.ground=false;
 for(const s of blocks)if(overlap(p,s)){
  if(oy+RADIUS<=s.y+9&&p.vy>=0){p.y=s.y-RADIUS;p.vy=0;p.ground=true;p.squash=Math.max(p.squash||0,.65);}
  else if(oy-RADIUS>=s.y+s.h-6&&p.vy<0){p.y=s.y+s.h+RADIUS;p.vy=0;}
  else if(s.y===0&&s.h>=FLOOR){p.x=p.x<s.x+s.w/2?s.x-RADIUS:s.x+s.w+RADIUS;p.vx=0;}
  else if(p.y<s.y+s.h/2){p.y=s.y-RADIUS;p.vy=0;p.ground=true;}
  else{p.y=s.y+s.h+RADIUS;p.vy=0;}
 }
 p.y=Math.max(RADIUS,p.y);
 // Keep resting contact sticky at exact floor height; otherwise an anchored
 // character alternates between airborne and grounded every second substep.
 if(!p.ground&&p.vy>=0)for(const s of blocks){
  if(p.x+RADIUS>s.x&&p.x-RADIUS<s.x+s.w&&Math.abs(p.y+RADIUS-s.y)<2.7){
   p.y=s.y-RADIUS;p.vy=0;p.ground=true;break;
  }
 }
}
function resolveStatic(p,blocks){
 p.x=clamp(p.x,RADIUS,WIDTH-RADIUS);p.y=Math.max(RADIUS,p.y);
 for(const s of blocks)if(overlap(p,s)){
  const l=p.x+RADIUS-s.x,r=s.x+s.w-p.x+RADIUS,t=p.y+RADIUS-s.y,b=s.y+s.h-p.y+RADIUS;
  const min=Math.min(l,r,t,b);
  if(s.y===0&&s.h>=FLOOR||min===l){p.x=s.x-RADIUS;p.vx=Math.min(0,p.vx);}
  else if(min===r){p.x=s.x+s.w+RADIUS;p.vx=Math.max(0,p.vx);}
  else if(min===t){p.y=s.y-RADIUS;p.vy=Math.min(0,p.vy);p.ground=true;}
  else{p.y=s.y+s.h+RADIUS;p.vy=Math.max(0,p.vy);}
 }
 p.x=clamp(p.x,RADIUS,WIDTH-RADIUS);
}
export function constrainRope(players,blocks,dt){
 // Taut rope: damp radial relative velocity and share force before projection.
 for(let i=0;i<players.length-1;i++){
  const a=players[i],b=players[i+1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
  if(d<=ROPE.slack)continue;
  const nx=dx/d,ny=dy/d,relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  const impulse=Math.max(0,(d-ROPE.slack)*ROPE.spring+relative*ROPE.damping)*dt;
  const ma=a.anchor?0:1,mb=b.anchor?0:1,total=ma+mb||1;
  a.vx+=nx*impulse*ma/total;a.vy+=ny*impulse*ma/total;
  b.vx-=nx*impulse*mb/total;b.vy-=ny*impulse*mb/total;
 }
 // XPBD-style positional solve: hard finite maximum, no frame-scale spring loophole.
 for(let pass=0;pass<9;pass++){
  for(let i=0;i<players.length-1;i++){
   const a=players[i],b=players[i+1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
   if(d<=ROPE.max+.002)continue;
   const ma=a.anchor?0:1,mb=b.anchor?0:1,total=ma+mb;
   if(total===0)continue;
   const pull=(d-ROPE.max)/total,nx=dx/d,ny=dy/d;
   a.x+=nx*pull*ma;a.y+=ny*pull*ma;
   b.x-=nx*pull*mb;b.y-=ny*pull*mb;
   resolveStatic(a,blocks);resolveStatic(b,blocks);
  }
 }
}
function respawn(w,p,i){
 const falls=(p.falls||0)+1;
 const ref=w.players[Math.max(0,i-1)]||w.players[Math.min(w.players.length-1,i+1)];
 const side=p.checkpoint?790:90+i*42;
 const x=ref&&Math.abs(ref.x-side)>ROPE.max?clamp(ref.x+(ref.x>side?-160:160),RADIUS,WIDTH-RADIUS):side;
 // Respawn on a supported portion of the ground; all chapters have spawn floor.
 const floor=w.stage.floors.find(f=>x>=f.x+RADIUS&&x<=f.x+f.w-RADIUS);
 Object.assign(p,spawn(p,i),{x:floor?x:90+i*42,falls});w.falls++;
}
function updateGoals(w,dt){
 const s=w.stage,ps=w.players;
 w.pads=s.pads.map(p=>{const actor=ps[p.owner];return !!actor?.ground&&Math.abs(actor.x-p.x)<30&&Math.abs(actor.y+RADIUS-p.y)<13;});
 w.plateCharge=clamp(w.plateCharge+(w.pads.length&&w.pads.every(Boolean)?dt*1.45:-dt*.9),0,1);
 for(let i=0;i<s.stars.length;i++)if(!w.stars[i]&&ps.some(p=>Math.hypot(p.x-s.stars[i].x,p.y-s.stars[i].y)<34))w.stars[i]=true;
 for(let i=0;i<(s.beacons||[]).length;i++)if(!w.beacons[i]){
  const b=s.beacons[i];
  for(let j=0;j<ps.length-1;j++){
   const a=ps[j],p=ps[j+1],dx=p.x-a.x,dy=p.y-a.y;
   if(!dx)continue;
   const f=(b.x-a.x)/dx,yy=a.y+dy*f,dist=Math.hypot(dx,dy);
   if(f>=0&&f<=1&&Math.abs(yy-b.y)<24&&dist>=ROPE.soft&&(a.anchor||p.anchor)){w.beacons[i]=true;break;}
  }
 }
 if(s.tension&&!w.tensionDone){
  let taut=0;
  for(let i=0;i<ps.length-1;i++)if(Math.hypot(ps[i+1].x-ps[i].x,ps[i+1].y-ps[i].y)>=196)taut++;
  const valid=taut>=s.requiredLinks&&ps.some(p=>p.anchor);
  w.tensionCharge=clamp(w.tensionCharge+(valid?dt*.9:-dt*.75),0,1);
  if(w.tensionCharge>=1)w.tensionDone=true;
 }
 const done=(!s.pads.length||w.plateCharge>=1)&&w.stars.every(Boolean)&&w.beacons.every(Boolean)&&(!s.tension||w.tensionDone);
 if(done)w.gateOpen=true;
 if(w.gateOpen&&ps.some(p=>p.x>s.finishX)&&ps.every(p=>p.x>s.finishX-136&&p.y<FLOOR+RADIUS)){
  if(w.level===CHAPTERS.length-1)w.finished=true;else reset(w,w.level+1);
  return true;
 }
 return false;
}
export function simulate(w,seconds,now=Date.now()){
 let remaining=clamp(Number(seconds)||0,0,.16);
 while(remaining>0&&!w.finished){
  const dt=Math.min(1/90,remaining);remaining-=dt;w.clock+=dt;
  const blocks=solids(w);
  for(const p of w.players){
   const raw=w.inputs[p.id]||{},fresh=now-(raw.at||0)<460;
   const dir=fresh?clamp(Number(raw.dir)||0,-1,1):0,jump=fresh&&raw.jump===true,grab=fresh&&raw.anchor===true;
   p.squash=Math.max(0,(p.squash||0)-dt*2.4);
   p.coyote=p.ground?.11:Math.max(0,(p.coyote||0)-dt);
   p.anchor=!!(grab&&p.ground);
   if(jump&&!p.jumpHeld&&(p.ground||p.coyote>0)){
    p.anchor=false;p.vy=-535;p.y-=2;p.ground=false;p.coyote=0;p.squash=.8;
   }
   p.jumpHeld=jump;if(dir)p.face=dir>0?1:-1;
   if(p.anchor){p.vx=0;p.vy=Math.max(0,p.vy);}
   else{
    const rate=dir?(p.ground?1830:1320):(p.ground?2150:360);
    p.vx+=clamp(dir*254-p.vx,-rate*dt,rate*dt);
    p.vy=clamp(p.vy+1060*dt,-850,750);
   }
  }
  constrainRope(w.players,blocks,dt);
  for(let i=0;i<w.players.length;i++){
   const p=w.players[i];p.vx=clamp(p.vx,-400,400);p.vy=clamp(p.vy,-850,760);
   resolveMove(p,dt,blocks);
   if(p.ground&&!p.anchor)for(const b of w.stage.springs)if(Math.abs(p.x-b.x)<31&&Math.abs(p.y+RADIUS-b.y)<12){
    p.vy=-785;p.y-=3;p.ground=false;p.coyote=0;p.squash=1;break;
   }
   if(p.y>HEIGHT+62)respawn(w,p,i);
   if(p.ground&&p.x>720&&w.stage.floors.some(f=>f.x>520&&p.x>f.x+25&&p.x<f.x+f.w-25))p.checkpoint=1;
  }
  // Collision correction runs again without applying a second spring impulse.
  constrainRope(w.players,blocks,0);
  for(let i=0;i<w.players.length;i++)for(let j=i+1;j<w.players.length;j++){
   const a=w.players[i],b=w.players[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
   if(d<2*RADIUS-2){const push=(2*RADIUS-2-d)*.5;if(!a.anchor)a.x-=dx/d*push;if(!b.anchor)b.x+=dx/d*push;}
  }
  for(const hazard of movingHazards(w.stage,w.clock))for(let i=0;i<w.players.length;i++){
   const p=w.players[i];if(Math.hypot(p.x-hazard.x,p.y-hazard.y)<RADIUS+hazard.r-3)respawn(w,p,i);
  }
  if(updateGoals(w,dt))break;
 }
 w.revision++;
}
export const viewWorld=w=>({
 level:w.level,stage:w.stage,players:w.players.map(p=>({id:p.id,name:p.name,x:+p.x.toFixed(2),y:+p.y.toFixed(2),
 vx:+p.vx.toFixed(2),vy:+p.vy.toFixed(2),ground:p.ground,anchor:p.anchor,face:p.face,squash:p.squash,falls:p.falls})),
 pads:w.pads,stars:w.stars,beacons:w.beacons,tensionCharge:w.tensionCharge,tensionDone:w.tensionDone,
 plateCharge:w.plateCharge,gateOpen:w.gateOpen,clock:w.clock,finished:w.finished,revision:w.revision,falls:w.falls
});
export function validateLayouts(){
 const errors=[];
 for(let n=2;n<=5;n++)for(let level=0;level<CHAPTERS.length;level++){
  const s=stageFor(level,n),ground=s.floors.filter(f=>f.y===FLOOR);
  if(s.pads.length&&s.pads.length!==n)errors.push([n,level,'pad count']);
  for(let i=0;i<s.pads.length;i++){const p=s.pads[i];
   if(!ground.some(f=>p.x>f.x+RADIUS+4&&p.x<f.x+f.w-RADIUS-4))errors.push([n,level,'pad unsupported',p.x]);
   if(i&&p.x-s.pads[i-1].x<48)errors.push([n,level,'pad spacing']);
   if(p.x>=s.gate.x-30)errors.push([n,level,'pad beyond gate']);
  }
  for(let i=1;i<ground.length;i++){const gap=ground[i].x-(ground[i-1].x+ground[i-1].w);if(gap>150)errors.push([n,level,'unreachable floor gap']);}
  for(const star of s.stars){if(star.x>985||star.y<245||star.y>498)errors.push([n,level,'unreachable star']);}
  for(const b of s.beacons)if(!ground.some(f=>b.x>f.x+130&&b.x<f.x+f.w-130))errors.push([n,level,'beacon has no standing room']);
  if(s.tension&&s.requiredLinks>n-1)errors.push([n,level,'too many taut segments']);
 }
 return errors;
}
