// No production UI hookup. Caller owns progress and cancellation.
import {WORLD_SIZES} from './world.mjs';
export function startGenesisGeneration(seed,options={}, {onProgress=()=>{},mapOnly=false,maxEstimatedBytes=256*1024*1024}={}){
 const spec=WORLD_SIZES[options.worldSize||'standard'],detail=options.experimentalGeography?.detail??4;if(!spec||![2,4,8].includes(detail))throw Error('Invalid generation request');
 const estimatedBytes=(spec.w*detail+1)*(spec.h*detail+1)*100;if(estimatedBytes>maxEstimatedBytes)throw Error('Generation exceeds experimental memory budget');
 const worker=new Worker(new URL('./genesis-generation-worker.mjs',import.meta.url),{type:'module'});let rejectTask,done=false;
 const finish=()=>{if(done)return false;done=true;worker.terminate();return true;};
 const promise=new Promise((resolve,reject)=>{rejectTask=reject;worker.onmessage=e=>{const m=e.data;if(m.stage==='complete'){onProgress('complete');if(finish())resolve({...m,estimatedBytes});}else if(m.stage==='error'){onProgress('error: '+m.message);if(finish())reject(Error(m.message));}else onProgress(m.stage);};worker.onerror=e=>{if(finish())reject(Error(e.message));};onProgress('starting');worker.postMessage({seed,options:{...options,experimentalGeography:options.experimentalGeography||{}},mapOnly});});
 return {promise,cancel(){if(finish())rejectTask(new DOMException('Generation cancelled','AbortError'));},estimatedBytes};
}
