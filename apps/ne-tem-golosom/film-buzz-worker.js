// Post-ONNX tonal cleanup owns its transferred buffers. In the ordinary
// Open-Unmix path it reuses the input Float32Arrays for the cleaned mix,
// and never returns multiple copies of 90-second PCM to the main thread.
import {prepareBuzzLayer} from '../tihiy-kadr/artifact-repair.js';
self.onmessage=e=>{
 const {id,base,vocals,keepStems=false,keepOriginal=false}=e.data||{};
 try{
  if(!Array.isArray(base)||!Array.isArray(vocals)||base.length!==vocals.length||
   base.some((ch,i)=>!(ch instanceof Float32Array)||ch.length!==vocals[i]?.length))
   throw Error('Повреждённые аудиоданные для спектрального фильтра.');
  const diff=base.map((ch,i)=>Float32Array.from(ch,(x,j)=>x-vocals[i][j]));
  const artifact=prepareBuzzLayer(diff,vocals,part=>self.postMessage({
   id,stage:'progress',detail:'Подавление жужжания '+Math.round(part*100)+'%'
  }));
  const channels=keepOriginal?diff:base;
  for(let ch=0;ch<channels.length;ch++){
   const dst=channels[ch],noise=artifact[ch];
   if(keepOriginal)for(let i=0;i<dst.length;i++)dst[i]+=.85*noise[i];
   else for(let i=0;i<dst.length;i++)dst[i]=diff[ch][i]+.85*noise[i];
  }
  const result={id,stage:'done',channels};
  const transfer=channels.map(ch=>ch.buffer);
  if(keepStems){
   result.vocals=vocals;result.artifact=artifact;
   transfer.push(...vocals.map(ch=>ch.buffer),...artifact.map(ch=>ch.buffer));
  }
  if(keepOriginal){result.base=base;transfer.push(...base.map(ch=>ch.buffer))}
  self.postMessage(result,transfer);
 }catch(error){self.postMessage({id,stage:'error',message:error.message||String(error)})}
};
