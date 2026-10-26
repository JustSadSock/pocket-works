import {RATE,MAX_SECONDS,validRange,mixPCM,stemLevels,suppressStereoCenter,wavPCM16,elapsed,safeName} from './audio-utils.js';
import {stereoPCM,comparisonMetrics,subtractResidualVocals} from './research-core.js';
import {ROUTES,routeById,planRoute,planCustom,makeRunKey,calculateSpeed} from './pipeline-config.js';
const $=id=>document.getElementById(id),video=$('result-video'),audio=$('monitor');
const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||
 (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let sourceVideo=$('source-video');
let file=null,fileURL='',audioURL='',length=0,range=null,original=null,stems=null,inferenceTime=0;
let worker=null,abort=null,serial=0,exporting=false,editTimer=null,mode='clean',fileName='video';
let scnetVocals=null,scnetBase=null,scnetTime=0;
const pipelineRuns=new Map();let customCounter=0;
const studyResults=new Map();let activeStudy=null,studySurround=null,studySurroundRate=0,studySignature='',studyBusy=false;
const text=(id,msg)=>$(id).textContent=String(msg),show=(id,on)=>$(id).classList.toggle('hidden',!on);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),revoke=url=>{if(url)URL.revokeObjectURL(url)};
function error(msg){text('error',msg);show('error',true)}
function clearError(){show('error',false)}
function uiBusy(active){
 const busy=active||studyBusy||exporting;
 for(const name of ['process-btn','file-input','start-seconds','duration-seconds'])
  $(name).disabled=busy||!file||!length;
 $('quality-mode').disabled=busy;
 $('chunk-size').disabled=busy;
 $('scene-gravity').disabled=busy||!file||length<149;
 $('pipeline-run').disabled=busy||!file||!length;
 $('pipeline-input').disabled=busy;
 $('pipeline-model').disabled=busy;
 $('pipeline-step').disabled=busy||$('pipeline-model').value==='mrx';
 show('progress-wrap',active);
}
function step(title,detail='',ratio=null){text('progress-heading',title);text('progress-detail',detail);if(ratio===null)$('progress-bar').removeAttribute('value');else $('progress-bar').value=ratio}
function pause(){video.pause();sourceVideo.pause();audio.pause()}
function reset(){
 pause();revoke(audioURL);audioURL='';audio.removeAttribute('src');audio.load();
 video.removeAttribute('src');video.load();original=null;stems=null;range=null;activeStudy=null;
 scnetVocals=null;scnetBase=null;scnetTime=0;show('scnet-tuning',false);
 show('result-details',false);show('empty-state',true);text('result-state','Ожидание обработки');text('export-status','');text('stem-diagnostics','');text('result-position','0:00');$('result-seek').value=0;text('listen-btn','▶ Слушать результат');
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
 if(worker)cancel();reset();clearStudy();clearError();length=0;
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
  $('scene-gravity').disabled=length<149;
  text('route-hint',routeById($('quality-mode').value)?.detail||'');
 }catch(e){error(e.message);file=null;length=0;show('input-details',false)}
 finally{uiBusy(false)}
}
$('file-input').addEventListener('change',e=>{void choose(e.target.files?.[0]);e.target.value=''});
$('scene-gravity').onclick=()=>{
 if(!file||length<149||worker)return;
 $('start-seconds').value='148';
 $('duration-seconds').value=String(Math.min(20,Math.floor(length-148)));
 text('range-note','Тест · Gravity Falls · 2:28, '+$('duration-seconds').value+' сек. При следующем запуске фрагмент обновится.');
};
$('quality-mode').onchange=()=>text('route-hint',routeById($('quality-mode').value)?.detail||'');
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
  if([6,8].includes(buffer.numberOfChannels)){
   // Capture real surround channels BEFORE stereo downmix in OfflineAudioContext.
   const from=Math.floor(selected.start*buffer.sampleRate),to=Math.min(buffer.length,from+Math.round(selected.duration*buffer.sampleRate));
   studySurround=resamplePCM(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice(from,to)),
    buffer.sampleRate,RATE);
   studySurroundRate=RATE;
  }
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
 return 'Нейросеть ('+phase+'): '+reason;
}
function separate(channels,chunk,id,kind='mrx',scnetStep=.25){
 return new Promise((resolve,reject)=>{
  const w=new Worker('./mrx-worker.js',{type:'module'});worker=w;
  w.onerror=e=>{e.preventDefault();w.terminate();if(worker===w)worker=null;reject(Error('Ошибка подключения нейросети: '+(e.message||'скрипт Worker не запустился')+'. Проверь сеть и разрешение доступа к внешним CDN.'))};
  w.onmessageerror=()=>{w.terminate();if(worker===w)worker=null;reject(Error('Safari не смог передать звуковые данные в Worker. Попробуй более короткий фрагмент.'))};
  w.onmessage=e=>{
   const p=e.data||{};if(p.id!==id)return;
   if(p.stage==='library')step('Подключаем нейросеть',p.detail);
   if(p.stage==='model')step(kind==='scnet'?'SCNet ищет оставшиеся голоса':'MRX разделяет дорожки',p.detail);
   if(p.stage==='done'||p.stage==='error'){
    w.terminate();if(worker===w)worker=null;
    p.stage==='done'?resolve(p):reject(Error(readableModelError(p)));
   }
  };
  const copies=channels.map(ch=>ch.slice());
  w.postMessage({id,channels:copies,chunk,kind,scnetStep},copies.map(c=>c.buffer));
 });
}
// Every route is browser-only. Intermediate neural runs are cached under the
// *actual input result* and SCNet's window stride, avoiding duplicate inference.
function stageAudio(id){
 if(id==='original')return original;
 return studyResults.get(id)?.clean||null;
}
function initPlayer(selected){
 range=selected;
 video.muted=true;try{video.volume=0}catch{}
 if(video.src!==fileURL){
  video.src=fileURL;video.load();
  video.addEventListener('loadedmetadata',()=>{if(range)video.currentTime=range.start},{once:true});
 }
 $('result-seek').min='0';$('result-seek').max=String(selected.duration);
 $('result-seek').step='.05';$('result-seek').value='0';
}
async function modelStage(model,inputId,inputPCM,stepSize,id){
 const scnetStep=model==='scnet'?stepSize:null;
 const key=makeRunKey(model,inputId,scnetStep);
 if(pipelineRuns.has(key))return {...pipelineRuns.get(key),cached:true};
 const actualPCM=stereoPCM(inputPCM);
 const piece=model==='scnet'?Math.min(10,Number($('chunk-size').value)):Number($('chunk-size').value);
 const response=await separate(actualPCM,piece,id,model,scnetStep??.25);
 if(id!==serial||abort?.signal.aborted)throw new DOMException('Прервано','AbortError');
 let run;
 if(model==='mrx'){
  const clean=mixPCM(actualPCM,response.stems,{dialogue:0,music:1,effects:1},'stems');
  run={model,key,clean,stems:response.stems,timeMs:response.seconds*1000};
  if(inputId==='original'){stems=response.stems;inferenceTime=response.seconds}
 }else{
  const vocals=response.stems.vocals;
  const clean=subtractResidualVocals(actualPCM,vocals,Number($('scnet-strength').value)/100);
  run={model,key,clean,vocals,base:actualPCM,timeMs:response.seconds*1000,step:scnetStep};
 }
 pipelineRuns.set(key,run);
 if(pipelineRuns.size>(mobile?5:12)){
  const old=[...pipelineRuns.keys()].find(k=>k!=='mrx|original'&&k!==key);
  if(old)pipelineRuns.delete(old);
 }
 return {...run,cached:false};
}
async function executeRoute(routeId=null,custom=null){
 if(!file||worker||exporting||studyBusy)return;
 clearError();
 const controller=new AbortController();abort=controller;const id=++serial;
 let freshMs=0,cacheHits=0,preview=null;
 const isPreset=!!routeId;
 const route=isPreset?routeById(routeId):null;
 if(isPreset&&!route)return error('Выбран неизвестный маршрут.');
 if(!isPreset&&!custom)return error('Выбери модель и входной результат.');
 const task=isPreset?planRoute(routeId):[custom];
 const targetId=isPreset?routeId:'custom-'+(++customCounter);
 studyBusy=true;uiBusy(true);
 text('pipeline-status','Вычисляем реальные дорожки…');
 try{
  const selected=validRange(Number($('start-seconds').value),Number($('duration-seconds').value),length);
  const signature=selected.start.toFixed(3)+'|'+selected.duration.toFixed(3);
  if(studySignature!==signature){
   reset();clearStudy();studySignature=signature;
  }
  if(!original){
   range=selected;original=await pcm(selected,controller.signal);
   if(controller.signal.aborted||id!==serial)return;
   if(!original?.length)throw Error('Не удалось извлечь звук выбранного фрагмента.');
  }
  initPlayer(selected);
  let inputId='original',inputPCM=original,totalMs=0;
  if(!isPreset){
   inputId=custom.input;
   inputPCM=stageAudio(inputId);
   if(!inputPCM)throw Error('Исходная версия недоступна: выбери другую дорожку.');
  }
  for(const [i,part] of task.entries()){
   if(part.input==='original'){inputId='original';inputPCM=original}
   else if(part.input==='previous'&&!inputPCM)throw Error('Не найден предыдущий результат.');
   const label=part.model==='mrx'?'MRX':'SCNet · окна '+Math.round(part.step*100)+'%';
   step('Этап '+(i+1)+'/'+task.length+' · '+label,
    'Обрабатываем '+elapsed(selected.duration)+' · время зависит от CPU и количества пересечений окон.');
   const run=await modelStage(part.model,inputId,inputPCM,part.step??null,id);
   if(controller.signal.aborted||id!==serial)return;
   totalMs+=run.timeMs;if(run.cached)cacheHits++;else freshMs+=run.timeMs;
   inputPCM=run.clean;
   preview=run;
   if(part.model==='mrx'&&inputId==='original'&&!studyResults.has('mrx')){
    registerStudyResult('mrx',run.clean,run.timeMs,
     {source:'local',label:'MRX · быстрый ориентир',meta:{model:'mrx',runKey:run.key,input:'original'}});
   }
   // A preset MRX stage is a stable named intermediate input for later
   // routes; a custom pass must not silently become that intermediate.
   inputId=part.model==='mrx'&&part.input==='original'?'mrx':targetId+':stage'+i;
  }
  if(!preview)throw Error('Модель не вернула обработанный звук.');
  const display=isPreset?route.label:
   (custom.model==='mrx'?'MRX':'SCNet '+Math.round(custom.step*100)+'%')+
   ' ← '+(custom.input==='original'?'Оригинал':studyResults.get(custom.input)?.label||'Дорожка');
  registerStudyResult(targetId,inputPCM,totalMs,{
   source:'local',label:display,
   meta:{model:preview.model,input:!isPreset?custom.input:task[0].input,
    step:preview.step,runKey:preview.key,
    vocals:preview.vocals,base:preview.base,spentMs:freshMs,cached:cacheHits,route:routeId}
  });
  await selectStudyResult(targetId);
  step('Готово',cacheHits?'Повторно использовано этапов: '+cacheHits+'.':'Новый результат готов.',1);
  text('pipeline-status','Готово · '+display+'. Этот результат можно подать в любую модель следующим проходом.'+
   (cacheHits?' Кэшировано этапов: '+cacheHits+'.':''));
  text('export-status','Сравни все версии на той же секунде; скачивание использует выбранный вариант.');
 }catch(e){
  if(id===serial&&e.name!=='AbortError'){
   error(e.message||String(e));
   text('pipeline-status','Ошибка модели: '+(e.message||String(e))+
    '. Уже готовые результаты сохранены — можно выбрать другой маршрут.');
  }
 }finally{
  if(abort===controller)abort=null;
  if(serial===id){studyBusy=false;uiBusy(false)}
 }
}
$('process-btn').onclick=()=>{void executeRoute($('quality-mode').value)};
$('cancel-btn').onclick=cancel;
$('pipeline-model').onchange=()=>{
 $('pipeline-step').disabled=$('pipeline-model').value==='mrx';
};
$('pipeline-run').onclick=()=>{
 const request=planCustom($('pipeline-model').value,$('pipeline-input').value,Number($('pipeline-step').value));
 if(!request)return error('Параметры обработки некорректны.');
 void executeRoute(null,request);
};

