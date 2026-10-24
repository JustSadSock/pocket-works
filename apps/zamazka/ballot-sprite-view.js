// Decode ONE escrowed five-painting raster. Each of the five ballot cards
// crops the same image; no per-candidate URL, metadata or vector instructions
// reach an observer before the server's verdict.
import {loadArtwork,setArtworkFrame} from './artworks.js';
import {BALLOT_TILE_WIDTH,BALLOT_TILE_HEIGHT,BALLOT_IMAGE_WIDTH,BALLOT_IMAGE_HEIGHT,inspectBallotRaster} from './ballot-raster.js';

export function createAnonymousBallotPainter(data,selected,{
 decode=async source=>new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(img);
  img.onerror=()=>reject(Error('ballot_sprite_load_failed'));
  img.src=source;
 }),
 load=loadArtwork,fit=setArtworkFrame
}={}){
 if(!inspectBallotRaster(data)||!Array.isArray(selected)||selected.length!==5||
    new Set(selected).size!==5)throw Error('invalid_ballot_sprite');
 const image=Promise.resolve().then(()=>decode(data)).then(sprite=>{
  if(sprite?.naturalWidth!==BALLOT_IMAGE_WIDTH||sprite?.naturalHeight!==BALLOT_IMAGE_HEIGHT)
   throw Error('invalid_ballot_sprite_dimensions');
  return sprite;
 });
 return async function renderTile(canvas,id){
  const index=selected.indexOf(id);
  if(index<0)return false;
  const [sprite,original]=await Promise.all([image,load(id)]);
  if(!canvas.isConnected)return false;
  fit(canvas,original);
  // The fixed logical 600×450 painting is displayed in each source's native
  // frame aspect, exactly as the vector restoration editor already does.
  canvas.width=1200;canvas.height=900;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return false;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(sprite,index*BALLOT_TILE_WIDTH,0,BALLOT_TILE_WIDTH,BALLOT_TILE_HEIGHT,
   0,0,canvas.width,canvas.height);
  return true;
 };
}
