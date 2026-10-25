// Actual MERL MRX neural model, via the version-pinned audiojs ONNX pipeline.
// The ~31 MB int8 weights are fetched by the library with SHA-256 validation
// and stored in the browser's Cache API; no uploaded media leaves this device.
const LIBRARY='https://esm.sh/@audio/neural-separate@0.7.0?bundle&target=es2022';
self.onmessage=async event=>{
 const {id,channels,chunk}=event.data||{};
 if(!id||!Array.isArray(channels))return;
 try{
  self.postMessage({id,stage:'library',detail:'Подключаем браузерный модуль ONNX…'});
  const packageModule=await import(LIBRARY);
  const separate=packageModule.default||packageModule.separate;
  if(typeof separate!=='function')throw Error('В модуле @audio/neural-separate не найден обработчик разделения.');
  self.postMessage({id,stage:'model',detail:'Проверяем кэш и загружаем MRX (~31 МБ при первом запуске)…'});
  const started=performance.now();
  const result=await separate(channels,{
   sampleRate:44100,model:'mrx',device:'wasm',
   chunk:chunk===10?10:20,overlap:2
  });
  const stems=result?.stems;
  if(!stems||!['dialogue','music','effects'].every(name=>Array.isArray(stems[name])&&stems[name].length))
   throw Error('Модель вернула неполный набор дорожек.');
  const outgoing={};
  const transfer=[];
  for(const name of ['dialogue','music','effects']){
   outgoing[name]=stems[name].map(channel=>{
    const copy=channel instanceof Float32Array?channel:new Float32Array(channel);
    transfer.push(copy.buffer);
    return copy;
   });
  }
  self.postMessage({id,stage:'done',stems:outgoing,seconds:(performance.now()-started)/1000},transfer);
 }catch(error){self.postMessage({id,stage:'error',message:error?.message||String(error)})}
};
