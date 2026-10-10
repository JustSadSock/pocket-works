import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();

const $ = id => document.getElementById(id);
const slot = (question,correct,a,b,why) => ({question,correct,wrong:[a,b],why});
const level = (title,request,...parts) => ({title,request,parts});
const LEVELS = [
  level('ПЕРВОЕ ЗАКЛЯТИЕ','Пусть вор потеряет золото.',
    slot('КТО ПОТЕРЯЕТ?','FVR','FVREM','FVRIS','Fūr — именительный падеж: вор совершает действие. Fūrem означает «вора»; fūris — «вора» в родительном.'),
    slot('ЧТО ОН ПОТЕРЯЕТ?','AVRVM','AVRO','AVRI','Aurum — золото. У существительных среднего рода именительный и винительный падежи совпадают.'),
    slot('КАК ПОЖЕЛАТЬ УЧАСТЬ?','AMITTAT','AMITTIT','AMISIT','Amittat — «пусть потеряет», сослагательное наклонение. Amittit — просто «теряет», amisit — «потерял».')),
  level('ГИБЕЛЬ ТИРАНА','Пусть надменный тиран падёт.',
    slot('КТО ДОЛЖЕН ПАСТЬ?','TYRANNVS','TYRANNVM','TYRANNI','Tyrannus — именительный падеж: «тиран».'),
    slot('КАКОЙ ЭТО ТИРАН?','SVPERBVS','SVPERBVM','SVPERBI','Superbus — «надменный», согласован с tyrannus в мужском роде и именительном падеже.'),
    slot('КАК ЗВУЧИТ ПОЖЕЛАНИЕ?','CADAT','CADIT','CECIDIT','Cadat — «пусть падёт», форма 3-го лица единственного числа настоящего сослагательного.')),
  level('СТРАХ СЕНАТОРА','Пусть сенатор боится теней.',
    slot('КТО БУДЕТ БОЯТЬСЯ?','SENATOR','SENATOREM','SENATORIS','Senator — именительный падеж. Senatorem означает «сенатора» как объект.'),
    slot('ЧЕГО ОН ИСПУГАЕТСЯ?','VMBRAS','VMBRAE','VMBRIS','Umbras — винительный падеж множественного числа слова umbra, «тень». Глагол timeo требует винительного.'),
    slot('ПУСТЬ БОИТСЯ…','TIMEAT','TIMET','TIMVIT','Timeat — сослагательное: «пусть боится». Timet — «боится» как факт.')),
  level('ИЗГНАНИЕ','Пусть враги покинут город.',
    slot('КТО ДОЛЖЕН УЙТИ?','HOSTES','HOSTIBVS','HOSTIVM','Hostes — враги, именительный падеж множественного числа.'),
    slot('ЧТО ОНИ ПОКИНУТ?','VRBEM','VRBS','VRBIS','Urbem — винительный падеж: «город» как объект действия.'),
    slot('ПУСТЬ ПОКИНУТ…','RELINQVANT','RELINQVVNT','RELIQVERVNT','Relinquant — сослагательное множественного числа: «пусть покинут».')),
  level('ЗАБЛУДШИЙ СОЛДАТ','Пусть солдат найдёт дорогу.',
    slot('КТО ПУСТИТСЯ В ПУТЬ?','MILES','MILITEM','MILITIS','Miles — «солдат», именительный падеж.'),
    slot('ЧТО ПУСТЬ НАЙДЁТ?','VIAM','VIA','VIAE','Viam — винительный падеж слова via, «дорога».'),
    slot('КАК ВЫРАЗИТЬ ПОЖЕЛАНИЕ?','INVENIAT','INVENIT','INVENIET','Inveniat — сослагательное наклонение от invenire: «пусть найдёт».')),
  level('ЧЁРНАЯ ВОЛНА','Пусть море поглотит корабль.',
    slot('КТО ПОГЛОТИТ?','MARE','MARIS','MARI','Mare — именительный падеж: «море».'),
    slot('ЧТО БУДЕТ ПОГЛОЩЕНО?','NAVEM','NAVIS','NAVIVM','Navem — винительный падеж слова navis, «корабль».'),
    slot('КАК ПОЖЕЛАТЬ ГИБЕЛИ?','DEVORET','DEVORAT','DEVORAVIT','Devoret — сослагательное наклонение от devorare: «пусть пожрёт, поглотит».')),
  level('НОЧНАЯ ТАЙНА','Пусть ночь скроет следы.',
    slot('КТО СКРОЕТ СЛЕДЫ?','NOX','NOCTEM','NOCTIS','Nox — «ночь», именительный падеж.'),
    slot('ЧТО ПУСТЬ СКРОЕТ?','VESTIGIA','VESTIGIIS','VESTIGIORVM','Vestigia — «следы», винительный падеж множественного числа среднего рода.'),
    slot('ПУСТЬ СКРОЕТ…','CELET','CELAT','CELAVIT','Celet — сослагательное наклонение от celare, «скрывать».')),
  level('ОГОНЬ И ЛОЖЬ','Пусть огонь пожрёт ложь.',
    slot('КТО ПОЖРЁТ?','IGNIS','IGNEM','IGNI','Ignis — «огонь», именительный падеж.'),
    slot('ЧТО ПУСТЬ ПОЖРЁТ?','MENDACIVM','MENDACII','MENDACIO','Mendacium — «ложь», винительный падеж среднего рода.'),
    slot('КАК ВЫРАЗИТЬ ПОЖЕЛАНИЕ?','CONSVMAT','CONSVMIT','CONSVMPSIT','Consumat — «пусть уничтожит, поглотит», сослагательное от consumere.')),
  level('ПАМЯТЬ ЖИВЫХ','Пусть память сохранит имена.',
    slot('КТО СОХРАНИТ?','MEMORIA','MEMORIAM','MEMORIAE','Memoria — «память», именительный падеж.'),
    slot('ЧТО СОХРАНИТ?','NOMINA','NOMINIBVS','NOMINVM','Nomina — «имена», винительный падеж множественного числа среднего рода.'),
    slot('КАК ЗАКРЕПИТЬ ПАМЯТЬ?','SERVET','SERVAT','SERVAVIT','Servet — сослагательное от servare: «пусть хранит».')),
  level('МИЛОСТЬ ПОБЕДЫ','Пусть победа поддержит смелых.',
    slot('КТО ПОДДЕРЖИТ?','VICTORIA','VICTORIAM','VICTORIAE','Victoria — «победа», именительный падеж.'),
    slot('КОГО ПОДДЕРЖИТ?','AVDACES','AVDACIBVS','AVDACIVM','Audaces — «смелых», винительный падеж множественного числа прилагательного audax, использованного как существительное.'),
    slot('ПУСТЬ ПОДДЕРЖИТ…','IVVET','IVVAT','IVVIT','Iuvet — «пусть поможет», сослагательное от iuvare.')),
  level('СУД БОГОВ','Пусть боги накажут врагов.',
    slot('КТО НАКАЖЕТ?','DEI','DEOS','DEORVM','Dei — «боги», именительный падеж множественного числа слова deus.'),
    slot('КОГО НАКАЖУТ?','HOSTES','HOSTIBVS','HOSTIVM','Hostes — здесь винительный падеж множественного числа: «врагов».'),
    slot('ПУСТЬ НАКАЖУТ…','PVNIANT','PVNIVNT','PVNIVERUNT','Puniant — настоящее сослагательное от punire, множественное число.')),
  level('СУД ВРЕМЕНИ','Пусть время судит королей.',
    slot('КТО БУДЕТ СУДИТЬ?','TEMPVS','TEMPORIS','TEMPORI','Tempus — «время», именительный падеж среднего рода.'),
    slot('КОГО ПУСТЬ СУДИТ?','REGES','REGIBVS','REGVM','Reges — «королей», винительный падеж множественного числа слова rex.'),
    slot('ПУСТЬ СУДИТ…','IVDICET','IVDICAT','IVDICAVIT','Iudicet — сослагательное наклонение от iudicare: «пусть судит».'))
];
const FREE_TARGETS = [
 {latin:'FVR',ru:'вор'}, {latin:'TYRANNVS',ru:'тиран'}, {latin:'SENATOR',ru:'сенатор'},
 {latin:'MILES',ru:'солдат'}, {latin:'REX',ru:'король'}, {latin:'POETA',ru:'поэт'},
 {latin:'HOSTIS',ru:'враг'}, {latin:'INVIDVS',ru:'завистник'}
];
const FREE_FATES = [
 {object:'AVRVM',verb:'AMITTAT',ru:'потеряет золото'}, {object:'VMBRAS',verb:'TIMEAT',ru:'испугается теней'},
 {object:'VIAM',verb:'INVENIAT',ru:'найдёт дорогу'}, {object:'VERITATEM',verb:'AVDIAT',ru:'услышит правду'},
 {object:'FORTVNAM',verb:'AMITTAT',ru:'потеряет удачу'}, {object:'NOCTEM',verb:'TIMEAT',ru:'испугается ночи'},
 {object:'GLORIAM',verb:'AMITTAT',ru:'потеряет славу'}
];
const KEY='pocket-works:defixio:v1';
const DEFAULT = {idx:0,step:0,wrong:0,words:[],solved:[],custom:[],sound:true,view:'study',phase:'puzzle',target:0,fate:0,freeInscribed:false};
function load(){
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)||'null');
  if(!raw||typeof raw!=='object')return {...DEFAULT};
  const sane={...DEFAULT};
  if(Number.isInteger(raw.idx)&&raw.idx>=0&&raw.idx<LEVELS.length)sane.idx=raw.idx;
  if(Array.isArray(raw.solved))sane.solved=[...new Set(raw.solved.filter(x=>Number.isInteger(x)&&x>=0&&x<LEVELS.length))];
  if(Array.isArray(raw.custom))sane.custom=raw.custom.filter(x=>x&&typeof x.text==='string'&&/^[A-Z ]{5,70}$/.test(x.text)&&typeof x.ru==='string').slice(-40);
  if(Number.isInteger(raw.target)&&raw.target>=0&&raw.target<FREE_TARGETS.length)sane.target=raw.target;
  if(Number.isInteger(raw.fate)&&raw.fate>=0&&raw.fate<FREE_FATES.length)sane.fate=raw.fate;
  sane.sound=raw.sound!==false;sane.freeInscribed=raw.freeInscribed===true;
  sane.view=raw.view==='free'?'free':'study';
  sane.phase=['puzzle','done','failed'].includes(raw.phase)?raw.phase:'puzzle';
  if(Number.isInteger(raw.step)&&raw.step>=0&&raw.step<=3)sane.step=raw.step;
  if(Number.isInteger(raw.wrong)&&raw.wrong>=0&&raw.wrong<=3)sane.wrong=raw.wrong;
  if(Array.isArray(raw.words))sane.words=raw.words.filter(x=>typeof x==='string').slice(0,3);
  if(sane.words.some((w,i)=>w!==LEVELS[sane.idx].parts[i]?.correct)||sane.words.length!==sane.step){
   sane.step=0;sane.words=[];sane.wrong=0;sane.phase='puzzle';
  }
  if(sane.phase==='done'&&sane.step!==3)sane.phase='puzzle';
  if(sane.phase==='failed'&&sane.wrong!==3)sane.phase='puzzle';
  if(sane.step===3)sane.phase='done';
  return sane;
 }catch{return {...DEFAULT}}
}
let state=load();
let message='',messageKind='',audioContext,drag=null,blockClickBefore=0,returnFocus=null;
const tablet=$('tablet'),stage=$('workbench'),wrapper=$('tabletWrap'),bars=$('wordBars'),feedback=$('feedback');
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{/* memory-only fallback */}}
function latin(t){return t.replace(/U/g,'V')}
function roman(n){const r=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'];return r[n]||String(n+1)}
function sound(type){
 if(!state.sound)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C)return;
  audioContext=audioContext||new C();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  const t=audioContext.currentTime;
  const notes=type==='wrong'?[[143,.09],[109,.17]]:type==='seal'?[[255,.12],[390,.17],[520,.25]]:[[600,.025],[320,.07]];
  notes.forEach(([hz,len],i)=>{
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();
   osc.type=type==='wrong'?'sawtooth':'triangle';
   const when=t+(type==='seal'?i*.09:i*.045);
   osc.frequency.setValueAtTime(hz,when);osc.frequency.exponentialRampToValueAtTime(Math.max(55,hz*.71),when+len);
   gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(type==='seal'?.065:.045,when+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,when+len);
   osc.connect(gain);gain.connect(audioContext.destination);osc.start(when);osc.stop(when+len+.02);
  });
 }catch{/* audio is optional */}
}
function vibrate(ms){try{navigator.vibrate?.(ms)}catch{}}
function feedbackText(t='',kind=''){
 message=t;messageKind=kind;feedback.textContent=t||'Выбери слово или перетащи его на металл.';
 feedback.className='feedback '+kind;
}
function stampEffect(){
 wrapper.classList.remove('jolt');void wrapper.offsetWidth;wrapper.classList.add('jolt');
 stage.classList.add('carving');
 setTimeout(()=>{stage.classList.remove('carving');wrapper.classList.remove('jolt')},290);
}
function scratches(){
 const field=$('scratchField');field.replaceChildren();
 for(let i=0;i<state.wrong;i++){
  const s=document.createElement('span');s.className='scratch';
  s.style.left=(19+i*23)+'%';s.style.top=(26+i*13)+'%';s.style.setProperty('--angle',(23+i*42)+'deg');
  field.appendChild(s);
 }
}
function renderTablet(){
 const inFree=state.view==='free', f=FREE_FATES[state.fate],t=FREE_TARGETS[state.target];
 const words=inFree?(state.freeInscribed?[t.latin,f.object,f.verb]:[]):state.words;
 tablet.classList.toggle('sealed',inFree?state.freeInscribed:state.phase==='done');
 tablet.classList.toggle('broken',!inFree&&state.phase==='failed');
 scratches();
 const slots=[...$('writing').children];
 slots.forEach((el,i)=>{
  const w=words[i];
  el.textContent=w?latin(w):'·······';
  el.className='glyph-slot'+(w?' engraved':(!inFree&&state.phase==='puzzle'&&i===state.step?' active':''));
  el.disabled=Boolean(inFree)||i>=state.step;
  el.dataset.slot=String(i);
 });
}
function currentChoices(){
 const s=LEVELS[state.idx].parts[state.step];
 const array=[s.correct,...s.wrong];
 const offset=(state.idx+state.step)%3;
 return [array[offset],array[(offset+1)%3],array[(offset+2)%3]];
}
function makeOption(text,index){
 const b=document.createElement('button');b.type='button';b.className='word-bar';b.setAttribute('data-native-press','');
 const label=document.createElement('span');label.className='latin';label.textContent=latin(text);
 const pos=document.createElement('span');pos.className='position';pos.textContent='FORMA '+roman(index);
 b.append(label,pos);
 b.addEventListener('click',()=>{if(performance.now()<blockClickBefore)return;choose(text)});
 b.addEventListener('pointerdown',e=>startDrag(e,b,text));
 return b;
}
function clearDrag(){
 if(!drag)return;
 drag.ghost?.remove();drag.button?.classList.remove('pressed');drag=null;
}
function startDrag(e,button,text){
 if(state.view!=='study'||state.phase!=='puzzle'||drag||e.button!==0)return;
 drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,button,text,moving:false,ghost:null};
 button.classList.add('pressed');
 try{button.setPointerCapture(e.pointerId)}catch{}
 function move(ev){
  if(!drag||ev.pointerId!==drag.pointer)return;
  const d=Math.hypot(ev.clientX-drag.x,ev.clientY-drag.y);
  if(d>13&&!drag.moving){
   drag.moving=true;const clone=document.createElement('div');clone.textContent=latin(text);
   clone.style.cssText='position:fixed;z-index:25;pointer-events:none;transform:translate(-50%,-50%) rotate(-4deg);padding:9px 19px;border:2px solid #dac5a1;box-shadow:3px 7px 17px #0009;background:#a9967a;color:#292521;font:bold 24px Georgia,serif;letter-spacing:.1em;';
   document.body.appendChild(clone);drag.ghost=clone;
  }
  if(drag.moving&&drag.ghost){drag.ghost.style.left=ev.clientX+'px';drag.ghost.style.top=ev.clientY+'px';}
 }
 function end(ev){
  button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',cancel);
  if(!drag||ev.pointerId!==drag.pointer)return;
  const moved=drag.moving;
  if(moved){
   blockClickBefore=performance.now()+300;
   const rect=tablet.getBoundingClientRect(),inside=ev.clientX>=rect.left&&ev.clientX<=rect.right&&ev.clientY>=rect.top&&ev.clientY<=rect.bottom;
   clearDrag();
   if(inside)choose(text);else feedbackText('Положи наборную пластину прямо на свинец.','bad');
  }else clearDrag();
 }
 function cancel(ev){
  button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',cancel);
  if(drag&&ev.pointerId===drag.pointer)clearDrag();
 }
 button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);button.addEventListener('pointercancel',cancel);
}
function choose(text){
 if(state.view!=='study'||state.phase!=='puzzle'||state.step>2)return;
 const part=LEVELS[state.idx].parts[state.step];
 if(text!==part.correct){
  state.wrong=Math.min(3,state.wrong+1);sound('wrong');vibrate(20);stampEffect();
  feedbackText('НЕ ТА ФОРМА. '+part.why,'bad');
  if(state.wrong===3)state.phase='failed';
 }else{
  state.words.push(text);state.step++;sound('carve');vibrate(8);stampEffect();
  if(state.step===3){
   state.phase='done';if(!state.solved.includes(state.idx))state.solved.push(state.idx);
   sound('seal');vibrate(45);feedbackText('Табличка запечатана.','good');
  }else feedbackText(part.why,'good');
 }
 persist();render();
}
function renderOptions(){
 bars.replaceChildren();
 if(state.phase!=='puzzle')return;
 currentChoices().forEach((w,i)=>bars.appendChild(makeOption(w,i)));
 const part=LEVELS[state.idx].parts[state.step];
 $('slotQuestion').textContent=part.question;
}
function setNav(){
 $('studyBtn').classList.toggle('nav-active',state.view==='study');
 $('freeBtn').classList.toggle('nav-active',state.view==='free');
 $('archiveCount').textContent=String(state.solved.length+state.custom.length);
 $('soundBtn').setAttribute('aria-pressed',String(state.sound));
 $('soundBtn').setAttribute('aria-label',state.sound?'Выключить звук':'Включить звук');
 $('soundBtn').querySelector('.sound-mark').textContent=state.sound?'◖))':'×';
}
function render(){
 setNav();
 const isFree=state.view==='free';
 $('puzzleControls').hidden=isFree||state.phase!=='puzzle';
 $('doneControls').hidden=isFree||state.phase!=='done';
 $('failedControls').hidden=isFree||state.phase!=='failed';
 $('freeControls').hidden=!isFree;
 if(isFree){
  $('chapter').textContent='OFFICINA · LIBERA';$('commissionName').textContent='ФОРМУЛЯР МАСТЕРА';
  $('task').textContent=state.freeInscribed?'Формула запечатана.':'Выбери жертву и её участь.';
  $('targetBtn').textContent=latin(FREE_TARGETS[state.target].latin)+' — '+FREE_TARGETS[state.target].ru;
  $('fateBtn').textContent=latin(FREE_FATES[state.fate].object+' '+FREE_FATES[state.fate].verb);
  $('freeEngraveBtn').firstChild.textContent=state.freeInscribed?'НАПИСАТЬ ЕЩЁ ОДНУ ':'ВЫЦАРАПАТЬ ФОРМУЛУ ';
 }else{
  $('chapter').textContent='TABVLA · '+roman(state.idx)+' / XII';
  $('commissionName').textContent=LEVELS[state.idx].title;
  $('task').textContent=LEVELS[state.idx].request;
  if(state.phase==='puzzle'){
   $('errors').querySelectorAll('span').forEach((el,i)=>el.classList.toggle('lost',i<state.wrong));
   renderOptions();feedbackText(message||'Выбери слово или перетащи его на металл.',messageKind);
  }else if(state.phase==='done'){
   $('outcomePhrase').textContent=LEVELS[state.idx].parts.map(p=>latin(p.correct)).join(' · ');
   const last=state.idx===LEVELS.length-1;
   $('nextBtn').firstChild.textContent=last?'ПРОЙТИ ЗАКАЗЫ ЕЩЁ РАЗ ':'СЛЕДУЮЩАЯ ТАБЛИЧКА ';
  }
 }
 renderTablet();
 window.__AI_TEST_STATE__={application:'defixio',view:state.view,phase:state.phase,level:state.idx+1,slot:state.step,mistakes:state.wrong,solved:state.solved.length,archive:state.solved.length+state.custom.length,inscription:(isFree?(state.freeInscribed?[FREE_TARGETS[state.target].latin,FREE_FATES[state.fate].object,FREE_FATES[state.fate].verb]:[]):state.words).join(' ')};
}
function restart(levelIndex){
 state.idx=levelIndex;state.step=0;state.wrong=0;state.words=[];state.phase='puzzle';state.view='study';feedbackText();persist();render();
}
function finishFree(){
 const target=FREE_TARGETS[state.target],fate=FREE_FATES[state.fate],inscription=target.latin+' '+fate.object+' '+fate.verb;
 if(!state.freeInscribed){
  state.custom.push({text:inscription,ru:'Пусть '+target.ru+' '+fate.ru+'.',date:Date.now()});
  state.custom=state.custom.slice(-40);state.freeInscribed=true;stampEffect();sound('seal');vibrate(40);
 }else{
  state.freeInscribed=false;
 }
 persist();render();
}
function openOverlay(kind){
 returnFocus=document.activeElement;
 $('overlay').hidden=false;
 $('archiveItems').replaceChildren();
 const list=$('archiveItems');
 if(kind==='archive'){
  $('overlayTitle').textContent='Архив табличек';
  $('overlayLead').textContent='Здесь лежат подлинно созданные тобой латинские формулы. Коснись задания, чтобы переписать табличку.';
  if(!state.solved.length&&!state.custom.length){
   const empty=document.createElement('p');empty.textContent='Пока пусто. Вернись к первому заказу и выцарапай все три слова.';list.appendChild(empty);
  }
  state.solved.slice().sort((a,b)=>a-b).forEach(i=>{
   const l=LEVELS[i],b=document.createElement('button');b.type='button';b.className='archive-item';b.setAttribute('data-native-press','');
   const copy=document.createElement('span');const strong=document.createElement('strong');strong.textContent=roman(i)+' · '+l.parts.map(p=>latin(p.correct)).join(' ');
   const subtitle=document.createElement('small');subtitle.textContent=l.request;copy.append(strong,subtitle);
   const emblem=document.createElement('span');emblem.className='archive-seal';emblem.textContent='✣';
   b.append(copy,emblem);b.addEventListener('click',()=>{closeOverlay();restart(i)});list.appendChild(b);
  });
  state.custom.slice().reverse().forEach(entry=>{
   const row=document.createElement('div');row.className='archive-item';
   const copy=document.createElement('span');const label=document.createElement('strong');label.textContent=latin(entry.text);
   const translation=document.createElement('small');translation.textContent=entry.ru;
   const emblem=document.createElement('span');emblem.className='archive-seal';emblem.textContent='✦';
   copy.append(label,translation);row.append(copy,emblem);list.appendChild(row);
  });
 }else{
  $('overlayTitle').textContent='Язык проклятий';
  $('overlayLead').textContent='Defixio — латинская табличка связывания. В античности такие свинцовые пластины царапали стилом, складывали и прятали в земле, колодцах или могилах.';
  [
   ['NOMINATIVVS · кто?','Именительный падеж: кто совершает действие. FVR — вор, MILES — солдат.'],
   ['ACCVSATIVVS · кого?','Винительный падеж: на кого направлено действие. FVREM — вора, VRBEM — город.'],
   ['CONIVNCTIVVS · пусть…','Римские пожелания и приказы часто используют сослагательное: CADAT — «пусть падёт», TIMEAT — «пусть боится».'],
   ['V как U','В эпиграфическом начертании латинская U передаётся буквой V: AVRVM = aurum, «золото».'],
   ['Об историчности','Фразы в игре грамматически составлены на классической латыни. Это авторские формулы, а не цитаты с реально найденных табличек.']
  ].forEach(([title,copy])=>{
   const row=document.createElement('div');row.className='archive-item';const col=document.createElement('span');
   const b=document.createElement('strong');b.textContent=title;const c=document.createElement('small');c.textContent=copy;
   col.append(b,c);row.appendChild(col);list.appendChild(row);
  });
 }
 $('closeOverlay').focus();
}
function closeOverlay(){if($('overlay').hidden)return;$('overlay').hidden=true;returnFocus?.focus?.();}
$('archiveBtn').addEventListener('click',()=>openOverlay('archive'));
$('toArchiveBtn').addEventListener('click',()=>openOverlay('archive'));
$('infoBtn').addEventListener('click',()=>openOverlay('info'));
$('closeOverlay').addEventListener('click',closeOverlay);
$('overlayShade').addEventListener('click',closeOverlay);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeOverlay();return;}});
$('soundBtn').addEventListener('click',()=>{state.sound=!state.sound;persist();setNav();if(state.sound)sound('carve')});
$('studyBtn').addEventListener('click',()=>{state.view='study';persist();render()});
$('freeBtn').addEventListener('click',()=>{state.view='free';persist();render()});
$('nextBtn').addEventListener('click',()=>restart(state.idx===LEVELS.length-1?0:state.idx+1));
$('retryBtn').addEventListener('click',()=>restart(state.idx));
$('targetBtn').addEventListener('click',()=>{state.target=(state.target+1)%FREE_TARGETS.length;state.freeInscribed=false;persist();render();sound('carve')});
$('fateBtn').addEventListener('click',()=>{state.fate=(state.fate+1)%FREE_FATES.length;state.freeInscribed=false;persist();render();sound('carve')});
$('freeEngraveBtn').addEventListener('click',finishFree);
$('writing').addEventListener('click',e=>{
 const b=e.target.closest('.glyph-slot');if(!b)return;
 const i=Number(b.dataset.slot);
 if(state.view==='free')return;
 if(i<state.step)feedbackText(LEVELS[state.idx].parts[i].why,'good');
 else if(i===state.step&&state.phase==='puzzle')feedbackText('Найди подходящую форму в металлическом наборе ниже.');
});
document.addEventListener('visibilitychange',()=>{persist();if(document.hidden){clearDrag();audioContext?.suspend?.().catch(()=>{})}});
window.addEventListener('pagehide',persist);
render();
