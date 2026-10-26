import {runBenchmark} from './learning-benchmark.mjs';
let running=false,request=0;
self.onmessage=async event=>{
 const message=event.data||{};
 if(message.type==='cancel'){request++;return;}
 if(message.type!=='start'||running)return;
 running=true;const generation=++request;
 const hooks={
  cancelled:()=>generation!==request,
  onProgress:progress=>postMessage({type:'progress',progress}),
  onResult:result=>postMessage({type:'partial',result}),
  yield:()=>new Promise(resolve=>setTimeout(resolve,0))
 };
 try{
  const report=await runBenchmark(message.options,hooks);
  if(generation===request)postMessage({type:'complete',report});
 }catch(error){if(generation===request)postMessage({type:'error',message:String(error.message||error)});}
 finally{running=false;}
};
