const TAU = Math.PI * 2;
const palette = {
  ember: ['#f8c58e','#cf795c','#793d43'],
  jade: ['#9acfc2','#457d79','#244a53'],
  cerulean: ['#9bc5d5','#437f9f','#254564'],
  ash: ['#cfbca7','#847c86','#504f65'],
  ochre: ['#eac89e','#ab745a','#634c53'],
  ice: ['#d2e2dc','#8ab8c0','#567588']
};
const stars = [];
let seed = 52149;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
for (let i = 0; i < 260; i++) stars.push({
  x: random() * 1000, y: random(), size: .55 + random() * 1.5,
  alpha: .16 + random() * .65, phase: random() * TAU
});
const smooth = (a,b,t) => a + (b-a) * t;
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const trace = (ctx,path,color,width=2) => {
  if (!path?.length) return;
  ctx.beginPath(); ctx.moveTo(path[0].x,path[0].y);
  for (let i=1; i<path.length;i++) ctx.lineTo(path[i].x,path[i].y);
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
};

function background(ctx,stage,t,reduced) {
  const h=stage.height,w=stage.width;
  const bg=ctx.createLinearGradient(0,0,800,h);
  bg.addColorStop(0,'#07151b');bg.addColorStop(.52,'#0a2027');bg.addColorStop(1,'#071116');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const haze=ctx.createRadialGradient(w*.40,h*.40,50,w*.49,h*.44,h*.70);
  haze.addColorStop(0,'rgba(63,111,110,.19)');
  haze.addColorStop(.42,'rgba(37,90,97,.07)');
  haze.addColorStop(1,'rgba(7,17,22,0)');
  ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
  const haze2=ctx.createRadialGradient(w*.91,h*.1,20,w*.7,h*.28,h*.76);
  haze2.addColorStop(0,'rgba(204,112,91,.10)');
  haze2.addColorStop(1,'rgba(204,112,91,0)');
  ctx.fillStyle=haze2;ctx.fillRect(0,0,w,h);
  // Celestial position marks: quiet, functional-looking graduations.
  ctx.save();
  ctx.strokeStyle='rgba(165,195,184,.055)';
  ctx.lineWidth=1;
  for(let i=1;i<7;i++) {const y=i*h/7;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  for(let i=1;i<5;i++) {const x=i*w/5;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  ctx.restore();
  for(const s of stars) {
    const pulse=reduced?1:.79+.21*Math.sin(t*.6+s.phase);
    ctx.globalAlpha=s.alpha*pulse;
    ctx.fillStyle='#f8f1dc';ctx.beginPath();ctx.arc(s.x,s.y*h,s.size,0,TAU);ctx.fill();
  }
  ctx.globalAlpha=1;
  // Tiny celestial coordinate strokes.
  ctx.strokeStyle='rgba(242,239,211,.16)';
  for(let i=0;i<15;i++) {
    let s=stars[(i*17+stage.index*13)%stars.length];
    if(s.size<1.1)continue;
    ctx.beginPath();ctx.moveTo(s.x-7,s.y*h);ctx.lineTo(s.x-3,s.y*h);ctx.moveTo(s.x+3,s.y*h);ctx.lineTo(s.x+7,s.y*h);ctx.stroke();
  }
}

function circles(ctx,planet,t,reduced) {
  const {x,y,r,kind} = planet;
  const colors=palette[kind] || palette.ash;
  ctx.save();
  ctx.translate(x,y);
  const atm=ctx.createRadialGradient(0,0,r*.88,0,0,r*1.65);
  atm.addColorStop(0,colors[1]+'66');
  atm.addColorStop(.45,colors[1]+'22');
  atm.addColorStop(1,'rgba(4,17,21,0)');
  ctx.fillStyle=atm;ctx.beginPath();ctx.arc(0,0,r*1.65,0,TAU);ctx.fill();
  // Gravity rings read as etched orbital arcs, not neon.
  ctx.strokeStyle='rgba(196,224,203,.075)';ctx.lineWidth=1.2;
  ctx.setLineDash([5,11]);
  for(const m of [1.55,2.05,2.65]) {
    ctx.beginPath();ctx.arc(0,0,r*m,0,TAU);ctx.stroke();
  }
  ctx.setLineDash([]);
  // A rear ring for the large gas worlds.
  if(kind==='jade'||kind==='ochre') {
    ctx.save();ctx.rotate(-.30);
    ctx.beginPath();ctx.ellipse(0,0,r*1.44,r*.40,0,Math.PI,TAU);
    ctx.lineWidth=r*.23;ctx.strokeStyle='rgba(181,190,174,.15)';ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,r*1.43,r*.395,0,Math.PI,TAU);
    ctx.lineWidth=3;ctx.strokeStyle='rgba(252,226,174,.28)';ctx.stroke();
    ctx.restore();
  }
  const gradient=ctx.createRadialGradient(-r*.45,-r*.58,r*.07,r*.12,r*.2,r*1.37);
  gradient.addColorStop(0,colors[0]);gradient.addColorStop(.46,colors[1]);gradient.addColorStop(1,colors[2]);
  ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(0,0,r-1,0,TAU);ctx.clip();
  // Material-dependent authored striation; seeded geometry, zero frame-to-frame noise.
  if(['jade','ochre','cerulean'].includes(kind)) {
    for(let j=-5;j<=5;j++) {
      const yy=j*r*.19;
      ctx.beginPath();
      ctx.moveTo(-r*1.3, yy);
      for(let k=-10;k<=10;k++) {
        const xx=k*r*.13;
        const f=Math.sin(k*.65+j*1.1+planet.id*1.9)*r*.033 + Math.sin(k*1.25-j)*r*.021;
        ctx.lineTo(xx,yy+f);
      }
      ctx.strokeStyle=j%3===0?'rgba(245,234,214,.17)':'rgba(22,57,67,.20)';
      ctx.lineWidth=r*(j%3===0?.11:.075);
      ctx.stroke();
    }
  } else {
    for(let j=0;j<23;j++) {
      const a=j*2.399963+planet.id*1.7, rr=Math.sqrt((j+.5)/24)*r*.87;
      const cx=Math.cos(a)*rr,cy=Math.sin(a)*rr*.92, cr=3+(j*11%13)*r/150;
      ctx.beginPath();ctx.ellipse(cx,cy,cr*1.45,cr,.35,0,TAU);
      ctx.strokeStyle='rgba(19,40,51,.17)';ctx.lineWidth=2.5;ctx.stroke();
      ctx.beginPath();ctx.arc(cx-cr*.16,cy-cr*.12,cr*.62,0,TAU);
      ctx.fillStyle='rgba(229,228,210,.08)';ctx.fill();
    }
  }
  const night=ctx.createLinearGradient(-r,-r*.5,r,r*.55);
  night.addColorStop(0,'rgba(2,17,24,0)');
  night.addColorStop(.57,'rgba(2,17,24,.10)');
  night.addColorStop(1,'rgba(2,13,20,.58)');
  ctx.fillStyle=night;ctx.fillRect(-r,-r,r*2,r*2);
  ctx.restore();
  ctx.strokeStyle='rgba(239,229,204,.24)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,r-.8,-Math.PI*.98,-Math.PI*.08);ctx.stroke();
  // Front side of the ring.
  if(kind==='jade'||kind==='ochre') {
    ctx.save();ctx.rotate(-.3);
    ctx.beginPath();ctx.ellipse(0,0,r*1.44,r*.4,0,0,Math.PI);
    ctx.strokeStyle='rgba(211,193,161,.23)';ctx.lineWidth=r*.20;ctx.stroke();
    ctx.beginPath();ctx.ellipse(0,0,r*1.44,r*.4,0,0,Math.PI);
    ctx.strokeStyle='rgba(246,225,191,.48)';ctx.lineWidth=2.6;ctx.stroke();
    ctx.restore();
  }
  if(!reduced){
    const drift=t*.12;
    ctx.strokeStyle='rgba(221,245,225,.11)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(0,0,r*1.19,drift,drift+.53);ctx.stroke();
  }
  ctx.restore();
}
function target(ctx,goal,t,reduced,active) {
  const {x,y,radius}=goal;
  const k=reduced?0:Math.sin(t*2.25)*5;
  ctx.save();ctx.translate(x,y);
  ctx.strokeStyle='rgba(225,240,206,.11)';ctx.lineWidth=2;
  for(const z of [radius+27+k,radius+64+k*.7]) {
    ctx.beginPath();ctx.arc(0,0,z,0,TAU);ctx.stroke();
  }
  const a=reduced?0:t*.40;
  for(let j=0;j<4;j++) {
    const theta=a+j*Math.PI/2;
    ctx.beginPath();ctx.arc(0,0,radius*.66,theta,theta+.44);
    ctx.strokeStyle=active?'#c9f2a2':'#f4d9a8';ctx.lineWidth=7;ctx.lineCap='round';ctx.stroke();
  }
  ctx.strokeStyle='rgba(239,240,221,.65)';ctx.lineWidth=2.2;
  ctx.beginPath();ctx.arc(0,0,radius*.47,0,TAU);ctx.stroke();
  ctx.fillStyle='#d9decb';
  for(let j=0;j<4;j++) {
    const theta=j*Math.PI/2+.785;
    const xx=Math.cos(theta)*radius*.46,yy=Math.sin(theta)*radius*.46;
    ctx.save();ctx.translate(xx,yy);ctx.rotate(theta);
    ctx.fillRect(-9,-5,18,10);ctx.restore();
  }
  const core=ctx.createRadialGradient(0,0,2,0,0,radius*.45);
  core.addColorStop(0,'rgba(245,238,200,.9)');core.addColorStop(.12,'rgba(183,231,199,.55)');core.addColorStop(1,'rgba(140,217,199,0)');
  ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,radius*.45,0,TAU);ctx.fill();
  ctx.fillStyle='#fff4d5';ctx.beginPath();ctx.arc(0,0,5,0,TAU);ctx.fill();
  ctx.restore();
}
function craft(ctx,ship,angle,t,thrust=0) {
  ctx.save();ctx.translate(ship.x,ship.y);ctx.rotate(angle);
  if(thrust) {
    const len=28+15*Math.sin(t*31);
    const flame=ctx.createLinearGradient(-len,0,-8,0);
    flame.addColorStop(0,'rgba(251,135,88,0)');flame.addColorStop(.5,'rgba(238,137,81,.60)');flame.addColorStop(1,'#ffe7b9');
    ctx.fillStyle=flame;
    ctx.beginPath();ctx.moveTo(-14,-5);ctx.lineTo(-len,0);ctx.lineTo(-14,5);ctx.fill();
  }
  ctx.fillStyle='#4c7880';ctx.strokeStyle='#d8eee3';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-19,-10);ctx.lineTo(-26,-25);ctx.lineTo(-5,-13);ctx.lineTo(22,0);ctx.lineTo(-5,13);ctx.lineTo(-26,25);ctx.lineTo(-19,10);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#f7ebd2';ctx.beginPath();ctx.moveTo(-13,-7);ctx.lineTo(26,0);ctx.lineTo(-13,7);ctx.closePath();ctx.fill();
  ctx.fillStyle='#d97b61';ctx.beginPath();ctx.moveTo(9,-3);ctx.lineTo(25,0);ctx.lineTo(9,3);ctx.fill();
  ctx.fillStyle='#183d48';ctx.beginPath();ctx.ellipse(0,0,8,5,0,0,TAU);ctx.fill();
  ctx.restore();
}
function renderPrediction(ctx,model,t) {
  const {prediction,drag}=model;
  if(!prediction?.path?.length||!drag)return;
  const {path,event}=prediction;
  const good=event?.type==='dock';
  const failure=event?.type==='impact';
  ctx.save();
  ctx.setLineDash([5,10]);ctx.lineDashOffset=-t*17;
  trace(ctx,path,good?'rgba(185,244,173,.85)':failure?'rgba(240,164,129,.70)':'rgba(211,235,221,.75)',2.5);
  ctx.setLineDash([]);
  for(let j=7;j<path.length;j+=11) {
    const a=path[j],b=path[Math.min(path.length-1,j+1)]||a;
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(angle);
    ctx.beginPath();ctx.moveTo(-8,-4);ctx.lineTo(0,0);ctx.lineTo(-8,4);
    ctx.strokeStyle=good?'#c9efb3':'rgba(239,226,199,.52)';
    ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
  }
  const end=path[path.length-1];
  ctx.strokeStyle=good?'#c1f29f':failure?'#e29d79':'rgba(235,218,181,.6)';
  ctx.lineWidth=2;ctx.beginPath();ctx.arc(end.x,end.y,12,0,TAU);ctx.stroke();
  ctx.beginPath();ctx.moveTo(end.x-22,end.y);ctx.lineTo(end.x+22,end.y);
  ctx.moveTo(end.x,end.y-22);ctx.lineTo(end.x,end.y+22);ctx.stroke();
  ctx.globalAlpha=.58;
  ctx.strokeStyle='#f7e7cb';ctx.lineWidth=1.5;ctx.beginPath();
  ctx.arc(drag.x,drag.y,28,0,TAU);ctx.stroke();ctx.globalAlpha=1;
  ctx.restore();
}
function details(ctx,stage,t,reduced) {
  const {start,target}=stage;
  ctx.save();
  ctx.strokeStyle='rgba(245,226,195,.18)';ctx.lineWidth=1.2;
  ctx.setLineDash([7,12]);
  ctx.beginPath();ctx.arc(start.x,start.y,56,0,TAU);ctx.stroke();
  ctx.setLineDash([]);
  ctx.font='18px ui-monospace, monospace';ctx.fillStyle='rgba(236,238,218,.50)';
  ctx.letterSpacing='3px';
  ctx.fillText('ПУСК',start.x-25,start.y+83);
  ctx.fillText('ПРИЁМ',target.x-30,target.y-target.radius-89);
  ctx.restore();
}
function fx(ctx,model,t,reduced) {
  const fx=model.fx;
  if(!fx || !fx.elapsed || fx.elapsed>1.5)return;
  const k=clamp(fx.elapsed/1.15,0,1);
  ctx.save();
  ctx.globalAlpha=(1-k)*.75;ctx.strokeStyle=fx.type==='dock'?'#d4f3af':'#f0ae85';
  ctx.lineWidth=4*(1-k)+.5;
  for(const mult of [135,230]) {
    ctx.beginPath();ctx.arc(fx.x,fx.y,k*mult,0,TAU);ctx.stroke();
  }
  for(let i=0;i<28;i++) {
    const a=i*2.39996, dist=k*(55+i%5*26);
    const x=fx.x+Math.cos(a)*dist,y=fx.y+Math.sin(a)*dist;
    ctx.fillStyle=i%3?'#f4d7b7':'#f9f7e0';
    ctx.beginPath();ctx.arc(x,y,3+(i%4),0,TAU);ctx.fill();
  }
  ctx.restore();
}
export function paint(ctx,stage,model,now,reduced=false) {
  const t=now*.001;
  ctx.save();
  if(!reduced && model.fx && model.fx.elapsed<.36 && model.fx.type==='impact') {
    const amp=(1-model.fx.elapsed/.36)*6;
    ctx.translate(Math.sin(t*110)*amp,Math.cos(t*82)*amp);
  }
  background(ctx,stage,t,reduced);
  // The preview sits beneath physical bodies. Real telemetry sits above them.
  renderPrediction(ctx,model,t);
  if(model.trace?.length) {
    ctx.save();
    trace(ctx,model.trace,'rgba(241,224,180,.32)',3);
    ctx.restore();
  }
  for(const planet of stage.planets) circles(ctx,planet,t,reduced);
  target(ctx,stage.target,t,reduced,model.fx?.type==='dock');
  details(ctx,stage,t,reduced);
  if(model.mode==='intro' || model.mode==='ready' || model.mode==='aim' || (model.mode==='pause' && !model.craft)) {
    const a=model.drag ? Math.atan2(model.drag.y-stage.start.y,model.drag.x-stage.start.x) : -.65;
    craft(ctx,stage.start,a,t,0);
    if(!model.drag) {
      const k=(Math.sin(t*2)+1)*.5;
      ctx.strokeStyle='rgba(232,238,206,'+( .12+k*.20)+')';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(stage.start.x,stage.start.y,37+k*16,0,TAU);ctx.stroke();
    }
  }
  if(model.craft) craft(ctx,model.craft,Math.atan2(model.craft.vy,model.craft.vx),t,model.mode==='flight'?1:0);
  fx(ctx,model,t,reduced);
  ctx.restore();
}
