// PEREKOS / Universal Art Forge architectural tile renderer.
// A coherent 32px hand-authored masonry material replaces gradients,
// ellipses, procedural brush noise and fake perspective texture.
export const COURT_TILE=32;
export const COURT_SIZE=Object.freeze({width:400,height:620});
export const COURT_TILE_NAMES=Object.freeze(['paver-0','paver-1','paver-2','paver-3','paver-4','paver-5',
  'inlay','edge','buttress-face','buttress-cap','brazier-0','brazier-1']);
const TORCHES=Object.freeze([[57,83],[349,98],[53,526],[351,525]]);
let sheet=null,loadStatus='loading';
let finish;const ready=new Promise(resolve=>{finish=resolve});
if(typeof Image!=='undefined'){
 const sprite=new Image();sprite.decoding='async';
 sprite.onload=()=>{
  if(sprite.naturalWidth===COURT_TILE*COURT_TILE_NAMES.length&&sprite.naturalHeight===COURT_TILE){
   sheet=sprite;loadStatus='ready';
  }else loadStatus='invalid';
  finish(!!sheet);
 };
 sprite.onerror=()=>{loadStatus='error';finish(false)};
 sprite.src=new URL('./assets/court-tiles.png',import.meta.url).href;
}else{loadStatus='unavailable';finish(false)}
export const forgeCourtReady=()=>ready;
export const forgeCourtStatus=()=>loadStatus;
function stamp(ctx,index,x,y,w=32,h=32){
 ctx.drawImage(sheet,index*32,0,32,32,Math.round(x),Math.round(y),Math.round(w),Math.round(h));
}
const block=(ctx,x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
const noise=(n)=>{let x=n|0;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0};
function stoneWall(ctx,w,index){
 if(!w||![w.x,w.y,w.w,w.h].every(Number.isFinite)||w.w<1||w.h<1)return;
 const x=Math.round(w.x),y=Math.round(w.y),width=Math.round(w.w),height=Math.round(w.h);
 // The exact collision wall is authoritative. This is only the backdrop.
 block(ctx,x+4,y+7,width+5,height+6,'#152a24');
 ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();
 for(let xx=0;xx<width;xx+=32)for(let yy=0;yy<height;yy+=32)
  stamp(ctx,8,x+xx,y+yy);
 ctx.restore();
 block(ctx,x-4,y-7,width+8,15,'#172620');
 ctx.save();ctx.beginPath();ctx.rect(x-4,y-7,width+8,15);ctx.clip();
 for(let dx=0;dx<width+8;dx+=32)stamp(ctx,9,x-4+dx,y-8,32,32);
 ctx.restore();
 block(ctx,x-4,y+6,width+8,2,'#1f3128');
 for(let j=0;j<Math.floor(width/15);j++){
  const at=x+4+j*15;
  block(ctx,at,y+7,2,Math.max(4,height-10),'#293d33');
 }
 // Rare asymmetrical broken corners, snapped to the same logical grid.
 if(index%2===0){block(ctx,x+width-10,y-7,8,3,'#405644');block(ctx,x+width-7,y-4,5,2,'#7b886b')}
}
export function renderForgeCourt(walls=[]){
 if(!sheet||typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 // Outer ruins with a readable, dark negative-space perimeter.
 block(c,0,0,400,620,'#111f1c');
 block(c,9,9,382,602,'#1a2b26');
 block(c,15,15,370,590,'#718067');
 block(c,19,19,362,582,'#25392e');
 block(c,23,23,354,574,'#1b2c28');
 c.save();c.beginPath();c.rect(24,24,352,572);c.clip();
 for(let row=0;row<18;row++)for(let col=0;col<11;col++){
  const seed=noise(row*119+col*73+15);
  const idx=seed%6;
  stamp(c,idx,24+col*32,24+row*32);
 }
 // Miniature mineral compass: a sparse inlay, not a huge ring covering
 // the duel and competing with the small 24px playable characters.
 stamp(c,6,184,296);
 for(const [x,y] of [[88,168],[280,424],[56,456],[312,104]])
  if((x+y)%2===0){block(c,x,y,7,2,'#8c9678');block(c,x+3,y+2,2,4,'#53694d')}
 c.restore();
 // Architectural boundary uses one-pixel block seams, never antialiased strokes.
 block(c,23,22,354,3,'#a1a88a');
 block(c,23,596,354,4,'#131f1c');
 block(c,19,20,4,580,'#5f7860');block(c,377,20,4,580,'#405849');
 for(let y=30;y<596;y+=32){
  block(c,18,y,5,3,'#1a2b25');block(c,377,y+12,5,3,'#1a2b25');
 }
 for(let x=24;x<375;x+=32){
  block(c,x,20,3,3,'#324738');block(c,x+16,596,4,3,'#8c9c7b');
 }
 // Real two-wall geometry stays exact, drawn over the carved paver field.
 walls.forEach((w,i)=>stoneWall(c,w,i));
 for(const [x,y] of TORCHES)stamp(c,10,x-16,y-25);
 return canvas;
}
export function drawForgeCourtAtmosphere(ctx,time=0,reduced=false){
 if(!sheet||!ctx?.drawImage)return false;
 ctx.save();ctx.imageSmoothingEnabled=false;
 for(let j=0;j<TORCHES.length;j++){
  const [x,y]=TORCHES[j];
  const phase=reduced?0:Math.floor(time*7+j)%2;
  stamp(ctx,10+phase,x-16,y-25);
  if(!reduced)for(let i=0;i<2;i++){
   const xx=x-3+((i*7+j*3)%9),yy=y-30-((Math.floor(time*12)+i*17+j*8)%24);
   block(ctx,xx,yy,2,2,i===0?'#ffc576':'#e6ac65');
  }
 }
 // Dust is sparse, subdued and moves only by entire native pixel steps.
 if(!reduced)for(let i=0;i<12;i++){
  const x=34+(noise(i*53+71)%327),y=37+((noise(i*97+119)%544+Math.floor(time*(1+i%3)))%544);
  block(ctx,x,y,1,1,'#aab998');
 }
 ctx.restore();
 return true;
}
