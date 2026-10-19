// PEREKOS combat theater — purely presentational, never mutates combat state.
// Particle lifetimes, particles per event and decals are bounded for mobile.
const ELEMENT_TONES={fire:['#ffcf85','#f28b5a','#974b43'],storm:['#e5f4dc','#8cdad0','#4b8c92'],stone:['#d6d0a3','#92a48a','#576d60']};
const EFFECT_ELEMENT={steam:'storm',crack:'stone',slag:'fire',hit:'fire',shield:'stone',overload:'fire',dash:'stone'};
const cap=(a,b,c)=>Math.max(b,Math.min(c,a));
const rnd=(seed,i)=>{let n=((seed*1664525+i*1013904223)>>>0);n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296};
const mark=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))};
const ring=(c,x,y,r,col,width=2,start=0,end=Math.PI*2)=>{c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.arc(x,y,Math.max(1,r),start,end);c.stroke()};
const SCENE_EVENT_WEIGHT={hit:12,overload:22,react_steam:18,react_crack:22,react_slag:21,impact_rock:11,impact_wave:8,impact_bolt:8,impact_arc:11};
export class CombatPresentation{
 constructor(){this.particles=[];this.scars=[];this.rings=[];this.words=[];this.shake=0;this.flash=0;this.lastSeen=0;this.round=-1;this.lastTicks=-1;this.seed=0;this.issued=0;}
 reset(){this.particles.length=0;this.scars.length=0;this.rings.length=0;this.words.length=0;this.shake=0;this.flash=0;this.lastSeen=0;this.round=-1;this.lastTicks=-1;this.issued=0;}
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
  this.shake=Math.min(7.2,Math.max(this.shake,SCENE_EVENT_WEIGHT[k]?(SCENE_EVENT_WEIGHT[k]*.17):k==='dash'?1.1:.4));
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
  this.shake=Math.max(0,this.shake-d*(reduced?180:26));
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
  for(const r of this.rings){
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
  if(this.flash>.01){c.save();c.globalAlpha=Math.min(.13,this.flash*.6);c.fillStyle='#ffdbb0';c.fillRect(0,0,400,620);c.restore();}
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
