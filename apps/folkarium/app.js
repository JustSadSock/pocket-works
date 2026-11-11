import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {INSTRUMENTS,MODES,MOODS,SECTIONS,STEPS,makeSong,validSong,regenerate,pitches,pitchLabel,degreeToMidi,buildEvents,stepSeconds,durationSeconds,totalSteps,playEvent,schedulePreview,renderWav,renderMidi} from './music.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const KEY='pocket-works:folkarium:folio-v1';
let folio=restore();
let section=1,selected='vielle',drawing=null,drawMode=false,playing=null,ctx=null,pendingDelete=null,busy=false;
const byId=id=>folio.songs.find(s=>s.id===id);
const song=()=>byId(folio.active);
const selectedTrack=()=>song().tracks.find(t=>t.id===selected);
function restore(){
  try{
    const v=JSON.parse(localStorage.getItem(KEY));
    if(v&&Array.isArray(v.songs)&&v.songs.length>0&&v.songs.length<=50&&v.songs.every(validSong)){
      return {active:v.songs.some(s=>s.id===v.active)?v.active:v.songs[0].id,songs:v.songs};
    }
  }catch{}
  const first=makeSong({title:'Баллада о забытой короне',seed:20261111});
  return {active:first.id,songs:[first]};
}
function persist(){
  try{
    localStorage.setItem(KEY,JSON.stringify(folio));
    $('statusText').textContent='Записано в сборник';
  }catch{
    $('statusText').textContent='Нет доступа к хранилищу: скачай MIDI или WAV';
  }
}
function info(message){$('statusText').textContent=message;}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function minutes(seconds){const n=Math.round(seconds);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function stopPlayback(finished=false){
  if(!playing)return;
  clearInterval(playing.timer);cancelAnimationFrame(playing.raf);
  if(playing.endTimer)clearTimeout(playing.endTimer);
  if(playing.master&&ctx){playing.master.gain.cancelScheduledValues(ctx.currentTime);playing.master.gain.setTargetAtTime(0,ctx.currentTime,.012);}
  playing=null;
  $('playGlyph').textContent='▶';$('playLabel').textContent='Слушать';$('playBtn').setAttribute('aria-label','Играть композицию');
  document.querySelectorAll('.is-playing-step').forEach(x=>x.classList.remove('is-playing-step'));
  document.querySelectorAll('.tab-playing').forEach(x=>x.classList.remove('tab-playing'));
  if(finished)info('Композиция сыграна полностью');
}
async function audioContext(){
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)throw Error('Этот браузер не поддерживает Web Audio.');
  if(!ctx)ctx=new Audio();
  if(ctx.state==='suspended')await ctx.resume();
  return ctx;
}
function playbackSection(globalStep){
  let sum=0;
  for(let i=0;i<SECTIONS.length;i++){
    sum+=SECTIONS[i].bars*8;
    if(globalStep<sum)return i;
  }
  return SECTIONS.length-1;
}
function renderPlayhead(globalStep){
  const nextSection=playbackSection(globalStep);
  if(section!==nextSection){section=nextSection;renderTabs();renderGrid();}
  document.querySelectorAll('.is-playing-step').forEach(el=>el.classList.remove('is-playing-step'));
  document.querySelectorAll('.note-cell[data-step="'+(globalStep%STEPS)+'"]').forEach(el=>el.classList.add('is-playing-step'));
  document.querySelectorAll('.tab-playing').forEach(el=>el.classList.remove('tab-playing'));
  const tab=document.querySelector('[data-section="'+nextSection+'"]');
  if(tab)tab.classList.add('tab-playing');
}
async function togglePlayback(){
  if(playing){stopPlayback();info('Воспроизведение остановлено');return}
  if(busy)return;
  try{
    const audio=await audioContext();
    const events=buildEvents(song()),sec=stepSeconds(song());
    if(!events.length){info('Включи инструмент или добавь ноты в партитуру');return}
    const master=audio.createGain();master.gain.value=.76;master.connect(audio.destination);
    const start=audio.currentTime+.085;
    const state={master,start,sec,index:0,events,step:0,nextAt:start,timer:null,raf:0,endTimer:null,lastVisual:-1};
    playing=state;
    const schedule=()=>{
      if(playing!==state)return;
      while(state.step<totalSteps()&&state.nextAt<audio.currentTime+.16){
        while(state.index<state.events.length&&state.events[state.index].at===state.step){
          const e=state.events[state.index++];
          playEvent(audio,{...e,duration:e.len*sec*.89},state.nextAt,master);
        }
        state.nextAt+=sec;state.step++;
      }
      if(state.step>=totalSteps()){
        clearInterval(state.timer);
        state.endTimer=setTimeout(()=>{if(playing===state)stopPlayback(true)},Math.max(200,(state.nextAt-audio.currentTime+.42)*1000));
      }
    };
    const frame=()=>{
      if(playing!==state||document.hidden)return;
      const step=Math.min(totalSteps()-1,Math.max(0,Math.floor((audio.currentTime-start)/sec)));
      if(step!==state.lastVisual){renderPlayhead(step);state.lastVisual=step;}
      state.raf=requestAnimationFrame(frame);
    };
    $('playGlyph').textContent='■';$('playLabel').textContent='Остановить';$('playBtn').setAttribute('aria-label','Остановить композицию');
    info('Звучит композиция');
    schedule();state.timer=setInterval(schedule,25);state.raf=requestAnimationFrame(frame);
  }catch(err){info('Не получилось включить звук: '+err.message);stopPlayback();}
}
function updateSong(action,stop=true){
  if(stop)stopPlayback();
  action(song());
  persist();render();
}
function renderTabs(){
  $('sectionTabs').innerHTML=SECTIONS.map((s,i)=>'<button type="button" data-section="'+i+'" class="section-tab '+(section===i?'active':'')+'" aria-selected="'+(section===i?'true':'false')+'"><span>0'+(i+1)+'</span><strong>'+s.name+'</strong><small>'+s.bars+' такт.</small></button>').join('');
}
function renderTracks(){
  $('tracksList').innerHTML=song().tracks.map((t,i)=>{
    const inst=INSTRUMENTS[i];
    return '<div class="track-row '+(t.id===selected?'selected':'')+' '+(!t.on?'muted':'')+'"><button class="track-select" type="button" data-select="'+t.id+'" aria-pressed="'+(t.id===selected)+'"><span class="track-number">0'+(i+1)+'</span><span class="track-name"><strong>'+inst.label+'</strong><small>'+inst.role+'</small></span></button><button class="track-toggle" type="button" data-toggle="'+t.id+'" aria-pressed="'+t.on+'" aria-label="'+(t.on?'Выключить ':'Включить ')+inst.label+'">'+(t.on?'●':'○')+'</button></div>';
  }).join('');
}
function renderGrid(){
  const t=selectedTrack(),pattern=t.patterns[section],rows=selected==='drum'?[{d:2,label:'Звон'},{d:1,label:'Хлопок'},{d:0,label:'Бас'}]:pitches(song().mode).map(p=>({...p,label:pitchLabel(p.midi)}));
  $('selectedTrackLabel').textContent=INSTRUMENTS.find(i=>i.id===selected).label;
  let html='<span class="grid-corner">Нота / шаг</span>';
  for(let c=0;c<STEPS;c++)html+='<span class="step-label '+(c===0||c===8?'bar-start':'')+'">'+(c+1)+'</span>';
  for(const pitch of rows){
    html+='<span class="pitch-label">'+pitch.label+'</span>';
    for(let c=0;c<STEPS;c++){
      const hit=pattern[c]&&pattern[c].d===pitch.d;
      html+='<button type="button" class="note-cell '+(hit?'written ':'')+(c===0||c===8?'bar-start ':'')+'" data-step="'+c+'" data-degree="'+pitch.d+'" aria-pressed="'+!!hit+'" aria-label="'+pitch.label+', доля '+(c+1)+'" title="'+pitch.label+'"></button>';
    }
  }
  $('scoreGrid').innerHTML=html;
  $('scoreGrid').classList.toggle('is-drum',selected==='drum');
  $('scoreGrid').classList.toggle('drawing-enabled',drawMode);
}
function updateGridColumn(step){
  const n=selectedTrack().patterns[section][step];
  $('scoreGrid').querySelectorAll('[data-step="'+step+'"]').forEach(cell=>{
    const active=!!n&&n.d===Number(cell.dataset.degree);
    cell.classList.toggle('written',active);
    cell.setAttribute('aria-pressed',String(active));
  });
}
function writeNote(step,degree,first=false){
  if(busy)return;
  const p=selectedTrack().patterns[section],current=p[step];
  if(first&&current?.d===degree)p[step]=null;
  else p[step]={d:degree,len:selected==='hurdy'?4:selected==='vielle'?2:1,v:.78};
  updateGridColumn(step);persist();
  if(p[step]&&selected!=='drum'){
    audioContext().then(a=>schedulePreview(a,selected,degreeToMidi(degree,song().mode))).catch(()=>{});
  }
  if(playing)stopPlayback();
}
function renderControls(){
  const s=song();
  $('titleInput').value=s.title;
  $('moodSelect').value=s.mood;
  $('modeSelect').value=s.mode;
  $('tempoRange').value=s.tempo;$('tempoValue').textContent=Math.round(s.tempo)+' BPM';
  $('densityRange').value=Math.round(s.density*100);$('densityValue').textContent=Math.round(s.density*100)+'%';
  $('levelRange').value=Math.round(selectedTrack().level*100);$('levelValue').textContent=Math.round(selectedTrack().level*100)+'%';
  $('durationText').textContent=minutes(durationSeconds(s));
  $('folioCount').textContent=folio.songs.length;
}
function render(){renderTabs();renderTracks();renderGrid();renderControls();}
function newId(){return Date.now()+'-'+Math.random().toString(36).slice(2,8)}
function openFolio(){
  $('folioList').innerHTML=folio.songs.map(s=>{
    return '<div class="folio-entry '+(s.id===folio.active?'current':'')+'"><div class="folio-entry-main"><span class="folio-entry-title">'+escapeHtml(s.title)+'</span><small>'+MOODS[s.mood].label+' · '+minutes(durationSeconds(s))+'</small></div><div class="folio-actions"><button type="button" data-load="'+escapeHtml(s.id)+'" '+(s.id===folio.active?'disabled':'')+'>'+(s.id===folio.active?'Открыта':'Открыть')+'</button><button type="button" data-copy="'+escapeHtml(s.id)+'" aria-label="Дублировать">⧉</button><button type="button" data-delete="'+escapeHtml(s.id)+'" aria-label="Удалить">×</button></div></div>';
  }).join('');
  $('folioDialog').showModal();
}
function cloneSong(source){
  const copy=structuredClone(source);copy.id=newId();copy.title=(copy.title+' — копия').slice(0,72);
  folio.songs.unshift(copy);folio.active=copy.id;selected='vielle';section=1;stopPlayback();persist();render();openFolio();
}
function addSong(){
  const fresh=makeSong({title:'Новая песнь'});fresh.id=newId();
  folio.songs.unshift(fresh);folio.active=fresh.id;selected='vielle';section=1;stopPlayback();persist();render();
  $('folioDialog').close();info('Новая партитура готова');
}
function askDelete(id){
  const s=byId(id);if(!s)return;
  pendingDelete=id;$('confirmBody').textContent='«'+s.title+'» будет удалена из локального сборника.';
  $('confirmDialog').showModal();
}
function performDelete(){
  if(!pendingDelete)return;
  const id=pendingDelete;pendingDelete=null;
  folio.songs=folio.songs.filter(s=>s.id!==id);
  if(!folio.songs.length)folio.songs=[makeSong({title:'Новая песнь'})];
  if(folio.active===id){folio.active=folio.songs[0].id;stopPlayback();selected='vielle';section=1}
  persist();render();$('confirmDialog').close();
  if($('folioDialog').open){$('folioDialog').close();openFolio();}
  info('Партитура удалена');
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),12000);
}
function filename(){return song().title.toLowerCase().replace(/[^a-zа-яёіїєґ0-9-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'folkarium'}
async function exportFile(type){
  if(busy)return;
  stopPlayback();busy=true;
  const button=$(type==='wav'?'wavBtn':'midiBtn');
  const original=button.textContent;button.disabled=true;
  button.textContent='Готовим…';info(type==='wav'?'Записываем WAV на устройстве…':'Собираем MIDI…');
  try{
    const data=type==='wav'?await renderWav(song()):renderMidi(song());
    download(data,filename()+'.'+(type==='wav'?'wav':'mid'));
    info('Файл '+type.toUpperCase()+' готов к сохранению');
  }catch(e){info('Экспорт не удался: '+e.message)}
  finally{busy=false;button.disabled=false;button.textContent=original;}
}
$('playBtn').addEventListener('click',togglePlayback);
$('wavBtn').addEventListener('click',()=>exportFile('wav'));
$('midiBtn').addEventListener('click',()=>exportFile('midi'));
$('sectionTabs').addEventListener('click',e=>{
  const el=e.target.closest('[data-section]');if(!el)return;
  section=Number(el.dataset.section);renderTabs();renderGrid();
});
$('tracksList').addEventListener('click',e=>{
  const toggle=e.target.closest('[data-toggle]'),pick=e.target.closest('[data-select]');
  if(toggle){updateSong(s=>{const t=s.tracks.find(x=>x.id===toggle.dataset.toggle);t.on=!t.on;});return}
  if(pick){selected=pick.dataset.select;renderTracks();renderGrid();renderControls();}
});
const grid=$('scoreGrid');
grid.addEventListener('pointerdown',e=>{
  const cell=e.target.closest('.note-cell');if(!cell||e.button!==0)return;
  const step=Number(cell.dataset.step),degree=Number(cell.dataset.degree);
  drawing={id:e.pointerId,seen:new Set(),startX:e.clientX,startY:e.clientY,step,degree,moved:false};
  if(drawMode){
    e.preventDefault();grid.setPointerCapture(e.pointerId);
    drawing.seen.add(step);writeNote(step,degree,true);
  }
});
grid.addEventListener('pointermove',e=>{
  if(!drawing||drawing.id!==e.pointerId)return;
  if(!drawMode){
    if(Math.hypot(e.clientX-drawing.startX,e.clientY-drawing.startY)>8)drawing.moved=true;
    return;
  }
  const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('.note-cell');
  if(!cell||!grid.contains(cell))return;
  const step=Number(cell.dataset.step);
  if(drawing.seen.has(step))return;
  drawing.seen.add(step);writeNote(step,Number(cell.dataset.degree),false);
});
grid.addEventListener('pointerup',e=>{
  if(!drawing||drawing.id!==e.pointerId)return;
  if(!drawMode&&!drawing.moved)writeNote(drawing.step,drawing.degree,true);
  drawing=null;
});
function endDraw(e){if(drawing&&(!e||e.pointerId===drawing.id))drawing=null}
grid.addEventListener('pointercancel',endDraw);
grid.addEventListener('lostpointercapture',endDraw);
$('drawModeBtn').addEventListener('click',()=>{
  drawMode=!drawMode;drawing=null;
  $('drawModeBtn').setAttribute('aria-pressed',String(drawMode));
  $('drawModeBtn').classList.toggle('active',drawMode);
  grid.classList.toggle('drawing-enabled',drawMode);
  info(drawMode?'Режим рисования: веди пальцем по нотам':'Режим касания: листай партитуру горизонтально');
});
grid.addEventListener('click',e=>{
  if(e.detail!==0)return;
  const cell=e.target.closest('.note-cell');if(cell)writeNote(Number(cell.dataset.step),Number(cell.dataset.degree),true);
});
$('titleInput').addEventListener('input',e=>{
  song().title=e.target.value.slice(0,72);persist();
});
$('titleInput').addEventListener('blur',()=>{
  if(!song().title.trim()){song().title='Баллада без названия';persist();$('titleInput').value=song().title;}
});
$('moodSelect').addEventListener('change',e=>{
  const mood=e.target.value;
  updateSong(s=>{
    s.mood=mood;s.mode=MOODS[mood].mode;s.tempo=MOODS[mood].tempo;
    const next=regenerate(s);s.seed=next.seed;s.tracks=next.tracks;
  });info('Характер и мотивы обновлены');
});
$('modeSelect').addEventListener('change',e=>updateSong(s=>{s.mode=e.target.value}));
$('tempoRange').addEventListener('input',e=>{
  $('tempoValue').textContent=e.target.value+' BPM';song().tempo=Number(e.target.value);persist();
});
$('tempoRange').addEventListener('change',()=>{stopPlayback();renderControls();});
$('densityRange').addEventListener('input',e=>{$('densityValue').textContent=e.target.value+'%';});
$('densityRange').addEventListener('change',e=>{
  updateSong(s=>{s.density=Number(e.target.value)/100;const next=regenerate(s);s.seed=next.seed;s.tracks=next.tracks;});
});
$('levelRange').addEventListener('input',e=>{
  selectedTrack().level=Number(e.target.value)/100;$('levelValue').textContent=e.target.value+'%';persist();
});
$('levelRange').addEventListener('change',()=>{stopPlayback();renderTracks();});
$('rerollTrackBtn').addEventListener('click',()=>{
  updateSong(s=>{const n=regenerate(s,selected,section);s.seed=n.seed;s.tracks=n.tracks;});info('Для инструмента сочинён новый мотив');
});
$('rerollSectionBtn').addEventListener('click',()=>{
  updateSong(s=>{const n=regenerate(s,null,section);s.seed=n.seed;s.tracks=n.tracks;});info('Раздел переписан');
});
$('regenerateBtn').addEventListener('click',()=>{
  updateSong(s=>{const n=regenerate(s);s.seed=n.seed;s.tracks=n.tracks;});info('Новая музыкальная вариация готова');
});
$('folioBtn').addEventListener('click',openFolio);
$('closeFolio').addEventListener('click',()=>$('folioDialog').close());
$('newSongBtn').addEventListener('click',addSong);
$('folioList').addEventListener('click',e=>{
  const load=e.target.closest('[data-load]'),copy=e.target.closest('[data-copy]'),del=e.target.closest('[data-delete]');
  if(load){folio.active=load.dataset.load;selected='vielle';section=1;stopPlayback();persist();render();$('folioDialog').close();info('Открыта партитура');}
  else if(copy){$('folioDialog').close();cloneSong(byId(copy.dataset.copy));}
  else if(del)askDelete(del.dataset.delete);
});
$('cancelDelete').addEventListener('click',()=>{pendingDelete=null;$('confirmDialog').close()});
$('confirmDelete').addEventListener('click',performDelete);
$('confirmDialog').addEventListener('close',()=>pendingDelete=null);
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)&&!$('folioDialog').open&&!$('confirmDialog').open){
    e.preventDefault();togglePlayback();
  }
});
window.addEventListener('pagehide',()=>{persist();stopPlayback()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback()});
render();persist();
createWorkshopMode({
  appName:'Folkarium',
  version:'0.1.0',
  cachePrefix: 'folkarium-',
  storageNamespace: 'pocket-works:folkarium',
  onReset(){
    stopPlayback();
    folio=restore();
    selected='vielle';section=1;drawing=null;
    if($('folioDialog').open)$('folioDialog').close();
    if($('confirmDialog').open)$('confirmDialog').close();
    render();persist();
    info('Локальный сборник очищен');
  }
});
