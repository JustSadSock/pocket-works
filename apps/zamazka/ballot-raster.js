// One uniformly encoded raster contains all five suspects. Unlike five
// separate PNGs, there is no MIME type, byte length or network request specific
// to the forged slot. The author renders; PocketNet must escrow/relay this as
// one opaque image and continue computing scores from its own assignments.
//
// NOTE: The author is not a trusted pixel renderer. The server must not accept
// the image as proof of the strokes or use it to compute points.
import {validBallotWebp} from './ballot-webp.js';

export const BALLOT_TILE_WIDTH=600;
export const BALLOT_TILE_HEIGHT=450;
export const BALLOT_IMAGE_WIDTH=3000;
export const BALLOT_IMAGE_HEIGHT=450;
export const BALLOT_RASTER_MAX_CHARS=450000;
export const BALLOT_PART_CHARS=8000;
export const BALLOT_MAX_PARTS=60;
const PREFIX='data:image/webp;base64,';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const inspectBallotRaster=validBallotWebp;
export function ballotRasterChecksum(raster){
 let hash=2166136261;
 for(let i=0;i<raster.length;i++){hash^=raster.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0}
 return hash.toString(16).padStart(8,'0');
}
export function ballotRasterPackets(raster,round,revision,sourceChecksum){
 if(!inspectBallotRaster(raster)||!Number.isInteger(round)||round<1||
    typeof revision!=='string'||!/^r[a-z0-9-]{1,30}$/.test(revision)||
    typeof sourceChecksum!=='string'||!/^[0-9a-f]{8}$/.test(sourceChecksum))throw Error('invalid_ballot_raster');
 const raw=raster.slice(PREFIX.length);
 const parts=Math.ceil(raw.length/BALLOT_PART_CHARS);
 if(parts<1||parts>BALLOT_MAX_PARTS)throw Error('ballot_raster_too_large');
 const checksum=ballotRasterChecksum(raster);
 return Array.from({length:parts},(_,index)=>({
  type:'ballot_chunk',round,revision,checksum,sourceChecksum,index,parts,
  data:raw.slice(index*BALLOT_PART_CHARS,(index+1)*BALLOT_PART_CHARS)
 }));
}
export async function composeBallotRaster(selected,candidate,{
 doc=typeof document!=='undefined'?document:null,render
}={}){
 if(!doc||typeof render!=='function'||!Array.isArray(selected)||selected.length!==5||
   new Set(selected).size!==5||!selected.includes(candidate?.art))
  throw Error('invalid_ballot_composition');
 const wrapper=doc.createElement('div');
 wrapper.setAttribute('aria-hidden','true');
 wrapper.style.cssText='position:fixed;left:-10000px;top:0;width:600px;height:450px;pointer-events:none;opacity:0;overflow:hidden';
 const sheet=doc.createElement('canvas');sheet.width=BALLOT_IMAGE_WIDTH;sheet.height=BALLOT_IMAGE_HEIGHT;
 const ctx=sheet.getContext('2d',{alpha:false});
 if(!ctx)throw Error('ballot_canvas_unavailable');
 ctx.fillStyle='#e8ddc6';ctx.fillRect(0,0,sheet.width,sheet.height);
 doc.body.appendChild(wrapper);
 try{
  for(let i=0;i<selected.length;i++){
   const canvas=doc.createElement('canvas');canvas.style.cssText='display:block;width:600px;height:450px';
   wrapper.appendChild(canvas);
   const id=selected[i],restored=id===candidate.art;
   const ok=await render(canvas,id,restored?candidate.variation:0,
    restored?candidate.strokes||[]:null,restored);
   if(ok!==true)throw Error('ballot_artwork_unavailable');
   ctx.drawImage(canvas,i*BALLOT_TILE_WIDTH,0,BALLOT_TILE_WIDTH,BALLOT_TILE_HEIGHT);
   canvas.remove();
  }
  for(const quality of [.86,.72,.56]){
   const encoded=sheet.toDataURL('image/webp',quality);
   if(inspectBallotRaster(encoded))return encoded;
  }
  throw Error('ballot_raster_encoding_failed');
 }finally{wrapper.remove();sheet.width=0;sheet.height=0}
}
