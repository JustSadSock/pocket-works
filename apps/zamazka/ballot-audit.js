// Post-reveal, non-punitive pixel audit. A spectator independently replays
// the AUTHORITATIVE vectors revealed by the server and compares them against
// the WebP that was displayed during voting. Never use reports to score,
// ban, or accuse an author: browsers can differ, and a client can lie.
import {BALLOT_IMAGE_WIDTH,BALLOT_IMAGE_HEIGHT,BALLOT_TILE_WIDTH,BALLOT_TILE_HEIGHT,inspectBallotRaster} from './ballot-raster.js';

export const AUDIT_SAMPLE_WIDTH=120;
export const AUDIT_SAMPLE_HEIGHT=90;
export const AUDIT_PATCH_SIZE=15;
export const AUDIT_MAE_LIMIT=28;
export const AUDIT_PATCH_LIMIT=48;

// Compare RGB only. Alpha is flattened into the same Canvas 2D backgrounds
// before sampling; preserve uncertainty if the browser denies readback (CORS).
export function compareAuditPixels(expected,actual,width=AUDIT_SAMPLE_WIDTH,height=AUDIT_SAMPLE_HEIGHT){
 const n=width*height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    expected?.length!==n*4||actual?.length!==n*4)throw Error('invalid_audit_pixels');
 let sum=0,differing=0,worstPatch=0;
 for(let py=0;py<height;py+=AUDIT_PATCH_SIZE){
  for(let px=0;px<width;px+=AUDIT_PATCH_SIZE){
   let patchSum=0,patchPixels=0;
   for(let y=py;y<Math.min(height,py+AUDIT_PATCH_SIZE);y++){
    for(let x=px;x<Math.min(width,px+AUDIT_PATCH_SIZE);x++){
     const pos=(y*width+x)*4;
     const diff=Math.abs(expected[pos]-actual[pos])+
      Math.abs(expected[pos+1]-actual[pos+1])+
      Math.abs(expected[pos+2]-actual[pos+2]);
     sum+=diff;patchSum+=diff;patchPixels++;
     if(diff>=3*45)differing++;
    }
   }
   worstPatch=Math.max(worstPatch,patchSum/(3*patchPixels));
  }
 }
 const mae=Math.round(sum/(3*n)),patch=Math.round(worstPatch);
 return {mae,patch,differing:Math.round(100*differing/n),
  suspect:mae>AUDIT_MAE_LIMIT||patch>AUDIT_PATCH_LIMIT};
}
const unavailable=(reason)=>({status:'unavailable',reason,mae:null,patch:null,differing:null});

// Audit all five slots, since a malicious client could tamper with ANY decoy.
// Do not leak this comparison before the outcome is public.
export async function auditRevealedBallot({
 sprite,selected,assignment,render,doc=typeof document!=='undefined'?document:null,
 decode=async data=>new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>reject(Error('decode'));
  image.src=data;
 })
}={}){
 if(!inspectBallotRaster(sprite)||!Array.isArray(selected)||selected.length!==5||
    new Set(selected).size!==5||!assignment||!selected.includes(assignment.art)||
    !Array.isArray(assignment.strokes)||typeof render!=='function'||!doc)
  return unavailable('invalid_input');
 let image;
 try{image=await decode(sprite)}catch{return unavailable('decode')}
 if(image?.naturalWidth!==BALLOT_IMAGE_WIDTH||image?.naturalHeight!==BALLOT_IMAGE_HEIGHT)
  return unavailable('dimensions');
 const wrapper=doc.createElement('div');
 wrapper.style.cssText='position:fixed;left:-12000px;top:0;width:600px;height:450px;opacity:0;pointer-events:none;overflow:hidden';
 wrapper.setAttribute('aria-hidden','true');
 const canvas=doc.createElement('canvas');
 canvas.style.cssText='display:block;width:600px;height:450px';
 wrapper.appendChild(canvas);
 const sample=doc.createElement('canvas');
 sample.width=AUDIT_SAMPLE_WIDTH;sample.height=AUDIT_SAMPLE_HEIGHT;
 const ctx=sample.getContext('2d',{alpha:false,willReadFrequently:true});
 if(!ctx)return unavailable('canvas');
 doc.body.appendChild(wrapper);
 let worst={mae:0,patch:0,differing:0,suspect:false},failed=null;
 try{
  for(let i=0;i<5;i++){
   const id=selected[i],isRepair=id===assignment.art;
   const ok=await render(canvas,id,isRepair?assignment.variation:0,
    isRepair?assignment.strokes:null,isRepair);
   if(ok!==true){failed='painting';break}
   ctx.clearRect(0,0,sample.width,sample.height);
   ctx.drawImage(canvas,0,0,sample.width,sample.height);
   const expected=ctx.getImageData(0,0,sample.width,sample.height).data;
   ctx.clearRect(0,0,sample.width,sample.height);
   ctx.drawImage(image,i*BALLOT_TILE_WIDTH,0,BALLOT_TILE_WIDTH,BALLOT_TILE_HEIGHT,
    0,0,sample.width,sample.height);
   const actual=ctx.getImageData(0,0,sample.width,sample.height).data;
   const metrics=compareAuditPixels(expected,actual);
   worst={mae:Math.max(worst.mae,metrics.mae),
    patch:Math.max(worst.patch,metrics.patch),
    differing:Math.max(worst.differing,metrics.differing),
    suspect:worst.suspect||metrics.suspect};
   // Release drawing buffers between canvases on memory-constrained devices.
   canvas.width=0;canvas.height=0;
   await Promise.resolve();
  }
 }catch{failed='readback'
 }finally{
  wrapper.remove();canvas.width=0;canvas.height=0;
  sample.width=0;sample.height=0;
 }
 if(failed)return unavailable(failed);
 return {status:worst.suspect?'mismatch':'match',mae:worst.mae,patch:worst.patch,
  differing:worst.differing};
}
