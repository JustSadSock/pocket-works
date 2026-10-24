// One uniformly encoded raster contains all five suspects. Unlike five
// separate PNGs, there is no MIME type, byte length or network request specific
// to the forged slot. The author renders; PocketNet must escrow/relay this as
// one opaque image and continue computing scores from its own assignments.
//
// NOTE: The author is not a trusted pixel renderer. The server must not accept
// the image as proof of the strokes or use it to compute points.
export const BALLOT_TILE_WIDTH=600;
export const BALLOT_TILE_HEIGHT=450;
export const BALLOT_IMAGE_WIDTH=3000;
export const BALLOT_IMAGE_HEIGHT=450;
export const BALLOT_RASTER_MAX_CHARS=450000;
export const BALLOT_PART_CHARS=8000;
export const BALLOT_MAX_PARTS=60;
const PREFIX='data:image/webp;base64,';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function inspectBallotRaster(raster){
 if(typeof raster!=='string'||!raster.startsWith(PREFIX)||raster.length>BALLOT_RASTER_MAX_CHARS)return false;
 const raw=raster.slice(PREFIX.length);
 if(!raw||raw.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return false;
 const first=raw.slice(0,40);
 let bits=0,value=0,head=[];
 for(const ch of first){
  if(ch==='=')break;
  const n=alphabet.indexOf(ch);if(n<0)return false;
  value=(value<<6)|n;bits+=6;
  if(bits>=8){bits-=8;head.push((value>>>bits)&255);value&=(1<<bits)-1}
 }
 if(head.length<30)return false;
 if(String.fromCharCode(...head.slice(0,4))!=='RIFF'||String.fromCharCode(...head.slice(8,12))!=='WEBP')return false;
 const len=(head[4]|head[5]<<8|head[6]<<16|head[7]<<24)>>>0;
 // A RIFF WebP has an even byte length and no hidden trailing payload.
 const bytes=raw.length/4*3-(raw.endsWith('==')?2:raw.endsWith('=')?1:0);
 if(len+8!==bytes||bytes>337500||bytes<20)return false;
 const chunk=String.fromCharCode(...head.slice(12,16));
 if(head.length<30)return false;
 const chunkSize=(head[16]|head[17]<<8|head[18]<<16|head[19]<<24)>>>0;
 if(chunkSize<5||chunkSize+20>bytes)return false;
 let width=0,height=0;
 if(chunk==='VP8 '){
  if(head[23]!==0x9d||head[24]!==0x01||head[25]!==0x2a)return false;
  width=(head[26]|head[27]<<8)&0x3fff;height=(head[28]|head[29]<<8)&0x3fff;
 }else if(chunk==='VP8L'){
  if(head[20]!==0x2f)return false;
  width=1+(head[21]|(head[22]&63)<<8);
  height=1+((head[22]>>6)|(head[23]<<2)|((head[24]&15)<<10));
 }else if(chunk==='VP8X'){
  width=1+head[24]+(head[25]<<8)+(head[26]<<16);
  height=1+head[27]+(head[28]<<8)+(head[29]<<16);
 }
 return width===BALLOT_IMAGE_WIDTH&&height===BALLOT_IMAGE_HEIGHT;
}
export function ballotRasterChecksum(raster){
 let hash=2166136261;
 for(let i=0;i<raster.length;i++){hash^=raster.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0}
 return hash.toString(16).padStart(8,'0');
}
export function ballotRasterPackets(raster,round,revision){
 if(!inspectBallotRaster(raster)||!Number.isInteger(round)||round<1||
    typeof revision!=='string'||!/^r[a-z0-9-]{1,30}$/.test(revision))throw Error('invalid_ballot_raster');
 const raw=raster.slice(PREFIX.length);
 const parts=Math.ceil(raw.length/BALLOT_PART_CHARS);
 if(parts<1||parts>BALLOT_MAX_PARTS)throw Error('ballot_raster_too_large');
 const checksum=ballotRasterChecksum(raster);
 return Array.from({length:parts},(_,index)=>({
  type:'ballot_chunk',round,revision,checksum,index,parts,
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
