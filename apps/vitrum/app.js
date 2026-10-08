import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { GLASS,drawAtelier,paneBox,sheetBox,piecePolygon,polySamples,cutPolygon,centroid,solderPositions } from './render.js';

installMobileRuntime();
const KEY='pocket-works:vitrum:freeform:v3';
const MAX_PIECES=70, CHIP_TOTAL=4;
const $=id=>document.getElementById(id);
const canvas=$('art'),ctx=canvas.getContext('2d',{alpha:false});
const scene=$('scene');
const modes=['compose','cut','lead','solder','reveal'];
const tools={compose:$('composeTools'),cut:$('cutTools'),lead:$('leadTools'),solder:$('solderTools'),reveal:$('revealTools')};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const float=(v,def=0)=>Number.isFinite(+v)?+v:def;
const initial=()=>({version:3,mode:'compose',pigment:0,pieces:[],selected:null,draft:null,chips:0,sun:20,sound:true,nextId:1});
function sanitize(raw){
 const s=initial();
 if(!raw||raw.version!==3)return s;
 s.pigment=clamp(Math.trunc(float(raw.pigment,0)),0,GLASS.length-1);
 s.sun=clamp(float(raw.sun,20),-70,70);
 s.sound=raw.sound!==false;
 s.nextId=clamp(Math.trunc(float(raw.nextId,1)),1,10000000);
 if(Array.isArray(raw.pieces)){
  const seen=new Set();
  for(const p of raw.pieces.slice(0,MAX_PIECES)){
   if(!p||!Array.isArray(p.points)||p.points.length<3||p.points.length>160)continue;
   const points=p.points.map(v=>Array.isArray(v)&&v.length===2?[clamp(float(v[0]),-2,2),clamp(float(v[1]),-2,2)]:null);
   if(points.some(v=>!v))continue;
   const id=Math.trunc(float(p.id));
   if(!id||seen.has(id))continue;
   seen.add(id);
   const solder=Array.from({length:3},(_,i)=>clamp(float(p.solder?.[i]),0,1));
   s.pieces.push({id,points,color:clamp(Math.trunc(float(p.color)),0,GLASS.length-1),x:clamp(float(p.x,.5),-.35,1.35),y:clamp(float(p.y,.5),-.35,1.35),
    angle:clamp(float(p.angle),-10000,10000),scale:clamp(float(p.scale,.72),.25,2.2),
    lead:clamp(float(p.lead),0,1),solder,seed:Math.trunc(float(p.seed,id*239))});
  }
 }
 const selected=Number(raw.selected);
 s.selected=s.pieces.some(p=>p.id===selected)?selected:null;
 if(raw.draft&&Array.isArray(raw.draft.points)&&raw.draft.points.length>=3&&raw.draft.points.length<=160){
  const points=raw.draft.points.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)).map(([x,y])=>[clamp(x,-1,2),clamp(y,-1,2)]);
  if(points.length>=3)s.draft={points};
 }
 s.chips=clamp(Math.trunc(float(raw.chips,0)),0,CHIP_TOTAL-1);
 s.mode=modes.includes(raw.mode)?raw.mode:'compose';
 if(s.mode==='cut'&&!s.draft)s.chips=0;
 if((s.mode==='lead'||s.mode==='solder')&&s.selected===null)s.mode='compose';
 if(s.mode==='reveal'&&!s.pieces.length)s.mode='compose';
 s.nextId=Math.max(s.nextId,1,...s.pieces.map(p=>p.id+1));
 return s;
}
function load(){try{return sanitize(JSON.parse(localStorage.getItem(KEY)))}catch{return initial()}}
let s=load();
let vw=1,vh=1,dpr=1,dirty=true,toastTimeout=0,last=0,saveTick=0;
let trace=null,chipDrag=null,pieceDrag=null,leadDrag=null,ironHold=null,pointer=null;
let particles=[],soundCtx=null,confirmation=null;
const selected=()=>s.pieces.find(p=>p.id===s.selected)||null;
function persist(){
 try{localStorage.setItem(KEY,JSON.stringify(s))}catch{}
 window.__AI_TEST_STATE__={
  app:'vitrum',version:'3.0.0',mode:s.mode,selected:s.selected,
  pieces:s.pieces.length,customContours:s.pieces.every(p=>p.points.length>=3),
  leaded:s.pieces.filter(p=>p.lead>=.99).length,
  soldered:s.pieces.filter(p=>p.solder.every(x=>x>=1)).length,
  chips:s.chips,draftPoints:s.draft?.points.length||0
 };
}
function vibrate(type='tick'){try{navigator.vibrate?.(type==='snap'?[9,23,14]:type==='fail'?[6,30,6]:6)}catch{}}
function sound(kind){
 if(!s.sound)return;
 const Ctx=window.AudioContext||window.webkitAudioContext;
 if(!Ctx)return;
 try{
  if(!soundCtx)soundCtx=new Ctx();
  if(soundCtx.state==='suspended')soundCtx.resume().catch(()=>{});
  const now=soundCtx.currentTime,osc=soundCtx.createOscillator(),g=soundCtx.createGain(),f=soundCtx.createBiquadFilter();
  f.type=kind==='score'||kind==='tin'?'highpass':'lowpass';
  f.frequency.value=kind==='score'?1050:kind==='tin'?800:1600;
  const pitch={tap:360,score:670,chip:920,glass:750,lead:190,tin:310,success:560,error:120}[kind]||360;
  const dur=kind==='tin'?.13:kind==='success'?.21:.085;
  osc.type=kind==='tin'||kind==='lead'?'triangle':'sine';osc.frequency.setValueAtTime(pitch*(.94+Math.random()*.1),now);osc.frequency.exponentialRampToValueAtTime(Math.max(50,pitch*.66),now+dur);
  g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(kind==='score'?.018:.036,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+dur);
  osc.connect(f).connect(g).connect(soundCtx.destination);osc.start(now);osc.stop(now+dur+.02);
 }catch{}
}
function toast(t){
 const box=$('message');box.textContent=t;box.classList.add('shown');
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>box.classList.remove('shown'),2100);
}
function mark(){dirty=true}
function changeMode(mode){
 if(!modes.includes(mode))return;
 s.mode=mode;trace=null;chipDrag=null;pieceDrag=null;leadDrag=null;ironHold=null;pointer=null;
 update();persist();mark();
}
function update(){
 const mode=s.mode,p=selected();
 for(const [key,node] of Object.entries(tools))node.hidden=key!==mode;
 $('colorBand').hidden=!['compose','cut'].includes(mode);
 $('colorName').textContent=GLASS[s.pigment].name;
 document.querySelectorAll('.swatch').forEach((el,i)=>el.classList.toggle('chosen',i===s.pigment));
 $('soundBtn').textContent=s.sound?'Звук: вкл':'Звук: выкл';
 $('soundBtn').setAttribute('aria-pressed',String(s.sound));
 $('pieceCount').textContent=`${s.pieces.length} ${s.pieces.length===1?'ФРАГМЕНТ':'ФРАГМЕНТОВ'}`;
 $('editTools').hidden=!p;
 $('pieceLabel').textContent=p?`СТЕКЛО ${s.pieces.indexOf(p)+1}`:'ФРАГМЕНТ';
 $('workLead').disabled=!p||p.solder.every(v=>v>=1);
 $('goReveal').disabled=s.pieces.length===0;
 $('newGlass').disabled=s.pieces.length>=MAX_PIECES;
 $('sceneNote').hidden=false;
 const guide={
  compose:s.pieces.length?'Зажми стекло и передвинь. Нажми на фрагмент, чтобы повернуть.':'Создай первую форму сам — без трафаретов',
  cut:s.draft?`Клещами: захвати точку и потяни наружу · ${s.chips}/4`:'Веди пальцем по стеклу: контур замкнётся при отпускании',
  lead:'Веди палец по светлому контуру от круглой метки',
  solder:'Прижми железо к каждому светлому узлу',
  reveal:'Меняй угол солнца — свет пройдёт сквозь твой витраж'
 };
 $('sceneNote').textContent=guide[mode];
 const copy={
  compose:['СВОБОДНАЯ МАСТЕРСКАЯ','Рисуй светом','Здесь нет готовых фигур. Каждая форма — твоя.'],
  cut:['СКЛЯННЫЙ ЛИСТ · РЕЗЕЦ','Придумай форму',s.draft?'Отколи четыре края, вытягивая клещи наружу.':'Нарисуй пальцем любую замкнутую фигуру на стекле.'],
  lead:['СВИНЦОВАЯ ОПРАВА','Обведи свинцом','Протяни свинцовую ленту вдоль своей собственной кромки.'],
  solder:['ГОРЯЧЕЕ ЖЕЛЕЗО','Закрепи швы','Удерживай железо на узлах, пока олово не растечётся.'],
  reveal:['ОКНО · СВЕТ','Твоя работа','Цвет, толщина и свет становятся видны вместе.']
 }[mode];
 $('chapter').textContent=copy[0];$('headline').textContent=copy[1];$('instructions').textContent=copy[2];
 if(mode==='cut'){$('cutLabel').textContent=s.draft?`02 / КРОМКА · ${s.chips}/4`:'01 / СВОБОДНЫЙ НАДРЕЗ';$('cutMeter').style.width=`${s.draft?25+s.chips*18.75:0}%`;$('redoCut').textContent=s.draft?'Перерисовать':'Очистить линию'}
 if(mode==='lead'&&p){$('leadLabel').textContent='СВИНЕЦ · '+Math.round(p.lead*100)+'%';$('leadMeter').style.width=`${p.lead*100}%`;}
 if(mode==='solder'&&p){$('solderLabel').textContent=`ПАЙКА · ${p.solder.filter(x=>x>=1).length}/3`;$('solderMeter').style.width=`${Math.round(p.solder.reduce((a,b)=>a+b,0)/3*100)}%`;}
 $('sunRange').value=String(s.sun);
}
function resize(){
 const r=scene.getBoundingClientRect();
 const w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));
 const ratio=Math.min(window.devicePixelRatio||1,2.5);
 if(w!==vw||h!==vh||ratio!==dpr){
  vw=w;vh=h;dpr=ratio;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);mark();
 }
}
function paint(t=performance.now()){
 resize();
 ctx.setTransform(dpr,0,0,dpr,0,0);
 drawAtelier(ctx,vw,vh,s,{trace:trace?.points||[],drag:pieceDrag,hold:ironHold,pointer,tool:s.mode==='cut'?(s.draft?'chip':'score'):'',particles},t);
 dirty=false;
}
function loop(t){
 if(document.visibilityState!=='hidden'){
  resize();
  if(ironHold)stepIron(Math.min(70,t-last||16),t);
  if(particles.length){particles=particles.filter(a=>t-a.born<a.ttl);mark()}
  if(dirty||(s.mode==='reveal'&&t-last>90))paint(t);
 }
 last=t;
 requestAnimationFrame(loop);
}
function at(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function inside(p,b){return p.x>=b.x&&p.y>=b.y&&p.x<=b.x+b.w&&p.y<=b.y+b.h}
function pointInPoly(q,poly){
 let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
 }return yes;
}
function area(poly){let a=0;for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;a+=poly[i][0]*poly[j][1]-poly[j][0]*poly[i][1]}return Math.abs(a*.5)}
function pathLength(points){let len=0;for(let i=1;i<points.length;i++)len+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return len}
function simplify(points,epsilon=2.5){
 if(points.length<=3)return [...points];
 const sq=epsilon*epsilon;
 const dist=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,t=dx*dx+dy*dy?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy),0,1):0;
  return (p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;
 };
 const recurse=(a,b,out)=>{
  let best=-1,value=sq;
  for(let i=a+1;i<b;i++){const d=dist(points[i],points[a],points[b]);if(d>value){value=d;best=i}}
  if(best>=0){recurse(a,best,out);out.push(points[best]);recurse(best,b,out)}
 };
 const out=[points[0]];recurse(0,points.length-1,out);out.push(points[points.length-1]);return out;
}
function selfIntersect(raw){
 const ccw=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const overlap=(a,b,c,d)=>ccw(a,b,c)*ccw(a,b,d)<-1e-5&&ccw(c,d,a)*ccw(c,d,b)<-1e-5;
 for(let i=0;i<raw.length;i++)for(let j=i+2;j<raw.length;j++){
  if(i===0&&j===raw.length-1)continue;
  if(overlap(raw[i],raw[(i+1)%raw.length],raw[j],raw[(j+1)%raw.length]))return true;
 }
 return false;
}
function commitContour(points){
 if(points.length<8||pathLength(points)<80){toast('Слишком короткий надрез. Нарисуй фигуру покрупнее.');sound('error');return;}
 const raw=simplify(points,3);
 // Resample large splines so the outline is stable on every phone.
 const dec=raw.length>125?raw.filter((_,i)=>i%Math.ceil(raw.length/120)===0):raw;
 if(dec.length<3){toast('Контур не замкнулся — попробуй ещё раз.');return}
 if(selfIntersect(dec)){toast('Линия пересекает саму себя. Нарисуй простой замкнутый контур.');sound('error');return}
 const sh=sheetBox(vw,vh);
 const norm=dec.map(p=>[(p.x-sh.x)/sh.w,(p.y-sh.y)/sh.w]);
 if(area(norm)<.012){toast('Нужна чуть более крупная площадь стекла.');sound('error');return}
 s.draft={points:norm};s.chips=0;
 trace=null;update();persist();mark();sound('score');vibrate();
}
function chipTargets(){
 const sh=sheetBox(vw,vh),points=cutPolygon(s.draft,sh),indices=[.14,.38,.61,.84];
 return indices.map(t=>points[Math.min(points.length-1,Math.floor((points.length-1)*t))]);
}
function emitShards(p,color,count=13){
 const r=()=>Math.random();
 for(let i=0;i<count;i++){const a=r()*Math.PI*2,dist=20+r()*90;
  particles.push({x:p.x,y:p.y,dx:Math.cos(a)*dist,dy:Math.sin(a)*dist-30,ttl:480+r()*250,born:performance.now(),angle:a,size:1.5+r()*4,color:i%3?GLASS[color].rim:'#f9efdc'});
 }if(particles.length>90)particles.splice(0,particles.length-90);
}
function finishPiece(){
 if(!s.draft||s.chips!==CHIP_TOTAL)return;
 const arr=s.draft.points;
 const minX=Math.min(...arr.map(p=>p[0])),maxX=Math.max(...arr.map(p=>p[0]));
 const minY=Math.min(...arr.map(p=>p[1])),maxY=Math.max(...arr.map(p=>p[1]));
 const mx=(minX+maxX)/2,my=(minY+maxY)/2;
 const index=s.pieces.length,spots=[[.5,.49],[.31,.3],[.69,.7],[.7,.27],[.31,.73],[.52,.48],[.64,.54],[.39,.43]];
 const pos=spots[index%spots.length];
 const id=s.nextId++;
 s.pieces.push({id,color:s.pigment,points:arr.map(([x,y])=>[x-mx,y-my]),x:pos[0],y:pos[1],scale:.78,angle:0,lead:0,solder:[0,0,0],seed:Math.floor(Math.random()*10000000)});
 s.selected=id;s.draft=null;s.chips=0;
 changeMode('compose');toast('Стекло готово. Перемещай и поворачивай его как хочешь.');sound('success');vibrate('snap');
}
function beginCut(e,p){
 if(!s.draft){
  if(!inside(p,sheetBox(vw,vh))){toast('Начни линию прямо на листе стекла.');return}
  trace={pointerId:e.pointerId,points:[p]};canvas.setPointerCapture?.(e.pointerId);pointer=p;mark();sound('score');return;
 }
 const targets=chipTargets(),i=s.chips,q=targets[i];
 if(Math.hypot(p.x-q.x,p.y-q.y)>32){toast('Захвати светлую засечку клещами.');sound('error');return}
 chipDrag={pointerId:e.pointerId,target:q,center:centroid(cutPolygon(s.draft,sheetBox(vw,vh)))};
 canvas.setPointerCapture?.(e.pointerId);pointer=p;mark();vibrate();
}
function moveCut(e,p){
 if(trace?.pointerId===e.pointerId){
  const sh=sheetBox(vw,vh);
  const cp={x:clamp(p.x,sh.x,sh.x+sh.w),y:clamp(p.y,sh.y,sh.y+sh.h)};
  const prev=trace.points[trace.points.length-1];
  if(Math.hypot(cp.x-prev.x,cp.y-prev.y)>3&&trace.points.length<500){trace.points.push(cp);mark()}
 }else if(chipDrag?.pointerId===e.pointerId){
  const c=chipDrag.center,q=chipDrag.target,dx=p.x-q.x,dy=p.y-q.y;
  const l=Math.max(1,Math.hypot(q.x-c.x,q.y-c.y));
  const outward=(dx*(q.x-c.x)+dy*(q.y-c.y))/l;
  if(outward>16&&Math.hypot(dx,dy)>18){
   emitShards(q,s.pigment);s.chips++;chipDrag=null;pointer=null;
   sound('chip');vibrate('snap');update();persist();mark();
   if(s.chips===CHIP_TOTAL)finishPiece();
  }else{pointer=p;mark()}
 }
}
function endCut(e){
 if(trace?.pointerId===e.pointerId){
  const points=trace.points;trace=null;pointer=null;commitContour(points);
 }else if(chipDrag?.pointerId===e.pointerId){chipDrag=null;pointer=null;toast('Потяни от линии наружу, чтобы отколоть край.');mark();}
}
function beginCompose(e,p){
 const frame=paneBox(vw,vh);
 let hit=null;
 for(let i=s.pieces.length-1;i>=0;i--){const part=s.pieces[i],poly=piecePolygon(part,frame);if(pointInPoly(p,poly)){hit=part;break}}
 s.selected=hit?.id??null;
 if(hit){
  pieceDrag={pointerId:e.pointerId,id:hit.id,offsetX:p.x-(frame.x+hit.x*frame.w),offsetY:p.y-(frame.y+hit.y*frame.h)};
  canvas.setPointerCapture?.(e.pointerId);sound('glass');vibrate();
 }
 update();persist();mark();
}
function moveCompose(e,p){
 if(!pieceDrag||pieceDrag.pointerId!==e.pointerId)return;
 const part=s.pieces.find(q=>q.id===pieceDrag.id);if(!part)return;
 const f=paneBox(vw,vh);
 part.x=clamp((p.x-pieceDrag.offsetX-f.x)/f.w,-.22,1.22);
 part.y=clamp((p.y-pieceDrag.offsetY-f.y)/f.h,-.22,1.22);
 mark();
}
function endCompose(e){
 if(pieceDrag?.pointerId!==e.pointerId)return;
 pieceDrag=null;persist();mark();
}
function currentLeadSamples(){
 const part=selected();
 return part?polySamples(piecePolygon(part,paneBox(vw,vh)),4):[];
}
function nearest(point,points){
 let best={index:0,distance:Infinity};for(let i=0;i<points.length;i++){const q=points[i],d=Math.hypot(point.x-q.x,point.y-q.y);if(d<best.distance)best={index:i,distance:d}}return best;
}
function beginLead(e,p){
 const piece=selected();if(!piece)return;
 const samples=currentLeadSamples(),n=samples.length-1,index=Math.floor(piece.lead*n);
 if(Math.hypot(p.x-samples[index].x,p.y-samples[index].y)>38){toast('Начни со светлой метки на краю детали.');sound('error');return;}
 leadDrag={pointerId:e.pointerId};canvas.setPointerCapture?.(e.pointerId);sound('lead');vibrate();pointer=p;mark();
}
function moveLead(e,p){
 if(leadDrag?.pointerId!==e.pointerId)return;
 const piece=selected();if(!piece)return;
 const samples=currentLeadSamples(),index=Math.floor(piece.lead*(samples.length-1));
 // Search the forward arc only: the final point coincides with the start.
 // Global nearest-point search would snap to index 0 and stall at 92–99%.
 let near={index,distance:Infinity};
 for(let k=Math.max(0,index-2);k<=Math.min(samples.length-1,index+26);k++){
  const q=samples[k],distance=Math.hypot(p.x-q.x,p.y-q.y);
  if(distance<near.distance)near={index:k,distance};
 }
 if(near.distance>Math.max(25,Math.min(vw*.085,35)))return;
 const next=Math.max(index,near.index);
 if(next===index)return;
 piece.lead=clamp(next/(samples.length-1),0,1);
 pointer=p;mark();update();
 if(next>=samples.length-3){
  piece.lead=1;leadDrag=null;pointer=null;persist();sound('success');vibrate('snap');changeMode('solder');toast('Профиль замкнут. Припаяй три соединения.');
 }else if(next%8===0){sound('lead');persist()}
}
function endLead(e){if(leadDrag?.pointerId===e.pointerId){leadDrag=null;pointer=null;persist();mark()}}
function beginSolder(e,p){
 const part=selected();if(!part)return;
 const nodes=solderPositions(piecePolygon(part,paneBox(vw,vh)));
 const candidates=nodes.map((n,i)=>({i,d:Math.hypot(p.x-n.x,p.y-n.y)})).filter(n=>part.solder[n.i]<1).sort((a,b)=>a.d-b.d);
 if(!candidates.length||candidates[0].d>36){toast('Поставь горячее железо на медную точку.');sound('error');return}
 ironHold={pointerId:e.pointerId,index:candidates[0].i,point:p};
 canvas.setPointerCapture?.(e.pointerId);pointer=p;mark();sound('tin');vibrate();
}
function stepIron(dt,t){
 if(!ironHold)return;
 const part=selected();if(!part){ironHold=null;return}
 const node=solderPositions(piecePolygon(part,paneBox(vw,vh)))[ironHold.index];
 if(Math.hypot(ironHold.point.x-node.x,ironHold.point.y-node.y)>41)return;
 part.solder[ironHold.index]=clamp(part.solder[ironHold.index]+dt/690,0,1);mark();
 if(t-saveTick>130){persist();saveTick=t}
 if(part.solder[ironHold.index]>=1){
  ironHold=null;pointer=null;emitShards(node,part.color,5);sound('success');vibrate('snap');
  if(part.solder.every(n=>n>=1)){changeMode('compose');toast('Соединения спаяны. Можно продолжить рисунок.');}
  else{update();persist();mark();toast('Олово застыло. Следующий узел.');}
 }
}
function endSolder(e){if(ironHold?.pointerId===e.pointerId){ironHold=null;pointer=null;persist();mark()}}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.pointerType==='mouse')return;
 if(s.mode==='reveal')return;
 e.preventDefault();resize();
 const p=at(e);
 if(s.mode==='cut')beginCut(e,p);
 else if(s.mode==='compose')beginCompose(e,p);
 else if(s.mode==='lead')beginLead(e,p);
 else if(s.mode==='solder')beginSolder(e,p);
});
canvas.addEventListener('pointermove',e=>{
 const p=at(e);
 if(s.mode==='cut'&&(trace||chipDrag))moveCut(e,p);
 else if(s.mode==='compose'&&pieceDrag)moveCompose(e,p);
 else if(s.mode==='lead'&&leadDrag)moveLead(e,p);
 else if(s.mode==='solder'&&ironHold)ironHold.point=p;
 if(trace||chipDrag||leadDrag||ironHold){pointer=p;mark()}
});
function release(e){endCut(e);endCompose(e);endLead(e);endSolder(e);pointer=null;mark();try{canvas.releasePointerCapture?.(e.pointerId)}catch{}}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
document.querySelectorAll('.swatch').forEach((el,i)=>el.addEventListener('click',()=>{
 s.pigment=i;
 const part=selected();
 if(s.mode==='compose'&&part){part.color=i;toast('Цвет выбранного фрагмента изменён.');mark()}
 update();persist();sound('glass');vibrate();
}));
$('newGlass').addEventListener('click',()=>{if(s.pieces.length>=MAX_PIECES)return; s.draft=null;s.chips=0;changeMode('cut');sound('tap')});
$('redoCut').addEventListener('click',()=>{s.draft=null;s.chips=0;trace=null;chipDrag=null;pointer=null;update();persist();mark();sound('tap')});
$('discardCut').addEventListener('click',()=>changeMode('compose'));
$('workLead').addEventListener('click',()=>{
 const p=selected();if(!p)return;
 changeMode(p.lead>=.995?'solder':'lead');
 sound('tap');
});
$('leaveLead').addEventListener('click',()=>changeMode('compose'));
$('leaveSolder').addEventListener('click',()=>changeMode('compose'));
$('goReveal').addEventListener('click',()=>{if(!s.pieces.length)return;changeMode('reveal');sound('success')});
$('backToWork').addEventListener('click',()=>changeMode('compose'));
const edit=(fn)=>{const p=selected();if(!p)return;fn(p);persist();update();mark();sound('tap');vibrate()};
$('rotateL').addEventListener('click',()=>edit(p=>p.angle-=Math.PI/12));
$('rotateR').addEventListener('click',()=>edit(p=>p.angle+=Math.PI/12));
$('smaller').addEventListener('click',()=>edit(p=>p.scale=clamp(p.scale*.9,.25,2.2)));
$('bigger').addEventListener('click',()=>edit(p=>p.scale=clamp(p.scale*1.1,.25,2.2)));
function ask(title,body,yes,action){
 confirmation=action;$('confirmTitle').textContent=title;$('confirmText').textContent=body;$('acceptAction').textContent=yes;$('confirmDialog').showModal();
}
$('removePiece').addEventListener('click',()=>{const p=selected();if(!p)return;ask('Убрать этот фрагмент?','Фрагмент исчезнет из твоего витража.','Удалить',()=>{
 s.pieces=s.pieces.filter(x=>x.id!==p.id);s.selected=null;update();persist();mark();toast('Стекло снято.');
})});
$('resetWork').addEventListener('click',()=>{if(!s.pieces.length){toast('Окно уже пустое.');return}ask('Очистить всю работу?','Все нарисованные фрагменты будут убраны.','Очистить',()=>{
 s.pieces=[];s.selected=null;s.draft=null;s.chips=0;changeMode('compose');toast('Снова чистое окно.');
})});
$('cancelAction').addEventListener('click',()=>{$('confirmDialog').close();confirmation=null});
$('acceptAction').addEventListener('click',()=>{const fn=confirmation;confirmation=null;$('confirmDialog').close();fn?.()});
$('confirmDialog').addEventListener('click',e=>{if(e.target===$('confirmDialog')){$('confirmDialog').close();confirmation=null}});
$('confirmDialog').addEventListener('close',()=>confirmation=null);
$('soundBtn').addEventListener('click',()=>{s.sound=!s.sound;if(s.sound)sound('tap');update();persist()});
$('sunRange').addEventListener('input',e=>{s.sun=Number(e.target.value);persist();mark()});
$('exportImage').addEventListener('click',()=>{
 try{
  paint(performance.now());
  const url=canvas.toDataURL('image/png');
  const link=document.createElement('a');link.href=url;link.download='vitrum-my-stained-glass.png';
  document.body.append(link);link.click();link.remove();
  toast('Изображение витража сохранено.');sound('success');
 }catch{toast('Сохранить PNG не удалось в этом браузере.');sound('error')}
});
window.addEventListener('resize',mark);
window.addEventListener('orientationchange',()=>setTimeout(mark,90));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){ironHold=null;persist()}else mark()});
window.addEventListener('pagehide',persist);
if(window.ResizeObserver)new ResizeObserver(mark).observe(scene);
update();persist();paint(performance.now());
requestAnimationFrame(loop);
