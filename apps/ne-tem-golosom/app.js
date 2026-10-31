import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createTrimRange} from './trim-range.js';
import {meterHeights} from './studio-feedback.js';
import {microphoneRequest,createVoiceRecorder,reconcileRecordingEnd} from './recording-audio.js';
import {MAX_AUDIO_BYTES,MAX_INCOMING_TRANSFERS,validAudioEnvelope,validVideoEnvelope,canAcceptVoice} from './media-protocol.js';
import {renderPremiere,supportsPremiereExport,premiereFilename} from './premiere-export.js';
import {TimelineHistory,snapshotClips,spliceRecording,layerTimeline,packTimeline,unpackTimeline,editClip,replaceSelectedRecording,MIN_CLIP_SECONDS} from './timeline-model.js';
import {VOICE_EFFECTS,VOICE_EFFECT_GROUPS,normalizeVoiceEffect,connectVoiceEffect} from './voice-effects.js';
import {clipMix,envelopeGain} from './clip-mix.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createRoomRecovery} from './room-recovery.js';
import {FILM_MODES,estimateFilmTimes,estimatePreparationTimes,lowMemoryRecommended,cleanFilmSound} from './film-cleanup.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {MAX_ROOM_VIDEO_BYTES,MAX_SOURCE_VIDEO_BYTES,formatVideoBytes,estimateVideoBytes,planVideoPreparation,mediaSettingsKey,supportsVideoExport,measureVideoDuration,exportVideo} from './media-lab.js';
installMobileRuntime();

const $=id=>document.getElementById(id);

// The editor's two coordinated work surfaces share one fixed-size desktop
// dock. Reparent existing elements; keep their IDs, listeners and real logic.
function mountEditorWorkspace(){
 const desk=$('screen-editor')?.querySelector('.editor-desk');
 if(!desk||desk.querySelector('.editor-workspace'))return;
 const workspace=document.createElement('div');
 workspace.className='editor-workspace';
 const cutting=document.createElement('div');
 cutting.className='editor-cutting';
 const inspector=document.createElement('aside');
 inspector.className='editor-inspector';
 inspector.setAttribute('aria-label','Настройки выбранной реплики');
 for(const selector of ['.time-row','.timeline-tools','.timeline-viewport','.selected-clip-info','.edit-controls','.editor-bottom']){
  const node=desk.querySelector(':scope > '+selector);
  if(!node)throw Error('Не найден элемент монтажного пульта: '+selector);
  cutting.append(node);
 }
 const empty=document.createElement('div');
 empty.id='clip-inspector-empty';
 empty.className='clip-inspector-empty';
 empty.innerHTML='<strong>Настройки реплики</strong><span>Выбери запись на ленте: здесь появятся громкость, плавные переходы и эффекты голоса.</span>';
 inspector.append(empty);
 for(const id of ['clip-mixer','voice-effects']){
  const node=$(id);
  if(!node)throw Error('Не найдена панель '+id);
  inspector.append(node);
 }
 workspace.append(cutting,inspector);
 desk.replaceChildren(workspace);
}
mountEditorWorkspace();

const STORE='pocket-works:ne-tem-golosom:';
const debugPlay=new URLSearchParams(location.search).get('debug')==='play';
const LIBRARY=[
 {id:'wing-launch',title:'WING IT! · ПОЛЁТ',sub:'2023 · Blender Studio · CC BY 4.0',short:'WING / 01',duration:55,start:44,roles:['Кот','Пёс','Курица'],src:'https://commons.wikimedia.org/wiki/Special:Redirect/file/WING_IT!_-_Blender_Open_Movie-full_movie.webm'},
 {id:'wing-chaos',title:'WING IT! · ХАОС',sub:'2023 · Blender Studio · CC BY 4.0',short:'WING / 02',duration:60,start:120,roles:['Кот','Пёс','Курица'],src:'https://commons.wikimedia.org/wiki/Special:Redirect/file/WING_IT!_-_Blender_Open_Movie-full_movie.webm'},
 {id:'bunny-forest',title:'BIG BUCK BUNNY · ЛЕС',sub:'2008 · Blender Foundation · CC BY 3.0',short:'BUNNY / 01',duration:60,start:210,roles:['Кролик','Белка','Два грызуна'],src:'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4'},
 {id:'bunny-revenge',title:'BIG BUCK BUNNY · МЕСТЬ',sub:'2008 · Blender Foundation · CC BY 3.0',short:'BUNNY / 02',duration:55,start:345,roles:['Кролик','Белка','Птицы'],src:'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4'},
 {id:'sprite-forest',title:'SPRITE FRIGHT · ЛЕС',sub:'2021 · Blender Studio · CC BY 4.0',short:'SPRITE / 01',duration:55,start:90,roles:['Подросток','Подруга','Гриб'],src:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm'},
 {id:'sprite-panic',title:'SPRITE FRIGHT · ПАНИКА',sub:'2021 · Blender Studio · CC BY 4.0',short:'SPRITE / 02',duration:50,start:300,roles:['Гриб','Человек','Друг'],src:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm'}
];
const POSTERS={
 'wing-launch':'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/WING_IT%21_-_Blender_Open_Movie-full_movie.webm/960px--WING_IT%21_-_Blender_Open_Movie-full_movie.webm.jpg',
 'wing-chaos':'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/WING_IT%21_-_Blender_Open_Movie-full_movie.webm/960px--WING_IT%21_-_Blender_Open_Movie-full_movie.webm.jpg',
 'sprite-forest':'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm/960px--Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm.jpg',
 'sprite-panic':'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm/960px--Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm.jpg',
 'bunny-forest':'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/Big_Buck_Bunny_alt.webm/960px--Big_Buck_Bunny_alt.webm.jpg',
 'bunny-revenge':'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/Big_Buck_Bunny_alt.webm/960px--Big_Buck_Bunny_alt.webm.jpg'
};
const colors=['#db805f','#91ada4','#e5be6f','#ae9ec5','#8ca7c1','#c39f89'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmt=t=>{t=Math.floor(Math.max(0,t)||0);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')};
const fmtFine=t=>{const tenths=Math.round(Math.max(0,t||0)*10);return String(Math.floor(tenths/600)).padStart(2,'0')+':'+String(Math.floor(tenths/10)%60).padStart(2,'0')+'.'+(tenths%10)};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const mem=new Map(),session={
 getItem(k){try{return sessionStorage.getItem(STORE+k)}catch{return mem.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(STORE+k,v)}catch{mem.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(STORE+k)}catch{mem.delete(k)}}
};
let sound=true,audioContext=null,identity=null,name='Гость',mode='solo',view='home',selected=null,sourceBlob=null,scene=null;
let relayQueue=Promise.resolve(),relayInbox=new Map();
let videoExportController=null,videoExportBlob=null,videoExportUrl=null,trimRange=null,encodedCache=null;
let filmCleanController=null,filmPreparedBlob=null,filmLocalSource=null,scenePrepareStep='trim';
const FILM_BENCH_KEY=STORE+'film-bench-v2';
let filmBench={};
try{const value=JSON.parse(localStorage.getItem(FILM_BENCH_KEY)||'{}');
 if(value&&typeof value==='object')filmBench=value;
}catch{}
const filmBenchmarkOpts=()=>({
 umx90:Number.isFinite(filmBench.umx90)&&filmBench.umx90>0?filmBench.umx90:5,
 scnet90:Number.isFinite(filmBench.scnet90)&&filmBench.scnet90>0?filmBench.scnet90:150
});
function rememberFilmTimes(plan,duration){
 for(const name of ['Open-Unmix','SCNet']){
  const seconds=plan.times.filter(x=>x.name===name).reduce((n,x)=>n+x.seconds,0);
  if(!seconds)continue;
  const modeled=name==='Open-Unmix'||plan.mode==='scnet'?duration:plan.packedSeconds;
  if(modeled<3)continue;
  const estimate=Math.round(Math.min(3600,Math.max(1,seconds*90/modeled)));
  const key=name==='Open-Unmix'?'umx90':'scnet90';
  // Keep the latest measured device runtime, not an ideal desktop benchmark.
  filmBench[key]=estimate;
 }
 try{localStorage.setItem(FILM_BENCH_KEY,JSON.stringify(filmBench))}catch{}
}
let premiereExportController=null,premiereResultUrl=null,premiereExportGeneration=0,premiereLocalCopy=null,premiereExportNotice='';
const qualityNames=['Экономное','Компактное','Сбалансированное','Высокое','Максимальное'];
let net=null,me='',room='',state=null,peers=new Map(),localClips=[],remoteClips=[],editHistory=new TimelineHistory(),selectedClip=null,record=null,pendingRecording=null,preroll=null,playing=false,wasPlaying=false,filmSound=false,sentPremiere=false,projectKey='',initializedScene='',toastTimer=0,timelineZoom=1,clipDrag=null,skipTimelineClick=false,micPending=false;
let micMonitor=null,saveRevision=0,readyPending=false,voiceFxContext=null,voiceFxExpanded=false,interruptedVoiceTake=false;
let onlineIds=null,networkInterrupted=false,retryRoomAction='create',retryCheckpoint=null;
let pendingScenePicker=false,premiereAB='dub';
function roomCheckpoint(){
 const identityKey=identity?.accountId||'guest';
 let storage=session;
 if(identityKey!=='guest')try{storage=localStorage}catch{}
 return createRoomRecovery({storage,identityKey});
}
function saveRoomCheckpoint(){
 if(room&&net?.token&&['host','guest'].includes(mode))
  roomCheckpoint().save({roomId:room,token:net.token,mode});
}
function clearRoomCheckpoint(){roomCheckpoint().clear()}
function sceneDraftKey(){
 return scene&&room?(debugPlay?'debug::':'')+room+'::'+scene.id+'::'+scene.start+'::'+scene.duration+'::'+(state?.mediaEpoch||1)+'::'+(state?.round||1):'';
}
function connectionNotice(){
 const offline=state?.players?.filter(p=>p.id!==me&&onlineIds&&!onlineIds.has(p.id))||[];
 const message=networkInterrupted
  ?'Связь потеряна · восстанавливаем комнату. Сохранённые реплики на устройстве.'
  :offline.length
   ?'Нет связи: '+offline.map(p=>p.name).join(', ')+' · места сохранены, можно дождаться возвращения.'
   :'';
 const banner=$('connection-banner');
 banner.textContent=message;
 banner.classList.toggle('hidden',!message);
}
async function draftReadCompatible(key){
 const saved=await draftRead(key);
 if(saved||debugPlay||state?.round||!scene||!room)return saved;
 // Migrate existing v3 sessions that predate round/epoch draft keys.
 return draftRead(room+'::'+scene.id+'::'+scene.start+'::'+scene.duration);
}
async function restoreLobbyMedia(){
 if(!room||!scene?.custom||sourceBlob||mode==='host'&&['library','trim'].includes(view))return;
 const key=sceneDraftKey();
 try {
  const old=await draftReadCompatible(key);
  if(mode==='host'&&['library','trim'].includes(view))return;
  if(old?.video instanceof Blob){
   sourceBlob=old.video;writtenVideoByKey.set(key,sourceBlob);setVideoSources();
   if(meHost())for(const p of state.players)if(p.id!==me)sendVideoTo(p.id);
  }
 }catch{}
 if(!sourceBlob&&meHost())toast('Видео не найдено на устройстве. Выбери исходный файл в комнате повторно.');
 if(state?.phase==='lobby'&&view==='room')roomUI();
}
function setDraftStatus(state){
 const copy={idle:'Локальный черновик',saving:'Сохраняем…',saved:'Сохранено',error:'Не сохранено'};
 $('draft-status').dataset.saveState=state;
 $('draft-status').textContent=copy[state]||copy.idle;
}
function setNetStatus(state,label){
 $('net-pill').dataset.netState=state;
 $('net-pill').textContent=label;
}
function stopMicMonitor(){
 const m=micMonitor;micMonitor=null;
 if(m){
  cancelAnimationFrame(m.frame);
  try{m.source.disconnect();m.analyser.disconnect()}catch{}
  void m.context.close().catch(()=>{});
 }
 $('mic-meter').classList.add('hidden');
}
function startMicMonitor(stream){
 stopMicMonitor();
 let context=null;
 try{
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return;
  context=new Context();
  const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
  analyser.fftSize=256;analyser.smoothingTimeConstant=.8;
  source.connect(analyser); // Never pipe live microphone audio to speakers.
  const samples=new Uint8Array(analyser.fftSize);
  const bars=[...$('mic-meter').children],m={context,source,analyser,frame:0};
  micMonitor=m;$('mic-meter').classList.remove('hidden');
  const measure=()=>{
   if(micMonitor!==m)return;
   analyser.getByteTimeDomainData(samples);
   const heights=meterHeights(samples,bars.length);
   for(let i=0;i<bars.length;i++){
    bars[i].style.height=heights[i]+'px';
    bars[i].classList.toggle('active',heights[i]>5);
   }
   m.frame=requestAnimationFrame(measure);
  };
  void context.resume().catch(()=>{});
  m.frame=requestAnimationFrame(measure);
 }catch{if(context&&!micMonitor)void context.close().catch(()=>{});stopMicMonitor()}
}
const roomsOrigin=location.origin+'/pocketnet';
const sceneSource=s=>LIBRARY.find(x=>x.id===s?.id)?.src||null;
const meHost=()=>!!state&&me===state.host;
const ownRole=()=>mode==='solo'?'Все роли':(state?.assignments?.[me]||'Актёр');
let lastToastText='',lastToastAt=0;
function toast(s){
 if(s===lastToastText&&Date.now()-lastToastAt<8000)return;
 lastToastText=s;lastToastAt=Date.now();
 const el=$('toast');el.textContent=s;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500)}
function cue(which){if(!sound)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioContext ||=new C();audioContext.resume();const now=audioContext.currentTime,o=audioContext.createOscillator(),n=audioContext.createBufferSource(),g=audioContext.createGain(),filter=audioContext.createBiquadFilter();const data=audioContext.createBuffer(1,2205,audioContext.sampleRate),arr=data.getChannelData(0);for(let i=0;i<arr.length;i++)arr[i]=(Math.random()*2-1)*Math.exp(-i/750);n.buffer=data;filter.type='bandpass';filter.frequency.value=which==='start'?1050:420;const f=which==='stop'?160:which==='ready'?600:which==='count'?780:300;o.type='triangle';o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(f*.74,now+.12);g.gain.setValueAtTime(.02,now);g.gain.exponentialRampToValueAtTime(.0001,now+.17);o.connect(g);n.connect(filter).connect(g);g.connect(audioContext.destination);o.start(now);n.start(now);o.stop(now+.18);n.stop(now+.06)}catch{}}
function show(id){
 const changed=view!==id;
 view=id;
 for(const el of document.querySelectorAll('.screen'))
   el.classList.toggle('hidden',el.id!=='screen-'+id);
 document.body.classList.toggle('editing',id==='editor');
 if(changed){
   window.scrollTo(0,0);
   const active=document.getElementById('screen-'+id);
   active?.setAttribute('tabindex','-1');
   active?.focus({preventScroll:true});
 }
}
function toggleSound(){sound=!sound;try{localStorage.setItem(STORE+'sound',sound?'1':'0')}catch{}$('sound-label').textContent=sound?'вкл.':'выкл.';$('sound-btn').setAttribute('aria-pressed',String(sound))}
try{sound=localStorage.getItem(STORE+'sound')!=='0'}catch{}$('sound-label').textContent=sound?'вкл.':'выкл.';$('sound-btn').setAttribute('aria-pressed',String(sound));

function db(){
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(STORE+'drafts',2);
   req.onupgradeneeded=()=>{
     if(!req.result.objectStoreNames.contains('drafts'))
       req.result.createObjectStore('drafts',{keyPath:'key'});
     if(!req.result.objectStoreNames.contains('media'))
       req.result.createObjectStore('media',{keyPath:'key'});
   };
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
   req.onblocked=()=>reject(Error('Закрой другие вкладки игры, чтобы обновить хранилище.'));
 });
}
async function draftRead(key){
 try{
   const d=await db();
   try{
     return await new Promise((resolve,reject)=>{
       const tx=d.transaction(['drafts','media'],'readonly');
       let saved=null,media=null;
       tx.objectStore('drafts').get(key).onsuccess=e=>{saved=e.target.result||null};
       tx.objectStore('media').get(key).onsuccess=e=>{media=e.target.result||null};
       tx.oncomplete=()=>resolve(saved?{...saved,video:media?.video||saved.video||null,videoInMedia:media?.video instanceof Blob}:null);
       tx.onerror=()=>reject(tx.error);
       tx.onabort=()=>reject(tx.error||Error('Не удалось прочитать черновик'));
     });
   }finally{d.close()}
 }catch(e){throw Error('Не удалось прочитать черновик. '+(e?.message||'Проверь доступ к хранилищу.'))}
}
// This tracks the Blob identity already persisted in the separate media store.
// Editing a sentence never rewrites a 96 MiB source video.
let saveQueue=Promise.resolve(),restoreGeneration=0;
const writtenVideoByKey=new Map();
async function draftWrite(){
 if(!projectKey||!scene)return true;
 const key=projectKey,video=scene.custom&&sourceBlob instanceof Blob?sourceBlob:null;
 const revision=++saveRevision;
 if(view==='editor')setDraftStatus('saving');
 const entry={key,scene:{...scene},timeline:packTimeline(localClips,editHistory,selectedClip),
  updated:Date.now()};
 const operation=saveQueue.then(async()=>{
   const needsVideo=!!video&&writtenVideoByKey.get(key)!==video;
   const d=await db();
   try{
     await new Promise((resolve,reject)=>{
       const tx=d.transaction(needsVideo?['drafts','media']:['drafts'],'readwrite');
       tx.oncomplete=()=>{
         if(needsVideo)writtenVideoByKey.set(key,video);
         resolve();
       };
       tx.onerror=()=>reject(tx.error||Error('Ошибка сохранения'));
       tx.onabort=()=>reject(tx.error||Error('Запись отменена'));
       tx.objectStore('drafts').put(entry);
       if(needsVideo)tx.objectStore('media').put({key,video,updated:entry.updated});
     });
   }finally{d.close()}
 });
 saveQueue=operation.catch(()=>{});
 try{
  await operation;
  if(revision===saveRevision&&key===projectKey&&view==='editor')setDraftStatus('saved');
  return true;
 }catch{
  if(revision===saveRevision&&key===projectKey&&view==='editor')setDraftStatus('error');
  toast('Черновик не сохранился. Проверь свободное место.');
  return false;
 }
}
function disposeClip(c){
 try{c.audio?.pause();c.fxCleanup?.();c.fxGain?.disconnect()}catch{}
 if(c.url)URL.revokeObjectURL(c.url);
}
function disposeLocalClips(){for(const c of localClips)disposeClip(c)}
function cleanAudios(){
 disposeLocalClips();
 for(const c of remoteClips)disposeClip(c);
}
function makeClip(base){
 const url=URL.createObjectURL(base.blob),audio=new Audio(url);
 audio.preload='auto';return {...base,...clipMix(base),fx:normalizeVoiceEffect(base.fx),url,audio};
}
function ensureClipVoice(c){
 if(c.fxReady===c.fx)return;
 try{
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return;
  voiceFxContext ||=new Context();
  if(!c.fxSource)c.fxSource=voiceFxContext.createMediaElementSource(c.audio);
  if(!c.fxGain){c.fxGain=voiceFxContext.createGain();c.fxGain.connect(voiceFxContext.destination)}
  c.fxCleanup?.();
  c.fxCleanup=connectVoiceEffect(voiceFxContext,c.fxSource,c.fxGain,c.fx);
  c.fxReady=c.fx;
  void voiceFxContext.resume().catch(()=>{});
 }catch(e){console.warn('Voice effect unavailable',e)}
}
function setClips(items,selection=null){
 disposeLocalClips();
 localClips=items.map(makeClip);
 selectedClip=localClips.some(c=>c.id===selection)?selection:null;
 renderTimeline();
}
function undoEdit(){
 if(record||preroll||micPending||pendingRecording)return;
 const previous=editHistory.undo(localClips);if(!previous)return;
 stopAllPlayback();setClips(previous);void draftWrite();cue('stop');
}
function redoEdit(){
 if(record||preroll||micPending||pendingRecording)return;
 const next=editHistory.redo(localClips);if(!next)return;
 stopAllPlayback();setClips(next);void draftWrite();cue('ready');
}
async function restore(key){
 const request=++restoreGeneration;
 let old;
 try{
   // A just-finished recording may still be in the save queue.
   await saveQueue;
   old=await draftRead(key);
 }catch(e){
   if(request===restoreGeneration)toast(e?.message||'Не удалось открыть черновик.');
   return false;
 }
 if(request!==restoreGeneration)return false;
 projectKey=key;
 if(old?.scene?.id===scene?.id&&scene.custom&&old.videoInMedia&&old.video instanceof Blob)writtenVideoByKey.set(key,old.video);
 if(old?.scene?.id===scene?.id&&Array.isArray(old?.timeline?.clips)){
   const restored=unpackTimeline(old.timeline,scene.duration);
   editHistory=restored.history;setClips(restored.clips,restored.selected);
 }else if(old?.scene?.id===scene?.id&&Array.isArray(old?.clips)){
   editHistory=new TimelineHistory();
   const restored=unpackTimeline({clips:old.clips},scene.duration);
   setClips(restored.clips);
 }else{
   editHistory=new TimelineHistory();setClips([]);
 }
 if(old?.scene?.id===scene?.id&&scene.custom&&old.video instanceof Blob){
   sourceBlob=old.video;setVideoSources();
 }
 return true;
}
function setVideo(el,src){if(!src){el.removeAttribute('src');delete el.dataset.mediaSrc;el.load();return;}if(el.dataset.mediaSrc===src)return;el.dataset.mediaSrc=src;el.src=src;el.load()}
let liveUrl=null;
function setVideoSources(target){const src=scene?.custom?(sourceBlob?((liveUrl&&URL.revokeObjectURL(liveUrl)),liveUrl=URL.createObjectURL(sourceBlob),liveUrl):null):sceneSource(scene);
 const active=target===undefined?(view==='editor'?'stage-video':view==='premiere'?'premiere-video':'trim-video'):target;
 for(const id of ['trim-video','stage-video','premiere-video']){
  const el=$(id);
  if(id===active)setVideo(el,src);
  else if(el.hasAttribute('src')){el.pause();el.removeAttribute('src');delete el.dataset.mediaSrc;el.load()}
 }$('trim-video').onloadedmetadata=()=>seekVideo($('trim-video'),0);$('stage-placeholder').classList.toggle('hidden',!!src);if(src&&scene){for(const id of ['stage-video','premiere-video']){$(id).onloadedmetadata=()=>{seekVideo($(id),0);$('stage-placeholder').classList.add('hidden')};$(id).onerror=()=>{if(id==='stage-video'){$('stage-placeholder').textContent='Видео не открылось. Выбери другой фильм или загрузи MP4.';$('stage-placeholder').classList.remove('hidden')}}}}}
