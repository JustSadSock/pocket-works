import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createTrimRange} from './trim-range.js';
import {meterHeights} from './studio-feedback.js';
import {MAX_AUDIO_BYTES,MAX_INCOMING_TRANSFERS,validAudioEnvelope,validVideoEnvelope,canAcceptVoice} from './media-protocol.js';
import {renderPremiere,supportsPremiereExport,premiereFilename} from './premiere-export.js';
import {TimelineHistory,snapshotClips,spliceRecording,packTimeline,unpackTimeline,editClip,replaceSelectedRecording,MIN_CLIP_SECONDS} from './timeline-model.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createRoomRecovery} from './room-recovery.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {MAX_ROOM_VIDEO_BYTES,MAX_SOURCE_VIDEO_BYTES,formatVideoBytes,estimateVideoBytes,planVideoPreparation,mediaSettingsKey,supportsVideoExport,measureVideoDuration,exportVideo} from './media-lab.js';
installMobileRuntime();

const $=id=>document.getElementById(id);
const STORE='pocket-works:ne-tem-golosom:';
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
let premiereExportController=null,premiereResultUrl=null,premiereExportGeneration=0,premiereLocalCopy=null,premiereExportNotice='';
const qualityNames=['Экономное','Компактное','Сбалансированное','Высокое','Максимальное'];
let net=null,me='',room='',state=null,peers=new Map(),localClips=[],remoteClips=[],editHistory=new TimelineHistory(),selectedClip=null,record=null,pendingRecording=null,preroll=null,playing=false,wasPlaying=false,filmSound=false,sentPremiere=false,projectKey='',initializedScene='',toastTimer=0,timelineZoom=1,clipDrag=null,skipTimelineClick=false,micPending=false;
let micMonitor=null,saveRevision=0,readyPending=false;
let onlineIds=null,networkInterrupted=false,retryRoomAction='create',retryCheckpoint=null;
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
 return scene&&room?room+'::'+scene.id+'::'+scene.start+'::'+scene.duration:'';
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
async function restoreLobbyMedia(){
 if(!room||!scene?.custom||sourceBlob)return;
 const key=sceneDraftKey();
 try {
  const old=await draftRead(key);
  if(old?.video instanceof Blob){
   sourceBlob=old.video;writtenVideoByKey.set(key,sourceBlob);setVideoSources();
   if(meHost())for(const p of state.players)if(p.id!==me)sendVideoTo(p.id);
  }
 }catch{}
 if(!sourceBlob&&meHost())toast('Видео не найдено на устройстве. Выбери исходный файл в комнате повторно.');
 if(state?.phase==='lobby')roomUI();
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
function toast(s){const el=$('toast');el.textContent=s;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500)}
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
function disposeLocalClips(){
 for(const c of localClips){try{c.audio?.pause()}catch{}if(c.url)URL.revokeObjectURL(c.url)}
}
function cleanAudios(){
 disposeLocalClips();
 for(const c of remoteClips){try{c.audio?.pause()}catch{}if(c.url)URL.revokeObjectURL(c.url)}
}
function makeClip(base){
 const url=URL.createObjectURL(base.blob),audio=new Audio(url);
 audio.preload='auto';return {...base,url,audio};
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

function library(){const grid=$('scene-grid');$('scene-license').innerHTML='Озвученные отрывки являются переработкой оригиналов. Авторы: <a href="https://commons.wikimedia.org/wiki/File:WING_IT!_-_Blender_Open_Movie-full_movie.webm" target="_blank" rel="noopener">WING IT! — Blender Studio (CC BY 4.0)</a>, <a href="https://commons.wikimedia.org/wiki/File:Sprite_Fright_-_Open_Movie_by_Blender_Studio.webm" target="_blank" rel="noopener">Sprite Fright — Blender Studio (CC BY 4.0)</a>, <a href="https://peach.blender.org/about/" target="_blank" rel="noopener">Big Buck Bunny — Blender Foundation (CC BY 3.0)</a>. <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>.';grid.innerHTML=LIBRARY.map((s,i)=>'<button class="scene-card" data-scene="'+esc(s.id)+'"><div class="scene-thumb">'+(POSTERS[s.id]?'<img src="'+esc(POSTERS[s.id])+'" loading="lazy" alt="Кадр фильма">':'')+'<strong>'+esc(s.short)+'</strong><span class="duration">'+fmt(s.duration)+'</span></div><b>'+esc(s.title)+'</b><small>'+esc(s.sub)+'</small></button>').join('');show('library')}
function selectScene(item,blob=null){
 selected={...item,roles:[...item.roles]};sourceBlob=blob;encodedCache=null;
 if(blob&&selected.custom)selected.id='custom-'+uid();
 $('scene-title').value=selected.title;
 scene={...selected};clearExportPreview();setVideoSources('trim-video');renderRoles();show('trim');
 const start=selected.start||0,duration=selected.duration||60;
 trimRange.setRange(start,start+duration,selected.totalDuration||Math.max(90,start+duration));
 updateMediaLab();
}
function renderRoles(){$('role-tags').innerHTML=selected.roles.map((role,i)=>'<div class="role-tag"><input maxlength="35" aria-label="Персонаж '+(i+1)+'" data-role-index="'+i+'" value="'+esc(role)+'"><button data-remove-role="'+i+'" aria-label="Удалить роль">×</button></div>').join('')}
function validateScene(){const start=Number($('trim-start').value),duration=Number($('trim-length').value);const name=$('scene-title').value.trim();const roles=[...document.querySelectorAll('[data-role-index]')].map(el=>el.value.trim()).filter(Boolean);const v=$('trim-video');if(!name||!roles.length)return toast('Укажи название и хотя бы одного персонажа'),false;if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<10||duration>90)return toast('Длина сцены — от 10 до 90 секунд.'),false;if(Number.isFinite(v.duration)&&v.duration>0&&start+duration>v.duration+.1)return toast('Отрывок выходит за пределы видео.'),false;scene={...selected,title:name,start,duration,roles};return true}
async function confirmScene(){
 if(videoExportController)return toast('Сначала заверши обработку видео.');
 // Validate before accepting so an invalid title/role never replaces the source.
 if(!validateScene())return;
 if(videoExportBlob&&!acceptMedia())return;
 if(!validateScene())return;
 if(mode==='host'&&scene.custom&&sourceBlob?.size>MAX_ROOM_VIDEO_BYTES){
   if(supportsVideoExport()){toast('Файл больше 96 МиБ. Готовим отрывок для комнаты.');await processMedia();}
   else toast('Файл больше 96 МиБ, а сжатие не поддерживается браузером.');
   return;
 }
 setVideoSources();
 if(mode==='solo'){await openEditor();return}
 if(mode==='host'){await connectRoom('create');return}
 show('room');
}
async function uploadVideo(file){if(!file)return;if(file.size>MAX_SOURCE_VIDEO_BYTES)return toast('Исходный файл не должен превышать 512 МиБ.');if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm)$/i.test(file.name))return toast('Нужен видеофайл.');const url=URL.createObjectURL(file),v=$('trim-video');const meta=await new Promise(resolve=>{const tmp=document.createElement('video');tmp.preload='metadata';tmp.src=url;let done=false;const finish=x=>{if(!done){done=true;resolve(x);tmp.src=''}};tmp.onloadedmetadata=()=>measureVideoDuration(tmp).then(finish).catch(()=>finish(0));tmp.onerror=()=>finish(0);setTimeout(()=>finish(0),8000)});URL.revokeObjectURL(url);if(!meta)return toast('Этот видеоформат не поддерживается браузером.');if(meta<10)return toast('Видео должно быть длиной хотя бы 10 секунд.');selectScene({id:'custom',title:file.name.replace(/\.[^.]+$/,'').slice(0,55),start:0,duration:Math.min(60,Math.floor(meta)),totalDuration:meta,custom:true,roles:['Персонаж 1','Персонаж 2']},file)}

