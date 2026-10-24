import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createTrimRange} from './trim-range.js';
import {TimelineHistory,snapshotClips,spliceRecording,packTimeline,unpackTimeline} from './timeline-model.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {MAX_ROOM_VIDEO_BYTES,MAX_SOURCE_VIDEO_BYTES,formatVideoBytes,estimateVideoBytes,supportsVideoExport,measureVideoDuration,exportVideo} from './media-lab.js';
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
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const mem=new Map(),session={
 getItem(k){try{return sessionStorage.getItem(STORE+k)}catch{return mem.get(k)||null}},
 setItem(k,v){try{sessionStorage.setItem(STORE+k,v)}catch{mem.set(k,v)}},
 removeItem(k){try{sessionStorage.removeItem(STORE+k)}catch{mem.delete(k)}}
};
let sound=true,audioContext=null,identity=null,name='Гость',mode='solo',view='home',selected=null,sourceBlob=null,scene=null;
let relayQueue=Promise.resolve(),relayInbox=new Map();
let videoExportController=null,videoExportBlob=null,videoExportUrl=null,trimRange=null;
const qualityNames=['Экономное','Компактное','Сбалансированное','Высокое','Максимальное'];
let net=null,me='',room='',state=null,peers=new Map(),localClips=[],remoteClips=[],editHistory=new TimelineHistory(),selectedClip=null,record=null,pendingRecording=null,preroll=null,playing=false,wasPlaying=false,filmSound=false,sentPremiere=false,projectKey='',initializedScene='',toastTimer=0;
const roomsOrigin=location.origin+'/pocketnet';
const sceneSource=s=>LIBRARY.find(x=>x.id===s?.id)?.src||null;
const meHost=()=>!!state&&me===state.host;
const ownRole=()=>mode==='solo'?'Все роли':(state?.assignments?.[me]||'Актёр');
function toast(s){const el=$('toast');el.textContent=s;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500)}
function cue(which){if(!sound)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioContext ||=new C();audioContext.resume();const now=audioContext.currentTime,o=audioContext.createOscillator(),n=audioContext.createBufferSource(),g=audioContext.createGain(),filter=audioContext.createBiquadFilter();const data=audioContext.createBuffer(1,2205,audioContext.sampleRate),arr=data.getChannelData(0);for(let i=0;i<arr.length;i++)arr[i]=(Math.random()*2-1)*Math.exp(-i/750);n.buffer=data;filter.type='bandpass';filter.frequency.value=which==='start'?1050:420;const f=which==='stop'?160:which==='ready'?600:300;o.type='triangle';o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(f*.74,now+.12);g.gain.setValueAtTime(.02,now);g.gain.exponentialRampToValueAtTime(.0001,now+.17);o.connect(g);n.connect(filter).connect(g);g.connect(audioContext.destination);o.start(now);n.start(now);o.stop(now+.18);n.stop(now+.06)}catch{}}
function show(id){view=id;for(const el of document.querySelectorAll('.screen'))el.classList.toggle('hidden',el.id!=='screen-'+id);document.body.classList.toggle('editing',id==='editor');window.scrollTo(0,0)}
function toggleSound(){sound=!sound;try{localStorage.setItem(STORE+'sound',sound?'1':'0')}catch{}$('sound-label').textContent=sound?'вкл.':'выкл.'}
try{sound=localStorage.getItem(STORE+'sound')!=='0'}catch{}$('sound-label').textContent=sound?'вкл.':'выкл.';

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
 try{await operation;return true}
 catch{toast('Черновик не сохранился. Проверь свободное место.');return false}
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
 if(record||preroll||pendingRecording)return;
 const previous=editHistory.undo(localClips);if(!previous)return;
 stopAllPlayback();setClips(previous);void draftWrite();cue('stop');
}
function redoEdit(){
 if(record||preroll||pendingRecording)return;
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
 selected={...item,roles:[...item.roles]};sourceBlob=blob;
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
  const size=estimateVideoBytes(length,Number($('media-quality').value));
  $('media-source-size').textContent='Исходник · '+formatVideoBytes(sourceBlob.size);
  $('media-quality-label').textContent=qualityNames[Number($('media-quality').value)-1]||qualityNames[3];
  $('media-estimate').textContent='После обработки ≈ '+formatVideoBytes(size);
  $('media-render').disabled=!!videoExportController||!supportsVideoExport();
  $('media-render').classList.toggle('hidden',!!videoExportBlob);
  updateConfirmAction();
  if(!supportsVideoExport()){
    $('media-note').textContent='В этом браузере нет локального кодировщика. Можно использовать файл без обработки, если он меньше 96 МиБ.';
  }else if(videoExportBlob){
    // Keep the actual encoded result message until the user accepts or discards it.
  }else if(sourceBlob.size>MAX_ROOM_VIDEO_BYTES&&mode==='host'){
    $('media-note').textContent='Для комнаты размер нужно уменьшить до 96 МиБ. Сжатие происходит локально.';
  }else if(!videoExportBlob){
    $('media-note').textContent='Можно продолжить без сжатия или подготовить меньший файл для быстрой передачи.';
  }
}
function exportBusy(busy){
  $('media-render').disabled=busy||!supportsVideoExport();
  $('confirm-scene').disabled=busy;
  for(const id of ['media-quality','media-resolution'])$(id).disabled=busy;
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
  clearExportPreview();
  const controller=new AbortController();
  videoExportController=controller;
  exportBusy(true);$('media-progress-bar').value=0;$('media-progress-label').textContent='Обработка · 0%';
  try{
    const result=await exportVideo({blob:sourceBlob,start,duration,width:Number($('media-resolution').value),
      level:Number($('media-quality').value),signal:controller.signal,
      onProgress:progress=>{
        const pct=Math.round(progress*100);
        $('media-progress-bar').value=pct;
        $('media-progress-label').textContent='Обработка · '+pct+'%';
      }});
    if(controller.signal.aborted)return;
    videoExportBlob=result;
    videoExportUrl=URL.createObjectURL(result);
    $('media-output-preview').src=videoExportUrl;
    $('media-output-preview').load();
    $('media-output-size').textContent=formatVideoBytes(result.size)+' · '+fmt(duration);
    $('media-preview-switch').classList.remove('hidden');
    showTrimPreview('result');
    updateConfirmAction();
    $('media-result').classList.remove('hidden');
    $('media-note').textContent=result.size>MAX_ROOM_VIDEO_BYTES&&mode==='host'
      ? 'Файл ещё слишком большой для комнаты. Уменьши качество и повтори обработку.'
      : 'Сравни исходник сверху и обработанный фрагмент. Нажми «Использовать», когда результат устроит.';
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
 const s=state;show('room');if(scene)setVideoSources(null);$('join-panel').classList.toggle('hidden',!!s||mode!=='guest');$('room-connection').classList.toggle('hidden',!!s||mode!=='host');
 $('room-heading').textContent=s?'Ваша команда':mode==='host'?'Создать комнату':'Войти в комнату';$('room-code').textContent=s?room.slice(0,8).toUpperCase():'—';
 $('room-ticket').style.display=s?'flex':'none';$('player-count').textContent=s?s.players.length+'/6':'';
 $('room-phase-note').textContent=s?'Ожидаем актёров':'';
 if(!s){$('room-players').innerHTML='';$('room-help').textContent=mode==='host'?'Подключение требуется для передачи видео другим участникам.':'Введите код, которым поделился ведущий.';$('room-start').classList.add('hidden');return}
 const roleOptions=[...s.scene.roles];for(let i=0;i<s.scene.roles.length;i++)for(let j=i+1;j<s.scene.roles.length;j++)roleOptions.push(s.scene.roles[i]+' + '+s.scene.roles[j]);roleOptions.push('Все роли');for(const name of Object.values(s.assignments))if(name&&!roleOptions.includes(name))roleOptions.push(name);
 $('room-players').innerHTML=s.players.map((p,i)=>'<div class="room-player" style="border-left-color:'+colors[i%colors.length]+'"><span><b>'+esc(p.name)+(p.id===me?' (ты)':'')+'</b><small>'+(p.id===s.host?'Ведущий':'Актёр')+(s.mediaReady?.[p.id]?' · Видео получено':' · Загружаем видео')+'</small></span>'+(meHost()?'<select data-assign="'+esc(p.id)+'">'+roleOptions.map(r=>'<option value="'+esc(r)+'" '+(r===s.assignments[p.id]?'selected':'')+'>'+esc(r)+'</option>').join('')+'</select>':'<b>'+esc(s.assignments[p.id]||'Актёр')+'</b>')+'</div>').join('')+(s.scene.custom&&!sourceBlob&&!meHost()?'<label class="upload-card" style="margin:8px 0"><input data-room-video type="file" accept="video/*" hidden><span class="upload-icon">＋</span><span><b>Видео не передалось?</b><small>Выбери тот же файл на своём устройстве.</small></span></label>':'');
 $('room-help').textContent=esc(s.scene.title)+' · '+fmt(s.scene.duration)+' · '+(s.scene.custom?'личное видео':'CC BY, Blender Studio');$('room-start').classList.toggle('hidden',!meHost());$('room-start').disabled=s.players.length<2||!s.players.every(p=>s.mediaReady?.[p.id]);
}
function waitUI(){show('wait');$('wait-roster').innerHTML=(state?.players||[{id:'solo',name:name}]).map(p=>'<span class="wait-chip '+(mode==='solo'||state?.ready?.[p.id]?'ready':'')+'">'+esc(p.name)+' · '+(mode==='solo'||state?.ready?.[p.id]?'Готов':'Записывает')+'</span>').join('');$('reveal-btn').classList.toggle('hidden',mode==='solo'||!meHost()||!state?.players.every(p=>state.ready?.[p.id]));$('unready-btn').classList.toggle('hidden',mode==='solo')}
function stateChanged(s){if(!s||!s.phase||!Array.isArray(s.players))return;const prev=state;state=s;if(!scene||scene.id!==s.scene.id||scene.start!==s.scene.start||scene.duration!==s.scene.duration){scene={...s.scene};if(!scene.custom)sourceBlob=null;setVideoSources()}
 if(s.phase==='lobby'){if(prev?.phase==='premiere'){remoteClips=[];sentPremiere=false}roomUI();if(scene.custom&&meHost()&&sourceBlob)for(const id of peers.keys())sendVideoTo(id);}
 if(s.phase==='recording'&&(!prev||prev.phase!=='recording'))openEditor();
 else if(s.phase==='recording'&&view==='wait')waitUI();
 if(s.phase==='premiere'&&(!prev||prev.phase!=='premiere')){sentPremiere=false;beginPremiere();}
}
async function connectRoom(action){if(net){try{net.close()}catch{}net=null}show('room');$('net-pill').textContent='Подключаемся…';room=null;state=null;$('room-connection-status').textContent='Подключаемся к PocketNet…';$('room-retry').classList.add('hidden');roomUI();const conn=new PocketNet({serverUrl:roomsOrigin,name,identityKey:identity?.accountId||'guest',storage:session});net=conn;conn.roomId=null;conn.persist();conn.on('connected',m=>{me=m.player?.id||'';$('net-pill').textContent='PocketNet · онлайн'});
 conn.on('room_joined',m=>{room=m.roomId;if(action==='create'){state=m.state;roomUI();sendGame({type:'scene',scene:sceneForServer()})}else{stateChanged(m.state);if(me)sendGame({type:'sync'})}ensurePeers()});
 conn.on('game_event',m=>{if(m.event?.type==='state'){const s=m.event.payload;stateChanged(s);ensurePeers()}else if(m.event?.type==='notice')toast(m.event.payload);else if(m.event?.type==='signal')receiveSignal(m.event.payload);else if(m.event?.type==='relay')receiveRelay(m.event.payload)});
 conn.on('error',e=>toast('Связь: '+(e.code||e.message||'ошибка')));
 conn.on('disconnected',()=>{$('net-pill').textContent='Переподключаемся…';toast('Соединение потеряно. Записи остались на устройстве.')});
 try{await conn.connect();if(action==='create')conn.createRoom('ne-tem-golosom');else conn.joinRoom(($('join-code').value||new URLSearchParams(location.search).get('room')||'').trim());}catch(e){toast('PocketNet недоступен: '+e.message);$('net-pill').textContent='Нет связи';$('room-connection-status').textContent='Не удалось создать комнату. Проверь подключение и попробуй снова.';$('room-retry').classList.remove('hidden');roomUI()}}
function leaveNetwork(){relayInbox.clear();relayQueue=Promise.resolve();for(const id of [...peers.keys()])closePeer(id);try{net?.leaveRoom();net?.close()}catch{}net=null;state=null;me='';room='';sentPremiere=false;}
async function resetRuntime(){
 videoExportController?.abort();clearExportPreview();cancelCountdown();
 if(record)finishRecording();
 if(pendingRecording)await pendingRecording;
 stopAllPlayback();
 if(projectKey&&scene&&!await draftWrite())return false;
 cleanAudios();localClips=[];remoteClips=[];
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
 dc.onmessage=e=>onMedia(p,e.data);dc.onclose=()=>{p.dc=null};dc.onerror=()=>toast('Передача медиа была прервана.')}
async function flush(p){if(p.busy||p.dc?.readyState!=='open')return;p.busy=true;try{while(p.queued.length&&p.dc?.readyState==='open'){const item=p.queued.shift(),blob=item.blob;if(blob.size>(item.kind==='video'?MAX_ROOM_VIDEO_BYTES:34*1024*1024))continue;const token=uid();p.dc.send(JSON.stringify({kind:'begin',token,media:item.kind,size:blob.size,meta:item.meta}));const chunkSize=16000;for(let offset=0;offset<blob.size;offset+=chunkSize){while(p.dc.bufferedAmount>600000){await new Promise(resolve=>{const timer=setTimeout(resolve,180);p.dc.addEventListener('bufferedamountlow',()=>{clearTimeout(timer);resolve()},{once:true})});if(p.dc.readyState!=='open')throw Error('channel_closed')}p.dc.send(await blob.slice(offset,offset+chunkSize).arrayBuffer())}p.dc.send(JSON.stringify({kind:'end',token}));}}catch{toast('Не удалось отправить медиа. Повтори подключение.')}finally{p.busy=false}}
function queueMedia(id,kind,blob,meta){const p=peers.get(id);if(!p||!(blob instanceof Blob))return;p.queued.push({kind,blob,meta});flush(p)}
function relayAudio(id,blob,meta){
 if(!net||!room||state?.phase!=='premiere'||blob.size>3000000){toast('Голос не передался. Попробуй переподключиться.');return}
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
 if(state?.phase!=='premiere'||!state.players.some(x=>x.id===from)||!d||typeof d.token!=='string')return;
 const key=from+':'+d.token;
 if(d.action==='begin'){
  if(d.kind!=='audio'||!Number.isInteger(d.size)||d.size<1||d.size>3000000)return;
  if(relayInbox.size>24)relayInbox.clear();
  relayInbox.set(key,{kind:'audio',size:d.size,received:0,parts:0,chunks:[],meta:d.meta||{}});
 }else if(d.action==='part'){
  const r=relayInbox.get(key);if(!r||d.part!==r.parts||typeof d.body!=='string'){relayInbox.delete(key);return}
  try{const bytes=atob(d.body),buf=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)buf[i]=bytes.charCodeAt(i);if(r.received+buf.length>r.size)throw Error('overflow');r.chunks.push(buf);r.received+=buf.length;r.parts++;}catch{relayInbox.delete(key)}
 }else if(d.action==='end'){
  const r=relayInbox.get(key);relayInbox.delete(key);
  if(r&&r.received===r.size)receivedMedia({id:from},r,new Blob(r.chunks,{type:r.meta.mime||'audio/webm'}));
 }
}
const videoSent=new Set();
function sendVideoTo(id){if(!scene?.custom||!sourceBlob||!meHost())return;const key=id+':'+scene.id;if(videoSent.has(key))return;videoSent.add(key);queueMedia(id,'video',sourceBlob,{scene:scene.id,mime:sourceBlob.type||'video/mp4'})}
function onMedia(p,data){if(typeof data==='string'){let m;try{m=JSON.parse(data)}catch{return}if(m.kind==='begin'){if(p.rx||!['video','audio'].includes(m.media)||!Number.isInteger(m.size)||m.size<1||m.size>(m.media==='video'?MAX_ROOM_VIDEO_BYTES:34*1024*1024))return;p.rx={kind:m.media,token:m.token,size:m.size,meta:m.meta||{},received:0,chunks:[]}}else if(m.kind==='end'&&p.rx?.token===m.token){const rx=p.rx;p.rx=null;if(rx.received===rx.size)receivedMedia(p,rx,new Blob(rx.chunks,{type:rx.meta.mime||'application/octet-stream'}))}return}
 const rx=p.rx;const b=data instanceof ArrayBuffer?data:null;if(!rx||!b||rx.received+b.byteLength>rx.size){p.rx=null;return}rx.received+=b.byteLength;rx.chunks.push(b)}