function seekVideo(video,local){if(!scene||!video.readyState)return;try{const limit=Number.isFinite(video.duration)?Math.max(0,video.duration-.03):scene.start+scene.duration;video.currentTime=clamp(scene.start+local,0,limit)}catch{}}
function time(video){return scene?clamp((video.currentTime||scene.start)-scene.start,0,scene.duration):0}

function library(backToReview=false){document.querySelector('#screen-library [data-back]').dataset.back=backToReview?'trim':room&&mode==='host'?'room':'home';const grid=$('scene-grid');$('scene-license').innerHTML='Озвученные отрывки являются переработкой оригиналов. Авторы: <a href="https://commons.wikimedia.org/wiki/File:WING_IT!_-_Blender_Open_Movie-full_movie.webm" target="_blank" rel="noopener">WING IT! — Blender Studio (CC BY 4.0)</a>, <a href="https://commons.wikimedia.org/wiki/File:Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm" target="_blank" rel="noopener">Sprite Fright — Blender Studio (CC BY 4.0)</a>, <a href="https://peach.blender.org/about/" target="_blank" rel="noopener">Big Buck Bunny — Blender Foundation (CC BY 3.0)</a>. <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>.';grid.innerHTML=LIBRARY.map((s,i)=>'<button class="scene-card" data-scene="'+esc(s.id)+'"><div class="scene-thumb">'+(POSTERS[s.id]?'<img src="'+esc(POSTERS[s.id])+'" loading="lazy" alt="Кадр фильма">':'')+'<strong>'+esc(s.short)+'</strong><span class="duration">'+fmt(s.duration)+'</span></div><b>'+esc(s.title)+'</b><small>'+esc(s.sub)+'</small></button>').join('');show('library')}
function selectScene(item,blob=null){
 if(filmCleanController)filmCleanController.abort();filmLocalSource=null;filmPreparedBlob=null;
 document.querySelector('input[name="film-sound-choice"][value="neural"]').checked=true;
 document.querySelector('input[name="film-clean-mode"][value="umx"]').checked=true;
 $('film-low-memory').checked=lowMemoryRecommended(navigator.deviceMemory,navigator.hardwareConcurrency);
 if($('film-low-memory').checked){
  if(Number($('media-resolution').value)>640)$('media-resolution').value='640';
  if(Number($('media-quality').value)>3)$('media-quality').value='3';
 }
 selected={...item,roles:[...item.roles]};sourceBlob=blob;encodedCache=null;
 if(blob&&selected.custom)selected.id='custom-'+uid();
 $('scene-title').value=selected.title;
 scene={...selected};clearExportPreview();setVideoSources('trim-video');renderRoles();show('trim');
 const start=selected.start||0,duration=selected.duration||60;
 trimRange.setRange(start,start+duration,selected.totalDuration||Math.max(90,start+duration));
 setScenePrepStep('trim');
}
function renderRoles(){$('role-tags').innerHTML=selected.roles.map((role,i)=>'<div class="role-tag"><input maxlength="35" aria-label="Персонаж '+(i+1)+'" data-role-index="'+i+'" value="'+esc(role)+'"><button data-remove-role="'+i+'" aria-label="Удалить роль">×</button></div>').join('')}
function validateScene(){const start=Number($('trim-start').value),duration=Number($('trim-length').value);const name=$('scene-title').value.trim();const roles=[...document.querySelectorAll('[data-role-index]')].map(el=>el.value.trim()).filter(Boolean);const v=$('trim-video');if(!name||!roles.length)return toast('Укажи название и хотя бы одного персонажа'),false;if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<10||duration>90)return toast('Длина сцены — от 10 до 90 секунд.'),false;if(Number.isFinite(v.duration)&&v.duration>0&&start+duration>v.duration+.1)return toast('Отрывок выходит за пределы видео.'),false;scene={...selected,title:name,start,duration,roles};return true}
function selectedSound(){
 return document.querySelector('input[name="film-sound-choice"]:checked')?.value||'neural';
}
function validTrim(){
 const start=Number($('trim-start').value),duration=Number($('trim-length').value);
 const video=$('trim-video');
 if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<10||duration>90){
  toast('Выбери отрывок длиной от 10 до 90 секунд.');return false;
 }
 if(Number.isFinite(video.duration)&&video.duration>0&&start+duration>video.duration+.1){
  toast('Выбранный отрывок выходит за пределы видео.');return false;
 }
 return true;
}
function hasSceneReview(){
 return videoExportBlob instanceof Blob||
  (selectedSound()==='original'&&!sourceBlob&&!filmLocalSource&&!!sceneSource(selected));
}
function updateFilmReview(){
 const kind=selectedSound();
 const method=kind==='neural'?(FILM_MODES.find(x=>x.id===filmMode())?.name||'Нейросеть'):
  kind==='mute'?'Без оригинального звука':'Исходный звук';
 $('film-review-description').textContent=videoExportBlob?
  'Послушай отрывок и сравни исходный и готовый варианты кнопками над видео.':
  'Ты выбрал исходный звук без нейросети. Проверь отрывок перед подтверждением.';
 $('film-review-source').textContent=selected?.title||'Сцена';
 $('film-review-method').textContent=method;
 const duration=Number($('trim-length').value);
 $('film-review-meta').textContent=fmt(duration)+' · '+
  (videoExportBlob?formatVideoBytes(videoExportBlob.size)+' · готово к отправке':
   'Встроенная сцена · без перекодирования');
 $('review-mute').classList.toggle('hidden',kind==='mute');
 $('review-original').classList.toggle('hidden',kind==='original');
}
function setScenePrepStep(step){
 if(!['trim','sound','review'].includes(step))throw Error('Неизвестный шаг подготовки');
 if(filmCleanController||videoExportController)return;
 if(step==='review'&&!hasSceneReview())return;
 scenePrepareStep=step;
 const soundStep=step==='sound',reviewStep=step==='review',trimStep=step==='trim';
 $('trim-range-root').classList.toggle('hidden',!trimStep);
 $('trim-sound-summary').classList.toggle('hidden',trimStep);
 $('trim-stage-note').classList.toggle('hidden',!trimStep);
 $('trim-instruction').classList.toggle('hidden',!trimStep);
 $('film-cleaner').classList.toggle('hidden',!soundStep);
 $('film-review').classList.toggle('hidden',!reviewStep);
 $('film-neural-options').classList.toggle('hidden',soundStep&&selectedSound()!=='neural');
 $('film-time-explain').classList.toggle('hidden',soundStep&&selectedSound()!=='neural');
 $('trim-roles').classList.toggle('hidden',!soundStep);
 $('trim-stage-title').textContent=trimStep?'1 / 3 · Выбрать отрывок':
  soundStep?'2 / 3 · Настроить звук':'3 / 3 · Предпросмотр';
 $('trim-stage-counter').textContent=trimStep?'СНАЧАЛА МОНТАЖ':soundStep?'ПОСЛЕ МОНТАЖА':'ПЕРЕД КОМНАТОЙ';
 if(!trimStep){
  const start=Number($('trim-start').value),length=Number($('trim-length').value);
  $('trim-sound-times').textContent=fmt(start)+' – '+fmt(start+length)+' · '+fmt(length);
 }
 if(reviewStep){
  updateFilmReview();
  showTrimPreview(videoExportBlob?'result':'source');
 }
 updateFilmCleaner();updateMediaLab();updateConfirmAction();
}
function updateSoundChoice(){
 const isNeural=selectedSound()==='neural';
 $('film-neural-options').classList.toggle('hidden',!isNeural);
 $('film-time-explain').classList.toggle('hidden',!isNeural);
 $('film-clean-status').textContent=isNeural?
  'Open-Unmix уберёт речь из выбранного отрывка. Музыка и эффекты останутся.':
  selectedSound()==='mute'?'Звуковая дорожка будет полностью удалена из выбранного отрывка.':
  'В выбранном отрывке сохранится оригинальный звук. Нейросеть не запускается.';
 if(videoExportBlob)clearExportPreview();
 updateFilmCleaner();updateMediaLab();updateConfirmAction();
}
async function prepareSelectedScene(){
 if(scenePrepareStep!=='sound')return false;
 if(!validTrim())return false;
 if(selectedSound()==='original'&&!sourceBlob&&!filmLocalSource){
  setScenePrepStep('review');
  return true;
 }
 return selectedSound()==='neural'?await prepareFilmScene():await processMedia();
}
function filmMode(){
 return document.querySelector('input[name="film-clean-mode"]:checked')?.value||'umx';
}
function updateFilmCleaner(){
 const duration=Math.max(0,Number($('trim-length').value)||selected?.duration||0);
 const estimate=estimateFilmTimes(duration,filmBenchmarkOpts());
 const baseline=Math.max(.1,estimate.umx);
 for(const choice of FILM_MODES){
  const seconds=estimate[choice.id];
  $('film-time-'+choice.id).textContent=seconds?'≈ '+fmt(Math.ceil(seconds)):'—';
  $('film-ratio-'+choice.id).textContent=choice.id==='umx'?'1×':
   '≈ '+Math.round(seconds/baseline)+'× дольше';
 }
 const likely=estimatePreparationTimes(duration,filmMode(),filmBenchmarkOpts());
 $('film-time-explain').textContent='Оценка моделей: '+(filmBench.umx90||filmBench.scnet90?
  'по замерам на этом устройстве':'по замерам на мощном ПК')+
  '. '+($('film-low-memory').checked?'Защита памяти: нейросеть идёт короткими отрывками и может быть существенно медленнее. ':'')+
  'Дополнительно: кодирование видео ≈ '+fmt(duration)+
  ', извлечение звука может занять до '+fmt(duration)+' при резервном захвате. Итого: от ≈ '+
  fmt(Math.ceil(likely.totalFast))+' до ≈ '+fmt(Math.ceil(likely.totalSlow))+
  ' на измеренном ПК; на слабом устройстве медленнее.';
 const ready=!!selected&&scenePrepareStep==='sound'&&!filmCleanController&&!videoExportController;
 $('film-clean-start').disabled=!ready||!supportsVideoExport();
 $('film-clean-start').textContent=selectedSound()==='neural'?'Подготовить без диалогов':selectedSound()==='mute'?'Создать видео без звука':'Подготовить с исходным звуком';
 $('media-render').disabled=!ready||!supportsVideoExport();
 $('film-low-memory').disabled=selectedSound()!=='neural'||!!filmCleanController||!!videoExportController;
 document.querySelectorAll('input[name="film-clean-mode"]').forEach(input=>input.disabled=!!filmCleanController||!!videoExportController);
 $('film-clean-cancel').classList.toggle('hidden',!filmCleanController);
 $('film-clean-progress').classList.toggle('hidden',!filmCleanController);
 if(!filmCleanController&&filmPreparedBlob&&videoExportBlob===filmPreparedBlob){
  $('film-clean-status').textContent='Очищенный саундтрек готов и встроен в видео. Проверь результат и продолжай.';
 }
}
async function prepareFilmScene(){
 if(!selected||scenePrepareStep!=='sound'||selectedSound()!=='neural'||filmCleanController||videoExportController)return false;
 if(!supportsVideoExport()){
  $('film-clean-status').textContent='Нужен браузер с MediaRecorder и Web Audio для подготовки видео.';
  return false;
 }
 const start=Number($('trim-start').value),duration=Number($('trim-length').value);
 if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<10||duration>90){
  toast('Выбери фрагмент длиной от 10 до 90 секунд.');return false;
 }
 const controller=new AbortController();filmCleanController=controller;
 const status=$('film-clean-status'),bar=$('film-clean-bar'),button=$('film-clean-start');
 const selectedMode=filmMode(),lowMemory=$('film-low-memory').checked,startedAt=performance.now();
 let prepared=false;
 const progress=(detail,value)=>{
  status.textContent=detail;bar.value=Math.max(0,Math.min(100,value));
 };
 progress('Подготавливаем исходный звук…',1);
 clearExportPreview();exportBusy(true);updateFilmCleaner();
 button.textContent='Обрабатываем…';
 try{
  let blob=sourceBlob||filmLocalSource;
  if(!blob){
   const src=sceneSource(selected);
   if(!src)throw Error('У выбранной сцены нет видео.');
   progress('Загружаем встроенный фильм для локальной обработки…',3);
   try{
    const response=await fetch(src,{signal:controller.signal});
    if(!response.ok)throw Error('HTTP '+response.status);
    const header=Number(response.headers.get('content-length'));
    if(header>MAX_SOURCE_VIDEO_BYTES)throw Error('Встроенное видео слишком большое. Используй локальный отрывок.');
    blob=await response.blob();
   }catch(err){
    if(controller.signal.aborted)throw err;
    $('film-local-fallback').classList.remove('hidden');
    throw Error('Не удалось получить аудиодорожку встроенного фильма (возможно, CORS). Выбери локальную копию этого видео ниже. '+(err?.message||''));
   }
  }
  if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_SOURCE_VIDEO_BYTES)
   throw Error('Нужен видеофайл до 512 МиБ.');
  const plan=await cleanFilmSound({blob,start,duration,mode:selectedMode,lowMemory,signal:controller.signal,
   onProgress:p=>{
    const stage=p.stage||'';
    const value=stage==='decode'?10:stage==='scnet'?41:stage==='umx'?25:stage==='lowmem'?24:stage==='buzz'?52:stage==='skip'?59:13;
    progress((p.detail||'Разделяем аудио…')+' · '+fmt((performance.now()-startedAt)/1000)+' прошло',value);
   }});
  if(controller.signal.aborted)return false;
  rememberFilmTimes(plan,duration);updateFilmCleaner();
  progress('Нейросеть готова · создаём видео с фоновым звуком',60);
  const result=await exportVideo({blob,start,duration,width:Number($('media-resolution').value),
   level:Number($('media-quality').value),keepAudio:false,audioPCM:plan.channels,
   signal:controller.signal,onProgress:p=>{
    progress('Кодируем видео с очищенным фоном · '+Math.round(p*100)+'%',60+Math.round(p*40));
   }});
  if(controller.signal.aborted)return false;
  if(mode==='host'&&result.size>MAX_ROOM_VIDEO_BYTES)
   throw Error('Очищенное видео '+formatVideoBytes(result.size)+
    ' превышает лимит комнаты 96 МиБ. Уменьши качество/разрешение и повтори.');
  videoExportBlob=result;filmPreparedBlob=result;
  videoExportUrl=URL.createObjectURL(result);
  const preview=$('media-output-preview');preview.src=videoExportUrl;preview.load();
  $('media-output-size').textContent=formatVideoBytes(result.size)+' · '+fmt(duration);
  $('media-preview-switch').classList.remove('hidden');
  showTrimPreview('result');
  $('media-result').classList.remove('hidden');
  const detail=plan.segments.length?' · SCNet улучшила '+plan.segments.length+' проблемных участка':'';
  progress('Готово · '+fmt((performance.now()-startedAt)/1000)+detail,100);
  $('media-note').textContent='Голоса фильма подавлены. Прослушай вариант с музыкой и выбери «Использовать и продолжить».';
  cue('ready');prepared=true;return true;
 }catch(e){
  if(e?.name==='AbortError'||controller.signal.aborted){
   status.textContent='Обработка отменена. Исходный фильм не изменён.';
  }else{
   status.textContent=e?.message||'Не получилось удалить голоса.';
  }
  return false;
 }finally{
  filmCleanController=null;
  exportBusy(false);updateMediaLab();updateFilmCleaner();
  if(prepared)setScenePrepStep('review');
  else updateConfirmAction();
 }
}
async function confirmScene(){
 if(videoExportController||filmCleanController)return toast('Сначала заверши обработку видео.');
 if(scenePrepareStep==='trim'){
  if(!validTrim())return;
  setScenePrepStep('sound');
  return;
 }
 if(scenePrepareStep==='sound'){
  if(!validateScene())return;
  // Preparation and approval are separate operations. Never enter a room from
  // a network/audio worker completion callback or from the sound setup screen.
  if(hasSceneReview())setScenePrepStep('review');
  else await prepareSelectedScene();
  return;
 }
 if(scenePrepareStep!=='review'||!hasSceneReview())return;
 if(!validateScene())return;
 const remoteOriginal=selectedSound()==='original'&&!sourceBlob&&!filmLocalSource;
 if(videoExportBlob&&!acceptMedia())return;
 if(remoteOriginal){scene.cleaned=false;selected.cleaned=false;}
 if(mode==='host'&&scene.custom&&sourceBlob?.size>MAX_ROOM_VIDEO_BYTES){
  toast('Готовое видео превышает 96 МиБ. Уменьши качество на этапе обработки.');
  return;
 }
 setVideoSources();
 if(mode==='solo'){await openEditor();return}
 if(mode==='host'){
  if(room&&state?.phase==='lobby'){
   if(scene.custom&&sourceBlob){projectKey=sceneDraftKey();if(!await draftWrite())return;}
   pendingScenePicker=false;sendGame({type:'scene',scene:sceneForServer()});roomUI();return;
  }
  await connectRoom('create');return;
 }
 show('room');
}
async function uploadVideo(file){if(!file)return;if(file.size>MAX_SOURCE_VIDEO_BYTES)return toast('Исходный файл не должен превышать 512 МиБ.');if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm)$/i.test(file.name))return toast('Нужен видеофайл.');const url=URL.createObjectURL(file),v=$('trim-video');const meta=await new Promise(resolve=>{const tmp=document.createElement('video');tmp.preload='metadata';tmp.src=url;let done=false;const finish=x=>{if(!done){done=true;resolve(x);tmp.src=''}};tmp.onloadedmetadata=()=>measureVideoDuration(tmp).then(finish).catch(()=>finish(0));tmp.onerror=()=>finish(0);setTimeout(()=>finish(0),8000)});URL.revokeObjectURL(url);if(!meta)return toast('Этот видеоформат не поддерживается браузером.');if(meta<10)return toast('Видео должно быть длиной хотя бы 10 секунд.');selectScene({id:'custom',title:file.name.replace(/\.[^.]+$/,'').slice(0,55),start:0,duration:Math.min(60,Math.floor(meta)),totalDuration:meta,custom:true,roles:['Персонаж 1','Персонаж 2']},file)}

