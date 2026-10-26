import {RATE,MAX_SECONDS,validRange,wavPCM16,elapsed,safeName} from './audio-utils.js';
import {stereoPCM,comparisonMetrics} from './research-core.js';
import {renderEnhancedPCM} from './audio-enhance.js';
import {selectProblemSegments,packProblemSegments,composeSelectivePatches,mixSelectivePatches} from './selective-scnet.js';
import {ROUTES,routeById,makeRunKey,calculateSpeed} from './pipeline-config.js';
const $=id=>document.getElementById(id),video=$('result-video'),audio=$('monitor');
const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||
 (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let sourceVideo=$('source-video');
let file=null,fileURL='',audioURL='',length=0,range=null,original=null;
let worker=null,pendingWorkerReject=null,abort=null,serial=0,exporting=false,editTimer=null,mode='clean',fileName='video';
const pipelineRuns=new Map();
const studyResults=new Map();let activeStudy=null,studySurround=null,studySurroundRate=0,studySignature='',studyBusy=false;
const text=(id,msg)=>$(id).textContent=String(msg),show=(id,on)=>$(id).classList.toggle('hidden',!on);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),revoke=url=>{if(url)URL.revokeObjectURL(url)};
function error(msg){text('error',msg);show('error',true)}
function clearError(){show('error',false)}
function uiBusy(active){
 const busy=active||studyBusy||exporting;
 $('file-input').disabled=busy;
 for(const name of ['process-btn','start-seconds','duration-seconds'])
  $(name).disabled=busy||!file||!length;
 $('quality-mode').disabled=busy;
 $('chunk-size').disabled=busy;
 $('scene-gravity').disabled=busy||!file||length<149;
 show('progress-wrap',active);
}
function step(title,detail='',ratio=null){text('progress-heading',title);text('progress-detail',detail);if(ratio===null)$('progress-bar').removeAttribute('value');else $('progress-bar').value=ratio}
function pause(){video.pause();sourceVideo.pause();audio.pause()}
function reset(){
 pause();revoke(audioURL);audioURL='';audio.removeAttribute('src');audio.load();
 video.removeAttribute('src');video.load();original=null;range=null;activeStudy=null;
 show('scnet-tuning',false);updateEnhancementUI();updateHybridUI();
 show('result-details',false);show('empty-state',true);text('result-state','Ожидание обработки');text('export-status','');text('stem-diagnostics','');text('result-position','0:00');$('result-seek').value=0;text('listen-btn','▶ Слушать результат');
}
function cancel(){
 serial++;
 abort?.abort();abort=null;
 // Terminating a Worker alone leaves its pending Promise unresolved.
 pendingWorkerReject?.(new DOMException('Обработка отменена','AbortError'));
 worker?.terminate();worker=null;
 studyBusy=false;uiBusy(false);updateHybridUI();step('Остановлено','Можно обработать файл повторно.');
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
  return 'Сетевой сбой ('+phase+'): не удалось получить компоненты выбранной модели. Проверь интернет, блокировщики контента или VPN и повтори. Техническая причина: '+reason;
 if(/memory|allocation|out of bounds|memory access/i.test(reason))
  return 'Не хватает памяти для нейросети. Выбери режим по 5 секунд и попробуй более короткую сцену. '+reason;
 return 'Нейросеть ('+phase+'): '+reason;
}
function separate(channels,chunk,id,kind='umxhq',scnetStep=1){
 return new Promise((resolve,reject)=>{
  const w=new Worker('./mrx-worker.js',{type:'module'});worker=w;
  const finish=()=>{w.terminate();if(worker===w)worker=null;if(pendingWorkerReject===rejectPending)pendingWorkerReject=null};
  const rejectPending=reason=>{finish();reject(reason)};
  pendingWorkerReject=rejectPending;
  w.onerror=e=>{e.preventDefault();rejectPending(Error('Ошибка подключения нейросети: '+(e.message||'скрипт Worker не запустился')+'. Проверь сеть и разрешение доступа к внешним CDN.'))};
  w.onmessageerror=()=>rejectPending(Error('Safari не смог передать звуковые данные в Worker. Попробуй более короткий фрагмент.'));
  w.onmessage=e=>{
   const p=e.data||{};if(p.id!==id)return;
   if(p.stage==='library')step('Подключаем нейросеть',p.detail);
   if(p.stage==='model')step(kind==='scnet'?'SCNet ищет вокал':'Open-Unmix ищет вокал',p.detail);
   if(p.stage==='done'||p.stage==='error'){
    finish();
    p.stage==='done'?resolve(p):reject(Error(readableModelError(p)));
   }
  };
  const copies=channels.map(ch=>ch.slice());
  w.postMessage({id,channels:copies,chunk,kind,scnetStep},copies.map(c=>c.buffer));
 });
}
// Both independent models process the same decoded original.
function initPlayer(selected){
 range=selected;video.muted=true;try{video.volume=0}catch{}
 if(video.src!==fileURL){
  video.src=fileURL;video.load();
  video.addEventListener('loadedmetadata',()=>{if(range)video.currentTime=range.start},{once:true});
 }
 $('result-seek').min='0';$('result-seek').max=String(selected.duration);
 $('result-seek').step='.05';$('result-seek').value='0';
}
function prepareEffects(base,vocals,id){
 return new Promise((resolve,reject)=>{
  const w=new Worker('./enhance-worker.js',{type:'module'});worker=w;
  const finish=()=>{w.terminate();if(worker===w)worker=null;if(pendingWorkerReject===rejectPending)pendingWorkerReject=null};
  const rejectPending=reason=>{finish();reject(reason)};
  pendingWorkerReject=rejectPending;
  w.onerror=e=>{e.preventDefault();rejectPending(Error('Не удалось подготовить DSP-фильтры: '+(e.message||'ошибка Worker')))};
  w.onmessageerror=()=>rejectPending(Error('Браузер не смог передать подготовленные звуковые фильтры.'));
  w.onmessage=e=>{
   const p=e.data||{};if(p.id!==id)return;
   if(p.stage==='progress')step('Готовим A/B-фильтры','Анализ и подавление артефактов · '+Math.round(p.fraction*100)+'%',p.fraction);
   if(p.stage==='error')rejectPending(Error(p.message||'Ошибка спектральной обработки'));
   if(p.stage==='done'){finish();resolve(p)}
  };
  // Keep the original cached PCM and model output intact on the main thread.
  const input=base.map(ch=>ch.slice()),voice=vocals.map(ch=>ch.slice());
  w.postMessage({id,base:input,vocals:voice},[...input,...voice].map(ch=>ch.buffer));
 });
}
async function modelStage(model,id){
 const key=makeRunKey(model),cached=pipelineRuns.get(key);
 if(cached)return {...cached,cached:true};
 const input=stereoPCM(original);
 const response=await separate(input,Number($('chunk-size').value),id,model,1);
 if(id!==serial||abort?.signal.aborted)throw new DOMException('Прервано','AbortError');
 step('Готовим DSP и подавление призвуков','Нейросеть завершила проход. Подготавливаем A/B без повторного инференса.');
 const prepared=await prepareEffects(input,response.stems.vocals,id);
 if(id!==serial||abort?.signal.aborted)throw new DOMException('Прервано','AbortError');
 const run={model,key,vocals:response.stems.vocals,base:input,layers:prepared.layers,
  timeMs:response.seconds*1000,dspMs:prepared.seconds*1000,textureCoverage:prepared.coverage};
 pipelineRuns.set(key,run);
 return {...run,cached:false};
}
async function executeRoute(routeId){
 if(!file||worker||exporting||studyBusy)return;
 clearError();
 const route=routeById(routeId);
 if(!route)return error('Выбери доступную нейросеть.');
 const controller=new AbortController();abort=controller;
 const id=++serial;
 studyBusy=true;uiBusy(true);
 try{
  const selected=validRange(Number($('start-seconds').value),Number($('duration-seconds').value),length);
  const signature=selected.start.toFixed(3)+'|'+selected.duration.toFixed(3);
  if(studySignature!==signature){reset();clearStudy();studySignature=signature}
  if(!original){
   range=selected;original=await pcm(selected,controller.signal);
   if(controller.signal.aborted||id!==serial)return;
  }
  initPlayer(selected);
  const model=route.steps[0].model;
  step('Удаляем голоса · '+route.label,'Подготовка модели и анализ '+elapsed(selected.duration));
  const started=performance.now();
  const tick=setInterval(()=>{
   if(worker&&id===serial)text('progress-detail',route.label+' · прошло '+elapsed((performance.now()-started)/1000));
  },1000);
  let run;
  try{run=await modelStage(model,id)}finally{clearInterval(tick)}
  if(controller.signal.aborted||id!==serial)return;
  const strength=Number($('scnet-strength').value)/100;
  const effects={strength,spectral:false,reconstruct:false,center:false,centerAmount:35,
   artifact:true,texture:false,artifactAmount:85,textureAmount:45};
  const clean=renderEnhancedPCM(run.base,run.vocals,run.layers,effects);
  registerStudyResult(routeId,clean,run.timeMs,{
   label:route.label,meta:{model,runKey:run.key,vocals:run.vocals,base:run.base,layers:run.layers,
    effects,dspMs:run.dspMs,textureCoverage:run.textureCoverage,cached:run.cached}
  });
  await selectStudyResult(routeId);
  step('Готово',run.cached?'Использован кэш модели.':'Новая версия готова.',1);
  text('export-status','Выбранный результат доступен для сравнения, прослушивания и экспорта.');
 }catch(e){
  if(id===serial&&e.name!=='AbortError')error(e.message||String(e));
 }finally{
  if(abort===controller)abort=null;
  if(id===serial){studyBusy=false;uiBusy(false);updateHybridUI()}
 }
}
$('process-btn').onclick=()=>{void executeRoute($('quality-mode').value)};
$('cancel-btn').onclick=cancel;
function getMix(){
 if(!original||!activeStudy)throw Error('Нет выбранного результата.');
 if(mode==='original')return stereoPCM(original);
 const item=studyResults.get(activeStudy);
 if(!item?.meta?.layers)throw Error('DSP-дорожки ещё не подготовлены.');
 const clean=renderEnhancedPCM(item.meta.base,item.meta.vocals,item.meta.layers,item.meta.effects);
 if(item.meta?.hybrid?.enabled)mixSelectivePatches(clean,item.meta.hybrid.patches,item.meta.effects.strength);
 if(mode==='speech')return clean.map((channel,i)=>{
  const out=new Float32Array(channel.length),src=original[Math.min(i,original.length-1)];
  for(let j=0;j<out.length;j++)out[j]=(src[j]||0)-channel[j];
  return out;
 });
 return clean;
}
function updateListeningButtons(){
 for(const name of ['original','clean','speech']){
  $(name+'-btn').classList.toggle('selected',mode===name);
  $(name+'-btn').disabled=!activeStudy;
 }
 $('clean-btn').textContent='Без голосов';
 $('speech-btn').textContent='Удалённая часть';
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
$('speech-btn').onclick=()=>setMode('speech');
function updateEnhancementUI(){
 const item=studyResults.get(activeStudy),state=item?.meta?.effects;
 const available=!!item?.meta?.layers;
 for(const [key,id] of [['spectral','enhance-spectral'],['reconstruct','enhance-reconstruct'],['center','enhance-center']]){
  $(id).disabled=!available||(key==='center'&&original?.length!==2);
  $(id).checked=state?.[key]??true;
 }
 const centerAvailable=available&&original?.length===2;
 $('center-suppression').disabled=!centerAvailable||!state?.center;
 $('center-suppression').value=String(state?.centerAmount??35);
 text('center-value',$('center-suppression').value+'%');
 $('scnet-strength').disabled=!available;
 $('enhance-disable-all').disabled=!available;
 const enabled=available&&(state.spectral||state.center&&centerAvailable||state.reconstruct);
 text('enhance-disable-all',enabled?'Выключить все старые фильтры':'Включить все старые фильтры');
 const textureFound=available&&(item.meta.textureCoverage??0)>0;
 for(const [key,id] of [['artifact','repair-noise'],['texture','repair-texture']]){
  $(id).disabled=!available||(key==='texture'&&!textureFound);
  $(id).checked=!!state?.[key]&&(key!=='texture'||textureFound);
 }
 for(const [key,id,label] of [['artifactAmount','repair-level','repair-level-value'],
  ['textureAmount','texture-level','texture-level-value']]){
  $(id).value=String(state?.[key]??(key==='artifactAmount'?85:45));
  $(id).disabled=!available||(key==='artifactAmount'?!state?.artifact:!state?.texture||!textureFound);
  text(label,$(id).value+'%');
 }
 $('repair-off-all').disabled=!available;
 text('repair-off-all',state?.artifact||(state?.texture&&textureFound)?
  'Выключить новые фильтры':'Включить подавление жужжания');
 text('repair-note',!available?'После разделения аудио подготовим оба варианта.':
  textureFound?'Фон найден для '+Math.round(item.meta.textureCoverage*100)+'% коротких окон сцены. Новые фильтры можно сравнивать без повторного прогона.':
   'Рядом нет надёжных участков без вокала. Подстановка фона недоступна для этого фрагмента, подавление призвуков работает.');
 text('enhance-ready',available?'5 DSP-слоёв готовы':'После обработки');
 text('enhance-info',available?
  'DSP: '+elapsed((item.meta.dspMs||0)/1000)+'. Переключатели меняют только сведение аудио, без расчёта модели или спектральных масок.':
  'После обработки подготовим все варианты один раз.');
}
function refreshEnhancedPreview(){
 if(!activeStudy||!studyResults.get(activeStudy)?.meta?.layers)return;
 if(mode!=='clean'){mode='clean';updateListeningButtons();}
 clearTimeout(editTimer);
 editTimer=setTimeout(()=>{void previewAudio()},80);
}
for(const [key,id] of [['spectral','enhance-spectral'],['center','enhance-center'],['reconstruct','enhance-reconstruct']]){
 $(id).onchange=()=>{
  const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
  item.meta.effects[key]=$(id).checked;
  updateEnhancementUI();refreshEnhancedPreview();
 };
}
$('enhance-disable-all').onclick=()=>{
 const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
 const state=item.meta.effects;
 const next=!(state.spectral||state.reconstruct||(state.center&&original?.length===2));
 state.spectral=next;state.reconstruct=next;state.center=next;
 updateEnhancementUI();refreshEnhancedPreview();
};
$('center-suppression').oninput=()=>{
 const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
 item.meta.effects.centerAmount=Number($('center-suppression').value);
 updateEnhancementUI();refreshEnhancedPreview();
};
function updateHybridUI(){
 const item=studyResults.get(activeStudy);
 const isUMX=!!item&&item.meta?.model==='umxhq';
 show('target-scnet-panel',isUMX);
 const usable=isUMX&&!!item.meta?.layers&&!!range&&range.duration>=3;
 const busy=studyBusy||exporting||!!worker;
 $('target-scnet-run').disabled=!usable||busy;
 $('target-scnet-budget').disabled=!usable||busy;
 $('target-scnet-mode').disabled=!usable||busy;
 const hybrid=isUMX?item.meta.hybrid:null;
 $('target-scnet-enabled').disabled=!hybrid||busy;
 $('target-scnet-enabled').checked=!!hybrid?.enabled;
 text('target-scnet-run',hybrid?'Пересчитать выбранные участки':'Найти и обработать участки');
 if(!isUMX)return;
 if(hybrid){
  const ranges=hybrid.segments.map(p=>elapsed(p.start/RATE)+'–'+elapsed(p.end/RATE)).join(', ');
  text('target-scnet-status', (hybrid.cached?'SCNet из кэша':'SCNet '+elapsed(hybrid.timeMs/1000))+' · обработано исходника '+
    elapsed(hybrid.packedSeconds)+' (целевые '+elapsed(hybrid.selectedSeconds)+') · '+ranges+
    '. '+(hybrid.enabled?'Гибрид включён.':'Сейчас звучит только Open-Unmix.'));
 }else if(!usable)text('target-scnet-status','Для автоматического поиска нужен фрагмент не короче 3 секунд.');
 else text('target-scnet-status',item.meta.hybridMessage|| (busy?'Выполняется обработка...':
  'Поиск по вокальной дорожке и остаточным артефактам. SCNet получит только найденные отрывки исходного видео.'));
}
async function runSelectiveSCNet(){
 const item=studyResults.get(activeStudy);
 if(!item||item.meta?.model!=='umxhq'||worker||studyBusy||exporting||!range)return;
 clearError();const controller=new AbortController();abort=controller;
 const id=++serial;studyBusy=true;uiBusy(true);updateHybridUI();
 const previous=item.meta.hybrid;
 try{
  step('Ищем остатки голоса','Анализируем локальную оценку вокала и тональных артефактов.');
  let segments;
  if($('target-scnet-mode').value==='manual'){
   const cursor=Math.max(0,Math.min(range.duration,video.currentTime-range.start));
   const duration=Math.min(5,range.duration),frames=Math.round(duration*RATE);
   const start=Math.max(0,Math.min(item.meta.base[0].length-frames,Math.round((cursor-duration/2)*RATE)));
   segments=[{start,end:start+frames,score:1}];
  }else segments=selectProblemSegments(item.meta.base,item.meta.vocals,item.meta.layers.artifact,{
   budgetSeconds:Number($('target-scnet-budget').value),rate:RATE
  });
  if(!segments.length){
   item.meta.hybridMessage='Не найдено достаточно убедительных речевых артефактов. Open-Unmix сохранён без изменений.';
   text('target-scnet-status',item.meta.hybridMessage);
   return;
  }
  item.meta.hybridMessage='';
  const payload=packProblemSegments(item.meta.base,segments,{rate:RATE});
  text('target-scnet-status','Выбрано '+segments.length+' участков · SCNet получит '+elapsed(payload.packedSeconds)+
   ', включая контекст и паузы между участками.');
  step('Точечная SCNet','Анализ '+segments.length+' участков исходного звука · '+elapsed(payload.packedSeconds));
  // SCNet takes ORIGINAL excerpts, not UMX-cleaned audio: it is trained on mixtures.
  // Reuse a previous full independent SCNet stem when present in this scene.
  const fullSCNet=pipelineRuns.get(makeRunKey('scnet'));
  let scnetVocals,seconds;
  if(fullSCNet){
   scnetVocals=payload.packed.map(ch=>new Float32Array(ch.length));
   for(const section of payload.layout)for(let ch=0;ch<scnetVocals.length;ch++)
    scnetVocals[ch].set(fullSCNet.vocals[ch].subarray(section.sourceStart,section.sourceEnd),section.packedOffset);
   seconds=0;
  }else{
   const reply=await separate(payload.packed,mobile?5:10,id,'scnet',1);
   scnetVocals=reply.stems.vocals;seconds=reply.seconds;
  }
  if(controller.signal.aborted||id!==serial)return;
  const patches=composeSelectivePatches(payload.layout,scnetVocals,item.meta.vocals,{rate:RATE});
  item.meta.hybrid={patches,segments,timeMs:seconds*1000,cached:!!fullSCNet,
   packedSeconds:payload.packedSeconds,selectedSeconds:payload.selectedSeconds,enabled:true};
  text('export-status','Точечная SCNet готова: можно переключать и экспортировать итоговый гибрид.');
  await previewAudio();
  step('Готово','Гибрид Open-Unmix + точечная SCNet подготовлен.',1);
 }catch(e){
  if(id===serial&&e.name!=='AbortError'){
   item.meta.hybrid=previous;
   error('Точечная SCNet: '+(e.message||String(e)));
  }
 }finally{
  if(abort===controller)abort=null;
  if(id===serial){studyBusy=false;uiBusy(false);updateHybridUI()}
 }
}
$('target-scnet-run').onclick=()=>{void runSelectiveSCNet()};
$('target-scnet-enabled').onchange=()=>{
 const item=studyResults.get(activeStudy);
 if(!item?.meta?.hybrid)return;
 item.meta.hybrid.enabled=$('target-scnet-enabled').checked;
 updateHybridUI();refreshEnhancedPreview();
};
// The two new algorithms only mix cached correction channels.
for(const [key,id] of [['artifact','repair-noise'],['texture','repair-texture']]){
 $(id).onchange=()=>{
  const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
  item.meta.effects[key]=$(id).checked;
  updateEnhancementUI();refreshEnhancedPreview();
 };
}
for(const [key,id] of [['artifactAmount','repair-level'],['textureAmount','texture-level']]){
 $(id).oninput=()=>{
  const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
  item.meta.effects[key]=Number($(id).value);
  updateEnhancementUI();refreshEnhancedPreview();
 };
}
$('repair-off-all').onclick=()=>{
 const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
 const state=item.meta.effects;
 const next=!(state.artifact||(state.texture&&(item.meta.textureCoverage??0)>0));
 state.artifact=next;state.texture=false; // Poor musical texture substitutions stay opt-in.
 updateEnhancementUI();refreshEnhancedPreview();
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
$('wav-btn').onclick=()=>{if(!activeStudy)return;try{download(wavPCM16(getMix()),fileName+'-'+(mode==='speech'?'isolated-dialogue':mode==='original'?'original':'no-dialogue')+'.wav')}catch(e){error(e.message)}};
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
  download(output,fileName+'-'+(mode==='speech'?'dialogue':mode==='original'?'original':'no-dialogue')+'.'+ext);
  text('export-status','Сохранено '+(output.size/1048576).toFixed(1)+' МиБ · '+ext.toUpperCase());
 }catch(e){if(e.name!=='AbortError')error(e.message);else text('export-status','Экспорт прерван.')}
 finally{cancelAnimationFrame(frame);video.pause();if(recorder?.state==='recording')try{recorder.stop()}catch{}stream?.getTracks().forEach(t=>t.stop());if(ctx)await ctx.close().catch(()=>{});if(abort===controller)abort=null;exporting=false;$('video-btn').disabled=false;$('wav-btn').disabled=false}
}
$('video-btn').onclick=()=>{void exportVideo()};

