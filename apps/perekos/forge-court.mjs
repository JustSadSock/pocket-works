// PEREKOS / the first selected rune-garden battlefield, built by hand.
// The reference image is NOT shipped or sampled. Stone, borders, ivy,
// inlays and obstacle plaques are authored tiles + integer Canvas pixels.
// Game logic, projectiles, wall rectangles and arena coordinates are untouched.
export const COURT_TILE=32;
export const COURT_SIZE=Object.freeze({width:400,height:620});
export const COURT_TILE_NAMES=Object.freeze([
 'paver-0','paver-1','paver-2','paver-3','paver-4','paver-5',
 'inlay','edge','buttress-face','buttress-cap','brazier-0','brazier-1'
]);
const C=Object.freeze({
 void:'#172b28',seam:'#2d4941',deep:'#294a42',river:'#3a6557',
 riverLite:'#507b67',pale:'#b4b9a4',ivory:'#d0d0b5',
 edge:'#84977f',line:'#819986',moss:'#657e70',leaf:'#9aa998',
 bright:'#f2efd0'
});
let sheet=null,loadStatus='loading',resolveReady;
const ready=new Promise(resolve=>{resolveReady=resolve});
if(typeof Image!=='undefined'){
 const image=new Image();image.decoding='async';
 image.onload=()=>{
  if(image.naturalWidth===384&&image.naturalHeight===32){
   // Permanent atlas recolor: turn acidic green moss into weathered sage,
   // leaving original individual pixels and tile layout intact.
   const canvas=document.createElement('canvas');canvas.width=384;canvas.height=32;
   const c=canvas.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;
   c.drawImage(image,0,0);
   const data=c.getImageData(0,0,384,32);
   for(let i=0;i<data.data.length;i+=4){
    const a=data.data[i+3],red=data.data[i],green=data.data[i+1],blue=data.data[i+2];
    if(a&&green>105&&green>red*1.21&&green>blue*1.09){
     data.data[i]=Math.min(255,red*.8+blue*.2+10);
     data.data[i+1]=Math.min(255,green*.62+red*.38);
     data.data[i+2]=Math.min(255,blue*.65+green*.35);
    }
   }
   c.putImageData(data,0,0);sheet=canvas;loadStatus='ready';
  }
  else loadStatus='invalid';
  resolveReady(!!sheet);
 };
 image.onerror=()=>{loadStatus='error';resolveReady(false)};
 image.src=new URL('./assets/court-tiles.png',import.meta.url).href;
}else{loadStatus='unavailable';resolveReady(false)}
export const forgeCourtReady=()=>ready;
export const forgeCourtStatus=()=>loadStatus;
const rect=(c,x,y,w,h,color)=>{
 c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));
};
// Legacy temporary barrier/mine painter shares the same integer-pixel primitive.
const block=rect;
function stamp(c,index,x,y){
 c.drawImage(sheet,index*32,0,32,32,Math.round(x),Math.round(y),32,32);
}
const hash=n=>{let k=n|0;k^=k<<13;k^=k>>>17;k^=k<<5;return k>>>0};
function carvedDiamond(c,x,y,r,color,step=2){
 // Square pixels and stepped diagonal edges; no antialiasing or path strokes.
 for(let dy=-r;dy<=r;dy+=step){
  const w=r-Math.abs(dy),ww=Math.max(1,Math.round(w));
  rect(c,x-ww,y+dy,ww*2+1,step,color);
 }
}
function inlaidDiamond(c,x,y,large=false){
 if(large){
  carvedDiamond(c,x+2,y+3,54,C.void);
  carvedDiamond(c,x,y,52,C.ivory);
  carvedDiamond(c,x,y,48,C.deep);
  carvedDiamond(c,x,y,43,C.riverLite);
  carvedDiamond(c,x,y,39,C.deep);
  carvedDiamond(c,x,y,29,C.ivory);
  carvedDiamond(c,x,y,25,C.deep);
  carvedDiamond(c,x,y,12,C.river);
  carvedDiamond(c,x,y,9,C.ivory);
  carvedDiamond(c,x,y,5,C.deep);
  rect(c,x-2,y-2,4,4,C.pale);
 }else{
  carvedDiamond(c,x+1,y+2,13,C.void);
  carvedDiamond(c,x,y,12,C.ivory);
  carvedDiamond(c,x,y,9,C.deep);
  carvedDiamond(c,x,y,7,C.edge);
  carvedDiamond(c,x,y,4,C.deep);
 }
}
function masonFloor(c){
 // Floor tiles follow one 32x32 atlas grid; seam lines and moss are in the source.
 rect(c,0,0,400,620,C.void);
 rect(c,6,6,388,608,C.seam);
 rect(c,15,16,370,588,C.riverLite);
 rect(c,31,23,338,574,C.deep);
 c.save();c.beginPath();c.rect(34,25,332,570);c.clip();
 for(let row=0;row<19;row++)for(let col=0;col<11;col++){
  const seed=hash(row*957+col*371+69);
  const mix=seed%20;
  const tile=mix<4?1:mix<7?2:mix<10?4:mix<12?5:mix<15?3:0;
  stamp(c,tile,34+col*32,25+row*32);
 }
 c.restore();
 // Engraved side rails, separate from collision boundaries.
 for(const left of [true,false]){
  const x=left?9:367;
  rect(c,x,22,24,576,C.deep);
  rect(c,x+2,22,2,576,C.edge);
  rect(c,x+20,22,3,576,C.void);
  rect(c,x+5,23,15,574,C.river);
  for(let yy=45;yy<574;yy+=53){
   inlaidDiamond(c,x+12,yy,false);
   rect(c,x+10,yy+19,4,3,C.edge);
   rect(c,x+11,yy+23,2,3,C.ivory);
  }
 }
 // Continuous geometric green watercourse, not a wall or actual hazard.
 rect(c,177,25,46,572,C.deep);
 rect(c,181,25,3,572,C.edge);
 rect(c,217,25,3,572,C.void);
 rect(c,187,25,27,572,C.river);
 rect(c,190,25,2,572,C.riverLite);
 rect(c,34,296,332,29,C.deep);
 rect(c,34,299,332,3,C.edge);
 rect(c,34,319,332,3,C.void);
 rect(c,34,303,332,12,C.river);
 // Diagonal connector is ornament, not geometry. Four arrowhead nodes.
 for(const [x,y,vertical] of [[200,112,true],[200,175,true],[200,445,true],[200,507,true],
                               [66,310,false],[334,310,false]])inlaidDiamond(c,x,y);
 inlaidDiamond(c,200,310,true);
 // The small diamond motifs in the four wings are just floor decoration.
 for(const [x,y] of [[100,310],[300,310],[200,60],[200,560]]){
  rect(c,x-4,y,8,2,C.ivory);
  rect(c,x-1,y-3,2,8,C.edge);
 }
}
function border(c){
 // Calm light lip with four architectural corner posts, mirroring the concept.
 for(const y of [8,593]){
  rect(c,26,y,348,18,C.void);
  rect(c,28,y+2,344,13,C.pale);
  rect(c,30,y+2,340,3,C.ivory);
  rect(c,30,y+12,340,2,C.edge);
  for(let x=36;x<366;x+=32)rect(c,x,y+2,2,13,C.deep);
 }
 for(const x of [6,369]){
  rect(c,x,11,25,598,C.void);
  rect(c,x+3,22,20,576,C.deep);
  rect(c,x+4,22,2,576,C.edge);
  rect(c,x+21,22,2,576,C.void);
 }
 // Restore runic strips over the perpendicular frame.
 for(const x of [11,369])for(let y=61;y<571;y+=56){
  rect(c,x+3,y,14,1,C.edge);
  inlaidDiamond(c,x+10,y+14);
 }
 for(const x of [4,364])for(const y of [4,580]){
  rect(c,x+3,y+3,31,34,C.void);
  rect(c,x,y,32,32,C.edge);
  rect(c,x+3,y+3,26,26,C.pale);
  rect(c,x+5,y+5,22,22,C.river);
  rect(c,x+7,y+7,18,18,C.edge);
  inlaidDiamond(c,x+16,y+16);
 }
 // Moss is concentrated along wet joins, not smeared across combat lanes.
 for(let i=0;i<28;i++){
  const side=i%2===0;
  const x=side?6:357, y=20+(hash(i*71+21)%565);
  stamp(c,i%5===0?11:10,x,y);
 }
 for(let i=0;i<7;i++){const x=25+(hash(i*59+117)%325),top=i%2===0;
  stamp(c,i%3?10:11,x,top?4:568);
 }
}
function reliefWall(c,w,index){
 if(!w||![w.x,w.y,w.w,w.h].every(Number.isFinite)||w.w<1||w.h<1)return;
 const x=Math.round(w.x),y=Math.round(w.y),width=Math.round(w.w),height=Math.round(w.h);
 const artX=x-7,artY=y-9;
 // Exact gameplay collider is untouched; relief is outside/inside it visually.
 rect(c,artX+7,artY+15,width+13,height+1,C.void);
 rect(c,artX+2,artY+5,width+12,height+1,C.deep);
 rect(c,artX,artY+2,width+12,height+3,C.seam);
 rect(c,artX+5,artY+12,width+2,height-1,C.deep);
 rect(c,artX+7,artY+15,width-2,height-7,C.void);
 c.save();c.beginPath();c.rect(artX+4,artY+17,width+4,height-17);c.clip();
 for(let dx=0;dx<width;dx+=32)stamp(c,8,artX+4+dx,artY+16);
 c.restore();
 // Two carved panels strongly echo the supplied first design.
 for(const off of [0,32]){
  const xx=artX+7+off;
  rect(c,xx,artY+15,28,26,C.void);
  rect(c,xx+2,artY+17,24,22,C.river);
  carvedDiamond(c,xx+14,artY+27,9,C.ivory,1);
  carvedDiamond(c,xx+14,artY+27,6,C.deep,1);
  carvedDiamond(c,xx+14,artY+27,3,C.pale,1);
 }
 // Massive horizontal crown, cut from a handmade 32px Forge tile.
 c.save();c.beginPath();c.rect(artX,artY-3,width+13,17);c.clip();
 for(let dx=0;dx<width+20;dx+=32)stamp(c,9,artX+dx,artY-5);
 c.restore();
 rect(c,artX-1,artY-4,width+13,3,C.ivory);
 rect(c,artX-1,artY+8,width+13,3,C.deep);
 rect(c,artX+4,artY+40,width+3,4,C.void);
 // Ivy wraps the upper lip, the base of the block stays collision-readable.
 stamp(c,10,artX-8,artY+1);
 stamp(c,11,artX+width-11,artY-8);
 if(index===0)stamp(c,10,artX+width-27,artY+10);
 else stamp(c,11,artX+5,artY+19);
}
export function renderForgeCourt(walls=[]){
 if(!sheet||typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 masonFloor(c);border(c);
 // Redraw the central cross and diamond inside the frame, after the perimeter.
 // This keeps the middle landmark at the same world coordinate (200,310).
 walls.forEach((w,i)=>reliefWall(c,w,i));
 return canvas;
}
export function drawForgeCourtAtmosphere(ctx,time=0,reduced=false){
 if(!sheet||!ctx?.drawImage)return false;
 // Deliberately restrained: no flame torches in this peaceful overgrown garden.
 if(reduced)return true;
 ctx.save();ctx.imageSmoothingEnabled=false;
 for(let i=0;i<7;i++){
  const x=(i%2?352:35)+(hash(i*37)%11)-5;
  const y=31+((hash(i*97)%534+Math.floor(time*(i%3+1)))%534);
  rect(ctx,x,y,2,2,i%3===0?C.bright:C.leaf);
 }
 ctx.restore();return true;
}
export function drawForgeConstructs(ctx,state,time=0,reduced=false){
 if(!sheet||!ctx?.drawImage)return false;
 ctx.save();ctx.imageSmoothingEnabled=false;
 for(const wall of (state?.barriers||[]).slice(0,20)){
  if(!Number.isFinite(wall.x)||!Number.isFinite(wall.y)||!Number.isFinite(wall.r))continue;
  const r=Math.round(Math.max(5,Math.min(40,wall.r))),x=Math.round(wall.x)-r,y=Math.round(wall.y)-r;
  const size=r*2;
  block(ctx,x+3,y+5,size,size,'#142922');
  ctx.save();ctx.beginPath();ctx.rect(x,y,size,size);ctx.clip();
  for(let dx=0;dx<size;dx+=32)for(let dy=0;dy<size;dy+=32)stamp(ctx,8,x+dx,y+dy);
  ctx.restore();
  block(ctx,x-2,y-4,size+4,6,'#9aa381');block(ctx,x,y+2,size,2,'#20382d');
  block(ctx,x+size-3,y+7,3,size-8,'#213529');
  if(wall.aperture){block(ctx,x+size*.23,y+size*.32,size*.54,size*.28,'#123b36');block(ctx,x+size*.23,y+size*.32,size*.54,3,'#f0d69d');block(ctx,x+size*.23,y+size*.57,size*.54,3,'#f0d69d');block(ctx,x+size*.46,y+size*.27,4,size*.42,'#9fdbc4')}
  // State-based physical cues: who can shoot through a wall, how much runic cover
  // remains and when an inverted aperture returns to its original owner.
  const own=wall.owner===0?'#8bd6e0':'#e9aa83';
  block(ctx,x,y-7,size,2,own);
  if(wall.hp!=null){
   const fraction=Math.max(0,Math.min(1,wall.hp/(wall.warded>0?60:32)));
   block(ctx,x,y+size+2,size,3,'#1b312b');block(ctx,x,y+size+2,Math.round(size*fraction),3,'#cfb78f');
  }
  if(wall.inversionLife>0){
   const pulse=reduced?true:Math.floor(time*9)%2===0;
   if(pulse){block(ctx,x-4,y-4,3,size+8,'#d9cf8c');block(ctx,x+size+1,y-4,3,size+8,'#d9cf8c')}
   block(ctx,x-2,y-11,Math.round((size+4)*Math.min(1,wall.inversionLife/2.2)),3,'#b3c6a0');
  }
 }
 for(const mine of (state?.mines||[]).slice(0,20)){
  if(!Number.isFinite(mine.x)||!Number.isFinite(mine.y))continue;
  const x=Math.round(mine.x),y=Math.round(mine.y);
  block(ctx,x-7,y+5,14,3,'#142820');
  block(ctx,x-7,y-7,14,12,'#172823');
  block(ctx,x-5,y-7,10,4,'#ae8257');block(ctx,x-4,y-2,8,5,'#59493a');
  block(ctx,x-2,y-8,4,6,'#efb978');
  if(!reduced&&Math.floor(time*7+mine.x)%2===0)block(ctx,x-1,y-11,2,3,'#fff0bd');
 }
 ctx.restore();return true;
}
