// Film dialogue removal for "Не тем голосом".
// The same pinned UMX-HQ and SCNet ONNX workers as "Тихий кадр" are reused.
// Only the host prepares a cleaned VIDEO; guests receive the encoded video
// with its soundtrack and never have to rerun neural inference.
import {selectProblemSegments,packProblemSegments,composeSelectivePatches,mixSelectivePatches} from '../tihiy-kadr/selective-scnet.js';
export const FILM_RATE=44100;
export const FILM_MODES=Object.freeze([
 {id:'umx',name:'Open-Unmix',detail:'Быстро · основной вариант'},
 {id:'hybrid',name:'Open-Unmix + SCNet',detail:'Точечная SCNet для проблемных мест'},
 {id:'scnet',name:'SCNet',detail:'Обрабатывает всю сцену'}
]);
const aborted=()=>new DOMException('Обработка отменена','AbortError');
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
function createWorkerTask(url,packet,signal,onProgress){
 return new Promise((resolve,reject)=>{
  live(signal);
  const w=new Worker(url,{type:'module'});
  let settled=false;
  const finish=(err,result)=>{
   if(settled)return;settled=true;signal?.removeEventListener('abort',stop);
   w.terminate();err?reject(err):resolve(result);
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
  const payload={...packet,channels:packet.channels?.map(ch=>ch.slice()),
    base:packet.base?.map(ch=>ch.slice()),vocals:packet.vocals?.map(ch=>ch.slice())};
  const buffers=[...(payload.channels||[]),...(payload.base||[]),...(payload.vocals||[])].map(x=>x.buffer);
  w.postMessage(payload,buffers);
  if(signal?.aborted)stop();
 });
}
async function decodeAudioFromVideo(blob,start,duration,signal,onProgress){
 live(signal);
 const ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:FILM_RATE});
 try{
  // decodeAudioData is substantially faster than realtime capture when the
  // platform accepts the video container. Avoid loading a 512 MiB video
  // into a second decoded buffer on memory-constrained phones.
  if(blob.size<=100*1048576){
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
  onProgress({stage:'decode',detail:'Браузер декодирует звук из видео в реальном времени'});
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
 }finally{await ctx.close().catch(()=>{})}
}
export async function cleanFilmSound({blob,start,duration,mode='umx',signal,onProgress=()=>{}}){
 validateFilmMode(mode);
 if(!(blob instanceof Blob)||!blob.size||!Number.isFinite(start)||start<0||
  !Number.isFinite(duration)||duration<3||duration>90)throw Error('Неверный фильм или длина сцены.');
 live(signal);
 const original=await decodeAudioFromVideo(blob,start,duration,signal,onProgress);
 const nextId=()=>Math.random().toString(36).slice(2);
 async function model(channels,kind){
  onProgress({stage:kind,detail:kind==='scnet'?'SCNet разделяет звук':'Open-Unmix разделяет звук'});
  const response=await createWorkerTask(new URL('../tihiy-kadr/mrx-worker.js',import.meta.url),{
   id:nextId(),channels,chunk:/iPhone|Android/i.test(navigator.userAgent)?5:10,
   kind:kind==='scnet'?'scnet':'umxhq',scnetStep:1
  },signal,onProgress);
  live(signal);
  return response;
 }
 const started=performance.now();
 let vocals,times=[],segments=[],packedSeconds=0;
 if(mode==='scnet'){
  const sc=await model(original,'scnet');
  vocals=sc.stems.vocals;times.push({name:'SCNet',seconds:sc.seconds});
 }else{
  const umx=await model(original,'umx');
  vocals=umx.stems.vocals;times.push({name:'Open-Unmix',seconds:umx.seconds});
 }
 // Predict recurrent high-frequency tonal leftovers even in direct SCNet mode.
 onProgress({stage:'buzz',detail:'Подавляем металлические остатки голоса'});
 const buzz=await createWorkerTask(new URL('./film-buzz-worker.js',import.meta.url),{
  id:nextId(),base:original,vocals
 },signal,onProgress);
 live(signal);
 const clean=original.map((ch,i)=>Float32Array.from(ch,(x,j)=>x-vocals[i][j]+.85*buzz.artifact[i][j]));
 if(mode==='hybrid'){
  segments=selectProblemSegments(original,vocals,buzz.artifact,{budgetSeconds:12,rate:FILM_RATE});
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
 return {channels:clean,mode,times,segments,packedSeconds,elapsed:(performance.now()-started)/1000};
}
