import {W,H,zoneFor,SHAPE_CORRECTED_ZONE_OFFSET,damagePath,insideDamage,loadArtwork,drawArtwork,setArtworkFrame,artworkAspect} from './artworks.js';
import {zamazkaStore} from './storage.js';
import {floodFillRaster,fillMatchingColorRaster} from './fill-core.js';
import {enclosingContourAt,fillEscapedContour} from './fill-contours.js';
import {brushCursorSVG,getBrushCursorStyle,setBrushCursorStyle} from './brush-cursor.js';
export {floodFillRaster};

// Keep stroke coordinates in the 600×450 logical world, but rasterize on a much
// denser backing buffer. Previously both zoomed desktop editing and the reveal
// stretched a literal 600px canvas; that was the second source of pixelation.
function prepareCanvas(canvas,editor=false,thumbnail=false){
 const screenWidth=canvas.clientWidth||canvas.parentElement?.clientWidth||600;
 const dpr=typeof window==='undefined'?1:Math.max(1,Math.min(3,window.devicePixelRatio||1));
 const desktop=typeof window!=='undefined'&&window.matchMedia('(min-width:900px) and (pointer:fine)').matches;
 const needed=editor?Math.min(3,Math.max(2.5,dpr*1.5)):Math.max(2.7,dpr*1.3,desktop?3.25:2.7);
 // Thumbnails previously used a fixed 480x360 buffer, regardless of retina
 // density or full-screen review size. Render proportionally to actual demand.
 const scale=thumbnail?Math.min(2,Math.max(1,screenWidth*dpr/W*1.2)):
   Math.min(editor?3:4,needed,Math.max(2,3500/W));
 const w=Math.round(W*scale),h=Math.round(H*scale);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const ctx=canvas.getContext('2d');
 ctx.setTransform(scale,0,0,scale,0,0);
 ctx.imageSmoothingEnabled=true;
 ctx.imageSmoothingQuality='high';
 return ctx;
}
function clipZone(ctx,z){damagePath(ctx,z);ctx.clip();}
function dab(ctx,x,y,r,color,alpha=1){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(.12,r),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
export function drawStroke(ctx,stroke,aspect=W/H){
 const pts=stroke.p||[];if(!pts.length)return;
 const size=Number(stroke.s)||8,color=stroke.t==='erase'?'#e8ddc6':stroke.c;
 // Saved points stay in the immutable 600×450 world. Correct pen geometry
 // in presentation space: a round nib must stay round on a portrait painting.
 const correction=(W/H)/Math.max(.1,aspect);
 ctx.save();ctx.scale(correction,1);ctx.strokeStyle=color;ctx.lineWidth=stroke.t==='pencil'?Math.max(.15,size*.4):size;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.globalAlpha=stroke.t==='pencil'?.82:stroke.t==='spray'?.44:1;
 if(stroke.t==='spray'){
  for(let i=0;i<pts.length;i++){const pt=pts[i],index=i+(Number(stroke.offset)||0);for(let j=0;j<6;j++){const angle=((index*13+j*83)%360)*Math.PI/180,rad=(index+j*7)%11/11*size;dab(ctx,pt[0]/correction+Math.cos(angle)*rad,pt[1]+Math.sin(angle)*rad,size*.13,color,.34)}}
 }else{ctx.beginPath();ctx.moveTo(pts[0][0]/correction,pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0]/correction,pts[i][1]);ctx.stroke();dab(ctx,pts[0][0]/correction,pts[0][1],ctx.lineWidth/2,color,ctx.globalAlpha)}
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
// The alpha of the current (possibly smudged) contour protects its visible
// pigment from the bucket while antialiased edges blend with the new colour.
export function preservePaintContours(output,original,walls,changed=null,useWallPigment=false){
 for(let i=0;i<output.length;i+=4){
  // A fill must not recomposite a different (untouched) basin's old edges.
  if(changed&&!changed[i/4])continue;
  const alpha=walls[i+3]/255;
  if(!alpha)continue;
  if(useWallPigment&&alpha<.97){
   // Blend the contour's actual pigment OVER the fresh fill, not the
   // previous beige underpainting. Mixing in beige caused the pale halo.
   for(let ch=0;ch<3;ch++)
    output[i+ch]=Math.round(output[i+ch]*(1-alpha)+walls[i+ch]*alpha);
  }else{
   // Keep the true existing pixel at opaque contour cores, including smudges.
   const keep=alpha*alpha*(3-2*alpha);
   for(let ch=0;ch<3;ch++)
    output[i+ch]=Math.round(output[i+ch]*(1-keep)+original[i+ch]*keep);
  }
 }
}
function fillRegion(lines,paint,zoneMask,p,colour,priority=null){
 const w=lines.canvas.width,h=lines.canvas.height;
 const current=paint.ctx.getImageData(0,0,w,h);
 const inkBefore=new Uint8ClampedArray(current.data);
 const changed=new Uint8Array(w*h);
 const color=[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16));
 // Sample the actual composited canvas, not the opaque wall-mask alpha.
 // A filled tan interior surrounded by black strokes must recolour as one
 // connected area regardless of when/how many gestures painted it.
 const px=Math.floor(p[0]*FILL_SCALE),py=Math.floor(p[1]*FILL_SCALE);
 if(px>=0&&px<w&&py>=0&&py<h){
  const k=(py*w+px)*4,ink=current.data,paper=[232,221,198];
  const isPigment=ink[k+3]>=120&&
   Math.max(Math.abs(ink[k]-paper[0]),Math.abs(ink[k+1]-paper[1]),
    Math.abs(ink[k+2]-paper[2]))>18;
  if(isPigment){
   const painted=fillMatchingColorRaster({
    width:w,height:h,zone:zoneMask,output:current,changed,
    point:[px,py],color
   });
   if(painted){paint.ctx.putImageData(current,0,0);return}
  }
 }
 const apply=walls=>floodFillRaster({
  width:w,height:h,walls,zone:zoneMask,output:current,changed,
  point:[p[0]*FILL_SCALE,p[1]*FILL_SCALE],color
 });
 // The latest closed outline must remain a boundary even when its entire
 // interior is already covered by older opaque brushwork.
 let walls=priority?.walls||lines.ctx.getImageData(0,0,w,h);
 let filled=apply(walls);
 if(priority&&(!filled||fillEscapedContour(changed,w,h,priority.bounds,FILL_SCALE))){
  // A geometrically closed but raster-leaky line cannot repaint other basins.
  current.data.set(inkBefore);
  changed.fill(0);
  walls=lines.ctx.getImageData(0,0,w,h);
  filled=apply(walls);
 }
 if(filled){
  preservePaintContours(current.data,inkBefore,walls.data,changed,true);
  paint.ctx.putImageData(current,0,0);
 }
}