async function receivedMedia(p,rx,blob){if(rx.kind==='video'){if(!scene?.custom||rx.meta.scene!==scene.id||meHost())return;sourceBlob=blob;setVideoSources();sendGame({type:'media_ready'});toast('Видео получено. Можно начинать.');return}
 if(state?.phase!=='premiere')return;const m=rx.meta,owner=String(m.owner||'');if(!state.players.some(x=>x.id===owner)||!Number.isFinite(+m.start)||!Number.isFinite(+m.end)||+m.start<0||+m.end>scene.duration+.01||+m.end<=+m.start)return;
 if(!meHost()&&p.id!==state.host)return;
 if(meHost()&&owner!==p.id)return;
 if([...localClips,...remoteClips].some(x=>x.id===m.id&&x.owner===owner))return;
 remoteClips.push(makeClip({id:String(m.id).slice(0,48),owner,start:+m.start,end:+m.end,offset:+m.offset||0,blob}));
 if(meHost())for(const q of state.players)if(q.id!==me&&q.id!==owner)sendAudio(q.id,blob,m);
 updatePremiereStatus();
}
function sendOwnTo(id){for(const c of localClips)sendAudio(id,c.blob,{id:c.id,owner:me,start:c.start,end:c.end,offset:c.offset,mime:c.blob.type})}
function sendAllOwn(){if(sentPremiere||mode==='solo')return;sentPremiere=true;for(const p of state.players)if(p.id!==me&&(meHost()||p.id===state.host))sendOwnTo(p.id)}
async function openEditor(){if(!scene)return;stopAllPlayback();const key=(mode==='solo'?'solo':room)+'::'+scene.id+'::'+scene.start+'::'+scene.duration;if(!await restore(key)){if(mode==='solo')library();else roomUI();return}setVideoSources('stage-video');$('editor-scene').textContent=scene.title;$('editor-role').textContent=ownRole();$('mute-film').textContent='Звук фильма: '+(filmSound?'вкл.':'выкл.');$('stage-video').muted=!filmSound;$('premiere-video').muted=true;show('editor');seekVideo($('stage-video'),0);renderTimeline();if(scene.custom&&!sourceBlob){$('stage-placeholder').textContent='Ожидаем видео от ведущего…';$('stage-placeholder').classList.remove('hidden')}}
function stopAllPlayback(){playing=false;for(const id of ['stage-video','premiere-video','trim-video'])$(id).pause();for(const c of [...localClips,...remoteClips])c.audio?.pause();$('play-toggle').textContent='▶'}
function updateClipSound(t,on,isPremiere=false){const items=isPremiere?[...localClips,...remoteClips]:localClips;for(const c of items){if(!c.audio)continue;const active=t>=c.start&&t<c.end&&on;const offset=clamp(t-c.start+c.offset,0,Math.max(0,c.blob.size?1e5:0));if(active){if(c.audio.paused||Math.abs(c.audio.currentTime-offset)>.25){try{c.audio.currentTime=offset}catch{}}if(c.audio.paused)c.audio.play().catch(()=>{})}else if(!c.audio.paused)c.audio.pause()}}
// Video time updates move only the playhead. Clip buttons retain focus.
function renderPlayhead(){
 if(!scene)return;
 const duration=Math.max(.01,scene.duration),t=time($('stage-video'));
 $('scrubber').max=String(Math.round(duration*10));
 $('scrubber').value=String(Math.round(t*10));
 $('stage-time').textContent=fmt(t)+' / '+fmt(duration);
 $('playhead').style.left=(t/duration*100)+'%';
}
function renderTimeline(){
 if(!scene)return;
 const duration=Math.max(.01,scene.duration);
 $('time-ruler').innerHTML=[0,.25,.5,.75,1].map(n=>'<span>'+fmt(n*duration)+'</span>').join('');
 $('clip-lane').innerHTML=localClips.map((c,i)=>
  '<button type="button" class="clip-bar '+(selectedClip===c.id?'selected':'')+
  '" data-clip="'+esc(c.id)+'" aria-pressed="'+(selectedClip===c.id)+'" style="left:'+
  (c.start/duration*100)+'%;width:'+((c.end-c.start)/duration*100)+
  '%" title="'+fmt(c.start)+'–'+fmt(c.end)+
  '" aria-label="Реплика '+(i+1)+' · '+fmt(c.start)+'–'+fmt(c.end)+'">'+(i+1)+'</button>'
 ).join('');
 const picked=localClips.find(c=>c.id===selectedClip);
 $('selected-clip-info').textContent=picked
  ? 'Реплика '+(localClips.indexOf(picked)+1)+' · '+fmt(picked.start)+'–'+fmt(picked.end)+' · выбрана'
  : localClips.length?'Выбери реплику на ленте, чтобы удалить её':'Запиши первую реплику';
 $('clip-total').textContent=localClips.length+' '+(localClips.length===1?'фрагмент':localClips.length>=2&&localClips.length<=4?'фрагмента':'фрагментов');
 $('undo-btn').disabled=!editHistory.canUndo;
 $('redo-btn').disabled=!editHistory.canRedo;
 $('erase-btn').disabled=!picked;
 renderPlayhead();
}
function setPlayhead(value,fromPremiere=false){
 const v=fromPremiere?$('premiere-video'):$('stage-video');
 stopAllPlayback();seekVideo(v,clamp(value,0,scene.duration));
 if(!fromPremiere)renderPlayhead();
 else $('premiere-scrub').value=String(Math.round(value*10));
}
async function playStage(){if(!scene||record||preroll||scene.custom&&!sourceBlob)return toast('Видео пока не готово.');const video=$('stage-video');if(playing){stopAllPlayback();return}if(time(video)>=scene.duration-.1)seekVideo(video,0);try{updateClipSound(time(video),true,false);await video.play();playing=true;$('play-toggle').textContent='Ⅱ'}catch{updateClipSound(time(video),false,false);toast('Нажми воспроизведение ещё раз — браузер блокирует запуск.')}}
function mime(){const opts=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];return opts.find(x=>window.MediaRecorder?.isTypeSupported(x))||''}
async function startRecord(){if(record){finishRecording();return}if(preroll){cancelCountdown();return}if(!scene||scene.custom&&!sourceBlob)return toast('Ожидаем видео.');if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Этот браузер не поддерживает запись звука.');stopAllPlayback();const video=$('stage-video');if(time(video)>=scene.duration-.1)seekVideo(video,0);const begin=time(video);let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}catch{return toast('Разреши доступ к микрофону в настройках браузера.')};
 let left=3;$('countdown').classList.remove('hidden');$('countdown').textContent=String(left);$('record-label').textContent='Отменить';let cancelled=false;
 preroll={stream,cancel:()=>{cancelled=true;stream.getTracks().forEach(t=>t.stop())}};
 const tick=async()=>{if(cancelled||!preroll)return;left--;if(left>0){$('countdown').textContent=String(left);preroll.timer=setTimeout(tick,1000);return}
 $('countdown').classList.add('hidden');preroll=null;
 const rec=new MediaRecorder(stream,mime()?{mimeType:mime()}:undefined);let blobs=[];rec.ondataavailable=e=>{if(e.data.size)blobs.push(e.data)};rec.onerror=()=>toast('Ошибка записи микрофона.');let active={rec,stream,blobs,start:begin,stop:false};record=active;rec.onstop=async()=>{
 try{
   const blob=new Blob(blobs,{type:rec.mimeType||blobs[0]?.type||'audio/webm'});
   if(blob.size>0&&active.end-active.start>.1)
     await replaceClip(active.start,active.end,blob);
 }catch(e){
   toast('Не удалось завершить запись: '+(e?.message||'ошибка'));
 }finally{
   stream.getTracks().forEach(t=>t.stop());
   $('record-badge').classList.add('hidden');
   $('record-label').textContent='Записать';
   $('record-btn').classList.remove('recording');
   pendingRecording=null;renderTimeline();active.resolve?.();
 }
};try{video.muted=true;seekVideo(video,begin);await video.play();active.start=time(video);rec.start(250);playing=true;cue('start');$('record-badge').classList.remove('hidden');$('record-label').textContent='Стоп';$('record-btn').classList.add('recording')}catch{if(rec.state!=='inactive')rec.stop();else stream.getTracks().forEach(t=>t.stop());record=null;$('record-label').textContent='Записать';toast('Не удалось запустить видео и запись.')}};
 preroll.timer=setTimeout(tick,1000);
}
function cancelCountdown(){if(!preroll)return;clearTimeout(preroll.timer);preroll.cancel();preroll=null;$('countdown').classList.add('hidden');$('record-label').textContent='Записать'}
function finishRecording(){if(!record)return;const r=record;record=null;r.end=Math.min(scene.duration,time($('stage-video')));pendingRecording=new Promise(resolve=>{r.resolve=resolve});stopAllPlayback();if(r.rec.state!=='inactive')r.rec.stop();else{r.resolve();pendingRecording=null}cue('stop');return pendingRecording}
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
 if(record||preroll||pendingRecording)return;
 const chosen=localClips.find(c=>c.id===selectedClip);
 if(!chosen){toast('Сначала выбери реплику на ленте.');return}
 if(!confirm('Удалить реплику '+fmt(chosen.start)+'–'+fmt(chosen.end)+'?'))return;
 editHistory.remember(localClips);
 stopAllPlayback();
 setClips(localClips.filter(c=>c.id!==chosen.id));
 await draftWrite();cue('stop');
}
async function markReady(){cancelCountdown();if(record)finishRecording();if(pendingRecording)await pendingRecording;stopAllPlayback();if(!localClips.length)return toast('Запиши хотя бы один фрагмент.');if(!await draftWrite())return;if(mode==='solo'){beginPremiere();return}if(!state||state.phase!=='recording')return;sendGame({type:'ready',count:localClips.length});waitUI();cue('ready')}
function receivedCount(){return localClips.length+remoteClips.length}
function expectedCount(){if(mode==='solo')return localClips.length;return Object.values(state?.counts||{}).reduce((a,b)=>a+(Number(b)||0),0)}
function updatePremiereStatus(){const need=expectedCount(),got=receivedCount();$('premiere-loading').classList.toggle('hidden',got>=need);$('premiere-loading').textContent=got>=need?'':('Получаем дорожки · '+got+'/'+need);$('premiere-play').disabled=got<need;$('premiere-repeat').disabled=got<need}
function beginPremiere(){stopAllPlayback();setVideoSources('premiere-video');$('premiere-video').muted=true;$('premiere-credits').innerHTML=(state?.players||[{id:'solo',name}]).map((p,i)=>'<span class="credit" style="border-left-color:'+colors[i%colors.length]+'">'+esc(p.name)+' · '+esc(state?.assignments?.[p.id]||'Все роли')+'</span>').join('')+(scene.custom?'':'<span class="credit">© '+(scene.id.startsWith('bunny')?'Blender Foundation · CC BY 3.0':'Blender Studio · CC BY 4.0')+' · Голоса изменены</span>');$('premiere-scrub').max=String(Math.round(scene.duration*10));$('premiere-scrub').value='0';show('premiere');seekVideo($('premiere-video'),0);updatePremiereStatus();sendAllOwn()}
function pausePremiere(){const v=$('premiere-video');v.pause();updateClipSound(time(v),false,true);$('premiere-play').textContent='▶ Смотреть премьеру'}
async function playPremiere(){if(receivedCount()<expectedCount())return;const v=$('premiere-video');if(!v.paused){pausePremiere();return}if(time(v)>=scene.duration-.08)seekVideo(v,0);try{updateClipSound(time(v),true,true);await v.play();$('premiere-play').textContent='Ⅱ Пауза'}catch{toast('Нажми ещё раз для запуска со звуком.')}}