function showTrimPreview(which='source'){
 const result=which==='result'&&!!videoExportUrl;
 const source=$('trim-video'),encoded=$('media-output-preview');
 const wasResult=!encoded.classList.contains('hidden');
 const start=Number($('trim-start').value)||0,length=Number($('trim-length').value)||0;
 if(result&&!wasResult&&source.readyState&&encoded.readyState){
  try{encoded.currentTime=clamp(source.currentTime-start,0,length)}catch{}
 }else if(!result&&wasResult&&source.readyState&&encoded.readyState){
  try{source.currentTime=start+clamp(encoded.currentTime,0,length)}catch{}
 }
 if(result)source.pause();else encoded.pause();
 source.classList.toggle('hidden',result);
 encoded.classList.toggle('hidden',!result);
 $('preview-original').classList.toggle('active',!result);
 $('preview-result').classList.toggle('active',result);
 $('preview-original').setAttribute('aria-pressed',String(!result));
 $('preview-result').setAttribute('aria-pressed',String(result));
 $('trim-range-root').classList.toggle('previewing-output',result);
 $('trim-mark-start').disabled=result;
 $('trim-mark-end').disabled=result;
}
function clearExportPreview(){
 showTrimPreview('source');
 filmPreparedBlob=null;
 const v=$('media-output-preview');
 v.pause();v.removeAttribute('src');v.load();
 if(videoExportUrl)URL.revokeObjectURL(videoExportUrl);
 videoExportUrl=null;videoExportBlob=null;
 $('media-result').classList.add('hidden');
 $('media-preview-switch').classList.add('hidden');
}
function updateConfirmAction(){
 const b=$('confirm-scene'),result=videoExportBlob instanceof Blob,stage=scenePrepareStep;
 const oversized=mode==='host'&&result&&videoExportBlob.size>MAX_ROOM_VIDEO_BYTES;
 b.disabled=!!videoExportController||!!filmCleanController||!!oversized;
 let label;
 if(stage==='trim')label='Далее · настроить звук';
 else if(stage==='review')label='Подтвердить и продолжить';
 else if(hasSceneReview())label='Перейти к предпросмотру';
 else if(selectedSound()==='original'&&!sourceBlob&&!filmLocalSource)label='Предпросмотр без обработки';
 else label='Подготовить и проверить';
 b.innerHTML=label+' <span class="arrow">→</span>';
 $('trim-footer-hint').textContent=stage==='trim'?'Шаг 1 из 3 · выбери 10–90 секунд':
  stage==='review'?(oversized?'Файл больше 96 МиБ · вернись к настройкам':'Шаг 3 из 3 · файл не отправлен, пока не подтвердил'):
  result?'Шаг 2 из 3 · результат готов · проверь его':
  'Шаг 2 из 3 · '+fmt(Number($('trim-length').value))+' выбранного видео';
}
function invalidateMediaResult(){if(videoExportBlob)clearExportPreview();updateMediaLab()}
function updateMediaLab(){
  const active=scenePrepareStep==='sound'&&!!selected?.custom&&sourceBlob instanceof Blob;
  $('media-workbench').classList.toggle('hidden',!active);
  if(!active){updateConfirmAction();return}
  const length=Math.max(0,Number($('trim-length').value)||0);
  const keepAudio=selectedSound()==='original';
  const plan=planVideoPreparation({size:sourceBlob.size,mode});
  const size=estimateVideoBytes(length,Number($('media-quality').value),keepAudio);
  $('media-source-size').textContent='Исходник · '+formatVideoBytes(sourceBlob.size);
  $('media-quality-label').textContent=qualityNames[Number($('media-quality').value)-1]||qualityNames[3];
  $('media-estimate').textContent='После обработки ≈ '+formatVideoBytes(size);
  $('media-fast-status').textContent=plan.kind==='reuse'
    ?(mode==='solo'?'Без сжатия · на этом устройстве':'Готово без сжатия · можно продолжить сразу')
    :'Нужно подготовить фрагмент · весь файл слишком большой';
  $('media-render').disabled=!!videoExportController||!supportsVideoExport();
  $('media-render').classList.toggle('hidden',!!videoExportBlob);
  updateConfirmAction();
  if(!supportsVideoExport()){
    $('media-note').textContent='В этом браузере нет локального кодировщика. Можно использовать файл без обработки, если он меньше 96 МиБ.';
  }else if(videoExportBlob){
    // Keep the actual encoded result message until the user accepts or discards it.
  }else if(plan.kind==='encode'){
    $('media-note').textContent='Передача всего исходника превысит 96 МиБ. Кодируем только выбранный отрывок на твоём устройстве.';
  }else if(!videoExportBlob){
    $('media-note').textContent='Перейди дальше сразу, без обработки. Сжимай вручную, только если нужен файл меньшего размера.';
  }
}
function exportBusy(busy){
  $('media-render').disabled=busy||!supportsVideoExport();
  $('confirm-scene').disabled=busy;
  for(const id of ['media-quality','media-resolution'])$(id).disabled=busy;
  document.querySelectorAll('input[name="film-sound-choice"]').forEach(x=>x.disabled=busy);
  $('trim-range-root').classList.toggle('range-locked',busy);
  $('trim-mark-start').disabled=busy;$('trim-mark-end').disabled=busy;
  $('trim-range-handle-start').disabled=busy;
  $('trim-range-handle-end').disabled=busy;
  updateConfirmAction();
  $('media-progress').classList.toggle('hidden',!busy);
  updateFilmCleaner();
}
async function processMedia(){
  if(videoExportController||filmCleanController||!selected||scenePrepareStep!=='sound')return false;
  if(selectedSound()==='neural')return prepareFilmScene();
  const start=Number($('trim-start').value),duration=Number($('trim-length').value);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<10||duration>90){
    toast('Выбери отрывок от 10 до 90 секунд.');return false;
  }
  const total=$('trim-video').duration;
  if(Number.isFinite(total)&&start+duration>total+.1){toast('Отрывок выходит за пределы видео.');return false;}
  const settings={start,duration,width:Number($('media-resolution').value),
    level:Number($('media-quality').value),keepAudio:selectedSound()==='original'};
  const key=mediaSettingsKey(settings);
  if(encodedCache?.source===sourceBlob&&encodedCache.key===key){
    clearExportPreview();
    const result=encodedCache.blob;
    videoExportBlob=result;
    videoExportUrl=URL.createObjectURL(result);
    $('media-output-preview').src=videoExportUrl;
    $('media-output-preview').load();
    $('media-output-size').textContent=formatVideoBytes(result.size)+' · '+fmt(duration);
    $('media-preview-switch').classList.remove('hidden');
    showTrimPreview('result');
    $('media-result').classList.remove('hidden');
    $('media-note').textContent='Готовый фрагмент взят из памяти — повторное сжатие не требуется.';
    updateMediaLab();
    cue('ready');
    setScenePrepStep('review');
    return true;
  }
  clearExportPreview();
  const controller=new AbortController();
  videoExportController=controller;
  const startedAt=performance.now();
  let lastShown=-1,prepared=false;
  exportBusy(true);$('media-progress-bar').value=0;
  $('media-progress-label').textContent='Подготовка видео · 0%';
  $('media-progress-help').textContent='Обработка идёт во время воспроизведения. Не закрывай экран.';
  try{
    let blob=sourceBlob||filmLocalSource;
    if(!blob){
      const src=sceneSource(selected);
      if(!src)throw Error('Видео для подготовки не найдено.');
      $('media-progress-label').textContent='Загружаем видео для выбранного отрывка…';
      try{
       const response=await fetch(src,{signal:controller.signal});
       if(!response.ok)throw Error('HTTP '+response.status);
       const limit=Number(response.headers.get('content-length'));
       if(limit>MAX_SOURCE_VIDEO_BYTES)throw Error('Встроенное видео больше 512 МиБ.');
       blob=await response.blob();
      }catch(e){
       if(controller.signal.aborted)throw e;
       $('film-local-fallback').classList.remove('hidden');
       throw Error('Не удалось открыть встроенное видео. Выбери локальную копию ниже. '+(e.message||''));
      }
    }
    if(!(blob instanceof Blob)||blob.size>MAX_SOURCE_VIDEO_BYTES)throw Error('Видео должно быть не больше 512 МиБ.');
    const result=await exportVideo({blob,start,duration,width:Number($('media-resolution').value),
      level:Number($('media-quality').value),keepAudio:selectedSound()==='original',
      signal:controller.signal,
      onProgress:progress=>{
        const pct=progress>=1?100:Math.min(99,Math.round(progress*100));
        if(pct===lastShown)return;
        lastShown=pct;
        $('media-progress-bar').value=pct;
        const elapsed=(performance.now()-startedAt)/1000;
        // The old pipeline also runs in real time; don't promise a fictional
        // instant result. The estimate self-corrects as real progress arrives.
        const remaining=progress>.05?Math.ceil(elapsed*(1-progress)/progress):null;
        $('media-progress-label').textContent='Обработка · '+pct+'%'+
          (remaining!==null&&pct<100?' · ≈ '+fmt(remaining)+' осталось':'');
      }});
    if(controller.signal.aborted)return;
    videoExportBlob=result;
    if(sourceBlob&&result.size<=MAX_ROOM_VIDEO_BYTES)
      encodedCache={source:sourceBlob,key,blob:result};
    videoExportUrl=URL.createObjectURL(result);
    $('media-output-preview').src=videoExportUrl;
    $('media-output-preview').load();
    $('media-output-size').textContent=formatVideoBytes(result.size)+' · '+fmt(duration);
    const wallSeconds=Math.round((performance.now()-startedAt)/1000);
    $('media-progress-help').textContent='Готово за '+fmt(wallSeconds)+'.';
    $('media-preview-switch').classList.remove('hidden');
    showTrimPreview('result');
    updateConfirmAction();
    $('media-result').classList.remove('hidden');
    $('media-note').textContent=result.size>MAX_ROOM_VIDEO_BYTES&&mode==='host'
      ? 'Файл всё ещё слишком большой. Уменьши качество или разрешение и повтори.'
      : 'Обработано за '+fmt(Math.round((performance.now()-startedAt)/1000))+'. Сравни качество и нажми «Использовать и продолжить».';
    cue('ready');prepared=true;return true;
  }catch(e){
    if(e?.name!=='AbortError')toast(e?.message||'Не получилось обработать видео.');
    $('media-note').textContent=e?.name==='AbortError'?'Обработка отменена. Исходное видео не изменилось.':'Исходное видео сохранено. Попробуй другие параметры.';
    return false;
  }finally{
    videoExportController=null;exportBusy(false);updateMediaLab();
    if(prepared)setScenePrepStep('review');
  }
}
function acceptMedia(){
  if(!(videoExportBlob instanceof Blob)||videoExportController)return false;
  if(mode==='host'&&videoExportBlob.size>MAX_ROOM_VIDEO_BYTES){toast('Нужно уменьшить размер до 96 МиБ.');return false}
  // Only neural processing yields a useful background track by default.
  // Fully muted output must stay muted in the editor and premiere.
  const cleaned=selectedSound()==='neural';
  const length=Number($('trim-length').value),type=videoExportBlob.type;
  const extension=type.includes('mp4')?'mp4':'webm';
  sourceBlob=new File([videoExportBlob],(selected.title||'scene')+'-cut.'+extension,{type});
  selected.custom=true;
  selected.id=(cleaned?'clean-':selectedSound()==='mute'?'mute-':'cut-')+uid();selected.cleaned=cleaned;
  encodedCache=null;
  selected.start=0;selected.duration=length;selected.totalDuration=length;
  scene={...selected,start:0,duration:length};
  clearExportPreview();
  setVideoSources('trim-video');
  trimRange.setRange(0,length,length);
  updateMediaLab();
  return true;
}

