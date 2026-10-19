import {
 FIELD_DEFAULTS,FIELD_CENTRES,FIELD_ASSUMPTIONS,
 newLightField,advanceLightField,fieldStatistics,lightFieldSamples,
 chartPoint,sphereWires,coordinateConsistency
} from './light-field.js';
import {project3D} from './embedded-space.js';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const f=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—';
const STORAGE='pocket-works:portal-lab:light-field-v13';
const colors=['#e8e6b6','#9ed8c4','#dbb3a5','#d1c9ed','#a4cadc'];
const label=(ctx,t,x,y,size=11,color='#c8d9ce',align='left',weight=600)=>{
 ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';
 ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
 ctx.fillText(t,x,y);
};
function stroke(ctx,p,q,color,width=1){
 ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function polygon(ctx,pts,color,width=1){
 if(pts.length<2)return;
 ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
 for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
export function createLightFieldLab(canvas,{getMetric,onDirty,onAction}={}){
 let saved={};try{saved=JSON.parse(localStorage.getItem(STORAGE)||'null')||{}}catch{}
 const state={};
 for(const [key,a,b]of [
  ['polar',0,75],['azimuth',0,360],['cone',0,65],['count',1,25],
  ['source',1.5,4.5],['yaw',-3.14,3.14],['pitch',-1.35,1.35],['zoom',.55,1.65]
 ]){const v=Number(saved[key]);state[key]=Number.isFinite(v)?clamp(v,a,b):FIELD_DEFAULTS[key]}
 state.count=Math.round(state.count);
 state.showRays=saved.showRays!==false;
 state.showGrid=saved.showGrid!==false;
 state.showConnections=saved.showConnections!==false;
 let metric=null,field=null,active=false,running=false,lastStatus=0;
 const touches=new Map();let pinch=null,staticLayer={key:'',canvas:null};
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{}};
 const changed=()=>onDirty?.();
 const stats=()=>field&&metric?fieldStatistics(field,metric):null;
 function configure(m){
  metric=m;field=null;running=false;staticLayer={key:'',canvas:null};
  refresh();changed();
 }
 function setActive(v){
  active=v;if(v){if(!metric)configure(getMetric());refresh();changed();}
 }
 function trigger(){
  if(!metric)configure(getMetric());
  field=newLightField(metric,state);running=true;
  onAction?.('launch');refresh();changed();
 }
 function reset(){
  field=null;running=false;refresh();changed();onAction?.('mount');
 }
 function tick(dt,speed=1){
  if(!active||!running||!field)return;
  const amount=Math.min(.13,Math.max(0,dt*speed*1.6*metric.a));
  if(amount)advanceLightField(field,metric,amount);
  if(field.done){running=false;onAction?.('mount');}
  lastStatus+=dt;
  if(lastStatus>.12){refresh();lastStatus=0}
  changed();
 }
 function refresh(){
  for(const [key,suffix,precision]of [
   ['polar','°',0],['azimuth','°',0],['cone','°',0],['count','',0],
   ['source','a',1],['zoom','×',2]
  ]){
   const input=$('field-'+key),output=$('field-'+key+'-value');
   if(!input||!output)continue;
   input.value=state[key];
   output.textContent=f(state[key],precision)+suffix;
  }
  for(const key of ['showGrid','showRays','showConnections']){
   const id={'showGrid':'field-grid','showRays':'field-paths','showConnections':'field-seams'}[key];
   $(id).checked=state[key];
  }
  const st=stats();
  $('field-stat-photons').textContent=String(st?.photons||0);
  $('field-stat-crossings').textContent=String(st?.crossings||0);
  $('field-stat-escaped').textContent=st?(st.escapedA+' / '+st.escapedB):'— / —';
  $('field-stat-planes').textContent=String(st?.distinctOrbitalPlanes||0);
  $('field-stat-h').textContent=st?st.worstResidual.toExponential(1):'—';
  $('field-stat-time').textContent=st?f(st.time/metric.a)+' a/c':'0.00 a/c';
  $('field-status').textContent=running?'СВЕТОВЫЕ ГЕОДЕЗИЧЕСКИЕ · ИНТЕГРИРОВАНИЕ':
    field?'ЭКСПЕРИМЕНТ ОСТАНОВЛЕН / ПОВТОР ДОСТУПЕН':'ГОТОВО К ЗАПУСКУ · ДВЕ КООРДИНАТНЫЕ КАРТЫ';
  $('field-start').textContent=running?'Перезапустить пучок':'Запустить 3D-пучок';
 }
 function applyParameters(p={}){
  for(const [key,a,b]of [
   ['polar',0,75],['azimuth',0,360],['cone',0,65],['count',1,25],
   ['source',1.5,4.5],['yaw',-3.14,3.14],['pitch',-1.35,1.35],['zoom',.55,1.65]
  ])if(Number.isFinite(p[key]))state[key]=clamp(p[key],a,b);
  state.count=Math.round(state.count);
  for(const key of ['showGrid','showRays','showConnections'])
   if(typeof p[key]==='boolean')state[key]=p[key];
  configure(getMetric());save();
 }
 function cacheStatic(ctx,w,h){
  const key=[w,h,state.yaw.toFixed(4),state.pitch.toFixed(4),state.zoom.toFixed(4),state.showGrid,state.showConnections,metric.a,metric.shape,metric.shapeWidth].join('|');
  if(staticLayer.key===key&&staticLayer.canvas)return staticLayer.canvas;
  const image=document.createElement('canvas');
  image.width=Math.ceil(w);image.height=Math.ceil(h);
  const g=image.getContext('2d');
  if(!g){return null}
  const cam={yaw:state.yaw,pitch:state.pitch,zoom:state.zoom};
  const P=p=>project3D(p,cam,w,h);
  // Concentric spherical areal-coordinate reference shells, each on an
  // INDEPENDENT chart (not a globally embedded spatial manifold).
  if(state.showConnections){
   const a=P(FIELD_CENTRES.A),b=P(FIELD_CENTRES.B);
   g.setLineDash([6,9]);stroke(g,a,b,'#dfd9a858',2);g.setLineDash([]);
   label(g,'ТОПОЛОГИЧЕСКАЯ СКЛЕЙКА (СХЕМА)',w*.5,Math.min(a.y,b.y)-14,9,'#acac8a','center');
  }
  const lines=[];
  for(const side of ['A','B']){
   const center=FIELD_CENTRES[side];
   for(const radius of state.showGrid?[1,2.05,3.3]:[1]){
    const loops=sphereWires({radius,center,longitudes:radius===1?10:8,latitudes:radius===1?5:4,steps:32});
    for(const poly of loops){
     const points=poly.map(P);
     const depth=poly.reduce((sum,p)=>sum+P(p).depth,0)/poly.length;
     lines.push({points,depth,side,radius});
    }
   }
  }
  lines.sort((a,b)=>a.depth-b.depth);
  for(const entry of lines){
   const bright=entry.depth>0;
   const col=entry.side==='A'?(bright?'#a3dcc5a9':'#628e8580'):
    (bright?'#dfa993ab':'#977c7482');
   polygon(g,entry.points,entry.radius===1?(entry.side==='A'?'#dceac0':'#e7c0ab'):col,
    entry.radius===1?1.8:.8);
  }
  const a=P(FIELD_CENTRES.A),b=P(FIELD_CENTRES.B);
  const small=w<520;
  label(g,'РЕГИОН A',a.x,a.y-90,small?10:12,'#a8e3c9','center',740);
  label(g,'РЕГИОН B',b.x,b.y-90,small?10:12,'#e3ae9d','center',740);
  label(g,'l > 0',a.x,a.y-73,9,'#729d91','center');
  label(g,'l < 0',b.x,b.y-73,9,'#b48c80','center');
  staticLayer={key,canvas:image};
  return image;
 }
 function draw(ctx,w,h){
  if(!active||!metric)return;
  const bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#0d2630');bg.addColorStop(.58,'#0b2028');bg.addColorStop(1,'#1c1924');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const layer=cacheStatic(ctx,w,h);
  if(layer)ctx.drawImage(layer,0,0,w,h);
  // Photons are lifted to arbitrary spatial orbital planes; line fragments
  // are deliberately BROKEN at the chart boundary (the visual gap is not a
  // real length or travel time).
  if(field&&state.showRays){
   const camera={yaw:state.yaw,pitch:state.pitch,zoom:state.zoom};
   for(const item of lightFieldSamples(field,metric,{maxPoints:250})){
    const col=colors[item.index%colors.length];
    let points=[],oldRegion=null;
    for(const p of item.points){
     if(oldRegion!==null&&p.region!==oldRegion){
      polygon(ctx,points,col+'a0',1.8);points=[];
     }
     points.push(project3D(p.position,camera,w,h));oldRegion=p.region;
    }
    polygon(ctx,points,col+'b8',2.1);
    const tip=project3D(item.current.position,camera,w,h);
    ctx.beginPath();ctx.arc(tip.x,tip.y,w<520?3.5:4.5,0,Math.PI*2);
    ctx.shadowBlur=12;ctx.shadowColor=col;ctx.fillStyle=col;ctx.fill();ctx.shadowBlur=0;
   }
  }else if(!field){
   // The initial source location is a coordinate marker, not a fake photon.
   const source=state.source;
   const p=project3D(chartPoint(metric,source*metric.a,0,[0,1,0]).position,
    state,w,h);
   ctx.fillStyle='#f0e7bc';ctx.beginPath();ctx.arc(p.x,p.y,4.3,0,Math.PI*2);ctx.fill();
  }
  label(ctx,'ШОВ / СВЕТОВОЕ ПОЛЕ · 3D',14,24,w<520?10:14,'#e9e7c6','left',760);
  label(ctx,'СФЕРИЧЕСКАЯ СИММЕТРИЯ → ПЛОСКОСТИ ОРБИТ',14,43,w<520?8:10,'#b0c9b9');
  label(ctx,'РАЗНЕСЕНИЕ УСТЬЕВ НЕ В МАСШТАБЕ',14,h-38,w<520?9:11,'#d9b8a0');
  label(ctx,'КООРДИНАТНЫЙ АТЛАС · НЕ ИЗОМЕТРИЧЕСКОЕ 3D-ВЛОЖЕНИЕ',14,h-19,w<520?8:9,'#88a99e');
 }
 function local(e){const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top};}
 canvas.addEventListener('pointerdown',e=>{
  if(!active||e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);touches.set(e.pointerId,local(e));
  if(touches.size>=2){const p=[...touches.values()];pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:state.zoom}}
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||!touches.has(e.pointerId))return;
  const prev=touches.get(e.pointerId),next=local(e);touches.set(e.pointerId,next);
  if(touches.size>1){
   const p=[...touches.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
   if(pinch&&pinch.distance>12)state.zoom=clamp(pinch.zoom*d/pinch.distance,.55,1.65);
  }else{
   state.yaw=clamp(state.yaw+(next.x-prev.x)*.008,-3.14,3.14);
   state.pitch=clamp(state.pitch+(next.y-prev.y)*.007,-1.35,1.35);
  }
  save();refresh();changed();
 });
 const end=e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;save()};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,end);
 canvas.addEventListener('wheel',e=>{
  if(!active)return;e.preventDefault();state.zoom=clamp(state.zoom*(e.deltaY>0?.92:1.08),.55,1.65);
  save();refresh();changed();
 },{passive:false});
 const settings=[
  ['polar',Number],['azimuth',Number],['cone',Number],['count',Number],
  ['source',Number],['zoom',Number]
 ];
 for(const [key,parse]of settings)$('field-'+key).addEventListener('input',e=>{
  state[key]=parse(e.target.value);
  if(key==='count')state.count=Math.round(state.count);
  if(['polar','azimuth','cone','count','source'].includes(key)){field=null;running=false;}
  save();refresh();changed();
 });
 for(const [id,key]of [['field-grid','showGrid'],['field-paths','showRays'],['field-seams','showConnections']])
  $(id).addEventListener('change',e=>{state[key]=e.target.checked;save();refresh();changed()});
 const presets={
  axial:{polar:0,azimuth:0,cone:0,count:1},
  cone:{polar:25,azimuth:38,cone:22,count:13},
  fan:{polar:45,azimuth:125,cone:48,count:19},
  grazing:{polar:69,azimuth:245,cone:12,count:17}
 };
 for(const button of document.querySelectorAll('[data-field-preset]'))
  button.addEventListener('click',()=>{
   const p=presets[button.dataset.fieldPreset];if(!p)return;
   Object.assign(state,p);field=null;running=false;refresh();save();changed();onAction?.('mount');
  });
 const cameras={
  diagram:{yaw:.68,pitch:.33,zoom:1},
  front:{yaw:1.55,pitch:.04,zoom:.89},
  top:{yaw:.75,pitch:1.30,zoom:.78},
  below:{yaw:-1.6,pitch:-.60,zoom:.82}
 };
 for(const button of document.querySelectorAll('[data-field-camera]'))
  button.addEventListener('click',()=>{
   Object.assign(state,cameras[button.dataset.fieldCamera]||cameras.diagram);
   save();refresh();changed();onAction?.('mount');
  });
 $('field-start').addEventListener('click',trigger);
 $('field-reset').addEventListener('click',reset);
 return {
  state,configure,setActive,trigger,reset,tick,draw,refresh,applyParameters,
  get running(){return running},
  get snapshot(){return {
   parameters:{...state},
   statistics:stats(),
   coordinates:field?coordinateConsistency(field,metric):[],
   rays:field?lightFieldSamples(field,metric,{maxPoints:120}):[],
   assumptions:FIELD_ASSUMPTIONS.slice()
  }}
 };
}
