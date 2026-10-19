import {
 atlasParams,certifyPoint,criticalSpeed,criticalDuration,chronologyMargin,
 phaseMap,sampleBoundary,evaluateAtUV,comparePoints,
 ATLAS_MIN_DISTANCE,ATLAS_MAX_SPEED,ATLAS_DEFAULTS
} from './chronology.js';

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const label=(ctx,str,x,y,size=10,color='#b8d3c4',align='left',weight=500)=>{
 ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';
 ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(str,x,y);
};
const line=(ctx,x1,y1,x2,y2,color,width=1)=>{
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
};
const fmt=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—';
const STORAGE='pocket-works:portal-lab:atlas-v09';
const PRESETS={
 safe:{distance:5,speed:.48,duration:23,throatTime:.65,maxDistance:9},
 threshold:{distance:3,speed:.85,duration:34,throatTime:.55,maxDistance:9},
 loop:{distance:3,speed:.85,duration:34,throatTime:.55,maxDistance:9},
 impossible:{distance:9,speed:.98,duration:12,throatTime:2,maxDistance:12}
};
function safeNum(value,defaultValue,lo,hi){
 const n=Number(value);
 return value!==null&&value!==undefined&&Number.isFinite(n)?clamp(n,lo,hi):defaultValue;
}
function safeLog(items){
 if(!Array.isArray(items))return [];
 const out=[];
 for(const item of items.slice(-4)){
  try{out.push(atlasParams(item));}catch{}
 }
 return out;
}
export function createChronologyAtlas(canvas,{onOpen,onAction,onDirty}={}){
 let persisted={};try{persisted=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{}
 const state={
  distance:safeNum(persisted.distance,3,.3,12),
  speed:safeNum(persisted.speed,.85,0,.98),
  duration:safeNum(persisted.duration,34,4,160),
  throatTime:safeNum(persisted.throatTime,.55,0,5),
  maxDistance:safeNum(persisted.maxDistance,9,1,12)
 };
 let log=safeLog(persisted.log),active=false,clearArmed=false,certified=false;
 let result=null,grid=null,curve=null,hitbox=null,dragging=null;
 const tile=document.createElement('canvas');
 tile.width=161;tile.height=121;
 const tileCtx=tile.getContext('2d',{alpha:false});
 const data=tileCtx.createImageData(tile.width,tile.height);
 let rasterDirty=true;
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify({...state,log}));}catch{}};
 function recompute(expensive=true){
  state.maxDistance=Math.max(1,state.maxDistance);
  result=certifyPoint(state);
  if(expensive){
   grid=phaseMap(state,161,121);
   curve=sampleBoundary(state,241);
   rasterDirty=true;
  }
  certified=false;
  save();update();
  onDirty?.();
 }
 function setActive(v){active=v;if(v){if(!result)recompute();update();onDirty?.();}else $('shoot').disabled=false;}
 function reset(){
  Object.assign(state,ATLAS_DEFAULTS);
  clearArmed=false;recompute();
  onAction?.('mount');
 }
 function verify(){
  result=certifyPoint(state);
  certified=true;
  update();onDirty?.();onAction?.(result.possible?'fracture':'mount');
 }
 function configure(){if(!result)recompute();}
 function setParams(p){
  const merged=atlasParams({...state,...p});
  const remap=merged.duration!==state.duration||merged.throatTime!==state.throatTime||
   merged.maxDistance!==state.maxDistance;
  Object.assign(state,merged);
  clearArmed=false;
  recompute(remap);
 }
 function update(){
  if(!result)return;
  const r=result,c=r.params,m=r.margin,near=Math.abs(m)<1e-7;
  for(const [id,k,d] of [
   ['atlas-distance','distance',2],['atlas-speed','speed',4],
   ['atlas-duration','duration',2],['atlas-throat','throatTime',2],
   ['atlas-max','maxDistance',1]
  ]){
   $(id).value=state[k];$(id+'-value').textContent=fmt(state[k],d);
  }
  const outcome=near?'boundary':r.possible?'loop':'safe';
  $('atlas-verdict').dataset.outcome=outcome;
  $('atlas-verdict').textContent=near?'НА ГРАНИЦЕ ПРИЧИННОСТИ':r.possible?'ЗАМКНУТЫЙ МАРШРУТ СУЩЕСТВУЕТ':'ЗАМКНУТОГО МАРШРУТА НЕТ';
  $('atlas-explanation').textContent=near?
   'Запас практически нулевой. Здесь маршрут возвращается к событию отправления без положительного запаса времени.':
   r.possible?'Суммарное отставание B превосходит внешний путь плюс задержку. Маршрут B→A→B возвращается раньше отправки.':
   'Внутреннее рассогласование часов недостаточно, чтобы замкнуть полный световой маршрут.';
  $('atlas-lag').textContent=fmt(r.lag,3);
  $('atlas-total').textContent=fmt(c.distance+c.throatTime,3);
  $('atlas-margin').textContent=(m>1e-8?'+':'')+fmt(m,4);
  $('atlas-margin').dataset.outcome=outcome;
  $('atlas-critical-speed').textContent=r.requiredSpeed===null?'Недостижимо':fmt(r.requiredSpeed,5);
  $('atlas-critical-duration').textContent=r.requiredDuration===null?'Недостижимо':fmt(r.requiredDuration,2);
  $('atlas-witness').textContent=(r.signal.chronologyMargin>1e-8?'+':'')+fmt(r.signal.chronologyMargin,3);
  $('atlas-solver-note').textContent=certified?
   (r.possible?'Проверено: B→A через горловину → B снаружи. Возврат предшествует отправке.':
    'Проверено полным маршрутом: сигнал не возвращается к отправителю до отправления.')
   :'Критическая скорость находится бисекцией. Все точки карты используют тот же интеграл часов, что и маршрут сигнала.';
  for(const button of document.querySelectorAll('[data-atlas-preset]')){
   const p={...PRESETS[button.dataset.atlasPreset]};
   if(button.dataset.atlasPreset==='threshold'){
    const test=criticalSpeed(p);p.speed=test??p.speed;
   }
   const match=Object.keys(p).every(k=>Math.abs(p[k]-state[k])<.00002);
   button.classList.toggle('selected',match);
   button.setAttribute('aria-pressed',String(match));
  }
  $('atlas-set-speed').disabled=r.requiredSpeed===null;
  $('atlas-set-duration').disabled=r.requiredDuration===null||
   r.requiredDuration<4||r.requiredDuration>160;
  $('atlas-clear-log').disabled=log.length===0;
  $('atlas-clear-log').textContent=clearArmed?'Подтвердить очистку':'Очистить журнал';
  $('atlas-log').innerHTML=log.length?
   '<div class="atlas-log-caption">СОХРАНЕНО '+log.length+' / 4</div>'+
   comparePoints(log).map(x=>'<div class="atlas-log-entry"><span>№'+x.index+' · β '+fmt(x.params.speed,3)+
     ' · D '+fmt(x.params.distance,2)+'</span><strong data-loop="'+x.possible+'">'+
     (x.possible?'+':'')+fmt(x.margin,3)+' с</strong></div>').join(''):
   '<p>Записей нет. Сохраните точку на карте, чтобы сравнить несколько условий.</p>';
  if(active){
   $('shoot').disabled=false;
   $('shoot').innerHTML=(certified?'Проверить маршрут ещё раз':'Проверить полный маршрут')+' <span aria-hidden="true">↗</span>';
  }
 }
 function regenerateRaster(){
  if(!rasterDirty)return;
  const pixels=data.data,{margins}=grid;
  const scale=Math.max(1,Math.max(Math.abs(grid.minimum),Math.abs(grid.maximum))*.30);
  for(let i=0;i<margins.length;i++){
   const margin=margins[i];
   // The hue encodes the SIGN of a physically computed chronology margin,
   // while intensity encodes how far from the model's actual boundary.
   const intensity=Math.pow(clamp(Math.abs(margin)/scale,0,1),.63);
   const offset=i*4,positive=margin>1e-8;
   const base=[18,42,47],color=positive?[192,119,86]:[48,123,114];
   const alpha=.22+.69*intensity;
   pixels[offset]=base[0]*(1-alpha)+color[0]*alpha;
   pixels[offset+1]=base[1]*(1-alpha)+color[1]*alpha;
   pixels[offset+2]=base[2]*(1-alpha)+color[2]*alpha;
   pixels[offset+3]=255;
  }
  tileCtx.putImageData(data,0,0);
  rasterDirty=false;
 }
 function draw(ctx,w,h){
  if(!active||!result)return;
  regenerateRaster();
  const small=w<610,pad=small?17:35;
  const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,'#17322e');gradient.addColorStop(1,'#0a1924');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  const field={
   x:small?48:77,
   y:small?65:80,
   w:w-(small?69:112),
   h:Math.max(165,Math.min(h*.67,h-(small?167:173)))
  };
  hitbox=field;
  const fx=x=>field.x+(x-ATLAS_MIN_DISTANCE)/(state.maxDistance-ATLAS_MIN_DISTANCE)*field.w;
  const fy=b=>field.y+(1-b/ATLAS_MAX_SPEED)*field.h;
  ctx.drawImage(tile,field.x,field.y,field.w,field.h);
  ctx.save();ctx.beginPath();ctx.rect(field.x,field.y,field.w,field.h);ctx.clip();
  for(let i=0;i<=6;i++){
   const x=field.x+i/6*field.w,y=field.y+i/6*field.h;
   line(ctx,x,field.y,x,field.y+field.h,'#ddf2e018',1);
   line(ctx,field.x,y,field.x+field.w,y,'#ddf2e018',1);
  }
  ctx.beginPath();
  let drawing=false;
  for(const pt of curve){
   if(pt.criticalDistance<ATLAS_MIN_DISTANCE||pt.criticalDistance>state.maxDistance){
    drawing=false;continue;
   }
   const x=fx(pt.criticalDistance),y=fy(pt.speed);
   if(!drawing){ctx.moveTo(x,y);drawing=true;}else ctx.lineTo(x,y);
  }
  ctx.strokeStyle='#fff0c7';ctx.lineWidth=small?2:2.4;ctx.shadowColor='#f3d9a0';ctx.shadowBlur=7;ctx.stroke();
  ctx.shadowBlur=0;
  const cursorX=clamp(fx(state.distance),field.x,field.x+field.w),cursorY=fy(state.speed);
  line(ctx,cursorX,field.y,cursorX,field.y+field.h,'#f9e5be54',1);
  line(ctx,field.x,cursorY,field.x+field.w,cursorY,'#f9e5be54',1);
  ctx.beginPath();ctx.arc(cursorX,cursorY,9,0,Math.PI*2);
  ctx.strokeStyle='#f7f0c9';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(cursorX,cursorY,2.8,0,Math.PI*2);
  ctx.fillStyle='#fff7d9';ctx.fill();
  ctx.restore();
  label(ctx,'АТЛАС · Δ(β,T) − D − δ',pad,24,small?12:16,'#d1e9d5','left',720);
  label(ctx,'РЕЗУЛЬТАТ ОПЫТА',w-pad,24,small?8:10,'#98bdac','right');
  label(ctx,'β / c',field.x,field.y-17,11,'#bedbca','left',720);
  label(ctx,'0.98',field.x-7,field.y,10,'#a1cbb7','right');
  label(ctx,'0.00',field.x-7,field.y+field.h,10,'#a1cbb7','right');
  for(let i=1;i<5;i++){
   const speed=(1-i/5)*.98;
   label(ctx,fmt(speed,2),field.x-7,fy(speed),9,'#8dafaa','right');
  }
  label(ctx,fmt(ATLAS_MIN_DISTANCE,1),field.x,field.y+field.h+14,10,'#a1cbb7','center');
  label(ctx,fmt(state.maxDistance,1),field.x+field.w,field.y+field.h+14,10,'#a1cbb7','center');
  label(ctx,'D / СВЕТОВЫЕ СЕКУНДЫ',field.x+field.w/2,field.y+field.h+31,small?9:11,'#b1d0be','center');
  const noteY=field.y+field.h+55;
  ctx.fillStyle='#183a36';ctx.fillRect(pad,noteY,Math.max(2,w-2*pad),small?60:67);
  ctx.fillStyle='#bf775f';ctx.fillRect(pad+9,noteY+13,9,9);
  label(ctx,'Петля по принятой склейке',pad+24,noteY+18,small?9:12,'#dccdb8');
  ctx.fillStyle='#5c9685';ctx.fillRect(pad+9,noteY+33,9,9);
  label(ctx,'Внешний возврат слишком поздний',pad+24,noteY+37,small?9:12,'#c5d9c8');
  label(ctx,'СВЕТЛАЯ КРИВАЯ = Δ=D+δ',w-pad-10,noteY+52,small?8:10,'#e8d9ae','right');
  if(h>540){
   const x=pad,y=noteY+87;
   label(ctx,'ПРОВЕРКА ПО ВРЕМЕНИ ПОЛНОГО МАРШРУТА',x,y,small?9:11,'#97c8b8','left',710);
   label(ctx,'B → A (норой) → B (снаружи)',x,y+22,small?9:12,'#d4ddbd');
   label(ctx,(result.possible?'ВОЗВРАТ ДО: ':'ВОЗВРАТ ПОСЛЕ: ')+fmt(result.margin,3)+' с',
    x,y+44,small?10:12,result.possible?'#e1aa8a':'#a3d5be','left',720);
  }
 }
 function fromPointer(e){
  if(!hitbox)return null;
  const rect=canvas.getBoundingClientRect();
  const x=e.clientX-rect.left,y=e.clientY-rect.top,q=hitbox;
  if(x<q.x-10||x>q.x+q.w+10||y<q.y-10||y>q.y+q.h+10)return null;
  return evaluateAtUV(grid,(x-q.x)/q.w,(y-q.y)/q.h);
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!active||e.pointerType==='mouse'&&e.button!==0)return;
  const point=fromPointer(e);if(!point)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  dragging=e.pointerId;
  setParams({distance:point.distance,speed:point.speed});
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||e.pointerId!==dragging)return;
  const point=fromPointer(e);if(!point)return;
  setParams({distance:point.distance,speed:point.speed});
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])
  canvas.addEventListener(name,e=>{if(dragging===e.pointerId)dragging=null;});
 for(const [id,key] of [
  ['atlas-distance','distance'],['atlas-speed','speed'],
  ['atlas-duration','duration'],['atlas-throat','throatTime'],['atlas-max','maxDistance']
 ])$(id).addEventListener('input',e=>setParams({[key]:Number(e.target.value)}));
 for(const btn of document.querySelectorAll('[data-atlas-preset]'))
  btn.addEventListener('click',()=>{
   const id=btn.dataset.atlasPreset,q={...PRESETS[id]};
   if(id==='threshold')q.speed=criticalSpeed(q)??q.speed;
   setParams(q);onAction?.('mount');
  });
 $('atlas-set-speed').addEventListener('click',()=>{
  if(result?.requiredSpeed!==null)setParams({speed:result.requiredSpeed});
  onAction?.('mount');
 });
 $('atlas-set-duration').addEventListener('click',()=>{
  const t=result?.requiredDuration;
  if(t!==null&&t>=4&&t<=160)setParams({duration:t});
  onAction?.('mount');
 });
 $('atlas-experiment').addEventListener('click',()=>{
  if(!result)return;
  onOpen?.({distance:state.distance,speed:state.speed,
   duration:state.duration,throatTime:state.throatTime});
  onAction?.('launch');
 });
 $('atlas-capture').addEventListener('click',()=>{
  log.push({...state});log=log.slice(-4);
  clearArmed=false;save();update();onAction?.('mount');
 });
 $('atlas-clear-log').addEventListener('click',()=>{
  if(!log.length)return;
  if(!clearArmed){clearArmed=true;update();return;}
  log=[];clearArmed=false;save();update();onAction?.('mount');
 });
 return {state,setActive,configure,trigger:verify,reset,draw,update,
  get snapshot(){return {params:{...state},certified,selected:result,
   curve:curve.map(p=>({...p})),log:comparePoints(log),
   map:{width:grid.width,height:grid.height,positive:grid.positive,
    negative:grid.negative,minimum:grid.minimum,maximum:grid.maximum}};}
 };
}