function gains(){return {dialogue:Number($('dialogue-gain').value)/100,music:Number($('music-gain').value)/100,effects:Number($('effects-gain').value)/100}}
function getMix(){
 if(!original||!activeStudy)throw Error('Нет выбранного результата обработки');
 if(mode==='original')return stereoPCM(original);
 if(activeStudy!=='mrx'){
  const clean=studyResults.get(activeStudy)?.clean;
  if(!clean)throw Error('Дорожка для сравнения потеряна.');
  if(mode==='speech')return clean.map((channel,i)=>{
   const out=new Float32Array(channel.length),src=original[Math.min(i,original.length-1)];
   for(let j=0;j<out.length;j++)out[j]=(src[j]||0)-channel[j];
   return out;
  });
  return suppressStereoCenter(clean,Number($('center-suppression').value),RATE);
 }
 if(!stems)throw Error('Не удалось загрузить дорожки MRX.');
 if(mode==='speech')return stems.dialogue.map(channel=>channel.slice());
 const separated=mixPCM(original,stems,gains(),mode==='stems'?'stems':'residual');
 return suppressStereoCenter(separated,Number($('center-suppression').value),RATE);
}
function updateListeningButtons(){
 for(const [name,value] of [['original','original'],['clean','clean'],['stems','stems'],['speech','speech']]){
  $(name+'-btn').classList.toggle('selected',mode===value);
  $(name+'-btn').disabled=!activeStudy||activeStudy!=='mrx'&&name==='stems';
 }
 $('clean-btn').textContent=activeStudy==='mrx'?'Оригинал − речь':'Результат модели';
 $('speech-btn').textContent=activeStudy==='mrx'?'Только речь':'Удалённая часть';
}
function audioFailure(reason){
 error('Не удалось воспроизвести обработанный звук: '+(reason?.message||String(reason))+
  '. Нажми «Слушать результат» ещё раз.');
}
async function previewAudio(){
 if(!activeStudy||!range)return;
 const wasPlaying=!video.paused,offset=Math.max(0,video.currentTime-range.start);
 audio.pause();revoke(audioURL);
 try{
  audioURL=URL.createObjectURL(wavPCM16(getMix()));
  audio.src=audioURL;audio.load();
  if(video.readyState>=1){
   audio.currentTime=Math.min(offset,range.duration-.01);
   if(wasPlaying)await audio.play().catch(audioFailure);
  }
 }catch(e){error('Не удалось подготовить аудио: '+e.message)}
}
function setMode(value){
 mode=value;updateListeningButtons();
 void previewAudio();
}
$('original-btn').onclick=()=>setMode('original');
$('clean-btn').onclick=()=>setMode('clean');
$('stems-btn').onclick=()=>setMode('stems');
$('speech-btn').onclick=()=>setMode('speech');
for(const name of ['dialogue','music','effects']){
 $(name+'-gain').oninput=()=>{
  text(name+'-value',$(name+'-gain').value+'%');
  mode=mode==='stems'?'stems':'clean';updateListeningButtons();
  clearTimeout(editTimer);editTimer=setTimeout(()=>{void previewAudio()},220);
 };
}
$('center-suppression').oninput=()=>{
 text('center-value',$('center-suppression').value+'%');
 if(mode==='speech'||mode==='original'){mode=activeStudy==='mrx'?'stems':'clean';updateListeningButtons();}
 clearTimeout(editTimer);editTimer=setTimeout(()=>{void previewAudio()},220);
};
// Never allow the original audio from <video> to mix into the neural stems.
function lockVideoMute(){
 if(!video.muted)video.muted=true;
 try{if(video.volume!==0)video.volume=0}catch{}
}
video.addEventListener('volumechange',lockVideoMute);
lockVideoMute();
async function sync(play){
 if(!range||!audio.src)return;
 const at=Math.max(0,Math.min(range.duration,video.currentTime-range.start));
 if(Math.abs(audio.currentTime-at)>.2)audio.currentTime=at;
 if(play&&video.currentTime<range.start+range.duration)
  await audio.play().catch(audioFailure);
 else audio.pause();
}
async function toggleListening(){
 if(!activeStudy||!range)return;
 if(!video.paused){video.pause();return}
 clearError();
 lockVideoMute();
 if(video.currentTime<range.start||video.currentTime>=range.start+range.duration-.06)
  video.currentTime=range.start;
 const position=Math.max(0,Math.min(range.duration,video.currentTime-range.start));
 audio.currentTime=position;
 // Both play promises originate in the same real user gesture (Safari).
 const requests=[audio.play(),video.play()];
 const states=await Promise.allSettled(requests);
 const failure=states.find(state=>state.status==='rejected');
 if(failure){pause();audioFailure(failure.reason)}
}
$('listen-btn').onclick=()=>{void toggleListening()};
$('result-seek').oninput=()=>{
 if(!range)return;
 const position=Number($('result-seek').value);
 video.currentTime=range.start+position;
 if(audio.src)audio.currentTime=position;
 text('result-position',Math.floor(position/60)+':'+String(Math.floor(position%60)).padStart(2,'0'));
};
video.addEventListener('play',()=>{text('listen-btn','⏸ Пауза');void sync(true)});
video.addEventListener('pause',()=>{text('listen-btn','▶ Слушать результат');void sync(false)});
video.addEventListener('seeked',()=>{void sync(!video.paused)});
video.addEventListener('timeupdate',()=>{
 if(!range)return;
 if(video.currentTime<range.start-.1){video.currentTime=range.start;return}
 const position=Math.max(0,Math.min(range.duration,video.currentTime-range.start));
 $('result-seek').value=String(position);
 text('result-position',Math.floor(position/60)+':'+String(Math.floor(position%60)).padStart(2,'0'));
 if(video.currentTime>=range.start+range.duration-.07){video.pause();audio.pause()}
 else if(Math.abs(audio.currentTime-position)>.38)void sync(!video.paused);
});
function download(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('wav-btn').onclick=()=>{if(!activeStudy)return;try{download(wavPCM16(getMix()),fileName+'-'+(mode==='speech'?'isolated-dialogue':mode==='original'?'original':mode==='stems'?'music-effects':'no-dialogue')+'.wav')}catch(e){error(e.message)}};
function movieMime(){
 return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
}
async function exportVideo(){
 if(!activeStudy||!range||exporting)return;
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
  download(output,fileName+'-'+(mode==='speech'?'dialogue':mode==='original'?'original':mode==='stems'?'music-effects':'no-dialogue')+'.'+ext);
  text('export-status','Сохранено '+(output.size/1048576).toFixed(1)+' МиБ · '+ext.toUpperCase());
 }catch(e){if(e.name!=='AbortError')error(e.message);else text('export-status','Экспорт прерван.')}
 finally{cancelAnimationFrame(frame);video.pause();if(recorder?.state==='recording')try{recorder.stop()}catch{}stream?.getTracks().forEach(t=>t.stop());if(ctx)await ctx.close().catch(()=>{});if(abort===controller)abort=null;exporting=false;$('video-btn').disabled=false;$('wav-btn').disabled=false}
}
$('video-btn').onclick=()=>{void exportVideo()};

