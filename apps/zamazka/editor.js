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
export async function renderArtwork(canvas,id,variation=0,strokes=null,damaged=false){
 const ctx=prepareCanvas(canvas);
 try{const image=await loadArtwork(id);if(!canvas.isConnected)return;ctx.clearRect(0,0,W,H);drawArtwork(ctx,image,id);
 if(damaged){const z=zoneFor(id,variation);ctx.save();clipZone(ctx,z);ctx.fillStyle='#e8ddc6';ctx.fillRect(z.x,z.y,z.w,z.h);(strokes||[]).forEach(s=>drawStroke(ctx,s));ctx.restore();
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
function keepWithinNetworkBudget(strokes){
 const total=strokes.reduce((count,stroke)=>count+stroke.p.length,0);
 if(total<=MAX_TOTAL_POINTS)return;
 for(const stroke of strokes){
  if(stroke.p.length>2){
   const reduced=simplifyPoints(stroke.p,Math.max(2,Math.floor(stroke.p.length*.82)));
   stroke.p.splice(0,stroke.p.length,...reduced);
  }
 }
}

const key='pocket-works:zamazka:draft:';
export class Editor{
 constructor(root,{id,variation=0,round=1,onChange=()=>{}}){
   this.root=root;this.id=id;this.variation=variation;this.round=round;this.onChange=onChange;this.zone=zoneFor(id,variation);
   this.canvas=root.querySelector('#paintCanvas');this.viewport=root.querySelector('.viewport');
   this.tool='brush';this.color='#3d594d';this.size=12;this.strokes=[];this.redoStack=[];this.working=null;this.pointers=new Map();this.scale=1.9;this.tx=0;this.ty=0;this.moving=false;this.closed=false;
   this.draftKey=key+id+':'+variation+':'+round;
   try{const stored=JSON.parse(localStorage.getItem(this.draftKey)||'null');if(Array.isArray(stored)&&stored.length<=MAX_STROKES)this.strokes=stored}catch{}
   this.attach();this.center();this.render();
 }
 center(){const w=this.viewport.clientWidth,h=this.viewport.clientHeight||w*.75,z=this.zone;this.tx=w/2-(z.x+z.w/2)*w/600*this.scale;this.ty=h/2-(z.y+z.h/2)*h/450*this.scale;this.transform();}
 transform(){this.canvas.style.transform='translate('+this.tx+'px,'+this.ty+'px) scale('+this.scale+')'}
 zoom(factor,anchorX=this.viewport.clientWidth/2,anchorY=this.viewport.clientHeight/2){const old=this.scale;this.scale=Math.min(4,Math.max(1,old*factor));const change=this.scale/old;this.tx=anchorX-(anchorX-this.tx)*change;this.ty=anchorY-(anchorY-this.ty)*change;this.transform()}
 point(e){const b=this.canvas.getBoundingClientRect();return [Math.max(0,Math.min(600,Math.round((e.clientX-b.left)/b.width*6000)/10)),Math.max(0,Math.min(450,Math.round((e.clientY-b.top)/b.height*4500)/10))]}
 inside(p){return insideDamage(this.zone,p)}
 save(){try{localStorage.setItem(this.draftKey,JSON.stringify(this.strokes))}catch{}this.onChange(this.strokes.length)}
 attach(){
  this.down=e=>{
    // Left mouse = draw; middle mouse = temporary pan regardless of tool.
    // Never paint with the right button or accidentally invoke autoscroll.
    if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1)return;
    e.preventDefault();
    (e.target===this.canvas?this.canvas:this.viewport).setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(e.target===this.viewport)this.viewportCapturedPointer=e.pointerId;
    if(this.pointers.size>1){
      if(this.working){this.strokes.push(this.working);this.working=null;this.save()}
      this.moving=true;const pp=[...this.pointers.values()];
      this.pinch={d:Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1]),z:this.scale,x:this.tx,y:this.ty,mid:[(pp[0][0]+pp[1][0])/2,(pp[0][1]+pp[1][1])/2]};
      return;
    }
    if(e.button===1||this.tool==='hand'){
      this.panStart=[e.clientX,e.clientY,this.tx,this.ty];
      this.viewport.classList.add('is-panning');return;
    }
    const p=this.point(e);
    if(this.tool==='picker'){this.pick(p);return}
    if(!this.inside(p))return;
    if(this.strokes.length>=MAX_STROKES){this.onChange(-1);return}
    this.working={c:this.color,s:this.size,t:this.tool,p:[p]};this.redoStack=[];
    this.render();
  };
  this.move=e=>{
    if(!this.pointers.has(e.pointerId))return;
    e.preventDefault();this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(this.pointers.size>1&&this.pinch){const pp=[...this.pointers.values()],dist=Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1])||1;
      const old=this.scale;this.scale=Math.max(1,Math.min(4,this.pinch.z*dist/Math.max(10,this.pinch.d)));
      const mid=[(pp[0][0]+pp[1][0])/2,(pp[0][1]+pp[1][1])/2];
      this.tx=this.pinch.x+(mid[0]-this.pinch.mid[0])+(this.viewport.clientWidth/2-this.pinch.x)*(1-this.scale/this.pinch.z);
      this.ty=this.pinch.y+(mid[1]-this.pinch.mid[1])+(this.viewport.clientHeight/2-this.pinch.y)*(1-this.scale/this.pinch.z);this.transform();return;
    }
    if(this.panStart){this.tx=this.panStart[2]+e.clientX-this.panStart[0];this.ty=this.panStart[3]+e.clientY-this.panStart[1];this.transform();return}
    if(!this.working)return;
    const p=this.point(e),pts=this.working.p,prev=pts[pts.length-1];
    if(this.inside(p)&&Math.hypot(p[0]-prev[0],p[1]-prev[1])>1.1){
      pts.push(p);
      if(pts.length>MAX_STROKE_POINTS)pts.splice(0,pts.length,...simplifyPoints(pts,32));
      keepWithinNetworkBudget([...this.strokes,this.working]);
      this.render();
    }
  };
  this.up=e=>{
    if(!this.pointers.has(e.pointerId))return;
    this.pointers.delete(e.pointerId);
    if(this.viewportCapturedPointer===e.pointerId)this.viewportCapturedPointer=null;
    if(this.pointers.size<2)this.pinch=null;
    if(this.working){this.strokes.push(this.working);this.working=null;this.save();this.render()}
    this.panStart=null;this.viewport.classList.remove('is-panning');
  };
  this.canvas.addEventListener('pointerdown',this.down);this.canvas.addEventListener('pointermove',this.move);this.canvas.addEventListener('pointerup',this.up);this.canvas.addEventListener('pointercancel',this.up);
  // Dragging the frame outside the transformed canvas should also allow a middle-click pan.
  this.frameDown=e=>{if(e.target===this.viewport&&e.pointerType==='mouse'&&e.button===1)this.down(e)};
  this.frameMove=e=>{if(this.viewportCapturedPointer===e.pointerId)this.move(e)};
  this.frameUp=e=>{if(this.viewportCapturedPointer===e.pointerId)this.up(e)};
  this.viewport.addEventListener('pointerdown',this.frameDown);
  this.viewport.addEventListener('pointermove',this.frameMove);
  this.viewport.addEventListener('pointerup',this.frameUp);
  this.viewport.addEventListener('pointercancel',this.frameUp);
  this.preventMiddle=e=>{if(e.button===1)e.preventDefault()};
  this.viewport.addEventListener('mousedown',this.preventMiddle);
  this.viewport.addEventListener('auxclick',this.preventMiddle);
  this.wheel=e=>{
   e.preventDefault();
   const bounds=this.viewport.getBoundingClientRect();
   this.zoom(e.deltaY<0?1.12:.89,e.clientX-bounds.left,e.clientY-bounds.top);
  };
  this.viewport.addEventListener('wheel',this.wheel,{passive:false});
  this.actions=e=>{const b=e.target.closest('[data-tool],[data-cmd],[data-color]');if(!b)return;
   if(b.dataset.tool){this.tool=b.dataset.tool;this.viewport.classList.toggle('hand-mode',this.tool==='hand');this.root.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===this.tool))}
   if(b.dataset.color){this.color=b.dataset.color;this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b))}
   if(b.dataset.cmd==='undo'&&this.strokes.length){this.redoStack.push(this.strokes.pop());this.save();this.render()}
   if(b.dataset.cmd==='redo'&&this.redoStack.length){this.strokes.push(this.redoStack.pop());this.save();this.render()}
   if(b.dataset.cmd==='in')this.zoom(1.3);
   if(b.dataset.cmd==='out')this.zoom(.77);
   if(b.dataset.cmd==='center')this.center();
  };
  // Keyboard shortcuts for desktop conservation; Space temporarily pans
  // without stealing Ctrl+ shortcuts outside the active canvas.
  this.keyboardDown=e=>{
   if(this.closed||e.target?.matches?.('input,textarea,select,[contenteditable]')||
      document.querySelector('#dialog:not(.hidden)')||e.altKey||e.metaKey)return;
   const byCode={KeyB:'brush',KeyI:'picker',KeyE:'erase',KeyH:'hand'};
   let target;
   if(e.ctrlKey){
    if(e.code==='KeyZ')target=e.shiftKey?'redo':'undo';
    else if(e.code==='KeyY')target='redo';
    if(target){e.preventDefault();this.root.querySelector('[data-cmd="'+target+'"]')?.click()}
    return;
   }
   if(e.code==='Space'&&!e.repeat){
    e.preventDefault();
    this.spaceTool=this.tool;
    this.root.querySelector('[data-tool="hand"]')?.click();
   }else if(e.code==='Digit0'){e.preventDefault();this.root.querySelector('[data-cmd="center"]')?.click()}
   else if(['Equal','NumpadAdd'].includes(e.code)){e.preventDefault();this.root.querySelector('[data-cmd="in"]')?.click()}
   else if(['Minus','NumpadSubtract'].includes(e.code)){e.preventDefault();this.root.querySelector('[data-cmd="out"]')?.click()}
   else if(byCode[e.code]){e.preventDefault();this.root.querySelector('[data-tool="'+byCode[e.code]+'"]')?.click()}
  };
  this.keyboardUp=e=>{
   if(e.code==='Space'&&this.spaceTool){
     this.root.querySelector('[data-tool="'+this.spaceTool+'"]')?.click();
     this.spaceTool=null;
   }
  };
  this.keyboardBlur=()=>this.keyboardUp({code:'Space'});
  window.addEventListener('blur',this.keyboardBlur);
  window.addEventListener('keydown',this.keyboardDown);
  window.addEventListener('keyup',this.keyboardUp);
  this.root.addEventListener('click',this.actions);
  this.slider=e=>{if(e.target.id==='brushSize')this.size=Number(e.target.value);if(e.target.id==='customColor')this.color=e.target.value};
  this.root.addEventListener('input',this.slider);
  this.resize=()=>this.center();window.addEventListener('resize',this.resize);
 }
 async pick(p){if(this.inside(p))return;try{const image=await loadArtwork(this.id);const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');drawArtwork(x,image,this.id);const rgb=x.getImageData(p[0]|0,p[1]|0,1,1).data;this.color='#'+[rgb[0],rgb[1],rgb[2]].map(n=>n.toString(16).padStart(2,'0')).join('');this.root.querySelector('#customColor').value=this.color;this.tool='brush';this.root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='brush'));this.onChange(this.strokes.length)}catch{}}
 async render(){if(this.closed)return;const c=this.canvas,version=this.renderVersion=(this.renderVersion||0)+1;const img=await loadArtwork(this.id).catch(()=>null);if(!img||this.closed||version!==this.renderVersion)return;
 const x=prepareCanvas(c,true);drawArtwork(x,img,this.id);x.save();clipZone(x,this.zone);x.fillStyle='#e8ddc6';x.fillRect(this.zone.x,this.zone.y,this.zone.w,this.zone.h);[...this.strokes,...(this.working?[this.working]:[])].forEach(s=>drawStroke(x,s));x.restore();x.save();x.setLineDash([5,4]);x.strokeStyle='#806950';x.lineWidth=1.5;damagePath(x,this.zone);x.stroke();x.restore();
 }
 getData(){return this.strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p}))}
 clearDraft(){localStorage.removeItem(this.draftKey)}
 dispose(){this.closed=true;this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.viewport.removeEventListener('wheel',this.wheel);this.viewport.removeEventListener('mousedown',this.preventMiddle);this.viewport.removeEventListener('auxclick',this.preventMiddle);this.viewport.removeEventListener('pointerdown',this.frameDown);this.viewport.removeEventListener('pointermove',this.frameMove);this.viewport.removeEventListener('pointerup',this.frameUp);this.viewport.removeEventListener('pointercancel',this.frameUp);this.root.removeEventListener('click',this.actions);this.root.removeEventListener('input',this.slider);window.removeEventListener('blur',this.keyboardBlur);window.removeEventListener('keydown',this.keyboardDown);window.removeEventListener('keyup',this.keyboardUp);window.removeEventListener('resize',this.resize)}
}
