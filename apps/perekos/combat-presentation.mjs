import {forgeSpellsStatus} from './forge-spells.mjs';
// PEREKOS combat theater — purely presentational, never mutates combat state.
// Particle lifetimes, particles per event and decals are bounded for mobile.
const ELEMENT_TONES={fire:['#ffcf85','#f28b5a','#974b43'],storm:['#e5f4dc','#8cdad0','#4b8c92'],stone:['#d6d0a3','#92a48a','#576d60']};
const EFFECT_ELEMENT={steam:'storm',crack:'stone',slag:'fire',hit:'fire',shield:'stone',overload:'fire',dash:'stone'};
const cap=(a,b,c)=>Math.max(b,Math.min(c,a));
const rnd=(seed,i)=>{let n=((seed*1664525+i*1013904223)>>>0);n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296};
const mark=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))};
const ring=(c,x,y,r,col,width=2,start=0,end=Math.PI*2)=>{c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.arc(x,y,Math.max(1,r),start,end);c.stroke()};
const SCENE_EVENT_WEIGHT={hit:20,overload:26,react_steam:18,react_crack:25,react_slag:24,impact_rock:18,impact_wave:16,impact_bolt:14,impact_arc:18};
export class CombatPresentation{
 constructor(){this.particles=[];this.scars=[];this.rings=[];this.words=[];this.damageNumbers=[];this.shocks=[];this.shake=0;this.flash=0;this.hold=0;this.hpSnapshot=null;this.lastSeen=0;this.round=-1;this.lastTicks=-1;this.seed=0;this.issued=0;}
 reset(){this.particles.length=0;this.scars.length=0;this.rings.length=0;this.words.length=0;this.damageNumbers.length=0;this.shocks.length=0;this.shake=0;this.flash=0;this.hold=0;this.hpSnapshot=null;this.lastSeen=0;this.round=-1;this.lastTicks=-1;this.issued=0;}
 spawn(event,reduced=false){
  const k=event.k||'',id=Number(event.id)||0;
  const x=cap(Number(event.x)||200,18,382),y=cap(Number(event.y)||310,19,602);
  const which=k.startsWith('react_')?k.slice(6):k.startsWith('impact_')?k.slice(7):k;
  const kind=which==='bolt'||which==='arc'||which==='steam'?'storm':which==='rock'||which==='wave'||which==='crack'||which==='shield'?'stone':EFFECT_ELEMENT[which]||'fire';
  const colors=ELEMENT_TONES[kind];
  const big=k.startsWith('react_')||k==='overload'||k==='mine';
  const ringSize=big?58:k==='hit'||k.startsWith('impact_')?34:18;
  if(k!=='shoot'){
   this.rings.push({x,y,kind,age:0,life:big?.46:.25,max:ringSize,id});
  }
  if(k.startsWith('react_')){
   this.words.push({x,y,age:0,life:.78,label:which==='steam'?'ПАР':which==='crack'?'ПРОБОЙ':'ШЛАК',kind});
  }
  if(k==='hit'||k.startsWith('react_')||k==='overload'||k==='mine'||k.startsWith('impact_')){
   this.scars.push({x,y,kind,age:0,life:big?17:8,r:big?13:6,id});
   if(this.scars.length>40)this.scars.splice(0,this.scars.length-40);
  }
  const count=reduced?Math.min(6,big?10:5):big?29:k==='hit'?17:k==='dash'?18:k.startsWith('impact_')?13:k==='shoot'?7:9;
  const velocity=big?135:k==='dash'?65:k==='hit'?86:49;
  for(let i=0;i<count;i++){
   const angle=rnd(id,i*3+1)*Math.PI*2,spread=rnd(id,i*7+9);
   const speed=(.38+spread*.83)*velocity;
   const life=.23+rnd(id,i*11+7)*(big?.81:.45);
   this.particles.push({
    x:x+(rnd(id,i+33)-.5)*9,y:y+(rnd(id,i+44)-.5)*7,
    vx:Math.cos(angle)*speed,
    vy:Math.sin(angle)*speed-(big?37:13),
    age:0,life,size:1+Math.floor(rnd(id,i*17+19)*(big?5:3)),
    color:colors[i%colors.length],
    kind,smoke:(i%4===0)&&kind!=='storm'
   });
  }
  if(this.particles.length>210)this.particles.splice(0,this.particles.length-210);
  this.shake=Math.min(reduced?0:9,Math.max(this.shake,SCENE_EVENT_WEIGHT[k]?(SCENE_EVENT_WEIGHT[k]*.21):k==='dash'?1.1:.4));
  if(big)this.flash=Math.max(this.flash,reduced?0:.13);
 }
 ingest(state,reduced=false){
  if(!state)return;
  if(this.round!==state.round||state.serial<this.lastSeen||state.ticks<this.lastTicks-3){
   this.reset();this.round=state.round;
  }
  this.lastTicks=state.ticks;
  const list=Array.isArray(state.fx)?state.fx:[];
  for(const event of list){
   if(event.id<=this.lastSeen)continue;
   this.spawn(event,reduced);
  }
  this.lastSeen=Math.max(this.lastSeen,Number(state.serial)||0);
  // Only confirmed health losses produce damage numbers and heavy contact.
  const hp=state.actors?.map(a=>Number(a?.hp)||0)||[];
  if(state.phase==='fight'&&this.hpSnapshot&&this.hpSnapshot.length===hp.length){
   hp.forEach((value,i)=>{
    const target=state.actors[i],loss=Math.max(0,this.hpSnapshot[i]-value);
    if(loss<1.1||!Number.isFinite(loss))return;
    const cx=cap(target.x,20,380),cy=cap(target.y,22,598),large=loss>=13;
    this.damageNumbers.push({x:cx,y:cy-27,age:0,life:large?1:.8,value:Math.ceil(loss),large});
    this.shocks.push({x:cx,y:cy,age:0,life:large?.38:.26,power:cap(loss/16,.5,2.3),id:state.serial+i*117});
    this.shake=reduced?0:Math.min(12.5,Math.max(this.shake,2.4+loss*.32));
    this.flash=reduced?0:Math.max(this.flash,large?.24:.12);
    this.hold=reduced?0:Math.max(this.hold,Math.min(.075,.026+loss*.002));
   });
  }
  this.hpSnapshot=hp;
  if(this.damageNumbers.length>12)this.damageNumbers.splice(0,this.damageNumbers.length-12);
  if(this.shocks.length>14)this.shocks.splice(0,this.shocks.length-14);
 }
 advance(dt,reduced=false){
  const d=cap(dt,0,.05);
  this.issued++;
  const friction=Math.pow(.964,d*60);
  for(const p of this.particles){
   p.age+=d;p.x+=p.vx*d;p.y+=p.vy*d;
   p.vy+=(p.smoke?-7:105)*d;p.vx*=friction;p.vy*=friction;
  }
  this.particles=this.particles.filter(p=>p.age<p.life&&p.y<615&&p.x>0&&p.x<400);
  for(const scar of this.scars)scar.age+=d;
  this.scars=this.scars.filter(d=>d.age<d.life);
  for(const r of this.rings)r.age+=d;
  this.rings=this.rings.filter(r=>r.age<r.life);
  for(const word of this.words)word.age+=d;
  this.words=this.words.filter(w=>w.age<w.life);
  for(const n of this.damageNumbers)n.age+=d;
  this.damageNumbers=this.damageNumbers.filter(n=>n.age<n.life);
  for(const impact of this.shocks)impact.age+=d;
  this.shocks=this.shocks.filter(impact=>impact.age<impact.life);
  this.hold=Math.max(0,this.hold-d);
  this.shake=Math.max(0,this.shake-d*(reduced?180:33));
  this.flash=Math.max(0,this.flash-d*1.45);
 }
 offset(reduced=false){
  if(reduced||this.shake<.2)return{x:0,y:0};
  return{x:Math.round(Math.sin(this.issued*2.399)*this.shake),y:Math.round(Math.sin(this.issued*1.611+1)*this.shake*.65)};
 }
 ground(c){
  // Baked-in craters, displaced rubble and smoke stains fade, no fake terrain physics.
  for(const s of this.scars){
   const a=Math.min(1,(s.life-s.age)/3);
   c.save();c.globalAlpha=a*.72;
   mark(c,s.x-s.r,s.y-s.r*.4,s.r*2,s.r*.8,s.kind==='fire'?'#422e2b':s.kind==='storm'?'#274745':'#26372f');
   for(let i=0;i<5;i++){
    const dx=(rnd(s.id,i*3)-.5)*s.r*3;
    const dy=(rnd(s.id,i*7)-.5)*s.r*2;
    mark(c,s.x+dx,s.y+dy,1+(i%3),2,
      s.kind==='fire'?'#7d5140':s.kind==='storm'?'#56867c':'#879276');
   }
   c.restore();
  }
 }
 foreground(c){
  // Shockwaves are driven by authoritative health changes, not inferred hits.
  for(const impact of this.shocks){
   const t=impact.age/impact.life,energy=Math.max(0,1-t),r=8+(28+impact.power*21)*(1-Math.pow(1-t,2));
   c.save();c.globalAlpha=energy*.9;
   ring(c,impact.x,impact.y,r,'#fff2d3',2+impact.power*1.7);
   ring(c,impact.x,impact.y,r*.66,'#df996a',1.5+impact.power);
   const count=impact.power>1?12:8;
   for(let i=0;i<count;i++){
    const angle=Math.PI*2*i/count+rnd(impact.id,i)*.24;
    const inner=r*.62,outer=r+(6+impact.power*17)*energy;
    c.strokeStyle=i%3===0?'#fff7df':i%3===1?'#d2f4ce':'#e9a97c';c.lineWidth=Math.max(1,3*energy);
    c.beginPath();c.moveTo(impact.x+Math.cos(angle)*inner,impact.y+Math.sin(angle)*inner);
    c.lineTo(impact.x+Math.cos(angle)*outer,impact.y+Math.sin(angle)*outer);c.stroke();
   }
   c.globalAlpha=energy*.45;c.fillStyle='#fff5ce';c.beginPath();c.arc(impact.x,impact.y,6*energy+impact.power*2,0,Math.PI*2);c.fill();
   c.restore();
  }
  // Confirmed Forge contact frames own visible impact forms in the browser.
  if(forgeSpellsStatus()!=='ready')for(const r of this.rings){
   const t=r.age/r.life,a=(1-t);
   c.save();c.globalAlpha=a*.85;
   const tone=ELEMENT_TONES[r.kind]?.[1]||'#d4ccad';
   const radius=5+r.max*(1-(1-t)**2);
   if(r.kind==='stone'){
    const pieces=9;
    for(let i=0;i<pieces;i++){
     const angle=i*Math.PI*2/pieces+r.id*.1;
     mark(c,r.x+Math.cos(angle)*radius,r.y+Math.sin(angle)*radius*.77,5+(i%3),3,tone);
    }
   }else if(r.kind==='storm'){
    for(let i=0;i<4;i++){
     const angle=(i*.5+r.id*.07)*Math.PI;
     ring(c,r.x,r.y,radius,tone,2+(i%2),angle,angle+.67);
    }
   }else{
    ring(c,r.x,r.y,radius,tone,4+t*2);
    ring(c,r.x,r.y,radius*.62,ELEMENT_TONES.fire[0],2);
   }
   c.restore();
  }
  for(const p of this.particles){
   const life=1-p.age/p.life;
   c.save();c.globalAlpha=Math.min(1,life*1.3);
   mark(c,p.x,p.y,p.size+(p.smoke?life*2:0),p.size,p.smoke?'#b7b69e':p.color);
   if(!p.smoke&&p.size>2&&p.kind==='storm'){
    mark(c,p.x-p.vx*.018,p.y-p.vy*.018,2,2,'#f3fbdd');
   }
   c.restore();
  }
  for(const n of this.damageNumbers){
   const t=n.age/n.life,y=n.y-19*t;
   c.save();c.globalAlpha=Math.min(1,(1-t)*3);
   c.textAlign='center';c.textBaseline='middle';c.font=(n.large?'900 24px':'900 17px')+' ui-monospace,monospace';
   c.lineJoin='round';c.lineWidth=4;c.strokeStyle='#13201e';
   c.strokeText('-'+n.value,n.x,y);c.fillStyle=n.large?'#ffe29a':'#fff4d6';c.fillText('-'+n.value,n.x,y);
   c.restore();
  }
  for(const word of this.words){
   const t=word.age/word.life;
   c.save();c.globalAlpha=Math.min(1,(1-t)*2);
   const y=word.y-30-t*17;
   c.textAlign='center';c.font='bold 13px monospace';
   c.fillStyle='#18231f';c.fillText(word.label,word.x+2,y+2);
   c.fillStyle=ELEMENT_TONES[word.kind][0];c.fillText(word.label,word.x,y);
   c.restore();
  }
 }
 screen(c){
  if(this.flash>.01){c.save();c.globalAlpha=Math.min(.18,this.flash*.8);c.fillStyle='#ffdbb0';c.fillRect(0,0,400,620);c.restore();}
 }
}
export function drawProjectileTrail(c,q,time=0){
 const m=Math.hypot(q.vx,q.vy)||1,ux=q.vx/m,uy=q.vy/m;
 const kind=q.element||'fire',tones=ELEMENT_TONES[kind]||ELEMENT_TONES.fire;
 const size=kind==='stone'?5:kind==='storm'?2:3,base=kind==='storm'?8:5;
 c.save();
 for(let i=4;i>=0;i--){
  const dist=9+i*(kind==='storm'?8:6),fade=(5-i)/5;
  c.globalAlpha=(.1+fade*.45)*(i===0?1:.78);
  const side=Math.sin(time*(kind==='storm'?24:9)+i*2.7+(q.owner||0))*(kind==='stone'?3:5);
  const x=q.x-ux*dist-uy*side,y=q.y-uy*dist+ux*side;
  mark(c,x,y,size+(4-i),base+(4-i)*.4,tones[(i+1)%3]);
  if(kind==='storm'&&i%2===0){
   mark(c,x+uy*4,y-ux*4,3,3,tones[0]);
  }
 }
 c.restore();
}