function priorityContourWalls(strokes,end,point,aspect,zoneMask){
 const contour=enclosingContourAt(strokes,end,point,aspect);
 if(!contour)return null;
 const selected=layer();
 // Ignore older pigment inside this outline; preserve newer dividers/erasures.
 for(let i=contour.start;i<end;i++){
  const stroke=strokes[i];
  if(stroke.t==='fill')continue;
  if(stroke.t==='smudge'){
   smudgeStroke(selected.ctx,stroke,0,true,zoneMask,aspect);
  }else if(stroke.t==='erase'){
   selected.ctx.save();selected.ctx.globalCompositeOperation='destination-out';
   drawStroke(selected.ctx,stroke,aspect);selected.ctx.restore();
  }else drawStroke(selected.ctx,stroke,aspect);
 }
 return {walls:selected.ctx.getImageData(0,0,selected.canvas.width,selected.canvas.height),
  bounds:contour.bounds};
}
// Drag colour behind the nib, mixing it with neighbouring pigment.
// Stored strokes stay as compact vectors and replay deterministically.
// Smudge only samples colour from the actual editable cutout. The original
// implementation sampled beige/white pixels outside its irregular boundary,
// then pulled them inside the painting. Mask coverage is held in raster space.
export function smudgeStamp(ctx,x,y,size,dx,dy,mask=false,zoneMask=null,aspect=W/H){
 const widthFull=ctx.canvas.width,heightFull=ctx.canvas.height,scale=heightFull/H;
 const correction=(W/H)/Math.max(.1,aspect);
 const radiusY=Math.min(75,Math.max(3,Math.round(size*scale*.56)));
 const radiusX=Math.max(2,Math.round(radiusY*correction));
 const pullY=Math.max(2,Math.round(radiusY*.34)),pullX=Math.max(1,Math.round(pullY*correction));
 const blurY=Math.max(1,Math.round(radiusY*.10)),blurX=Math.max(1,Math.round(blurY*correction));
 const cx=Math.round(x*widthFull/W),cy=Math.round(y*scale);
 const left=Math.max(0,cx-radiusX-pullX-blurX-2),top=Math.max(0,cy-radiusY-pullY-blurY-2);
 const right=Math.min(widthFull,cx+radiusX+pullX+blurX+3),bottom=Math.min(heightFull,cy+radiusY+pullY+blurY+3);
 if(left>=right||top>=bottom)return;
 const width=right-left,height=bottom-top,pixels=ctx.getImageData(left,top,width,height);
 const src=new Uint8ClampedArray(pixels.data),dst=pixels.data;
 const len=Math.hypot(dx/correction,dy);
 const sx=len?Math.round(dx/correction/len*pullX):0,sy=len?Math.round(dy/len*pullY):0;
 const region=zoneMask?.data||zoneMask;
 const valid=(px,py)=>{
  if(px<0||py<0||px>=widthFull||py>=heightFull)return false;
  return !region||region[(py*widthFull+px)*4+3]>=120;
 };
 // Smudge can touch thousands of pixels each pointer frame. Precompute the
 // five pigment samples once per stamp instead of constructing five nested
 // arrays for every pixel (and allocating a colour vector each iteration).
 const taps=[[-sx,-sy,3],[-sx+blurX,-sy,1],[-sx-blurX,-sy,1],
             [-sx,-sy+blurY,1],[-sx,-sy-blurY,1]];
 const at=(px,py)=>(py*width+px)*4;
 for(let py=Math.max(0,cy-radiusY-top);py<Math.min(height,cy+radiusY+1-top);py++){
  for(let px=Math.max(0,cx-radiusX-left);px<Math.min(width,cx+radiusX+1-left);px++){
   const absX=px+left,absY=py+top;
   if(!valid(absX,absY))continue; // Never smear pigment outside the restored area.
   const dist=Math.hypot((absX-cx)/radiusX,(absY-cy)/radiusY);
   if(dist>=1)continue;
   const weight=.72*Math.pow(1-dist,1.45),i=at(px,py);
   // Ignore invalid taps and renormalize the remaining samples. Never use a
   // fake white/transparent pixel to complete a sample near the cutout edge.
   let sum=0,red=0,green=0,blue=0,alpha=0;
   for(const [ox,oy,k] of taps){
    const xx=absX+ox,yy=absY+oy;
    if(!valid(xx,yy)||xx<left||xx>=right||yy<top||yy>=bottom)continue;
    const a=at(xx-left,yy-top);
    if(mask)alpha+=src[a+3]*k;
    else{red+=src[a]*k;green+=src[a+1]*k;blue+=src[a+2]*k}
    sum+=k;
   }
   if(!sum)continue; // Keep the existing pigment if no valid source exists.
   const remain=1-weight,blend=weight/sum;
   if(mask)dst[i+3]=src[i+3]*remain+alpha*blend;
   else{
    dst[i]=src[i]*remain+red*blend;
    dst[i+1]=src[i+1]*remain+green*blend;
    dst[i+2]=src[i+2]*remain+blue*blend;
   }
  }
 }
 ctx.putImageData(pixels,left,top);
}
export function smudgeStroke(ctx,stroke,from=0,mask=false,zoneMask=null,aspect=W/H){
 const pts=stroke.p||[];if(!pts.length)return;
 const spacing=Math.max(1.4,Math.min(7,stroke.s*.23));
 if(from<=0)smudgeStamp(ctx,pts[0][0],pts[0][1],stroke.s,0,0,mask,zoneMask,aspect);
 for(let i=Math.max(1,from);i<pts.length;i++){
  const prev=pts[i-1],next=pts[i],dx=next[0]-prev[0],dy=next[1]-prev[1];
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/spacing));
  for(let j=1;j<=steps;j++)smudgeStamp(ctx,prev[0]+dx*j/steps,prev[1]+dy*j/steps,stroke.s,dx,dy,mask,zoneMask,aspect);
 }
}
function renderStrokes(ctx,strokes,zone,aspect=W/H,cache=null){
 if(!strokes.some(s=>s.t==='fill'||s.t==='smudge')){
  if(cache)cache.state=null;
  strokes.forEach(s=>drawStroke(ctx,s,aspect));return;
 }
 // A large recoloured area used to rerun EVERY preceding bucket operation
 // on every new brush stroke or fill. Each fill works on a 1200x900 raster:
 // the replay time therefore grew quadratically with the number of fills.
 // Keep the chronological contour and pigment layers for an unchanged
 // committed stroke prefix. A replacement/undo/reordering rebuilds them.
 const prior=cache?.state;
 const append=prior&&prior.zone===zone&&prior.aspect===aspect&&
  prior.strokes.length<=strokes.length&&prior.strokes.every((s,i)=>s===strokes[i]);
 let lines,paint,zoneMask,start=0;
 if(append){
  ({lines,paint,zoneMask}=prior);
  start=prior.strokes.length;
 }else{
  lines=layer();paint=layer();
  const area=layer();
  paint.ctx.fillStyle='#e8ddc6';paint.ctx.fillRect(0,0,W,H);
  area.ctx.fillStyle='#fff';damagePath(area.ctx,zone);area.ctx.fill();
  zoneMask=area.ctx.getImageData(0,0,area.canvas.width,area.canvas.height);
 }
 // The paint and wall masks advance together in stroke order. Raster fills
 // are intentionally NOT barriers for later fills.
 for(let i=start;i<strokes.length;i++){
  const stroke=strokes[i];
  if(stroke.t==='fill'){
   fillRegion(lines,paint,zoneMask,stroke.p[0],stroke.c,
    priorityContourWalls(strokes,i,stroke.p[0],aspect,zoneMask));
   continue;
  }
  if(stroke.t==='smudge'){
   smudgeStroke(paint.ctx,stroke,0,false,zoneMask,aspect);
   smudgeStroke(lines.ctx,stroke,0,true,zoneMask,aspect);
   continue;
  }
  if(stroke.t==='erase'){
   drawStroke(paint.ctx,stroke,aspect);
   lines.ctx.save();lines.ctx.globalCompositeOperation='destination-out';
   drawStroke(lines.ctx,stroke,aspect);lines.ctx.restore();
  }else{drawStroke(paint.ctx,stroke,aspect);drawStroke(lines.ctx,stroke,aspect)}
 }
 if(cache)cache.state={zone,aspect,strokes:strokes.slice(),lines,paint,zoneMask};
 // The damage edge is clipped once on the final artwork.
 ctx.drawImage(paint.canvas,0,0,W,H);
}

export async function renderArtwork(canvas,id,variation=0,strokes=null,damaged=false,thumbnail=false,legacyFrame=false,overlayOnly=false){
 let ctx;
 try{
  const image=await loadArtwork(id);
  if(!canvas.isConnected)return;
  setArtworkFrame(canvas,image,legacyFrame);
  ctx=prepareCanvas(canvas,false,thumbnail);
  ctx.clearRect(0,0,W,H);
  // Voting retains the native-resolution IMG below this transparent repair layer.
  // Re-rasterizing the entire original into CANVAS was making the forgery visibly softer.
  if(!overlayOnly)drawArtwork(ctx,image,id,legacyFrame);
 if(damaged){
  const z=zoneFor(id,variation,legacyFrame?W/H:artworkAspect(image)),overlay=document.createElement('canvas');
  overlay.width=canvas.width;overlay.height=canvas.height;
  const paint=overlay.getContext('2d');
  paint.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  paint.imageSmoothingEnabled=true;paint.imageSmoothingQuality='high';
  paint.fillStyle='#e8ddc6';paint.fillRect(0,0,W,H);
  renderStrokes(paint,strokes||[],z,legacyFrame?W/H:artworkAspect(image));
  // Render one opaque restoration surface, clip its irregular outer contour
  // once. Previous beige+fill+stroke clipping multiplied edge alpha.
  ctx.save();clipZone(ctx,z);ctx.drawImage(overlay,0,0,W,H);ctx.restore();
 }
 return true;
 }catch{
  ctx ||= prepareCanvas(canvas,false,thumbnail);
  ctx.fillStyle='#ddc6aa';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#512d2a';ctx.fillText('Не удалось открыть картину',20,50);
  return false;
 }
}

// A restoration stroke is a continuous gesture. Preserve
// the important bends instead of silently stopping once the buffer fills.
// Endpoints remain untouched, making very long mouse/finger drags uninterrupted.
// Budget compaction is intentionally more conservative than input smoothing:
// never discard a visibly curved corner just to free additional brush points.
// Geometry is expressed in the 600x450 logical canvas, so the tolerance stays
// below a typical brush nib and does not depend on current zoom.
export function simplifyPointsWithinTolerance(points,limit,tolerance=.35){
 if(points.length<=limit)return points.slice();
 const kept=points.slice(),minimum=Math.max(2,Math.floor(limit));
 const allowed=Math.max(0,Number(tolerance)||0);
 while(kept.length>minimum){
  let chosen=-1,minError=Infinity;
  for(let i=1;i<kept.length-1;i++){
   const a=kept[i-1],b=kept[i],c=kept[i+1];
   const dx=c[0]-a[0],dy=c[1]-a[1],length=dx*dx+dy*dy;
   const t=length?Math.max(0,Math.min(1,((b[0]-a[0])*dx+(b[1]-a[1])*dy)/length)):0;
   const error=Math.hypot(b[0]-a[0]-dx*t,b[1]-a[1]-dy*t);
   if(error<minError){minError=error;chosen=i}
  }
  if(chosen<0||minError>allowed)break;
  kept.splice(chosen,1);
 }
 return kept;
}
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
// Snapping a nib just outside an irregular cutout to the nearest inner edge
// lets an opaque stroke cover the antialiased perimeter without changing the
// damage mask or permitting painting on the surrounding original.
export function pointOnDamageEdge(zone,point,tolerance=0){
 if(insideDamage(zone,point))return point;
 if(!zone?.points?.length||!Number.isFinite(tolerance)||tolerance<=0)return null;
 let closest=null,best=tolerance*tolerance;
 for(let i=0;i<zone.points.length;i++){
  const a=zone.points[i],b=zone.points[(i+1)%zone.points.length],dx=b[0]-a[0],dy=b[1]-a[1];
  const den=dx*dx+dy*dy;
  if(!den)continue;
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/den));
  const x=a[0]+dx*t,y=a[1]+dy*t,d=(point[0]-x)**2+(point[1]-y)**2;
  if(d<=best){best=d;closest={x,y,dx,dy,den}}
 }
 if(!closest)return null;
 const n=Math.sqrt(closest.den);
 for(const inset of [.45,1,2]){
  for(const side of [1,-1]){
   const p=[closest.x+side*closest.dy/n*inset,closest.y-side*closest.dx/n*inset];
   if(insideDamage(zone,p))return p;
  }
 }
 return null;
}
// Use the first inner point along an outside-to-inside gesture so the stroke
// starts at the cutout border even when touch events jump several pixels.
export function firstDamageEntry(zone,from,to){
 if(!zone||!from||!to||!insideDamage(zone,to))return null;
 if(insideDamage(zone,from))return from;
 const dx=to[0]-from[0],dy=to[1]-from[1];
 const steps=Math.max(1,Math.min(350,Math.ceil(Math.hypot(dx,dy)/2)));
 let last=0;
 for(let i=1;i<=steps;i++){
  const t=i/steps,p=[from[0]+dx*t,from[1]+dy*t];
  if(insideDamage(zone,p)){
   let lo=last,hi=t;
   for(let j=0;j<10;j++){
    const mid=(lo+hi)/2;
    if(insideDamage(zone,[from[0]+dx*mid,from[1]+dy*mid]))hi=mid;
    else lo=mid;
   }
   const inward=Math.min(1,hi+.7/Math.max(1,Math.hypot(dx,dy)));
   return [from[0]+dx*inward,from[1]+dy*inward];
  }
  last=t;
 }
 return to;
}
// Hit-test real brush pigment, never the beige undercoat.
export function strokeTouchesPoint(stroke,point,aspect=W/H){
 if(!stroke?.p?.length||!Number.isFinite(point?.[0])||!Number.isFinite(point?.[1]))return false;
 if(stroke.t==='fill')return false;
 const correction=(W/H)/Math.max(.1,aspect),width=Number(stroke.s)||8;
 const radius=(stroke.t==='pencil'?Math.max(.15,width*.4):width)/2*(stroke.t==='spray'?2.25:1);
 const px=point[0]/correction,py=point[1];
 for(let i=0;i<stroke.p.length;i++){
  const a=stroke.p[Math.max(0,i-1)],c=stroke.p[i];
  const ax=a[0]/correction,ay=a[1],bx=c[0]/correction,by=c[1];
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  const k=len?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len)):0;
  if(Math.hypot(px-ax-dx*k,py-ay-dy*k)<=radius+.33)return true;
 }
 return false;
}
export const MIN_BRUSH_SIZE=.25,MAX_EDITOR_ZOOM=8;
// Upper bounds match multipart transport and authoritative server validation.
export const MAX_STROKES=768,MAX_STROKE_POINTS=96,MAX_TOTAL_POINTS=24000;
export const isTabletPalmContact=(pointerType,penId)=>pointerType==='touch'&&penId!=null;