function sceneForServer(){if(!scene)return null;const {id,title,start,duration,roles,custom,cleaned}=scene;return {id,title,start,duration,roles,custom:!!custom,cleaned:!!cleaned}}
function sendGame(data){
 if(debugPlay){mockGame(data);return}
 if(!net||!room)return;
 try{net.sendGame(data)}catch{networkInterrupted=true;connectionNotice();setNetStatus('connecting','Переподключаемся…')}
}
function roomUI(){
 const s=state;show('room');if(scene)setVideoSources(null);$('join-panel').classList.toggle('hidden',!!s||mode!=='guest');$('room-connection').classList.toggle('hidden',!!s||(mode!=='host'&&!networkInterrupted));
 $('room-heading').textContent=s?'Ваша команда':mode==='host'?'Создать комнату':'Войти в комнату';$('room-code').textContent=s?room.slice(0,8).toUpperCase():'—';
 $('room-ticket').style.display=s?'flex':'none';
  $('room-scene-title').textContent=s&&s.configured!==false&&s.scene.id!=='wing'?s.scene.title:'Сцена не выбрана';
  $('room-change-scene').classList.toggle('hidden',!s||!meHost()||s.phase!=='lobby');
 $('room-change-scene').textContent=s?.configured!==false&&scene?'Заменить видео…':'Выбрать видео';
 $('player-count').textContent=s?s.players.length+'/6':'';
 $('room-phase-note').textContent=s?'Ожидаем актёров':'';
 if(!s){$('room-players').innerHTML='';$('room-help').textContent=mode==='host'?'Подключение требуется для передачи видео другим участникам.':'Введите код, которым поделился ведущий.';$('room-start').classList.add('hidden');return}
 const roleOptions=[...s.scene.roles];for(let i=0;i<s.scene.roles.length;i++)for(let j=i+1;j<s.scene.roles.length;j++)roleOptions.push(s.scene.roles[i]+' + '+s.scene.roles[j]);roleOptions.push('Все роли');for(const name of Object.values(s.assignments))if(name&&!roleOptions.includes(name))roleOptions.push(name);
 $('room-players').innerHTML=s.players.map((p,i)=>'<div class="room-player" style="border-left-color:'+colors[i%colors.length]+'"><span><b>'+esc(p.name)+(p.id===me?' (ты)':'')+'</b><small>'+(p.id===s.host?'Ведущий':'Актёр')+(onlineIds&&!onlineIds.has(p.id)?' · Нет связи':s.mediaReady?.[p.id]?' · Видео получено':' · Загружаем видео')+'</small></span>'+(meHost()?'<select data-assign="'+esc(p.id)+'">'+roleOptions.map(r=>'<option value="'+esc(r)+'" '+(r===s.assignments[p.id]?'selected':'')+'>'+esc(r)+'</option>').join('')+'</select>':'<b>'+esc(s.assignments[p.id]||'Актёр')+'</b>')+'</div>').join('')+(s.scene.custom&&!sourceBlob?'<label class="upload-card" style="margin:8px 0"><input data-room-video type="file" accept="video/*" hidden><span class="upload-icon">＋</span><span><b>Видео не передалось?</b><small>Выбери тот же файл на своём устройстве.</small></span></label>':'');
 $('room-help').textContent=esc(s.scene.title)+' · '+fmt(s.scene.duration)+' · '+(s.scene.custom?'личное видео':'CC BY, Blender Studio');$('room-start').classList.toggle('hidden',!meHost());$('room-start').disabled=s.configured===false||s.players.length<2||!s.players.every(p=>s.mediaReady?.[p.id])||(s.scene.custom&&meHost()&&!sourceBlob);
}
function waitUI(){show('wait');$('wait-roster').innerHTML=(state?.players||[{id:'solo',name:name}]).map(p=>'<span class="wait-chip '+(mode==='solo'||state?.ready?.[p.id]?'ready':'')+'">'+esc(p.name)+' · '+(onlineIds&&!onlineIds.has(p.id)?'Нет связи':mode==='solo'||state?.ready?.[p.id]?'Готов':'Записывает')+'</span>').join('');$('reveal-btn').classList.toggle('hidden',mode==='solo'||!meHost()||!state?.players.every(p=>state.ready?.[p.id]));$('unready-btn').classList.toggle('hidden',mode==='solo')}
function disposeRemoteClips(){
 for(const c of remoteClips){try{c.audio?.pause()}catch{}if(c.url)URL.revokeObjectURL(c.url)}
 remoteClips=[];
}
function stateChanged(s){
 if(!s||!['lobby','recording','premiere'].includes(s.phase)||!Array.isArray(s.players)||!s.scene)return;
 const prev=state,epochChanged=!!prev&&prev.mediaEpoch!==s.mediaEpoch;
 // Presence and reconnect snapshots must not interrupt the host's local film preparation.
 const hostPreparing=mode==='host'&&prev?.phase==='lobby'&&s.phase==='lobby'&&['library','trim'].includes(view);
 const leftPremiere=prev?.phase==='premiere'&&s.phase!=='premiere';
 const sceneChanged=!scene||scene.id!==s.scene.id||scene.start!==s.scene.start||
   scene.duration!==s.scene.duration||epochChanged;
 state=s;
 connectionNotice();
 if(epochChanged||leftPremiere){
  stopPremiereExport();stopAllPlayback();disposeRemoteClips();
  relayInbox.clear();sentPremiere=false;
  for(const p of peers.values()){p.rx=null;p.queued.length=0}
  if(epochChanged)videoSent.clear();
 }
 // A departed actor must never leave obsolete voice clips in our mix.
 const validOwners=new Set(s.players.map(p=>p.id));
 const dropped=remoteClips.filter(c=>!validOwners.has(c.owner));
 if(dropped.length){
  for(const c of dropped){try{c.audio?.pause()}catch{}if(c.url)URL.revokeObjectURL(c.url)}
  remoteClips=remoteClips.filter(c=>validOwners.has(c.owner));
 }
 if(sceneChanged&&!hostPreparing){
  scene={...s.scene};
  if(!scene.custom||(epochChanged&&me!==s.host))sourceBlob=null;
  setVideoSources();
 }
 if(s.phase==='lobby'){
  if(sceneChanged&&!hostPreparing&&scene.custom&&meHost()&&sourceBlob){
   projectKey=sceneDraftKey();void draftWrite();
  }
  if(pendingScenePicker&&meHost()){pendingScenePicker=false;library()}
  else if(!hostPreparing)roomUI();
  if(!hostPreparing&&scene.custom&&meHost()&&sourceBlob)
    for(const id of peers.keys())sendVideoTo(id);
 }else if(s.phase==='recording'){
  if(!prev||prev.phase!=='recording'||!['editor','wait'].includes(view))
   void openEditor().then(()=>{if(state?.phase==='recording'&&state.ready?.[me])waitUI()});
  else if(view==='wait'&&!s.ready?.[me])void openEditor();
  else if(view==='wait')waitUI();
 }else if(s.phase==='premiere'){
  if(!prev||prev.phase!=='premiere'){
   sentPremiere=false;
   if(!localClips.length&&sceneDraftKey())
    void restore(sceneDraftKey()).then(()=>{if(state?.phase==='premiere')beginPremiere()});
   else beginPremiere();
  }else updatePremiereStatus();
 }
}
async function connectRoom(action,checkpoint=null){
 if(debugPlay){mockConnect();return}
 if(net){try{net.close()}catch{}net=null}
 retryRoomAction=action;retryCheckpoint=checkpoint;
 show('room');setNetStatus('connecting','Подключаемся…');
 room=null;state=null;onlineIds=null;networkInterrupted=false;
 $('room-connection-status').textContent='Подключаемся к PocketNet…';
 $('room-retry').classList.add('hidden');roomUI();connectionNotice();
 const conn=new PocketNet({
  serverUrl:roomsOrigin,name,identityKey:identity?.accountId||'guest',
  token:action==='resume'?checkpoint?.token:undefined,storage:session
 });
 net=conn;
 // Only a verified recovery checkpoint may request an automatic seat reclaim.
 conn.roomId=action==='resume'?checkpoint?.roomId||null:null;
 conn.persist();
 let initializedNewRoom=false;
 conn.on('connected',m=>{me=m.player?.id||'';setNetStatus('online','PocketNet · онлайн')});
 conn.on('room_joined',async m=>{
  if(net!==conn)return;
  room=m.roomId;
  onlineIds=Array.isArray(m.onlineIds)?new Set(m.onlineIds):null;
  networkInterrupted=false;
  if(action==='create'&&!initializedNewRoom){
   initializedNewRoom=true;
   state=m.state;roomUI();
   // Save custom source before anyone starts playing, not only at the first voice take.
   if(scene?.custom&&sourceBlob){
    projectKey=sceneDraftKey();
    if(!await draftWrite())toast('Видео не удалось сохранить для восстановления.');
   }
   saveRoomCheckpoint();
   if(scene)sendGame({type:'scene',scene:sceneForServer()});
  }else{
   initializedNewRoom=true;
   stateChanged(m.state);
   saveRoomCheckpoint();
   if(m.state?.phase==='lobby')await restoreLobbyMedia();
   if(net!==conn)return;
   sendGame({type:'sync'});
  }
  if(net!==conn)return;
  ensurePeers();connectionNotice();
 });
 conn.on('presence',m=>{
  if(m.roomId!==room||!Array.isArray(m.onlineIds))return;
  onlineIds=new Set(m.onlineIds);
  ensurePeers();connectionNotice();
  if(view==='room')roomUI();
  if(view==='wait')waitUI();
 });
 conn.on('game_event',m=>{
  if(m.event?.type==='state'){stateChanged(m.event.payload);ensurePeers()}
  else if(m.event?.type==='notice')toast(m.event.payload);
  else if(m.event?.type==='signal')receiveSignal(m.event.payload);
  else if(m.event?.type==='relay')receiveRelay(m.event.payload);
 });
 const endRoom=(reason)=>{
  if(net!==conn)return;
  clearRoomCheckpoint();conn.close();net=null;room=null;state=null;
  onlineIds=null;networkInterrupted=false;connectionNotice();
  setNetStatus('offline','Комната недоступна');show('home');toast(reason);
 };
 conn.on('room_closed',()=>endRoom('Комната закрыта. Сохранённые черновики остались на устройстве.'));
 conn.on('room_kicked',()=>endRoom('Ты больше не участник комнаты. Локальные записи сохранены.'));
 conn.on('error',e=>{
  const code=e.code||e.message||'ошибка';
  if(code==='room_not_found'||code==='room_version_unavailable'){
   endRoom('Комната больше недоступна. Локальные записи не удалены.');
   return;
  }
  // Transient socket errors use one persistent status, not toast spam.
   networkInterrupted=true;setNetStatus('connecting','Восстанавливаем связь');connectionNotice();
 });
 conn.on('disconnected',()=>{
  if(net!==conn)return;
  networkInterrupted=true;onlineIds?.delete(me);
  for(const id of [...peers.keys()])closePeer(id);
  setNetStatus('connecting','Переподключаемся…');
  connectionNotice();
  // Persistent banner already explains the loss; do not spam toasts.
 });
 try{
  await conn.connect();
  if(net!==conn)return;
  if(action==='create')conn.createRoom('ne-tem-golosom');
  else if(action==='join')conn.joinRoom(($('join-code').value||new URLSearchParams(location.search).get('room')||'').trim());
  // 'resume' is joined automatically by PocketNet upon authentication.
 }catch(e){
  if(net!==conn)return;
  networkInterrupted=true;connectionNotice();
  toast('PocketNet недоступен: '+e.message);
  setNetStatus('offline','Нет связи');
  $('room-connection-status').textContent=action==='create'?'Не удалось создать комнату. Проверь подключение и попробуй снова.':'Соединение не установлено. Проверь интернет и повтори попытку.';
  $('room-retry').classList.remove('hidden');roomUI();
 }
}
function leaveNetwork(){clearRoomCheckpoint();networkInterrupted=false;onlineIds=null;connectionNotice();setNetStatus('idle','PocketNet');relayInbox.clear();relayQueue=Promise.resolve();for(const id of [...peers.keys()])closePeer(id);try{net?.leaveRoom();net?.close()}catch{}net=null;state=null;me='';room='';sentPremiere=false;}
async function resetRuntime(){
 stopPremiereExport();premiereLocalCopy=null;videoExportController?.abort();encodedCache=null;clearExportPreview();cancelCountdown();
 if(record)finishRecording();
 if(pendingRecording)await pendingRecording;
 stopAllPlayback();
 if(projectKey&&scene&&!await draftWrite())return false;
 stopMicMonitor();cleanAudios();localClips=[];remoteClips=[];
 editHistory=new TimelineHistory();selectedClip=null;
 writtenVideoByKey.delete(projectKey);projectKey='';
 restoreGeneration++;
 if(liveUrl){URL.revokeObjectURL(liveUrl);liveUrl=null}
 sourceBlob=null;scene=null;
 return true;
}
function closePeer(id){const p=peers.get(id);if(!p)return;try{p.dc?.close();p.pc.close()}catch{}peers.delete(id);for(const key of videoSent)if(key.startsWith(id+':'))videoSent.delete(key)}
function peer(id,initiator){if(!window.RTCPeerConnection)return toast('WebRTC недоступен в этом браузере.'),null;if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]});const p={id,pc,dc:null,remoteReady:false,pending:[],rx:null,queued:[],busy:false};peers.set(id,p);
 pc.onicecandidate=e=>{if(e.candidate)sendGame({type:'signal',to:id,signal:{kind:'ice',candidate:e.candidate.toJSON()}})};
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){closePeer(id);toast('Прямая передача не удалась. Возможна блокировка WebRTC сетью.');if(meHost()&&state?.players.some(x=>x.id===id))setTimeout(()=>{if(!peers.has(id))peer(id,true)},1800)}};
 pc.ondatachannel=e=>attachChannel(p,e.channel);
 if(initiator){const dc=pc.createDataChannel('footage',{ordered:true});attachChannel(p,dc);pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>sendGame({type:'signal',to:id,signal:{kind:'offer',sdp:pc.localDescription.sdp}})).catch(()=>toast('Не удалось создать соединение для видео.'))}
 return p}
function ensurePeers(){
 if(!state||!me)return;
 for(const p of state.players){
  if(p.id===me||(onlineIds&&!onlineIds.has(p.id)))continue;
  if(meHost()){if(!peers.has(p.id))peer(p.id,true)}
  else if(p.id===state.host){if(!peers.has(p.id))peer(p.id,false)}
 }
 for(const id of [...peers.keys()])
  if(!state.players.some(p=>p.id===id)||(onlineIds&&!onlineIds.has(id)))closePeer(id);
}
async function receiveSignal(data){if(!data||!state?.players.some(p=>p.id===data.from))return;const from=data.from,x=data.signal||{};let p=peers.get(from)||peer(from,false);if(!p)return;try{if(x.kind==='offer'&&typeof x.sdp==='string'){await p.pc.setRemoteDescription({type:'offer',sdp:x.sdp});const answer=await p.pc.createAnswer();await p.pc.setLocalDescription(answer);sendGame({type:'signal',to:from,signal:{kind:'answer',sdp:p.pc.localDescription.sdp}})}else if(x.kind==='answer'&&typeof x.sdp==='string'){await p.pc.setRemoteDescription({type:'answer',sdp:x.sdp})}else if(x.kind==='ice'&&x.candidate){if(!p.pc.remoteDescription)p.pending.push(x.candidate);else await p.pc.addIceCandidate(x.candidate)}if(p.pc.remoteDescription&&p.pending.length){for(const c of p.pending.splice(0))await p.pc.addIceCandidate(c).catch(()=>{})}}catch(e){toast('Ошибка соединения с актёром: '+e.message)}}
function attachChannel(p,dc){p.dc=dc;dc.binaryType='arraybuffer';dc.bufferedAmountLowThreshold=128*1024;dc.onopen=()=>{flush(p);if(meHost()&&scene?.custom&&sourceBlob)sendVideoTo(p.id);if(state?.phase==='premiere'&&sentPremiere)sendOwnTo(p.id)};
 dc.onmessage=e=>onMedia(p,e.data);dc.onclose=()=>{p.dc=null;p.rx=null};dc.onerror=()=>toast('Передача медиа была прервана.')}
