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
// Flood-filling uses only drawn contours as barriers: an earlier fill is not
// a wall. Recover antialiased border pixels AFTER determining connectivity so
// colour reaches right under the line without flooding into adjacent regions.
const FILL_SCALE=2;
function layer(){
 const canvas=document.createElement('canvas');
 canvas.width=W*FILL_SCALE;canvas.height=H*FILL_SCALE;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.setTransform(FILL_SCALE,0,0,FILL_SCALE,0,0);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 return {canvas,ctx};
}
/** Pixel-space 4-way flood, plus one-pixel colour underlap beneath contour AA. */
export function floodFillRaster({width,height,walls,zone,output,point,color}){
 const total=width*height;
 if(!total||!walls||!zone||!output||!Array.isArray(point)||!Array.isArray(color))return 0;
 const wall=walls.data||walls,area=zone.data||zone,ink=output.data||output;
 if(wall.length<total*4||area.length<total*4||ink.length<total*4)return 0;
 const allowed=i=>area[i*4+3]>=120&&wall[i*4+3]<145;
 let sx=Math.max(0,Math.min(width-1,Math.floor(point[0]))),sy=Math.max(0,Math.min(height-1,Math.floor(point[1])));
 let start=sy*width+sx;
 // A click a fraction inside an antialiased line should still find its own
 // nearby enclosed region. Never search farther than three logical pixels.
 if(!allowed(start)){
   let closest=-1,dist=Infinity;
   const radius=6;
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
     const x=sx+dx,y=sy+dy,d=dx*dx+dy*dy;
     if(x<0||x>=width||y<0||y>=height||d>radius*radius||d>=dist)continue;
     const i=y*width+x;if(allowed(i)){closest=i;dist=d}
   }
   if(closest<0)return 0;
   start=closest;
 }
 const seen=new Uint8Array(total),queue=new Int32Array(total);
 let head=0,tail=1;seen[start]=1;queue[0]=start;
 while(head<tail){
   const i=queue[head++],x=i%width,y=(i/width)|0;
   if(x>0){const n=i-1;if(!seen[n]&&allowed(n)){seen[n]=1;queue[tail++]=n}}
   if(x<width-1){const n=i+1;if(!seen[n]&&allowed(n)){seen[n]=1;queue[tail++]=n}}
   if(y>0){const n=i-width;if(!seen[n]&&allowed(n)){seen[n]=1;queue[tail++]=n}}
   if(y<height-1){const n=i+width;if(!seen[n]&&allowed(n)){seen[n]=1;queue[tail++]=n}}
 }
 const [r,g,b]=color;
 const paint=i=>{
   // Colour beyond the damaged mask is harmless with the final single clip,
   // but skipping it avoids needless work and lets the border stay precise.
   if(area[i*4+3]===0)return;
   const k=i*4;ink[k]=r;ink[k+1]=g;ink[k+2]=b;ink[k+3]=255;
 };
 for(let n=0;n<tail;n++)paint(queue[n]);
 // The classic 4-connected seed fill intentionally stops at the visible
 // contour. Pad its eight neighbouring AA/wall pixels underneath the line.
 // Do not expand into a different reachable basin: that would stain it.
 for(let n=0;n<tail;n++){
   const i=queue[n],x=i%width,y=(i/width)|0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     if(!dx&&!dy)continue;
     const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
     const neighbour=yy*width+xx;
     if(!seen[neighbour]&&!allowed(neighbour))paint(neighbour);
   }
 }
 return tail;
}
function fillRegion(lines,fills,zoneMask,p,colour){
 const w=lines.canvas.width,h=lines.canvas.height;
 const walls=lines.ctx.getImageData(0,0,w,h);
 const current=fills.ctx.getImageData(0,0,w,h);
 const color=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16));
 const filled=floodFillRaster({
   width:w,height:h,walls,zone:zoneMask,output:current,
   point:[p[0]*FILL_SCALE,p[1]*FILL_SCALE],color
 });
 if(filled)fills.ctx.putImageData(current,0,0);
}
function renderStrokes(ctx,strokes,zone){
 if(!strokes.some(s=>s.t==='fill')){strokes.forEach(s=>drawStroke(ctx,s));return}
 const lines=layer(),fills=layer(),area=layer();
 area.ctx.fillStyle='#fff';damagePath(area.ctx,zone);area.ctx.fill();
 const zoneMask=area.ctx.getImageData(0,0,area.canvas.width,area.canvas.height);
 for(const stroke of strokes){
   if(stroke.t==='fill'){fillRegion(lines,fills,zoneMask,stroke.p[0],stroke.c);continue}
   if(stroke.t==='erase'){
     for(const target of [lines.ctx,fills.ctx]){
       target.save();target.globalCompositeOperation='destination-out';drawStroke(target,stroke);target.restore();
     }
   }else drawStroke(lines.ctx,stroke);
 }
 // Actual clipping is applied ONCE to the finished artwork, not independently
 // to each colour layer: repeated translucent clips caused beige fringes.
 ctx.drawImage(fills.canvas,0,0,W,H);
 ctx.drawImage(lines.canvas,0,0,W,H);
}

