import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { floodLinework } from './fill-engine.mjs';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import {createFolioCloudSync} from './cloud-sync.js';
import {createFolioCollab} from './collab.js';

installMobileRuntime();

const $ = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const uid = () => (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
const palettes = {
  atelier: ['#24465c','#c54a35','#efbd59','#3d9a89','#5877b3','#ffedd2','#e7976c','#6e8f74','#a05675','#cc9668','#94b8b3','#253f54','#cf6f50','#abbd7d','#deaaad','#2a313a'],
  dusk: ['#2c3c4c','#6b7890','#d3a37e','#d5bea4','#813e45','#51605d','#7a8b66','#f3e4cb'],
  garden: ['#3a5949','#86a77e','#d2b376','#e8d7ac','#a6624c','#6b7d7d','#c4a1a2','#37404b']
};
const brushes = [
  {id:'ink', name:'Тушь',hint:'Чёткая линия с тонким живым краем'},
  {id:'pencil',name:'Графит',hint:'Мягкий, зернистый карандаш'},
  {id:'gouache',name:'Гуашь',hint:'Плотная кисть с рваной кромкой'},
  {id:'marker',name:'Маркер',hint:'Ровная прозрачная полоса'},
  {id:'wash',name:'Акварель',hint:'Полупрозрачный размытый след'}
];
const ideas = [
  {title:'Последний маяк королевства',prompt:'Нарисуй старую башню на скале перед бурей.',palette:palettes.dusk},
  {title:'Ботаника неизвестного леса',prompt:'Придумай три растения, которых не существует.',palette:palettes.garden},
  {title:'Башня забытого алхимика',prompt:'Одинокая мастерская под медной крышей.',palette:palettes.atelier},
  {title:'Крохотное королевство',prompt:'Умести средневековый городок в одной ладони.',palette:palettes.garden},
  {title:'Герб странствующего рыцаря',prompt:'Три символа. Только четыре цвета.',palette:palettes.dusk}
];
const state = {
  doc:null, works:[], tool:'brush', brush:'ink', color:'#a6553e', size:9, opacity:1,
  mode:'precision', hand:'right', sheet:null, focus:false, idea:0,
  armPointer:null, armKeyboard:false, armLocked:false, allowLock:false, lastArmTap:0,
  fillTolerance:28, aimPointerId:null, aimPoint:null, aimTime:0,
  aimEvent:null, spacePan:false,
  panPointer:null, panStart:null, cursorActive:false,
  view:{cx:0,cy:0,scale:1,rot:0}, pointers:new Map(), pinch:null,
  draft:null, draftStart:0, lastMove:0, blockDraw:false,
  undo:[], redo:[], cache:new Map(), dirty:new Set(),
  frame:0, saveTimer:0, cursorTimer:0, toastTimer:0
};
try {
  if(localStorage.getItem('pocket-works:folio:hand')==='left')state.hand='left';
  state.allowLock=localStorage.getItem('pocket-works:folio:allowLock')==='true';
}catch{}
const isDesktop=()=>matchMedia('(min-width:960px) and (pointer:fine) and (min-height:500px)').matches;
function preferredMode(){
  const key='pocket-works:folio:mode:'+(isDesktop()?'desktop':'mobile');
  let saved;
  try{saved=localStorage.getItem(key);}catch{}
  return ['precision','nib','direct'].includes(saved)?saved:(isDesktop()?'direct':'precision');
}
function rememberMode(mode){
  try{localStorage.setItem('pocket-works:folio:mode:'+(isDesktop()?'desktop':'mobile'),mode);}catch{}
}
let database=null;
let folioCloud=null;
let folioCollab=null;
let remotePreviews=[];
let collaborationJobs=Promise.resolve();
const DB_NAME='pocket-works:folio:documents';
const DB_STORE='works';
try {const stored=localStorage.getItem('pocket-works:folio:fillTolerance');if(stored!==null){const n=Number(stored);if(Number.isFinite(n)&&n>=0&&n<=100)state.fillTolerance=n;}}catch{}
const stage=$('working-area');
const canvas=$('artboard');
const viewCtx=canvas.getContext('2d',{alpha:true});
const supportsIDB=typeof indexedDB!=='undefined';
const cloneData=(object)=>typeof structuredClone==='function'?structuredClone(object):JSON.parse(JSON.stringify(object));
const escapeHTML=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(message){
  const toast=$('toast');
  toast.textContent=message;
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer=setTimeout(()=>toast.classList.remove('visible'),2300);
}
function openDatabase(){
  return new Promise(resolve=>{
    if(!supportsIDB){resolve(null);return;}
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(DB_STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
}
function txPromise(mode,action){
  if(!database) return Promise.reject(new Error('storage unavailable'));
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(DB_STORE,mode);
    const store=tx.objectStore(DB_STORE);
    let value;
    const req=action(store);
    if(req){req.onsuccess=()=>{value=req.result;};req.onerror=()=>reject(req.error);}
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
async function loadWorks(){
  try {
    if(database)return await txPromise('readonly',store=>store.getAll());
    return JSON.parse(localStorage.getItem(DB_NAME+':fallback')||'[]');
  }catch(error){notify('Не удалось открыть локальную галерею');return [];}
}
async function putWork(work){
  if(database)return txPromise('readwrite',s=>s.put(work));
  const list=JSON.parse(localStorage.getItem(DB_NAME+':fallback')||'[]');
  const i=list.findIndex(v=>v.id===work.id);
  if(i>=0)list[i]=work;else list.push(work);
  localStorage.setItem(DB_NAME+':fallback',JSON.stringify(list));
}
async function removeWork(id){
  if(database)return txPromise('readwrite',s=>s.delete(id));
  const list=await loadWorks();
  localStorage.setItem(DB_NAME+':fallback',JSON.stringify(list.filter(w=>w.id!==id)));
}
function newLayer(name='Слой 1'){return {id:uid(),name,visible:true,opacity:1,strokes:[]};}
function makeDoc(title,w,h,colors=palettes.atelier){
  const layer=newLayer();
  return {id:uid(),title:title.trim()||'Без названия',width:w,height:h,paper:'#fbf5e8',
    palette:[...colors],layers:[layer],activeLayer:layer.id,updatedAt:Date.now(),thumb:''};
}
function currentLayer(){return state.doc?.layers.find(l=>l.id===state.doc.activeLayer);}
function markDirty(id){state.dirty.add(id);scheduleDraw();}
function resetCache(){state.cache.clear();state.dirty.clear();}
function createCanvas(w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;return c;
}
function paintStroke(ctx,stroke){
  if(stroke.tool==='fill'){
    ctx.save();ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=clamp(stroke.opacity??1,0,1);ctx.fillStyle=stroke.color;
    for(const run of stroke.runs||[])ctx.fillRect(run[1],run[0],run[2]-run[1]+1,1);
    for(const band of stroke.bands||[])ctx.fillRect(band[2],band[0],band[3]-band[2]+1,band[1]-band[0]+1);
    ctx.restore();return;
  }
  const p=stroke.points;
  if(!Array.isArray(p)||!p.length)return;
  const erasing=stroke.tool==='eraser';
  const preset=erasing?'eraser':stroke.brush;
  const base=clamp(stroke.size,1,144);
  ctx.save();
  ctx.globalCompositeOperation=erasing?'destination-out':'source-over';
  ctx.strokeStyle=erasing?'#000':stroke.color;
  ctx.fillStyle=ctx.strokeStyle;
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.globalAlpha=erasing?1:stroke.opacity*(preset==='marker'?.43:preset==='wash'?.21:preset==='pencil'?.67:1);
  if(preset==='marker'||preset==='wash'){
    ctx.lineWidth=base*(preset==='wash'?2.1:1.45);
    if(preset==='wash')ctx.filter='blur('+(Math.max(0.5,base*.15))+ 'px)';
    ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);
    for(let i=1;i<p.length-1;i++)ctx.quadraticCurveTo(p[i][0],p[i][1],(p[i][0]+p[i+1][0])/2,(p[i][1]+p[i+1][1])/2);
    if(p.length>1)ctx.lineTo(p[p.length-1][0],p[p.length-1][1]);
    else{ctx.lineTo(p[0][0]+.001,p[0][1]);}
    ctx.stroke();
  }else{
    const step=Math.max(.65,base*.19);
    for(let i=1;i<p.length;i++){
      const a=p[i-1],b=p[i],distance=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(distance/step));
      for(let j=1;j<=n;j++){
        const t=j/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
        const pressure=clamp((a[2]||1)+((b[2]||1)-(a[2]||1))*t,.3,1.2);
        const radius=base*pressure*.5*(preset==='gouache'?1.4:1);
        if(preset==='gouache'){
          const irregular=Math.sin(x*.19+y*.31)*base*.09;
          ctx.fillRect(x-radius,y-radius*.6+irregular,radius*2.04,radius*1.3);
        }else{
          ctx.beginPath();ctx.arc(x,y,Math.max(.5,radius),0,Math.PI*2);ctx.fill();
        }
      }
    }
    if(p.length===1){
      const a=p[0];
      ctx.beginPath();ctx.arc(a[0],a[1],base*(a[2]||1)*.5,0,Math.PI*2);ctx.fill();
    }
    if(preset==='pencil'&&p.length>1){
      ctx.globalAlpha*=.3;ctx.lineWidth=base*.3;ctx.beginPath();
      ctx.moveTo(p[0][0]+1,p[0][1]-1);
      for(let i=1;i<p.length;i++)ctx.lineTo(p[i][0]+Math.sin(i*17)*1.2,p[i][1]-1);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function layerCanvas(layer){
  let entry=state.cache.get(layer.id);
  if(!entry||state.dirty.has(layer.id)){
    const c=entry||createCanvas(state.doc.width,state.doc.height);
    const cctx=c.getContext('2d');
    cctx.clearRect(0,0,c.width,c.height);
    for(const stroke of layer.strokes)paintStroke(cctx,stroke);
    entry=c;state.cache.set(layer.id,c);state.dirty.delete(layer.id);
  }
  return entry;
}
function drawContents(ctx,forExport=false){
  const doc=state.doc;if(!doc)return;
  ctx.fillStyle=doc.paper;ctx.fillRect(0,0,doc.width,doc.height);
  for(const layer of doc.layers){
    if(!layer.visible)continue;
    ctx.save();ctx.globalAlpha=layer.opacity;
    if(state.draft&&state.draft.layer===layer.id&&!forExport){
      const temp=state.previewCanvas||createCanvas(doc.width,doc.height);
      const t=temp.getContext('2d');t.clearRect(0,0,doc.width,doc.height);
      t.drawImage(layerCanvas(layer),0,0);
      paintStroke(t,state.draft);
      ctx.drawImage(temp,0,0);
    }else ctx.drawImage(layerCanvas(layer),0,0);
    ctx.restore();
  }
  if(!forExport&&remotePreviews.length){
    for(const stroke of remotePreviews){
      if(!doc.layers.some(l=>l.id===stroke.layer&&l.visible))continue;
      paintStroke(ctx,stroke);
    }
  }
}
function render(){
  state.frame=0;
  if(!state.doc||$('studio').hidden)return;
  const bounds=stage.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const dpr=clamp(window.devicePixelRatio||1,1,2);
  const targetW=Math.round(bounds.width*dpr),targetH=Math.round(bounds.height*dpr);
  if(canvas.width!==targetW||canvas.height!==targetH){canvas.width=targetW;canvas.height=targetH;}
  viewCtx.setTransform(dpr,0,0,dpr,0,0);
  viewCtx.clearRect(0,0,bounds.width,bounds.height);
  const v=state.view,doc=state.doc;
  viewCtx.save();
  viewCtx.translate(v.cx,v.cy);viewCtx.rotate(v.rot);viewCtx.scale(v.scale,v.scale);
  viewCtx.translate(-doc.width/2,-doc.height/2);
  viewCtx.shadowColor='#0c1d1790';viewCtx.shadowBlur=24/v.scale;viewCtx.shadowOffsetY=6/v.scale;
  viewCtx.fillStyle=doc.paper;viewCtx.fillRect(0,0,doc.width,doc.height);
  viewCtx.shadowColor='transparent';viewCtx.shadowBlur=0;viewCtx.shadowOffsetY=0;
  drawContents(viewCtx);
  viewCtx.restore();
  $('zoom-label').textContent=Math.round(state.view.scale*100)+'%';
}
function scheduleDraw(){if(!state.frame)state.frame=requestAnimationFrame(render);}
function fitView(){
  if(!state.doc)return;
  const r=stage.getBoundingClientRect();
  state.view={cx:r.width/2,cy:r.height/2,scale:Math.min((r.width-38)/state.doc.width,(r.height-44)/state.doc.height),rot:0};
  updateNibSize();scheduleDraw();
}
function screenDoc(x,y){
  const v=state.view,d=state.doc;
  const dx=x-v.cx,dy=y-v.cy,c=Math.cos(-v.rot),s=Math.sin(-v.rot);
  return [((dx*c-dy*s)/v.scale)+d.width/2,((dx*s+dy*c)/v.scale)+d.height/2];
}
function canvasPoint(event){
  const r=canvas.getBoundingClientRect();
  return {x:event.clientX-r.left,y:event.clientY-r.top};
}
function pointerTip(p,pointerType='touch'){
  if(state.mode==='direct'||state.tool==='pipette'||state.tool==='fill'||pointerType==='mouse'||pointerType==='pen')return p;
  return {x:p.x+(state.hand==='left'?18:-18),y:p.y-51};
}
function resetAim(){
  state.aimPointerId=null;state.aimPoint=null;state.aimTime=0;
}
function smoothAim(e,first=false){
  if(e.pointerType!=='touch')return;
  const raw=canvasPoint(e),stamp=Number.isFinite(e.timeStamp)?e.timeStamp:performance.now();
  if(first||state.aimPointerId!==e.pointerId||!state.aimPoint){
    state.aimPointerId=e.pointerId;state.aimPoint={...raw};state.aimTime=stamp;return;
  }
  const last=state.aimPoint;
  const dt=clamp(stamp-state.aimTime||8,1,60);
  const dx=raw.x-last.x,dy=raw.y-last.y,dist=Math.hypot(dx,dy);
  // Ignore truly implausible single-event glitches, never clip an entire fast
  // gesture to a short increment (that used to leave the stroke behind).
  if(dt<6&&dist>240)return;
  const speed=dist/dt;
  // Slow movements are stabilized. Deliberate quick lines follow at full speed.
  const alpha=clamp(.43+speed*.45,.43,1);
  state.aimPoint={x:last.x+dx*alpha,y:last.y+dy*alpha};
  state.aimTime=Math.max(state.aimTime,stamp);
}
function drawingPosition(e){
  if(e.pointerType==='touch'&&state.aimPointerId===e.pointerId&&state.aimPoint)return state.aimPoint;
  return canvasPoint(e);
}
function inputPoint(e){
  const tip=pointerTip(drawingPosition(e),e.pointerType);
  const [x,y]=screenDoc(tip.x,tip.y);
  return [clamp(x,0,state.doc.width),clamp(y,0,state.doc.height)];
}
function brushDiameter(){
  const multiplier=state.tool==='eraser'?1:
    state.brush==='wash'?2.1:state.brush==='marker'?1.45:state.brush==='gouache'?1.4:1;
  return state.size*multiplier*state.view.scale;
}
function updateNibSize(){
  const nib=$('nib-cursor');
  const diameter=Math.max(2,brushDiameter());
  nib.style.setProperty('--nib-diameter',diameter+'px');
  nib.style.setProperty('--nib-color',state.color);
  $('nib-measure').textContent=state.size+' px';
}
function setCursor(e){
  const pen=e.pointerType==='mouse'||e.pointerType==='pen';
  const drawable=state.tool==='brush'||state.tool==='eraser';
  if(!drawable||(!pen&&state.mode==='direct')||state.spacePan||state.panPointer!==null||state.pinch){
    $('nib-cursor').hidden=true;return;
  }
  const p=pointerTip(drawingPosition(e),e.pointerType),nib=$('nib-cursor');
  updateNibSize();nib.style.left=p.x+'px';nib.style.top=p.y+'px';nib.hidden=false;
}
function hideCursor(){ $('nib-cursor').hidden=true; }
function isArmed(){return state.armLocked||state.armPointer!==null||state.armKeyboard;}
function updateArmUI(){
  const pressed=isArmed();
  $('precision-arm').classList.toggle('is-armed',pressed);
  $('precision-arm').classList.toggle('is-locked',state.armLocked);
  $('precision-arm').setAttribute('aria-pressed',String(pressed));
  $('precision-arm').setAttribute('aria-label',state.armLocked?'Отключить непрерывное рисование':'Удерживать для рисования');
  $('arm-hint').textContent=state.armLocked?'ЗАКРЕПЛЕНО':state.allowLock?'ЗАЖАТЬ / 2 ТАПА':'ЗАЖАТЬ';
}
function armDrawing(pointerOrKeyboard,isDown,cancel=false){
  if(pointerOrKeyboard==='keyboard')state.armKeyboard=isDown;
  else state.armPointer=isDown?pointerOrKeyboard:null;
  updateArmUI();
  if(state.mode!=='precision'||!state.doc)return;
  if(!isArmed())finishStroke(cancel);
  else if(!state.draft&&state.aimEvent&&state.pointers.size===1&&!state.pinch&&!state.spacePan){
    beginStroke(state.aimEvent);
  }
  if(state.aimEvent&&state.pointers.size===1)setCursor(state.aimEvent);
}
function setInputMode(mode,{save=true}={}){
  if(!['precision','nib','direct'].includes(mode))return;
  finishStroke();
  state.mode=mode;
  if(save)rememberMode(mode);
  const active=mode==='precision';
  $('studio').classList.toggle('mode-precision',active);
  $('canvas-guide').textContent=state.tool==='fill'?'Коснись области, чтобы залить её':active?'Наведи остриё · зажми «Рисовать» другой рукой':
    mode==='nib'?'Остриё выше пальца · движение рисует':'Веди пальцем или мышью по бумаге';
  if(!active){state.armPointer=null;state.armKeyboard=false;state.armLocked=false;updateArmUI();}
  hideCursor();updateToolUI();
  if(state.doc)syncDesktop();
}
function resetInput(){
  finishStroke(true);state.pointers.clear();state.pinch=null;state.blockDraw=false;
  state.aimEvent=null;resetAim();state.panPointer=null;state.panStart=null;state.spacePan=false;
  state.armPointer=null;state.armKeyboard=false;state.armLocked=false;state.lastArmTap=0;updateArmUI();hideCursor();
  $('studio').classList.remove('is-panning');
}
function beginStroke(e){
  if(!currentLayer()?.visible || currentLayer()?.opacity===0){notify('Этот слой скрыт или прозрачен');return;}
  const tip=pointerTip(drawingPosition(e),e.pointerType);
  const rawPoint=screenDoc(tip.x,tip.y);
  if(rawPoint[0]<0||rawPoint[0]>state.doc.width||rawPoint[1]<0||rawPoint[1]>state.doc.height)return;
  const point=[rawPoint[0],rawPoint[1]];
  state.draft={
    id:uid(),layer:state.doc.activeLayer,tool:state.tool,brush:state.brush,
    color:state.color,size:state.size,opacity:state.opacity,points:[[...point,1]]
  };
  state.previewCanvas=createCanvas(state.doc.width,state.doc.height);
  state.draftStart=performance.now();state.lastMove=performance.now();
  stage.classList.add('is-drawing');scheduleDraw();
}
function extendStroke(e){
  if(!state.draft)return;
  const p=inputPoint(e),list=state.draft.points,last=list[list.length-1];
  const distance=Math.hypot(p[0]-last[0],p[1]-last[1]);
  if(distance<.9)return;
  const elapsed=Math.max(1,performance.now()-state.lastMove);
  const velocity=distance/elapsed;
  const pseudoPressure=clamp(1-velocity*.13,.46,1);
  list.push([...p,pseudoPressure]);
  state.lastMove=performance.now();scheduleDraw();
  folioCollab?.preview(state.draft);
}
function finishStroke(cancel=false){
  const draft=state.draft;state.draft=null;state.previewCanvas=null;
  folioCollab?.endPreview();
  stage.classList.remove('is-drawing');hideCursor();
  if(state.mode==='precision'&&state.aimEvent&&state.pointers.size===1)setCursor(state.aimEvent);
  if(!draft||cancel){scheduleDraw();return;}
  const points=draft.points;
  const layer=state.doc.layers.find(l=>l.id===draft.layer);
  if(!layer)return;
  // Keep the actual sampled trajectory. In shared mode, send one bounded
  // operation instead of network packets for every PointerEvent.
  if(folioCollab?.active()){
    const accepted=folioCollab.commit(draft);
    if(!accepted){scheduleDraw();return;}
    Object.assign(draft,accepted);
  }
  layer.strokes.push(draft);
  state.undo.push({layer:layer.id,stroke:draft,index:layer.strokes.length-1});
  if(state.undo.length>200)state.undo.shift();
  state.redo=[];
  markDirty(layer.id);updateUndoRedo();queueSave();
}
function pinchStart(){
  const [a,b]=[...state.pointers.values()];
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  state.pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),angle:Math.atan2(b.y-a.y,b.x-a.x),
    scale:state.view.scale,rot:state.view.rot,anchor:screenDoc(mid.x,mid.y)};
}
function pinchUpdate(){
  if(state.pointers.size<2||!state.pinch)return;
  const [a,b]=[...state.pointers.values()];
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},p=state.pinch,d=state.doc;
  const dist=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
  const scale=clamp(p.scale*dist/p.distance,.09,7);
  const rot=p.rot+Math.atan2(b.y-a.y,b.x-a.x)-p.angle;
  const ox=(p.anchor[0]-d.width/2)*scale,oy=(p.anchor[1]-d.height/2)*scale;
  state.view={cx:mid.x-(ox*Math.cos(rot)-oy*Math.sin(rot)),cy:mid.y-(ox*Math.sin(rot)+oy*Math.cos(rot)),scale,rot};
  updateNibSize();scheduleDraw();
}
function sampleColor(e){
  const p=inputPoint(e),c=createCanvas(1,1),cx=c.getContext('2d',{willReadFrequently:true});
  cx.translate(-Math.round(p[0]),-Math.round(p[1]));
  drawContents(cx,true);
  const rgba=cx.getImageData(0,0,1,1).data;
  state.color='#'+[...rgba].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
  state.tool='brush';updateToolUI();notify('Цвет взят с рисунка');
}


// Snapshot the visible drawing, flood on that composite, and store only scanline
// ranges. The fill is inserted beneath linework but above earlier fills.
function hexRGB(value){
  const v=value.match(/^#([a-f0-9]{6})$/i);
  return v?[0,2,4].map(i=>parseInt(v[1].slice(i,i+2),16)):[0,0,0];
}
function fillAt(e){
  const layer=currentLayer(),doc=state.doc;
  if(!layer?.visible||layer.opacity===0){notify('Выбери видимый слой для заливки');return;}
  const tip=pointerTip(drawingPosition(e),e.pointerType);
  const point=screenDoc(tip.x,tip.y);
  const x=Math.floor(point[0]),y=Math.floor(point[1]),w=doc.width,h=doc.height;
  if(x<0||y<0||x>=w||y>=h)return;
  // Build a transparent ink map from the real drawn strokes only.
  // Existing bucket fills are NOT region boundaries, so repainting works.
  const inkCanvas=createCanvas(w,h),inkCtx=inkCanvas.getContext('2d',{willReadFrequently:true});
  const scratch=createCanvas(w,h),scratchCtx=scratch.getContext('2d');
  for(const visibleLayer of doc.layers){
    if(!visibleLayer.visible||visibleLayer.opacity===0)continue;
    scratchCtx.clearRect(0,0,w,h);
    for(const stroke of visibleLayer.strokes){
      if(stroke.tool!=='fill')paintStroke(scratchCtx,stroke);
    }
    inkCtx.save();inkCtx.globalAlpha=visibleLayer.opacity;
    inkCtx.drawImage(scratch,0,0);inkCtx.restore();
  }
  const linePixels=inkCtx.getImageData(0,0,w,h).data;
  const runs=floodLinework(linePixels,w,h,x,y,state.fillTolerance);
  if(!runs.length){notify('Коснись пространства внутри контура');return;}
  // Vertical run bands dramatically shrink large flat flood-fills in PocketNet.
  const bands=[];
  for(const [y,x1,x2] of runs){
    const prev=bands[bands.length-1];
    if(prev&&prev[1]===y-1&&prev[2]===x1&&prev[3]===x2)prev[1]=y;
    else bands.push([y,y,x1,x2]);
  }
  const stroke={id:uid(),layer:layer.id,tool:'fill',color:state.color,opacity:state.opacity,
    ...(folioCollab?.active()?{bands}: {runs})};
  if(folioCollab?.active()&&!folioCollab.commit(stroke))return;
  // All buckets paint over previous buckets, but beneath hand-drawn contours.
  const position=layer.strokes.findIndex(s=>s.tool!=='fill');
  const index=position<0?layer.strokes.length:position;
  layer.strokes.splice(index,0,stroke);
  state.undo.push({layer:layer.id,stroke,index});
  if(state.undo.length>200)state.undo.shift();
  state.redo=[];markDirty(layer.id);updateUndoRedo();queueSave();
  notify('Область залита');
}
function translatePan(e){
  if(state.panPointer!==e.pointerId||!state.panStart)return;
  const p=canvasPoint(e);
  state.view.cx=state.panStart.cx+(p.x-state.panStart.x);
  state.view.cy=state.panStart.cy+(p.y-state.panStart.y);
  scheduleDraw();
}
canvas.addEventListener('pointerdown',e=>{
  if(!state.doc||state.sheet)return;
  if(folioCollab?.active()&&!folioCollab.ready()){
    notify('Нет связи · рисование возобновится после подключения');return;
  }
  if(e.button===2){e.preventDefault();sampleColor(e);return;}
  e.preventDefault();try{canvas.setPointerCapture(e.pointerId);}catch{}
  const point=canvasPoint(e);
  state.pointers.set(e.pointerId,point);
  if(state.pointers.size===2){
    finishStroke(true);state.blockDraw=true;state.aimEvent=null;resetAim();
    state.panPointer=null;state.panStart=null;$('studio').classList.remove('is-panning');state.pinch=null;pinchStart();return;
  }
  if(state.pointers.size>2){state.blockDraw=true;return;}
  if(e.button===1||state.spacePan){
    state.panPointer=e.pointerId;
    state.panStart={x:point.x,y:point.y,cx:state.view.cx,cy:state.view.cy};
    $('studio').classList.add('is-panning');
    hideCursor();return;
  }
  if(state.blockDraw)return;
  state.aimEvent=e;smoothAim(e,true);
  if(state.tool==='pipette'){sampleColor(e);state.aimEvent=null;return;}
  if(state.tool==='fill'){fillAt(e);state.aimEvent=null;return;}
  setCursor(e);
  if(state.mode!=='precision'||isArmed())beginStroke(e);
});
canvas.addEventListener('pointermove',e=>{
  if(!state.pointers.has(e.pointerId)){
    if(e.pointerType==='mouse'||e.pointerType==='pen'){
      if(!state.spacePan&&!state.sheet&&state.doc)setCursor(e);
    }
    return;
  }
  e.preventDefault();state.pointers.set(e.pointerId,canvasPoint(e));
  if(state.pointers.size>=2){pinchUpdate();return;}
  if(state.panPointer===e.pointerId){translatePan(e);return;}
  if(state.blockDraw)return;
  if(state.tool==='pipette'||state.tool==='fill')return;
  const coalesced=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
  const samples=coalesced.length?[...coalesced]:[];
  // Some drivers omit the current PointerEvent from their coalesced batch.
  if(!samples.length||samples[samples.length-1].timeStamp!==e.timeStamp||
      samples[samples.length-1].clientX!==e.clientX||samples[samples.length-1].clientY!==e.clientY) samples.push(e);
  for(const sample of samples){
    smoothAim(sample);
    state.aimEvent=sample;
    if(state.mode==='precision'&&!isArmed())continue;
    if(!state.draft)beginStroke(sample);
    extendStroke(sample);
  }
  // Use the same filtered coordinates for both the ring and the painted path.
  setCursor(e);
});
canvas.addEventListener('pointerleave',e=>{
  if(!state.pointers.has(e.pointerId))hideCursor();
});
function endPointer(e){
  if(!state.pointers.has(e.pointerId))return;
  e.preventDefault();
  if(state.panPointer===e.pointerId){
    state.pointers.delete(e.pointerId);state.panPointer=null;state.panStart=null;
    $('studio').classList.remove('is-panning');
    state.aimEvent=null;resetAim();hideCursor();return;
  }
  const wasMany=state.blockDraw||state.pointers.size>1;
  if(!wasMany&&e.type==='pointerup'&&state.draft&&
    (state.tool==='brush'||state.tool==='eraser')){
    // A fast flick often ends between pointermove frames. Record its true tip.
    smoothAim(e);state.aimEvent=e;extendStroke(e);
  }
  state.pointers.delete(e.pointerId);
  if(wasMany){
    finishStroke(true);state.pinch=null;state.blockDraw=state.pointers.size!==0;
  }else finishStroke(e.type==='pointercancel');
  if(!state.pointers.size){
    state.blockDraw=false;state.aimEvent=null;resetAim();hideCursor();
    if((e.pointerType==='mouse'||e.pointerType==='pen')&&e.type==='pointerup'&&!state.sheet&&!state.spacePan)setCursor(e);
  }
}
canvas.addEventListener('pointerup',endPointer);
canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('lostpointercapture',e=>{if(state.pointers.has(e.pointerId))endPointer(e);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('precision-arm').addEventListener('pointerdown',e=>{
  if(!state.doc||state.mode!=='precision'||state.sheet)return;
  e.preventDefault();e.stopPropagation();
  try{$('precision-arm').setPointerCapture(e.pointerId);}catch{}
  if(state.armLocked){
    state.armLocked=false;state.lastArmTap=0;state.armPointer=null;
    updateArmUI();finishStroke();notify('Перо поднято');return;
  }
  const now=performance.now();
  if(state.allowLock&&now-state.lastArmTap<350){
    state.armLocked=true;state.lastArmTap=0;notify('Перо закреплено · нажми снова, чтобы поднять');
  }
  armDrawing(e.pointerId,true);
});
function stopArm(e){
  if(state.armPointer!==e.pointerId)return;
  e.preventDefault();
  if(state.allowLock&&!state.armLocked&&e.type==='pointerup')state.lastArmTap=performance.now();
  if(e.type==='pointercancel')state.armLocked=false;
  armDrawing(e.pointerId,false,e.type==='pointercancel');
}
$('precision-arm').addEventListener('pointerup',stopArm);
$('precision-arm').addEventListener('pointercancel',stopArm);
$('precision-arm').addEventListener('lostpointercapture',stopArm);
window.addEventListener('pointerup',e=>{if(state.armPointer===e.pointerId)stopArm(e);});
function zoomAt(x,y,scale){
  const v=state.view,doc=state.doc;
  const anchor=screenDoc(x,y),rot=v.rot;
  const dx=(anchor[0]-doc.width/2)*scale,dy=(anchor[1]-doc.height/2)*scale;
  v.scale=scale;
  v.cx=x-(dx*Math.cos(rot)-dy*Math.sin(rot));
  v.cy=y-(dx*Math.sin(rot)+dy*Math.cos(rot));
  updateNibSize();scheduleDraw();
}
canvas.addEventListener('wheel',e=>{
  if(!state.doc||state.sheet)return;
  e.preventDefault();
  const p=canvasPoint(e);
  const factor=Math.exp(-clamp(e.deltaY,-140,140)*.0025);
  zoomAt(p.x,p.y,clamp(state.view.scale*factor,.09,7));
},{passive:false});

function updateUndoRedo(){
  if(folioCollab?.active()){
    $('undo').disabled=!folioCollab.ready()||!state.doc?.layers?.some(l=>l.strokes.some(s=>folioCollab.isMine(s)));
    $('redo').disabled=!folioCollab.ready()||!folioCollab.canRedo();return;
  }
  $('undo').disabled=state.undo.length===0;
  $('redo').disabled=state.redo.length===0;
}
function undo(){
  if(folioCollab?.active()){folioCollab.undo();return;}
  finishStroke(true);
  const entry=state.undo.pop();if(!entry)return;
  const layer=state.doc.layers.find(l=>l.id===entry.layer);
  if(!layer)return;
  const i=layer.strokes.findIndex(s=>s.id===entry.stroke.id);
  if(i>=0)layer.strokes.splice(i,1);
  state.redo.push(entry);markDirty(layer.id);updateUndoRedo();queueSave();
}
function redo(){
  if(folioCollab?.active()){folioCollab.redo();return;}
  const entry=state.redo.pop();if(!entry)return;
  const layer=state.doc.layers.find(l=>l.id===entry.layer);
  if(!layer)return;
  if(!layer.strokes.some(s=>s.id===entry.stroke.id))layer.strokes.splice(Math.min(entry.index??layer.strokes.length,layer.strokes.length),0,entry.stroke);
  state.undo.push(entry);markDirty(layer.id);updateUndoRedo();queueSave();
}
function updateToolUI(){
  for(const btn of document.querySelectorAll('.tool[data-tool]'))btn.classList.toggle('selected',btn.dataset.tool===state.tool);
  $('active-swatch').style.background=state.color;
  $('brush-label').textContent=state.tool==='fill'?'Заливка':state.tool==='eraser'?'Ластик':state.tool==='pipette'?'Пипетка':brushes.find(b=>b.id===state.brush)?.name||'Кисть';
  $('brush-size').value=state.size;$('brush-size-value').textContent=state.size;
  $('brush-opacity').value=Math.round(state.opacity*100);$('brush-opacity-value').textContent=Math.round(state.opacity*100)+'%';
  $('mode-label').textContent=state.mode==='precision'?'Точное перо':state.mode==='nib'?'Остриё':'Прямо';
  $('mode-icon').textContent=state.mode==='precision'?'⊙':state.mode==='nib'?'◎':'●';
  $('working-area').classList.toggle('left-handed',state.hand==='left');
  $('studio').classList.toggle('tool-fill',state.tool==='fill');
  $('studio').classList.toggle('tool-drawing',state.tool==='brush'||state.tool==='eraser');
  $('mobile-fill-control').hidden=state.tool!=='fill';
  $('fill-tolerance').value=state.fillTolerance;
  $('fill-tolerance-value').textContent=state.fillTolerance;
  updateNibSize();
  if(state.doc)syncDesktop();
}
function selectTool(tool){
  finishStroke(true);state.tool=tool;
  $('canvas-guide').textContent=tool==='fill'?'Коснись области, чтобы залить её':
    state.mode==='precision'?'Наведи остриё · зажми «Рисовать» другой рукой':
    state.mode==='nib'?'Остриё выше пальца · движение рисует':'Веди пальцем или мышью по бумаге';
  updateToolUI();
}
function openSheet(kind){
  if(folioCollab?.active()&&kind==='layers'){notify('Все рисуют на общем слое. Изменение слоёв доступно в личной копии.');return;}
  finishStroke(true);
  state.sheet=kind;
  $('sheet').hidden=false;$('sheet-backdrop').hidden=false;
  $('sheet-title').textContent={brush:'Характер штриха',color:'Палитра',layers:'Слои',spark:'Искра',export:'Сохранить работу'}[kind];
  renderSheet();
}
function closeSheet(){
  state.sheet=null;$('sheet').hidden=true;$('sheet-backdrop').hidden=true;
}
function renderSheet(){
  const body=$('sheet-body');if(!state.sheet)return;
  if(state.sheet==='brush'){
    body.innerHTML='<div class="brush-list">'+brushes.map(b=>'<button class="brush-choice '+(b.id===state.brush?'is-active':'')+'" data-brush="'+b.id+'"><div class="brush-mark '+b.id+'"><i></i></div><div><strong>'+b.name+'</strong><span>'+b.hint+'</span></div></button>').join('')+'</div><div class="hand-row"><span>Острие для руки</span><button data-hand="right" class="'+(state.hand==='right'?'active':'')+'">Правша</button><button data-hand="left" class="'+(state.hand==='left'?'active':'')+'">Левша</button></div><label class="precision-lock-toggle"><input id="allow-lock" type="checkbox" '+(state.allowLock?'checked':'')+'><span>Двойной тап закрепляет кнопку<br><small>Опционально: для длинных штрихов, без удержания</small></span></label><p class="sheet-footnote">Размер и насыщенность регулируются под холстом.</p>';
  }
  if(state.sheet==='brush'){
    $('allow-lock').onchange=e=>{
      state.allowLock=e.target.checked;
      if(!state.allowLock&&state.armLocked){state.armLocked=false;finishStroke();}
      updateArmUI();
      try{localStorage.setItem('pocket-works:folio:allowLock',String(state.allowLock));}catch{}
    };
  }
  if(state.sheet==='color'){
    const colors=state.doc?.palette||palettes.atelier;
    body.innerHTML='<p class="sheet-subheading">ЦВЕТА ЭТОГО РИСУНКА</p><div class="palette-grid">'+colors.map(c=>'<button class="palette-chip '+(c.toLowerCase()===state.color.toLowerCase()?'is-active':'')+'" style="--chip:'+c+'" data-color="'+c+'" aria-label="Цвет '+c+'"></button>').join('')+'</div><div class="color-picker-line"><input id="custom-color" type="color" value="'+state.color+'"><label for="custom-color">Свой оттенок<br><small>Выбери любой цвет спектра</small></label><button class="action-quiet" id="keep-color">В палитру +</button></div>';
    $('custom-color').addEventListener('input',e=>{state.color=e.target.value;selectTool(state.tool==='fill'?'fill':'brush');updateToolUI();});
    $('keep-color').onclick=()=>{
      if(!state.doc.palette.includes(state.color)){state.doc.palette.push(state.color);queueSave();notify('Цвет сохранён');}
      renderSheet();
    };
  }
  if(state.sheet==='layers')renderLayerSheet(body);
  if(state.sheet==='spark'){
    const idea=ideas[state.idea];
    body.innerHTML='<div class="spark-card"><div class="sheet-subheading">ИДЕЯ № '+String(state.idea+1).padStart(2,'0')+'</div><h3>'+escapeHTML(idea.title)+'</h3><p>'+escapeHTML(idea.prompt)+'</p><div class="spark-colors">'+idea.palette.map(c=>'<i style="background:'+c+'"></i>').join('')+'</div></div><div class="sheet-actions"><button id="new-spark">Другая идея</button><button class="primary" id="draw-spark">Рисовать</button></div>';
    $('new-spark').onclick=()=>{state.idea=(state.idea+1)%ideas.length;renderSheet();};
    $('draw-spark').onclick=()=>newCanvasDialog(idea);
  }
  if(state.sheet==='export'){
    body.innerHTML='<p class="sheet-footnote">PNG в исходном разрешении '+state.doc.width+' × '+state.doc.height+' пикселей. Слои сохраняются в редактируемом проекте FOLIO.</p><div class="sheet-actions"><button class="primary" id="do-png">Сохранить PNG</button><button id="do-copy">Копия проекта</button></div><div class="sheet-actions"><button id="do-delete">Удалить работу</button></div>';
    $('do-png').onclick=exportPNG;
    $('do-copy').onclick=async()=>{
      const copy=cloneData(state.doc);copy.id=uid();copy.title+=' — копия';copy.updatedAt=Date.now();
      await putWork(copy);notify('Копия добавлена в альбом');closeSheet();
    };
    $('do-delete').onclick=()=>{if(folioCollab?.active()){notify('Сначала выйди из общей комнаты');return;}showModal({title:'Удалить работу?',note:'Рисунок исчезнет из локального альбома. Это действие нельзя отменить.',okText:'Удалить',danger:true,onOk:async()=>{const id=state.doc.id;await removeWork(id);state.doc=null;closeSheet();await showHome();folioCloud?.schedule();notify('Работа удалена');}});};
  }
}
function renderLayerSheet(body){
  const doc=state.doc;
  body.innerHTML='<div class="layer-list">'+[...doc.layers].reverse().map((l,reverseIndex)=>{
    const index=doc.layers.length-1-reverseIndex;
    return '<div class="layer-row '+(l.id===doc.activeLayer?'active':'')+'"><button data-toggle-layer="'+l.id+'" title="'+(l.visible?'Скрыть':'Показать')+'"><svg><use href="#i-'+(l.visible?'eye':'hide')+'"/></svg></button><button class="layer-name" data-select-layer="'+l.id+'"><strong>'+escapeHTML(l.name)+'</strong><small>'+l.strokes.length+' штрихов</small></button><button data-shift-layer="'+index+':1" '+(index===doc.layers.length-1?'disabled':'')+' title="Поднять слой">↑</button><button data-shift-layer="'+index+':-1" '+(index===0?'disabled':'')+' title="Опустить слой">↓</button></div>';
  }).join('')+'</div><div class="layer-actions"><button class="main-action" id="add-layer"><svg><use href="#i-plus"/></svg> Новый слой</button><button id="rename-layer">Имя</button><button id="duplicate-layer"><svg><use href="#i-duplicate"/></svg> Дубль</button><button id="delete-layer"><svg><use href="#i-trash"/></svg></button></div><label class="layer-opacity">Непрозрачность <input id="layer-alpha" type="range" min="0" max="100" value="'+Math.round(currentLayer().opacity*100)+'"><output id="layer-alpha-value">'+Math.round(currentLayer().opacity*100)+'%</output></label>';
  $('add-layer').onclick=()=>{
    if(doc.layers.length>=12){notify('Максимум 12 слоёв');return;}
    const l=newLayer('Слой '+(doc.layers.length+1));doc.layers.push(l);doc.activeLayer=l.id;renderSheet();scheduleDraw();queueSave();
  };
  $('rename-layer').onclick=()=>showModal({title:'Название слоя',input:currentLayer().name,okText:'Сохранить',onOk:name=>{currentLayer().name=name||currentLayer().name;renderSheet();queueSave();}});
  $('duplicate-layer').onclick=()=>{
    if(doc.layers.length>=12){notify('Максимум 12 слоёв');return;}
    const l=currentLayer(),i=doc.layers.indexOf(l),copy=cloneData(l);
    copy.id=uid();copy.name+=' — копия';copy.strokes=copy.strokes.map(s=>({...s,id:uid(),layer:copy.id}));
    doc.layers.splice(i+1,0,copy);doc.activeLayer=copy.id;renderSheet();scheduleDraw();queueSave();
  };
  $('delete-layer').onclick=()=>{
    if(doc.layers.length===1){notify('Нужен хотя бы один слой');return;}
    showModal({title:'Удалить слой?',note:'Все штрихи на этом слое будут удалены.',okText:'Удалить',danger:true,onOk:()=>{
      const i=doc.layers.findIndex(l=>l.id===doc.activeLayer);const id=doc.activeLayer;
      doc.layers.splice(i,1);doc.activeLayer=doc.layers[Math.max(0,i-1)].id;state.cache.delete(id);
      state.undo=state.undo.filter(x=>x.layer!==id);state.redo=state.redo.filter(x=>x.layer!==id);
      updateUndoRedo();renderSheet();scheduleDraw();queueSave();
    }});
  };
  $('layer-alpha').addEventListener('input',e=>{currentLayer().opacity=Number(e.target.value)/100;$('layer-alpha-value').textContent=e.target.value+'%';scheduleDraw();queueSave();});
}
$('sheet-body').addEventListener('click',e=>{
  const target=e.target.closest('button');if(!target)return;
  if(target.dataset.hand){state.hand=target.dataset.hand;try{localStorage.setItem('pocket-works:folio:hand',state.hand);}catch{}renderSheet();notify(state.hand==='left'?'Острие для левой руки':'Острие для правой руки');}
  if(target.dataset.brush){state.brush=target.dataset.brush;selectTool('brush');closeSheet();notify(brushes.find(b=>b.id===state.brush).name);}
  if(target.dataset.color){state.color=target.dataset.color;selectTool(state.tool==='fill'?'fill':'brush');closeSheet();}
  if(target.dataset.toggleLayer&&folioCollab?.active())return;
  if(target.dataset.shiftLayer&&folioCollab?.active())return;
  if(target.dataset.toggleLayer){const l=state.doc.layers.find(x=>x.id===target.dataset.toggleLayer);l.visible=!l.visible;renderSheet();scheduleDraw();queueSave();}
  if(target.dataset.selectLayer){state.doc.activeLayer=target.dataset.selectLayer;renderSheet();scheduleDraw();}
  if(target.dataset.shiftLayer){
    const [index,shift]=target.dataset.shiftLayer.split(':').map(Number),arr=state.doc.layers;
    const [l]=arr.splice(index,1);arr.splice(index+shift,0,l);renderSheet();scheduleDraw();queueSave();
  }
});
function showModal({title,note='',input=null,okText='Продолжить',danger=false,onOk}){
  const backdrop=$('modal-backdrop');backdrop.hidden=false;
  $('modal-title').textContent=title;$('modal-note').textContent=note;
  $('modal-fields').innerHTML=input!==null?'<label>НАЗВАНИЕ<input id="modal-input" type="text" autocomplete="off" maxlength="70"></label>':'';
  if(input!==null)$('modal-input').value=input;
  $('modal-ok').textContent=okText;
  $('modal-ok').classList.toggle('danger-confirm',danger);
  $('modal-ok').style.background=danger?'#ac352a':'#285b65';
  const cancel=()=>{backdrop.hidden=true;};
  $('modal-cancel').onclick=cancel;
  $('modal-ok').onclick=async()=>{
    const text=input!==null?$('modal-input').value.trim():undefined;
    if(input!==null&&!text){notify('Введите название');return;}
    backdrop.hidden=true;
    try{await onOk?.(text);}catch(e){notify('Действие не выполнено');console.error(e);}
  };
  backdrop.onclick=e=>{if(e.target===backdrop)cancel();};
}
function newCanvasDialog(idea=null){
  closeSheet();
  const b=$('modal-backdrop');b.hidden=false;
  $('modal-title').textContent=idea?'Начни с идеи':'Новый холст';
  $('modal-note').textContent=idea?idea.prompt:'Выбери форму бумаги. Размер можно менять масштабом при работе.';
  let form='portrait';
  $('modal-fields').innerHTML='<label>НАЗВАНИЕ<input id="modal-input" type="text" autocomplete="off" maxlength="70"></label><div class="format-picker">'+[
    ['portrait','Вертикальный','960 × 1280'],['square','Квадрат','1024 × 1024'],['landscape','Горизонтальный','1280 × 960']
  ].map(([key,label,meta])=>'<button type="button" data-format="'+key+'" class="'+(key===form?'active':'')+'"><i class="format-icon '+(key==='portrait'?'':key)+'"></i><small>'+label+'</small><small>'+meta+'</small></button>').join('')+'</div>';
  $('modal-input').value=idea?idea.title:'Без названия';
  $('modal-fields').querySelectorAll('[data-format]').forEach(button=>button.onclick=()=>{
    form=button.dataset.format;
    $('modal-fields').querySelectorAll('[data-format]').forEach(b=>b.classList.toggle('active',b.dataset.format===form));
  });
  $('modal-ok').textContent='Создать холст';$('modal-ok').classList.remove('danger-confirm');$('modal-ok').style.background='#285b65';
  $('modal-cancel').onclick=()=>{b.hidden=true;};
  $('modal-ok').onclick=()=>{
    const name=$('modal-input').value.trim()||'Без названия';
    const dims={portrait:[960,1280],square:[1024,1024],landscape:[1280,960]}[form];
    b.hidden=true;
    openWork(makeDoc(name,...dims,idea?.palette||palettes.atelier),true);
  };
  b.onclick=e=>{if(e.target===b)b.hidden=true;};
}
function drawThumbnail(){
  const c=createCanvas(208,260),cctx=c.getContext('2d');
  const doc=state.doc,scale=Math.min(208/doc.width,260/doc.height);
  const w=doc.width*scale,h=doc.height*scale;
  cctx.fillStyle='#d2c4a9';cctx.fillRect(0,0,208,260);
  cctx.translate((208-w)/2,(260-h)/2);cctx.scale(scale,scale);
  drawContents(cctx,true);
  return c.toDataURL('image/jpeg',.78);
}
function queueSave(){
  if(!state.doc)return;
  syncDesktop();
  state.doc.updatedAt=Date.now();
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(()=>{void persist();},700);
}
function legacyCompatibleDoc(doc){
  // The PocketNet protocol compresses horizontal spans into vertical bands.
  // Expand only when persisting so FOLIO 1.5 and other legacy viewers can read
  // shared pages using the unchanged `runs` document field.
  if(!doc.layers.some(l=>l.strokes.some(stroke=>Array.isArray(stroke.bands))))return doc;
  const saved=cloneData(doc);
  for(const layer of saved.layers)for(const stroke of layer.strokes){
    if(!Array.isArray(stroke.bands))continue;
    stroke.runs=[];
    for(const [first,last,left,right] of stroke.bands){
      for(let y=first;y<=last;y++)stroke.runs.push([y,left,right]);
    }
    delete stroke.bands;
  }
  return saved;
}
async function persist(){
  clearTimeout(state.saveTimer);
  if(!state.doc)return;
  const doc=state.doc;
  try{
    doc.thumb=drawThumbnail();
    await putWork(legacyCompatibleDoc(doc));
    folioCloud?.schedule();
  }catch(error){console.error('FOLIO save',error);notify('Нет места для сохранения рисунка');}
}
async function openWork(doc,isNew=false){
  if(state.doc)await persist();
  resetInput();state.doc=doc;state.undo=[];state.redo=[];resetCache();
  state.color=doc.palette?.[1]||'#a6553e';
  state.tool='brush';state.brush='ink';state.size=9;state.opacity=1;
  $('document-title').textContent=doc.title;
  $('home').hidden=true;$('studio').hidden=false;
  state.focus=false;$('studio').classList.remove('focus');
  closeSheet();setInputMode(preferredMode(),{save:false});updateUndoRedo();
  requestAnimationFrame(()=>fitView());
  if(isNew)queueSave();
}
async function showHome(){
  if(state.doc){finishStroke();await persist();}
  if(folioCollab?.active())folioCollab.leave();
  resetInput();state.doc=null;resetCache();
  $('studio').hidden=true;$('home').hidden=false;closeSheet();
  state.works=(await loadWorks()).sort((a,b)=>b.updatedAt-a.updatedAt);
  renderGallery();
  folioCloud?.schedule();
}
function renderGallery(){
  const gallery=$('gallery');
  $('work-count').textContent=state.works.length;
  if(!state.works.length){
    gallery.innerHTML='<div class="empty-library"><span aria-hidden="true">✳</span><p><strong>Пока что чистый лист.</strong><br>Самое интересное начинается с первого мазка.</p></div>';return;
  }
  gallery.innerHTML=state.works.map(doc=>{
    const date=new Date(doc.updatedAt||Date.now()).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
    return '<div class="work-unit"><button class="work-card" data-open="'+doc.id+'"><div class="work-cover">'+(doc.thumb?'<img alt="" src="'+doc.thumb+'">':'<div class="paper-empty"></div>')+'</div><h3>'+escapeHTML(doc.title)+'</h3><p>'+date+' · '+doc.width+' × '+doc.height+'</p></button><button class="work-delete" data-delete="'+doc.id+'" aria-label="Удалить '+escapeHTML(doc.title)+'"><svg><use href="#i-more"/></svg></button></div>';
  }).join('');
}
$('gallery').addEventListener('click',e=>{
  const open=e.target.closest('[data-open]');
  const del=e.target.closest('[data-delete]');
  if(open){const doc=state.works.find(w=>w.id===open.dataset.open);if(doc)void openWork(doc);}
  if(del){
    const id=del.dataset.delete,doc=state.works.find(w=>w.id===id);
    showModal({title:'Удалить страницу?',note:'«'+doc.title+'» исчезнет из альбома. Это нельзя отменить.',okText:'Удалить',danger:true,onOk:async()=>{await removeWork(id);state.works=state.works.filter(x=>x.id!==id);renderGallery();folioCloud?.schedule();notify('Страница удалена');}});
  }
});
function exportPNG(){
  if(!state.doc)return;
  const doc=state.doc,exportCanvas=createCanvas(doc.width,doc.height),ctx=exportCanvas.getContext('2d');
  drawContents(ctx,true);
  exportCanvas.toBlob(blob=>{
    if(!blob){notify('Экспорт не удался');return;}
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=(doc.title.replace(/[^\wа-яёіїєґ -]/gi,'').trim()||'folio')+'.png';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    closeSheet();notify('PNG подготовлен для сохранения');
  },'image/png');
}
$('new-work').onclick=()=>newCanvasDialog();
$('spark-action').onclick=()=>openSheet('spark');
$('back-home').onclick=()=>void showHome();
$('edit-title').onclick=()=>{if(folioCollab?.active()){notify('Название общего листа фиксируется при создании');return;}showModal({title:'Название рисунка',input:state.doc.title,okText:'Переименовать',onOk:value=>{state.doc.title=value;$('document-title').textContent=value;queueSave();}});};
$('undo').onclick=undo;$('redo').onclick=redo;
$('export').onclick=()=>openSheet('export');
$('brush-tool').onclick=()=>openSheet('brush');
$('eraser-tool').onclick=()=>selectTool('eraser');
$('fill-tool').onclick=()=>selectTool('fill');
$('pipette-tool').onclick=()=>selectTool('pipette');
$('color-tool').onclick=()=>openSheet('color');
$('layers-tool').onclick=()=>openSheet('layers');
$('sheet-close').onclick=closeSheet;$('sheet-backdrop').onclick=closeSheet;
$('mode-toggle').onclick=()=>{const modes=['precision','nib','direct'];setInputMode(modes[(modes.indexOf(state.mode)+1)%modes.length]);notify(state.mode==='precision'?'Точное перо: наведи и зажми кнопку':state.mode==='nib'?'Остриё автоматически рисует':'Прямой ввод');};
$('fit').onclick=fitView;
$('brush-size').oninput=e=>{state.size=Number(e.target.value);updateToolUI();};
$('brush-opacity').oninput=e=>{state.opacity=Number(e.target.value)/100;updateToolUI();};
function changeFillTolerance(value){
  state.fillTolerance=clamp(Number(value),0,100);
  try{localStorage.setItem('pocket-works:folio:fillTolerance',String(state.fillTolerance));}catch{}
  updateToolUI();
}
$('fill-tolerance').oninput=e=>changeFillTolerance(e.target.value);
$('desktop-fill-tolerance').oninput=e=>changeFillTolerance(e.target.value);
$('focus-toggle').onclick=()=>{state.focus=true;$('studio').classList.add('focus');fitView();};
$('focus-restore').onclick=()=>{state.focus=false;$('studio').classList.remove('focus');fitView();};

function syncDesktop(){
  if(!state.doc)return;
  const doc=state.doc;
  $('layers-tool').disabled=Boolean(folioCollab?.active());
  $('desktop-layer-options').disabled=Boolean(folioCollab?.active());
  $('desktop-add-layer').disabled=Boolean(folioCollab?.active());
  document.querySelectorAll('.desktop-tool').forEach(el=>{
    const match={
      'desktop-brush-tool':state.tool==='brush',
      'desktop-fill-tool':state.tool==='fill',
      'desktop-eraser-tool':state.tool==='eraser',
      'desktop-pipette-tool':state.tool==='pipette'
    };
    el.classList.toggle('is-active',Boolean(match[el.id]));
  });
  $('desktop-brush-name').textContent=brushes.find(b=>b.id===state.brush)?.name||'Кисть';
  $('desktop-brush-choices').innerHTML=brushes.map(b=>
    '<button type="button" class="'+(state.brush===b.id?'active':'')+'" data-desktop-brush="'+b.id+'" title="'+escapeHTML(b.hint)+'"><i aria-hidden="true" class="paint-preview '+b.id+'"></i><span>'+escapeHTML(b.name)+'</span></button>'
  ).join('');
  $('desktop-swatches').innerHTML=doc.palette.slice(0,16).map(c=>
    '<button type="button" aria-label="Выбрать '+c+'" class="'+(state.color.toLowerCase()===c.toLowerCase()?'active':'')+'" style="--chip:'+c+'" data-desktop-color="'+c+'"></button>'
  ).join('');
  $('desktop-layers').innerHTML=[...doc.layers].reverse().map(l=>
    '<div class="desktop-layer '+(doc.activeLayer===l.id?'active':'')+'">'+
    '<button class="layer-eye" data-desktop-eye="'+l.id+'" aria-label="'+(l.visible?'Скрыть слой':'Показать слой')+'"><svg><use href="#i-'+(l.visible?'eye':'hide')+'"/></svg></button>'+
    '<button class="layer-select" data-desktop-layer="'+l.id+'"><strong>'+escapeHTML(l.name)+'</strong><small>'+l.strokes.length+' штрихов · '+Math.round(l.opacity*100)+'%</small></button></div>'
  ).join('');
  $('desktop-size').value=state.size;$('desktop-size-value').textContent=state.size+' px';
  $('desktop-opacity').value=Math.round(state.opacity*100);
  $('desktop-opacity-value').textContent=Math.round(state.opacity*100)+'%';
  $('desktop-color').value=/^#[0-9a-f]{6}$/i.test(state.color)?state.color:'#a6553e';
  $('desktop-fill-tolerance').value=state.fillTolerance;
  $('desktop-fill-value').textContent=state.fillTolerance;
  document.querySelectorAll('[data-input-mode]').forEach(b=>b.classList.toggle('active',b.dataset.inputMode===state.mode));
  $('desktop-mode-help').textContent=state.mode==='precision'?
    'Наведите курсор. Для нанесения штриха зажмите Shift или кнопку на холсте.':
    state.mode==='nib'?'На сенсорном экране остриё рисует немного выше пальца. Мышь рисует прямо под курсором.':
      'Мышь, перо или касание сразу оставляют линию. Пробел + перетаскивание перемещает холст.';
}
$('desktop-brush-tool').onclick=()=>selectTool('brush');
$('desktop-eraser-tool').onclick=()=>selectTool('eraser');
$('desktop-fill-tool').onclick=()=>selectTool('fill');
$('desktop-pipette-tool').onclick=()=>selectTool('pipette');
$('desktop-color-tool').onclick=()=>openSheet('color');
$('desktop-focus-tool').onclick=()=>{$('focus-toggle').click();};
$('desktop-idea').onclick=()=>openSheet('spark');
$('desktop-layer-options').onclick=()=>openSheet('layers');
$('desktop-add-layer').onclick=()=>{
  if(folioCollab?.active()){notify('Общий слой нельзя изменить до выхода из комнаты');return;}
  if(state.doc.layers.length>=12){notify('Максимум 12 слоёв');return;}
  const l=newLayer('Слой '+(state.doc.layers.length+1));
  state.doc.layers.push(l);state.doc.activeLayer=l.id;syncDesktop();queueSave();scheduleDraw();
};
$('desktop-brush-choices').onclick=e=>{
  const b=e.target.closest('[data-desktop-brush]');if(!b)return;
  state.brush=b.dataset.desktopBrush;selectTool('brush');syncDesktop();
};
$('desktop-swatches').onclick=e=>{
  const b=e.target.closest('[data-desktop-color]');if(!b)return;
  state.color=b.dataset.desktopColor;selectTool(state.tool==='fill'?'fill':'brush');syncDesktop();
};
$('desktop-layers').onclick=e=>{
  if(folioCollab?.active())return;
  const eye=e.target.closest('[data-desktop-eye]');
  if(eye){const l=state.doc.layers.find(l=>l.id===eye.dataset.desktopEye);l.visible=!l.visible;syncDesktop();scheduleDraw();queueSave();return;}
  const layer=e.target.closest('[data-desktop-layer]');
  if(layer){state.doc.activeLayer=layer.dataset.desktopLayer;syncDesktop();queueSave();}
};
$('desktop-color').oninput=e=>{state.color=e.target.value;selectTool(state.tool==='fill'?'fill':'brush');};
$('desktop-size').oninput=e=>{state.size=Number(e.target.value);updateToolUI();};
$('desktop-opacity').oninput=e=>{state.opacity=Number(e.target.value)/100;updateToolUI();};
$('desktop-mode-choices').onclick=e=>{
  const button=e.target.closest('[data-input-mode]');
  if(button)setInputMode(button.dataset.inputMode);
};
function activeEditorKey(e){
  if($('studio').hidden||!$('modal-backdrop').hidden||state.sheet)return false;
  return !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)
    &&!document.activeElement?.isContentEditable;
}
window.addEventListener('keydown',e=>{
  if(!activeEditorKey(e)){
    if(e.key==='Escape'&&state.sheet)closeSheet();
    return;
  }
  if(e.code==='Space'){e.preventDefault();state.spacePan=true;return;}
  if(e.key==='Shift'&&state.mode==='precision'){armDrawing('keyboard',true);return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();if(e.shiftKey)redo();else undo();return;
  }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){
    e.preventDefault();if(e.shiftKey)exportPNG();else{void persist();notify('Сохранено в альбоме');}return;
  }
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key.toLowerCase()==='b')selectTool('brush');
  else if(e.key.toLowerCase()==='e')selectTool('eraser');
  else if(e.key.toLowerCase()==='g')selectTool('fill');
  else if(e.key.toLowerCase()==='i')selectTool('pipette');
  else if(e.key==='['){state.size=clamp(state.size-2,1,72);updateToolUI();}
  else if(e.key===']'){state.size=clamp(state.size+2,1,72);updateToolUI();}
  else if(e.key==='0'){fitView();}
  else if(e.key.toLowerCase()==='f'){$(state.focus?'focus-restore':'focus-toggle').click();}
  else if(e.key==='Escape'){
    if(state.sheet)closeSheet();else if(state.focus)$('focus-restore').click();
  }
});
window.addEventListener('keyup',e=>{
  if(e.code==='Space')state.spacePan=false;
  if(e.key==='Shift'&&state.armKeyboard)armDrawing('keyboard',false);
});
window.addEventListener('blur',()=>{
  state.spacePan=false;state.panPointer=null;state.panStart=null;$('studio').classList.remove('is-panning');
  if(state.armKeyboard)armDrawing('keyboard',false,true);
  if(state.armPointer!==null)armDrawing(state.armPointer,false,true);
  state.armLocked=false;updateArmUI();
  finishStroke(true);hideCursor();
});
window.addEventListener('resize',()=>{
  if(!state.doc)return;
  fitView();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(state.armPointer!==null)armDrawing(state.armPointer,false,true);
    if(state.armKeyboard)armDrawing('keyboard',false,true);
    state.armLocked=false;updateArmUI();
    finishStroke();void persist();
  }
});
window.addEventListener('pagehide',()=>{
  if(state.doc){finishStroke();void persist();}
});

createWorkshopMode({appName:'FOLIO',version:'1.6.0',cachePrefix: 'folio-',storageNamespace: 'pocket-works:folio',onReset:async()=>{
  if(database)await txPromise('readwrite',s=>s.clear());else localStorage.removeItem(DB_NAME+':fallback');
  state.doc=null;await showHome();
}});
async function boot(){
  database=await openDatabase();
  if(!database&&!('localStorage' in window))notify('Локальное хранилище недоступно');
  await showHome();
  folioCloud=createFolioCloudSync({
    loadWorks,putWork,removeWork,notify,getOpenId:()=>state.doc?.id||null,
    async onUpdate(){if(!state.doc){state.works=(await loadWorks()).sort((a,b)=>b.updatedAt-a.updatedAt);renderGallery();}}
  });
  folioCloud.start();
  folioCollab=createFolioCollab({
    notify,
    onStatus({active,ready,status,error,roomId,players}){
      $('folio-collab-studio').hidden=!active;
      $('folio-collab-count').textContent=players.length||1;
      $('folio-collab-studio').classList.toggle('is-offline',!ready);
      $('folio-collab-setup').hidden=active;
      $('folio-collab-live').hidden=!active;
      $('folio-collab-roomcode').textContent=roomId?roomId.slice(0,8).toUpperCase():'';
      $('folio-collab-players').innerHTML=players.map(p=>'<span>'+escapeHTML(p.name)+'</span>').join('');
      $('folio-collab-status').textContent=error|| (ready?'Холст общий · '+players.length+' участников · автоматическое сохранение':
        status==='connecting'||status==='joining'?'Подключаем мастерскую…':
        status==='reconnecting'?'Нет связи · пытаемся восстановить комнату':
        'Можно рисовать одновременно с друзьями на одном листе.');
      $('folio-collab-create').disabled=status==='connecting'||status==='joining';
      $('folio-collab-join').disabled=status==='connecting'||status==='joining';
      if(state.doc){updateUndoRedo();syncDesktop();}
    },
    onSnapshot(work,pending){
      collaborationJobs=collaborationJobs.then(async()=>{
        const doc=cloneData(work),layer=doc.layers[0];
        for(const stroke of pending)if(!layer.strokes.some(s=>s.id===stroke.id))layer.strokes.push(stroke);
        if(state.doc?.id===doc.id){state.doc=doc;resetCache();$('document-title').textContent=doc.title;syncDesktop();scheduleDraw();queueSave();}
        else await openWork(doc,true);
        $('folio-collab-dialog').hidden=true;
        updateUndoRedo();
      }).catch(e=>{console.error('FOLIO shared snapshot',e);notify('Не удалось открыть общий рисунок');});
    },
    onOperation(stroke){
      collaborationJobs=collaborationJobs.then(()=>{
        const layer=state.doc?.layers?.find(l=>l.id===stroke.layer);if(!layer)return;
        const index=layer.strokes.findIndex(s=>s.id===stroke.id);
        if(index>=0)layer.strokes[index]=stroke;
        else if(stroke.tool==='fill'){
          const firstInk=layer.strokes.findIndex(s=>s.tool!=='fill');
          layer.strokes.splice(firstInk<0?layer.strokes.length:firstInk,0,stroke);
        }else layer.strokes.push(stroke);
        state.undo=[];state.redo=[];
        markDirty(layer.id);queueSave();updateUndoRedo();
      }).catch(e=>{console.error(e);notify('Ошибка обновления общего холста');});
    },
    onRemove(id){
      collaborationJobs=collaborationJobs.then(()=>{
        const layer=state.doc?.layers?.[0];if(!layer)return;
        const i=layer.strokes.findIndex(s=>s.id===id);
        if(i>=0)layer.strokes.splice(i,1);
        markDirty(layer.id);queueSave();updateUndoRedo();
      });
    },
    onPreview(strokes){remotePreviews=strokes;scheduleDraw();},
    onExit(){remotePreviews=[];scheduleDraw();queueSave();}
  });
}
boot().catch(error=>{console.error(error);notify('Не удалось открыть мастерскую');});
