// Shared deterministic gameplay for local co-op, prediction and the pinned PocketNet server.
// 90 Hz substeps; no browser APIs. Hard rope constraints are solved after collisions.
export const WIDTH=1180, HEIGHT=620, RADIUS=18, FLOOR=540;
export const ROPE={slack:118,soft:152,max:250,spring:27,damping:9,reel:174};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rect=(x,y,w,h)=>({x,y,w,h});
// Five complete prototype levels. Three players is the authoring baseline;
// 2/4/5 have deliberate geometries and participation rules.
export const CHAPTERS=[
 {name:'ПО ОДНОЙ ЛИНИИ',kind:'balance',theme:0,
  book:'Не просто стойте на местах. Все участники должны удерживать общую конструкцию в равновесии — резинка постоянно тянет соседей друг к другу.',
  second:'Следите за наклоном балок. Чем больше друзей, тем больше соединённых плеч.',image:'balance',
  floors:[[0,540,1180,80]]},
 {name:'ПОСЛЕДНИЙ НА ПЛОТУ',kind:'ferry',theme:3,
  book:'Плот движется, только когда один едет вперёд, а другой удерживается на берегу. Но якорному тоже нужно попасть на другой берег.',
  second:'Передавайте роль опоры друг другу. Никого не бросайте.',image:'ferry',
  floors:[[0,540,456,80],[708,540,472,80]]},
 {name:'НЕ РАЗБЕЙ!',kind:'cargo',theme:1,
  book:'Хрупкий шар подвешен посреди вашей связки. Проведите его через препятствия: иногда его нужно поднять, иногда опустить.',
  second:'Резкие движения раскачивают груз. Разбитый шар возвращает группу к началу.',image:'cargo',
  floors:[[0,540,1180,80]]},
 {name:'ВОЛНА',kind:'pulse',theme:5,
  book:'Встаньте на цветные метки и передайте прыжок по цепочке туда и обратно. Каждый прыгает, когда до него доходит импульс.',
  second:'Не спешите и не опаздывайте. Среднему игроку придётся ловить волну дважды.',image:'pulse',
  floors:[[0,540,1180,80]]},
 {name:'РАСПУТАЙСЯ!',kind:'braid',theme:2,
  book:'Завести резинку на все штыри нужно одновременно. После этого ворота откроются ненадолго — бегите всей командой.',
  second:'Не оставляйте якорного позади. Когда лента освободится, не потеряйте друг друга.',image:'braid',
  floors:[[0,540,1180,80]]}
];
const BALANCES={2:[580],3:[425,645],4:[350,560,770],5:[300,480,660,840]};
const PULSE_SLOTS={2:[425,650],3:[320,535,750],4:[240,435,630,825],5:[220,390,560,730,900]};
const BRAID_HOOKS={2:[585],3:[425,663],4:[325,520,715],5:[300,470,640,810]};
export const MIN_PLAYERS=2,MAX_PLAYERS=5;
export function stageFor(level,count){
 const spec=CHAPTERS[clamp(level|0,0,CHAPTERS.length-1)],n=clamp(count|0,2,5);
 const balance=spec.kind==='balance',ferry=spec.kind==='ferry',
  cargo=spec.kind==='cargo',pulse=spec.kind==='pulse',braid=spec.kind==='braid';
 const balanceXs=balance?BALANCES[n]:[];
 const hookXs=braid?BRAID_HOOKS[n]:[];
 return {
  index:clamp(level|0,0,CHAPTERS.length-1),name:spec.name,kind:spec.kind,theme:spec.theme,
  book:spec.book,second:spec.second,image:spec.image,
  floors:spec.floors.map(v=>rect(...v)),platforms:[],lifts:[],springs:[],hazards:[],stars:[],
  pads:[],beacons:[],sequence:[],wheels:[],signals:[],
  hooks:hookXs.map(x=>({x,y:508})),balances:balanceXs.map((x,i)=>({x,y:493,slot:i,hold:n===2?1.7:1.75})),
  ferry:ferry?{x:354,y:456,w:168,h:18,start:354,end:548}:null,
  cargo:cargo?{barriers:[rect(412,328,24,120),rect(618,265,24,120),rect(806,355,24,132)],end:914}:null,
  waveSlots:pulse?PULSE_SLOTS[n].map((x,i)=>({x,i})):[],
  waveSequence:pulse?[...Array.from({length:n},(_,i)=>i),...Array.from({length:n-1},(_,i)=>n-2-i)]:[],
  braid:braid?{hold:n===2?1.25:1.8,escape:8.2}:null,
  balance:null,rescue:false,tension:false,anchor:balance||braid||ferry,
  hold:0,signalWindow:0,escape:0,requiredLinks:0,
  gate:rect(1036,0,31,FLOOR),finishX:1102
 };
}
const spawn=(p,i)=>({id:p.id,name:p.name||'Игрок',x:92+i*42,y:FLOOR-RADIUS,vx:0,vy:0,ground:true,anchor:false,coyote:.1,jumpHeld:false,face:1,falls:0,squash:0,checkpoint:0,hang:0,slingshot:0});
export function worldFor(players,level=0){
 const stage=stageFor(level,players.length);
 return {level,stage,players:players.map(spawn),inputs:{},pads:[],stars:[],beacons:[],
  wraps:players.slice(1).map(()=>-1),wheelCharge:[],wheelDone:[],
  phase:0,phaseTime:0,saveCount:0,signalIndex:0,signalLeft:0,signalDone:false,
  balanceCharge:0,balanceDone:false,balanceTilt:0,escapeLeft:0,
  beamCharge:stage.balances.map(()=>0),beamTilt:stage.balances.map(()=>0),
  ferryX:stage.ferry?.x??0,ferryDone:false,
  cargoBall:stage.cargo?{x:130,y:414,vx:0,vy:0,cracks:0}:null,
  waveIndex:0,waveLeft:0,waveGlow:0,
  braidCharge:0,braidDone:false,
  tensionCharge:0,tensionDone:false,plateCharge:0,gateOpen:false,clock:0,revision:0,finished:false,falls:0};
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
function solids(w){return [...w.stage.floors,...w.stage.platforms,...movingPlatforms(w.stage,w.clock),...(w.stage.ferry?[{...w.stage.ferry,x:w.ferryX}]:[]),...(w.gateOpen?[]:[w.stage.gate])];}
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
// Jump-wave reactions are recorded only on an actual edge-triggered jump.
// The centre of a three-person team must respond on both the outgoing and return pulse.
function jumpPulse(w,i){
 const order=w.stage.waveSequence;
 if(!order.length||w.gateOpen)return;
 const expected=order[w.waveIndex];
 if(i!==expected)return;
 if(w.waveIndex>0&&w.waveLeft<=0){w.waveIndex=0;w.waveLeft=0;return;}
 const mark=w.stage.waveSlots[i];
 if(Math.abs(w.players[i].x-mark.x)>58)return;
 for(let k=0;k<w.players.length-1;k++)
  if(Math.hypot(w.players[k].x-w.players[k+1].x,w.players[k].y-w.players[k+1].y)<115)return;
 w.waveIndex++;
 w.waveLeft=1.55;
 w.waveGlow=.55;
 if(w.waveIndex===order.length){w.gateOpen=true;w.waveLeft=0;}
}
function moveFerry(w,dt){
 const s=w.stage.ferry;
 if(!s||w.ferryDone)return;
 const riders=w.players.filter(p=>p.ground&&p.x>s.x-12+(w.ferryX-s.x)&&p.x<w.ferryX+s.w+12&&Math.abs(p.y+RADIUS-s.y)<5);
 const bracer=w.players.some(p=>p.anchor&&p.ground&&p.x<448&&!riders.includes(p));
 if(!riders.length||!bracer)return;
 let dir=0;
 for(const p of riders){const r=w.inputs[p.id]||{};dir+=clamp(Number(r.dir)||0,-1,1);}
 dir=clamp(dir,-1,1);
 const previous=w.ferryX;
 w.ferryX=clamp(w.ferryX+dir*90*dt,s.start,s.end);
 const delta=w.ferryX-previous;
 if(delta)for(const p of riders){
  p.x+=delta;p.vx+=delta/dt*.18;
  // Leaning against the raft's edge propels it; riders do not accidentally
  // walk off a moving vehicle while steering.
  const minX=w.ferryX+RADIUS+5,maxX=w.ferryX+s.w-RADIUS-5;
  if(p.x>maxX){p.x=maxX;p.vx=Math.min(0,p.vx);}
  if(p.x<minX){p.x=minX;p.vx=Math.max(0,p.vx);}
 }
 if(w.ferryX>=s.end-1){w.ferryDone=true;w.gateOpen=true;}
}
function updatePrototype(w,dt){
 const s=w.stage,ps=w.players,n=ps.length;
 if(s.kind==='balance'){
  let all=true;
  for(let i=0;i<s.balances.length;i++){
   const beam=s.balances[i],a=ps[i],b=ps[i+1],mid=(a.x+b.x)/2;
   const gap=Math.hypot(b.x-a.x,b.y-a.y);
   const wind=Math.sin(w.clock*2.3+i*1.9)*14;
   const delta=mid-beam.x+wind;
   w.beamTilt[i]=clamp(delta/55,-1,1);
   const valid=a.ground&&b.ground&&Math.abs(a.y-b.y)<25&&
    gap>=142&&gap<=ROPE.max+1&&Math.abs(delta)<19&&
    Math.abs(a.x-beam.x)>65&&Math.abs(b.x-beam.x)>65;
   w.beamCharge[i]=clamp(w.beamCharge[i]+(valid?dt/beam.hold:-dt/2.2),0,1);
   if(w.beamCharge[i]<1)all=false;
  }
  if(all||(n>=5&&w.beamCharge.every(value=>value>=.65)))w.gateOpen=true;
 }
 if(s.kind==='pulse'){
  if(w.waveIndex>0&&!w.gateOpen){
   w.waveLeft=Math.max(0,w.waveLeft-dt);
   if(!w.waveLeft){w.waveIndex=0;w.waveGlow=.4;}
  }
  w.waveGlow=Math.max(0,w.waveGlow-dt);
 }
 if(s.kind==='ferry')moveFerry(w,dt);
 if(s.kind==='cargo'){
  const cargo=w.cargoBall,tx=ps.reduce((v,p)=>v+p.x,0)/n,
   ty=ps.reduce((v,p)=>v+p.y,0)/n-108;
  cargo.vx+=(tx-cargo.x)*dt*19;cargo.vy+=(ty-cargo.y)*dt*20;
  cargo.vx*=Math.max(0,1-dt*6.5);cargo.vy*=Math.max(0,1-dt*6.8);
  cargo.x+=cargo.vx*dt;cargo.y+=cargo.vy*dt;
  let struck=false;
  for(const wall of s.cargo.barriers){
   if(cargo.x+16>wall.x&&cargo.x-16<wall.x+wall.w&&
    cargo.y+16>wall.y&&cargo.y-16<wall.y+wall.h)struck=true;
  }
  if(cargo.y>FLOOR+22||cargo.y<120)struck=true;
  if(struck){
   // Short, recoverable and visually readable failure; only this level rewinds.
   cargo.cracks++;const fails=cargo.cracks;
   ps.forEach((p,i)=>Object.assign(p,spawn(p,i)));
   cargo.x=130;cargo.y=414;cargo.vx=0;cargo.vy=0;cargo.cracks=fails;
   w.wraps=w.wraps.map(()=>-1);
  }
  if(cargo.x>=s.cargo.end&&cargo.y>190&&cargo.y<530)w.gateOpen=true;
 }
 if(s.kind==='braid'){
  const links=ps.length-1;
  const valid=w.wraps.length===links&&
   w.wraps.every((hook,i)=>hook===i&&ropeDistance(w,i)>=146)&&
   ps.some(p=>p.anchor);
  w.braidCharge=clamp(w.braidCharge+(valid?dt/s.braid.hold:-dt/.5),0,1);
  if(w.braidCharge>=1&&!w.braidDone){w.braidDone=true;w.gateOpen=true;w.escapeLeft=s.braid.escape;}
  if(w.braidDone){
   w.escapeLeft=Math.max(0,w.escapeLeft-dt);
   if(!w.escapeLeft){w.braidDone=false;w.braidCharge=0;w.gateOpen=false;}
  }
 }
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
    if(w.stage.kind==='pulse')jumpPulse(w,w.players.indexOf(p));
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
  if(updatePrototype(w,dt))break;
 }
 w.revision++;
}
export const viewWorld=w=>({
 level:w.level,stage:w.stage,players:w.players.map(p=>({id:p.id,name:p.name,x:+p.x.toFixed(2),y:+p.y.toFixed(2),
 vx:+p.vx.toFixed(2),vy:+p.vy.toFixed(2),ground:p.ground,anchor:p.anchor,face:p.face,squash:p.squash,hang:p.hang,falls:p.falls})),
 pads:[],stars:[],beacons:[],tensionCharge:0,tensionDone:false,plateCharge:0,
 wraps:w.wraps,wheelCharge:[],wheelDone:[],phase:0,phaseTime:0,saveCount:w.saveCount,
 beamCharge:w.beamCharge,beamTilt:w.beamTilt,ferryX:w.ferryX,ferryDone:w.ferryDone,
 cargoBall:w.cargoBall,waveIndex:w.waveIndex,waveLeft:w.waveLeft,waveGlow:w.waveGlow,
 braidCharge:w.braidCharge,braidDone:w.braidDone,escapeLeft:w.escapeLeft,
 signalIndex:0,signalLeft:0,signalDone:false,balanceCharge:0,balanceDone:false,balanceTilt:0,
 gateOpen:w.gateOpen,clock:w.clock,finished:w.finished,revision:w.revision,falls:w.falls
});
export function validateLayouts(){
 const errors=[];
 for(let n=2;n<=5;n++){
  const stages=CHAPTERS.map((_,i)=>stageFor(i,n));
  for(const s of stages){
   if(!s.floors.length)errors.push([n,s.index,'no floor']);
   if(s.kind==='balance'&&s.balances.length!==n-1)errors.push([n,s.index,'wrong beam count']);
   if(s.kind==='pulse'&&(s.waveSequence.length!==n*2-1||s.waveSlots.length!==n))
    errors.push([n,s.index,'wrong pulse count']);
   if(s.kind==='braid'&&s.hooks.length!==n-1)errors.push([n,s.index,'wrong hooks']);
   if(s.kind==='ferry'&&(s.ferry.end+s.ferry.w<s.floors[1].x-20))
    errors.push([n,s.index,'ferry cannot reach second shore']);
   if(s.kind==='cargo'&&s.cargo.barriers.some(b=>b.x<300||b.x>930))
    errors.push([n,s.index,'barriers unreachable']);
  }
 }
 return errors;
}

