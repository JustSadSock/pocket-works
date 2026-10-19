import {constraint} from './relativity.js';
import {
 VOLUME_DEFAULTS,spatialEmbedding,surfacePoint,spatialMetricCheck,
 embeddedGrid,project3D,createSpatialBeam,stepSpatialBeam,spatialBeamStats
} from './embedded-space.js';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const STORAGE='pocket-works:portal-lab:volume-v12';
const txt=(c,s,x,y,size=11,color='#c5dfd1',align='left',weight=500)=>{
 c.font=weight+' '+size+'px ui-monospace,Consolas,monospace';c.fillStyle=color;
 c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y);
};
const line=(c,a,b,color,width=1)=>{
 c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);
 c.strokeStyle=color;c.lineWidth=width;c.stroke();
};
const f=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—';
const safe=(n,fallback,min,max)=>Number.isFinite(Number(n))?clamp(Number(n),min,max):fallback;
export function createEmbeddedLab(canvas,{getMetric,onAction,onDirty}={}){
 let saved={};try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{}
 const state={
  yaw:safe(saved.yaw,VOLUME_DEFAULTS.yaw,-Math.PI,Math.PI),
  pitch:safe(saved.pitch,VOLUME_DEFAULTS.pitch,-1.38,1.38),
  zoom:safe(saved.zoom,VOLUME_DEFAULTS.zoom,.56,2.2),
  span:safe(saved.span,VOLUME_DEFAULTS.span,3,6.5),
  angle:safe(saved.angle,VOLUME_DEFAULTS.angle,Math.PI-1.35,Math.PI+1.35),
  spread:safe(saved.spread,VOLUME_DEFAULTS.spread,0,1.25),
  count:Math.round(safe(saved.count,VOLUME_DEFAULTS.count,1,15)),
  source:safe(saved.source,VOLUME_DEFAULTS.source,2,4.4),
  mesh:saved.mesh!==false,showPaths:saved.showPaths!==false
 };
 let active=false,m=null,profile=null,segments=[],bundle=null,running=false;
 let pointer=new Map(),gesture=null,throttle=0,meshCache={key:'',image:null};
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}};
 const mark=()=>onDirty?.();
 function build(met){
  m=met;profile=spatialEmbedding(m,{span:state.span,steps:240});
  segments=profile.valid?embeddedGrid(profile,{meridians:20,ringStep:12}):[];
  meshCache={key:'',image:null};
  bundle=null;running=false;pointer.clear();gesture=null;
  refresh();mark();
 }
 function configure(met){build(met);}
 function setActive(v){active=v;if(active){if(!m)build(getMetric());refresh();mark();}}
 function trigger(){
  if(!profile?.valid){$('volume-warning').textContent='Запуск заблокирован: невозможно евклидово вложение текущего среза';refresh();return;}
  bundle=createSpatialBeam(m,{angle:state.angle,spread:state.spread,count:state.count,source:state.source});
  running=true;onAction?.('launch');refresh();mark();
 }
 function reset(){
  bundle=null;running=false;onAction?.('mount');refresh();mark();
 }
 function tick(dt,rate=1){
  if(!active||!running||!bundle||!m)return;
  const steps=Math.max(1,Math.min(5,Math.ceil(dt*rate*20)));
  for(let i=0;i<steps;i++)stepSpatialBeam(bundle,m,dt*rate*1.7*m.a/steps);
  if(bundle.done){running=false;onAction?.('mount');}
  throttle+=dt;if(throttle>.11){refresh();throttle=0;}
  mark();
 }
 function refresh(){
  const props=[['volume-angle','angle',v=>(v*180/Math.PI).toFixed(0)+'°'],
   ['volume-spread','spread',v=>(v*180/Math.PI).toFixed(0)+'°'],
   ['volume-count','count',v=>String(v)],
   ['volume-source','source',v=>f(v,1)+'a'],
   ['volume-zoom','zoom',v=>f(v,2)+'×'],
   ['volume-span','span',v=>f(v,1)+'a']];
  for(const [id,key,format] of props){
   $(id).value=key==='angle'?state[key]*180/Math.PI:key==='spread'?state[key]*180/Math.PI:state[key];
   $(id+'-value').textContent=format(state[key]);
  }
  $('volume-mesh').checked=state.mesh;
  $('volume-paths').checked=state.showPaths;
  $('volume-status').dataset.valid=String(profile?.valid??false);
  $('volume-status').textContent=!profile?'ПОДГОТОВКА СРЕЗА':profile.valid?
   running?'ФОТОНЫ ДВИЖУТСЯ ПО ГЕОДЕЗИЧЕСКИМ':'ИЗОМЕТРИЧЕСКИЙ СРЕЗ РАССЧИТАН':
   'ВЛОЖЕНИЕ В R³ НЕВОЗМОЖНО';
  $('volume-warning').textContent=!profile?'Подготовка':profile.valid?
   'Визуализирован только пространственный экваториальный срез dl²+R(l)²dφ², не весь 4D пространственно-временной континуум.':
   'Для этой метрики |dR/dl| превышает 1 при l/a≈'+f(profile.invalidAt,2)+
   '. Изометрическое евклидово вложение данного среза невозможно: показан честный диагностический профиль.';
  $('volume-condition').textContent=profile?.valid?'|R′| ≤ 1 · ДОПУСТИМО':
   '|R′| > 1 · НЕДОПУСТИМО';
  $('volume-condition').dataset.valid=String(profile?.valid??false);
  const st=bundle?spatialBeamStats(bundle,m):null;
  $('volume-crossings').textContent=st?String(st.crossings):'0';
  $('volume-errors').textContent=st?st.worstResidual.toExponential(1):'—';
  $('volume-region-b').textContent=st?String(st.B)+' / '+st.photons:'—';
  $('volume-time').textContent=st?f(st.time/m.a)+' a/c':'0.00 a/c';
  $('volume-shoot').disabled=!profile?.valid;
  $('volume-shoot').textContent=running?'Перезапустить пучок':'Запустить фотонный пучок';
 }
 function applyParameters(p={}){
  for(const [key,low,hi] of [['yaw',-Math.PI,Math.PI],['pitch',-1.38,1.38],
   ['zoom',.56,2.2],['span',3,6.5],['angle',Math.PI-1.35,Math.PI+1.35],
   ['spread',0,1.25],['source',2,4.4],['count',1,15]]){
   if(Number.isFinite(p[key]))state[key]=clamp(p[key],low,hi);
  }
  state.count=Math.round(state.count);
  if(typeof p.mesh==='boolean')state.mesh=p.mesh;
  if(typeof p.showPaths==='boolean')state.showPaths=p.showPaths;
  build(getMetric());save();
 }
 function putStroke(ctx,pts,color,width=1){
  if(pts.length<2)return;
  ctx.beginPath();let started=false;
  for(const p of pts){
   if(!p){started=false;continue;}
   if(!started){ctx.moveTo(p.x,p.y);started=true;}else ctx.lineTo(p.x,p.y);
  }
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
 }
 function fallback(ctx,w,h){
  txt(ctx,'МЕТРИКА НЕ ДОПУСКАЕТ ЭТО ВЛОЖЕНИЕ',w/2,38,w<600?12:17,'#e6b28e','center',720);
  const pad=w<500?43:83,bottom=h-78,top=95,
   left=pad,right=w-pad,pts=profile.samples,
   maxR=Math.max(...pts.map(s=>s.R)),
   peakRp=Math.max(...pts.map(s=>Math.abs(s.Rp))),
   projectX=v=>left+(v+state.span)/(2*state.span)*(right-left),
   projectY=v=>bottom-(v/maxR)*(bottom-top);
  for(let y=0;y<=4;y++)line(ctx,{x:left,y:bottom-(bottom-top)*y/4},
   {x:right,y:bottom-(bottom-top)*y/4},'#9bb29c29');
  const curve=pts.map(s=>({x:projectX(s.l),y:projectY(s.R)}));
  putStroke(ctx,curve,'#a5dbc3',2.3);
  for(let i=1;i<pts.length;i++){
   if(Math.abs(pts[i].Rp)<=1&&Math.abs(pts[i-1].Rp)<=1)continue;
   line(ctx,curve[i-1],curve[i],'#e7ab85',3);
  }
  txt(ctx,'АРЕАЛЬНЫЙ РАДИУС · R(l)/a',left,top-22,10,'#aedac5');
  txt(ctx,'l/a →',right,bottom+23,11,'#bed8cb','right');
  txt(ctx,'Максимальное |dR/dl|: '+f(peakRp,3),left,h-25,11,'#e8bc99');
 }
 function draw(ctx,w,h){
  if(!active||!profile)return;
  const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,'#102c30');gradient.addColorStop(1,'#071721');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  if(!profile.valid){fallback(ctx,w,h);return;}
  const camera=state;
  const project=p=>project3D(p,camera,w,h);
  const cx=w*.5,cy=h*.51;
  ctx.save();
  ctx.strokeStyle='#a6ccad13';ctx.lineWidth=1;
  for(let i=1;i<=6;i++){
   const dx=i*Math.min(w,h)*.085;
   line(ctx,{x:cx-dx,y:0},{x:cx-dx,y:h},'#82bca00c');
   line(ctx,{x:cx+dx,y:0},{x:cx+dx,y:h},'#82bca00c');
  }
  if(state.mesh){
   // Projection + painter depth-sort are a camera-dependent STATIC layer.
   // Only animated photons are redrawn every frame.
   const key=[w,h,state.yaw.toFixed(5),state.pitch.toFixed(5),
    state.zoom.toFixed(5),state.span].join('/');
   if(meshCache.key!==key||!meshCache.image){
    const layer=document.createElement('canvas');
    layer.width=Math.ceil(w);layer.height=Math.ceil(h);
    const g=layer.getContext('2d');
    const projected=segments.map(s=>{
     const a=project(s.a),b=project(s.b);
     return {...s,a,b,depth:(a.depth+b.depth)/2};
    }).sort((a,b)=>a.depth-b.depth);
    for(const edge of projected){
     const bright=edge.depth>0;
     const col=edge.throat?'#f0dcb2':edge.region==='A'?
      (bright?'#a8d6c3b9':'#5d95898e'):(bright?'#deb39fc2':'#956e6a85');
     line(g,edge.a,edge.b,col,edge.throat?2.8:edge.ring?1.05:.85);
    }
    meshCache={key,image:layer};
   }
   ctx.drawImage(meshCache.image,0,0,w,h);
  }
  // Distinct physical ends; the throat ring is not an event horizon.
  for(const z of [-state.span,state.span]){
   const pts=[];
   for(let i=0;i<=70;i++){
    const p=surfacePoint(profile,z,i*Math.PI*2/70);
    if(p)pts.push(project(p));
   }
   putStroke(ctx,pts,z<0?'#ceac94':'#b0d7c0',1.3);
  }
  const center=surfacePoint(profile,0,0);
  if(center){
   const p=project([0,0,0]);
   ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);
   ctx.fillStyle='#f9e2ac';ctx.fill();
  }
  if(bundle){
   const shades=['#f8edb9','#bfead1','#f2b4a2','#deecc7','#ddc9e8'];
   for(let i=0;i<bundle.rays.length;i++){
    const ray=bundle.rays[i],color=shades[i%shades.length];
    if(state.showPaths){
     let p=[],last=null;
     for(const step of ray.path){
      const xyz=surfacePoint(profile,step.l/m.a,step.phi);
      const point=xyz?project(xyz):null;
      if(!point){if(p.length>1)putStroke(ctx,p,color+'b0',2.25);p=[];}
      else p.push(point);
      last=point;
     }
     if(p.length>1)putStroke(ctx,p,color+'bc',2.4);
    }
    const latest=surfacePoint(profile,ray.l/m.a,ray.phi);
    if(latest){
     const c=project(latest);
     ctx.beginPath();ctx.arc(c.x,c.y,5.2,0,Math.PI*2);
     ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
    }
   }
  }else{
   const p=surfacePoint(profile,state.source,Math.PI);
   if(p){const q=project(p);ctx.beginPath();ctx.arc(q.x,q.y,5,0,2*Math.PI);
    ctx.fillStyle='#eddca9';ctx.fill();}
  }
  txt(ctx,'ШОВ / ИЗОМЕТРИЧЕСКИЙ СРЕЗ',16,26,w<500?11:14,'#e2f2dd','left',720);
  txt(ctx,'dl² + R(l)²dφ² · c = G = 1',16,46,10,'#9cbdae');
  txt(ctx,'A  /  l > 0',w-15,27,11,'#a5dec7','right',700);
  txt(ctx,'B  /  l < 0',w-15,46,11,'#d9ae98','right',700);
  txt(ctx,'ГОРЛОВИНА · НЕ ГОРИЗОНТ',16,h-39,10,'#f4d9ab');
  txt(ctx,'ПРОСТРАНСТВЕННОЕ ВЛОЖЕНИЕ ≠ СНИМОК СВЕТА',16,h-20,w<500?8:10,'#8db7a8');
  ctx.restore();
 }
 function pos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
 function dragStart(e){
  if(!active||e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  pointer.set(e.pointerId,pos(e));
  if(pointer.size>1){
   const p=[...pointer.values()];
   gesture={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:state.zoom};
  }else gesture=null;
 }
 function dragMove(e){
  if(!active||!pointer.has(e.pointerId))return;
  const last=pointer.get(e.pointerId),next=pos(e);
  pointer.set(e.pointerId,next);
  if(pointer.size>=2){
   const p=[...pointer.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
   if(gesture&&gesture.distance>10)state.zoom=clamp(gesture.zoom*dist/gesture.distance,.56,2.2);
  }else{
   state.yaw=clamp(state.yaw+(next.x-last.x)/Math.max(180,canvas.clientWidth||350)*3,-Math.PI,Math.PI);
   state.pitch=clamp(state.pitch+(next.y-last.y)/Math.max(180,canvas.clientHeight||430)*2,-1.38,1.38);
  }
  save();refresh();mark();
 }
 function dragEnd(e){pointer.delete(e.pointerId);if(pointer.size<2)gesture=null;save();}
 canvas.addEventListener('pointerdown',dragStart);
 canvas.addEventListener('pointermove',dragMove);
 canvas.addEventListener('pointerup',dragEnd);
 canvas.addEventListener('pointercancel',dragEnd);
 canvas.addEventListener('lostpointercapture',dragEnd);
 canvas.addEventListener('wheel',e=>{
  if(!active)return;e.preventDefault();
  state.zoom=clamp(state.zoom*(e.deltaY>0?.92:1.08),.56,2.2);
  save();refresh();mark();
 },{passive:false});
 for(const [id,key,fn]of [
  ['volume-angle','angle',x=>x*Math.PI/180],['volume-spread','spread',x=>x*Math.PI/180],
  ['volume-count','count',Number],['volume-source','source',Number],
  ['volume-zoom','zoom',Number],['volume-span','span',Number]
 ]){
  $(id).addEventListener('input',e=>{
   state[key]=fn(Number(e.target.value));
   if(key==='span')build(m);
   else if(['angle','spread','count','source'].includes(key)){bundle=null;running=false;}
   save();refresh();mark();
  });
 }
 for(const key of ['mesh','paths'])$('volume-'+key).addEventListener('change',e=>{
  state[key==='mesh'?'mesh':'showPaths']=e.target.checked;
  save();refresh();mark();
 });
 const viewpoints={
  oblique:{yaw:.68,pitch:.40,zoom:1},
  edge:{yaw:.72,pitch:.04,zoom:1.02},
  overhead:{yaw:.7,pitch:1.37,zoom:.88},
  across:{yaw:2.1,pitch:.42,zoom:1}
 };
 for(const btn of document.querySelectorAll('[data-volume-view]'))btn.addEventListener('click',()=>{
  Object.assign(state,viewpoints[btn.dataset.volumeView]||viewpoints.oblique);
  save();refresh();mark();onAction?.('mount');
 });
 for(const btn of document.querySelectorAll('[data-volume-orbit]'))btn.addEventListener('click',()=>{
  const d=btn.dataset.volumeOrbit;
  if(d==='left')state.yaw=clamp(state.yaw-.24,-Math.PI,Math.PI);
  if(d==='right')state.yaw=clamp(state.yaw+.24,-Math.PI,Math.PI);
  if(d==='up')state.pitch=clamp(state.pitch+.17,-1.38,1.38);
  if(d==='down')state.pitch=clamp(state.pitch-.17,-1.38,1.38);
  save();refresh();mark();
 });
 $('volume-shoot').addEventListener('click',trigger);
 $('volume-reset').addEventListener('click',reset);
 return {state,configure,setActive,trigger,reset,tick,draw,refresh,applyParameters,
  get running(){return running;},
  get snapshot(){
   const stats=bundle?spatialBeamStats(bundle,m):null;
   return{parameters:{...state},embedding:profile?{
    valid:profile.valid,condition:profile.condition,invalidAt:profile.invalidAt,
    samples:profile.samples.map(p=>({...p}))
   }:null,beam:stats,trajectories:bundle?bundle.rays.map(r=>({
    E:r.E,L:r.L,l:r.l,phi:r.phi,crossings:r.crossings,
    norm:constraint(r,m),path:r.path.slice(-450).map(p=>({...p}))
   })):[]};
  }
 };
}
