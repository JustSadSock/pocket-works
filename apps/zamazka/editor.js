import {W,H,zoneFor,damagePath,insideDamage,loadArtwork,drawArtwork} from './artworks.js';

// Keep stroke coordinates in the 600×450 logical world, but rasterize on a much
// denser backing buffer. Previously both zoomed desktop editing and the reveal
// stretched a literal 600px canvas; that was the second source of pixelation.
function prepareCanvas(canvas,editor=false){
 const screenWidth=canvas.getBoundingClientRect().width||canvas.parentElement?.clientWidth||600;
 const dpr=typeof window==='undefined'?1:Math.max(1,Math.min(3,window.devicePixelRatio||1));
 const desktop=typeof window!=='undefined'&&window.matchMedia('(min-width:900px) and (pointer:fine)').matches;
 const needed=editor?Math.max(2.5,dpr*1.6):Math.max(2,dpr,desktop?2.5:2);
 const scale=Math.min(editor?3.5:3,needed,Math.max(2,3500/W));
 const w=Math.round(W*scale),h=Math.round(H*scale);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const ctx=canvas.getContext('2d');
 ctx.setTransform(scale,0,0,scale,0,0);
 ctx.imageSmoothingEnabled=true;
 ctx.imageSmoothingQuality='high';
 return ctx;
}
function clipZone(ctx,z){damagePath(ctx,z);ctx.clip();}
function dab(ctx,x,y,r,color,alpha=1){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(.5,r),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
function drawStroke(ctx,stroke){
 const pts=stroke.p||[];if(!pts.length)return;
 const size=Number(stroke.s)||8,color=stroke.t==='erase'?'#e8ddc6':stroke.c;
 ctx.save();ctx.strokeStyle=color;ctx.lineWidth=stroke.t==='pencil'?Math.max(1,size*.4):size;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.globalAlpha=stroke.t==='pencil'?.82:stroke.t==='spray'?.44:1;
 if(stroke.t==='spray'){
  for(let i=0;i<pts.length;i++){const pt=pts[i];for(let j=0;j<6;j++){const angle=((i*13+j*83)%360)*Math.PI/180,rad=(i+j*7)%11/11*size;dab(ctx,pt[0]+Math.cos(angle)*rad,pt[1]+Math.sin(angle)*rad,size*.13,color,.34)}}
 }else{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.stroke();dab(ctx,pts[0][0],pts[0][1],ctx.lineWidth/2,color,ctx.globalAlpha)}
 ctx.restore();
}
// Fill tests only the hand-drawn line mask: previous fill colours are never
// barriers. Render at 2x and underpaint edges to avoid jagged white seams.
const FILL_SCALE=2;
function layer(){
 const canvas=document.createElement('canvas');
 canvas.width=W*FILL_SCALE;canvas.height=H*FILL_SCALE;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.setTransform(FILL_SCALE,0,0,FILL_SCALE,0,0);
 return {canvas,ctx};
}
function fillRegion(lines,fills,zoneMask,p,colour){
 const w=lines.canvas.width,h=lines.canvas.height;
 const x=Math.max(0,Math.min(w-1,Math.floor(p[0]*FILL_SCALE)));
 const y=Math.max(0,Math.min(h-1,Math.floor(p[1]*FILL_SCALE)));
 const walls=lines.ctx.getImageData(0,0,w,h).data;
 const mask=zoneMask.data,start=y*w+x;
 const allowed=i=>mask[i*4+3]>100&&walls[i*4+3]<92;
 if(!allowed(start))return;
 const queue=new Int32Array(w*h),seen=new Uint8Array(w*h);
 let head=0,tail=1;queue[0]=start;seen[start]=1;
 while(head<tail){
  const i=queue[head++],cx=i%w,cy=(i/w)|0;
  const tryAdd=n=>{if(!seen[n]&&allowed(n)){seen[n]=1;queue[tail++]=n}};
  if(cx>0)tryAdd(i-1);
  if(cx<w-1)tryAdd(i+1);
  if(cy>0)tryAdd(i-w);
  if(cy<h-1)tryAdd(i+w);
 }
 const image=fills.ctx.getImageData(0,0,w,h),data=image.data;
 const r=parseInt(colour.slice(1,3),16),g=parseInt(colour.slice(3,5),16),b=parseInt(colour.slice(5,7),16);
 // Paint the neighbouring contour pixels UNDER the lines, but never cross
 // those lines during region discovery.
 const paint=i=>{if(mask[i*4+3]<35)return;const k=i*4;data[k]=r;data[k+1]=g;data[k+2]=b;data[k+3]=255};
 for(let n=0;n<tail;n++){
  const i=queue[n],cx=i%w,cy=(i/w)|0;paint(i);
  if(cx>0)paint(i-1);if(cx<w-1)paint(i+1);
  if(cy>0)paint(i-w);if(cy<h-1)paint(i+w);
 }
 fills.ctx.putImageData(image,0,0);
}
function renderStrokes(ctx,strokes,zone){
 if(!strokes.some(s=>s.t==='fill')){strokes.forEach(s=>drawStroke(ctx,s));return}
 const lines=layer(),fills=layer(),area=layer();
 area.ctx.fillStyle='#fff';damagePath(area.ctx,zone);area.ctx.fill();
 const zoneMask=area.ctx.getImageData(0,0,area.canvas.width,area.canvas.height);
 lines.ctx.save();clipZone(lines.ctx,zone);
 fills.ctx.save();clipZone(fills.ctx,zone);
 for(const stroke of strokes){
  if(stroke.t==='fill'){fillRegion(lines,fills,zoneMask,stroke.p[0],stroke.c);continue}
  if(stroke.t==='erase'){
   for(const target of [lines.ctx,fills.ctx]){
    target.save();target.globalCompositeOperation='destination-out';drawStroke(target,stroke);target.restore();
   }
  }else drawStroke(lines.ctx,stroke);
 }
 lines.ctx.restore();fills.ctx.restore();
 ctx.drawImage(fills.canvas,0,0,W,H);
 ctx.drawImage(lines.canvas,0,0,W,H);
}

export async function renderArtwork(canvas,id,variation=0,strokes=null,damaged=false){
 const ctx=prepareCanvas(canvas);
 try{const image=await loadArtwork(id);if(!canvas.isConnected)return;ctx.clearRect(0,0,W,H);drawArtwork(ctx,image,id);
 if(damaged){const z=zoneFor(id,variation);ctx.save();clipZone(ctx,z);ctx.fillStyle='#e8ddc6';ctx.fillRect(z.x,z.y,z.w,z.h);renderStrokes(ctx,strokes||[],z);ctx.restore();
 }
 }catch{ctx.fillStyle='#ddc6aa';ctx.fillRect(0,0,W,H);ctx.fillStyle='#512d2a';ctx.fillText('Не удалось открыть картину',20,50);}
}

// A restoration stroke is a continuous gesture. The network format still
// limits each polyline to 45 points / the whole picture to 1600, so preserve
// the important bends instead of silently stopping once the buffer fills.
// Endpoints remain untouched, making very long mouse/finger drags uninterrupted.
export function simplifyPoints(points,limit){
 if(points.length<=limit)return points.slice();
 const kept=points.slice();
 while(kept.length>Math.max(2,limit)){
  let chosen=1,minCost=Infinity;
  for(let i=1;i<kept.length-1;i++){
   const a=kept[i-1],b=kept[i],c=kept[i+1];
   const ab=Math.hypot(b[0]-a[0],b[1]-a[1]);
   const bc=Math.hypot(c[0]-b[0],c[1]-b[1]);
   const area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
   const cost=area+Math.min(ab,bc)*.025;
   if(cost<minCost){minCost=cost;chosen=i}
  }
  kept.splice(chosen,1);
 }
 return kept;
}
const MAX_STROKES=72,MAX_STROKE_POINTS=45,MAX_TOTAL_POINTS=1600;

const key='pocket-works:zamazka:draft:';
export class Editor{
 constructor(root,{id,variation=0,round=1,onChange=()=>{}}){
   this.root=root;this.id=id;this.variation=variation;this.round=round;this.onChange=onChange;this.zone=zoneFor(id,variation);
   this.canvas=root.querySelector('#paintCanvas');this.viewport=root.querySelector('.viewport');
   this.tool='brush';this.color='#304a43';this.size=12;this.strokes=[];this.redoStack=[];this.working=null;this.pointers=new Map();this.scale=1.9;this.tx=0;this.ty=0;this.moving=false;this.closed=false;
    this.inputMode=localStorage.getItem('pocket-works:zamazka:input-mode')==='precision'?'precision':'direct';
    this.hand=localStorage.getItem('pocket-works:zamazka:precision-hand')==='left'?'left':'right';
    this.aimPointer=null;this.aim=null;this.armed=false;this.armPointer=null;this.lastCursor=null;this.limitWarned=false;
    this.cursor=root.querySelector('#brushCursor');this.armButton=root.querySelector('#precisionArm');this.sideButton=root.querySelector('#precisionSide');
   this.draftKey=key+id+':'+variation+':'+round;
   try{const stored=JSON.parse(localStorage.getItem(this.draftKey)||'null');if(Array.isArray(stored)&&stored.length<=MAX_STROKES)this.strokes=stored}catch{}
   this.attach();this.setMode(this.inputMode,false);this.center();this.render();
 }
 center(){const w=this.viewport.clientWidth,h=this.viewport.clientHeight||w*.75,z=this.zone;this.tx=w/2-(z.x+z.w/2)*w/600*this.scale;this.ty=h/2-(z.y+z.h/2)*h/450*this.scale;this.transform();}
 transform(){this.canvas.style.transform='translate('+this.tx+'px,'+this.ty+'px) scale('+this.scale+')';if(this.lastCursor)this.showCursor(this.lastCursor)}
 zoom(factor,anchorX=this.viewport.clientWidth/2,anchorY=this.viewport.clientHeight/2){const old=this.scale;this.scale=Math.min(4,Math.max(1,old*factor));const change=this.scale/old;this.tx=anchorX-(anchorX-this.tx)*change;this.ty=anchorY-(anchorY-this.ty)*change;this.transform()}
 point(e){const b=this.canvas.getBoundingClientRect();return [Math.max(0,Math.min(600,Math.round((e.clientX-b.left)/b.width*6000)/10)),Math.max(0,Math.min(450,Math.round((e.clientY-b.top)/b.height*4500)/10))]}
 inside(p){return insideDamage(this.zone,p)}
 save(){try{localStorage.setItem(this.draftKey,JSON.stringify(this.strokes))}catch{}this.onChange(this.strokes.length)}

  // The remote game accepts at most 45 points per segment, 72 segments and
  // 1600 points total. Segment *forward*; never retroactively simplify ink.
  countPoints(){return this.strokes.reduce((n,stroke)=>n+stroke.p.length,0)+(this.working?.p.length||0)}
  beginStroke(p){
    if(!this.inside(p))return;
    if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS){this.warnLimit();return}
    this.working={c:this.color,s:this.size,t:this.tool,p:[p],g:'gesture-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)};
    this.redoStack=[];this.render();
  }
  warnLimit(){if(!this.limitWarned){this.onChange(-1);this.limitWarned=true}}
  extendStroke(p){
    if(!this.working||!this.inside(p))return;
    const pts=this.working.p,prev=pts[pts.length-1];
    if(Math.hypot(p[0]-prev[0],p[1]-prev[1])<=1.1)return;
    if(this.countPoints()>=MAX_TOTAL_POINTS-(pts.length>=MAX_STROKE_POINTS?1:0)){this.warnLimit();return}
    if(pts.length>=MAX_STROKE_POINTS){
      if(this.strokes.length+1>=MAX_STROKES){this.warnLimit();return}
      const old=this.working;
      this.strokes.push(old);
      this.working={c:old.c,s:old.s,t:old.t,g:old.g,p:[prev,p]};
    }else pts.push(p);
    this.render();
  }
  finishStroke(){
    if(!this.working)return;
    this.strokes.push(this.working);this.working=null;this.limitWarned=false;
    this.save();this.render();
  }
  // On touch, the precision nib is above the finger, as in Folio.
  tip(e){
    const offset=this.inputMode==='precision'&&e.pointerType==='touch'&&this.tool!=='picker'&&this.tool!=='fill';
    return {clientX:e.clientX+(offset?(this.hand==='left'?18:-18):0),
      clientY:e.clientY-(offset?50:0),pointerType:e.pointerType};
  }
  pointAt(e){return this.point(this.tip(e))}
  showCursor(e){
    if(!this.cursor)return;
    if(['hand','picker','fill'].includes(this.tool)||this.pinch||this.panStart){this.hideCursor();return}
    this.lastCursor=e;
    const tip=this.tip(e),v=this.viewport.getBoundingClientRect(),c=this.canvas.getBoundingClientRect();
    const effectiveSize=this.tool==='pencil'?Math.max(1,this.size*.4):this.size;
    const diameter=Math.max(2,effectiveSize*c.width/W);
    this.cursor.style.width=diameter+'px';this.cursor.style.height=diameter+'px';
    this.cursor.style.left=tip.clientX-v.left+'px';this.cursor.style.top=tip.clientY-v.top+'px';
    this.cursor.style.setProperty('--brush-ink',this.tool==='erase'?'#e8ddc6':this.color);
    this.cursor.hidden=false;
  }
  hideCursor(){if(this.cursor)this.cursor.hidden=true}
  setMode(mode,persist=true){
    this.finishStroke();
    this.inputMode=mode==='precision'?'precision':'direct';
    if(persist)localStorage.setItem('pocket-works:zamazka:input-mode',this.inputMode);
    const precision=this.inputMode==='precision';
    this.root.querySelector('.restore')?.classList.toggle('precision-mode',precision);
    this.root.querySelector('.restore')?.classList.toggle('left-hand',this.hand==='left');
    if(this.armButton){this.armButton.hidden=!precision;this.armButton.classList.remove('is-armed')}
    if(this.sideButton)this.sideButton.hidden=!precision;
    const switcher=this.root.querySelector('[data-cmd="precision"]');
    if(switcher){switcher.setAttribute('aria-pressed',String(precision));switcher.setAttribute('title',precision?'Обычное рисование':'Точное перо: двумя пальцами');switcher.querySelector('span').textContent=precision?'Точное':'Прямое'}
    const tip=this.root.querySelector('#drawingTip');
    if(tip)tip.textContent=precision?'Один палец наводит перо · вторым удерживай «РИСОВАТЬ»':'Рисуй в повреждённой части';
    if(!precision){this.armed=false;this.armPointer=null;this.aimPointer=null;this.aim=null}
    if(this.lastCursor)this.showCursor(this.lastCursor);
  }
  attach(){
    this.down=e=>{
      if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1)return;
      e.preventDefault();
      try{(e.target===this.canvas?this.canvas:this.viewport).setPointerCapture(e.pointerId)}catch{}
      this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
      if(e.target===this.viewport)this.viewportCapturedPointer=e.pointerId;
      if(this.pointers.size>1){
        this.finishStroke();this.aimPointer=null;this.aim=null;
        this.moving=true;const pp=[...this.pointers.values()];
        this.pinch={d:Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1]),z:this.scale,x:this.tx,y:this.ty,
          mid:[(pp[0][0]+pp[1][0])/2,(pp[0][1]+pp[1][1])/2]};
        this.hideCursor();return;
      }
      if(e.button===1||this.tool==='hand'){
        this.panStart=[e.clientX,e.clientY,this.tx,this.ty];
        this.viewport.classList.add('is-panning');this.hideCursor();return;
      }
      this.showCursor(e);
      const p=this.pointAt(e);
      if(this.tool==='picker'){this.pick(p);return}
      if(this.tool==='fill'){
        if(!this.inside(p))return;
        if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS){this.warnLimit();return}
        this.strokes.push({c:this.color,s:this.size,t:'fill',p:[p]});
        this.redoStack=[];this.save();this.render();return;
      }
      if(this.inputMode==='precision'&&e.pointerType==='touch'){
        this.aimPointer=e.pointerId;this.aim={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
        if(this.armed)this.beginStroke(p);
        return;
      }
      this.beginStroke(p);
    };
    this.move=e=>{
      if(!this.pointers.has(e.pointerId)){
        if(e.pointerType==='mouse'||e.pointerType==='pen')this.showCursor(e);
        return;
      }
      e.preventDefault();this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
      if(this.pointers.size>1&&this.pinch){
        const pp=[...this.pointers.values()],dist=Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1])||1;
        this.scale=Math.max(1,Math.min(4,this.pinch.z*dist/Math.max(10,this.pinch.d)));
        const mid=[(pp[0][0]+pp[1][0])/2,(pp[0][1]+pp[1][1])/2];
        this.tx=this.pinch.x+(mid[0]-this.pinch.mid[0])+(this.viewport.clientWidth/2-this.pinch.x)*(1-this.scale/this.pinch.z);
        this.ty=this.pinch.y+(mid[1]-this.pinch.mid[1])+(this.viewport.clientHeight/2-this.pinch.y)*(1-this.scale/this.pinch.z);
        this.transform();return;
      }
      if(this.panStart){
        this.tx=this.panStart[2]+e.clientX-this.panStart[0];this.ty=this.panStart[3]+e.clientY-this.panStart[1];
        this.transform();return;
      }
      if(this.inputMode==='precision'&&e.pointerType==='touch'&&e.pointerId===this.aimPointer){
        this.aim={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
        this.showCursor(e);
        if(this.armed){
          const p=this.pointAt(e);
          if(!this.working)this.beginStroke(p);
          else this.extendStroke(p);
        }
        return;
      }
      this.showCursor(e);
      if(this.working)this.extendStroke(this.pointAt(e));
    };
    this.up=e=>{
      if(!this.pointers.has(e.pointerId))return;
      if(e.type==='pointerup'&&this.working&&this.pointers.size===1&&this.inputMode!=='precision')this.extendStroke(this.pointAt(e));
      this.pointers.delete(e.pointerId);
      if(this.viewportCapturedPointer===e.pointerId)this.viewportCapturedPointer=null;
      if(this.pointers.size<2)this.pinch=null;
      this.finishStroke();
      if(this.aimPointer===e.pointerId){this.aimPointer=null;this.aim=null}
      this.panStart=null;this.viewport.classList.remove('is-panning');
      if(e.pointerType==='touch'){this.lastCursor=null;this.hideCursor()}
      else this.showCursor(e);
    };
    this.canvas.addEventListener('pointerdown',this.down);
    this.canvas.addEventListener('pointermove',this.move);
    this.canvas.addEventListener('pointerup',this.up);
    this.canvas.addEventListener('pointercancel',this.up);
    this.frameDown=e=>{if(e.target===this.viewport&&e.pointerType==='mouse'&&e.button===1)this.down(e)};
    this.frameMove=e=>{if(this.viewportCapturedPointer===e.pointerId)this.move(e);else if(e.target===this.viewport&&(e.pointerType==='mouse'||e.pointerType==='pen'))this.showCursor(e)};
    this.frameUp=e=>{if(this.viewportCapturedPointer===e.pointerId)this.up(e)};
    this.viewport.addEventListener('pointerdown',this.frameDown);
    this.viewport.addEventListener('pointermove',this.frameMove);
    this.viewport.addEventListener('pointerup',this.frameUp);
    this.viewport.addEventListener('pointercancel',this.frameUp);
    this.cursorLeave=e=>{if(!this.pointers.size&&(e.pointerType==='mouse'||e.pointerType==='pen')){this.lastCursor=null;this.hideCursor()}};
    this.viewport.addEventListener('pointerleave',this.cursorLeave);
    this.armDown=e=>{
      if(this.inputMode!=='precision'||this.armPointer!==null)return;
      e.preventDefault();e.stopPropagation();
      this.armPointer=e.pointerId;this.armed=true;this.armButton.classList.add('is-armed');
      this.armButton.setAttribute('aria-pressed','true');
      try{this.armButton.setPointerCapture(e.pointerId)}catch{}
      if(this.aim&&this.aimPointer!==null&&this.pointers.size===1&&!this.working){
        this.beginStroke(this.pointAt(this.aim));
      }
    };
    this.armUp=e=>{
      if(this.armPointer!==e.pointerId)return;
      e.preventDefault();e.stopPropagation();
      this.armPointer=null;this.armed=false;
      this.armButton.classList.remove('is-armed');this.armButton.setAttribute('aria-pressed','false');
      this.finishStroke();
      if(this.aim)this.showCursor(this.aim);
    };
    this.armButton?.addEventListener('pointerdown',this.armDown);
    this.armButton?.addEventListener('pointerup',this.armUp);
    this.armButton?.addEventListener('pointercancel',this.armUp);
    this.armButton?.addEventListener('lostpointercapture',this.armUp);
    this.preventMiddle=e=>{if(e.button===1)e.preventDefault()};
    this.viewport.addEventListener('mousedown',this.preventMiddle);
    this.viewport.addEventListener('auxclick',this.preventMiddle);
    this.wheel=e=>{
      e.preventDefault();
      const bounds=this.viewport.getBoundingClientRect();
      this.zoom(e.deltaY<0?1.12:.89,e.clientX-bounds.left,e.clientY-bounds.top);
    };
    this.viewport.addEventListener('wheel',this.wheel,{passive:false});
    this.actions=e=>{
      const b=e.target.closest('[data-tool],[data-cmd],[data-color]');if(!b)return;
      if(b.dataset.tool){
        this.finishStroke();this.tool=b.dataset.tool;
        this.viewport.classList.toggle('hand-mode',this.tool==='hand');
        this.root.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===this.tool));
        if(this.lastCursor)this.showCursor(this.lastCursor);
      }
      if(b.dataset.color){this.color=b.dataset.color;this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b));if(this.lastCursor)this.showCursor(this.lastCursor)}
      if(b.dataset.cmd==='precision')this.setMode(this.inputMode==='precision'?'direct':'precision');
      if(b.dataset.cmd==='handedness'){
        this.hand=this.hand==='right'?'left':'right';
        localStorage.setItem('pocket-works:zamazka:precision-hand',this.hand);
        this.root.querySelector('.restore')?.classList.toggle('left-hand',this.hand==='left');
        b.setAttribute('aria-label','Кнопка рисования '+(this.hand==='left'?'справа':'слева'));
        if(this.lastCursor)this.showCursor(this.lastCursor);
      }
      if(b.dataset.cmd==='undo'&&this.strokes.length){
        const tail=this.strokes.pop(),group=[tail];
        if(tail.g)while(this.strokes.length&&this.strokes[this.strokes.length-1].g===tail.g)group.unshift(this.strokes.pop());
        this.redoStack.push(group);this.save();this.render();
      }
      if(b.dataset.cmd==='redo'&&this.redoStack.length){
        const group=this.redoStack.pop();
        this.strokes.push(...group);this.save();this.render();
      }
      if(b.dataset.cmd==='in')this.zoom(1.3);
      if(b.dataset.cmd==='out')this.zoom(.77);
      if(b.dataset.cmd==='center')this.center();
    };
    this.keyboardDown=e=>{
      if(this.closed||e.target?.matches?.('input,textarea,select,[contenteditable]')||
         document.querySelector('#dialog:not(.hidden)')||e.altKey||e.metaKey)return;
      const byCode={KeyB:'brush',KeyF:'fill',KeyI:'picker',KeyE:'erase',KeyH:'hand'};
      let target;
      if(e.ctrlKey){
        if(e.code==='KeyZ')target=e.shiftKey?'redo':'undo';
        else if(e.code==='KeyY')target='redo';
        if(target){e.preventDefault();this.root.querySelector('[data-cmd="'+target+'"]')?.click()}
        return;
      }
      if(e.code==='Space'&&!e.repeat){
        e.preventDefault();this.spaceTool=this.tool;
        this.root.querySelector('[data-tool="hand"]')?.click();
      }else if(e.code==='Digit0'){e.preventDefault();this.root.querySelector('[data-cmd="center"]')?.click()}
      else if(['Equal','NumpadAdd'].includes(e.code)){e.preventDefault();this.root.querySelector('[data-cmd="in"]')?.click()}
      else if(['Minus','NumpadSubtract'].includes(e.code)){e.preventDefault();this.root.querySelector('[data-cmd="out"]')?.click()}
      else if(byCode[e.code]){e.preventDefault();this.root.querySelector('[data-tool="'+byCode[e.code]+'"]')?.click()}
    };
    this.keyboardUp=e=>{
      if(e.code==='Space'&&this.spaceTool){
        this.root.querySelector('[data-tool="'+this.spaceTool+'"]')?.click();this.spaceTool=null;
      }
    };
    this.keyboardBlur=()=>{
      this.keyboardUp({code:'Space'});
      if(this.armPointer!==null)this.armUp({pointerId:this.armPointer,preventDefault(){},stopPropagation(){}});
    };
    window.addEventListener('blur',this.keyboardBlur);
    window.addEventListener('keydown',this.keyboardDown);
    window.addEventListener('keyup',this.keyboardUp);
    this.root.addEventListener('click',this.actions);
    this.slider=e=>{
      if(e.target.id==='brushSize')this.size=Number(e.target.value);
      if(e.target.id==='customColor'){
        this.color=e.target.value;
        this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.remove('active'));
      }
      if(this.lastCursor)this.showCursor(this.lastCursor);
    };
    this.root.addEventListener('input',this.slider);
    this.resize=()=>{if(!this.pointers.size)this.center()};
    window.addEventListener('resize',this.resize);
  }
 async pick(p){if(this.inside(p))return;try{const image=await loadArtwork(this.id);const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');drawArtwork(x,image,this.id);const rgb=x.getImageData(p[0]|0,p[1]|0,1,1).data;this.color='#'+[rgb[0],rgb[1],rgb[2]].map(n=>n.toString(16).padStart(2,'0')).join('');this.root.querySelector('#customColor').value=this.color;this.tool='brush';this.root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='brush'));this.onChange(this.strokes.length)}catch{}}
 async render(){if(this.closed)return;const c=this.canvas,version=this.renderVersion=(this.renderVersion||0)+1;const img=await loadArtwork(this.id).catch(()=>null);if(!img||this.closed||version!==this.renderVersion)return;
 const x=prepareCanvas(c,true);drawArtwork(x,img,this.id);x.save();clipZone(x,this.zone);x.fillStyle='#e8ddc6';x.fillRect(this.zone.x,this.zone.y,this.zone.w,this.zone.h);renderStrokes(x,[...this.strokes,...(this.working?[this.working]:[])],this.zone);x.restore();x.save();x.setLineDash([5,4]);x.strokeStyle='#806950';x.lineWidth=1.5;damagePath(x,this.zone);x.stroke();x.restore();
 }
 getData(){this.finishStroke();return this.strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p}))}
 clearDraft(){localStorage.removeItem(this.draftKey)}
 dispose(){this.closed=true;this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.viewport.removeEventListener('wheel',this.wheel);this.viewport.removeEventListener('pointerleave',this.cursorLeave);this.armButton?.removeEventListener('pointerdown',this.armDown);this.armButton?.removeEventListener('pointerup',this.armUp);this.armButton?.removeEventListener('pointercancel',this.armUp);this.armButton?.removeEventListener('lostpointercapture',this.armUp);this.viewport.removeEventListener('mousedown',this.preventMiddle);this.viewport.removeEventListener('auxclick',this.preventMiddle);this.viewport.removeEventListener('pointerdown',this.frameDown);this.viewport.removeEventListener('pointermove',this.frameMove);this.viewport.removeEventListener('pointerup',this.frameUp);this.viewport.removeEventListener('pointercancel',this.frameUp);this.root.removeEventListener('click',this.actions);this.root.removeEventListener('input',this.slider);window.removeEventListener('blur',this.keyboardBlur);window.removeEventListener('keydown',this.keyboardDown);window.removeEventListener('keyup',this.keyboardUp);window.removeEventListener('resize',this.resize)}
}
