// Shared deterministic gameplay for local co-op, prediction and the pinned PocketNet server.
// 90 Hz substeps; no browser APIs. Hard rope constraints are solved after collisions.
export const WIDTH=1180, HEIGHT=620, RADIUS=18, FLOOR=540;
export const ROPE={slack:118,soft:152,max:250,spring:27,damping:9,reel:174};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rect=(x,y,w,h)=>({x,y,w,h});
export const CHAPTERS=[
 {name:'В одной связке',hint:'Каждый держит свою кнопку',type:'plates',x:330,spread:480,hold:.65,floors:[[0,540,1180,80]]},
 {name:'Не отпускай',hint:'Перепрыгните яму вместе и соберите искру',type:'gap',x:655,spread:330,hold:.75,floors:[[0,540,438,80],[570,540,610,80]],stars:[[501,413]]},
 {name:'Живой якорь',hint:'Перекиньте резинку через штырь. Один держит ЯКОРЬ, другой тянет',type:'beam',floors:[[0,540,1180,80]],hooks:[[524,508]],wheels:[0],beacons:[[524,522]],anchor:true,sequence:['wheels','beacons']},
 {name:'Небесные пуговицы',hint:'Сначала достаньте искры. Затем вся команда должна одновременно удерживать кнопки',type:'spring',x:655,spread:300,hold:.85,floors:[[0,540,1180,80]],platforms:[[430,424,124,20],[760,420,125,20]],springs:[308,580],stars:[[397,300],[665,320]],sequence:['stars','pads']},
 {name:'Никого не бросим',hint:'Маятник мешает занять места. Удержите все кнопки две секунды',type:'sync',x:365,spread:490,hold:2,floors:[[0,540,1180,80]],hazards:[[288,492,55,1.65,21]]},
 {name:'Силовое поле',hint:'Зацепите резинку, раскрутите барабан. Только затем достаньте искру и натяните связь',type:'tension',floors:[[0,540,1180,80]],hooks:[[505,507]],wheels:[0],tension:true,anchor:true,stars:[[684,404]],sequence:['wheels','stars','tension']},
 {name:'Качели',hint:'Вместе на лифте достаньте искры. Затем удержите кнопки',type:'lift',x:690,spread:290,hold:1.2,floors:[[0,540,1180,80]],platforms:[[398,438,100,18],[810,424,113,18]],lifts:[[548,440,112,18,59,2.8]],hazards:[[705,440,75,2.1,19]],stars:[[600,293],[844,319]],sequence:['stars','pads']},
 {name:'Подвесной мост',hint:'Прыгайте через островки. Связка удержит товарища',type:'islands',x:765,spread:214,hold:1,floors:[[0,540,306,80],[450,540,200,80],[738,540,442,80]],platforms:[[334,450,110,20],[682,438,96,20]],springs:[246,606],stars:[[372,331],[701,321]]},
 {name:'Последнее натяжение',hint:'По очереди запустите барабан, соберите искры и зарядите резинку',type:'finale',x:733,spread:235,hold:1.2,floors:[[0,540,436,80],[568,540,612,80]],platforms:[[463,431,116,18],[734,422,112,18]],springs:[325],hooks:[[668,508]],wheels:[0],beacons:[[780,522]],stars:[[375,318],[690,306]],tension:true,anchor:true,sequence:['wheels','stars','pads','beacons','tension']},
 {name:'На растяжке',hint:'Натяните ленту на штыре, а затем пролетите к верхним искрам',type:'sling',floors:[[0,540,1180,80]],platforms:[[436,410,130,18],[712,384,134,18]],hooks:[[525,507]],wheels:[0],stars:[[489,283],[766,277]],springs:[325],sequence:['wheels','stars']},
 {name:'Друг в беде',hint:'Сорвитесь в пропасть и вытяните друга резинкой. Затем откройте ворота',type:'rescue',x:734,spread:220,hold:1.3,floors:[[0,540,439,80],[573,540,607,80]],platforms:[[468,434,96,18]],springs:[361],rescue:true,stars:[[520,323]],sequence:['rescue','stars','pads']},
 {name:'Узел на память',hint:'Два барабана, две искры, общий заряд. Ошибки исправляются вместе',type:'master',x:731,spread:237,hold:1.5,floors:[[0,540,1180,80]],platforms:[[420,430,110,18],[702,413,110,18]],hooks:[[426,507],[640,507]],wheels:[0,1],stars:[[485,305],[751,293]],hazards:[[820,490,54,1.7,18]],tension:true,anchor:true,sequence:['wheels','stars','tension','pads']}
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
 hooks:(spec.hooks||[]).map(([x,y])=>({x,y})),wheels:spec.wheels||[],sequence:spec.sequence||[],rescue:!!spec.rescue,
 pads:spec.x?Array.from({length:n},(_,i)=>({x:spec.x+span*i/(n-1),y:FLOOR,owner:i})):[],
 hold:spec.hold||0,tension:!!spec.tension,anchor:!!spec.anchor,
 requiredLinks:spec.tension?Math.max(1,Math.ceil((n-1)*.5)):0,
 gate:rect(1036,0,31,FLOOR),finishX:1102};
}
const spawn=(p,i)=>({id:p.id,name:p.name||'Игрок',x:92+i*42,y:FLOOR-RADIUS,vx:0,vy:0,ground:true,anchor:false,coyote:.1,jumpHeld:false,face:1,falls:0,squash:0,checkpoint:0,hang:0,slingshot:0});
export function worldFor(players,level=0){
 const stage=stageFor(level,players.length);
 return {level,stage,players:players.map(spawn),inputs:{},pads:stage.pads.map(()=>false),
 stars:stage.stars.map(()=>false),beacons:stage.beacons.map(()=>false),
 wraps:players.slice(1).map(()=>-1),wheelCharge:stage.wheels.map(()=>0),wheelDone:stage.wheels.map(()=>false),
 phase:0,phaseTime:0,saveCount:0,tensionCharge:0,tensionDone:false,plateCharge:0,gateOpen:false,clock:0,revision:0,finished:false,falls:0};
}
export function reset(w,level=w.level){const v=worldFor(w.players.map(p=>({id:p.id,name:p.name})),level);Object.assign(w,v);}
export function movingPlatforms(s,time){
 return (s.lifts||[]).map(l=>({x:l.x,y:l.y+Math.sin(time*Math.PI*2/l.period)*l.amp,w:l.w,h:l.h,moving:true}));
}
export function movingHazards(s,time,phase=0){
 const rate=s.kind==='lift'&&phase>=1?1.5:1;
 return (s.hazards||[]).map(h=>({x:h.x+Math.sin(time*rate*Math.PI*2/h.period)*h.amp,y:h.y,r:h.r}));
}
function rescueBridge(w){return w.stage.rescue&&w.phase>=1?rect(439,530-22*clamp(w.phaseTime/.55,0,1),136,18):null;}
function solids(w){return [...w.stage.floors,...w.stage.platforms,...movingPlatforms(w.stage,w.clock),...(rescueBridge(w)?[rescueBridge(w)]:[]),...(w.gateOpen?[]:[w.stage.gate])];}
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
// One hook per neighbouring rubber-band segment. Latching is contact-driven, not a button:
// the band catches a peg only if the straight segment actually passes its head.
const distanceToSegment=(x,y,a,b)=>{
 const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy||1;
 const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/d,0,1);
 return {t,d:Math.hypot(a.x+t*dx-x,a.y+t*dy-y)};
};
export function ropePath(w,i){
 const a=w.players[i],b=w.players[i+1],hook=w.stage.hooks?.[w.wraps?.[i]];
 return hook?[a,hook,b]:[a,b];
}
export function ropeDistance(w,i){
 const pts=ropePath(w,i);let d=0;
 for(let j=1;j<pts.length;j++)d+=Math.hypot(pts[j].x-pts[j-1].x,pts[j].y-pts[j-1].y);
 return d;
}
function updateWraps(w){
 const hooks=w.stage.hooks||[];
 if(!Array.isArray(w.wraps)||w.wraps.length!==w.players.length-1)w.wraps=w.players.slice(1).map(()=>-1);
 for(let i=0;i<w.players.length-1;i++){
  const a=w.players[i],b=w.players[i+1],current=w.wraps[i];
  if(current>=0){
   const h=hooks[current],near=distanceToSegment(h.x,h.y,a,b);
   // Unhook once both bodies pass to the same side of the peg and the cord clears it.
   if(!h||(a.x-h.x)*(b.x-h.x)>0&&near.d>35)w.wraps[i]=-1;
  } else {
   let closest=-1,delta=27;
   for(let k=0;k<hooks.length;k++){
    const h=hooks[k],hit=distanceToSegment(h.x,h.y,a,b);
    if(hit.t>.14&&hit.t<.86&&hit.d<delta){
     const ad=Math.hypot(a.x-h.x,a.y-h.y),bd=Math.hypot(b.x-h.x,b.y-h.y);
     if(ad>40&&bd>40){delta=hit.d;closest=k;}
    }
   }
   if(closest>=0)w.wraps[i]=closest;
  }
 }
}
export function constrainRope(w,blocks,dt){
 const players=w.players;
 for(let pass=0;pass<10;pass++){
  for(let i=0;i<players.length-1;i++){
   const a=players[i],b=players[i+1],path=ropePath(w,i),hook=path.length===3?path[1]:null;
   const d=ropeDistance(w,i),limit=(a.anchor&&b.hang>0||b.anchor&&a.hang>0)?ROPE.reel:ROPE.max;
   if(d<=ROPE.slack)continue;
   // At a fixed peg, endpoint gradients point toward the peg, rather than toward
   // the other player. This also makes the bend in the band physically meaningful.
   const ax=hook?hook.x-a.x:b.x-a.x,ay=hook?hook.y-a.y:b.y-a.y;
   const bx=hook?hook.x-b.x:a.x-b.x,by=hook?hook.y-b.y:a.y-b.y;
   const al=Math.hypot(ax,ay)||1,bl=Math.hypot(bx,by)||1;
   const ux=ax/al,uy=ay/al,vx=bx/bl,vy=by/bl;
   const ma=a.anchor?0:1,mb=b.anchor?0:1,den=ma+mb||1;
   // The elastic spring is applied once per integration step, not once per
   // positional-constraint iteration.
   if(pass===0&&dt>0){
    const radial= -(a.vx*ux+a.vy*uy+b.vx*vx+b.vy*vy);
    const impulse=Math.max(0,(d-ROPE.slack)*ROPE.spring+radial*ROPE.damping)*dt/den;
    a.vx+=ux*impulse*ma;a.vy+=uy*impulse*ma;
    b.vx+=vx*impulse*mb;b.vy+=vy*impulse*mb;
   }
   if(d>limit+.003){
    const step=(d-limit)/den;
    a.x+=ux*step*ma;a.y+=uy*step*ma;
    b.x+=vx*step*mb;b.y+=vy*step*mb;
    resolveStatic(a,blocks);resolveStatic(b,blocks);
   }
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
export function currentGoal(w){return w.stage.sequence?.[w.phase]||null;}
function goalActive(w,name){const goal=currentGoal(w);return !w.stage.sequence?.length||goal===name;}
function complete(w,name){
 if(name==='pads')return w.plateCharge>=1;
 if(name==='stars')return w.stars.every(Boolean);
 if(name==='beacons')return w.beacons.every(Boolean);
 if(name==='wheels')return w.wheelDone.every(Boolean);
 if(name==='tension')return w.tensionDone;
 if(name==='rescue')return w.saveCount>0;
 return false;
}
function updateGoals(w,dt){
 const s=w.stage,ps=w.players,goal=currentGoal(w);
 w.pads=s.pads.map(p=>{const actor=ps[p.owner];return !!actor?.ground&&Math.abs(actor.x-p.x)<30&&Math.abs(actor.y+RADIUS-p.y)<13;});
 if(goalActive(w,'pads')&&s.pads.length){
  const held=w.pads.every(Boolean);
  w.plateCharge=clamp(w.plateCharge+(held?dt/(s.hold||.7):-dt/.48),0,1);
 }
 if(goalActive(w,'stars'))for(let i=0;i<s.stars.length;i++){
  if(!w.stars[i]&&ps.some(p=>Math.hypot(p.x-s.stars[i].x,p.y-s.stars[i].y)<34))w.stars[i]=true;
 }
 if(goalActive(w,'beacons'))for(let i=0;i<s.beacons.length;i++)if(!w.beacons[i]){
  const b=s.beacons[i];
  for(let j=0;j<ps.length-1;j++){
   const a=ps[j],p=ps[j+1],dx=p.x-a.x,dy=p.y-a.y;
   if(!dx)continue;
   const ratio=(b.x-a.x)/dx,y=a.y+dy*ratio;
   if(ratio>=0&&ratio<=1&&Math.abs(y-b.y)<24&&ropeDistance(w,j)>=ROPE.soft&&(a.anchor||p.anchor)){
    w.beacons[i]=true;break;
   }
  }
 }
 if(goalActive(w,'wheels'))for(let i=0;i<(s.wheels||[]).length;i++){
  if(w.wheelDone[i])continue;
  const pegIndex=s.wheels[i];
  const winding=w.wraps.some((hook,j)=>hook===pegIndex&&ropeDistance(w,j)>=ROPE.soft&&
    (ps[j].anchor||ps[j+1].anchor));
  w.wheelCharge[i]=clamp(w.wheelCharge[i]+(winding?dt/1.2:-dt/.65),0,1);
  if(w.wheelCharge[i]>=1)w.wheelDone[i]=true;
 }
 if(goalActive(w,'tension')&&s.tension&&!w.tensionDone){
  let taut=0;
  for(let j=0;j<ps.length-1;j++)if(ropeDistance(w,j)>=ROPE.soft+20)taut++;
  const valid=taut>=s.requiredLinks&&ps.some(p=>p.anchor);
  w.tensionCharge=clamp(w.tensionCharge+(valid?dt/1.6:-dt/.6),0,1);
  if(w.tensionCharge>=1)w.tensionDone=true;
 }
 if(s.sequence?.length){
  if(complete(w,goal)){
   w.phase++;w.phaseTime=0;
  }else w.phaseTime+=dt;
  if(w.phase>=s.sequence.length)w.gateOpen=true;
 }else if((!s.pads.length||w.plateCharge>=1)&&w.stars.every(Boolean)&&
  w.beacons.every(Boolean)&&w.wheelDone.every(Boolean)&&(!s.tension||w.tensionDone)&&
  (!s.rescue||w.saveCount>0))w.gateOpen=true;
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
    const spring=w.players.some(q=>q!==p&&q.anchor&&Math.hypot(q.x-p.x,q.y-p.y)>180);
    p.anchor=false;p.vy=spring?-686:-535;p.vx+=spring?p.face*115:0;
    p.y-=2;p.ground=false;p.coyote=0;p.squash=spring?1:.8;
   }
   p.jumpHeld=jump;if(dir)p.face=dir>0?1:-1;
   if(p.anchor){p.vx=0;p.vy=Math.max(0,p.vy);}
   else{
    const rate=dir?(p.ground?1830:1320):(p.ground?2150:360);
    p.vx+=clamp(dir*254-p.vx,-rate*dt,rate*dt);
    p.vy=clamp(p.vy+1060*dt,-850,750);
   }
  }
  updateWraps(w);
  constrainRope(w,blocks,dt);
  for(let i=0;i<w.players.length;i++){
   const p=w.players[i];p.vx=clamp(p.vx,-400,400);p.vy=clamp(p.vy,-850,760);
   resolveMove(p,dt,blocks);
   if(p.ground&&!p.anchor)for(const b of w.stage.springs)if(Math.abs(p.x-b.x)<31&&Math.abs(p.y+RADIUS-b.y)<12){
    p.vy=-785;p.y-=3;p.ground=false;p.coyote=0;p.squash=1;break;
   }
   // Falling friends remain on the band; a grounded teammate can brace and reel
   // the dangling body toward safety before the generous recovery timeout.
   const oldHang=p.hang||0;
   const dangling=p.y>FLOOR+40&&!p.ground;
   p.hang=dangling?oldHang+dt:oldHang>0?oldHang:0;
   if(p.hang>0){
    const helper=[w.players[i-1],w.players[i+1]].find(q=>q?.anchor&&q.ground);
    if(helper){
     p.vy=Math.min(p.vy,-260);p.y-=Math.min(3.4,dt*165);
     // Reel inward: clear the ledge rather than hold the friend in place forever.
     const toward=helper.x-p.x;p.vx+=clamp(toward*.038,-11,11);
    }
    if((p.ground||p.y<FLOOR-34)&&!dangling){w.saveCount++;p.hang=0;p.squash=1;}
   }
   if(p.y>HEIGHT+188||p.hang>7)respawn(w,p,i);
   if(p.ground&&p.x>720&&w.stage.floors.some(f=>f.x>520&&p.x>f.x+25&&p.x<f.x+f.w-25))p.checkpoint=1;
  }
  // Collision correction runs again without applying a second spring impulse.
  updateWraps(w);
  constrainRope(w,blocks,0);
  for(let i=0;i<w.players.length;i++)for(let j=i+1;j<w.players.length;j++){
   const a=w.players[i],b=w.players[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
   if(d<2*RADIUS-2){const push=(2*RADIUS-2-d)*.5;if(!a.anchor)a.x-=dx/d*push;if(!b.anchor)b.x+=dx/d*push;}
  }
  updateWraps(w);
  constrainRope(w,blocks,0);
  for(const hazard of movingHazards(w.stage,w.clock,w.phase))for(let i=0;i<w.players.length;i++){
   const p=w.players[i];if(Math.hypot(p.x-hazard.x,p.y-hazard.y)<RADIUS+hazard.r-3)respawn(w,p,i);
  }
  if(updateGoals(w,dt))break;
 }
 w.revision++;
}
export const viewWorld=w=>({
 level:w.level,stage:w.stage,players:w.players.map(p=>({id:p.id,name:p.name,x:+p.x.toFixed(2),y:+p.y.toFixed(2),
 vx:+p.vx.toFixed(2),vy:+p.vy.toFixed(2),ground:p.ground,anchor:p.anchor,face:p.face,squash:p.squash,hang:p.hang,falls:p.falls})),
 pads:w.pads,stars:w.stars,beacons:w.beacons,tensionCharge:w.tensionCharge,tensionDone:w.tensionDone,
 plateCharge:w.plateCharge,wraps:w.wraps,wheelCharge:w.wheelCharge,wheelDone:w.wheelDone,
 phase:w.phase,phaseTime:w.phaseTime,saveCount:w.saveCount,gateOpen:w.gateOpen,clock:w.clock,finished:w.finished,revision:w.revision,falls:w.falls
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
  for(const h of s.hooks)if(!ground.some(f=>h.x>f.x+22&&h.x<f.x+f.w-22))errors.push([n,level,'hook unsupported']);
  if(s.wheels.some(k=>k<0||k>=s.hooks.length))errors.push([n,level,'invalid wheel']);
  if(s.sequence.some(g=>!['wheels','stars','pads','tension','beacons','rescue'].includes(g)))errors.push([n,level,'unknown goal']);
  if(s.tension&&s.requiredLinks>n-1)errors.push([n,level,'too many taut segments']);
 }
 return errors;
}


const roomView=s=>({phase:s.phase,host:s.host,players:s.players,world:s.world?viewWorld(s.world):null,levels:CHAPTERS.length});
const events=s=>[{type:'state',payload:roomView(s)}];
function reconcile(state,players){
 state.players=players;
 if(!players.some(p=>p.id===state.host))state.host=players[0]?.id||'';
}
const game={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,players:[player],phase:'lobby',world:null,lastTick:Date.now(),lastBroadcast:0,lastInput:{}}};},
 onJoin({state,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  reconcile(state,players);return {state,events:events(state)};
 },
 onLeave({state,players}){
  reconcile(state,players);
  if(state.phase==='play'){
   if(players.length<MIN_PLAYERS){state.phase='lobby';state.world=null;}
   else{state.world=worldFor(players,state.world.level);state.lastTick=Date.now();state.lastInput={};}
  }
  return {state,events:events(state)};
 },
 onMessage({state,player,payload}){
  const a=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(a.type==='sync')return {state,events:[{type:'state',to:player.id,payload:roomView(state)}]};
  if(a.type==='start'&&player.id===state.host&&(state.phase==='lobby'||state.phase==='done')){
   if(state.players.length<MIN_PLAYERS||state.players.length>MAX_PLAYERS)
    return {state,events:[{type:'notice',to:player.id,payload:'Нужно от двух до пяти игроков'}]};
   state.world=worldFor(state.players);state.phase='play';state.lastTick=Date.now();state.lastInput={};
   return {state,events:events(state)};
  }
  if(a.type==='restart'&&state.phase==='play'&&player.id===state.host){
   reset(state.world);state.lastTick=Date.now();state.lastInput={};
   return {state,events:events(state)};
  }
  if(a.type==='input'&&state.phase==='play'){
   const now=Date.now(),last=state.lastInput[player.id]||0,dir=Number(a.dir);
   if(now-last<33)return {state,events:[]};
   if(!Number.isFinite(dir)||Math.abs(dir)>1)return {state,events:[]};
   state.lastInput[player.id]=now;
   state.world.inputs[player.id]={dir,jump:a.jump===true,anchor:a.anchor===true,at:now};
   const oldLevel=state.world.level,elapsed=clamp((now-state.lastTick)/1000,0,.16);
   state.lastTick=now;simulate(state.world,elapsed,now);
   if(state.world.finished)state.phase='done';
   if(now-state.lastBroadcast>=55||oldLevel!==state.world.level||state.phase==='done'){
    state.lastBroadcast=now;return {state,events:events(state)};
   }
   return {state,events:[]};
  }
  return {state,events:[]};
 }
};
export default game;