// Stage results are held in memory for the selected scene only. Switching
// media or time range clears results and intermediate neural caches.
function clearStudy(){
 studyResults.clear();pipelineRuns.clear();
 studySignature='';activeStudy=null;
 show('scnet-tuning',false);$('study-csv').disabled=true;updateEnhancementUI();updateHybridUI();
 text('study-active-status','Готовые версии одной сцены появятся здесь.');
 renderStudyResults();
}
function registerStudyResult(id,clean,processingMs=null,{source='local',label=null,meta={}}={}){
 if(!routeById(id))
  throw Error('Недопустимый идентификатор результата.');
 if(!original?.length||!range)throw Error('Нет исходного звука сцены.');
 const canonical=stereoPCM(clean),target=Math.round(range.duration*RATE);
 if(canonical.some(ch=>Math.abs(ch.length-target)>.2*RATE))
  throw Error('Нейросеть вернула несовпадающую длительность.');
 const normalized=canonical.map(ch=>{
  const arr=new Float32Array(target);arr.set(ch.subarray(0,target));return arr;
 });
 const metrics=comparisonMetrics(stereoPCM(original),normalized,RATE);
 const timeMs=processingMs===null?null:Number(processingMs);
 const timing=timeMs===null?null:calculateSpeed(range.duration,timeMs);
 if(!studyResults.has(id)&&studyResults.size>=(mobile?4:10)){
  const old=[...studyResults.keys()].find(k=>k!==activeStudy)||[...studyResults.keys()][0];
  if(old)studyResults.delete(old);
 }
 // Avoid retaining a redundant 32 MiB PCM copy per 90-second stereo model.
 // The result is synthesized from cached source, vocals and DSP layers.
 studyResults.set(id,{id,label:label||routeById(id)?.label||id,source,
  timeMs,metrics,timing,meta});
 renderStudyResults();
 $('study-csv').disabled=!studyResults.size;
}
function renderStudyResults(){
 const root=$('study-results');root.replaceChildren();
 if(!studyResults.size){
  const p=document.createElement('p');p.className='hint';
  p.textContent='Пока нет результатов. Выбери нейросеть и запусти обработку.';
  root.append(p);
 }else{
  for(const item of studyResults.values()){
   const b=document.createElement('button');b.type='button';
   b.className='study-choice'+(activeStudy===item.id?' selected':'');
   b.setAttribute('role','listitem');b.setAttribute('aria-pressed',String(activeStudy===item.id));
   const name=document.createElement('strong');name.textContent=item.label;
   const diff=document.createElement('span');diff.textContent='Уровень '+(item.metrics.changeDb>0?'+':'')+
    item.metrics.changeDb.toFixed(1)+' дБ относительно оригинала';
   const time=document.createElement('span');
   time.textContent=item.timeMs===null?'Время не измерено':
    'Нейросеть '+elapsed(item.timeMs/1000)+' + DSP '+elapsed((item.meta?.dspMs||0)/1000)+' · RTF '+item.timing.rtf.toFixed(2)+
    ' · на 90 с ≈ '+elapsed(item.timing.at90Seconds);
   const source=document.createElement('span');
   source.textContent=item.meta?.cached?'Повторное использование модели':'Независимый проход по оригиналу';
   b.append(name,diff,time,source);
   b.onclick=()=>{void selectStudyResult(item.id)};
   root.append(b);
  }
 }
}
async function selectStudyResult(id,rebuild=true){
 const item=studyResults.get(id);
 if(!item||!original||!range)return;
 pause();activeStudy=id;mode='clean';
 show('empty-state',false);show('result-details',true);
 $('video-btn').disabled=false;$('wav-btn').disabled=false;
 const vocal=!!item.meta?.vocals;
  show('scnet-tuning',vocal);
 text('vocal-strength-label',item.meta?.model==='umxhq'?'Удаление вокала Open-Unmix':'Удаление голосов SCNet');
 text('vocal-warning','100% — полное вычитание вокального стема. 105–150% — усиление с риском искажения музыки. Нейросеть повторно не запускается.');
 if(vocal){
  $('scnet-strength').value=String(Math.round((item.meta.effects?.strength??1)*100));
  text('scnet-strength-value',$('scnet-strength').value+'%');
 }
 updateEnhancementUI();updateHybridUI();
 text('result-state',item.label);
 text('inference-time',item.timeMs===null?'—':elapsed(item.timeMs/1000));
 text('speed-factor',item.timing?item.timing.rtf.toFixed(2)+'× RTF':'—');
 text('scene-length',elapsed(range.duration));
 text('stem-diagnostics','«Удалённая часть» — оценка модели, не гарантированно исключительно речь.');
 text('study-active-status','Сейчас слушаешь '+item.label+'. Выбери другую версию для сравнения.');
 updateListeningButtons();renderStudyResults();
 if(video.src!==fileURL){
  video.src=fileURL;video.load();
  video.addEventListener('loadedmetadata',()=>{if(range)video.currentTime=range.start},{once:true});
 }
 if(rebuild)await previewAudio();
}
$('scnet-strength').oninput=()=>{
 const item=studyResults.get(activeStudy);if(!item?.meta?.effects)return;
 item.meta.effects.strength=Number($('scnet-strength').value)/100;
 text('scnet-strength-value',$('scnet-strength').value+'%');
 refreshEnhancedPreview();
};
$('study-csv').onclick=()=>{
 if(!studyResults.size||!range)return;
 const q=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const rows=[['Модель','Фрагмент, с','Время модели, с','Время DSP, с','RTF','Оценка 90 с, с','Изменение RMS, дБ','Пик результата, дБ','Из кэша','Удаление голоса, %','Спектр','Адаптивный центр','Реконструкция','Центр, %','Призвуки','Сила призвуков, %','Фон','Сила фона, %','Покрытие фоном, %']];
 for(const item of studyResults.values())rows.push([
  item.label,range.duration,item.timeMs===null?'':(item.timeMs/1000).toFixed(2),(item.meta?.dspMs/1000||0).toFixed(2),
  item.timing?.rtf.toFixed(3)||'',item.timing?.at90Seconds.toFixed(2)||'',
  item.metrics.changeDb,item.metrics.peakDb.toFixed(2),item.meta?.cached?'да':'нет',
  Math.round((item.meta?.effects?.strength??1)*100),item.meta?.effects?.spectral?'да':'нет',
  item.meta?.effects?.center?'да':'нет',item.meta?.effects?.reconstruct?'да':'нет',item.meta?.effects?.centerAmount??35,
  item.meta?.effects?.artifact?'да':'нет',item.meta?.effects?.artifactAmount??85,
  item.meta?.effects?.texture?'да':'нет',item.meta?.effects?.textureAmount??45,
  Math.round((item.meta?.textureCoverage||0)*100)
 ]);
 download(new Blob(['\uFEFF'+rows.map(row=>row.map(q).join(',')).join('\r\n')],{
  type:'text/csv;charset=utf-8'}),fileName+'-two-models.csv');
};
renderStudyResults();

// Install the versioned app service worker. The shell does not register an
// isolated quick app's SW on its behalf.
if('serviceWorker' in navigator)
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

window.addEventListener('pagehide',()=>{worker?.terminate();abort?.abort();pause();revoke(fileURL);revoke(audioURL)});
if(mobile)$('chunk-size').value='5';
uiBusy(false);