// Comparative bench. The only automatic inference is the verified local MRX.
// External DnR/BandIt/SAM tracks are genuine user-provided audio, never fake AI.
function clearStudy(){
 scnetVocals=null;scnetBase=null;scnetTime=0;
 studyResults.clear();studySignature='';activeStudy=null;studySurround=null;studySurroundRate=0;
 $('study-surround-file').value='';$('study-me-file').value='';$('study-music-file').value='';
 $('study-effects-file').value='';$('study-external-seconds').value='';
 $('study-surround-options').classList.add('hidden');
 text('study-surround-status','5.1/7.1 WAV можно загрузить отдельно, не отправляя на сервер.');
 $('study-csv').disabled=true;
 text('study-import-status','');text('study-active-status','Для сравнения используй один и тот же фрагмент.');
 renderStudyResults();
}
function studyScene(){
 if(!file||!length)throw Error('Сначала выбери исходное видео.');
 const selected=validRange(Number($('start-seconds').value),Number($('duration-seconds').value),length);
 const signature=selected.start.toFixed(3)+'|'+selected.duration.toFixed(3);
 if(studySignature&&studySignature!==signature){
  reset();clearStudy();
 }
 studySignature=signature;
 return selected;
}
async function prepareStudySource(){
 if(original&&range&&studySignature===range.start.toFixed(3)+'|'+range.duration.toFixed(3))
  return;
 if(!file||studyBusy||worker||exporting)throw Error('Сначала закончи текущую обработку.');
 const selected=studyScene(),controller=new AbortController();
 studyBusy=true;uiBusy(true);text('study-active-status','Декодируем исходный звук выбранного фрагмента…');
 try{
  range=selected;original=await pcm(selected,controller.signal);
  if(!original?.length)throw Error('Браузер не смог извлечь исходную дорожку.');
  if(studySurround?.length>=6)registerSurround(true);
  video.muted=true;try{video.volume=0}catch{}
  video.src=fileURL;video.load();
  video.addEventListener('loadedmetadata',()=>{if(range)video.currentTime=range.start},{once:true});
  $('result-seek').min='0';$('result-seek').max=String(range.duration);
  $('result-seek').step='.05';$('result-seek').value='0';
  text('study-active-status','Исходный звук готов. Можно импортировать результаты других моделей.');
 }finally{studyBusy=false;uiBusy(false)}
}
async function ensureResearchSource(){
 if(original&&range&&file)return;
 await prepareStudySource();
}
function registerStudyResult(id,clean,processingMs=null,{source='external',label=null}={}){
 if(!researchMethod(id))throw Error('Неизвестный алгоритм для сравнения.');
 if(!original?.length||!range)throw Error('Нет исходной сцены для сравнения.');
 const canonical=stereoPCM(clean),target=Math.round(range.duration*RATE);
 if(canonical.some(c=>Math.abs(c.length-target)>Math.round(.20*RATE)))
  throw Error('Дорожка не совпадает по времени с исходной сценой.');
 const normalized=canonical.map(c=>{
  const out=new Float32Array(target);out.set(c.subarray(0,target));return out;
 });
 const metrics=comparisonMetrics(stereoPCM(original),normalized,RATE);
 const elapsedMs=processingMs===null?null:Number(processingMs);
 const timing=elapsedMs===null?null:comparisonRecord(id,range.duration,elapsedMs,metrics);
 // Keep the mobile memory budget predictable for 90-second float32 stems.
 if(!studyResults.has(id)&&studyResults.size>=(mobile?3:7)){
  const evict=[...studyResults.keys()].find(key=>key!=='mrx'&&key!==activeStudy)
   ||[...studyResults.keys()].find(key=>key!==activeStudy);
  if(evict)studyResults.delete(evict);
 }
 studyResults.set(id,{id,label:label||researchMethod(id).name,source,clean:normalized,
  timeMs:elapsedMs,metrics,timing});
 renderStudyResults();
 $('study-csv').disabled=studyResults.size===0;
}
function registerSurround(silent=false){
 if(!studySurround?.length||!original||!range)return;
 const center=Number($('study-center-gain').value)/100;
 const started=performance.now();
 const clean=multichannelME(studySurround,center);
 const processingMs=performance.now()-started;
 registerStudyResult('surround',clean,processingMs,{source:'channels',label:'5.1/7.1 · центр '+Math.round(center*100)+'%'});
 $('study-surround-options').classList.remove('hidden');
 const profile=channelSummary(studySurround,studySurroundRate||RATE);
 const fmtDb=n=>(20*Math.log10(Math.max(n,1e-9))).toFixed(1)+' дБ';
 text('study-surround-status',profile.length+' каналов. Центральный (C): '+fmtDb(profile[2].rms)+
  ', боковые L/R: '+fmtDb(profile[0].rms)+' / '+fmtDb(profile[1].rms)+
  '. Разделение центра может удалить и важные звуковые эффекты.');
 if(!silent||activeStudy==='surround')selectStudyResult('surround');
}
function renderStudyResults(){
 const root=$('study-results');root.replaceChildren();
 if(studyResults.size===0){
  const p=document.createElement('p');p.className='hint';
  p.textContent='Пока нет результатов. Обработай MRX, извлеки каналы 5.1 или импортируй WAV.';
  root.append(p);return;
 }
 for(const {id,label,source,metrics,timeMs,timing} of studyResults.values()){
  const b=document.createElement('button');b.type='button';b.className='study-choice'+(activeStudy===id?' selected':'');
  b.setAttribute('role','listitem');b.setAttribute('aria-pressed',String(activeStudy===id));
  const title=document.createElement('strong');title.textContent=label;
  const info=document.createElement('span');info.textContent=
   'Уровень относительно исходника '+(metrics.changeDb>0?'+':'')+metrics.changeDb.toFixed(1)+' дБ · пик '+metrics.peakDb.toFixed(1)+' дБ';
  const time=document.createElement('span');time.textContent=timeMs===null?'Время модели не измерено':
   (source==='channels'?'Канальное сведение '+(timeMs/1000).toFixed(3)+' с · RTF '+timing.realTimeFactor.toFixed(3):
    'Затрачено '+elapsed(timeMs/1000)+' · RTF '+timing.realTimeFactor.toFixed(2));
  b.append(title,info,time);b.onclick=()=>{void selectStudyResult(id)};
  root.append(b);
 }
}
async function selectStudyResult(id,rebuild=true){
 const item=studyResults.get(id);
 if(!item||!original||!range)return;
 pause();activeStudy=id;mode='clean';
 show('empty-state',false);show('result-details',true);
 $('video-btn').disabled=false;$('wav-btn').disabled=false;
 const isMRX=id==='mrx'&&!!stems;
 show('scnet-tuning',id==='mrx-scnet'&&!!scnetVocals);
 for(const name of ['dialogue','music','effects'])$(name+'-gain').disabled=!isMRX;
 $('center-suppression').disabled=original.length!==2;
 text('result-state',item.label);
 text('inference-time',item.timeMs===null?'—':elapsed(item.timeMs/1000));
 text('speed-factor',item.timing?item.timing.realTimeFactor.toFixed(2)+'× RTF':'—');
 text('scene-length',elapsed(range.duration));
 const levels=isMRX?stemLevels(original,stems):null;
 text('stem-diagnostics',isMRX&&levels
  ?'Выделенная речь: '+levels.dialogueRelativeDb.toFixed(1)+' дБ относительно оригинала. Это уровень выделенной дорожки, а не показатель качества разделения.'
  :'Внешний/канальный M&E: «Удалённая часть» = исходник − результат, не обязательно чистая речь.');
 text('study-active-status','Активный метод: '+item.label+
  '. Прослушивание и кнопки скачивания выше используют именно его результат.');
 updateListeningButtons();renderStudyResults();
 if(!video.src||video.src!==fileURL){
  video.src=fileURL;video.load();
  video.addEventListener('loadedmetadata',()=>{if(range)video.currentTime=range.start},{once:true});
 }
 if(rebuild)await previewAudio();
}
async function importSurround(f){
 if(!f)return;
 const selected=studyScene();
 text('study-surround-status','Читаем каналы WAV…');
 try{
  const decoded=decodeWav(await f.arrayBuffer(),{
   start:0,duration:null
  });
  if(![6,8].includes(decoded.channels.length))throw Error('Нужен именно шестиканальный 5.1 или восьмиканальный 7.1 WAV.');
  await ensureResearchSource();
  const at=decoded.meta.duration>=selected.start+selected.duration-.15&&selected.start>1?selected.start:0;
  const frames=decoded.channels[0].length,from=Math.floor(at*decoded.meta.rate);
  if(frames-from<Math.floor((selected.duration-.15)*decoded.meta.rate))
   throw Error('Многоканальная дорожка не покрывает выбранные секунды фильма.');
  const to=Math.min(frames,from+Math.round(selected.duration*decoded.meta.rate));
  studySurround=resamplePCM(decoded.channels.map(ch=>ch.subarray(from,to)),decoded.meta.rate,RATE);
  studySurroundRate=RATE;
  registerSurround();
 }catch(e){text('study-surround-status','Ошибка: '+(e.message||String(e)))}
}
async function externalAudio(f){
 if(!f)throw Error('Выбери WAV либо музыку и эффекты.');
 if(f.size>220*1048576)throw Error('Для испытания нужен звуковой файл не больше 220 МиБ.');
 const raw=await f.arrayBuffer();
 try{
  const decoded=decodeWav(raw);return {channels:decoded.channels,rate:decoded.meta.rate};
 }catch(e){
  if(/\.wav$/i.test(f.name))throw e;
  const ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:RATE});
  try{
   const decoded=await ctx.decodeAudioData(raw);
   return {channels:Array.from({length:Math.min(decoded.numberOfChannels,2)},(_,i)=>decoded.getChannelData(i).slice()),rate:decoded.sampleRate};
  }finally{await ctx.close().catch(()=>{})}
 }
}
async function runImport(){
 if(worker||exporting||studyBusy)return;
 clearError();
 studyBusy=true;uiBusy(true);
 text('study-import-status','Декодируем внешние дорожки на устройстве…');
 try{
  const method=$('study-method').value;
  if(!researchMethod(method)||researchMethod(method).type!=='import')throw Error('Выбери доступную внешнюю модель.');
  const me=$('study-me-file').files[0],music=$('study-music-file').files[0],effects=$('study-effects-file').files[0];
  if(!me&&(!music||!effects))throw Error('Загрузи готовый M&E либо обе дорожки: музыку и эффекты.');
  const selected=studyScene();
  // source prepare explicitly allows an external model without running MRX.
  studyBusy=false;uiBusy(false);await ensureResearchSource();
  studyBusy=true;uiBusy(true);
  let mixed;
  if(me){
   const audioData=await externalAudio(me);
   mixed=matchResultToSegment(audioData.channels,audioData.rate,selected.start,selected.duration,RATE);
  }else{
   const m=await externalAudio(music),e=await externalAudio(effects);
   mixed=sumMusicEffects(
    matchResultToSegment(m.channels,m.rate,selected.start,selected.duration,RATE),
    matchResultToSegment(e.channels,e.rate,selected.start,selected.duration,RATE));
  }
  const sec=$('study-external-seconds').value.trim();
  const measured=sec===''?null:Number(sec)*1000;
  if(measured!==null&&(!Number.isFinite(measured)||measured<0))throw Error('Неверное время внешней обработки.');
  registerStudyResult(method,mixed,measured,{source:'external',label:researchMethod(method).name});
  await selectStudyResult(method);
  text('study-import-status','Импортировано. Нажми «Слушать результат», сравни с MRX и сохрани CSV.');
 }catch(e){
  text('study-import-status','Ошибка: '+(e.message||String(e)));
 }finally{studyBusy=false;uiBusy(false)}
}
$('scnet-strength').oninput=()=>{
 text('scnet-strength-value',$('scnet-strength').value+'%');
 if(!scnetBase||!scnetVocals||!range||!original)return;
 clearTimeout(editTimer);
 editTimer=setTimeout(()=>{
  try{
   const adjusted=subtractResidualVocals(scnetBase,scnetVocals,Number($('scnet-strength').value)/100);
   registerStudyResult('mrx-scnet',adjusted,(inferenceTime+scnetTime)*1000,
    {source:'local',label:'MRX + SCNet · пробная очистка'});
   if(activeStudy==='mrx-scnet')void selectStudyResult('mrx-scnet');
  }catch(e){error(e.message)}
 },180);
};
$('study-import').onclick=()=>{void runImport()};
$('study-surround-file').onchange=e=>{void importSurround(e.target.files?.[0])};
$('study-center-gain').oninput=()=>{
 text('study-center-value',$('study-center-gain').value+'%');
 if(studySurround&&original)registerSurround();
};
$('study-source-wav').onclick=()=>{
 void (async()=>{
  if(studyBusy||worker||exporting)return;
  try{
   clearError();await ensureResearchSource();
   download(wavPCM16(stereoPCM(original)),fileName+'-'+
    Math.round(range.start)+'s-'+Math.round(range.duration)+'s-source.wav');
   text('study-active-status','Исходный WAV скачан. Загрузи его в MVSep и затем импортируй M&E сюда.');
  }catch(e){error(e.message)}
 })();
};
$('study-csv').onclick=()=>{
 if(!studyResults.size)return;
 const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const rows=[['Метод','Сцена, с','Обработка, с','RTF','Изменение RMS, дБ','Пик результата, дБ','Уровень удалённого звука, дБ']];
 for(const x of studyResults.values())rows.push([
  x.label,range.duration,x.timeMs===null?'':(x.timeMs/1000).toFixed(2),
  x.timing?.realTimeFactor.toFixed(3)||'',
  x.metrics.changeDb,x.metrics.peakDb.toFixed(2),x.metrics.removedRmsDb.toFixed(2)
 ]);
 download(new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{
  type:'text/csv;charset=utf-8'}),fileName+'-methods.csv');
};
renderStudyResults();

window.addEventListener('pagehide',()=>{worker?.terminate();abort?.abort();pause();revoke(fileURL);revoke(audioURL)});
if(mobile)$('chunk-size').value='5';
uiBusy(false);
