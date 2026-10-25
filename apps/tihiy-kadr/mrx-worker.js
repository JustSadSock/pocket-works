// MERL MRX separation with explicit ONNX Runtime wasm assets.
// esm.sh rebundles onnxruntime-web. Its default relative WASM URLs do not
// resolve reliably in Safari, which can report only "Load failed".
// Pin to the unmodified upstream version, independently of the JS bundle.
const LIBRARY='https://esm.sh/@audio/neural-separate@0.7.0?bundle&target=es2022';
const RUNTIME_ASSETS=[
 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
 'https://unpkg.com/onnxruntime-web@1.30.0/dist/'
];
const describe=e=>{
 const detail=e?.message||String(e);
 const cause=e?.cause?.message;
 return (cause&&cause!==detail?detail+' ('+cause+')':detail).slice(0,400);
};
self.onmessage=async event=>{
 const {id,channels,chunk}=event.data||{};
 if(!id||!Array.isArray(channels))return;
 let phase='library';
 const status=(stage,detail)=>{
  phase=stage;self.postMessage({id,stage,detail});
 };
 try{
  status('library','Загружаем модуль разделения…');
  const packageModule=await import(LIBRARY);
  const separate=packageModule.default||packageModule.separate;
  if(typeof separate!=='function')throw Error('В модуле нет функции separate.');
  const isMobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  let lastError;
  for(let i=0;i<RUNTIME_ASSETS.length;i++){
   const wasmPaths=RUNTIME_ASSETS[i];
   try{
    status('model',i?'Повторяем запуск с резервного CDN ONNX…':'Загружаем MRX и ONNX WebAssembly. Первый запуск ~31 МБ.');
    const started=performance.now();
    const result=await separate(channels,{
     sampleRate:44100,model:'mrx',device:'wasm',
     // Safari and iOS need a smaller per-inference allocation.
     chunk:isMobile?Math.min(chunk===20?20:chunk===10?10:5,10):chunk,
     overlap:2,
     wasmPaths,
     progress:({chunk:part,totalChunks})=>{
      if(totalChunks>1)status('model','MRX · фрагмент '+part+' из '+totalChunks);
     }
    });
    const stems=result?.stems;
    if(!stems||!['dialogue','music','effects'].every(name=>Array.isArray(stems[name])&&stems[name].length))
     throw Error('Модель вернула неполные дорожки.');
    const outgoing={},transfer=[];
    for(const name of ['dialogue','music','effects']){
     outgoing[name]=stems[name].map(channel=>{
      const copy=channel instanceof Float32Array?channel:new Float32Array(channel);
      transfer.push(copy.buffer);
      return copy;
     });
    }
    self.postMessage({id,stage:'done',stems:outgoing,seconds:(performance.now()-started)/1000},transfer);
    return;
   }catch(e){
    lastError=e;
    // Retry a failed binary download/initialization, but avoid rerunning the
    // entire neural network after a genuine model or memory computation error.
    if(!/load failed|failed to fetch|fetch failed|networkerror|webassembly|wasm|http (4|5)\d\d|failed to load|failed to initialize/i.test(describe(e)))break;
   }
  }
  throw lastError||Error('Неизвестная ошибка ONNX.');
 }catch(error){
  self.postMessage({id,stage:'error',phase,message:describe(error)});
 }
};
