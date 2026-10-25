import {RATE,MAX_SECONDS,validRange,mixPCM,wavPCM16,elapsed,safeName} from './audio-utils.js';
const $=id=>document.getElementById(id),video=$('result-video'),audio=$('monitor');
const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||
 (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let sourceVideo=$('source-video');
let file=null,fileURL='',audioURL='',length=0,range=null,original=null,stems=null,inferenceTime=0;
let worker=null,abort=null,serial=0,exporting=false,editTimer=null,mode='clean',fileName='video';
const text=(id,msg)=>$(id).textContent=String(msg),show=(id,on)=>$(id).classList.toggle('hidden',!on);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),revoke=url=>{if(url)URL.revokeObjectURL(url)};
function error(msg){text('error',msg);show('error',true)}
function clearError(){show('error',false)}
function uiBusy(active){$('process-btn').disabled=active||!file||!length;$('file-input').disabled=active;$('start-seconds').disabled=active;$('duration-seconds').disabled=active;$('chunk-size').disabled=active;show('progress-wrap',active)}
function step(title,detail='',ratio=null){text('progress-heading',title);text('progress-detail',detail);if(ratio===null)$('progress-bar').removeAttribute('value');else $('progress-bar').value=ratio}
function pause(){video.pause();sourceVideo.pause();audio.pause()}
function reset(){
 pause();revoke(audioURL);audioURL='';audio.removeAttribute('src');audio.load();
 video.removeAttribute('src');video.load();original=null;stems=null;range=null;
 show('result-details',false);show('empty-state',true);text('result-state','Ожидание обработки');text('export-status','');
}
function cancel(){
 serial++;worker?.terminate();worker=null;abort?.abort();abort=null;
 uiBusy(false);step('Остановлено','Можно обработать файл повторно.');
}
function metadata(v){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>done(Error('Не удалось открыть видео за 15 секунд.')),15000);
  const yes=()=>done(),no=()=>done(Error('Неподдерживаемый видеокодек или повреждённый файл.'));
  function done(err){clearTimeout(timer);v.removeEventListener('loadedmetadata',yes);v.removeEventListener('error',no);err?reject(err):resolve()}
  v.addEventListener('loadedmetadata',yes);v.addEventListener('error',no);
 });
}
async function choose(f){
 if(!f)return;
 if(exporting)return error('Дождись завершения сохранения видео.');
 if(worker)cancel();reset();clearError();length=0;
 if(f.size>512*1048576)return error('Тестовый лимит исходного видео — 512 МиБ.');
 if(!f.size)return error('Невозможно обработать пустой файл.');
 file=f;fileName=safeName(f.name);uiBusy(true);
 try{
  revoke(fileURL);fileURL=URL.createObjectURL(f);
  const loaded=metadata(sourceVideo);
  sourceVideo.src=fileURL;sourceVideo.load();await loaded;
  let actualDuration=sourceVideo.duration;
  if(!Number.isFinite(actualDuration)){
   // MediaRecorder often emits WebM without a duration header. The browser
   // discovers its last timestamp when it seeks beyond the end.
   await seek(sourceVideo,1e8);
   actualDuration=Number.isFinite(sourceVideo.duration)?sourceVideo.duration:sourceVideo.currentTime;
   await seek(sourceVideo,0);
  }
  if(!Number.isFinite(actualDuration)||actualDuration<1)throw Error('Браузер не смог определить длительность этого видео.');
  length=actualDuration;
  $('start-seconds').value='0';$('duration-seconds').value=String(Math.round(Math.min(20,length)*10)/10);
  text('file-detail',f.name+' · '+(f.size/1048576).toFixed(1)+' МиБ');
  text('range-note','Всего '+elapsed(length)+'. Обработка одного фрагмента: 1–90 секунд.');
  show('input-details',true);
 }catch(e){error(e.message);file=null;length=0;show('input-details',false)}
 finally{uiBusy(false)}
}
$('file-input').addEventListener('change',e=>{void choose(e.target.files?.[0]);e.target.value=''});
const drop=$('drop-zone');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging')});
drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');void choose([...e.dataTransfer.files].find(f=>f.type.startsWith('video/')||/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)))});
async function seek(v,time){
 if(Math.abs(v.currentTime-time)<.04&&v.readyState>=2)return;
 return await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>done(Error('Не удалось перемотать видео.')),12000);
  const yes=()=>done(),no=()=>done(Error('Ошибка видеодекодера.'));
  function done(e){clearTimeout(timeout);v.removeEventListener('seeked',yes);v.removeEventListener('error',no);e?reject(e):resolve()}
  v.addEventListener('seeked',yes);v.addEventListener('error',no);v.currentTime=time;
 });
}
async function decode(selected,signal){
 step('Извлекаем звук','Пробуем быстрое декодирование MP4 / WebM.');
 const ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:RATE});
 try{
  const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
  if(signal.aborted)throw new DOMException('Прервано','AbortError');
  if(!buffer.numberOfChannels||!buffer.length)throw Error('Нет звуковых дорожек.');
  const offline=new OfflineAudioContext(Math.min(2,buffer.numberOfChannels),Math.floor(selected.duration*RATE),RATE);
  const node=offline.createBufferSource();node.buffer=buffer;node.connect(offline.destination);
  node.start(0,selected.start,selected.duration);
  const out=await offline.startRendering();
  return Array.from({length:out.numberOfChannels},(_,i)=>out.getChannelData(i).slice());
 }finally{await ctx.close().catch(()=>{})}
}
async function capture(selected,signal){
 step('Читаем звук напрямую из видео','Резервный режим: захват займёт реальное время фрагмента.');
 const ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:RATE});
 const pieces=[[],[]],size=Math.floor(selected.duration*RATE);let count=0,node=null,processor=null;
 try{
  await seek(sourceVideo,selected.start);
  node=ctx.createMediaElementSource(sourceVideo);
  processor=ctx.createScriptProcessor(4096,2,2);node.connect(processor);processor.connect(ctx.destination);
  sourceVideo.muted=false;
  processor.onaudioprocess=e=>{
   const n=Math.min(e.inputBuffer.length,Math.max(0,size-count));
   for(let i=0;i<2;i++){
    if(n)pieces[i].push(e.inputBuffer.getChannelData(Math.min(i,e.inputBuffer.numberOfChannels-1)).slice(0,n));
    e.outputBuffer.getChannelData(i).fill(0);
   }
   count+=n;
  };
  await ctx.resume();await sourceVideo.play();
  const deadline=performance.now()+selected.duration*1800+5000;
  while(count<size){
   if(signal.aborted)throw new DOMException('Прервано','AbortError');
   if(sourceVideo.ended||performance.now()>deadline)break;
   step('Извлекаем аудио','Захвачено '+elapsed(count/RATE)+' из '+elapsed(selected.duration),count/size);
   await new Promise(r=>setTimeout(r,125));
  }
  if(count<size*.7)throw Error('Браузер не может извлечь аудиодорожку. Попробуй MP4 с AAC или WebM с Opus.');
  return pieces.map(parts=>{const result=new Float32Array(size);let at=0;for(const p of parts){result.set(p,at);at+=p.length}return result});
 }finally{
  sourceVideo.pause();processor?.disconnect();node?.disconnect();await ctx.close().catch(()=>{});
  // Once a MediaElementSource is bound it cannot be rebound to a new context.
  // Replace the video element for the next input or retry.
  const fresh=sourceVideo.cloneNode(false);fresh.muted=true;
  sourceVideo.replaceWith(fresh);sourceVideo=fresh;
 }
}
async function pcm(selected,signal){
 try{return await decode(selected,signal)}
 catch(e){if(signal.aborted)throw e;return await capture(selected,signal)}
}
function readableModelError(packet){
 const reason=packet.message||'Неизвестная ошибка модели.';
 const phase=packet.phase==='library'?'подключение библиотеки':
  packet.phase==='model'?'загрузка весов или ONNX WebAssembly':'обработка звука';
 if(/load failed|failed to fetch|fetch failed|networkerror|failed to load/i.test(reason))
  return 'Сетевой сбой ('+phase+'): не удалось получить компоненты MRX. Проверь интернет, блокировщики контента или VPN и повтори. Техническая причина: '+reason;
 if(/memory|allocation|out of bounds|memory access/i.test(reason))
  return 'Не хватает памяти для нейросети. Выбери режим по 5 секунд и попробуй более короткую сцену. '+reason;
 return 'MRX ('+phase+'): '+reason;
}
function separate(channels,chunk,id){
 return new Promise((resolve,reject)=>{
  const w=new Worker('./mrx-worker.js',{type:'module'});worker=w;
  w.onerror=e=>{e.preventDefault();w.terminate();if(worker===w)worker=null;reject(Error('Ошибка подключения нейросети: '+(e.message||'скрипт Worker не запустился')+'. Проверь сеть и разрешение доступа к внешним CDN.'))};
  w.onmessageerror=()=>{w.terminate();if(worker===w)worker=null;reject(Error('Safari не смог передать звуковые данные в Worker. Попробуй более короткий фрагмент.'))};
  w.onmessage=e=>{
   const p=e.data||{};if(p.id!==id)return;
   if(p.stage==='library')step('Подключаем нейросеть',p.detail);
   if(p.stage==='model')step('MRX разделяет дорожки',p.detail);
   if(p.stage==='done'||p.stage==='error'){
    w.terminate();if(worker===w)worker=null;
    p.stage==='done'?resolve(p):reject(Error(readableModelError(p)));
   }
  };
  const copies=channels.map(ch=>ch.slice());
  w.postMessage({id,channels:copies,chunk},copies.map(c=>c.buffer));
 });
}
async function process(){
 if(!file||worker||exporting)return;
 clearError();reset();const signal=new AbortController();abort=signal;const id=++serial;
 uiBusy(true);let timer=null;
 try{
  const selected=validRange(Number($('start-seconds').value),Number($('duration-seconds').value),length);
  range=selected;original=await pcm(selected,signal.signal);
  if(signal.signal.aborted||id!==serial)return;
  const start=performance.now();
  timer=setInterval(()=>text('progress-detail','Разделяем '+elapsed(selected.duration)+' звука · прошло '+elapsed((performance.now()-start)/1000)),500);
  const result=await separate(original,Number($('chunk-size').value),id);
  if(signal.signal.aborted||id!==serial)return;
  stems=result.stems;inferenceTime=result.seconds;
  step('Готово','Дорожки разделены.',1);
  text('inference-time',elapsed(inferenceTime));
  text('speed-factor',(selected.duration/Math.max(.001,inferenceTime)).toFixed(2)+'×');
  text('scene-length',elapsed(selected.duration));text('result-state','Три дорожки готовы');
  show('empty-state',false);show('result-details',true);
  video.src=fileURL;video.load();mode='clean';
  await previewAudio();text('export-status','Прослушай результат и сравни оригинал с очищенной дорожкой.');
 }catch(e){
  if(e.name!=='AbortError'&&id===serial)error(e.message||String(e));
  if(!stems)reset();
 }finally{if(timer)clearInterval(timer);if(abort===signal)abort=null;if(serial===id)uiBusy(false)}
}
$('process-btn').onclick=()=>{void process()};$('cancel-btn').onclick=cancel;
function gains(){return {dialogue:Number($('dialogue-gain').value)/100,music:Number($('music-gain').value)/100,effects:Number($('effects-gain').value)/100}}
function getMix(){return mixPCM(original,stems,gains())}
async function previewAudio(){
 if(!stems||!range)return;
 const wasPlaying=!video.paused,offset=Math.max(0,video.currentTime-range.start);
 audio.pause();revoke(audioURL);
 try{
  audioURL=URL.createObjectURL(wavPCM16(mode==='original'?original:getMix()));
  audio.src=audioURL;audio.load();
  if(video.readyState>=1){audio.currentTime=Math.min(offset,range.duration-.01);if(wasPlaying)await audio.play().catch(()=>{})}
 }catch(e){error('Не удалось подготовить аудио: '+e.message)}
}
function setMode(value){mode=value;$('original-btn').classList.toggle('selected',value==='original');$('clean-btn').classList.toggle('selected',value==='clean');void previewAudio()}
$('original-btn').onclick=()=>setMode('original');$('clean-btn').onclick=()=>setMode('clean');
for(const name of ['dialogue','music','effects']){
 $(name+'-gain').oninput=()=>{
  text(name+'-value',$(name+'-gain').value+'%');
  mode='clean';$('original-btn').classList.remove('selected');$('clean-btn').classList.add('selected');
  clearTimeout(editTimer);editTimer=setTimeout(()=>{void previewAudio()},250);
 };
}
async function sync(play){
 if(!range||!audio.src)return;
 const at=Math.max(0,Math.min(range.duration,video.currentTime-range.start));
 if(Math.abs(audio.currentTime-at)>.2)audio.currentTime=at;
 if(play&&video.currentTime<range.start+range.duration)await audio.play().catch(()=>{});else audio.pause();
}
video.addEventListener('play',()=>{void sync(true)});
video.addEventListener('pause',()=>{void sync(false)});
video.addEventListener('seeked',()=>{void sync(!video.paused)});
video.addEventListener('timeupdate',()=>{
 if(!range)return;
 if(video.currentTime<range.start-.1){video.currentTime=range.start;return}
 if(video.currentTime>=range.start+range.duration-.07){video.pause();audio.pause()}
 else if(Math.abs(audio.currentTime-(video.currentTime-range.start))>.38)void sync(!video.paused);
});
function download(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('wav-btn').onclick=()=>{if(!stems)return;try{download(wavPCM16(getMix()),fileName+'-no-dialogue.wav')}catch(e){error(e.message)}};
function movieMime(){
 return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
}
async function exportVideo(){
 if(!stems||!range||exporting)return;
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return error('В этом браузере нет MediaRecorder или Canvas Capture. Доступен экспорт WAV.');
 const mime=movieMime();if(!mime)return error('Браузер не поддерживает видеоэкспорт. Можно скачать WAV.');
 clearError();pause();exporting=true;$('video-btn').disabled=true;$('wav-btn').disabled=true;
 const controller=new AbortController();abort=controller;let ctx,stream,recorder,frame=0;
 try{
  const canvas=document.createElement('canvas'),width=Math.min(1280,video.videoWidth||1280);
  canvas.width=Math.round(width/2)*2;
  canvas.height=Math.round(((video.videoHeight||720)*canvas.width/(video.videoWidth||1280))/2)*2;
  const brush=canvas.getContext('2d',{alpha:false}),film=canvas.captureStream(25);
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:RATE});
  const destination=ctx.createMediaStreamDestination(),src=ctx.createBufferSource(),pcm=getMix();
  const buffer=ctx.createBuffer(pcm.length,pcm[0].length,RATE);
  pcm.forEach((ch,i)=>buffer.copyToChannel(ch,i));src.buffer=buffer;src.connect(destination);
  stream=new MediaStream([...film.getVideoTracks(),...destination.stream.getAudioTracks()]);
  const chunks=[];
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2600000,audioBitsPerSecond:128000});
  const done=new Promise((resolve,reject)=>{
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onerror=e=>reject(Error(e.error?.message||'MediaRecorder error'));
   recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));
  });
  await seek(video,range.start);
  brush.fillStyle='#000';brush.fillRect(0,0,canvas.width,canvas.height);
  recorder.start(500);
  const draw=()=>{if(video.readyState>=2)brush.drawImage(video,0,0,canvas.width,canvas.height);if(!controller.signal.aborted)frame=requestAnimationFrame(draw)};
  frame=requestAnimationFrame(draw);
  await ctx.resume();video.muted=true;await video.play();src.start();
  const until=performance.now()+range.duration*2500+10000;
  while(video.currentTime<range.start+range.duration-.07){
   if(controller.signal.aborted)throw new DOMException('Экспорт прерван','AbortError');
   if(video.ended||performance.now()>until)break;
   text('export-status','Сохраняем видео: '+elapsed(Math.max(0,video.currentTime-range.start))+' / '+elapsed(range.duration));
   await sleep(150);
  }
  video.pause();cancelAnimationFrame(frame);src.stop();recorder.stop();
  const output=await done;
  if(controller.signal.aborted)throw new DOMException('Прервано','AbortError');
  if(output.size<15000)throw Error('Не удалось записать видеокадры. Скачай WAV отдельно.');
  const ext=mime.startsWith('video/mp4')?'mp4':'webm';
  download(output,fileName+'-no-dialogue.'+ext);
  text('export-status','Сохранено '+(output.size/1048576).toFixed(1)+' МиБ · '+ext.toUpperCase());
 }catch(e){if(e.name!=='AbortError')error(e.message);else text('export-status','Экспорт прерван.')}
 finally{cancelAnimationFrame(frame);video.pause();if(recorder?.state==='recording')try{recorder.stop()}catch{}stream?.getTracks().forEach(t=>t.stop());if(ctx)await ctx.close().catch(()=>{});if(abort===controller)abort=null;exporting=false;$('video-btn').disabled=false;$('wav-btn').disabled=false}
}
$('video-btn').onclick=()=>{void exportVideo()};
window.addEventListener('pagehide',()=>{worker?.terminate();abort?.abort();pause();revoke(fileURL);revoke(audioURL)});
if(mobile)$('chunk-size').value='5';
uiBusy(false);