async function flush(p){
 if(p.busy||p.dc?.readyState!=='open')return;
 p.busy=true;
 let current=null;
 try{
  while(p.queued.length&&p.dc?.readyState==='open'){
   current=p.queued.shift();
   const {blob}=current;
   if(blob.size>(current.kind==='video'?MAX_ROOM_VIDEO_BYTES:MAX_AUDIO_BYTES)){
    current=null;continue;
   }
   const token=uid();
   p.dc.send(JSON.stringify({kind:'begin',token,media:current.kind,size:blob.size,meta:current.meta}));
   const chunkSize=16000;
   for(let offset=0;offset<blob.size;offset+=chunkSize){
    while(p.dc?.bufferedAmount>600000){
     await new Promise(resolve=>{
      const timer=setTimeout(resolve,180);
      p.dc?.addEventListener('bufferedamountlow',()=>{clearTimeout(timer);resolve()},{once:true});
     });
    }
    if(p.dc?.readyState!=='open')throw Error('channel_closed');
    p.dc.send(await blob.slice(offset,offset+chunkSize).arrayBuffer());
   }
   if(p.dc?.readyState!=='open')throw Error('channel_closed');
   p.dc.send(JSON.stringify({kind:'end',token}));
   current=null;
  }
 }catch{
  // A dropped direct connection must not strand the room forever.
  if(current?.kind==='audio'&&state?.phase==='premiere'){
   relayAudio(p.id,current.blob,current.meta);
  }
  toast('Прямая передача прервалась. Для голоса пробуем запасной канал.');
 }finally{
  p.busy=false;
  if(p.dc?.readyState==='open'&&p.queued.length)void flush(p);
 }
}
function queueMedia(id,kind,blob,meta){const p=peers.get(id);if(!p||!(blob instanceof Blob))return;p.queued.push({kind,blob,meta});flush(p)}
function relayAudio(id,blob,meta){
 if(!net||!room||state?.phase!=='premiere'||blob.size>MAX_AUDIO_BYTES){networkInterrupted=true;connectionNotice();return}
 const token=uid(),chunk=4000;
 relayQueue=relayQueue.catch(()=>{}).then(async()=>{
  sendGame({type:'relay',to:id,data:{action:'begin',token,kind:'audio',size:blob.size,meta}});
  for(let start=0,part=0;start<blob.size;start+=chunk,part++){
   if(state?.phase!=='premiere'||!net||!room)return;
   const bytes=new Uint8Array(await blob.slice(start,start+chunk).arrayBuffer());
   let raw='';for(let i=0;i<bytes.length;i++)raw+=String.fromCharCode(bytes[i]);
   sendGame({type:'relay',to:id,data:{action:'part',token,part,body:btoa(raw)}});
   await new Promise(resolve=>setTimeout(resolve,95));
  }
  sendGame({type:'relay',to:id,data:{action:'end',token}});
 }).catch(()=>{networkInterrupted=true;connectionNotice()});
}
function sendAudio(id,blob,meta){
 const p=peers.get(id);
 if(p)queueMedia(id,'audio',blob,meta);
 if(!p||p.dc?.readyState!=='open')setTimeout(()=>{
  if(state?.phase==='premiere'&&peers.get(id)?.dc?.readyState!=='open')relayAudio(id,blob,meta);
 },7000);
}
function receiveRelay(packet){
 const d=packet?.data,from=packet?.from;
 if(state?.phase!=='premiere'||!state.players.some(x=>x.id===from)||!d||typeof d.token!=='string'||d.token.length>55)return;
 const key=from+':'+d.token;
 if(d.action==='begin'){
  if(d.kind!=='audio'||!validAudioEnvelope({
   meta:d.meta,bytes:d.size,scene,epoch:state.mediaEpoch,
   players:state.players.map(p=>p.id),expected:state.counts,
   sender:from,host:state.host,receiver:me
  })||!canAcceptVoice({owner:d.meta.owner,local:localClips,remote:remoteClips,expected:state.counts}))return;
  for(const [id,rx] of relayInbox)if(Date.now()-(rx.at||0)>150000)relayInbox.delete(id);
  if(relayInbox.size>=MAX_INCOMING_TRANSFERS)return;
  relayInbox.set(key,{kind:'audio',size:d.size,received:0,parts:0,chunks:[],meta:d.meta||{},at:Date.now()});
 }else if(d.action==='part'){
  const r=relayInbox.get(key);if(!r||d.part!==r.parts||typeof d.body!=='string'){relayInbox.delete(key);return}
  try{const bytes=atob(d.body),buf=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)buf[i]=bytes.charCodeAt(i);if(r.received+buf.length>r.size)throw Error('overflow');r.chunks.push(buf);r.received+=buf.length;r.parts++;}catch{relayInbox.delete(key)}
 }else if(d.action==='end'){
  const r=relayInbox.get(key);relayInbox.delete(key);
  if(r&&r.received===r.size)receivedMedia({id:from},r,new Blob(r.chunks,{type:r.meta.mime||'audio/webm'}));
 }
}
const videoSent=new Set();
function sendVideoTo(id){
 if(!scene?.custom||!sourceBlob||!meHost()||sourceBlob.size>MAX_ROOM_VIDEO_BYTES)return;
 const key=id+':'+scene.id+':'+state?.mediaEpoch;
 if(videoSent.has(key))return;
 videoSent.add(key);
 queueMedia(id,'video',sourceBlob,{scene:scene.id,epoch:state.mediaEpoch,mime:sourceBlob.type||'video/mp4'});
}
function onMedia(p,data){
 if(typeof data==='string'){
  let packet;
  try{packet=JSON.parse(data)}catch{return}
  if(packet.kind==='begin'){
   if(p.rx||!['video','audio'].includes(packet.media)||
      typeof packet.token!=='string'||packet.token.length<6||packet.token.length>55||
      !Number.isInteger(packet.size)||packet.size<1)return;
   const max=packet.media==='video'?MAX_ROOM_VIDEO_BYTES:MAX_AUDIO_BYTES;
   if(packet.size>max)return;
   const metadata=packet.meta;
   if(packet.media==='audio'){
    if(state?.phase!=='premiere'||!validAudioEnvelope({
     meta:metadata,bytes:packet.size,scene,epoch:state?.mediaEpoch,
     players:state?.players?.map(player=>player.id),expected:state?.counts,
     sender:p.id,host:state?.host,receiver:me
    })||!canAcceptVoice({owner:metadata?.owner,local:localClips,remote:remoteClips,expected:state?.counts}))return;
   }else if(!validVideoEnvelope({
    meta:metadata,bytes:packet.size,maxBytes:MAX_ROOM_VIDEO_BYTES,
    scene,epoch:state?.mediaEpoch,sender:p.id,host:state?.host,receiver:me,phase:state?.phase
   }))return;
   p.rx={kind:packet.media,token:packet.token,size:packet.size,
    meta:metadata,received:0,chunks:[]};
  }else if(packet.kind==='end'&&p.rx?.token===packet.token){
   const rx=p.rx;p.rx=null;
   if(rx.received===rx.size)
    receivedMedia(p,rx,new Blob(rx.chunks,{type:rx.meta.mime||'application/octet-stream'}));
  }
  return;
 }
 const rx=p.rx,bytes=data instanceof ArrayBuffer?data:null;
 if(!rx||!bytes||rx.received+bytes.byteLength>rx.size){p.rx=null;return}
 rx.received+=bytes.byteLength;rx.chunks.push(bytes);
}
async function receivedMedia(p,rx,blob){
 if(!state||!scene||!(blob instanceof Blob))return;
 if(rx.kind==='video'){
  if(!validVideoEnvelope({
   meta:rx.meta,bytes:blob.size,maxBytes:MAX_ROOM_VIDEO_BYTES,
   scene,epoch:state.mediaEpoch,sender:p.id,host:state.host,receiver:me,phase:state.phase
  }))return;
  sourceBlob=blob;setVideoSources();
  sendGame({type:'media_ready',scene:scene.id,epoch:state.mediaEpoch});
  toast('Видео получено. Можно начинать.');
  return;
 }
 if(state.phase!=='premiere'||rx.kind!=='audio')return;
 const m=rx.meta;
 if(!validAudioEnvelope({
  meta:m,bytes:blob.size,scene,epoch:state.mediaEpoch,
  players:state.players.map(player=>player.id),expected:state.counts,
  sender:p.id,host:state.host,receiver:me
 })||!canAcceptVoice({owner:m?.owner,local:localClips,remote:remoteClips,expected:state.counts}))return;
 if([...localClips,...remoteClips].some(c=>c.id===m.id&&c.owner===m.owner))return;
 remoteClips.push(makeClip({id:m.id,owner:m.owner,start:m.start,end:m.end,offset:m.offset,fx:normalizeVoiceEffect(m.fx),...clipMix(m),blob}));
 if(meHost())for(const q of state.players)if(q.id!==me&&q.id!==m.owner)sendAudio(q.id,blob,m);
 updatePremiereStatus();
}
function sendOwnTo(id){for(const c of localClips)sendAudio(id,c.blob,{
 id:c.id,owner:me,start:c.start,end:c.end,offset:c.offset,fx:normalizeVoiceEffect(c.fx),...clipMix(c),
 epoch:state?.mediaEpoch,mime:c.blob.type
})}
function sendAllOwn(){if(sentPremiere||mode==='solo'||debugPlay)return;sentPremiere=true;for(const p of state.players)if(p.id!==me&&(meHost()||p.id===state.host))sendOwnTo(p.id)}
async function openEditor(){if(!scene)return;stopAllPlayback();if(scene.cleaned)filmSound=true;const key=mode==='solo'?(debugPlay?'debug::':'')+'solo::'+scene.id+'::'+scene.start+'::'+scene.duration:sceneDraftKey();if(!await restore(key)){if(mode==='solo')library();else roomUI();return}if(mode!=='solo'&&state?.phase!=='recording')return;setVideoSources('stage-video');$('editor-scene').textContent=scene.title;$('editor-role').textContent=ownRole();$('mute-film').textContent='Звук фильма: '+(filmSound?'вкл.':'выкл.');$('mute-film').setAttribute('aria-pressed',String(filmSound));$('stage-video').muted=!filmSound;$('premiere-video').muted=true;show('editor');seekVideo($('stage-video'),0);renderTimeline();updateRecordingControls();setDraftStatus('saved');if(scene.custom&&!sourceBlob){$('stage-placeholder').textContent='Ожидаем видео от ведущего…';$('stage-placeholder').classList.remove('hidden')}}
function stopAllPlayback(){playing=false;for(const id of ['stage-video','premiere-video','trim-video'])$(id).pause();for(const c of [...localClips,...remoteClips])c.audio?.pause();$('play-toggle').textContent='▶'}
function updateClipSound(t,on,isPremiere=false){
 const items=isPremiere?[...localClips,...remoteClips]:localClips;
  if(isPremiere&&premiereAB==='original')on=false;
 for(const c of items){
  if(!c.audio)continue;
  const active=t>=c.start&&t<c.end&&on;
  const offset=clamp(t-c.start+c.offset,0,Math.max(0,c.blob.size?1e5:0));
  if(active){
   ensureClipVoice(c);
    if(c.fxGain)c.fxGain.gain.setTargetAtTime(.85*envelopeGain(c,t-c.start),voiceFxContext.currentTime,.012);
   if(c.audio.paused||Math.abs(c.audio.currentTime-offset)>.25)
    try{c.audio.currentTime=offset}catch{}
   if(c.audio.paused)c.audio.play().catch(()=>{});
  }else if(!c.audio.paused)c.audio.pause();
   if(!active&&c.fxGain)c.fxGain.gain.value=0;
 }
}
// Video time updates move only the playhead. Clip buttons retain focus.
function renderPlayhead(){
 if(!scene)return;
 const duration=Math.max(.01,scene.duration),t=time($('stage-video'));
 $('scrubber').max=String(Math.round(duration*10));
 $('scrubber').value=String(Math.round(t*10));
 $('stage-time').textContent=fmt(t)+' / '+fmt(duration);
 if(record)$('record-elapsed').textContent=fmt(Math.max(0,t-record.start));
 $('playhead').style.left=(t/duration*100)+'%';
}
function updateZoom(){
 const levels=[1,2,4,8,16],i=levels.indexOf(timelineZoom);
 $('timeline-content').style.width=(100*timelineZoom)+'%';
 $('timeline-zoom-label').textContent=timelineZoom+'×';
 $('timeline-zoom-out').disabled=i===0;
 $('timeline-zoom-in').disabled=i===levels.length-1;
}
function zoomTimeline(direction){
 const levels=[1,2,4,8,16],i=levels.indexOf(timelineZoom),next=levels[Math.max(0,Math.min(levels.length-1,i+direction))];
 if(next===timelineZoom)return;
 const viewport=$('timeline-viewport'),content=$('timeline-content');
 // Magnify the moment being edited, not the arbitrary center of the strip.
 // Centering the strip after zoom hid recordings near time zero at 4×.
 const active=localClips.find(c=>c.id===selectedClip);
 const focus=active?active.start:time($('stage-video'));
 const position=Math.max(0,Math.min(1,focus/Math.max(.1,scene?.duration||1)));
 timelineZoom=next;updateZoom();
 viewport.scrollLeft=Math.max(0,position*content.offsetWidth-viewport.clientWidth/2);
}
function renderTimeline(){
 if(!scene)return;
 updateZoom();
 const duration=Math.max(.01,scene.duration);
 const step=duration<=30?5:duration<=60?10:15;
 const markers=[];
 for(let t=0;t<=duration+.001;t+=step)markers.push('<span class="ruler-tick" style="left:'+(t/duration*100)+'%">'+fmt(t)+'</span>');
 if((duration%step)>0.05)markers.push('<span class="ruler-tick end" style="left:100%">'+fmt(duration)+'</span>');
 $('time-ruler').innerHTML=markers.join('');
 const tracks=layerTimeline(localClips),laneHeight=40,visibleLanes=tracks.lanes;
 $('clip-lane').style.height=(visibleLanes*laneHeight+6)+'px';
 $('playhead').style.height=(visibleLanes*laneHeight+28)+'px';
 $('timeline-content').style.height=(visibleLanes*laneHeight+40)+'px';
 $('clip-lane').innerHTML=localClips.map((c,i)=>{
  const row=tracks.assignments.get(c.id)||0,selected=selectedClip===c.id;
  return '<button type="button" class="clip-bar '+(selected?'selected':'')+
   '" data-clip="'+esc(c.id)+'" aria-pressed="'+selected+'" style="left:'+
   (c.start/duration*100)+'%;width:'+((c.end-c.start)/duration*100)+
   '%;top:'+(4+row*laneHeight)+'px" title="Реплика '+(i+1)+' · '+fmt(c.start)+'–'+fmt(c.end)+' · слой '+(row+1)+
   '" aria-label="Реплика '+(i+1)+' · '+fmt(c.start)+'–'+fmt(c.end)+' · слой '+(row+1)+
   '"><span class="clip-grip left" data-edge="left" aria-hidden="true"></span>'+
   '<span class="clip-text">'+(i+1)+'</span>'+
   '<span class="clip-grip right" data-edge="right" aria-hidden="true"></span></button>';
 }).join('');
 const picked=localClips.find(c=>c.id===selectedClip);
 $('selected-clip-info').textContent=picked
  ? 'Реплика '+(localClips.indexOf(picked)+1)+' · '+fmtFine(picked.start)+'–'+fmtFine(picked.end)+' · можно накладывать на другие'
  : localClips.length?'Выбери реплику · можно накладывать, двигать и обрезать':'Запиши первую реплику';
 $('clip-total').textContent=localClips.length+' '+(localClips.length===1?'фрагмент':localClips.length>=2&&localClips.length<=4?'фрагмента':'фрагментов');
 $('undo-btn').disabled=!editHistory.canUndo;
 $('redo-btn').disabled=!editHistory.canRedo;
 $('erase-btn').disabled=!picked;
 $('replace-clip-btn').disabled=!picked||!!record||!!preroll||!!micPending||!!pendingRecording;
 $('voice-effects').classList.toggle('hidden',!picked);
 $('clip-inspector-empty').classList.toggle('hidden',!!picked);
  $('clip-mixer').classList.toggle('hidden',!picked);
  if(picked){
    const mix=clipMix(picked);
    for(const [id,value,label] of [['clip-volume',Math.round(mix.volume*100),Math.round(mix.volume*100)+'%'],['clip-fade-in',Math.round(mix.fadeIn*100),mix.fadeIn.toFixed(2)+' с'],['clip-fade-out',Math.round(mix.fadeOut*100),mix.fadeOut.toFixed(2)+' с']]){
      $(id).value=String(value);$(id+'-label').textContent=label;
    }
  }
 if(picked&&VOICE_EFFECTS.find(f=>f.id===normalizeVoiceEffect(picked.fx))?.category!=='main')
  voiceFxExpanded=true;
 $('voice-fx-extra').classList.toggle('hidden',!voiceFxExpanded);
 $('voice-effects').classList.toggle('fx-expanded',voiceFxExpanded);
 $('voice-fx-more').setAttribute('aria-expanded',String(voiceFxExpanded));
 $('voice-fx-more').textContent=voiceFxExpanded?'Свернуть эффекты ↑':'Ещё '+VOICE_EFFECTS.filter(f=>f.category!=='main').length+' эффектов ↓';
 $('voice-fx-current').textContent=picked
  ?'· '+VOICE_EFFECTS.find(f=>f.id===normalizeVoiceEffect(picked.fx))?.label:'';
 if(picked)renderFavoriteVoiceEffects();
 if(picked)for(const b of $('voice-effects-options').querySelectorAll('[data-voice-fx]')){
  const active=b.dataset.voiceFx===normalizeVoiceEffect(picked.fx);
  b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));
 }
 renderPlayhead();
}
function editClipResult(id,kind,delta,clips=localClips){
 const target=clips.find(c=>c.id===id);
 if(!target||!scene)return null;
 const rawDuration=target.audio?.duration;
 return editClip(snapshotClips(clips),id,kind,Math.round(delta*20)/20,scene.duration,rawDuration);
}
function commitClipEdit(result,id){
 if(!result||record||preroll||pendingRecording||micPending)return false;
 stopAllPlayback();
 editHistory.remember(localClips);
 setClips(result,id);
 void draftWrite();
 return true;
}
function setPlayhead(value,fromPremiere=false){
 const v=fromPremiere?$('premiere-video'):$('stage-video');
 stopAllPlayback();seekVideo(v,clamp(value,0,scene.duration));
 if(!fromPremiere)renderPlayhead();
 else $('premiere-scrub').value=String(Math.round(value*10));
}
async function playStage(){if(!scene||record||preroll||micPending||pendingRecording||scene.custom&&!sourceBlob)return toast('Видео пока не готово.');const video=$('stage-video');if(playing){stopAllPlayback();return}if(time(video)>=scene.duration-.1)seekVideo(video,0);try{updateClipSound(time(video),true,false);await video.play();playing=true;$('play-toggle').textContent='Ⅱ'}catch{updateClipSound(time(video),false,false);toast('Нажми воспроизведение ещё раз — браузер блокирует запуск.')}}
function countdownBeat(number){
 const el=$('countdown');
 el.textContent=String(number);
 el.classList.remove('ntg-tick');
 // Restart the short single-beat animation when the integer changes.
 void el.offsetWidth;
 el.classList.add('ntg-tick');
 cue('count');
}
function updateRecordingControls(){
 $('count-record-btn').disabled=!!record||!!micPending||!!pendingRecording;
 $('mute-film').disabled=!!record||!!preroll||!!micPending||!!pendingRecording;
 $('record-btn').disabled=!!micPending||!!pendingRecording||!!preroll;
 $('replace-clip-btn').disabled=!selectedClip||!!record||!!preroll||!!micPending||!!pendingRecording;
 $('count-record-btn').classList.toggle('counting',!!preroll?.countdown);
 $('count-record-btn').innerHTML=preroll?.countdown?'×':'3<span class="count-mini">◷</span>';
 $('count-record-btn').setAttribute('aria-label',preroll?.countdown?'Отменить отсчёт записи':'Начать запись через 3 секунды');
 $('record-label').textContent=record?'Стоп':'Записать';
 $('record-btn').classList.toggle('recording',!!record);
 $('stage-video').closest('.stage-wrap')?.classList.toggle('is-recording',!!record);
 if(!record)$('record-elapsed').textContent='00:00';
}
async function startRecord(countdown=0,replaceId=null){
 if(record){finishRecording();return}
 if(preroll){cancelCountdown();return}
 if(micPending||pendingRecording)return;
 if(!scene||scene.custom&&!sourceBlob)return toast('Ожидаем видео.');
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)
   return toast('Этот браузер не поддерживает запись звука.');
 const video=$('stage-video');
 const chosen=replaceId?localClips.find(c=>c.id===replaceId):null;
 if(replaceId&&!chosen)return toast('Выбери реплику для перезаписи.');
 stopAllPlayback();
 if(chosen)seekVideo(video,chosen.start);
 else if(time(video)>=scene.duration-.1)seekVideo(video,0);
 const intendedStart=chosen?chosen.start:time(video);
 micPending=true;updateRecordingControls();
 let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia(
   microphoneRequest(navigator.mediaDevices.getSupportedConstraints?.()||{}));
 }catch(e){
  // Older mobile implementations may reject even ideal constraints.
  if(['OverconstrainedError','NotSupportedError','TypeError'].includes(e?.name)){
   try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch{}
  }
  if(!stream){
   micPending=false;updateRecordingControls();
   toast(e?.name==='NotAllowedError'?'Разреши доступ к микрофону в настройках браузера.':'Микрофон недоступен. Проверь разрешение и не занят ли он другой программой.');
   return;
  }
 }
 micPending=false;
 const settings=stream.getAudioTracks()[0]?.getSettings?.()||{};
 if(settings.noiseSuppression===true||settings.echoCancellation===true)
  toast('Телефон принудительно обрабатывает микрофон. Для чистой записи попробуй гарнитуру.');
 if(view!=='editor'||!scene){stream.getTracks().forEach(t=>t.stop());updateRecordingControls();return}
 if(!stream.getAudioTracks?.().length){
  stream.getTracks().forEach(t=>t.stop());
  toast('Микрофон не предоставил звуковую дорожку. Выбери другой источник записи.');
  updateRecordingControls();return;
 }
 startMicMonitor(stream);
 let cancelled=false;
 const session={stream,countdown:countdown===3,cancel:()=>{
  cancelled=true;stopMicMonitor();stream.getTracks().forEach(t=>t.stop());
 }};
 preroll=session;
 const launch=async()=>{
  if(cancelled||preroll!==session)return;
  session.countdown=false;
  $('countdown').classList.add('hidden');
  updateRecordingControls();
  let rec;
  try{
   // A retake starts at the original left edge, never at an arbitrary playhead.
   seekVideo(video,intendedStart);
   if(video.seeking)await new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;video.removeEventListener('seeked',finish);clearTimeout(id);resolve()};
    video.addEventListener('seeked',finish,{once:true});
    const id=setTimeout(finish,1200);
   });
   if(cancelled||preroll!==session)return;
   rec=createVoiceRecorder(stream);
   const blobs=[],active={
    rec,stream,blobs,replaceId:chosen?.id||null,
    limit:scene.duration,start:intendedStart,end:intendedStart,resolve:null,
    finalized:false,stopTimer:null
   };
   rec.ondataavailable=e=>{if(e.data?.size)blobs.push(e.data)};
   rec.onerror=()=>{toast('Микрофон прервал запись. Сохраняем полученный фрагмент.');if(record?.rec===rec)finishRecording()};
   rec.onstop=async()=>{
    if(active.finalized)return;
    active.finalized=true;clearTimeout(active.stopTimer);
    try{
     const blob=new Blob(blobs,{type:rec.mimeType||blobs[0]?.type||'audio/webm'});
     // Reconcile wall-clock video time with actual encoded microphone duration.
     // If a browser truncated audio, warn immediately instead of silently
     // dropping several seconds on the timeline and final premiere.
     if(blob.size&&active.end>active.start){
      let duration=NaN,ctx=null;
      try{
       const Context=window.AudioContext||window.webkitAudioContext;
       if(Context){
        ctx=new Context();
        duration=(await ctx.decodeAudioData(await blob.arrayBuffer())).duration;
       }
      }catch{/* Unsupported browser codecs are validated again during export. */}
      finally{if(ctx)void ctx.close().catch(()=>{})}
      const timing=reconcileRecordingEnd(active.start,active.end,duration);
      if(timing.short){
       active.end=Math.min(scene.duration,timing.end);
       toast('Микрофон записал меньше звука, чем шло видео. Дубль не растянут — прослушай его.');
      }
     }
     if(blob.size>MAX_AUDIO_BYTES){toast('Запись слишком большая для передачи. Сделай реплику короче.');}
     else if(blob.size&&active.end-active.start>=MIN_CLIP_SECONDS){
      if(active.replaceId){
       const id=uid();
       const updated=replaceSelectedRecording(localClips,active.replaceId,blob,active.end-active.start,id);
       if(updated){editHistory.remember(localClips);setClips(updated,id);await draftWrite()}
       else toast('Получился слишком короткий дубль. Попробуй ещё раз.');
      }else await replaceClip(active.start,active.end,blob);
     }else toast('Дубль слишком короткий, попробуй записать дольше.');
    }catch(e){toast('Не удалось сохранить запись: '+(e?.message||'ошибка'))}
    finally{
     stopMicMonitor();stream.getTracks().forEach(t=>t.stop());
     $('record-badge').classList.add('hidden');
     $('stage-video').muted=!filmSound;
     pendingRecording=null;renderTimeline();updateRecordingControls();active.resolve?.();
    }
   };
   video.muted=true;
   await video.play();
   if(cancelled||preroll!==session){video.pause();stream.getTracks().forEach(t=>t.stop());return}
   active.start=time(video);
   // One final container chunk: MediaRecorder timeslices and requestData()
   // can create unplayable fragmented MP4/AAC on iOS Safari.
   rec.start();record=active;preroll=null;
   for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{
    if(record?.rec===rec){toast('Микрофон отключился. Сохраняем уже записанное.');finishRecording()}
   },{once:true});
   // No speaker cue after the microphone starts: AEC is disabled by design,
   // and the former beep leaked into the first syllable on phone speakers.
   playing=true;
   $('record-badge').classList.remove('hidden');
   updateRecordingControls();
  }catch(e){
   stopMicMonitor();if(rec&&rec.state!=='inactive')rec.stop();else stream.getTracks().forEach(t=>t.stop());
   if(preroll===session)preroll=null;
   record=null;$('stage-video').muted=!filmSound;
   $('countdown').classList.add('hidden');updateRecordingControls();
   toast('Не удалось запустить видео и запись.');
  }
 };
 if(countdown===3){
  let left=3;
  $('countdown').classList.remove('hidden');countdownBeat(3);
  updateRecordingControls();
  const tick=()=>{
   if(cancelled||preroll!==session)return;
   left--;
   if(left>0){countdownBeat(left);session.timer=setTimeout(tick,1000)}
   else void launch();
  };
  session.timer=setTimeout(tick,1000);
 }else{
  updateRecordingControls();
  await launch();
 }
}
function cancelCountdown(){
 if(!preroll)return;
 clearTimeout(preroll.timer);preroll.cancel();
 preroll=null;$('countdown').classList.add('hidden');
 updateRecordingControls();
}
function finishRecording(){
 if(!record)return pendingRecording;
 const r=record;record=null;
 r.end=Math.min(r.limit,scene.duration,time($('stage-video')));
 pendingRecording=new Promise(resolve=>{r.resolve=resolve});
 stopAllPlayback();
 if(r.rec.state!=='inactive'){
  try{r.rec.stop()}catch{ /* The browser may already be finishing. */ }
 }
 // In rare mobile WebKit failures onstop is never dispatched. Release the
 // editor without hanging forever; any received chunk is still preserved.
 r.stopTimer=setTimeout(()=>{
  if(!r.finalized){toast('Браузер не завершил запись. Проверяем доступный фрагмент.');void r.rec.onstop?.()}
 },5000);
 cue('stop');updateRecordingControls();
 return pendingRecording;
}
async function replaceClip(a,b,blob){
 const id=uid(),owner=me||'solo';
 let next;
 try{next=spliceRecording(snapshotClips(localClips),{id,start:a,end:b,blob,owner},uid)}
 catch(e){toast(e.message||'Не получилось сохранить дубль.');return false}
 editHistory.remember(localClips);
 stopAllPlayback();
 setClips(next,id);
 return draftWrite();
}
async function deleteClip(){
 if(record||preroll||micPending||pendingRecording)return;
 const chosen=localClips.find(c=>c.id===selectedClip);
 if(!chosen){toast('Сначала выбери реплику на ленте.');return}
 if(!confirm('Удалить реплику '+fmt(chosen.start)+'–'+fmt(chosen.end)+'?'))return;
 editHistory.remember(localClips);
 stopAllPlayback();
 setClips(localClips.filter(c=>c.id!==chosen.id));
 await draftWrite();cue('stop');
}
async function markReady(){
 if(readyPending)return;
 if(micPending)return toast('Дождись ответа микрофона.');
 readyPending=true;
 const button=$('finish-btn'),original=button.textContent;
 button.disabled=true;button.textContent='Сохраняем…';
 try{
  cancelCountdown();
  if(record)finishRecording();
  if(pendingRecording)await pendingRecording;
  stopAllPlayback();
  if(!localClips.length){toast('Запиши хотя бы один фрагмент.');return}
  if(localClips.some(c=>c.blob.size>MAX_AUDIO_BYTES)){
   toast('Есть слишком большой фрагмент. Перезапиши его коротким дублем.');return;
  }
  if(!await draftWrite())return;
  if(mode==='solo'){beginPremiere();cue('ready');return}
  if(!state||state.phase!=='recording'){toast('Комната ещё не готова.');return}
  if(!debugPlay&&net?.socket?.readyState!==WebSocket.OPEN){toast('Нет связи. Реплики сохранены — дождись переподключения.');return}
  sendGame({type:'ready',count:localClips.length});
  waitUI();cue('ready');
 }finally{
  readyPending=false;button.disabled=false;button.textContent=original;
 }
}
function receivedCount(){return localClips.length+remoteClips.length}
function expectedCount(){if(mode==='solo')return localClips.length;return Object.values(state?.counts||{}).reduce((a,b)=>a+(Number(b)||0),0)}
function hasAllPremiereTracks(){
 const need=expectedCount(),got=receivedCount();
 return need>0&&got>=need&&!!scene&&(!!sceneSource(scene)||!!sourceBlob);
}
function resetPremiereResult(){
 if(premiereResultUrl)URL.revokeObjectURL(premiereResultUrl);
 premiereResultUrl=null;
 $('premiere-export-result').classList.add('hidden');
 const link=$('premiere-export-download');
 link.removeAttribute('href');link.removeAttribute('download');
}
function updatePremiereStatus(){
 const need=expectedCount(),got=receivedCount(),ready=need>0&&got>=need;
 $('premiere-loading').classList.toggle('hidden',ready);
 $('premiere-loading').textContent=ready?'':('Получаем дорожки · '+got+'/'+need);
 $('premiere-play').disabled=!ready||!!premiereExportController;
 $('premiere-repeat').disabled=!ready||!!premiereExportController;
 $('premiere-export').disabled=!hasAllPremiereTracks()||!!premiereExportController||!supportsPremiereExport();
 if(premiereExportController)return;
 $('premiere-export-status').textContent=!ready
  ?'Сначала получим все голоса · '+got+'/'+need
  :!supportsPremiereExport()
    ?'Этот браузер не поддерживает сохранение совместного видео. Попробуй Chrome или Safari новой версии.'
    :!hasAllPremiereTracks()
      ?'Исходное видео ещё не получено.'
      :premiereResultUrl
        ?'Файл готов. Можешь скачать его ещё раз.'
        :premiereExportNotice||('Сохраним изображение и '+got+' '+(got===1?'реплику':'реплик')+' в один файл. Обработка займёт примерно время сцены.');
}
function stopPremiereExport(clearResult=true){
 premiereExportGeneration++;
 const controller=premiereExportController;
 premiereExportController=null;
 controller?.abort();
 if(clearResult)resetPremiereResult();
 $('premiere-export-progress').classList.add('hidden');
 $('premiere-export-bar').value=0;
 $('premiere-film-audio').disabled=false;
 $('premiere-local-file').disabled=false;
}
async function downloadPremiere(){
 if(premiereExportController)return;
 if(!hasAllPremiereTracks())return toast('Дождись получения всех голосов.');
 if(!supportsPremiereExport())return toast('В этом браузере недоступен экспорт видео со звуком.');
 pausePremiere();
 updateClipSound(time($('premiere-video')),false,true);
 stopAllPlayback();
 $('premiere-play').textContent='▶ Смотреть премьеру';
 resetPremiereResult();premiereExportNotice='';
 const generation=++premiereExportGeneration;
 const controller=new AbortController();
 premiereExportController=controller;
 const progress=$('premiere-export-progress'),status=$('premiere-export-status'),bar=$('premiere-export-bar');
 progress.classList.remove('hidden');bar.value=0;
 $('premiere-export').disabled=true;
 $('premiere-export').textContent='Создаём файл…';
 $('premiere-play').disabled=true;$('premiere-repeat').disabled=true;
 $('premiere-export-cancel').disabled=false;
 $('premiere-film-audio').disabled=true;$('premiere-local-file').disabled=true;
 status.textContent='Подготавливаем звук…';
 const audioClips=[...localClips,...remoteClips].map(c=>({
  id:c.id,start:c.start,end:c.end,offset:c.offset,owner:c.owner,fx:normalizeVoiceEffect(c.fx),...clipMix(c),blob:c.blob
 }));
 const sceneCopy={...scene},input=premiereLocalCopy||(scene.custom?sourceBlob:sceneSource(scene));
 try{
  const result=await renderPremiere({
   source:input,scene:sceneCopy,clips:audioClips,
   keepFilmAudio:$('premiere-film-audio').checked,
   signal:controller.signal,
   onProgress:step=>{
    if(generation!==premiereExportGeneration)return;
    if(step.phase==='paused'){
     status.textContent='Экспорт на паузе · вернись на эту вкладку для продолжения без потери прогресса.';
    }else if(step.phase==='decoding'){
     const frac=step.total?step.done/step.total:0;
     bar.value=Math.round(frac*12);
     status.textContent='Подготавливаем голоса · '+step.done+'/'+step.total;
    }else if(step.phase==='encoding'){
     const frac=Math.max(0,Math.min(1,step.fraction));
     bar.value=12+Math.round(frac*88);
     status.textContent=frac>=1?'Завершаем файл…':
       'Создаём видео · '+Math.round(frac*100)+'% · около '+fmt(Math.ceil((1-frac)*sceneCopy.duration))+' до конца';
    }
   }
  });
  if(generation!==premiereExportGeneration||controller.signal.aborted)return;
  if(!result.size)throw Error('Получился пустой файл.');
  premiereResultUrl=URL.createObjectURL(result);
  const link=$('premiere-export-download');
  link.href=premiereResultUrl;
  link.download=premiereFilename(sceneCopy.title,result.type);
  $('premiere-export-size').textContent='Готово · '+formatVideoBytes(result.size)+' · '+(result.type.includes('mp4')?'MP4':'WebM');
  $('premiere-export-result').classList.remove('hidden');
  status.textContent='Видеофайл готов. Если скачивание не началось, нажми «Скачать ещё раз».';
  bar.value=100;
  // The permanent link remains available when the browser blocks automated
  // downloads after asynchronous recording, notably on some iOS versions.
  link.click();
  cue('ready');
 }catch(e){
  if(generation!==premiereExportGeneration)return;
  if(e?.name==='AbortError'){
   premiereExportNotice='Экспорт отменён. Все реплики сохранены.';
   status.textContent=premiereExportNotice;
  }else{
   premiereExportNotice=e?.message||'Не удалось сохранить видео. Попробуй другой формат исходника.';
   status.textContent=premiereExportNotice;
   if(!sceneCopy.custom&&/сервер|встроенного|исходного видео|запись кадров/i.test(status.textContent))
     $('premiere-local-fallback').classList.remove('hidden');
   toast(status.textContent);
  }
 }finally{
  if(generation===premiereExportGeneration){
   premiereExportController=null;
   $('premiere-film-audio').disabled=false;$('premiere-local-file').disabled=false;
   progress.classList.add('hidden');
   $('premiere-export').textContent='↓ Сохранить видео';
   updatePremiereStatus();
  }
 }
}
function beginPremiere(){
 $('premiere-film-audio').checked=!!scene?.cleaned;
 document.querySelector('#premiere-film-audio + span').textContent=scene?.cleaned?
  'Фоновая музыка и эффекты без оригинальных реплик':'Звук оригинального фильма';
 stopPremiereExport();premiereExportNotice='';premiereLocalCopy=null;$('premiere-local-fallback').classList.add('hidden');stopAllPlayback();setVideoSources('premiere-video');$('premiere-video').muted=!scene?.cleaned;$('premiere-credits').innerHTML=(state?.players||[{id:'solo',name}]).map((p,i)=>'<span class="credit" style="border-left-color:'+colors[i%colors.length]+'">'+esc(p.name)+' · '+esc(state?.assignments?.[p.id]||'Все роли')+'</span>').join('')+(scene.custom?'':'<span class="credit">© '+(scene.id.startsWith('bunny')?'Blender Foundation · CC BY 3.0':'Blender Studio · CC BY 4.0')+' · Голоса изменены</span>');$('premiere-scrub').max=String(Math.round(scene.duration*10));$('premiere-scrub').value='0';premiereAB='dub';$('premiere-ab').setAttribute('aria-pressed','false');$('premiere-ab').textContent='A/B · Оригинал';$('premiere-new-scene').classList.toggle('hidden',!meHost());show('premiere');seekVideo($('premiere-video'),0);updatePremiereStatus();sendAllOwn()}
