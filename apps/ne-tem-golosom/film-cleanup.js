// Film dialogue removal for "Не тем голосом".
// The same pinned UMX-HQ and SCNet ONNX workers as "Тихий кадр" are reused.
// Only the host prepares a cleaned VIDEO; guests receive the encoded video
// with its soundtrack and never have to rerun neural inference.
import {selectProblemSegments,packProblemSegments,composeSelectivePatches,mixSelectivePatches} from '../tihiy-kadr/selective-scnet.js';
import {extractMp4AAC} from './mp4-audio.js';
export const FILM_RATE=44100;
export const FILM_MODES=Object.freeze([
 {id:'umx',name:'Open-Unmix',detail:'Быстро · основной вариант'},
 {id:'hybrid',name:'Open-Unmix + SCNet',detail:'Точечная SCNet для проблемных мест'},
 {id:'scnet',name:'SCNet',detail:'Обрабатывает всю сцену'}
]);
const aborted=()=>new DOMException('Обработка отменена','AbortError');
export function lowMemoryRecommended(memory,cores){
 return (Number.isFinite(memory)&&memory<=4)||(Number.isFinite(cores)&&cores<=4);
}
export function estimatePreparationTimes(duration,mode,opts={}){
 const e=estimateFilmTimes(duration,opts),neural=e[mode]||e.umx;
 return {neural,encoding:duration,decodeFallback:duration,totalFast:neural+duration,totalSlow:neural+duration*2};
}
function live(signal){if(signal?.aborted)throw aborted()}
export function estimateFilmTimes(duration,{umx90=5,scnet90=150,targetSeconds=10}={}){
 const length=Math.min(90,Math.max(0,Number(duration)||0));
 if(!length)return {umx:0,hybrid:0,scnet:0};
 const umx=length*umx90/90,scnet=length*scnet90/90;
 // SCNet receives ~0.85s context on both sides, plus a gap if two clips.
 const patches=Math.min(length,targetSeconds);
 const extra=Math.min(length,patches+2*(Math.ceil(patches/5))*.85+.5*Math.max(0,Math.ceil(patches/5)-1));
 return {umx,hybrid:umx+extra*scnet90/90,scnet};
}
export function validateFilmMode(mode){
 if(!FILM_MODES.some(x=>x.id===mode))throw Error('Неизвестный режим очистки фильма.');
 return mode;
}
function monoToStereo(pcm){return pcm.length===1?[pcm[0],pcm[0].slice()]:pcm.slice(0,2)}
function createWorkerTask(url,packet,signal,onProgress,{transferInputs=false,worker=null}={}){
 return new Promise((resolve,reject)=>{
  live(signal);
  const w=worker||new Worker(url,{type:'module'});
  let settled=false;
  const finish=(err,result)=>{
   if(settled)return;settled=true;signal?.removeEventListener('abort',stop);
   if(worker){w.onmessage=null;w.onerror=null;w.onmessageerror=null}
   else w.terminate();
   err?reject(err):resolve(result);
  };
  const stop=()=>finish(aborted());
  signal?.addEventListener('abort',stop,{once:true});
  w.onerror=e=>{e.preventDefault();finish(Error('Не удалось запустить звуковую модель: '+(e.message||'ошибка Worker')))};
  w.onmessageerror=()=>finish(Error('Браузер не смог передать данные звуковой модели.'));
  w.onmessage=e=>{
   const p=e.data||{};if(p.id!==packet.id)return;
   if(p.stage==='error')finish(Error('Нейросеть: '+(p.message||'ошибка разделения аудио')));
   else if(p.stage==='done')finish(null,p);
   else if(p.stage==='model'||p.stage==='library'||p.stage==='progress')onProgress(p);
  };
  const payload=transferInputs?packet:{...packet,channels:packet.channels?.map(ch=>ch.slice()),
    base:packet.base?.map(ch=>ch.slice()),vocals:packet.vocals?.map(ch=>ch.slice())};
  const buffers=[...(payload.channels||[]),...(payload.base||[]),...(payload.vocals||[])].map(x=>x.buffer);
  w.postMessage(payload,buffers);
  if(signal?.aborted)stop();
 });
}
async function decodeAudioFromVideo(blob,start,duration,signal,onProgress){
 live(signal);
 let ctx=null;
 try{
  // Try a compressed-audio-only fast path before any whole-file decode.
  // This reads AAC packets from MP4 without decoding video or the entire blob.
  try{
   onProgress({stage:'decode',detail:'Ищем сжатую аудиодорожку MP4 для быстрого извлечения'});
   const fast=await extractMp4AAC(blob,start,duration,{signal,onProgress});
   if(fast)return fast;
  }catch(e){
   if(signal.aborted||e?.name==='AbortError')throw e;
   onProgress({stage:'decode',detail:'Быстрый AAC-декодер недоступен: '+(e.message||'формат')+'. Пробуем резервный способ.'});
  }
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:FILM_RATE});
  // decodeAudioData is substantially faster than realtime capture when the
  // platform accepts the video container. Avoid loading a 512 MiB video
  // into a second decoded buffer on memory-constrained phones.
  if(blob.size<=32*1048576){
   try{
    onProgress({stage:'decode',detail:'Извлекаем звуковую дорожку'});
    const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());live(signal);
    const offline=new OfflineAudioContext(Math.min(2,decoded.numberOfChannels),
     Math.round(duration*FILM_RATE),FILM_RATE);
    const node=offline.createBufferSource();node.buffer=decoded;node.connect(offline.destination);
    node.start(0,start,duration);
    const out=await offline.startRendering();live(signal);
    return monoToStereo(Array.from({length:out.numberOfChannels},(_,i)=>out.getChannelData(i).slice()));
   }catch(e){if(e?.name==='AbortError')throw e}
  }
  // Fallback for MP4 containers that decodeAudioData rejects. Capture from
  // media element in REALTIME, routing silence to the speakers.
  onProgress({stage:'decode',detail:'Резервный захват звука: до '+Math.ceil(duration)+' секунд в реальном времени. Не работа нейросети.'});
  const url=URL.createObjectURL(blob),v=document.createElement('video');
  const samples=Math.round(duration*FILM_RATE),tracks=[new Float32Array(samples),new Float32Array(samples)];
  let processor=null,source=null,read=0;
  try{
   v.src=url;v.preload='auto';v.playsInline=true;v.muted=false;v.volume=1;
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>done(Error('Не удалось декодировать видео.')),18000);
    const done=e=>{clearTimeout(timer);v.onloadedmetadata=null;v.onerror=null;e?reject(e):resolve()};
    v.onloadedmetadata=()=>done();v.onerror=()=>done(Error('Видеодекодер не поддерживает этот файл.'));
    v.load();
   });live(signal);
   if(start>0){
    await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>done(Error('Не удалось перейти к звуковому фрагменту.')),12000);
     const done=e=>{clearTimeout(timer);v.onseeked=null;v.onerror=null;e?reject(e):resolve()};
     v.onseeked=()=>done();v.onerror=()=>done(Error('Ошибка перемотки видео.'));
     v.currentTime=start;
    });
   }
   source=ctx.createMediaElementSource(v);
   processor=ctx.createScriptProcessor(2048,2,2);
   processor.onaudioprocess=e=>{
    if(read>=samples)return;
    const channels=e.inputBuffer.numberOfChannels;
    const count=Math.min(e.inputBuffer.length,samples-read);
    for(let ch=0;ch<2;ch++)tracks[ch].set(e.inputBuffer.getChannelData(Math.min(ch,channels-1)).subarray(0,count),read);
    for(let ch=0;ch<e.outputBuffer.numberOfChannels;ch++)e.outputBuffer.getChannelData(ch).fill(0);
    read+=count;
   };
   source.connect(processor);processor.connect(ctx.destination);
   await ctx.resume();await v.play();
   const deadline=performance.now()+duration*1900+10000;
   while(read<samples){
    live(signal);
    if(performance.now()>deadline||v.ended)break;
    onProgress({stage:'decode',detail:'Извлекаем '+Math.round(100*read/samples)+'% звука'});
    await new Promise(resolve=>setTimeout(resolve,150));
   }
   if(read<samples*.9)throw Error('Не удалось извлечь звуковую дорожку целиком.');
   return tracks;
  }finally{
   v.pause();processor?.disconnect();source?.disconnect();v.removeAttribute('src');v.load();URL.revokeObjectURL(url);
  }
 }finally{await ctx?.close().catch(()=>{})}
}
export async function cleanFilmSound({blob,start,duration,mode='umx',lowMemory=false,signal,onProgress=()=>{}}){
 validateFilmMode(mode);
 if(!(blob instanceof Blob)||!blob.size||!Number.isFinite(start)||start<0||
  !Number.isFinite(duration)||duration<3||duration>90)throw Error('Неверный фильм или длина сцены.');
 live(signal);
 let original=await decodeAudioFromVideo(blob,start,duration,signal,onProgress);
 const nextId=()=>Math.random().toString(36).slice(2);
 async function model(channels,kind,sharedWorker=null){
  onProgress({stage:kind,detail:kind==='scnet'?'SCNet разделяет звук':'Open-Unmix разделяет звук'});
  const response=await createWorkerTask(new URL('../tihiy-kadr/mrx-worker.js',import.meta.url),{
   id:nextId(),channels,chunk:/iPhone|Android/i.test(navigator.userAgent)?5:10,
   kind:kind==='scnet'?'scnet':'umxhq',scnetStep:1
  },signal,onProgress,{worker:sharedWorker});
  live(signal);
  return response;
 }
 const started=performance.now();
 let vocals,times=[],segments=[],packedSeconds=0,clean,buzzLayer;
 if(lowMemory){
  // Keep ONNX allocations bounded on older PCs. The output is accumulated,
  // not 90-second stems and DSP buffers. Regional SCNet retains only the
  // two stem estimates it needs for hotspot selection.
  const length=original[0].length,step=Math.round(FILM_RATE*8),
    blend=Math.round(FILM_RATE*.12),total=Math.ceil(length/step);
  clean=original.map(ch=>new Float32Array(ch.length));
  if(mode==='hybrid'){
   vocals=original.map(ch=>new Float32Array(ch.length));
   buzzLayer=original.map(ch=>new Float32Array(ch.length));
  }
  // One Worker for the entire chunked run: avoid a fresh module/WASM startup
  // every eight seconds, while retaining the bounded per-chunk memory budget.
  const sharedModelWorker=new Worker(new URL('../tihiy-kadr/mrx-worker.js',import.meta.url),{type:'module'});
  try{
  for(let k=0;k<total;k++){
   live(signal);
   const pos=k*step,begin=Math.max(0,pos-blend),end=Math.min(length,(k+1)*step+blend);
   onProgress({stage:'lowmem',detail:'Бережная обработка памяти · отрывок '+(k+1)+' из '+total});
   const cut=original.map(ch=>ch.slice(begin,end));
   const kind=mode==='scnet'?'scnet':'umx';
   const result=await model(cut,kind,sharedModelWorker);
   times.push({name:kind==='umx'?'Open-Unmix':'SCNet',seconds:result.seconds});
   const kept=mode==='hybrid';
   const res=await createWorkerTask(new URL('./film-buzz-worker.js',import.meta.url),{
    id:nextId(),base:cut,vocals:result.stems.vocals,keepStems:kept
   },signal,onProgress,{transferInputs:true});
   for(let ch=0;ch<clean.length;ch++){
    const out=clean[ch],pcm=res.channels[ch],v=res.vocals?.[ch],b=res.artifact?.[ch];
    for(let at=begin;at<end;at++){
     const j=at-begin,fade=k&&at<pos+blend?
      Math.max(0,Math.min(1,(at-(pos-blend))/(2*blend))):1;
     if(k&&at<pos+blend){
      out[at]=out[at]*(1-fade)+pcm[j]*fade;
      if(kept){
       vocals[ch][at]=vocals[ch][at]*(1-fade)+v[j]*fade;
       buzzLayer[ch][at]=buzzLayer[ch][at]*(1-fade)+b[j]*fade;
      }
     }else{
      out[at]=pcm[j];
      if(kept){vocals[ch][at]=v[j];buzzLayer[ch][at]=b[j]}
     }
    }
   }
  }
  }finally{sharedModelWorker.terminate()}
 }else{
 if(mode==='scnet'){
  const sc=await model(original,'scnet');
  vocals=sc.stems.vocals;times.push({name:'SCNet',seconds:sc.seconds});
 }else{
  const umx=await model(original,'umx');
  vocals=umx.stems.vocals;times.push({name:'Open-Unmix',seconds:umx.seconds});
 }
 // Transfer ownership of the long PCM buffers to the DSP worker. The worker
 // reuses the original arrays instead of producing multiple extra copies.
 onProgress({stage:'buzz',detail:'Подавляем металлические остатки голоса'});
 const keepStems=mode==='hybrid';
 const buzz=await createWorkerTask(new URL('./film-buzz-worker.js',import.meta.url),{
  id:nextId(),base:original,vocals,keepStems,keepOriginal:keepStems
 },signal,onProgress,{transferInputs:true});
 live(signal);
 clean=buzz.channels;
 if(keepStems){original=buzz.base;vocals=buzz.vocals;buzzLayer=buzz.artifact}
 }

 if(mode==='hybrid'){
  segments=selectProblemSegments(original,vocals,buzzLayer,{budgetSeconds:12,rate:FILM_RATE});
  if(segments.length){
   const packed=packProblemSegments(original,segments,{rate:FILM_RATE});
   packedSeconds=packed.packedSeconds;
   onProgress({stage:'scnet',detail:'SCNet · '+segments.length+' сложных участков, всего '+Math.round(packedSeconds)+' секунд с контекстом'});
   const sc=await model(packed.packed,'scnet');
   times.push({name:'Точечная SCNet',seconds:sc.seconds});
   const patches=composeSelectivePatches(packed.layout,sc.stems.vocals,vocals,{rate:FILM_RATE});
   mixSelectivePatches(clean,patches,1);
  }else onProgress({stage:'skip',detail:'Остаточного речевого жужжания мало — точечная SCNet не потребовалась'});
 }
 live(signal);
 return {channels:clean,mode,times,segments,packedSeconds,lowMemory,elapsed:(performance.now()-started)/1000};
}