export async function renderArtwork(canvas,id,variation=0,strokes=null,damaged=false){
 const ctx=prepareCanvas(canvas);
 try{const image=await loadArtwork(id);if(!canvas.isConnected)return;ctx.clearRect(0,0,W,H);drawArtwork(ctx,image,id);
 if(damaged){
  const z=zoneFor(id,variation),overlay=document.createElement('canvas');
  overlay.width=canvas.width;overlay.height=canvas.height;
  const paint=overlay.getContext('2d');
  paint.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  paint.imageSmoothingEnabled=true;paint.imageSmoothingQuality='high';
  paint.fillStyle='#e8ddc6';paint.fillRect(0,0,W,H);
  renderStrokes(paint,strokes||[],z);
  // Render one opaque restoration surface, clip its irregular outer contour
  // once. Previous beige+fill+stroke clipping multiplied edge alpha.
  ctx.save();clipZone(ctx,z);ctx.drawImage(overlay,0,0,W,H);ctx.restore();
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
const MAX_STROKES=100,MAX_STROKE_POINTS=45,MAX_TOTAL_POINTS=2000;

const key='pocket-works:zamazka:draft:';
export class Editor{
 constructor(root,{id,variation=0,round=1,onChange=()=>{}}){
   this.root=root;this.id=id;this.variation=variation;this.round=round;this.onChange=onChange;this.zone=zoneFor(id,variation);
   this.canvas=root.querySelector('#paintCanvas');this.viewport=root.querySelector('.viewport');
   this.tool='brush';this.color='#304a43';this.size=12;this.strokes=[];this.redoStack=[];this.working=null;this.pointers=new Map();this.scale=1.9;this.tx=0;this.ty=0;this.moving=false;this.closed=false;
    this.inputMode=localStorage.getItem('pocket-works:zamazka:input-mode')==='precision'?'precision':'direct';
    this.hand=localStorage.getItem('pocket-works:zamazka:precision-hand')==='left'?'left':'right';
    this.aimPointer=null;this.aim=null;this.armed=false;this.armPointer=null;this.lastCursor=null;this.lastMousePoint=null;this.spaceTool=null;this.spacePicked=false;this.limitWarned=false;
    this.cursor=root.querySelector('#brushCursor');this.pickerPreview=root.querySelector('#pickerPreview');this.armButton=root.querySelector('#precisionArm');this.sideButton=root.querySelector('#precisionSide');
   this.draftKey=key+id+':'+variation+':'+round;
   try{const stored=JSON.parse(localStorage.getItem(this.draftKey)||'null');if(Array.isArray(stored)&&stored.length<=MAX_STROKES)this.strokes=stored}catch{}
   this.attach();this.setMode(this.inputMode,false);this.center();this.render();
 }
 center(){const w=this.viewport.clientWidth,h=this.viewport.clientHeight||w*.75,z=this.zone;this.tx=w/2-(z.x+z.w/2)*w/600*this.scale;this.ty=h/2-(z.y+z.h/2)*h/450*this.scale;this.transform();}
 transform(){this.canvas.style.transform='translate('+this.tx+'px,'+this.ty+'px) scale('+this.scale+')';if(this.lastCursor)this.showCursor(this.lastCursor)}
 zoom(factor,anchorX=this.viewport.clientWidth/2,anchorY=this.viewport.clientHeight/2){const old=this.scale;this.scale=Math.min(4,Math.max(1,old*factor));const change=this.scale/old;this.tx=anchorX-(anchorX-this.tx)*change;this.ty=anchorY-(anchorY-this.ty)*change;this.transform()}
 point(e){const b=this.canvas.getBoundingClientRect();return [Math.max(0,Math.min(600,Math.round((e.clientX-b.left)/b.width*6000)/10)),Math.max(0,Math.min(450,Math.round((e.clientY-b.top)/b.height*4500)/10))]}
 inside(p){return insideDamage(this.zone,p)}
 save(){this.paintRevision=(this.paintRevision||0)+1;this.saveSnapshot();this.onChange(this.strokes.length)}
  getSnapshot(){return [...this.strokes,...(this.working?[this.working]:[])].map(s=>({c:s.c,s:s.s,t:s.t,p:s.p.map(p=>[...p])}))}
  saveSnapshot(){try{localStorage.setItem(this.draftKey,JSON.stringify(this.getSnapshot()))}catch{}}
  adoptDraft(strokes){
    if(this.strokes.length||!Array.isArray(strokes)||strokes.length>MAX_STROKES)return false;
    const total=strokes.reduce((n,s)=>n+(Array.isArray(s?.p)?s.p.length:MAX_TOTAL_POINTS+1),0);
    if(total>MAX_TOTAL_POINTS||strokes.some(s=>!['brush','pencil','spray','erase','fill'].includes(s.t)||!/^#[0-9a-f]{6}$/i.test(s.c)||s.s<1||s.s>48||!Array.isArray(s.p)||!s.p.length||s.p.length>MAX_STROKE_POINTS))return false;
    this.strokes=strokes.map(s=>({...s,p:s.p.map(p=>[...p])}));this.save();this.render();return true;
  }
  setTool(tool){
    if(!['brush','fill','picker','erase','hand'].includes(tool))return;
    this.finishStroke();this.tool=tool;
    this.viewport.classList.toggle('hand-mode',tool==='hand');
    this.viewport.classList.toggle('picker-mode',tool==='picker');
    this.root.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===tool));
    if(this.lastCursor)this.showCursor(this.lastCursor);
  }

  // Compress only redundant bends to keep long drawing sessions flowing.
  compactStrokeBudget(){
    if(this.strokes.some(s=>s.t==='fill'))return false;
    let changed=false;
    for(const stroke of this.strokes){
      if(stroke.p.length<12)continue;
      const candidate=simplifyPoints(stroke.p,Math.max(8,Math.floor(stroke.p.length*.77)));
      if(candidate.length<stroke.p.length){stroke.p=candidate;changed=true}
    }
    for(let i=1;i<this.strokes.length;i++){
      const a=this.strokes[i-1],b=this.strokes[i];
      if(a.g&&b.g===a.g&&a.t===b.t&&a.c===b.c&&a.s===b.s&&a.p.length+b.p.length-1<=MAX_STROKE_POINTS){
        a.p.push(...b.p.slice(1));this.strokes.splice(i--,1);changed=true;
      }
    }
    if(changed){this.paintRevision=(this.paintRevision||0)+1;this.saveSnapshot()}
    return changed;
  }
  countPoints(){return this.strokes.reduce((n,stroke)=>n+stroke.p.length,0)+(this.working?.p.length||0)}
  beginStroke(p){
    if(!this.inside(p))return;
    if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS)this.compactStrokeBudget();
    if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS){this.warnLimit();return}
    this.working={c:this.color,s:this.size,t:this.tool,p:[p],g:'gesture-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)};
    this.redoStack=[];this.render();
  }
  warnLimit(){if(!this.limitWarned){this.onChange(-1);this.limitWarned=true}}
  extendStroke(p){
    if(!this.working||!this.inside(p))return;
    const pts=this.working.p,prev=pts[pts.length-1];
    if(Math.hypot(p[0]-prev[0],p[1]-prev[1])<Math.min(3,1.35+this.countPoints()/1300))return;
    if(this.countPoints()>=MAX_TOTAL_POINTS-(pts.length>=MAX_STROKE_POINTS?1:0))this.compactStrokeBudget();
    if(this.countPoints()>=MAX_TOTAL_POINTS-(pts.length>=MAX_STROKE_POINTS?1:0)){this.warnLimit();return}
    if(pts.length>=MAX_STROKE_POINTS){
      if(this.strokes.length+1>=MAX_STROKES)this.compactStrokeBudget();
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
    if(this.pinch||this.panStart||this.tool==='hand'||this.tool==='fill'){
      this.hideCursor();this.hidePickerPreview();return;
    }
    this.lastCursor=e;
    if(this.tool==='picker'){
      this.hideCursor();this.showPickerPreview(e);return;
    }
    this.hidePickerPreview();
    const tip=this.tip(e),v=this.viewport.getBoundingClientRect(),c=this.canvas.getBoundingClientRect();
    const effectiveSize=this.tool==='pencil'?Math.max(1,this.size*.4):this.size;
    const diameter=Math.max(2,effectiveSize*c.width/W);
    this.cursor.style.width=diameter+'px';this.cursor.style.height=diameter+'px';
    // Absolutely positioned children start at the viewport padding edge, not its outer border.
   const drawn=this.point(tip);
   this.cursor.style.left=c.left+drawn[0]/W*c.width-v.left-this.viewport.clientLeft+'px';
   this.cursor.style.top=c.top+drawn[1]/H*c.height-v.top-this.viewport.clientTop+'px';
    this.cursor.style.setProperty('--brush-ink',this.tool==='erase'?'#e8ddc6':this.color);
    this.cursor.hidden=false;
  }
  hideCursor(){if(this.cursor)this.cursor.hidden=true}
  hidePickerPreview(){if(this.pickerPreview)this.pickerPreview.hidden=true}
  showPickerPreview(e){
    const sample=this.pickerPreview;if(!sample)return;
    const v=this.viewport.getBoundingClientRect(),
      x=e.clientX-v.left-this.viewport.clientLeft,y=e.clientY-v.top-this.viewport.clientTop;
    sample.style.left=Math.max(24,Math.min(this.viewport.clientWidth-24,x+19))+'px';
    sample.style.top=Math.max(30,Math.min(this.viewport.clientHeight-18,y-29))+'px';
    if(!this.lastPickerTick||Date.now()-this.lastPickerTick>45){
      this.lastPickerTick=Date.now();
      try{
        const p=this.pointAt(e);
        const px=Math.min(this.canvas.width-1,Math.floor(p[0]/W*this.canvas.width)),
          py=Math.min(this.canvas.height-1,Math.floor(p[1]/H*this.canvas.height));
        const rgba=this.canvas.getContext('2d').getImageData(px,py,1,1).data;
        if(rgba[3])this.previewInk='#'+[rgba[0],rgba[1],rgba[2]].map(n=>n.toString(16).padStart(2,'0')).join('');
      }catch{}
    }
    sample.style.setProperty('--sample-color',this.previewInk||this.color);
    sample.hidden=false;
  }
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
      if(e.pointerType==='mouse'||e.pointerType==='pen')this.lastMousePoint={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
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
      if(this.tool==='picker'){if(this.spaceTool!==null)this.spacePicked=true;void this.pick(p,this.spaceTool!==null);return}
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
      if(e.pointerType==='mouse'||e.pointerType==='pen')this.lastMousePoint={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
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
      if(this.working){
        const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
        for(const sample of events.length?events:[e])this.extendStroke(this.pointAt(sample));
      }
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
      if(e.pointerType==='touch'||e.type==='pointercancel'||
         !Number.isFinite(e.clientX)||!Number.isFinite(e.clientY)){
        this.lastCursor=null;
        if(e.pointerType==='touch')this.lastMousePoint=null;
        this.hideCursor();this.hidePickerPreview();
      }else this.showCursor(e);
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
    this.cursorLeave=e=>{if(!this.pointers.size&&(e.pointerType==='mouse'||e.pointerType==='pen')){this.lastCursor=null;this.hideCursor();this.hidePickerPreview()}};
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
    this.armGlobalUp=e=>{if(this.armPointer===e.pointerId)this.armUp(e)};
    window.addEventListener('pointerup',this.armGlobalUp);
    window.addEventListener('pointercancel',this.armGlobalUp);
    this.preventMiddle=e=>{if(e.button===1)e.preventDefault()};
    this.viewport.addEventListener('mousedown',this.preventMiddle);
    this.viewport.addEventListener('auxclick',this.preventMiddle);
    this.wheel=e=>{
      e.preventDefault();
      if(e.altKey){
        this.size=Math.max(1,Math.min(48,this.size+(e.deltaY<0?1:-1)*Math.max(1,Math.round(Math.abs(e.deltaY)/70))));
        const slider=this.root.querySelector('#brushSize');
        if(slider)slider.value=String(this.size);
        if(this.lastCursor)this.showCursor(this.lastCursor);
      }else{
        const bounds=this.viewport.getBoundingClientRect();
        this.zoom(e.deltaY<0?1.12:.89,e.clientX-bounds.left,e.clientY-bounds.top);
      }
    };
    this.viewport.addEventListener('wheel',this.wheel,{passive:false});
    this.actions=e=>{
      const b=e.target.closest('[data-tool],[data-cmd],[data-color]');if(!b)return;
      if(b.dataset.tool)this.setTool(b.dataset.tool);
      if(b.dataset.color){this.color=b.dataset.color;this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b));if(this.lastCursor)this.showCursor(this.lastCursor)}
      if(b.dataset.cmd==='precision')this.setMode(this.inputMode==='precision'?'direct':'precision');
      if(b.dataset.cmd==='handedness'){
        this.hand=this.hand==='right'?'left':'right';
        localStorage.setItem('pocket-works:zamazka:precision-hand',this.hand);
        this.root.querySelector('.restore')?.classList.toggle('left-hand',this.hand==='left');
        b.setAttribute('aria-label','Кнопка рисования '+(this.hand==='left'?'справа':'слева'));
        if(this.lastCursor)this.showCursor(this.lastCursor);
      }
      if(b.dataset.cmd==='undo'&&(this.strokes.length||this.working)){
        this.finishStroke();
        const tail=this.strokes.pop(),group=[tail];
        if(tail.g)while(this.strokes.length&&this.strokes[this.strokes.length-1].g===tail.g)group.unshift(this.strokes.pop());
        this.redoStack.push(group);this.save();this.render();
      }
      if(b.dataset.cmd==='redo'&&this.redoStack.length){
        this.finishStroke();
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
      if(e.ctrlKey){
        const target=e.code==='KeyZ'?(e.shiftKey?'redo':'undo'):e.code==='KeyY'?'redo':null;
        if(target){e.preventDefault();this.root.querySelector('[data-cmd="'+target+'"]')?.click()}
        return;
      }
      if(e.code==='Space'){
        e.preventDefault();
        if(this.spaceTool===null){this.spaceTool=this.tool;this.spacePicked=false;this.setTool('picker')}
        return;
      }
      if(e.code==='Digit0'){e.preventDefault();this.root.querySelector('[data-cmd="center"]')?.click()}
      else if(['Equal','NumpadAdd'].includes(e.code)){e.preventDefault();this.root.querySelector('[data-cmd="in"]')?.click()}
      else if(['Minus','NumpadSubtract'].includes(e.code)){e.preventDefault();this.root.querySelector('[data-cmd="out"]')?.click()}
      else if(byCode[e.code]){e.preventDefault();this.setTool(byCode[e.code])}
    };
    this.keyboardUp=e=>{
      if(e.code==='Space'&&this.spaceTool!==null){
        e.preventDefault?.();
        const old=this.spaceTool,point=this.lastMousePoint,sample=!this.spacePicked&&point&&!this.closed;
        this.spaceTool=null;this.spacePicked=false;this.setTool(old);
        if(sample){
          const rect=this.canvas.getBoundingClientRect();
          if(point.clientX>=rect.left&&point.clientX<rect.right&&point.clientY>=rect.top&&point.clientY<rect.bottom)
            void this.pick(this.point(point),true);
        }
      }
    };
    this.keyboardBlur=()=>{
      if(this.spaceTool!==null){const old=this.spaceTool;this.spaceTool=null;this.spacePicked=false;this.setTool(old)}
      if(this.armPointer!==null)this.armUp({pointerId:this.armPointer,preventDefault(){},stopPropagation(){}});
      // Browsers may drop captured pointers when focus changes or touch scrolling
      // is interrupted. A stale pointer would leave the studio in pinch mode.
      this.finishStroke();this.pointers.clear();this.pinch=null;this.panStart=null;
      this.aimPointer=null;this.aim=null;this.viewportCapturedPointer=null;
      this.viewport.classList.remove('is-panning');
    };
    this.lostCapture=e=>{if(this.pointers.has(e.pointerId))this.up({pointerId:e.pointerId,type:'pointercancel',pointerType:e.pointerType,clientX:e.clientX,clientY:e.clientY})};
    this.canvas.addEventListener('lostpointercapture',this.lostCapture);
    this.viewport.addEventListener('lostpointercapture',this.lostCapture);
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
    this.globalPointerUp=e=>{if(this.pointers.has(e.pointerId))this.up(e)};
    window.addEventListener('pointerup',this.globalPointerUp);
    window.addEventListener('pointercancel',this.globalPointerUp);
    this.resize=()=>{if(!this.pointers.size)this.center()};
    window.addEventListener('resize',this.resize);
  }
 async pick(p,temporary=false){
   try{
     // Allow pending renders to finish before reading the composed painting.
     // Sampling stale pixels was especially visible after undo or switching tools.
     await this.render();
     const x=Math.max(0,Math.min(this.canvas.width-1,Math.floor(p[0]/W*this.canvas.width)));
     const y=Math.max(0,Math.min(this.canvas.height-1,Math.floor(p[1]/H*this.canvas.height)));
     let rgb;
     try{rgb=this.canvas.getContext('2d').getImageData(x,y,1,1).data}catch{}
     if(!rgb||!rgb[3]){
       const img=await loadArtwork(this.id);if(this.closed)return;
       const sample=document.createElement('canvas');sample.width=W*2;sample.height=H*2;
       const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.scale(2,2);
       drawArtwork(ctx,img,this.id);ctx.save();clipZone(ctx,this.zone);
       ctx.fillStyle='#e8ddc6';ctx.fillRect(this.zone.x,this.zone.y,this.zone.w,this.zone.h);
       renderStrokes(ctx,[...this.strokes,...(this.working?[this.working]:[])],this.zone);ctx.restore();
       rgb=ctx.getImageData(Math.min(sample.width-1,Math.floor(p[0]*2)),Math.min(sample.height-1,Math.floor(p[1]*2)),1,1).data;
     }
     if(this.closed||!rgb||!rgb[3])return;
     this.color='#'+[rgb[0],rgb[1],rgb[2]].map(n=>n.toString(16).padStart(2,'0')).join('');this.previewInk=this.color;
     const input=this.root.querySelector('#customColor');if(input)input.value=this.color;
     this.root.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b.dataset.color?.toLowerCase()===this.color));
     if(!temporary)this.setTool('brush');
     this.onChange(this.strokes.length);
   }catch{this.root.querySelector('#drawingTip')?.setAttribute('title','Пипетка не смогла прочитать цвет. Попробуйте ещё раз.');}
 }
 // Two immutable caches: artwork with damage, and committed strokes. A
 // pointermove composites only these layers plus the live gesture. Flood-fill
 // and old strokes never rerun 120 times/second while the mouse is moving.
 async render(){
   if(this.closed)return;
   this.artPromise ||= loadArtwork(this.id).catch(()=>null);
   const img=await this.artPromise;
   if(!img||this.closed)return;
   return new Promise(resolve=>{
     (this.paintWaiters ||= []).push(resolve);
     if(this.paintFrameId)return;
     const frame=()=>{this.paintFrameId=null;this.paintCachedFrame(img);for(const cb of this.paintWaiters.splice(0))cb()};
     this.paintFrameId=typeof requestAnimationFrame==='function'?requestAnimationFrame(frame):setTimeout(frame,16);
   });
 }
 paintCachedFrame(img){
   if(this.closed)return;
   const c=this.canvas,ctx=prepareCanvas(c,true);
   const resized=!this.baseLayer||this.baseLayer.width!==c.width||this.baseLayer.height!==c.height;
   const makeLayer=()=>{
     const layer=document.createElement('canvas');layer.width=c.width;layer.height=c.height;
     const x=layer.getContext('2d');x.setTransform(c.width/W,0,0,c.height/H,0,0);
     x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
     return {canvas:layer,ctx:x};
   };
   if(resized){
     const base=makeLayer(),ink=makeLayer();this.baseLayer=base.canvas;this.inkLayer=ink.canvas;this.inkCtx=ink.ctx;
     drawArtwork(base.ctx,img,this.id);
     this.cachedRevision=-1;
   }
   const rev=this.paintRevision||0;
   if(this.cachedRevision!==rev){
     this.inkCtx.clearRect(0,0,W,H);
     this.inkCtx.fillStyle='#e8ddc6';this.inkCtx.fillRect(0,0,W,H);
     renderStrokes(this.inkCtx,this.strokes,this.zone);
     this.cachedRevision=rev;
   }
   ctx.clearRect(0,0,W,H);
   ctx.drawImage(this.baseLayer,0,0,W,H);
   ctx.save();clipZone(ctx,this.zone);
   ctx.drawImage(this.inkLayer,0,0,W,H);
   ctx.restore();
   if(this.working){
     ctx.save();clipZone(ctx,this.zone);drawStroke(ctx,this.working);ctx.restore();
   }
   ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle='#806950';ctx.lineWidth=1.5;
   damagePath(ctx,this.zone);ctx.stroke();ctx.restore();
 }
 getData(){this.finishStroke();return this.strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p}))}
 clearDraft(){localStorage.removeItem(this.draftKey)}
 dispose(){this.closed=true;
 if(this.paintFrameId){
   if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.paintFrameId);else clearTimeout(this.paintFrameId);
   this.paintFrameId=null;
 }
 for(const cb of this.paintWaiters||[])cb();
 this.paintWaiters=[];
 this.baseLayer=null;this.inkLayer=null;this.inkCtx=null;
 this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('lostpointercapture',this.lostCapture);this.viewport.removeEventListener('lostpointercapture',this.lostCapture);window.removeEventListener('pointerup',this.globalPointerUp);window.removeEventListener('pointercancel',this.globalPointerUp);this.viewport.removeEventListener('wheel',this.wheel);this.viewport.removeEventListener('pointerleave',this.cursorLeave);this.armButton?.removeEventListener('pointerdown',this.armDown);this.armButton?.removeEventListener('pointerup',this.armUp);this.armButton?.removeEventListener('pointercancel',this.armUp);this.armButton?.removeEventListener('lostpointercapture',this.armUp);window.removeEventListener('pointerup',this.armGlobalUp);window.removeEventListener('pointercancel',this.armGlobalUp);this.viewport.removeEventListener('mousedown',this.preventMiddle);this.viewport.removeEventListener('auxclick',this.preventMiddle);this.viewport.removeEventListener('pointerdown',this.frameDown);this.viewport.removeEventListener('pointermove',this.frameMove);this.viewport.removeEventListener('pointerup',this.frameUp);this.viewport.removeEventListener('pointercancel',this.frameUp);this.root.removeEventListener('click',this.actions);this.root.removeEventListener('input',this.slider);window.removeEventListener('blur',this.keyboardBlur);window.removeEventListener('keydown',this.keyboardDown);window.removeEventListener('keyup',this.keyboardUp);window.removeEventListener('resize',this.resize)}
}