function pausePremiere(){const v=$('premiere-video');v.pause();updateClipSound(time(v),false,true);$('premiere-play').textContent='▶ Смотреть премьеру'}
async function playPremiere(){if(receivedCount()<expectedCount())return;const v=$('premiere-video');if(!v.paused){pausePremiere();return}if(time(v)>=scene.duration-.08)seekVideo(v,0);try{v.muted=premiereAB==='dub'&&!scene?.cleaned;updateClipSound(time(v),premiereAB==='dub',true);await v.play();$('premiere-play').textContent='Ⅱ Пауза'}catch{toast('Нажми ещё раз для запуска со звуком.')}}

$('sound-btn').onclick=toggleSound;
$('solo-btn').onclick=()=>{mode='solo';library()};
$('create-btn').onclick=()=>{mode='host';scene=null;sourceBlob=null;void connectRoom('create')};
$('join-btn').onclick=()=>{mode='guest';state=null;scene=null;setNetStatus('idle','PocketNet');show('room');roomUI();$('join-code').focus()};
$('room-change-scene').onclick=()=>{
 if(!meHost()||state?.phase!=='lobby')return;
 if(state?.configured!==false&&scene&&!window.confirm('Заменить видео в комнате? Текущий выбранный файл останется, пока ты не подтвердишь новую сцену.'))return;
 pendingScenePicker=false;library();
};
$('scene-grid').onclick=e=>{const b=e.target.closest('[data-scene]');if(b){const s=LIBRARY.find(x=>x.id===b.dataset.scene);if(s)selectScene(s)}};
$('video-file').onchange=e=>{uploadVideo(e.target.files[0]);e.target.value=''};
trimRange=createTrimRange({video:$('trim-video'),onChange:({start,end})=>{
 $('trim-start').value=String(start);
 $('trim-length').value=String(end-start);
 if(videoExportBlob)clearExportPreview();
 updateMediaLab();updateFilmCleaner();
}});
$('film-low-memory').onchange=()=>{
 if($('film-low-memory').checked){
  if(Number($('media-resolution').value)>640)$('media-resolution').value='640';
  if(Number($('media-quality').value)>3)$('media-quality').value='3';
 }
 // Different memory/encoding settings require a new result.
 invalidateMediaResult();updateFilmCleaner();
};
document.querySelectorAll('input[name="film-clean-mode"]').forEach(input=>input.onchange=()=>{
 if(videoExportBlob)clearExportPreview();
 updateFilmCleaner();
 $('film-clean-status').textContent='Выбран '+(FILM_MODES.find(x=>x.id===filmMode())?.name||'Open-Unmix')+
  '. Нажми «Подготовить звук без голосов» либо продолжи — обработка начнётся перед переходом.';
});
document.querySelectorAll('input[name="film-sound-choice"]').forEach(input=>{
 input.onchange=updateSoundChoice;
});
$('trim-edit-range').onclick=()=>{
 if(videoExportController||filmCleanController)return;
 if(videoExportBlob&&!window.confirm('Изменение границ отменит текущую обработку. Изменить отрывок?'))return;
 if(videoExportBlob)clearExportPreview();
 setScenePrepStep('trim');
};
$('review-retry').onclick=()=>setScenePrepStep('sound');
async function reviewWithSound(kind){
 if(videoExportController||filmCleanController)return;
 const input=document.querySelector('input[name="film-sound-choice"][value="'+kind+'"]');
 if(!input)return;
 setScenePrepStep('sound');
 input.checked=true;
 updateSoundChoice();
 await prepareSelectedScene();
}
$('review-mute').onclick=()=>{void reviewWithSound('mute')};
$('review-original').onclick=()=>{void reviewWithSound('original')};
$('review-change-video').onclick=()=>{
 if(!window.confirm('Выбрать другой исходный файл? Эта сцена останется доступна до выбора нового видео.'))return;
 library(true);
};

