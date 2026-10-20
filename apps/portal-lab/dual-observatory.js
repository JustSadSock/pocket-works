/**
 * SHOV 1.5 — twin instruments, one physical metric and observer point.
 * Two independently sized canvases share a signed proper radial coordinate
 * and spherical position; each invokes the EXISTING geodesic solver.
 * Their separate chart centers are only display conventions, never a
 * propagation distance or sky coordinate.
 */
import {createLightFieldLab} from './light-field-view.js';
import {createObservatory} from './observatory.js';
import {cameraBasis,pixelDirection,dot} from './optics.js';
import {cameraForRay,inspectObserverRay,normalizeObserverPoint,frameAt,worldDirection,chartObserverPosition} from './observer-bridge.js';
import {project3D} from './embedded-space.js';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const format=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
const RADIANS=180/Math.PI;
const LIMITS={low:.2,high:6};
export function inspectSharedCamera(m,point,observerState){
 const p=normalizeObserverPoint(point);
 const side=Math.sign(p.l),basis=cameraBasis(observerState.yaw,observerState.pitch,side,observerState.facingSign);
 const view=pixelDirection(0,0,basis,observerState.fov||80,1);
 const angle=Math.acos(clamp(dot(basis.radial,view),-1,1));
 const physical=inspectObserverRay(m,p,angle,{step:.09,outer:22,maxTime:145});
 return {point:p,gazeAngle:angle*RADIANS,physical};
}
export function sightAxis(m,point,camera,length=.85){
 const p=normalizeObserverPoint(point),frame=frameAt(p),
  basis=cameraBasis(camera.yaw,camera.pitch,Math.sign(p.l),camera.facingSign),
  forward=pixelDirection(0,0,basis,camera.fov||80,1),
  direction=worldDirection(forward,frame),
  source=chartObserverPosition(m,p).xyz;
 if(!Number.isFinite(length)||length<=0||length>3)throw Error('Некорректная длина индикатора направления');
 return {source,tip:source.map((v,k)=>v+direction[k]*length),direction,
  note:'Chart annotation: arrow has arbitrary visual length, not a geodesic segment'};
}
export function createDualObservatory({getMetric,onDirty,onAction,onView3D,onViewSky,fieldCanvas,skyCanvas}={}){
 const canvas3D=fieldCanvas||$('split-field-canvas'),canvasSky=skyCanvas||$('split-sky-canvas');
 if(!canvas3D||!canvasSky)throw Error('Холсты совмещённого наблюдения отсутствуют');
 let active=false,configured=false,started=false,drawCount=0,lastInfo=0,guard=false;
 const metric=()=>getMetric();
 function position(){return {...field.state.observerPoint}}
 const observer=createObservatory(canvasSky,{
  bindControls:false,storageKey:'pocket-works:shov:dual-sky-v15',
  onAction:kind=>onAction?.(kind)
 });
 function syncObserverPoint(point){
  if(guard)return;
  guard=true;
  try{
   const state=observer.state;
   observer.applyParameters({l:point.l,longitude:point.longitude,latitude:point.latitude,
    yaw:state.yaw,pitch:state.pitch,fov:state.fov,quality:state.quality,
    compare:false,geometryInset:false,facingSign:state.facingSign});
  }finally{guard=false;}
  update();onDirty?.();
 }
 const field=createLightFieldLab(canvas3D,{
  bindControls:false,storageKey:'pocket-works:shov:dual-field-v15',
  getMetric:metric,onAction:kind=>onAction?.(kind),onDirty:()=>onDirty?.(),
  onPointChange:syncObserverPoint
 });
 function resetMetric(m){
  configured=true;
  const here=position(),cam={...observer.state};
  field.configure(m);observer.configure(m);
  field.setObserverPoint(here);
  observer.applyParameters({l:here.l,longitude:here.longitude,latitude:here.latitude,
   yaw:cam.yaw,pitch:cam.pitch,fov:cam.fov,quality:cam.quality,
   facingSign:cam.facingSign,geometryInset:false,compare:false});
  started=false;update();
 }
 function align(point,pose={}){
  const p=normalizeObserverPoint(point);
  guard=true;
  try{
   field.setObserverPoint(p);
   observer.applyParameters({l:p.l,longitude:p.longitude,latitude:p.latitude,
    yaw:Number.isFinite(pose.yaw)?pose.yaw:observer.state.yaw,
    pitch:Number.isFinite(pose.pitch)?pose.pitch:observer.state.pitch,
    fov:Number.isFinite(pose.fov)?pose.fov:observer.state.fov,
    facingSign:pose.facingSign===-1?-1:pose.facingSign===1?1:observer.state.facingSign,
    mode:pose.mode||observer.state.mode,quality:pose.quality||observer.state.quality,
    compare:false,geometryInset:false});
  }finally{guard=false;}
  update();onDirty?.();
 }
 function enter(source,{sky,fieldSettings}={}){
  if(!configured)resetMetric(metric());
  if(source==='field3d'&&fieldSettings){
   field.applyParameters({...fieldSettings});
   const theta=fieldSettings.probeAngle??170;
   const pose=cameraForRay(field.state.observerPoint,theta*Math.PI/180);
   align(field.state.observerPoint,{...pose,quality:'balanced'});
   started=false;
  }else if(source==='observer'&&sky){
   align({l:Math.sign(sky.l||1)*clamp(Math.abs(sky.l||2.1),LIMITS.low,LIMITS.high),
    longitude:sky.longitude||0,latitude:sky.latitude||0},sky);
  }
  setActive(true);
  if(!started){field.trigger();started=true;}
  update();
 }
 function setActive(value){
  active=Boolean(value);
  $('split-stage').hidden=!active;
  field.setActive(active);observer.setActive(active);
  if(active)update();
 }
 function orientFromAngle(degrees){
  const point=position(),angle=clamp(degrees,0,180)*Math.PI/180;
  const pose=cameraForRay(point,angle);
  align(point,{...pose});
 }
 function setDistance(magnitude){
  const p=position();
  field.setObserverPoint({...p,l:Math.sign(p.l)*clamp(magnitude,LIMITS.low,LIMITS.high)});
 }
 function setRegion(region){
  const p=position();field.setObserverPoint({...p,l:(region==='B'?-1:1)*Math.abs(p.l)});
 }
 function start(){field.trigger();started=true;update();}
 function reset(){
  field.reset();started=false;
  field.setObserverPoint({l:3.1,longitude:0,latitude:0});
  orientFromAngle(170);update();
 }
 function takePhoton(){
  if(field.takePhoton()){update();return true}
  update();return false;
 }
 function check(){
  const r=inspectSharedCamera(metric(),position(),observer.state);
  $('split-ray-check').textContent='Центр кадра → '+r.physical.exit+
   ' · b/a '+format(r.physical.impact/metric().a,3)+
   ' · '+r.physical.passes+' переходов · |H| '+r.physical.residual.toExponential(1);
  onAction?.('mount');return r;
 }
 function resizeCanvas(canvas){
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
  if(w<=0||h<=0)return null;
  const ratio=Math.min(window.devicePixelRatio||1,2);
  const px=Math.max(1,Math.round(w*ratio)),py=Math.max(1,Math.round(h*ratio));
  if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py;}
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return null;
  ctx.setTransform(px/w,0,0,py/h,0,0);
  return {ctx,w,h};
 }
 function draw(){
  if(!active)return;
  const left=resizeCanvas(canvas3D),right=resizeCanvas(canvasSky);
  if(left){
   field.draw(left.ctx,left.w,left.h);
   const axis=sightAxis(metric(),position(),observer.state);
   const projection=field.cameraForCanvas(left.w,left.h);
   const a=project3D(axis.source,projection,left.w,left.h),
    b=project3D(axis.tip,projection,left.w,left.h);
   const g=left.ctx,dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1,
    ux=dx/n,uy=dy/n;
   g.save();
   g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);
   g.strokeStyle='#ffe6ae';g.lineWidth=2.5;g.stroke();
   g.beginPath();g.moveTo(b.x,b.y);
   g.lineTo(b.x-uy*5-ux*10,b.y+ux*5-uy*10);
   g.lineTo(b.x+uy*5-ux*10,b.y-ux*5-uy*10);
   g.closePath();g.fillStyle='#ffe6ae';g.fill();
   g.restore();drawCount++;
  }
  if(right){observer.draw(right.ctx,right.w,right.h);drawCount++;}
 }
 function tick(dt,speed=1,paused=false){
  if(!active)return;
  if(!paused)field.tick(dt,speed);
  // The sky stays static unless the user changes position/direction;
  // disabling tick while paused must not hide the progressive null-ray render.
  if(!paused)observer.tick(dt,speed);
  lastInfo+=dt;
  if(lastInfo>.17){update();lastInfo=0;}
 }
 function update(){
  const here=position(),os=observer.state,st=field.statistics,status=observer.status;
  $('split-region').value=here.l<0?'B':'A';
  $('split-distance').value=Math.abs(here.l);
  $('split-distance-value').textContent=format(Math.abs(here.l),2)+'a';
  $('split-longitude').value=here.longitude;
  $('split-longitude-value').textContent=format(here.longitude,0)+'°';
  $('split-latitude').value=here.latitude;
  $('split-latitude-value').textContent=format(here.latitude,0)+'°';
  const side=Math.sign(here.l),b=cameraBasis(os.yaw,os.pitch,side,os.facingSign);
  const forward=pixelDirection(0,0,b,os.fov,1);
  const theta=Math.acos(clamp(dot(b.radial,forward),-1,1))*RADIANS;
  $('split-angle').value=Math.round(theta);
  $('split-angle-value').textContent=format(theta,0)+'°';
  $('split-fov').value=os.fov;$('split-fov-value').textContent=format(os.fov,0)+'°';
  $('split-count').value=field.state.count;
  $('split-count-value').textContent=String(field.state.count);
  $('split-cone').value=field.state.cone;
  $('split-cone-value').textContent=format(field.state.cone,0)+'°';
  $('split-field-status').textContent=field.running?'ПУЧОК ДВИЖЕТСЯ':
   st?.photons?'ПУЧОК ОСТАНОВЛЕН':'ГОТОВ К ЗАПУСКУ';
  $('split-sky-status').textContent=status.stage==='ready'?'ЛИНЗИРОВАНИЕ РАССЧИТАНО':
   'ТРАССИРОВКА '+Math.round((status.progress||0)*100)+'%';
  $('split-readout').textContent=(here.l<0?'B':'A')+' · l/a '+format(here.l,2)+
   ' · λ '+format(here.longitude,0)+'° · φ '+format(here.latitude,0)+'°'+
   ' · фотонов '+(st?.photons||0)+' · переходов '+(st?.crossings||0);
  const o=status.opticalStats;
  $('split-sky-regions').textContent=o?'Небо A '+format(o.regionA,1)+'% · B '+
   format(o.regionB,1)+'% · неразрешено '+format(o.unresolved,1)+'%':'Свет рассчитывается…';
  $('split-photon').disabled=!(st?.photons>0);
  $('split-photon-index').max=Math.max(1,st?.photons||1);
  $('split-photon-index').value=clamp(field.state.selectedPhoton+1,1,st?.photons||1);
  $('split-photon-index-value').textContent=(field.state.selectedPhoton+1)+' / '+(st?.photons||0);
 }
 function applyParameters(p={}){
  if(p.field)field.applyParameters(p.field);
  if(p.observerPoint||p.camera){
   const source=p.observerPoint||position();
   align(source,p.camera||{});
  }
  started=false;
  update();
 }
 for(const [id,call] of [
  ['split-distance',v=>setDistance(v)],
  ['split-longitude',v=>field.setObserverPoint({...position(),longitude:v})],
  ['split-latitude',v=>field.setObserverPoint({...position(),latitude:v})],
  ['split-angle',orientFromAngle],
  ['split-fov',v=>{observer.applyParameters({...observer.state,fov:v,compare:false,geometryInset:false});update();}],
  ['split-count',v=>{field.applyParameters({...field.state,count:Math.round(clamp(v,1,25))});started=false;update();}],
  ['split-cone',v=>{field.applyParameters({...field.state,cone:clamp(v,0,65)});started=false;update();}],
  ['split-photon-index',v=>{field.state.selectedPhoton=Math.max(0,Math.round(v)-1);update();}]
 ]){
  $(id).addEventListener('input',e=>call(Number(e.target.value)));
 }
 $('split-region').addEventListener('change',e=>setRegion(e.target.value));
 $('split-launch').addEventListener('click',start);
 $('split-photon').addEventListener('click',takePhoton);
 $('split-test').addEventListener('click',check);
 $('split-view-3d').addEventListener('click',()=>{
  onView3D?.({field:{...field.state,observerPoint:position()}});
 });
 $('split-view-sky').addEventListener('click',()=>{
  onViewSky?.({camera:{...observer.state,longitude:position().longitude,latitude:position().latitude,
   l:position().l}});
 });
 return {enter,setActive,configure:resetMetric,trigger:start,reset,tick,draw,
  align,orientFromAngle,setDistance,setRegion,takePhoton,check,applyParameters,update,
  get active(){return active},
  get quickStats(){return field.statistics},
  get field(){return field},
  get observer(){return observer},
  get snapshot(){return {observerPoint:position(),camera:{...observer.state},
   field:field.snapshot,sky:observer.status,renderedFrames:drawCount,
   assumptions:[
    'Both panes use the same static spherical metric and physical observer point',
    'Twin coordinate chart centres are a display convention, never a distance',
    'The sky is derived from integrated null geodesics, not a screenshot of the 3D atlas',
    'The 3D chart is not a global isometric embedding'
   ]};}
 };
}