$('sound-btn').onclick=toggleSound;
$('solo-btn').onclick=()=>{mode='solo';library()};
$('create-btn').onclick=()=>{mode='host';library()};
$('join-btn').onclick=()=>{mode='guest';state=null;scene=null;show('room');roomUI();$('join-code').focus()};
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
  sourceBlob=f;setVideoSources();sendGame({type:'media_ready'});toast('Видео подключено.');roomUI();return;
 }
 const sel=e.target.closest('[data-assign]');if(sel)sendGame({type:'assign',target:sel.dataset.assign,role:sel.value});
};
$('room-start').onclick=()=>sendGame({type:'start'});
$('play-toggle').onclick=playStage;
$('record-btn').onclick=startRecord;
$('scrubber').oninput=e=>{if(record||preroll)return;setPlayhead(Number(e.target.value)/10)};
$('clip-lane').onclick=e=>{
 const b=e.target.closest('[data-clip]');if(!b||record||preroll)return;
 const clip=localClips.find(c=>c.id===b.dataset.clip);if(!clip)return;
 const wasFocused=document.activeElement===b;
 selectedClip=clip.id;setPlayhead(clip.start);renderTimeline();
 if(wasFocused)[...$('clip-lane').querySelectorAll('[data-clip]')].find(el=>el.dataset.clip===clip.id)?.focus({preventScroll:true});
};
$('undo-btn').onclick=undoEdit;
$('redo-btn').onclick=redoEdit;
$('erase-btn').onclick=deleteClip;
$('finish-btn').onclick=markReady;
$('mute-film').onclick=()=>{filmSound=!filmSound;$('mute-film').textContent='Звук фильма: '+(filmSound?'вкл.':'выкл.');$('stage-video').muted=!filmSound};
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
$('premiere-repeat').onclick=()=>{pausePremiere();setPlayhead(0,true)};
$('premiere-scrub').oninput=e=>{pausePremiere();setPlayhead(Number(e.target.value)/10,true)};
$('premiere-back').onclick=()=>{pausePremiere();if(mode==='solo')openEditor();else if(meHost())sendGame({type:'again'});else toast('Новую сцену начинает ведущий.')};
for(const b of document.querySelectorAll('[data-back]'))b.onclick=async()=>{const to=b.dataset.back;if(view==='wait'&&mode!=='solo'){sendGame({type:'unready'});await openEditor()}else if(to==='home'){if(await resetRuntime()){leaveNetwork();show('home')}}else if(to==='library'){videoExportController?.abort();clearExportPreview();library()}else if(to==='editor')await openEditor()};
$('stage-video').ontimeupdate=()=>{if(!scene)return;const t=time($('stage-video'));if(t>=scene.duration-.05){if(record)finishRecording();else stopAllPlayback();seekVideo($('stage-video'),scene.duration-.04)}if(!record)updateClipSound(t,playing,false);renderPlayhead()};
$('premiere-video').ontimeupdate=()=>{if(!scene)return;const t=time($('premiere-video'));$('premiere-scrub').value=String(Math.round(t*10));if(t>=scene.duration-.04){pausePremiere();seekVideo($('premiere-video'),scene.duration-.04)}else updateClipSound(t,!$('premiere-video').paused,true)};
$('stage-video').onpause=()=>{if(!record){playing=false;$('play-toggle').textContent='▶';updateClipSound(time($('stage-video')),false)}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelCountdown();if(record)finishRecording();stopAllPlayback();pausePremiere()}});
window.addEventListener('pagehide',()=>{if(record)finishRecording();draftWrite()});
document.addEventListener('keydown',e=>{
 if(view!=='editor'||e.target.matches('input,select,textarea,[contenteditable="true"]'))return;
 if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){
   e.preventDefault();if(e.shiftKey)redoEdit();else undoEdit();
 }else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){
   e.preventDefault();redoEdit();
 }else if(e.code==='Space'&&!e.repeat){
   e.preventDefault();playStage();
 }else if(e.code==='KeyR'&&!e.ctrlKey&&!e.metaKey&&!e.repeat){
   e.preventDefault();startRecord();
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