$('film-clean-start').onclick=()=>{void prepareSelectedScene()};
$('film-clean-cancel').onclick=()=>filmCleanController?.abort();
$('film-local-file').onchange=e=>{
 const file=e.target.files?.[0];if(!file)return;
 if(file.size>MAX_SOURCE_VIDEO_BYTES)return toast('Локальная копия должна быть не больше 512 МиБ.');
 filmLocalSource=file;
 $('film-local-fallback').classList.add('hidden');
 $('film-clean-status').textContent='Локальная копия загружена. Теперь нажми «Подготовить звук без голосов».';
};
$('media-quality').oninput=invalidateMediaResult;
$('media-resolution').onchange=invalidateMediaResult;
$('media-render').onclick=()=>{void prepareSelectedScene()};
$('media-cancel').onclick=()=>videoExportController?.abort();
$('media-discard').onclick=()=>{clearExportPreview();setScenePrepStep('sound');updateMediaLab()};
$('trim-video').addEventListener('timeupdate',()=>{
 if(view!=='trim'||scenePrepareStep!=='review'||$('trim-video').classList.contains('hidden'))return;
 const v=$('trim-video'),start=Number($('trim-start').value)||0;
 const end=start+(Number($('trim-length').value)||0);
 if(v.currentTime>=end-.04&&end>start){
  v.pause();try{v.currentTime=start}catch{}
 }else if(v.currentTime<start-.04){try{v.currentTime=start}catch{}}
});
$('preview-original').onclick=()=>showTrimPreview('source');
$('preview-result').onclick=()=>showTrimPreview('result');
$('add-role').onclick=()=>{if(selected.roles.length>=12)return toast('Максимум 12 персонажей.');selected.roles.push('Новый персонаж');renderRoles()};
$('role-tags').onclick=e=>{const b=e.target.closest('[data-remove-role]');if(!b)return;if(selected.roles.length<2)return toast('Оставь хотя бы одну роль.');selected.roles.splice(Number(b.dataset.removeRole),1);renderRoles()};
$('role-tags').oninput=e=>{if(e.target.matches('[data-role-index]'))selected.roles[Number(e.target.dataset.roleIndex)]=e.target.value};
$('confirm-scene').onclick=confirmScene;

$('room-retry').onclick=()=>connectRoom(retryRoomAction,retryCheckpoint);
$('enter-room').onclick=()=>{const code=$('join-code').value.trim();if(!/^[a-f0-9-]{8,36}$/i.test(code))return toast('Введи код из приглашения.');connectRoom('join')};
$('copy-invite').onclick=()=>{if(!room)return;const url=new URL(location.href);url.search='?room='+room.slice(0,8).toUpperCase();const text=url.href;navigator.clipboard?.writeText(text).then(()=>toast('Ссылка скопирована')).catch(()=>toast('Код: '+room.slice(0,8).toUpperCase()))};
$('room-players').onchange=async e=>{
 const video=e.target.closest('[data-room-video]');
 if(video){const f=video.files?.[0];if(!f)return;
  if(f.size>MAX_ROOM_VIDEO_BYTES||(!f.type.startsWith('video/')&&!/\.(mp4|webm|mov)$/i.test(f.name)))return toast('Нужна версия видео до 96 МиБ.');
  const test=document.createElement('video'),src=URL.createObjectURL(f);
  const duration=await new Promise(resolve=>{test.preload='metadata';test.src=src;test.onloadedmetadata=()=>resolve(test.duration);test.onerror=()=>resolve(0);setTimeout(()=>resolve(0),8000)});
  test.removeAttribute('src');test.load();URL.revokeObjectURL(src);
  if(!Number.isFinite(duration)||duration<scene.start+scene.duration-.1)return toast('Это видео не подходит по продолжительности.');
  sourceBlob=f;setVideoSources();
  if(meHost()){
   projectKey=sceneDraftKey();
   if(!await draftWrite())return;
   for(const p of state?.players||[])if(p.id!==me)sendVideoTo(p.id);
  }else sendGame({type:'media_ready',scene:scene.id,epoch:state?.mediaEpoch});
  toast('Видео подключено.');roomUI();return;
 }
 const sel=e.target.closest('[data-assign]');if(sel)sendGame({type:'assign',target:sel.dataset.assign,role:sel.value});
};
$('room-start').onclick=()=>sendGame({type:'start'});
$('play-toggle').onclick=playStage;
$('record-btn').onclick=()=>startRecord(0);
$('count-record-btn').onclick=()=>startRecord(3);
$('replace-clip-btn').onclick=()=>{if(selectedClip)void startRecord(0,selectedClip)};
// Main presets stay visible; additional circuits are grouped in a compact
// expandable shelf rather than creating a second bulky editing screen.
const fxButton=fx=>'<button type="button" data-voice-fx="'+fx.id+'" aria-pressed="false">'+fx.label+'</button>';
const favoriteVoiceIds=(()=>{try{return JSON.parse(localStorage.getItem(STORE+'favorite-voices')||'[]').filter(id=>VOICE_EFFECTS.some(fx=>fx.id===id)).slice(0,8)}catch{return []}})();
$('voice-effects-options').innerHTML=
 '<div id="voice-fx-favorites" class="voice-fx-favorites hidden" aria-label="Избранные эффекты"></div>'+ 
 '<div class="voice-fx-primary">'+VOICE_EFFECTS.filter(fx=>fx.category==='main').map(fxButton).join('')+'</div>'+
 '<div class="voice-fx-toolbar"><button id="voice-fx-more" type="button" aria-controls="voice-fx-extra" aria-expanded="false">Ещё эффекты ↓</button>'+
 '<button id="voice-fx-audition" type="button" title="Послушать выбранную реплику с текущим эффектом">▶ Послушать</button>'+ 
 '<button id="voice-fx-pin" type="button" title="Добавить текущий эффект в избранное" aria-pressed="false">☆ Избранное</button></div>'+
 '<div id="voice-fx-extra" class="voice-fx-extra hidden">'+VOICE_EFFECT_GROUPS.map(group=>
  '<div class="voice-fx-group"><span>'+group.label+'</span><div class="voice-fx-buttons">'+
  VOICE_EFFECTS.filter(fx=>fx.category===group.id).map(fxButton).join('')+'</div></div>'
 ).join('')+'</div>';