const roomView=s=>({phase:s.phase,host:s.host,players:s.players,ready:s.ready||{},world:s.world?viewWorld(s.world):null,levels:CHAPTERS.length});
const events=s=>[{type:'state',payload:roomView(s)}];
function reconcile(state,players){
 state.players=players;
 if(!players.some(p=>p.id===state.host))state.host=players[0]?.id||'';
}
const game={
 protocolVersion:1,
 createRoom({player}){return {state:{host:player.id,players:[player],phase:'lobby',ready:{},world:null,lastTick:Date.now(),lastBroadcast:0,lastInput:{}}};},
 onJoin({state,players}){
  if(state.phase!=='lobby')throw Error('match_in_progress');
  if(players.length>MAX_PLAYERS)throw Error('room_full');
  reconcile(state,players);return {state,events:events(state)};
 },
 onLeave({state,players}){
  reconcile(state,players);
  if(state.phase==='play'||state.phase==='briefing'){
   if(players.length<MIN_PLAYERS){state.phase='lobby';state.world=null;state.ready={};}
   else{state.world=worldFor(players,state.world.level);state.phase='briefing';state.ready={};state.lastTick=Date.now();state.lastInput={};}
  }
  return {state,events:events(state)};
 },
 onMessage({state,player,payload}){
  const a=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(a.type==='sync')return {state,events:[{type:'state',to:player.id,payload:roomView(state)}]};
  if(a.type==='start'&&player.id===state.host&&(state.phase==='lobby'||state.phase==='done')){
   if(state.players.length<MIN_PLAYERS||state.players.length>MAX_PLAYERS)
    return {state,events:[{type:'notice',to:player.id,payload:'Нужно от двух до пяти игроков'}]};
   state.world=worldFor(state.players);state.phase='briefing';state.ready={};state.lastTick=Date.now();state.lastInput={};
   return {state,events:events(state)};
  }
  if(a.type==='restart'&&(state.phase==='play'||state.phase==='briefing')&&player.id===state.host){
   reset(state.world);state.phase='briefing';state.ready={};state.lastTick=Date.now();state.lastInput={};
   return {state,events:events(state)};
  }
  if(a.type==='ready'&&state.phase==='briefing'){
   if(!state.players.some(p=>p.id===player.id))return {state,events:[]};
   state.ready||={};state.ready[player.id]=true;
   const all=state.players.every(p=>state.ready[p.id]);
   if(all){state.phase='play';state.lastTick=Date.now();state.lastInput={};state.world.inputs={};}
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
   if(oldLevel!==state.world.level){state.phase='briefing';state.ready={};state.world.inputs={};}
   if(state.world.finished)state.phase='done';
   if(now-state.lastBroadcast>=55||oldLevel!==state.world.level||state.phase!=='play'){
    state.lastBroadcast=now;return {state,events:events(state)};
   }
   return {state,events:[]};
  }
  return {state,events:[]};
 }
};
export default game;
