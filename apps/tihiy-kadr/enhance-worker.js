// Independent post-inference DSP worker. ONNX runs once; switching any
// enhancement later requires neither a new network inference nor another FFT.
import {createEnhancementLayers} from './audio-enhance.js';
self.onmessage=e=>{
 const {id,base,vocals}=e.data||{};
 try{
  const started=performance.now();
  const layers=createEnhancementLayers(base,vocals,{
   progress:fraction=>self.postMessage({id,stage:'progress',fraction})
  });
  const transfer=[];
  for(const key of ['spectral','reconstruct','center'])
   for(const channel of layers[key])transfer.push(channel.buffer);
  self.postMessage({id,stage:'done',layers,seconds:(performance.now()-started)/1000},transfer);
 }catch(err){
  self.postMessage({id,stage:'error',message:err?.message||String(err)});
 }
};
