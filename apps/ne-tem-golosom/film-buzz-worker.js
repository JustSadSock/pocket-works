import {prepareBuzzLayer} from '../tihiy-kadr/artifact-repair.js';
self.onmessage=e=>{
 const {id,base,vocals}=e.data||{};
 try{
  const clean=base.map((channel,ch)=>Float32Array.from(channel,(x,i)=>x-vocals[ch][i]));
  const artifact=prepareBuzzLayer(clean,vocals,part=>self.postMessage({id,stage:'progress',detail:'Подавление жужжания '+Math.round(part*100)+'%'}));
  self.postMessage({id,stage:'done',artifact},artifact.map(ch=>ch.buffer));
 }catch(e){self.postMessage({id,stage:'error',message:e.message||String(e)})}
};
