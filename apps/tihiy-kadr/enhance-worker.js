// Independent post-inference DSP worker. ONNX runs once; switching any
// enhancement later requires neither a new network inference nor another FFT.
import {createEnhancementLayers} from './audio-enhance.js';
import {prepareBuzzLayer,prepareTextureLayer} from './artifact-repair.js';
self.onmessage=e=>{
 const {id,base,vocals}=e.data||{};
 try{
  const started=performance.now();
  const layers=createEnhancementLayers(base,vocals,{
   progress:fraction=>self.postMessage({id,stage:'progress',fraction})
  });
  const clean=base.map((ch,i)=>Float32Array.from(ch,(x,j)=>x-vocals[i][j]));
  const artifact=prepareBuzzLayer(clean,vocals,fraction=>self.postMessage({
   id,stage:'progress',fraction:.55+.4*fraction
  }));
  const preparedTexture=prepareTextureLayer(clean,vocals);
  layers.artifact=artifact;layers.texture=preparedTexture.channels;
  const coverage=preparedTexture.coverage;
  const transfer=[];
  for(const key of ['spectral','reconstruct','center','artifact','texture'])
   for(const channel of layers[key])transfer.push(channel.buffer);
  self.postMessage({id,stage:'done',layers,coverage,seconds:(performance.now()-started)/1000},transfer);
 }catch(err){
  self.postMessage({id,stage:'error',message:err?.message||String(err)});
 }
};