// Reject truncated or corrupt autosaves BEFORE they reach Canvas2D and render.
// Both tab-local restoration and IndexedDB migration use the same bounds.
function validSavedDraft(strokes){
 if(!Array.isArray(strokes)||strokes.length>MAX_STROKES)return false;
 let total=0;
 for(const stroke of strokes){
  if(!stroke||!['brush','pencil','spray','erase','fill','smudge'].includes(stroke.t)||
     typeof stroke.c!=='string'||!/^#[0-9a-f]{6}$/i.test(stroke.c)||
     typeof stroke.s!=='number'||!Number.isFinite(stroke.s)||
     stroke.s<MIN_BRUSH_SIZE||stroke.s>48||
     !Array.isArray(stroke.p)||!stroke.p.length||stroke.p.length>MAX_STROKE_POINTS)return false;
  total+=stroke.p.length;
  if(total>MAX_TOTAL_POINTS)return false;
  for(const p of stroke.p){
   if(!Array.isArray(p)||p.length!==2||
      !Number.isFinite(p[0])||!Number.isFinite(p[1])||
      p[0]<0||p[0]>W||p[1]<0||p[1]>H)return false;
  }
 }
 return true;
}

const key='pocket-works:zamazka:draft:';
export class Editor{
 constructor(root,{id,variation=0,round=1,onChange=()=>{},onSound=()=>{},onPersistenceError=()=>{},onPersistenceStatus=()=>{}}){
   this.root=root;this.id=id;this.variation=variation;this.round=round;this.onChange=onChange;this.onSound=onSound;this.onPersistenceError=onPersistenceError;this.onPersistenceStatus=onPersistenceStatus;this.saveGeneration=0;this.persistenceWarned=false;this.zone=zoneFor(id,variation);
   this.canvas=root.querySelector('#paintCanvas');this.viewport=root.querySelector('.viewport');
   this.tool='brush';this.color='#304a43';this.size=12;this.strokes=[];this.redoStack=[];this.working=null;this.edgePaused=false;this.edgeGestureGroup=null;this.outsidePoint=null;this.pointers=new Map();this.activePenPointer=null;this.scale=1.9;this.tx=0;this.ty=0;this.moving=false;this.closed=false;
    this.inputMode=(sessionStorage.getItem('pocket-works:zamazka:input-mode')||localStorage.getItem('pocket-works:zamazka:input-mode'))==='precision'?'precision':'direct';
    this.hand=(sessionStorage.getItem('pocket-works:zamazka:precision-hand')||localStorage.getItem('pocket-works:zamazka:precision-hand'))==='left'?'left':'right';
    this.aimPointer=null;this.aim=null;this.armed=false;this.armPointer=null;this.lastCursor=null;this.lastMousePoint=null;this.spaceTool=null;this.spacePicked=false;this.limitWarned=false;
    this.cursor=root.querySelector('#brushCursor');this.cursorStyle=getBrushCursorStyle();this.cursorInk=null;this.cursorMotion=null;this.cursorIdleTimer=null;this.cursorLiftTimer=null;this.initCursorGraphic();this.root.querySelector('.restore')?.setAttribute('data-active-tool','brush');this.pickerPreview=root.querySelector('#pickerPreview');this.armButton=root.querySelector('#precisionArm');this.sideButton=root.querySelector('#precisionSide');
   this.draftKey=key+id+':'+variation+':'+round;
   try{const stored=JSON.parse(sessionStorage.getItem(this.draftKey)||localStorage.getItem(this.draftKey)||'null');if(validSavedDraft(stored))this.strokes=stored.map(s=>({...s,p:s.p.map(p=>[...p])}))}catch{}
   this.attach();this.setMode(this.inputMode,false);this.center();this.render();
   // Restore only while the editor is untouched: never replace newly drawn strokes.
   void zamazkaStore.migrate('draft:'+this.draftKey,this.draftKey).then(stored=>{
     if(this.closed||this.strokes.length||this.working||!Array.isArray(stored)||stored.length>MAX_STROKES)return;
     if(!this.adoptDraft(stored))return;
     this.render();
   }).catch(()=>{});

 }
 // Fit the *actual* painting into the available stage instead of relying on
 // overlapping 4:3 desktop/mobile width formulas. The viewport is never
 // taller than the stage or wider than its safe touch area.
 fitViewport(aspect=this.frameAspect||W/H){
  const stage=this.root?.querySelector?.('.work-stage');
  if(!stage||!this.viewport||!Number.isFinite(aspect)||aspect<=0)return false;
  const availableWidth=stage.clientWidth-4,availableHeight=stage.clientHeight-4;
  if(availableWidth<20||availableHeight<20)return false;
  const width=Math.max(20,Math.min(availableWidth,availableHeight*aspect));
  const height=width/aspect;
  const oldWidth=parseFloat(this.viewport.style.width),oldHeight=parseFloat(this.viewport.style.height);
  if(Math.abs(oldWidth-width)<.5&&Math.abs(oldHeight-height)<.5)return false;
  this.viewport.style.setProperty('width',width+'px','important');
  this.viewport.style.setProperty('height',height+'px','important');
  this.viewport.style.setProperty('max-height','100%','important');
  this.viewport.style.setProperty('aspect-ratio',String(aspect),'important');
  return true;
 }
 center(animate=false){
  if(animate&&this.canvas.classList){
    clearTimeout(this.recenterTimer);
    this.canvas.classList.add('recentering');
    this.recenterTimer=setTimeout(()=>this.canvas.classList.remove('recentering'),240);
  }
  const w=this.viewport.clientWidth,h=this.viewport.clientHeight||w*.75,z=this.zone;
  this.tx=w/2-(z.x+z.w/2)*w/600*this.scale;
  this.ty=h/2-(z.y+z.h/2)*h/450*this.scale;
  this.transform();
 }
 transform(){this.canvas.style.transform='translate('+this.tx+'px,'+this.ty+'px) scale('+this.scale+')';if(this.lastCursor)this.showCursor(this.lastCursor)}
 zoom(factor,anchorX=this.viewport.clientWidth/2,anchorY=this.viewport.clientHeight/2){const old=this.scale;this.scale=Math.min(MAX_EDITOR_ZOOM,Math.max(1,old*factor));const change=this.scale/old;this.tx=anchorX-(anchorX-this.tx)*change;this.ty=anchorY-(anchorY-this.ty)*change;this.transform()}
 point(e,b=this.canvas.getBoundingClientRect()){return [Math.max(0,Math.min(600,Math.round((e.clientX-b.left)/b.width*6000)/10)),Math.max(0,Math.min(450,Math.round((e.clientY-b.top)/b.height*4500)/10))]}
 inside(p){return insideDamage(this.zone,p)}
 save(){this.schedulePersistence();this.onChange(this.strokes.length)}
  schedulePersistence(){
    clearTimeout(this.persistTimer);
    if(this.persistIdleId&&typeof cancelIdleCallback==='function')cancelIdleCallback(this.persistIdleId);
    this.persistIdleId=null;
    this.persistTimer=setTimeout(()=>{
      this.persistTimer=null;if(this.closed)return;
      if(this.working){this.schedulePersistence();return}
      if(typeof requestIdleCallback==='function'){
        this.persistIdleId=requestIdleCallback(()=>{this.persistIdleId=null;if(this.working){this.schedulePersistence();return}if(!this.closed)this.saveSnapshot()},{timeout:1800});
      }else this.saveSnapshot();
    },260);
  }
  flushPersistence(){
    if(this.persistTimer==null&&this.persistIdleId==null)return;
    clearTimeout(this.persistTimer);this.persistTimer=null;
    if(this.persistIdleId&&typeof cancelIdleCallback==='function')cancelIdleCallback(this.persistIdleId);
    this.persistIdleId=null;this.saveSnapshot();
  }
  getSnapshot(){return [...this.strokes,...(this.working?[this.working]:[])].map(s=>({c:s.c,s:s.s,t:s.t,p:s.p.map(p=>[...p])}))}
  saveSnapshot(){
   const strokes=this.getSnapshot();
    const encoded=JSON.stringify(strokes);
   // Small tab-local recovery first, durable large recovery through IndexedDB.
   try{sessionStorage.setItem(this.draftKey,encoded)}catch{}
   const generation=++this.saveGeneration;
   void zamazkaStore.set('draft:'+this.draftKey,strokes).then(()=>{
     // Only discard the fallback if it still describes the committed version.
     try{if(sessionStorage.getItem(this.draftKey)===encoded)sessionStorage.removeItem(this.draftKey)}catch{}
     this.persistenceWarned=false;
     if(!this.closed&&generation===this.saveGeneration)this.onPersistenceStatus('local');
   }).catch(()=>{
     try{localStorage.setItem(this.draftKey,encoded);if(!this.closed&&generation===this.saveGeneration)this.onPersistenceStatus('offline')}catch{
       if(!this.persistenceWarned){this.persistenceWarned=true;this.onPersistenceError()}
       if(!this.closed&&generation===this.saveGeneration)this.onPersistenceStatus('error');
     }
   });
   return true;
  }
  adoptDraft(strokes){
    if(this.strokes.length||!validSavedDraft(strokes))return false;
    this.strokes=strokes.map(s=>({...s,p:s.p.map(p=>[...p])}));this.recountPoints();this.invalidateInk();this.save();this.render();return true;
  }
  setTool(tool){
    if(!['brush','fill','picker','erase','smudge','hand'].includes(tool))return;
    this.finishStroke();this.edgePaused=false;this.edgeGestureGroup=null;this.outsidePoint=null;this.cursor?.classList?.remove?.('is-idle','is-fast');
    if(this.tool!==tool)this.onSound?.('tool');this.tool=tool;
    this.root.querySelector('.restore')?.setAttribute('data-active-tool',tool);
    this.viewport.classList.toggle('hand-mode',tool==='hand');
    this.viewport.classList.toggle('picker-mode',tool==='picker');
    this.root.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===tool));
     this.updateDrawingTip();
    if(this.lastCursor)this.showCursor(this.lastCursor);
  }

  updateDrawingTip(){
    const tip=this.root.querySelector('#drawingTip');if(!tip)return;
    tip.textContent=this.tool==='smudge'?'Води по мазкам, чтобы мягко смешивать цвета':
      this.inputMode==='precision'?'Наведи кончик и нажми «РИСОВАТЬ», чтобы начать · «СТОП», чтобы закончить':'Рисуй в повреждённой части';
  }

  // Compress only redundant bends to keep long drawing sessions flowing.
  compactStrokeBudget(){
    if(this.strokes.some(s=>s.t==='fill'))return false;
    let changed=false;
    for(const stroke of this.strokes){
      if(stroke.p.length<12)continue;
      const candidate=simplifyPointsWithinTolerance(stroke.p,Math.max(8,Math.floor(stroke.p.length*.77)));
      if(candidate.length<stroke.p.length){stroke.p=candidate;changed=true}
    }
    for(let i=1;i<this.strokes.length;i++){
      const a=this.strokes[i-1],b=this.strokes[i];
      if(a.g&&b.g===a.g&&a.t===b.t&&a.c===b.c&&a.s===b.s&&
         Math.hypot(a.p.at(-1)[0]-b.p[0][0],a.p.at(-1)[1]-b.p[0][1])<.15&&
         a.p.length+b.p.length-1<=MAX_STROKE_POINTS){
        a.p.push(...b.p.slice(1));this.strokes.splice(i--,1);changed=true;
      }
    }
    if(changed){this.recountPoints();this.invalidateInk();this.saveSnapshot()}
    return changed;
  }
  setBrushSize(next){
    const slider=this.root.querySelector('#brushSize');
    const minimum=Number(slider?.min)||.25;
    this.size=Math.max(minimum,Math.min(48,Math.round(next*4)/4));
    if(slider)slider.value=String(this.size);
    if(this.cursor?.dataset)this.cursor.dataset.size=String(this.size).replace('.',',');
    const output=this.root.querySelector('#brushSizeValue');
    if(output)output.textContent=String(this.size).replace('.',',');
    this.updateSizeSample();
    if(this.lastCursor)this.showCursor(this.lastCursor);
  }
  stepBrushSize(direction){
    const size=this.size;
    const step=direction>0
      ?size<2?.25:size<5?.5:size<16?1:size<32?2:4
      :size<=2?.25:size<=5?.5:size<=16?1:size<=32?2:4;
    this.setBrushSize(size+(direction>0?step:-step));
  }
  updateSizeSample(){
    const slider=this.root.querySelector('#brushSize');
    const minimum=Number(slider?.min)||.25;
    const down=this.root.querySelector('[data-cmd="size-down"]');
    const up=this.root.querySelector('[data-cmd="size-up"]');
    if(down)down.disabled=this.size<=minimum;
    if(up)up.disabled=this.size>=48;
    const sample=this.root.querySelector('#sizeSample');
    if(sample){
      const d=Math.max(3,Math.min(26,this.size));
      sample.style.setProperty('--nib',d+'px');
      sample.setAttribute('aria-label','Кисть '+String(this.size));
    }
  }
  countPoints(){if(this.committedPointCount===undefined)this.recountPoints();return this.committedPointCount+(this.working?.p.length||0)}
  recountPoints(){this.committedPointCount=this.strokes.reduce((n,x)=>n+x.p.length,0)}
  invalidateInk(){
    this.paintRevision=(this.paintRevision||0)+1;
    this.pendingInkStrokes=null;this.displayRevision=-1;
    // Raster replay caches compare stroke references. Compaction edits the
    // point arrays in place; the old pigment image must never be reused.
    if(this.inkRasterCache)this.inkRasterCache.state=null;
  }
  beginStroke(p){
    const snapped=pointOnDamageEdge(this.zone,p,Math.min(25,Math.max(2,this.size*.65)));
    if(!snapped){
      // Capture a drag that begins on the unpaintable part of the picture.
      // No mark is stored until the cursor first enters the damage mask.
      this.outsidePoint=p;this.edgePaused=true;
      this.edgeGestureGroup||='gesture-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
      return;
    }
    const entry=this.outsidePoint?firstDamageEntry(this.zone,this.outsidePoint,snapped):null;
    if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS)this.compactStrokeBudget();
    if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS){this.warnLimit();return}
    const pts=entry&&Math.hypot(entry[0]-snapped[0],entry[1]-snapped[1])>.1?[entry,snapped]:[snapped];
    this.working={c:this.color,s:this.size,t:this.tool,p:pts,g:this.edgeGestureGroup||'gesture-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)};
    this.cursorContact(true);
    this.edgePaused=false;this.outsidePoint=null;
    this.redoStack=[];this.onSound?.('brush');this.render();
  }
  queueCommittedInk(stroke){
    this.paintRevision=(this.paintRevision||0)+1;
    if(stroke.t==='fill'||stroke.t==='smudge'||this.hasRasterInk){this.pendingInkStrokes=null;return}
    (this.pendingInkStrokes ||= []).push(stroke);
  }
  warnLimit(){if(!this.limitWarned){this.onChange(-1);this.limitWarned=true}}
  extendStroke(p,drawNow=true){
    if(!this.working)return;
    const snapped=pointOnDamageEdge(this.zone,p,Math.min(25,Math.max(2,this.size*.65)));
    if(!snapped){
     // Lifting the pen outside the damaged fragment must not create an
     // unintended straight line when it re-enters a different border.
     this.edgeGestureGroup=this.working.g;this.finishStroke();this.edgePaused=true;this.outsidePoint=p;return;
    }
    p=snapped;
    const pts=this.working.p,prev=pts[pts.length-1];
    if(Math.hypot(p[0]-prev[0],p[1]-prev[1])<.4)return;
    if(this.countPoints()>=MAX_TOTAL_POINTS-(pts.length>=MAX_STROKE_POINTS?1:0))this.compactStrokeBudget();
    if(this.countPoints()>=MAX_TOTAL_POINTS-(pts.length>=MAX_STROKE_POINTS?1:0)){this.warnLimit();return}
    if(pts.length>=MAX_STROKE_POINTS){
      if(this.strokes.length+1>=MAX_STROKES)this.compactStrokeBudget();
      if(this.strokes.length+1>=MAX_STROKES){this.warnLimit();return}
      const old=this.working;
      this.strokes.push(old);
      // A continuous gesture can span several PocketNet-sized segments.
      // The completed piece is now in this.strokes rather than this.working:
      // invalidate the committed-ink cache immediately, or earlier pieces
      // vanish until pointerup saves the whole gesture.
      this.committedPointCount=(this.committedPointCount??this.strokes.reduce((n,x)=>n+x.p.length,0)-old.p.length)+old.p.length;
      this.queueCommittedInk(old);
      this.working={c:old.c,s:old.s,t:old.t,g:old.g,p:[prev,p]};
    }else pts.push(p);
    if(drawNow)this.render();
  }
  finishStroke(){
    if(!this.working)return;
    const finished=this.working;
    this.strokes.push(finished);this.committedPointCount=(this.committedPointCount??this.strokes.reduce((n,x)=>n+x.p.length,0)-finished.p.length)+finished.p.length;
    this.queueCommittedInk(finished);
    this.working=null;this.cursorContact(false);this.limitWarned=false;
    this.save();this.render();
  }
  // On touch, the precision nib is above the finger, as in Folio.
  tip(e){
    const offset=this.inputMode==='precision'&&e.pointerType==='touch'&&this.tool!=='picker'&&this.tool!=='fill';
    return {clientX:e.clientX+(offset?(this.hand==='left'?18:-18):0),
      clientY:e.clientY-(offset?50:0),pointerType:e.pointerType};
  }
  pointAt(e,bounds){return this.point(this.tip(e),bounds)}

  initCursorGraphic(){
    if(!this.cursor)return;
    this.cursor.innerHTML='<span class="brush-cursor-art" aria-hidden="true"></span><span class="brush-cursor-sparks" aria-hidden="true"></span>';
    this.updateCursorGraphic(true);
  }
  updateCursorGraphic(force=false){
    if(!this.cursor||(!force&&this.cursorInk===this.color))return;
    this.cursorInk=this.color;
    const art=this.cursor.querySelector?.('.brush-cursor-art');
    if(art)art.innerHTML=brushCursorSVG(this.cursorStyle,this.color);
  }
  setCursorStyle(index){
    this.cursorStyle=setBrushCursorStyle(index);
    this.updateCursorGraphic(true);
    if(this.cursor){this.cursor.classList?.remove?.('is-changing');void this.cursor.offsetWidth;this.cursor.classList?.add?.('is-changing')}
    if(this.lastCursor)this.showCursor(this.lastCursor);
  }
  cursorDip(){
    if(!this.cursor)return;
    this.updateCursorGraphic();
    this.cursor.classList?.remove?.('is-dipping');void this.cursor.offsetWidth;this.cursor.classList?.add?.('is-dipping');
  }
  cursorContact(active){
    if(!this.cursor)return;
    clearTimeout(this.cursorLiftTimer);
    this.cursor.classList?.toggle?.('is-pressed',active);
    this.cursor.classList?.remove?.('is-lifted');
    if(!active){
      void this.cursor.offsetWidth;this.cursor.classList?.add?.('is-lifted');
      this.cursorLiftTimer=setTimeout(()=>this.cursor?.classList.remove('is-lifted','is-fast'),370);
    }
  }
  showCursor(e){
    if(!this.cursor)return;
    if(this.pinch||this.panStart||((this.tool==='hand'||this.tool==='fill')&&!this.sizeDrag)){
      this.hideCursor();this.hidePickerPreview();return;
    }
    this.lastCursor=e;
    if(this.tool==='picker'&&!this.sizeDrag){
      this.hideCursor();this.showPickerPreview(e);return;
    }
    this.hidePickerPreview();
    this.updateCursorGraphic();
    this.cursor.classList?.toggle?.('is-brush',this.tool==='brush');
    const tip=this.tip(e),v=this.viewport.getBoundingClientRect(),c=this.canvas.getBoundingClientRect();
    const effectiveSize=this.tool==='pencil'?Math.max(.15,this.size*.4):this.size;
    const diameter=Math.max(2,effectiveSize*c.height/H);
    this.cursor.style.width=diameter+'px';this.cursor.style.height=diameter+'px';
    // Absolutely positioned children start at the viewport padding edge, not its outer border.
   const drawn=this.point(tip,c);
   this.cursor.classList?.toggle?.('is-blocked',Boolean(this.zone)&&!this.inside(drawn));
   const timestamp=typeof performance==='undefined'?Date.now():performance.now();
   const prev=this.cursorMotion;
   const elapsed=prev?Math.max(1,timestamp-prev.time):16;
   const vx=prev?(tip.clientX-prev.x)/elapsed:0;
   const vy=prev?(tip.clientY-prev.y)/elapsed:0;
   this.cursorMotion={x:tip.clientX,y:tip.clientY,time:timestamp};
   this.cursor.style.setProperty('--brush-angle',Math.max(-14,Math.min(14,vx*13+vy*3)).toFixed(2)+'deg');
   this.cursor.classList?.toggle?.('is-fast',(Boolean(this.working)&&Math.hypot(vx,vy)>1.7)||(this.cursor.classList?.contains?.('is-lifted')&&this.cursor.classList?.contains?.('is-fast')));
   const pressure=Number.isFinite(e.pressure)?e.pressure:(this.working?.5:0);
   this.cursor.style.setProperty('--brush-pressure',String(Math.max(.92,1-Math.max(0,pressure)*.08)));
   this.cursor.classList?.remove?.('is-idle');
   clearTimeout(this.cursorIdleTimer);
   if(!this.working)this.cursorIdleTimer=setTimeout(()=>{if(!this.closed&&!this.working)this.cursor?.classList?.add?.('is-idle')},190);
   this.cursor.style.left=c.left+drawn[0]/W*c.width-v.left-this.viewport.clientLeft+'px';
   this.cursor.style.top=c.top+drawn[1]/H*c.height-v.top-this.viewport.clientTop+'px';
    this.cursor.style.setProperty('--brush-ink',this.tool==='erase'?'#e8ddc6':this.tool==='smudge'?'#c6a36d':this.color);
     this.cursor.classList?.toggle?.('is-smudge',this.tool==='smudge');
    this.cursor.hidden=false;
  }
  hideCursor(){clearTimeout(this.cursorIdleTimer);this.cursorMotion=null;if(this.cursor){this.cursor.hidden=true;this.cursor.classList?.remove?.('is-idle','is-fast','is-pressed')}}
 // Only sample pixels actually belonging to the image or user-applied pigment.
 pointOnPainting(e){
  const b=this.canvas.getBoundingClientRect();
  return Number.isFinite(e?.clientX)&&Number.isFinite(e?.clientY)&&
   b.width>0&&b.height>0&&e.clientX>=b.left&&e.clientX<b.right&&
   e.clientY>=b.top&&e.clientY<b.bottom;
 }
 paintedHere(p){
  const aspect=this.frameAspect||W/H;
  const strokes=[...(this.strokes||[]),...(this.working?[this.working]:[])];
  for(let i=strokes.length-1;i>=0;i--){
   const stroke=strokes[i];
   if(stroke.t==='fill'||stroke.t==='smudge')continue;
   if(strokeTouchesPoint(stroke,p,aspect))return stroke.t!=='erase';
  }
  if(strokes.some(stroke=>stroke.t==='fill')&&this.inkLayer?.getContext){
   try{
    const ink=this.inkLayer,rgba=ink.getContext('2d',{willReadFrequently:true}).getImageData(
     Math.min(ink.width-1,Math.floor(p[0]/W*ink.width)),
     Math.min(ink.height-1,Math.floor(p[1]/H*ink.height)),1,1).data;
    if(rgba[3]&&Math.max(Math.abs(rgba[0]-232),Math.abs(rgba[1]-221),Math.abs(rgba[2]-198))>5)return true;
   }catch{}
  }
  return false;
 }
 canPick(p){
  if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||
    p[0]<0||p[0]>=W||p[1]<0||p[1]>=H)return false;
  return !this.zone||!insideDamage(this.zone,p)||this.paintedHere(p);
 }
 hidePickerPreview(){if(this.pickerPreview)this.pickerPreview.hidden=true}
  showPickerPreview(e){
    const sample=this.pickerPreview;if(!sample)return;
    if(!this.pointOnPainting(e)){sample.hidden=true;return}
    const source=this.pointAt(e);
    if(!this.canPick(source)){sample.hidden=true;return}
    const v=this.viewport.getBoundingClientRect(),
      x=e.clientX-v.left-this.viewport.clientLeft,y=e.clientY-v.top-this.viewport.clientTop;
    sample.style.left=Math.max(24,Math.min(this.viewport.clientWidth-24,x+19))+'px';
    sample.style.top=Math.max(30,Math.min(this.viewport.clientHeight-18,y-29))+'px';
    if(!this.lastPickerTick||Date.now()-this.lastPickerTick>45){
      this.lastPickerTick=Date.now();
      try{
        const p=source;
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
    if(persist){try{localStorage.setItem('pocket-works:zamazka:input-mode',this.inputMode);sessionStorage.removeItem('pocket-works:zamazka:input-mode')}catch{try{sessionStorage.setItem('pocket-works:zamazka:input-mode',this.inputMode)}catch{}}}
    const precision=this.inputMode==='precision';
    this.root.querySelector('.restore')?.classList.toggle('precision-mode',precision);
    this.root.querySelector('.restore')?.classList.toggle('left-hand',this.hand==='left');
    this.armed=false;this.armPointer=null;
    if(this.armButton){
     this.armButton.hidden=!precision;this.armButton.classList.remove('is-armed');
     this.armButton.setAttribute('aria-pressed','false');
     this.armButton.querySelector('strong').textContent='УДЕРЖИВАЙ';
    }
    if(this.sideButton)this.sideButton.hidden=!precision;
    const switcher=this.root.querySelector('[data-cmd="precision"]');
    if(switcher){switcher.setAttribute('aria-pressed',String(precision));switcher.setAttribute('aria-label',precision?'Выключить точное перо':'Включить точное перо');switcher.setAttribute('title',precision?'Обычное рисование':'Точное перо: смещённый кончик');switcher.querySelector('span').textContent=precision?'Точное':'Прямое'}
    const tip=this.root.querySelector('#drawingTip');
    if(tip)this.updateDrawingTip();
    if(!precision){this.aimPointer=null;this.aim=null}
    this.updatePrecisionHelp();
    if(this.lastCursor)this.showCursor(this.lastCursor);
  }
  updatePrecisionHelp(){
    const help=this.root.querySelector('#precisionHelp');
    if(help)help.textContent=this.armed
     ?'Кнопка удерживается · веди вторым пальцем по картине.'
     :'Наводи пальцем по картине. Для мазка удерживай кнопку другим пальцем.';
  }
  attach(){
    this.down=e=>{
      if(this.variation>=SHAPE_CORRECTED_ZONE_OFFSET&&!this.nativeFrameReady)return;
      // Tablet palm rejection: an incidental hand contact must never convert
      // an active stylus stroke into a two-finger pinch, silently cancelling ink.
      if(isTabletPalmContact(e.pointerType,this.activePenPointer))return;
      if(e.pointerType==='pen'){
        if(this.activePenPointer!==null&&this.activePenPointer!==e.pointerId)
          this.up({pointerId:this.activePenPointer,pointerType:'pen',type:'pointercancel'});
        if(this.pointers.size){
          this.finishStroke();this.pointers.clear();this.pinch=null;this.panStart=null;
          this.edgePaused=false;this.edgeGestureGroup=null;this.outsidePoint=null;
        }
        this.activePenPointer=e.pointerId;
      }
      if(e.pointerType==='mouse'||e.pointerType==='pen')this.lastMousePoint={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
      if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1&&e.button!==2)return;
      e.preventDefault();
      if(e.pointerType==='mouse'&&e.button===2){
        this.finishStroke();
        this.sizeDrag={pointerId:e.pointerId,startX:e.clientX,startSize:this.size};
        try{(e.target===this.canvas?this.canvas:this.viewport).setPointerCapture(e.pointerId)}catch{}
        if(e.target===this.viewport)this.viewportCapturedPointer=e.pointerId;
        this.cursor?.classList?.add?.('is-sizing');
        this.showCursor(e);
        return;
      }
      try{(e.target===this.canvas?this.canvas:this.viewport).setPointerCapture(e.pointerId)}catch{}
      this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
      if(e.target===this.viewport)this.viewportCapturedPointer=e.pointerId;
      if(this.pointers.size>1){
        this.finishStroke();this.edgePaused=false;this.edgeGestureGroup=null;this.outsidePoint=null;this.aimPointer=null;this.aim=null;
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
      if(this.tool==='picker'){if(this.spaceTool!==null)this.spacePicked=true;if(this.pointOnPainting(e))void this.pick(p,this.spaceTool!==null);return}
      if(this.tool==='fill'){
        const target=pointOnDamageEdge(this.zone,p,3);
        if(!target)return;
        if(this.strokes.length>=MAX_STROKES||this.countPoints()>=MAX_TOTAL_POINTS){this.warnLimit();return}
        this.strokes.push({c:this.color,s:this.size,t:'fill',p:[target]});this.onSound?.('fill');
        this.redoStack=[];this.committedPointCount=(this.committedPointCount??0)+1;this.invalidateInk();this.save();this.render();return;
      }
      if(this.inputMode==='precision'&&e.pointerType==='touch'){
        this.aimPointer=e.pointerId;this.aim={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
        if(this.armed)this.beginStroke(p);
        return;
      }
      this.lastGesturePoint=p;
      this.beginStroke(p);
    };
    this.move=e=>{
      if(this.sizeDrag?.pointerId===e.pointerId){
        e.preventDefault?.();
        this.setBrushSize(this.sizeDrag.startSize+(e.clientX-this.sizeDrag.startX)*.16);
        this.showCursor(e);
        return;
      }
      if(e.pointerType==='mouse'||e.pointerType==='pen')this.lastMousePoint={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
      if(!this.pointers.has(e.pointerId)){
        if(e.pointerType==='mouse'||e.pointerType==='pen')this.showCursor(e);
        return;
      }
      e.preventDefault();this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
      if(this.pointers.size>1&&this.pinch){
        const pp=[...this.pointers.values()],dist=Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1])||1;
        this.scale=Math.max(1,Math.min(MAX_EDITOR_ZOOM,this.pinch.z*dist/Math.max(10,this.pinch.d)));
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
      if(this.working||this.edgePaused){
        const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
        const canvasBounds=this.canvas.getBoundingClientRect();
        let previous=this.lastGesturePoint,changed=false;
        for(const sample of (events.length?[...events.slice(-23),e]:[e])){
         const end=this.pointAt(sample,canvasBounds);
         const crossesEdge=previous&&(!this.inside(previous)||!this.inside(end));
         const length=previous?Math.hypot(end[0]-previous[0],end[1]-previous[1]):0;
         const steps=crossesEdge?Math.min(70,Math.max(1,Math.ceil(length/2))):1;
         for(let i=1;i<=steps;i++){
          const point=previous?[previous[0]+(end[0]-previous[0])*i/steps,previous[1]+(end[1]-previous[1])*i/steps]:end;
          if(this.working){this.extendStroke(point,false);changed=true}
          else if(this.edgePaused){this.beginStroke(point);changed=true}
         }
         previous=end;
        }
        this.lastGesturePoint=previous;
        if(changed)this.render();
      }
    };
    this.up=e=>{
      if(this.activePenPointer===e.pointerId)this.activePenPointer=null;
      if(this.sizeDrag?.pointerId===e.pointerId){
        this.sizeDrag=null;
        if(this.viewportCapturedPointer===e.pointerId)this.viewportCapturedPointer=null;
        this.cursor?.classList?.remove?.('is-sizing');
        if(e.type==='pointercancel')this.hideCursor();
        else this.showCursor(e);
        return;
      }
      if(!this.pointers.has(e.pointerId))return;
      if(e.type==='pointerup'&&this.working&&this.pointers.size===1&&this.inputMode!=='precision')this.extendStroke(this.pointAt(e));
      this.pointers.delete(e.pointerId);
      if(this.viewportCapturedPointer===e.pointerId)this.viewportCapturedPointer=null;
      if(this.pointers.size<2)this.pinch=null;
      this.finishStroke();this.edgePaused=false;this.edgeGestureGroup=null;this.outsidePoint=null;this.lastGesturePoint=null;
      if(this.aimPointer===e.pointerId){this.aimPointer=null;this.aim=null}
      this.panStart=null;this.viewport.classList.remove('is-panning');
      if(!this.pointers.size&&this.pendingViewportFit)this.resize();
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
    this.frameDown=e=>{if(e.target===this.viewport&&e.pointerType==='mouse'&&(e.button===1||e.button===2))this.down(e)};
    this.frameMove=e=>{if(this.viewportCapturedPointer===e.pointerId)this.move(e);else if(e.target===this.viewport&&(e.pointerType==='mouse'||e.pointerType==='pen'))this.showCursor(e)};
    this.frameUp=e=>{if(this.viewportCapturedPointer===e.pointerId)this.up(e)};
    this.viewport.addEventListener('pointerdown',this.frameDown);
    this.viewport.addEventListener('pointermove',this.frameMove);
    this.viewport.addEventListener('pointerup',this.frameUp);
    this.viewport.addEventListener('pointercancel',this.frameUp);
    this.cursorLeave=e=>{if(!this.pointers.size&&(e.pointerType==='mouse'||e.pointerType==='pen')){this.lastCursor=null;this.hideCursor();this.hidePickerPreview()}};
    this.viewport.addEventListener('pointerleave',this.cursorLeave);
    // Two-finger precision: the resting finger only aims; the other must
    // KEEP HOLDING the arm button to produce ink. No persistent latch.
    this.setArmState=active=>{
      const next=Boolean(active&&this.inputMode==='precision');
      if(!next&&this.armed)this.finishStroke();
      this.armed=next;
      if(this.armButton){
        this.armButton.classList.toggle('is-armed',next);
        this.armButton.setAttribute('aria-pressed',String(next));
        this.armButton.querySelector('strong').textContent=next?'РИСУЮ':'УДЕРЖИВАЙ';
      }
      this.updatePrecisionHelp();
    };
    this.armDown=e=>{
      if(this.inputMode!=='precision'||this.armPointer!==null)return;
      if(e.pointerType==='mouse'&&e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      this.armPointer=e.pointerId;
      try{this.armButton.setPointerCapture(e.pointerId)}catch{}
      this.setArmState(true);
      if(this.aim&&this.aimPointer!==null&&this.pointers.size===1&&!this.working)
        this.beginStroke(this.pointAt(this.aim));
    };
    this.armUp=e=>{
      if(this.armPointer!==e.pointerId)return;
      e.preventDefault?.();e.stopPropagation?.();
      this.armPointer=null;
      this.setArmState(false);
      if(this.armButton?.hasPointerCapture?.(e.pointerId)){
        try{this.armButton.releasePointerCapture(e.pointerId)}catch{}
      }
    };
    this.armButton?.addEventListener('pointerdown',this.armDown);
    this.armButton?.addEventListener('pointerup',this.armUp);
    this.armButton?.addEventListener('pointercancel',this.armUp);
    this.armButton?.addEventListener('lostpointercapture',this.armUp);
    this.armContext=e=>e.preventDefault();
    this.armButton?.addEventListener('contextmenu',this.armContext);
    this.armGlobalUp=e=>{if(this.armPointer===e.pointerId)this.armUp(e)};
    window.addEventListener('pointerup',this.armGlobalUp);
    window.addEventListener('pointercancel',this.armGlobalUp);
    this.preventMiddle=e=>{if(e.button===1||e.button===2)e.preventDefault()};
    this.preventRightMenu=e=>e.preventDefault();
    this.viewport.addEventListener('contextmenu',this.preventRightMenu);
    this.viewport.addEventListener('mousedown',this.preventMiddle);
    this.viewport.addEventListener('auxclick',this.preventMiddle);
    this.wheel=e=>{
      e.preventDefault();
      if(e.altKey){
        const minSize=Number(this.root.querySelector('#brushSize')?.min)||1;
        const delta=(this.size<=2?.25:this.size<=5?.5:1)*Math.max(1,Math.round(Math.abs(e.deltaY)/70))*(e.deltaY<0?1:-1);
        this.size=Math.max(minSize,Math.min(48,Math.round((this.size+delta)*4)/4));
        const slider=this.root.querySelector('#brushSize');
        if(slider)slider.value=String(this.size);
        const sizeLabel=this.root.querySelector('#brushSizeValue');if(sizeLabel)sizeLabel.textContent=String(this.size).replace('.',',');
        this.updateSizeSample();
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
      if(b.dataset.color){this.onSound?.('tool');this.color=b.dataset.color;this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b));this.cursorDip();if(this.lastCursor)this.showCursor(this.lastCursor)}
      if(b.dataset.cmd==='precision')this.setMode(this.inputMode==='precision'?'direct':'precision');
      if(b.dataset.cmd==='handedness'){
        this.hand=this.hand==='right'?'left':'right';
        try{localStorage.setItem('pocket-works:zamazka:precision-hand',this.hand);sessionStorage.removeItem('pocket-works:zamazka:precision-hand')}catch{try{sessionStorage.setItem('pocket-works:zamazka:precision-hand',this.hand)}catch{}}
        this.root.querySelector('.restore')?.classList.toggle('left-hand',this.hand==='left');
        b.setAttribute('aria-label','Кнопка рисования '+(this.hand==='left'?'справа':'слева'));
        if(this.lastCursor)this.showCursor(this.lastCursor);
      }
      if(b.dataset.cmd==='undo'&&(this.strokes.length||this.working)){
        this.finishStroke();
        const tail=this.strokes.pop(),group=[tail];
        if(tail.g)while(this.strokes.length&&this.strokes[this.strokes.length-1].g===tail.g)group.unshift(this.strokes.pop());
        this.redoStack.push(group);this.recountPoints();this.invalidateInk();this.onSound?.('undo');this.save();this.render();
      }
      if(b.dataset.cmd==='redo'&&this.redoStack.length){
        this.finishStroke();
        const group=this.redoStack.pop();
        this.strokes.push(...group);this.recountPoints();this.invalidateInk();this.onSound?.('tool');this.save();this.render();
      }
      if(b.dataset.cmd==='in')this.zoom(1.3);
      if(b.dataset.cmd==='out')this.zoom(.77);
      if(b.dataset.cmd==='center')this.center(true);
    };
    this.keyboardDown=e=>{
      if(this.closed||e.target?.matches?.('input,textarea,select,[contenteditable]')||
         document.querySelector('#dialog:not(.hidden)')||e.altKey||e.metaKey)return;
      const byCode={KeyB:'brush',KeyF:'fill',KeyI:'picker',KeyE:'erase',KeyS:'smudge',KeyH:'hand'};
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
      this.finishStroke();this.edgePaused=false;this.edgeGestureGroup=null;this.outsidePoint=null;
      this.pointers.clear();this.activePenPointer=null;this.pinch=null;this.panStart=null;this.sizeDrag=null;
      this.cursor?.classList?.remove?.('is-sizing');
      this.aimPointer=null;this.aim=null;this.viewportCapturedPointer=null;
      this.viewport.classList.remove('is-panning');
    };
    this.lostCapture=e=>{if(this.pointers.has(e.pointerId)||this.sizeDrag?.pointerId===e.pointerId)this.up({pointerId:e.pointerId,type:'pointercancel',pointerType:e.pointerType,clientX:e.clientX,clientY:e.clientY})};
    this.canvas.addEventListener('lostpointercapture',this.lostCapture);
    this.viewport.addEventListener('lostpointercapture',this.lostCapture);
    this.persistOnHide=()=>{if(document.visibilityState==='hidden')this.flushPersistence()};
     document.addEventListener?.('visibilitychange',this.persistOnHide);
     window.addEventListener('blur',this.keyboardBlur);
    window.addEventListener('keydown',this.keyboardDown);
    window.addEventListener('keyup',this.keyboardUp);
    this.root.addEventListener('click',this.actions);
    // Pointerdown changes the brush immediately: touch clicks may be delayed
    // or suppressed by WebKit. Keyboard-triggered clicks remain supported.
    this.sizeStepPress=e=>{
      if(e.button!==0||e.currentTarget.disabled)return;
      e.preventDefault();
      const button=e.currentTarget;
      this.sizeStepRelease({pointerId:this.sizeStepPointer});
      this.sizeStepPointer=e.pointerId;
      this.sizeStepButton=button;
      try{button.setPointerCapture(e.pointerId)}catch{}
      const direction=button.dataset.cmd==='size-up'?1:-1;
      this.stepBrushSize(direction);
      this.sizeStepDelay=setTimeout(()=>{
        this.sizeStepDelay=null;
        this.sizeStepInterval=setInterval(()=>{
          if(this.closed||button.disabled||this.sizeStepPointer!==e.pointerId){
            clearInterval(this.sizeStepInterval);this.sizeStepInterval=null;return;
          }
          this.stepBrushSize(direction);
        },110);
      },380);
    };
    this.sizeStepRelease=e=>{
      if(this.sizeStepPointer==null||this.sizeStepPointer!==e.pointerId)return;
      clearTimeout(this.sizeStepDelay);
      clearInterval(this.sizeStepInterval);
      this.sizeStepDelay=null;this.sizeStepInterval=null;
      this.sizeStepPointer=null;this.sizeStepButton=null;
    };
    this.sizeStepKeyboardClick=e=>{
      if(e.detail!==0||e.currentTarget.disabled)return;
      this.stepBrushSize(e.currentTarget.dataset.cmd==='size-up'?1:-1);
    };
    this.sizeStepButtons=[...this.root.querySelectorAll('.brush-size-control .size-step')];
    for(const button of this.sizeStepButtons){
      button.addEventListener('pointerdown',this.sizeStepPress);
      button.addEventListener('click',this.sizeStepKeyboardClick);
      button.addEventListener('lostpointercapture',this.sizeStepRelease);
    }
    window.addEventListener('pointerup',this.sizeStepRelease);
    window.addEventListener('pointercancel',this.sizeStepRelease);
    this.slider=e=>{
      if(e.target.id==='brushSize'){
        const value=Number(e.target.value),min=Number(e.target.min)||1;
        this.size=Math.min(48,Math.max(min,Math.round(value*4)/4));
        const sizeLabel=this.root.querySelector('#brushSizeValue');if(sizeLabel)sizeLabel.textContent=String(this.size).replace('.',',');
        this.updateSizeSample();
      }
      if(e.target.id==='customColor'){
        this.color=e.target.value;
        this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.remove('active'));
        this.cursorDip();
      }
      if(this.lastCursor)this.showCursor(this.lastCursor);
    };
    this.root.addEventListener('input',this.slider);
    this.retryArtworkOnOnline=()=>{
      if(this.closed||!this.artRetryAfter)return;
      this.artRetryAfter=0;clearTimeout(this.artRetryTimer);this.artRetryTimer=null;
      void this.render();
    };
    window.addEventListener('online',this.retryArtworkOnOnline);
    this.globalPointerUp=e=>{if(this.pointers.has(e.pointerId)||this.sizeDrag?.pointerId===e.pointerId||this.activePenPointer===e.pointerId)this.up(e)};
    window.addEventListener('pointerup',this.globalPointerUp);
    window.addEventListener('pointercancel',this.globalPointerUp);
    this.resize=()=>{
      if(this.closed)return;
      if(this.pointers.size){this.pendingViewportFit=true;return}
      this.pendingViewportFit=false;
      if(this.fitViewport())this.center();
    };
    this.orientationChanged=()=>{
      if(this.closed)return;
      // A tablet rotation can discard pointerup and leave the editor in a
      // stale pinch/painting gesture. Finish that stroke before refitting.
      this.keyboardBlur();
      this.resize();
      clearTimeout(this.orientationFitTimer);
      this.orientationFitTimer=setTimeout(()=>this.resize(),280);
    };
    window.addEventListener('resize',this.resize);
    window.addEventListener('orientationchange',this.orientationChanged);
    window.visualViewport?.addEventListener('resize',this.resize);
    globalThis.screen?.orientation?.addEventListener?.('change',this.orientationChanged);
    if(typeof ResizeObserver!=='undefined'){
      this.frameObserver=new ResizeObserver(()=>{
        if(this.closed||!this.frameAspect)return;
        if(this.pointers.size){this.pendingViewportFit=true;return}
        if(this.fitViewport())this.center();
      });
      const stage=this.root.querySelector('.work-stage');
      if(stage)this.frameObserver.observe(stage);
    }
  }
 async pick(p,temporary=false){
   const ticket=this.pickTicket=(this.pickTicket||0)+1;
   if(!this.canPick(p))return;
   try{
     // Allow pending renders to finish before reading the composed painting.
     // Sampling stale pixels was especially visible after undo or switching tools.
     await this.render();
     if(this.closed||ticket!==this.pickTicket||!this.canPick(p))return;
     const x=Math.max(0,Math.min(this.canvas.width-1,Math.floor(p[0]/W*this.canvas.width)));
     const y=Math.max(0,Math.min(this.canvas.height-1,Math.floor(p[1]/H*this.canvas.height)));
     let rgb;
     try{rgb=this.canvas.getContext('2d').getImageData(x,y,1,1).data}catch{}
     if(!rgb||!rgb[3]){
       const img=await loadArtwork(this.id);if(this.closed||ticket!==this.pickTicket)return;
       const sample=document.createElement('canvas');sample.width=W*2;sample.height=H*2;
       const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.scale(2,2);
       drawArtwork(ctx,img,this.id);ctx.save();clipZone(ctx,this.zone);
       ctx.fillStyle='#e8ddc6';ctx.fillRect(this.zone.x,this.zone.y,this.zone.w,this.zone.h);
       renderStrokes(ctx,[...this.strokes,...(this.working?[this.working]:[])],this.zone,artworkAspect(img));ctx.restore();
       rgb=ctx.getImageData(Math.min(sample.width-1,Math.floor(p[0]*2)),Math.min(sample.height-1,Math.floor(p[1]*2)),1,1).data;
     }
     if(this.closed||ticket!==this.pickTicket||!this.canPick(p)||!rgb||!rgb[3])return;
     this.color='#'+[rgb[0],rgb[1],rgb[2]].map(n=>n.toString(16).padStart(2,'0')).join('');this.previewInk=this.color;this.cursorDip();
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
   if(!this.artPromise){
     if(this.artRetryAfter&&Date.now()<this.artRetryAfter)return;
     this.artPromise=loadArtwork(this.id).catch(()=>{
       // A failed image request must never poison this Editor for its lifetime.
       this.artPromise=null;
       if(this.closed)return null;
       this.artRetryAfter=Date.now()+3200;
       const tip=this.root.querySelector('#drawingTip');
       if(tip)tip.textContent='Картина загружается повторно · рисунок сохранён';
       clearTimeout(this.artRetryTimer);
       this.artRetryTimer=setTimeout(()=>{this.artRetryTimer=null;if(!this.closed)void this.render()},3300);
       return null;
     });
   }
   const img=await this.artPromise;
   if(!img||this.closed)return;
   if(this.artRetryAfter){this.artRetryAfter=0;clearTimeout(this.artRetryTimer);this.artRetryTimer=null;this.updateDrawingTip()}
   if(!this.nativeFrameReady){
     if(this.variation>=SHAPE_CORRECTED_ZONE_OFFSET)this.zone=zoneFor(this.id,this.variation,artworkAspect(img));
     this.nativeFrameReady=true;
     setArtworkFrame(this.canvas,img);
     this.frameAspect=artworkAspect(img);
     this.fitViewport(this.frameAspect);
     this.center();
   }
   return new Promise(resolve=>{
     (this.paintWaiters ||= []).push(resolve);
     if(this.paintFrameId)return;
     const frame=()=>{
      this.paintFrameId=null;
      try{if(!this.closed)this.paintCachedFrame(img)}
      finally{for(const cb of this.paintWaiters.splice(0))cb()}
    };
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
     this.smudgePreviewLayer=null;
     this.smudgePreviewWorking=null;
     this.smudgeZoneMask=null;
     this.displayLayer=null;this.liveLayer=null;this.liveInkWorking=null;
     this.pendingInkStrokes=null;
   }
   const rev=this.paintRevision||0;
   if(this.cachedRevision!==rev){
     const pending=this.pendingInkStrokes;
     const canAppend=this.cachedRevision>=0&&!this.hasRasterInk&&Array.isArray(pending)&&pending.length===rev-this.cachedRevision;
     if(canAppend){for(const stroke of pending)drawStroke(this.inkCtx,stroke,artworkAspect(img))}
     else{
       this.inkCtx.clearRect(0,0,W,H);
       this.inkCtx.fillStyle='#e8ddc6';this.inkCtx.fillRect(0,0,W,H);
       renderStrokes(this.inkCtx,this.strokes,this.zone,artworkAspect(img),
         (this.inkRasterCache ||= {}));
     }
     this.hasRasterInk=this.strokes.some(stroke=>stroke.t==='fill'||stroke.t==='smudge');
     this.pendingInkStrokes=[];this.cachedRevision=rev;this.displayRevision=-1;
   }
   // Composite immutable work once per committed revision, never for every pointer sample.
   if(!this.displayLayer||this.displayLayer.width!==c.width||this.displayRevision!==rev){
     const composed=makeLayer();composed.ctx.drawImage(this.baseLayer,0,0,W,H);
     composed.ctx.save();clipZone(composed.ctx,this.zone);
     composed.ctx.drawImage(this.inkLayer,0,0,W,H);composed.ctx.restore();
     this.displayLayer=composed.canvas;this.displayRevision=rev;
   }
   ctx.clearRect(0,0,W,H);ctx.drawImage(this.displayLayer,0,0,W,H);
   if(this.working){
     ctx.save();clipZone(ctx,this.zone);
     if(this.working.t==='smudge'){
       // Reuse one backing surface; mix only new points as the nib moves.
       let preview=this.smudgePreviewLayer;
       if(!preview||preview.canvas.width!==c.width||preview.canvas.height!==c.height)
         preview=this.smudgePreviewLayer=makeLayer();
       if(this.smudgePreviewWorking!==this.working||this.smudgePreviewRevision!==rev){
         preview.ctx.clearRect(0,0,W,H);
         preview.ctx.drawImage(this.inkLayer,0,0,W,H);
         this.smudgePreviewWorking=this.working;
         this.smudgePreviewRevision=rev;
         this.smudgePreviewPointCount=0;
       }
       if(!this.smudgeZoneMask){
         const zoneLayer=makeLayer();zoneLayer.ctx.fillStyle='#fff';damagePath(zoneLayer.ctx,this.zone);zoneLayer.ctx.fill();
         this.smudgeZoneMask=zoneLayer.ctx.getImageData(0,0,c.width,c.height);
       }
       const from=this.smudgePreviewPointCount||0;
       if(this.working.p.length>from){
         smudgeStroke(preview.ctx,this.working,from,false,this.smudgeZoneMask,artworkAspect(img));
         this.smudgePreviewPointCount=this.working.p.length;
       }
       ctx.drawImage(preview.canvas,0,0,W,H);
     }else{
        let live=this.liveLayer;
        if(!live||live.canvas.width!==c.width||live.canvas.height!==c.height)live=this.liveLayer=makeLayer();
        if(this.liveInkWorking!==this.working||this.liveInkRevision!==rev){
          live.ctx.clearRect(0,0,W,H);this.liveInkWorking=this.working;this.liveInkRevision=rev;this.livePointCount=0;
        }
        const pts=this.working.p;
        if(pts.length>this.livePointCount){
          const start=Math.max(0,this.livePointCount-1);
          drawStroke(live.ctx,{...this.working,p:pts.slice(start),offset:start},artworkAspect(img));
          this.livePointCount=pts.length;
        }
        ctx.drawImage(live.canvas,0,0,W,H);
      }
     ctx.restore();
   }
   // No dashed guide: the parchment cutout itself shows the editable area.
   // Keep clipZone above so tools still affect only the damage mask.
 }
 getData(){this.finishStroke();return this.strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p}))}
 clearDraft(){try{localStorage.removeItem(this.draftKey)}catch{}try{sessionStorage.removeItem(this.draftKey)}catch{}void zamazkaStore.remove('draft:'+this.draftKey).catch(()=>{})}
 dispose(){this.flushPersistence();this.closed=true;clearTimeout(this.artRetryTimer);clearTimeout(this.orientationFitTimer);window.removeEventListener('online',this.retryArtworkOnOnline);window.removeEventListener('orientationchange',this.orientationChanged);window.visualViewport?.removeEventListener('resize',this.resize);globalThis.screen?.orientation?.removeEventListener?.('change',this.orientationChanged);clearTimeout(this.sizeStepDelay);clearInterval(this.sizeStepInterval);for(const button of this.sizeStepButtons||[]){button.removeEventListener('pointerdown',this.sizeStepPress);button.removeEventListener('click',this.sizeStepKeyboardClick);button.removeEventListener('lostpointercapture',this.sizeStepRelease);}window.removeEventListener('pointerup',this.sizeStepRelease);window.removeEventListener('pointercancel',this.sizeStepRelease);document.removeEventListener?.('visibilitychange',this.persistOnHide);clearTimeout(this.cursorIdleTimer);clearTimeout(this.cursorLiftTimer);this.frameObserver?.disconnect();clearTimeout(this.recenterTimer);
 if(this.paintFrameId){
   if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.paintFrameId);else clearTimeout(this.paintFrameId);
   this.paintFrameId=null;
 }
 for(const cb of this.paintWaiters||[])cb();
 this.paintWaiters=[];
 this.baseLayer=null;this.inkLayer=null;this.inkCtx=null;this.displayLayer=null;this.liveLayer=null;this.smudgePreviewLayer=null;this.smudgePreviewWorking=null;this.smudgeZoneMask=null;
 this.inkRasterCache=null;
 this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('lostpointercapture',this.lostCapture);this.viewport.removeEventListener('lostpointercapture',this.lostCapture);window.removeEventListener('pointerup',this.globalPointerUp);window.removeEventListener('pointercancel',this.globalPointerUp);this.viewport.removeEventListener('wheel',this.wheel);this.viewport.removeEventListener('pointerleave',this.cursorLeave);this.armButton?.removeEventListener('pointerdown',this.armDown);this.armButton?.removeEventListener('pointerup',this.armUp);this.armButton?.removeEventListener('pointercancel',this.armUp);this.armButton?.removeEventListener('lostpointercapture',this.armUp);this.armButton?.removeEventListener('contextmenu',this.armContext);window.removeEventListener('pointerup',this.armGlobalUp);window.removeEventListener('pointercancel',this.armGlobalUp);this.viewport.removeEventListener('mousedown',this.preventMiddle);this.viewport.removeEventListener('auxclick',this.preventMiddle);this.viewport.removeEventListener('contextmenu',this.preventRightMenu);this.viewport.removeEventListener('pointerdown',this.frameDown);this.viewport.removeEventListener('pointermove',this.frameMove);this.viewport.removeEventListener('pointerup',this.frameUp);this.viewport.removeEventListener('pointercancel',this.frameUp);this.root.removeEventListener('click',this.actions);this.root.removeEventListener('input',this.slider);window.removeEventListener('blur',this.keyboardBlur);window.removeEventListener('keydown',this.keyboardDown);window.removeEventListener('keyup',this.keyboardUp);window.removeEventListener('resize',this.resize)}
}