// Primary circuits and the grouped shelf occupy one reserved space on
// desktop. Opening the shelf never resizes the workspace or video frame.
const effectStage=document.createElement('div');
effectStage.className='voice-fx-stage';
$('voice-fx-primary')?.remove(); // no-op for older cached DOM
const primaryEffects=$('voice-effects-options').querySelector('.voice-fx-primary');
primaryEffects.before(effectStage);
effectStage.append(primaryEffects,$('voice-fx-extra'));
function renderFavoriteVoiceEffects(){
 const shelf=$('voice-fx-favorites');
 shelf.classList.toggle('hidden',!favoriteVoiceIds.length);
 shelf.innerHTML=favoriteVoiceIds.map(id=>VOICE_EFFECTS.find(f=>f.id===id)).filter(Boolean).map(fxButton).join('');
 const current=localClips.find(c=>c.id===selectedClip);
 const pinned=!!current&&favoriteVoiceIds.includes(normalizeVoiceEffect(current.fx));
 const button=$('voice-fx-pin');
 button.setAttribute('aria-pressed',String(pinned));
 button.textContent=pinned?'★ В избранном':'☆ Избранное';
}
renderFavoriteVoiceEffects();
$('voice-effects-options').onclick=e=>{
 if(e.target.closest('#voice-fx-pin')){
  const current=localClips.find(c=>c.id===selectedClip);
  if(!current)return;
  const id=normalizeVoiceEffect(current.fx),at=favoriteVoiceIds.indexOf(id);
  if(at>=0)favoriteVoiceIds.splice(at,1);
  else if(favoriteVoiceIds.length<8)favoriteVoiceIds.unshift(id);
  else return toast('Можно закрепить не больше 8 эффектов.');
  try{localStorage.setItem(STORE+'favorite-voices',JSON.stringify(favoriteVoiceIds))}catch{}
  renderFavoriteVoiceEffects();renderTimeline();return;
 }
 const more=e.target.closest('#voice-fx-more');
 if(more){
  voiceFxExpanded=!voiceFxExpanded;
  $('voice-fx-extra').classList.toggle('hidden',!voiceFxExpanded);
  $('voice-effects').classList.toggle('fx-expanded',voiceFxExpanded);
  more.setAttribute('aria-expanded',String(voiceFxExpanded));
  more.textContent=voiceFxExpanded?'Свернуть эффекты ↑':'Ещё '+VOICE_EFFECTS.filter(f=>f.category!=='main').length+' эффектов ↓';
  return;
 }
 const listen=e.target.closest('#voice-fx-audition');
 if(listen){
  const clip=localClips.find(c=>c.id===selectedClip);
  if(!clip||record||preroll||micPending||pendingRecording)return;
  setPlayhead(clip.start);
  void playStage();return;
 }
 const btn=e.target.closest('[data-voice-fx]');
 if(!btn||record||preroll||micPending||pendingRecording)return;
 const current=localClips.find(c=>c.id===selectedClip);
 if(!current)return;
 const fx=normalizeVoiceEffect(btn.dataset.voiceFx);
 if(current.fx===fx)return;
 editHistory.remember(localClips);
 // Reconnect the clip's Web Audio nodes without stopping the playing film.
 // This makes preset switching audible immediately during preview.
 current.fx=fx;current.fxReady=null;
 if(current.fxSource)ensureClipVoice(current);
 renderTimeline();void draftWrite();cue('ready');
};
// Deliberate, local mixing: keep soft and loud acting intact.
let mixBefore=null,mixClipId=null;
for(const [id,field] of [['clip-volume','volume'],['clip-fade-in','fadeIn'],['clip-fade-out','fadeOut']]){
 const el=$(id);
 const begin=()=>{mixClipId=selectedClip;mixBefore=snapshotClips(localClips)};
 el.addEventListener('pointerdown',begin);el.addEventListener('focus',begin);
 el.addEventListener('input',()=>{
  const c=localClips.find(c=>c.id===selectedClip);if(!c)return;
  c[field]=Number(el.value)/100;
  $(id+'-label').textContent=field==='volume'?Math.round(c.volume*100)+'%':c[field].toFixed(2)+' с';
  if(playing||!$('premiere-video').paused)updateClipSound(time(view==='premiere'?$('premiere-video'):$('stage-video')),true,view==='premiere');
 });
 el.addEventListener('change',()=>{
  const c=localClips.find(c=>c.id===selectedClip);if(!c)return;
  if(mixBefore&&mixClipId===selectedClip){
   const old=mixBefore.find(x=>x.id===selectedClip);
   if(old&&old[field]!==c[field])editHistory.remember(mixBefore);
  }
  mixBefore=null;mixClipId=null;
  renderTimeline();void draftWrite();
 });
}
$('timeline-zoom-in').onclick=()=>zoomTimeline(1);
$('timeline-zoom-out').onclick=()=>zoomTimeline(-1);
$('timeline-viewport').addEventListener('wheel',e=>{
 if(view!=='editor'||!scene)return;
 if(e.ctrlKey||e.metaKey){
  e.preventDefault();zoomTimeline(e.deltaY<0?1:-1);
 }else if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){
  e.preventDefault();$('timeline-viewport').scrollLeft+=e.deltaY;
 }
},{passive:false});
$('scrubber').oninput=e=>{if(record||preroll||micPending||pendingRecording)return;setPlayhead(Number(e.target.value)/10)};
$('clip-lane').onpointerdown=e=>{
 if(e.button!==0||record||preroll||micPending||pendingRecording)return;
 const button=e.target.closest('[data-clip]'),clip=localClips.find(c=>c.id===button?.dataset.clip);
 if(!clip)return;
 skipTimelineClick=false;
 const edge=e.target.closest('[data-edge]')?.dataset.edge;
 clipDrag={id:clip.id,kind:edge||'move',x:e.clientX,element:button,
  originalStart:clip.start,originalEnd:clip.end,preview:null,moved:false};
 selectedClip=clip.id;
 button.setPointerCapture(e.pointerId);
 e.preventDefault();
};
$('clip-lane').onpointermove=e=>{
 const drag=clipDrag;if(!drag)return;
 const distance=e.clientX-drag.x;
 if(Math.abs(distance)<3&&!drag.moved)return;
 drag.moved=true;
 const w=Math.max(1,$('timeline-content').getBoundingClientRect().width);
 const seconds=distance/w*scene.duration;
 const edited=editClipResult(drag.id,drag.kind,seconds);
 drag.preview=edited;
 const c=edited?.find(x=>x.id===drag.id);
 if(c){
  drag.element.style.left=(c.start/scene.duration*100)+'%';
  drag.element.style.width=((c.end-c.start)/scene.duration*100)+'%';
  $('selected-clip-info').textContent=fmtFine(c.start)+' – '+fmtFine(c.end)+' · '+(drag.kind==='move'?'перемещение':'подрезка');
 }
 drag.element.classList.add('dragging');
 e.preventDefault();
};
$('clip-lane').onpointerup=e=>{
 const drag=clipDrag;if(!drag)return;
 clipDrag=null;
 if(drag.element.hasPointerCapture(e.pointerId))drag.element.releasePointerCapture(e.pointerId);
 if(drag.moved){
  skipTimelineClick=true;
  if(!commitClipEdit(drag.preview,drag.id))renderTimeline();
 }else{
  const clip=localClips.find(c=>c.id===drag.id);
  if(clip){
   setPlayhead(clip.start);renderTimeline();
   $('clip-lane').querySelector('[data-clip="'+clip.id+'"]')?.focus({preventScroll:true});
  }
 }
};
$('clip-lane').onpointercancel=e=>{
 if(!clipDrag)return;
 clipDrag=null;renderTimeline();
};
$('clip-lane').onclick=e=>{
 const b=e.target.closest('[data-clip]');if(!b||record||preroll)return;
 if(skipTimelineClick){skipTimelineClick=false;return}
 const clip=localClips.find(c=>c.id===b.dataset.clip);if(!clip)return;
 const wasFocused=document.activeElement===b;
 selectedClip=clip.id;setPlayhead(clip.start);renderTimeline();
 if(wasFocused)$('clip-lane').querySelector('[data-clip="'+clip.id+'"]')?.focus({preventScroll:true});
};
$('undo-btn').onclick=undoEdit;
$('redo-btn').onclick=redoEdit;
$('erase-btn').onclick=deleteClip;
$('finish-btn').onclick=markReady;
$('mute-film').onclick=()=>{filmSound=!filmSound;$('mute-film').textContent='Звук фильма: '+(filmSound?'вкл.':'выкл.');$('mute-film').setAttribute('aria-pressed',String(filmSound));$('stage-video').muted=!filmSound};
$('editor-leave').onclick=async()=>{
 cancelCountdown();
 if(record)finishRecording();
 if(pendingRecording)await pendingRecording;
 stopAllPlayback();
 if(projectKey&&!await draftWrite())return;
 if(mode!=='solo'&&state)roomUI();else library();
};
$('reveal-btn').onclick=()=>sendGame({type:'reveal'});
$('unready-btn').onclick=()=>{sendGame({type:'unready'});openEditor()};
$('premiere-play').onclick=playPremiere;
$('premiere-export').onclick=downloadPremiere;
$('premiere-export-cancel').onclick=()=>premiereExportController?.abort();
$('premiere-film-audio').onchange=()=>{premiereExportNotice='';resetPremiereResult();updatePremiereStatus()};
$('premiere-local-file').onchange=async e=>{
 const file=e.target.files?.[0];e.target.value='';
 if(!file||!scene||view!=='premiere'||premiereExportController)return;
 if(file.size>MAX_SOURCE_VIDEO_BYTES)return toast('Локальная копия не должна превышать 512 МиБ.');
 if(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov)$/i.test(file.name))
   return toast('Выбери видеофайл MP4, WebM или MOV.');
 const video=document.createElement('video'),url=URL.createObjectURL(file);
 video.preload='metadata';video.src=url;
 try{
  const duration=await new Promise((resolve,reject)=>{
   let finished=false;
   const done=(result)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result)};
   const timer=setTimeout(()=>done(0),12000);
   video.onloadedmetadata=()=>measureVideoDuration(video).then(done).catch(()=>done(0));
   video.onerror=()=>done(0);
   video.load();
  });
  if(!duration||duration+.15<scene.start+scene.duration)
   return toast('В этом файле нет всей выбранной сцены.');
  premiereLocalCopy=file;
  premiereExportNotice='Локальная копия фильма выбрана. Теперь можно повторить сохранение.';
  resetPremiereResult();
  $('premiere-local-fallback').classList.add('hidden');
  $('premiere-export-status').textContent='Локальная копия готова. Сохрани видео с общими голосами.';
  updatePremiereStatus();
 }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
};
$('premiere-repeat').onclick=()=>{pausePremiere();setPlayhead(0,true)};
$('premiere-ab').onclick=()=>{
   premiereAB=premiereAB==='dub'?'original':'dub';
   $('premiere-ab').setAttribute('aria-pressed',String(premiereAB==='original'));
   $('premiere-ab').textContent=premiereAB==='dub'?'A/B · Оригинал':'A/B · Наш дубляж';
   $('premiere-video').muted=premiereAB==='dub'&&!scene?.cleaned;
   updateClipSound(time($('premiere-video')),premiereAB==='dub'&&!$('premiere-video').paused,true);
};
$('premiere-scrub').oninput=e=>{pausePremiere();setPlayhead(Number(e.target.value)/10,true)};
$('premiere-new-scene').onclick=()=>{
   if(!meHost()||state?.phase!=='premiere')return;
   pendingScenePicker=true;sendGame({type:'again'});
};
$('premiere-back').onclick=()=>{if(mode==='solo'){stopPremiereExport();pausePremiere();openEditor()}else if(meHost()){stopPremiereExport();pausePremiere();sendGame({type:'again'})}else toast('Новую сцену начинает ведущий.')};
for(const b of document.querySelectorAll('[data-back]'))b.onclick=async()=>{
 if(view==='trim'){
  if(scenePrepareStep==='review'){setScenePrepStep('sound');return;}
  if(scenePrepareStep==='sound'){setScenePrepStep('trim');return;}
  if(videoExportBlob&&!window.confirm('Выйти из монтажа? Готовый фрагмент не будет использован.'))return;
 }
 const to=b.dataset.back;if(view==='premiere')stopPremiereExport();if(view==='wait'&&mode!=='solo'){sendGame({type:'unready'});await openEditor()}else if(to==='room'&&room){pendingScenePicker=false;roomUI()}else if(to==='home'){if(await resetRuntime()){leaveNetwork();show('home')}}else if(to==='library'){videoExportController?.abort();clearExportPreview();library()}else if(to==='trim'){show('trim');setVideoSources('trim-video');setScenePrepStep('review')}else if(to==='editor')await openEditor()};
$('stage-video').ontimeupdate=()=>{if(!scene)return;const t=time($('stage-video'));if(record&&t>=record.limit-.035)finishRecording();
else if(t>=scene.duration-.05){if(record)finishRecording();else if(!$('stage-video').paused){stopAllPlayback();seekVideo($('stage-video'),scene.duration-.04)}}if(!record)updateClipSound(t,playing,false);renderPlayhead()};
$('premiere-video').ontimeupdate=()=>{if(!scene)return;const t=time($('premiere-video'));$('premiere-scrub').value=String(Math.round(t*10));if(t>=scene.duration-.04){pausePremiere();seekVideo($('premiere-video'),scene.duration-.04)}else updateClipSound(t,premiereAB==='dub'&&!$('premiere-video').paused,true)};
$('stage-video').onpause=()=>{
 if(record&&!document.hidden){
  // Paused/stalled video must never keep consuming the microphone clock.
  finishRecording();
  toast('Видео остановилось. Записанный фрагмент сохраняется отдельно.');
 }else if(!record){playing=false;$('play-toggle').textContent='▶';updateClipSound(time($('stage-video')),false)}
};
// iOS/Android may suspend the recorder without emitting pause/resume data.
// Save a bounded partial take rather than appending seconds of holes.
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&preroll){
  cancelCountdown();
  interruptedVoiceTake=true;
 }
 if(document.hidden&&record){
  interruptedVoiceTake=true;
  finishRecording();
 }else if(!document.hidden&&interruptedVoiceTake){
  interruptedVoiceTake=false;
  toast('Запись прервалась при сворачивании. Готовая часть сохранена, продолжи новым дублем.');
 }
 if(!document.hidden&&voiceFxContext?.state==='suspended')
  void voiceFxContext.resume().catch(()=>{});
});
window.addEventListener('pagehide',()=>{filmCleanController?.abort();premiereExportController?.abort();if(record)finishRecording();draftWrite()});
document.addEventListener('keydown',e=>{
 if(view!=='editor'||e.target.matches('input,select,textarea,[contenteditable="true"]'))return;
 if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){
   e.preventDefault();if(e.shiftKey)redoEdit();else undoEdit();
 }else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){
   e.preventDefault();redoEdit();
 }else if(selectedClip&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){
   e.preventDefault();
   const kind=e.ctrlKey?'right':e.shiftKey?'left':'move';
   const delta=(e.key==='ArrowRight'?1:-1)*0.1;
   commitClipEdit(editClipResult(selectedClip,kind,delta),selectedClip);
 }else if(e.code==='Space'&&!e.repeat){
   e.preventDefault();playStage();
 }else if(e.code==='KeyR'&&!e.ctrlKey&&!e.metaKey&&!e.repeat){
   e.preventDefault();startRecord(e.shiftKey?3:0);
 }else if(e.key==='Delete'||e.key==='Backspace'){
   if(selectedClip){e.preventDefault();void deleteClip()}
 }else if(e.key==='Escape'){
   if(record||preroll){cancelCountdown();finishRecording()}
   else if(selectedClip){selectedClip=null;renderTimeline();}
 }
});
async function initializeIdentityAndRecovery(){
 if(['1','play'].includes(new URLSearchParams(location.search).get('debug')))return; // QA preview must never auto-join a saved room.
 try{
  identity=await getPocketIdentity();
  name=identity?.complete?identity.nickname:(session.getItem('name')||('Гость '+String(Math.floor(100+Math.random()*900))));
 }catch{
  name=session.getItem('name')||('Гость '+String(Math.floor(100+Math.random()*900)));
 }
 if(!identity?.complete&&!debugPlay)session.setItem('name',name);
 const incoming=new URLSearchParams(location.search).get('room');
 const checkpoint=roomCheckpoint().read();
 if(incoming){
  if(checkpoint&&checkpoint.roomId.slice(0,8).toLowerCase()===incoming.slice(0,8).toLowerCase()){
   mode=checkpoint.mode;$('join-code').value=checkpoint.roomId;void connectRoom('resume',checkpoint);
  }else{
   mode='guest';$('join-code').value=incoming.toUpperCase();void connectRoom('join');
  }
 }else if(checkpoint){
  mode=checkpoint.mode;$('join-code').value=checkpoint.roomId;
  void connectRoom('resume',checkpoint);
 }
}

function mockConnect(){
 room='D3B6A1F2';me='debug-host';name='Тестовый ведущий';mode='host';
 const s=sceneForServer()||{id:'wing',title:'Видео не выбрано',start:44,duration:55,roles:['Кот','Пёс','Курица'],custom:false};
 state={phase:'lobby',host:me,players:[{id:me,name:'Тестовый ведущий'},{id:'debug-guest',name:'Тестовый актёр'}],
  scene:s,configured:!!scene,round:1,mediaEpoch:1,revision:1,assignments:{[me]:'Кот','debug-guest':'Пёс'},
  mediaReady:{[me]:true,'debug-guest':true},ready:{},counts:{}};
 setNetStatus('online','Демо · локально');roomUI();
}
function mockGame(msg){
 if(!state)return;
 const next={...state,assignments:{...state.assignments},mediaReady:{...state.mediaReady},
  ready:{...state.ready},counts:{...state.counts},revision:state.revision+1};
 if(msg.type==='scene'&&next.phase==='lobby'){
  next.scene={...msg.scene};next.configured=true;next.mediaEpoch++;
  next.assignments={[me]:msg.scene.roles[0]||'Актёр','debug-guest':msg.scene.roles[1]||msg.scene.roles[0]||'Актёр'};
  next.mediaReady={[me]:true,'debug-guest':true};
 }else if(msg.type==='start'&&next.phase==='lobby'&&next.configured){
  next.phase='recording';next.counts={};next.ready={};
 }else if(msg.type==='ready'&&next.phase==='recording'){
  next.ready[me]=true;next.ready['debug-guest']=true;next.counts[me]=msg.count;next.counts['debug-guest']=0;
 }else if(msg.type==='unready'&&next.phase==='recording'){
  delete next.ready[me];delete next.counts[me];
 }else if(msg.type==='reveal'&&next.phase==='recording'){
  next.phase='premiere';
 }else if(msg.type==='again'&&next.phase==='premiere'){
  next.phase='lobby';next.ready={};next.counts={};next.round++;
 }else if(msg.type==='assign'&&next.phase==='lobby'){
  next.assignments[msg.target]=msg.role;
 }else return;
 stateChanged(next);
}
async function startDebugPlay(){
 const requested=new URLSearchParams(location.search).get('screen')||'home';
 // Visual QA runs the actual application code, but never opens a real socket.
 if(requested==='home')return;
 if(requested==='library'){mode='solo';library();return}
 if(requested==='trim'){mode='solo';selectScene(LIBRARY[0]);return}
 if(requested.startsWith('room')||requested==='wait'||requested==='premiere'||requested==='premiere-export'){
  if(requested==='wait'||requested.startsWith('premiere'))scene={...LIBRARY[0],roles:[...LIBRARY[0].roles]};
  mockConnect();
  if(requested==='room-offline'){
   networkInterrupted=true;connectionNotice();setNetStatus('offline','Тест: нет связи');
  }
  if(requested==='wait'){
   const next={...state,phase:'recording',ready:{[me]:true,'debug-guest':false},counts:{[me]:1}};
   state=next;waitUI();
  }else if(requested.startsWith('premiere')){
   state={...state,phase:'premiere',counts:{},ready:{}};beginPremiere();
  }
  return;
 }
 if(requested.startsWith('editor')){
  mode='solo';scene={...LIBRARY[0],roles:[...LIBRARY[0].roles]};
  await openEditor();
 }
}
void initializeIdentityAndRecovery();
if(debugPlay)void startDebugPlay();
if(!debugPlay&&'serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