function showTrimPreview(which='source'){
 const result=which==='result'&&!!videoExportUrl;
 const source=$('trim-video'),encoded=$('media-output-preview');
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
 const v=$('media-output-preview');
 v.pause();v.removeAttribute('src');v.load();
 if(videoExportUrl)URL.revokeObjectURL(videoExportUrl);
 videoExportUrl=null;videoExportBlob=null;
 $('media-result').classList.add('hidden');
 $('media-preview-switch').classList.add('hidden');
}
function updateConfirmAction(){
 const b=$('confirm-scene'),result=videoExportBlob instanceof Blob;
 const oversized=mode==='host'&&scene?.custom&&sourceBlob?.size>MAX_ROOM_VIDEO_BYTES;
 b.disabled=!!videoExportController||(result&&mode==='host'&&videoExportBlob.size>MAX_ROOM_VIDEO_BYTES);
 let label='Продолжить с видео';
 if(result)label='Использовать и продолжить';
 else if(oversized)label='Подготовить видео';
 b.innerHTML=label+' <span class="arrow">→</span>';
 $('trim-footer-hint').textContent=result?'Результат готов · исходник не изменён':oversized?'Для комнаты нужен файл до 96 МиБ':'Сцена 10–90 секунд · сжатие необязательно';
}
function invalidateMediaResult(){if(videoExportBlob)clearExportPreview();updateMediaLab()}
function updateMediaLab(){
  const active=!!selected?.custom&&sourceBlob instanceof Blob;
  $('media-workbench').classList.toggle('hidden',!active);
  if(!active){clearExportPreview();updateConfirmAction();return}
  const length=Math.max(0,Number($('trim-length').value)||0);
  const keepAudio=$('media-keep-audio').checked;
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
  for(const id of ['media-quality','media-resolution','media-keep-audio'])$(id).disabled=busy;
  $('trim-range-root').classList.toggle('range-locked',busy);
  $('trim-mark-start').disabled=busy;$('trim-mark-end').disabled=busy;
  $('trim-range-handle-start').disabled=busy;
  $('trim-range-handle-end').disabled=busy;
  updateConfirmAction();
  $('media-progress').classList.toggle('hidden',!busy);
}
async function processMedia(){
  if(videoExportController||!selected?.custom||!(sourceBlob instanceof Blob))return;
  const start=Number($('trim-start').value),duration=Number($('trim-length').value);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<10||duration>90)
    return toast('Выбери отрывок от 10 до 90 секунд.');
  const total=$('trim-video').duration;
  if(Number.isFinite(total)&&start+duration>total+.1)return toast('Отрывок выходит за пределы видео.');
  const settings={start,duration,width:Number($('media-resolution').value),
    level:Number($('media-quality').value),keepAudio:$('media-keep-audio').checked};
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
    return;
  }
  clearExportPreview();
  const controller=new AbortController();
  videoExportController=controller;
  const startedAt=performance.now();
  let lastShown=-1;
  exportBusy(true);$('media-progress-bar').value=0;
  $('media-progress-label').textContent='Подготовка видео · 0%';
  $('media-progress-help').textContent='Обработка идёт во время воспроизведения. Не закрывай экран.';
  try{
    const result=await exportVideo({blob:sourceBlob,start,duration,width:Number($('media-resolution').value),
      level:Number($('media-quality').value),keepAudio:$('media-keep-audio').checked,
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
    if(result.size<=MAX_ROOM_VIDEO_BYTES)
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
    cue('ready');
  }catch(e){
    if(e?.name!=='AbortError')toast(e?.message||'Не получилось обработать видео.');
    $('media-note').textContent=e?.name==='AbortError'?'Обработка отменена. Исходное видео не изменилось.':'Исходное видео сохранено. Попробуй другие параметры.';
  }finally{
    videoExportController=null;exportBusy(false);updateMediaLab();
  }
}
function acceptMedia(){
  if(!(videoExportBlob instanceof Blob)||videoExportController)return false;
  if(mode==='host'&&videoExportBlob.size>MAX_ROOM_VIDEO_BYTES){toast('Нужно уменьшить размер до 96 МиБ.');return false}
  const length=Number($('trim-length').value),type=videoExportBlob.type;
  const extension=type.includes('mp4')?'mp4':'webm';
  sourceBlob=new File([videoExportBlob],(selected.title||'scene')+'-cut.'+extension,{type});
  encodedCache=null;
  selected.start=0;selected.duration=length;selected.totalDuration=length;
  scene={...selected,start:0,duration:length};
  clearExportPreview();
  setVideoSources('trim-video');
  trimRange.setRange(0,length,length);
  updateMediaLab();
  return true;
}

function sceneForServer(){if(!scene)return null;const {id,title,start,duration,roles,custom}=scene;return {id,title,start,duration,roles,custom:!!custom}}
function sendGame(data){if(!net||!room)return;try{net.sendGame(data)}catch{toast('Нет соединения. Переподключаемся…')}}
function roomUI(){
 const s=state;show('room');if(scene)setVideoSources(null);$('join-panel').classList.toggle('hidden',!!s||mode!=='guest');$('room-connection').classList.toggle('hidden',!!s||(mode!=='host'&&!networkInterrupted));
 $('room-heading').textContent=s?'Ваша команда':mode==='host'?'Создать комнату':'Войти в комнату';$('room-code').textContent=s?room.slice(0,8).toUpperCase():'—';
 $('room-ticket').style.display=s?'flex':'none';$('player-count').textContent=s?s.players.length+'/6':'';
 $('room-phase-note').textContent=s?'Ожидаем актёров':'';
 if(!s){$('room-players').innerHTML='';$('room-help').textContent=mode==='host'?'Подключение требуется для передачи видео другим участникам.':'Введите код, которым поделился ведущий.';$('room-start').classList.add('hidden');return}
 const roleOptions=[...s.scene.roles];for(let i=0;i<s.scene.roles.length;i++)for(let j=i+1;j<s.scene.roles.length;j++)roleOptions.push(s.scene.roles[i]+' + '+s.scene.roles[j]);roleOptions.push('Все роли');for(const name of Object.values(s.assignments))if(name&&!roleOptions.includes(name))roleOptions.push(name);
 $('room-players').innerHTML=s.players.map((p,i)=>'<div class="room-player" style="border-left-color:'+colors[i%colors.length]+'"><span><b>'+esc(p.name)+(p.id===me?' (ты)':'')+'</b><small>'+(p.id===s.host?'Ведущий':'Актёр')+(onlineIds&&!onlineIds.has(p.id)?' · Нет связи':s.mediaReady?.[p.id]?' · Видео получено':' · Загружаем видео')+'</small></span>'+(meHost()?'<select data-assign="'+esc(p.id)+'">'+roleOptions.map(r=>'<option value="'+esc(r)+'" '+(r===s.assignments[p.id]?'selected':'')+'>'+esc(r)+'</option>').join('')+'</select>':'<b>'+esc(s.assignments[p.id]||'Актёр')+'</b>')+'</div>').join('')+(s.scene.custom&&!sourceBlob?'<label class="upload-card" style="margin:8px 0"><input data-room-video type="file" accept="video/*" hidden><span class="upload-icon">＋</span><span><b>Видео не передалось?</b><small>Выбери тот же файл на своём устройстве.</small></span></label>':'');
 $('room-help').textContent=esc(s.scene.title)+' · '+fmt(s.scene.duration)+' · '+(s.scene.custom?'личное видео':'CC BY, Blender Studio');$('room-start').classList.toggle('hidden',!meHost());$('room-start').disabled=s.players.length<2||!s.players.every(p=>s.mediaReady?.[p.id]);
}
function waitUI(){show('wait');$('wait-roster').innerHTML=(state?.players||[{id:'solo',name:name}]).map(p=>'<span class="wait-chip '+(mode==='solo'||state?.ready?.[p.id]?'ready':'')+'">'+esc(p.name)+' · '+(onlineIds&&!onlineIds.has(p.id)?'Нет связи':mode==='solo'||state?.ready?.[p.id]?'Готов':'Записывает')+'</span>').join('');$('reveal-btn').classList.toggle('hidden',mode==='solo'||!meHost()||!state?.players.every(p=>state.ready?.[p.id]));$('unready-btn').classList.toggle('hidden',mode==='solo')}
function disposeRemoteClips(){
 for(const c of remoteClips){try{c.audio?.pause()}catch{}if(c.url)URL.revokeObjectURL(c.url)}
 remoteClips=[];
}
function stateChanged(s){
 if(!s||!['lobby','recording','premiere'].includes(s.phase)||!Array.isArray(s.players)||!s.scene)return;
 const prev=state,epochChanged=!!prev&&prev.mediaEpoch!==s.mediaEpoch;
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
 if(sceneChanged){
  scene={...s.scene};
  if(!scene.custom||(epochChanged&&me!==s.host))sourceBlob=null;
  setVideoSources();
 }
 if(s.phase==='lobby'){
  roomUI();
  if(scene.custom&&meHost()&&sourceBlob)
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
async function connectRoom(action){if(net){try{net.close()}catch{}net=null}show('room');setNetStatus('connecting','Подключаемся…');room=null;state=null;$('room-connection-status').textContent='Подключаемся к PocketNet…';$('room-retry').classList.add('hidden');roomUI();const conn=new PocketNet({serverUrl:roomsOrigin,name,identityKey:identity?.accountId||'guest',storage:session});net=conn;conn.roomId=null;conn.persist();conn.on('connected',m=>{me=m.player?.id||'';setNetStatus('online','PocketNet · онлайн')});
 conn.on('room_joined',m=>{room=m.roomId;if(action==='create'){state=m.state;roomUI();sendGame({type:'scene',scene:sceneForServer()})}else{stateChanged(m.state);if(me)sendGame({type:'sync'})}ensurePeers()});
 conn.on('game_event',m=>{if(m.event?.type==='state'){const s=m.event.payload;stateChanged(s);ensurePeers()}else if(m.event?.type==='notice')toast(m.event.payload);else if(m.event?.type==='signal')receiveSignal(m.event.payload);else if(m.event?.type==='relay')receiveRelay(m.event.payload)});
 conn.on('error',e=>toast('Связь: '+(e.code||e.message||'ошибка')));
 conn.on('disconnected',()=>{setNetStatus('connecting','Переподключаемся…');toast('Соединение потеряно. Записи остались на устройстве.')});
 try{await conn.connect();if(action==='create')conn.createRoom('ne-tem-golosom');else conn.joinRoom(($('join-code').value||new URLSearchParams(location.search).get('room')||'').trim());}catch(e){toast('PocketNet недоступен: '+e.message);setNetStatus('offline','Нет связи');$('room-connection-status').textContent='Не удалось создать комнату. Проверь подключение и попробуй снова.';$('room-retry').classList.remove('hidden');roomUI()}}
function leaveNetwork(){setNetStatus('idle','PocketNet');relayInbox.clear();relayQueue=Promise.resolve();for(const id of [...peers.keys()])closePeer(id);try{net?.leaveRoom();net?.close()}catch{}net=null;state=null;me='';room='';sentPremiere=false;}
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
function ensurePeers(){if(!state||!me)return;for(const p of state.players){if(p.id===me)continue;if(meHost()){if(!peers.has(p.id))peer(p.id,true)}else if(p.id===state.host){if(!peers.has(p.id))peer(p.id,false)}}for(const id of [...peers.keys()])if(!state.players.some(p=>p.id===id))closePeer(id)}
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
 if(!net||!room||state?.phase!=='premiere'||blob.size>MAX_AUDIO_BYTES){toast('Голос не передался. Попробуй переподключиться.');return}
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
 }).catch(()=>toast('Ошибка запасной передачи голоса.'));
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
 remoteClips.push(makeClip({id:m.id,owner:m.owner,start:m.start,end:m.end,offset:m.offset,blob}));
 if(meHost())for(const q of state.players)if(q.id!==me&&q.id!==m.owner)sendAudio(q.id,blob,m);
 updatePremiereStatus();
}
function sendOwnTo(id){for(const c of localClips)sendAudio(id,c.blob,{
 id:c.id,owner:me,start:c.start,end:c.end,offset:c.offset,
 epoch:state?.mediaEpoch,mime:c.blob.type
})}
function sendAllOwn(){if(sentPremiere||mode==='solo')return;sentPremiere=true;for(const p of state.players)if(p.id!==me&&(meHost()||p.id===state.host))sendOwnTo(p.id)}
async function openEditor(){if(!scene)return;stopAllPlayback();const key=(mode==='solo'?'solo':room)+'::'+scene.id+'::'+scene.start+'::'+scene.duration;if(!await restore(key)){if(mode==='solo')library();else roomUI();return}if(mode!=='solo'&&state?.phase!=='recording')return;setVideoSources('stage-video');$('editor-scene').textContent=scene.title;$('editor-role').textContent=ownRole();$('mute-film').textContent='Звук фильма: '+(filmSound?'вкл.':'выкл.');$('mute-film').setAttribute('aria-pressed',String(filmSound));$('stage-video').muted=!filmSound;$('premiere-video').muted=true;show('editor');seekVideo($('stage-video'),0);renderTimeline();updateRecordingControls();setDraftStatus('saved');if(scene.custom&&!sourceBlob){$('stage-placeholder').textContent='Ожидаем видео от ведущего…';$('stage-placeholder').classList.remove('hidden')}}
function stopAllPlayback(){playing=false;for(const id of ['stage-video','premiere-video','trim-video'])$(id).pause();for(const c of [...localClips,...remoteClips])c.audio?.pause();$('play-toggle').textContent='▶'}
function updateClipSound(t,on,isPremiere=false){const items=isPremiere?[...localClips,...remoteClips]:localClips;for(const c of items){if(!c.audio)continue;const active=t>=c.start&&t<c.end&&on;const offset=clamp(t-c.start+c.offset,0,Math.max(0,c.blob.size?1e5:0));if(active){if(c.audio.paused||Math.abs(c.audio.currentTime-offset)>.25){try{c.audio.currentTime=offset}catch{}}if(c.audio.paused)c.audio.play().catch(()=>{})}else if(!c.audio.paused)c.audio.pause()}}
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
 const levels=[1,2,4],i=levels.indexOf(timelineZoom);
 $('timeline-content').style.width=(100*timelineZoom)+'%';
 $('timeline-zoom-label').textContent=timelineZoom+'×';
 $('timeline-zoom-out').disabled=i===0;
 $('timeline-zoom-in').disabled=i===levels.length-1;
}
function zoomTimeline(direction){
 const levels=[1,2,4],i=levels.indexOf(timelineZoom),next=levels[Math.max(0,Math.min(levels.length-1,i+direction))];
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
 $('time-ruler').innerHTML=[0,.25,.5,.75,1].map(n=>'<span>'+fmt(n*duration)+'</span>').join('');
 $('clip-lane').innerHTML=localClips.map((c,i)=>
  '<button type="button" class="clip-bar '+(selectedClip===c.id?'selected':'')+
  '" data-clip="'+esc(c.id)+'" aria-pressed="'+(selectedClip===c.id)+'" style="left:'+
  (c.start/duration*100)+'%;width:'+((c.end-c.start)/duration*100)+
  '%" title="Перетащи реплику или её края · '+fmt(c.start)+'–'+fmt(c.end)+
  '" aria-label="Реплика '+(i+1)+' · '+fmt(c.start)+'–'+fmt(c.end)+
  '"><span class="clip-grip left" data-edge="left" aria-hidden="true"></span>'+
  '<span class="clip-text">'+(i+1)+'</span>'+
  '<span class="clip-grip right" data-edge="right" aria-hidden="true"></span></button>'
 ).join('');
 const picked=localClips.find(c=>c.id===selectedClip);
 $('selected-clip-info').textContent=picked
  ? 'Реплика '+(localClips.indexOf(picked)+1)+' · '+fmtFine(picked.start)+'–'+fmtFine(picked.end)+' · двигай центр или подрезай края'
  : localClips.length?'Выбери реплику · перетаскивай для сдвига, края — для обрезки':'Запиши первую реплику';
 $('clip-total').textContent=localClips.length+' '+(localClips.length===1?'фрагмент':localClips.length>=2&&localClips.length<=4?'фрагмента':'фрагментов');
 $('undo-btn').disabled=!editHistory.canUndo;
 $('redo-btn').disabled=!editHistory.canRedo;
 $('erase-btn').disabled=!picked;
 $('replace-clip-btn').disabled=!picked||!!record||!!preroll||!!micPending||!!pendingRecording;
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
function mime(){const opts=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];return opts.find(x=>window.MediaRecorder?.isTypeSupported(x))||''}
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
 try{stream=await navigator.mediaDevices.getUserMedia({audio:{
  echoCancellation:true,noiseSuppression:true,autoGainControl:true
 }})}
 catch{
  micPending=false;updateRecordingControls();
  toast('Разреши доступ к микрофону в настройках браузера.');
  return;
 }
 micPending=false;
 if(view!=='editor'||!scene){stream.getTracks().forEach(t=>t.stop());updateRecordingControls();return}
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
   rec=new MediaRecorder(stream,mime()?{mimeType:mime()}:undefined);
   const blobs=[],active={
    rec,stream,blobs,replaceId:chosen?.id||null,
    limit:chosen?.end??scene.duration,start:intendedStart,end:intendedStart,resolve:null
   };
   rec.ondataavailable=e=>{if(e.data.size)blobs.push(e.data)};
   rec.onerror=()=>toast('Ошибка записи микрофона.');
   rec.onstop=async()=>{
    try{
     const blob=new Blob(blobs,{type:rec.mimeType||blobs[0]?.type||'audio/webm'});
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
   rec.start(250);record=active;preroll=null;
   playing=true;cue('start');
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
 if(r.rec.state!=='inactive')r.rec.stop();else{
  stopMicMonitor();r.stream.getTracks().forEach(t=>t.stop());r.resolve();pendingRecording=null;
 }
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
  if(net?.socket?.readyState!==WebSocket.OPEN){toast('Нет связи. Реплики сохранены — дождись переподключения.');return}
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
  id:c.id,start:c.start,end:c.end,offset:c.offset,owner:c.owner,blob:c.blob
 }));
 const sceneCopy={...scene},input=premiereLocalCopy||(scene.custom?sourceBlob:sceneSource(scene));
 try{
  const result=await renderPremiere({
   source:input,scene:sceneCopy,clips:audioClips,
   keepFilmAudio:$('premiere-film-audio').checked,
   signal:controller.signal,
   onProgress:step=>{
    if(generation!==premiereExportGeneration)return;
    if(step.phase==='decoding'){
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
function beginPremiere(){stopPremiereExport();premiereExportNotice='';premiereLocalCopy=null;$('premiere-local-fallback').classList.add('hidden');stopAllPlayback();setVideoSources('premiere-video');$('premiere-video').muted=true;$('premiere-credits').innerHTML=(state?.players||[{id:'solo',name}]).map((p,i)=>'<span class="credit" style="border-left-color:'+colors[i%colors.length]+'">'+esc(p.name)+' · '+esc(state?.assignments?.[p.id]||'Все роли')+'</span>').join('')+(scene.custom?'':'<span class="credit">© '+(scene.id.startsWith('bunny')?'Blender Foundation · CC BY 3.0':'Blender Studio · CC BY 4.0')+' · Голоса изменены</span>');$('premiere-scrub').max=String(Math.round(scene.duration*10));$('premiere-scrub').value='0';show('premiere');seekVideo($('premiere-video'),0);updatePremiereStatus();sendAllOwn()}
function pausePremiere(){const v=$('premiere-video');v.pause();updateClipSound(time(v),false,true);$('premiere-play').textContent='▶ Смотреть премьеру'}
async function playPremiere(){if(receivedCount()<expectedCount())return;const v=$('premiere-video');if(!v.paused){pausePremiere();return}if(time(v)>=scene.duration-.08)seekVideo(v,0);try{updateClipSound(time(v),true,true);await v.play();$('premiere-play').textContent='Ⅱ Пауза'}catch{toast('Нажми ещё раз для запуска со звуком.')}}

$('sound-btn').onclick=toggleSound;
$('solo-btn').onclick=()=>{mode='solo';library()};
$('create-btn').onclick=()=>{mode='host';library()};
$('join-btn').onclick=()=>{mode='guest';state=null;scene=null;setNetStatus('idle','PocketNet');show('room');roomUI();$('join-code').focus()};
$('scene-grid').onclick=e=>{const b=e.target.closest('[data-scene]');if(b){const s=LIBRARY.find(x=>x.id===b.dataset.scene);if(s)selectScene(s)}};
$('video-file').onchange=e=>{uploadVideo(e.target.files[0]);e.target.value=''};
trimRange=createTrimRange({video:$('trim-video'),onChange:({start,end})=>{
 $('trim-start').value=String(start);
 $('trim-length').value=String(end-start);
 if(videoExportBlob)clearExportPreview();
 updateMediaLab();
}});
$('media-quality').oninput=invalidateMediaResult;
$('media-resolution').onchange=invalidateMediaResult;
$('media-keep-audio').onchange=invalidateMediaResult;
$('media-render').onclick=processMedia;
$('media-cancel').onclick=()=>videoExportController?.abort();
$('media-discard').onclick=()=>{clearExportPreview();updateMediaLab()};
$('preview-original').onclick=()=>showTrimPreview('source');
$('preview-result').onclick=()=>showTrimPreview('result');
$('add-role').onclick=()=>{if(selected.roles.length>=12)return toast('Максимум 12 персонажей.');selected.roles.push('Новый персонаж');renderRoles()};
$('role-tags').onclick=e=>{const b=e.target.closest('[data-remove-role]');if(!b)return;if(selected.roles.length<2)return toast('Оставь хотя бы одну роль.');selected.roles.splice(Number(b.dataset.removeRole),1);renderRoles()};
$('role-tags').oninput=e=>{if(e.target.matches('[data-role-index]'))selected.roles[Number(e.target.dataset.roleIndex)]=e.target.value};
$('confirm-scene').onclick=confirmScene;

$('room-retry').onclick=()=>connectRoom('create');
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
  sourceBlob=f;setVideoSources();sendGame({type:'media_ready',scene:scene.id,epoch:state?.mediaEpoch});toast('Видео подключено.');roomUI();return;
 }
 const sel=e.target.closest('[data-assign]');if(sel)sendGame({type:'assign',target:sel.dataset.assign,role:sel.value});
};
$('room-start').onclick=()=>sendGame({type:'start'});
$('play-toggle').onclick=playStage;
$('record-btn').onclick=()=>startRecord(0);
$('count-record-btn').onclick=()=>startRecord(3);
$('replace-clip-btn').onclick=()=>{if(selectedClip)void startRecord(0,selectedClip)};
$('timeline-zoom-in').onclick=()=>zoomTimeline(1);
$('timeline-zoom-out').onclick=()=>zoomTimeline(-1);
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
$('premiere-scrub').oninput=e=>{pausePremiere();setPlayhead(Number(e.target.value)/10,true)};
$('premiere-back').onclick=()=>{if(mode==='solo'){stopPremiereExport();pausePremiere();openEditor()}else if(meHost()){stopPremiereExport();pausePremiere();sendGame({type:'again'})}else toast('Новую сцену начинает ведущий.')};
for(const b of document.querySelectorAll('[data-back]'))b.onclick=async()=>{const to=b.dataset.back;if(view==='premiere')stopPremiereExport();if(view==='wait'&&mode!=='solo'){sendGame({type:'unready'});await openEditor()}else if(to==='home'){if(await resetRuntime()){leaveNetwork();show('home')}}else if(to==='library'){videoExportController?.abort();clearExportPreview();library()}else if(to==='editor')await openEditor()};
$('stage-video').ontimeupdate=()=>{if(!scene)return;const t=time($('stage-video'));if(record?.replaceId&&t>=record.limit-.035)finishRecording();
else if(t>=scene.duration-.05){if(record)finishRecording();else if(!$('stage-video').paused){stopAllPlayback();seekVideo($('stage-video'),scene.duration-.04)}}if(!record)updateClipSound(t,playing,false);renderPlayhead()};
$('premiere-video').ontimeupdate=()=>{if(!scene)return;const t=time($('premiere-video'));$('premiere-scrub').value=String(Math.round(t*10));if(t>=scene.duration-.04){pausePremiere();seekVideo($('premiere-video'),scene.duration-.04)}else updateClipSound(t,!$('premiere-video').paused,true)};
$('stage-video').onpause=()=>{if(!record){playing=false;$('play-toggle').textContent='▶';updateClipSound(time($('stage-video')),false)}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){premiereExportController?.abort();cancelCountdown();if(record)finishRecording();stopAllPlayback();pausePremiere()}});
window.addEventListener('pagehide',()=>{premiereExportController?.abort();if(record)finishRecording();draftWrite()});
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
getPocketIdentity().then(p=>{identity=p;name=p?.complete?p.nickname:(session.getItem('name')||('Гость '+String(Math.floor(100+Math.random()*900))));if(!p?.complete)session.setItem('name',name);}).catch(()=>{name=session.getItem('name')||('Гость '+String(Math.floor(100+Math.random()*900)));session.setItem('name',name)});
const incoming=new URLSearchParams(location.search).get('room');
if(incoming){mode='guest';$('join-code').value=incoming.toUpperCase();roomUI();connectRoom('join')}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
