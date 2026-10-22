import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {GLYPHS,glyphSVG} from './symbols.js';
installMobileRuntime();
createWorkshopMode({appName:'ПИКТО',version:'1.3.0',cachePrefix:'picto-',storageNamespace:'pocket-works:picto'});

const root=document.querySelector('#view');
const indicator=document.querySelector('#connection');
const toastNode=document.querySelector('#toast');
const modal=document.querySelector('#modal');
const SERVER=location.origin+'/pocketnet';
const STORE='pocket-works:picto:';
const params=new URLSearchParams(location.search);
let typedCode=(params.get('room')||'').trim().toUpperCase();
let savedName='Гость',profile=null,net=null,me=null,state=null,roomId='',code='';
let connected=false,health=null,connecting=false,draft=[],selected=-1,undo=[],drag=null;
let lastPhase='',lastAuthor='',pendingSend=0,toastTimer=0,confirmAction=null,requestSerial=0;
let soundEnabled=true;
let activeFrame=0,paletteCategory='Все',paletteQuery='',lexiconImported=false;
let draftAnswer=[null,null,null,null,null],answerSending=false;
const GROUPS={
 'Герои':'human king queen knight wizard thief child guard robot ghost',
 'Животные':'cat bird fish dragon dog horse fox rabbit frog snake wolf bear bee owl spider turtle',
 'Вещи':'key crown heart book flower clock sword door boat apple bread cheese cup bottle potion coin gift cake bag map shield bow hammer axe lantern rope ladder chest mirror ring hat boots wheel cart flag compass lock',
 'Места':'house tree mountain cloud sun moon star wave rain fire castle tower bridge cave shop school hospital garden forest island river road gate well tent volcano desert',
 'Чувства':'eye smile cry anger sleep music idea fear surprise thought speech footprint lightning',
 'Знаки':'arrow question hand not swap loop path mask spark'
};
function groupOf(id){return Object.entries(GROUPS).find(([,ids])=>ids.split(' ').includes(id))?.[0]||'Знаки';}
function visibleGlyphs(){return GLYPHS.filter(g=>(!state?.palette?.length||state.palette.includes(g[0]))&&(paletteCategory==='Все'||groupOf(g[0])===paletteCategory)&&(!paletteQuery||g[1].toLowerCase().includes(paletteQuery)||g[0].includes(paletteQuery)));}
function glyphButtons(){return visibleGlyphs().map(g=>'<button class="glyph-btn" type="button" data-glyph="'+g[0]+'" title="'+esc(g[1])+'" aria-label="Добавить: '+esc(g[1])+'">'+glyphSVG(g[0])+'</button>').join('')||'<div class="palette-empty">Ничего не найдено</div>';}
function refreshGlyphs(){const el=document.querySelector('#glyphPalette');if(el)el.innerHTML=glyphButtons();document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===paletteCategory));const hint=document.querySelector('#glyphHint');if(hint)hint.textContent=visibleGlyphs().length+' ЗНАКОВ';}
function lexiconHtml(compact=false){const a=state?.lexicon||[];if(!a.length)return compact?'':'<div class="lexicon-empty">После разгадки автор сможет сохранить удачную композицию.</div>';return '<div class="lexicon-list">'+a.slice(-8).reverse().map((v,i)=>'<div class="lexicon-entry"><b>'+esc(v.prompt)+'</b><small>'+esc(v.name)+'</small>'+(compact?'<button class="btn quiet slim" data-lexicon-use="'+(a.length-1-i)+'">Взять как основу</button>':'')+'</div>').join('')+'</div>';}

try{savedName=localStorage.getItem(STORE+'name')||savedName;soundEnabled=localStorage.getItem(STORE+'sound')!=='off';}catch{}
const memory=new Map();
const adapter={
 getItem(k){try{return sessionStorage.getItem(STORE+'guest:'+k);}catch{return memory.get(k)||null;}},
 setItem(k,v){try{sessionStorage.setItem(STORE+'guest:'+k,v);}catch{memory.set(k,v);}},
 removeItem(k){try{sessionStorage.removeItem(STORE+'guest:'+k);}catch{memory.delete(k);}}
};
const tabChannel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(STORE+'tokens'):null;
let activeToken=null;
tabChannel?.addEventListener('message',event=>{
 const m=event.data;
 if(m?.type==='claim'&&activeToken&&m.token===activeToken)tabChannel.postMessage({type:'owned',nonce:m.nonce});
});
async function ensureUniqueTab(){
 const key='pocket-net:'+SERVER;
 let prior;try{prior=JSON.parse(adapter.getItem(key)||'null');}catch{}
 if(!prior?.token||!tabChannel)return;
 const nonce=crypto.randomUUID();
 const dup=await new Promise(resolve=>{
  const listener=e=>{if(e.data?.type==='owned'&&e.data.nonce===nonce){cleanup();resolve(true);}};
  const cleanup=()=>{clearTimeout(timer);tabChannel.removeEventListener('message',listener);};
  tabChannel.addEventListener('message',listener);
  const timer=setTimeout(()=>{cleanup();resolve(false);},180);
  tabChannel.postMessage({type:'claim',token:prior.token,nonce});
 });
 if(dup)adapter.removeItem(key);
}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function notify(message){
 clearTimeout(toastTimer);toastNode.textContent=message;toastNode.classList.add('show');
 toastTimer=setTimeout(()=>toastNode.classList.remove('show'),3700);
}
function status(message,kind=''){indicator.textContent=message;indicator.className='connection '+kind;}
function playTone(freq=660){
 if(!soundEnabled)return;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=window.__pictoAudio||(window.__pictoAudio=new Audio());if(ac.state==='suspended')ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,ac.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.83,ac.currentTime+.11);g.gain.setValueAtTime(.02,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.14);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.15);}catch{}
}
async function loadProfile(){
 try{
  const res=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});
  if(!res.ok)throw Error('id unavailable');
  const data=await res.json();
  profile=data.user?.complete?data.user:null;
  if(profile?.nickname)savedName=profile.nickname;
 }catch{profile=null;}
}
async function checkHealth(){
 status('Проверка PocketNet');
 try{
  const res=await fetch(SERVER+'/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!res.ok)throw Error();
  const data=await res.json();
  health=data.ok&&data.modules?.includes('picto');
  status(health?'Сеть готова':'Модуль ожидает публикации',health?'ok':'bad');
 }catch{health=false;status('Нет соединения','bad');}
 if(!state&&!connecting)render();
}
function stampHTML(g,i,active=false){
 const selectedClass=active&&selected===i?' selected':'';
 return '<span class="stamp'+selectedClass+'" data-stamp="'+i+'" style="left:'+g.x+'%;top:'+g.y+'%;transform:translate(-50%,-50%) rotate('+g.r+'deg) scale('+g.s+')">'+glyphSVG(g.id)+'</span>';
}
function boardHTML(items,interactive=false,stageId='liveStage',frame=0){
 return '<div class="stage'+(interactive?'':' readonly')+'" id="'+stageId+'" '+(interactive?'data-gesture-surface data-block-callout':'')+' aria-label="Композиция из пиктограмм">'+items.map((g,i)=>(g.frame??0)===frame?stampHTML(g,i,interactive):'').join('')+'</div>';
}
function boardPanel(items,interactive){
 const frames=Math.max(1,Math.min(3,state?.frames||1)),legacy=frames===1;
 const tabs=interactive&&!legacy?'<div class="frame-tabs">'+Array.from({length:frames},(_,i)=>'<button class="frame-tab '+(i===activeFrame?'active':'')+'" data-frame="'+i+'" aria-pressed="'+(i===activeFrame)+'">Кадр '+(i+1)+'</button>').join('')+'</div>':'';
 const stages=!interactive&&!legacy?'<div class="story-grid frames-'+frames+'">'+Array.from({length:frames},(_,i)=>'<div class="story-panel"><span>0'+(i+1)+' · '+(i===0?'НАЧАЛО':i===frames-1?'ИТОГ':'СОБЫТИЕ')+'</span>'+boardHTML(items,false,'scene-'+i,i)+'</div>').join('')+'</div>':boardHTML(items,interactive);
 return '<div class="board-panel">'+tabs+'<div class="stage-frame">'+stages+'</div><div class="board-foot"><span>'+(legacy?'СТУДИЯ / 01':frames+' КАДРА · ИСТОРИЯ')+'</span><span>'+items.length+' / '+(legacy?'26':'48')+' ЗНАКОВ</span></div></div>';
}
function playerList(){
 const players=state?.players||[];
 return '<div class="roster"><h2>Участники · '+players.length+'/8</h2>'+players.map((p,i)=>
  '<div class="player"><span class="player-mark">'+String(i+1).padStart(2,'0')+'</span><span>'+esc(p.name)+(p.id===me?.id?' (ты)':'')+'</span><small>'+(p.id===state.host?'ведущий':'готов')+'</small></div>'
 ).join('')+'</div>';
}
function renderMenu(){
 const named=profile?.nickname||savedName;
 const profileLine=profile?
  '<div class="account-note"><span class="account-dot"></span> Pocket ID · '+esc(profile.nickname)+'</div>':
  '<p class="small-note">Гостевой вход разрешён. Аккаунт можно создать в PocketWorks.</p>';
 const resume=(()=>{try{return Boolean(JSON.parse(adapter.getItem('pocket-net:'+SERVER)||'null')?.roomId);}catch{return false;}})();
 root.innerHTML='<section class="screen hero">'+
  '<div class="hero-cover"><div class="micro">АТЕЛЬЕ НЕВОЗМОЖНЫХ СООБЩЕНИЙ · № 001</div>'+
  '<h1>ПИК<b>ТО</b></h1><div class="hero-demo">'+glyphSVG('bird')+'</div>'+
  '<p>Ни одного слова на холсте. Сколько угодно способов понять друг друга.</p></div>'+
  '<div class="menu-pane"><div class="micro">PICK / PLACE / GUESS</div><h2>Собери смысл.<br>Пусть угадают.</h2>'+
  '<p class="small-note">2–8 друзей · истории в символах · 112 знаков.</p>'+
  '<div><label class="label" for="playerName">Твоё имя</label><input class="field" id="playerName" maxlength="22" autocomplete="nickname" value="'+esc(named)+'" '+(profile?'disabled':'')+'></div>'+profileLine+
  '<button class="btn primary full" data-action="create">Создать комнату ↗</button><div class="rule"></div>'+
  '<div><label class="label" for="roomCode">Код комнаты друга</label><input class="field field-code" id="roomCode" maxlength="36" placeholder="A17D0C9E" autocomplete="off" spellcheck="false" value="'+esc(typedCode)+'"></div>'+
  '<button class="btn blue full" data-action="join">Присоединиться →</button>'+
  (resume?'<button class="btn quiet full" data-action="resume">Вернуться в прежнюю комнату</button>':'')+
  (health===false?'<button class="btn quiet full" data-action="retry">Проверить PocketNet снова</button>':'')+
  '<button class="btn quiet slim" data-action="sound">Звук: '+(soundEnabled?'включён':'выключен')+'</button>'+
  '</div></section>';
}
function renderLobby(){
 const count=state.players.length,host=state.host===me?.id;
 root.innerHTML='<section class="screen"><div class="section-head"><div><span class="micro">КОМНАТА / ПОДГОТОВКА</span><h1>Собираем компанию.</h1><p>Каждый хотя бы раз станет автором знакового сообщения. Разгадываем вместе.</p></div></div>'+
  '<div class="room-grid"><div class="ticket"><span class="micro">КОД-ПРИГЛАШЕНИЕ</span><div class="ticket-code" data-selectable>'+esc(code||'········')+'</div>'+
  '<div class="ticket-actions"><button class="btn slim" data-action="copy-code">Скопировать код</button><button class="btn slim" data-action="copy-link">Ссылка другу</button></div>'+
  '<div class="rule"></div><p class="small-note">Покажи друзьям ссылку: они зайдут через свой браузер. Без отдельного приложения и настройки сервера.</p></div>'+playerList()+'</div>'+
  (state.semanticVersion===4?'<div class="lexicon-room"><strong>Язык компании · '+(state.lexicon?.length||0)+'/24</strong>'+lexiconHtml()+'</div>':'')+
  '<div class="room-footer"><button class="btn primary" data-action="start" '+(!host||count<2||!connected?'disabled':'')+'>'+(host?'Начать игру':'Ждём ведущего')+' →</button><button class="btn quiet" data-action="leave">Покинуть комнату</button></div></section>';
}
function phaseTop(title,subtitle){
 return '<div class="round-top"><div><span class="micro">РАУНД '+state.round+' / '+state.maxRounds+' · '+esc(subtitle)+'</span><h1>'+esc(title)+'</h1></div><div class="timer" id="timer">—</div></div>';
}

function renderCompose(){
 const author=state.author===me?.id;
 const authorName=state.players.find(p=>p.id===state.author)?.name||'Автор';
 const items=author?draft:state.board;
 const prompt=author?(state.prompt||'Получаем фразу…'):'Смотри, как рождается сообщение';
 const promptBar='<div class="prompt-strip"><div><span class="micro">'+(author?'ТВОЯ СЕКРЕТНАЯ ФРАЗА':'РАБОТАЕТ '+esc(authorName))+'</span><br><b>'+esc(prompt)+'</b></div>'+
  (author?'<span class="micro">'+(state.semanticVersion===4?'ИСТОРИЯ В '+state.frames+' КАДРАХ':'НЕ ВСЕ ЗНАКИ ДОСТУПНЫ')+'</span>':'<span class="micro">НАБЛЮДАЙ</span>')+'</div>';
 const available=GLYPHS.filter(g=>!state.palette?.length||state.palette.includes(g[0]));
 const palette=state.semanticVersion===4?glyphButtons():available.map(g=>'<button class="glyph-btn" type="button" data-glyph="'+g[0]+'" title="'+esc(g[1])+'" aria-label="Добавить: '+esc(g[1])+'">'+glyphSVG(g[0])+'</button>').join('');
 const blocked=GLYPHS.filter(g=>state.blocked?.includes(g[0]));
 const blockedHTML=blocked.length?'<div class="blocked-strip"><span>ЗАПРЕЩЕНО</span>'+
  blocked.map(g=>'<span class="blocked-glyph" title="'+esc(g[1])+'">'+glyphSVG(g[0])+'</span>').join('')+'</div>':'';
 const toolbox=author?'<aside class="toolbox"><div class="toolbox-head"><span>АЛФАВИТ РАУНДА</span><span id="glyphHint">'+available.length+' ЗНАКОВ</span></div>'+
  blockedHTML+(state.semanticVersion===4?'<div class="category-tabs">'+['Все',...Object.keys(GROUPS)].map(c=>'<button class="category-btn '+(paletteCategory===c?'active':'')+'" data-category="'+c+'">'+c+'</button>').join('')+'</div><input class="glyph-search" id="glyphSearch" placeholder="Найти знак…" aria-label="Поиск знаков" value="'+esc(paletteQuery)+'">':'')+'<div class="palette" id="glyphPalette">'+palette+'</div><div class="tools-row">'+
  '<button class="btn" data-action="rotate-left" title="Повернуть влево" aria-label="Повернуть влево" '+(selected<0?'disabled':'')+'>↶</button>'+
  '<button class="btn" data-action="rotate-right" title="Повернуть вправо" aria-label="Повернуть вправо" '+(selected<0?'disabled':'')+'>↷</button>'+
  '<button class="btn" data-action="shrink" title="Уменьшить" aria-label="Уменьшить" '+(selected<0?'disabled':'')+'>−</button>'+
  '<button class="btn" data-action="grow" title="Увеличить" aria-label="Увеличить" '+(selected<0?'disabled':'')+'>＋</button></div>'+
  '<div class="toolbox-actions"><button class="btn quiet slim" data-action="undo" '+(!undo.length?'disabled':'')+'>Отменить</button>'+
  '<button class="btn quiet slim" data-action="delete" '+(selected<0?'disabled':'')+'>Убрать знак</button>'+
  '<button class="btn primary slim" data-action="publish" '+(!draft.length||!connected?'disabled':'')+'>Показать друзьям ↗</button></div>'+(state.semanticVersion===4&&state.lexicon?.length?'<div class="lexicon-compact"><strong>Язык компании</strong>'+lexiconHtml(true)+'</div>':'')+'</aside>':
  '<aside class="toolbox"><div class="micro">СООБЩЕНИЕ В ПРОЦЕССЕ</div><p>Автор собирает картину из ограниченного набора знаков.</p>'+
  '<div class="wait-box">Автор: <b>'+esc(authorName)+'</b><br>Знаков сейчас: <b>'+items.length+'</b></div>'+
  '<button class="btn quiet slim" data-action="leave">Покинуть игру</button></aside>';
 root.innerHTML='<section class="game-shell">'+phaseTop(author?'Твоя очередь объяснять':'Скоро разгадываем','КОМПОЗИЦИЯ')+promptBar+
  '<div class="editor-layout">'+boardPanel(items,author)+toolbox+'</div></section>';
 updateClock();
}
const SLOT_LABELS=['Кто','Что делает','С кем / чем','Что потом','Где происходит'];
const slotNames=()=>state?.semanticVersion===4?SLOT_LABELS:['Кто','Что делает','Что','Как / где','С чем / где'];
function guessWords(slot,cells){
 if(slot===4&&state.semanticVersion!==4)return state.locationForms?.[cells[3]??0]||state.choices?.[4]||[];
 return state.choices?.[slot]||[];
}
function renderSlot(slot,cells,locked){
 const selected=cells[slot];
 const options=guessWords(slot,cells);
 return '<label class="guess-cell"><span class="guess-cell-label"><b>'+String(slot+1).padStart(2,'0')+'</b> '+slotNames()[slot]+'</span>'+
  '<select class="guess-select '+(selected!==null?'filled':'')+'" data-guess-slot="'+slot+'" '+(locked||!connected?'disabled':'')+'>'+
  '<option value="">— оставить пустым —</option>'+
  options.map((word,i)=>'<option value="'+i+'" '+(selected===i?'selected':'')+'>'+esc(word)+'</option>').join('')+
  '</select></label>';
}
function updateGuessDraft(){
 const filled=draftAnswer.filter(v=>v!==null).length;
 const info=document.querySelector('#guessProgress');if(info)info.textContent=filled+' / 5 ВЫБРАНО';
 const submit=document.querySelector('[data-action="submit-guess"]');
 if(submit)submit.disabled=!filled||!connected||answerSending;
 document.querySelectorAll('[data-guess-slot]').forEach(el=>el.classList.toggle('filled',el.value!==''));
}

function renderGuess(){
 if(!state.choices?.length)return renderLegacyGuess();
 const author=state.author===me?.id;
 const did=state.answered.includes(me?.id);
 const cells=did&&state.myAnswer?state.myAnswer:draftAnswer;
 const panel=author?'<div class="wait-box">Ты передал сообщение. Друзья составляют свою расшифровку из пяти частей.</div>':
  '<div class="guess-card"><div class="guess-intro"><strong>Собери смысл по частям</strong><small>Укажи только то, в чём уверен. Пустые ячейки не штрафуются.</small></div>'+
  '<div class="guess-cells">'+slotNames().map((_,i)=>renderSlot(i,cells,did)).join('')+'</div>'+
  '<div class="guess-submit"><span class="micro" id="guessProgress">'+cells.filter(v=>v!==null).length+' / 5 ВЫБРАНО</span>'+
  '<button class="btn primary" data-action="submit-guess" '+(did||!connected||answerSending||cells.every(v=>v===null)?'disabled':'')+'>'+(did?'Ответ принят ✓':'Отправить версию ↗')+'</button></div></div>';
 root.innerHTML='<section class="game-shell">'+phaseTop('Расшифруй картину','ПЯТЬ ЯЧЕЕК')+
  '<div class="prompt-strip"><b>'+(did?'Версия отправлена':author?'Ждём интерпретаций':'Можно оставить часть фразы пустой')+'</b><span class="micro">'+state.answered.length+' / '+(state.players.length-1)+' ОТВЕТОВ</span></div>'+
  '<div class="guess-layout">'+boardPanel(state.board,false)+'<div class="guess-options">'+panel+
  '<button class="btn quiet slim" data-action="leave">Выйти из комнаты</button></div></div></section>';
 updateClock();
}

function renderReveal(){
 if(!state.choices?.length)return renderLegacyReveal();
 const result=state.history?.at(-1);
 const solution=state.solution||[];
 const mine=state.myAnswer||[null,null,null,null,null];
 const originalChoices=state.choices||[];
 const targetPrep=originalChoices[3]?.indexOf(solution[3])??0;
 const peers=state.players.filter(p=>p.id!==state.author).map(p=>{
  const answer=state.answers[p.id];
  const count=answer?answer.filter((n,i)=>n!==null&&(state.semanticVersion===4?originalChoices[i]?.[n]===solution[i]:(i===4?state.locationForms?.[targetPrep]?.[n]===solution[4]:originalChoices[i]?.[n]===solution[i]))).length:0;
  return '<span class="answer-pill '+(!answer?'':count>=3?'yes':'no')+'">'+esc(p.name)+': '+(answer?count+' / 5':'не ответил')+'</span>';
 }).join('');
 const review=solution.map((word,i)=>{
  const selected=mine[i],own=i===4&&state.semanticVersion!==4?state.locationForms?.[mine[3]??0]?.[selected]:originalChoices[i]?.[selected];
  const right=state.semanticVersion===4?own===word:(i===4?state.locationForms?.[targetPrep]?.[selected]===word:own===word);
  return '<div class="review-cell"><span>'+slotNames()[i]+'</span><strong>'+esc(word)+'</strong>'+
    (state.author!==me?.id&&selected!==null?'<small class="'+(right?'hit':'miss')+'">'+(right?'✓ ':'✕ ')+esc(own||'—')+'</small>':'')+'</div>';
 }).join('');
 root.innerHTML='<section class="game-shell">'+phaseTop('Вот что было загадано','РАСКРЫТИЕ')+
  '<div class="reveal-head"><div><span class="micro">ИСХОДНАЯ ИСТОРИЯ</span><h2>'+esc(state.semanticVersion===4?state.story:solution.join(' ')+'.')+'</h2></div><strong>'+Number(result?.correct||0)+' / '+Number(result?.total||0)+' слов</strong></div>'+
  '<div class="guess-layout">'+boardPanel(state.board,false)+'<div class="guess-options">'+
  '<div class="review-grid">'+review+'</div><div class="reveal-peers">'+peers+'</div>'+
  '<p class="small-note">+2 за точный смысл, −1 за ошибку, 0 за пропуск. Раунд: '+(result?.points||0)+' очков.</p>'+
  (state.semanticVersion===4&&state.author===me?.id?'<button class="btn blue" data-action="save-word" '+(state.lexicon?.some(v=>v.prompt===result?.prompt)||state.lexicon?.length>=24?'disabled':'')+'>'+(state.lexicon?.some(v=>v.prompt===result?.prompt)?'Уже в словаре ✓':'В словарь компании +')+'</button>':'')+
  (state.host===me?.id?'<button class="btn primary" data-action="next">Следующий этап →</button>':'<p class="small-note">Следующий этап начнётся автоматически.</p>')+
  '</div></div></section>';
 updateClock();
}

function renderLegacyGuess(){
 const author=state.author===me?.id,did=state.answered.includes(me?.id);
 const choices=state.options||[];
 const options=author?'<div class="wait-box">Ты автор. Друзья выбирают смысл твоей композиции.</div>':
  choices.map((phrase,i)=>'<button class="option '+(state.myAnswer===i?'selected':'')+'" data-choice="'+i+'" '+(did||!connected?'disabled':'')+'><small>'+(i+1)+'</small>'+esc(phrase)+'</button>').join('');
 root.innerHTML='<section class="game-shell">'+phaseTop('Что это значит?','КЛАССИЧЕСКАЯ РАСШИФРОВКА')+
  '<div class="prompt-strip"><b>'+(did?'Ответ принят':author?'Ждём друзей':'Выбери интерпретацию')+'</b><span class="micro">'+state.answered.length+' / '+(state.players.length-1)+' ОТВЕТОВ</span></div>'+
  '<div class="guess-layout">'+boardPanel(state.board,false)+'<div class="guess-options">'+options+
  '<button class="btn quiet slim" data-action="leave">Выйти из комнаты</button></div></div></section>';
 updateClock();
}
function renderLegacyReveal(){
 const result=state.history?.at(-1),correct=state.correct;
 const peers=state.players.filter(p=>p.id!==state.author).map(p=>{
  const answer=state.answers[p.id],right=answer===correct;
  return '<span class="answer-pill '+(answer===undefined?'':right?'yes':'no')+'">'+esc(p.name)+': '+(answer===undefined?'не ответил':right?'угадал':'другая версия')+'</span>';
 }).join('');
 root.innerHTML='<section class="game-shell">'+phaseTop('А вот что имелось в виду','РАСКРЫТИЕ')+
  '<div class="reveal-head"><div><span class="micro">ИСХОДНАЯ ФРАЗА</span><h2>'+esc(state.options[correct]||'—')+'</h2></div><strong>'+(result?.correct||0)+' / '+(result?.total||0)+'</strong></div>'+
  '<div class="guess-layout">'+boardPanel(state.board,false)+'<div class="guess-options">'+
  state.options.map((phrase,i)=>'<div class="option '+(i===correct?'correct':'wrong')+'"><small>'+(i+1)+'</small>'+esc(phrase)+'</div>').join('')+
  '<div class="reveal-peers">'+peers+'</div>'+
  (state.host===me?.id?'<button class="btn primary" data-action="next">Следующий этап →</button>':'<p class="small-note">Следующий этап начнётся автоматически.</p>')+
  '</div></div></section>';
 updateClock();
}

function renderResults(){
 const gallery=(state.history||[]).map((g,i)=>'<article class="gallery-card"><span class="micro">№ '+String(i+1).padStart(2,'0')+'</span>'+
  (state.semanticVersion===4?'<div class="gallery-story">'+Array.from({length:(i+1)%3===0?3:2},(_,f)=>boardHTML(g.board,false,'gallery-'+i+'-'+f,f)).join('')+'</div>':boardHTML(g.board,false,'gallery-'+i))+'<h3>'+esc(g.prompt)+'</h3><small>'+esc(g.name)+' · '+g.correct+'/'+g.total+
  (Number.isFinite(g.points)?' слов · '+g.points+' очков':' поняли')+'</small></article>').join('');
 const score=Number.isFinite(state.wordsFound)?
  'Угадано слов: '+state.wordsFound+' из '+state.attempts+' · '+state.score+' очков':
  'Общих разгадок: '+state.score+' из '+state.attempts;
 root.innerHTML='<section class="screen finish"><span class="micro">АРХИВ / СЕАНС ЗАВЕРШЁН</span>'+
  '<h1>Поняли.<br>Почти.</h1><div class="finish-score">'+score+'</div>'+
  '<p>Все композиции одной партии. Можно рассмотреть чужие расшифровки и начать новую игру.</p>'+
  '<div class="gallery">'+gallery+'</div>'+(state.semanticVersion===4?'<div class="lexicon-room"><strong>Язык компании · '+(state.lexicon?.length||0)+'/24</strong>'+lexiconHtml()+'</div>':'')+'<div class="room-footer">'+
  '<button class="btn primary" data-action="again" '+(state.host!==me?.id||!connected?'disabled':'')+'>'+(state.host===me?.id?'Играть ещё ↗':'Ждём ведущего')+'</button>'+
  '<button class="btn quiet" data-action="leave">Покинуть комнату</button></div></section>';
}
function render(){
 if(!state){renderMenu();return;}
 if(state.phase==='lobby')renderLobby();
 else if(state.phase==='compose')renderCompose();
 else if(state.phase==='guess')renderGuess();
 else if(state.phase==='reveal')renderReveal();
 else renderResults();
}
function updateClock(){
 const el=document.querySelector('#timer');
 if(!el)return;
 const remaining=Math.max(0,Math.ceil(((state?.deadline||0)-Date.now())/1000));
 el.textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
}
function setState(next){
 if(!next||!Array.isArray(next.players)||!next.phase)return;
 const changed=state?.phase!==next.phase||state?.author!==next.author||state?.round!==next.round||state?.prompt!==next.prompt;
 const wasAnswered=state?.answered?.includes(me?.id)||false;
 state=next;
 if(next.semanticVersion===4&&next.lexicon?.length){try{localStorage.setItem(STORE+'lexicon',JSON.stringify(next.lexicon));}catch{}}
 if(next.semanticVersion===4&&next.phase==='lobby'&&next.host===me?.id&&!lexiconImported){lexiconImported=true;try{const entries=JSON.parse(localStorage.getItem(STORE+'lexicon')||'[]');if(Array.isArray(entries)&&entries.length)send({type:'lexicon-import',entries});}catch{}}
 if(changed){hideConfirm();selected=-1;activeFrame=0;undo=[];draft=(next.board||[]).map(g=>({...g}));draftAnswer=[null,null,null,null,null];answerSending=false;drag=null;render();playTone(next.phase==='reveal'?830:540);return;}
 if(next.phase==='guess'&&!changed&&state.answered.includes(me?.id)===wasAnswered){
  const counter=document.querySelector('.prompt-strip .micro');
  if(counter)counter.textContent=state.answered.length+' / '+(state.players.length-1)+' ОТВЕТОВ';
  updateClock();return;
 }
 if(next.phase==='compose'&&next.author===me?.id){
  // Never destroy the active pointer surface when server echoes an edit.
  updateClock();return;
 }
 render();
}
function syncRoom(message){
 roomId=message.roomId;code=message.roomId?.slice(0,8).toUpperCase()||code;
 state=null;lexiconImported=false;root.innerHTML='<section class="loading">Синхронизируем комнату…</section>';
 try{net.sendGame({type:'sync'});}catch{notify('Не удалось синхронизировать комнату.');}
 const address=new URL(location.href);address.searchParams.set('room',code);history.replaceState(null,'',address.pathname+address.search);
}
function stop(leave=true){
 requestSerial++;clearTimeout(pendingSend);pendingSend=0;drag=null;lexiconImported=false;
 if(net){if(leave&&state)try{net.leaveRoom();}catch{}net.close();}
 net=null;activeToken=null;me=null;state=null;roomId='';code='';connecting=false;connected=false;
 if(leave)adapter.removeItem('pocket-net:'+SERVER);
 history.replaceState(null,'',location.pathname);
 status(health?'Сеть готова':'Нет соединения',health?'ok':'bad');
 render();
}
const networkErrors={room_not_found:'Комната не найдена. Проверь код.',room_full:'В комнате уже восемь игроков.',match_in_progress:'Партия уже идёт. Дождись следующей.',game_unavailable:'Модуль ПИКТО ещё не опубликован в PocketNet.',room_version_unavailable:'Эта версия игры недоступна.',invalid_token:'Срок гостевой сессии истёк.',rate_limited:'Слишком много действий — подожди секунду.',server_at_capacity:'На сервере сейчас нет свободных мест.',not_in_room:'Ты больше не в комнате.'};
async function connect(mode){
 if(connecting)return;
 const input=root.querySelector('#playerName');
 const name=(profile?.nickname||input?.value||savedName).trim().slice(0,22);
 if(!name){notify('Укажи имя игрока.');return;}
 if(!profile)try{localStorage.setItem(STORE+'name',name);}catch{}
 savedName=name;
 const target=String(root.querySelector('#roomCode')?.value||typedCode).trim().toUpperCase();
 if(mode==='join'&&!(/^[0-9A-F]{8}$/.test(target)||/^[0-9A-F-]{36}$/.test(target))){notify('Нужен код из восьми символов.');return;}
 typedCode=target;
 if(net)stop(false);
 const ticket=++requestSerial;
 connecting=true;root.innerHTML='<section class="loading">Открываем связь с PocketNet…</section>';status('Подключение');
 try{
  // A PocketNet guest transport identity is scoped to the active Pocket ID nickname.
  // Switching Google/Pocket ID accounts must not silently reuse a previous guest name.
  if(adapter.getItem('last-player-name')!==name)adapter.removeItem('pocket-net:'+SERVER);
  adapter.setItem('last-player-name',name);
  if(mode!=='resume')adapter.removeItem('pocket-net:'+SERVER);
  await ensureUniqueTab();
  const client=new PocketNet({serverUrl:SERVER,name,storage:adapter});
  net=client;
  client.on('connected',info=>{if(net!==client)return;me=info.player;connected=true;activeToken=client.token;status('В сети','ok');if(state)render();});
  client.on('room_joined',info=>{if(net!==client)return;connecting=false;syncRoom(info);});
  client.on('game_event',packet=>{if(net!==client)return;if(packet.event?.type==='state')setState(packet.event.payload);else if(packet.event?.type==='notice'){answerSending=false;notify(String(packet.event.payload));if(state?.phase==='guess')render();}});
  client.on('presence',()=>{if(net===client&&state)try{client.sendGame({type:'sync'});}catch{}});
  client.on('disconnected',()=>{if(net!==client)return;connected=false;answerSending=false;status('Переподключение','bad');if(state)render();});
  client.on('room_closed',()=>{if(net!==client)return;stop(false);notify('Комната закрыта. Можно создать новую.');});
  client.on('error',error=>{if(net!==client)return;notify(networkErrors[error?.code]||error?.code||error?.message||'Ошибка сети');if(connecting)stop(false);});
  await Promise.race([client.connect(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Соединение не установлено за 12 секунд.')),12000))]);
  if(ticket!==requestSerial)return;
  if(mode==='create')client.createRoom('picto');
  else if(mode==='join')client.joinRoom(target);
  else if(!client.roomId)throw Error('Прежняя комната уже недоступна.');
 }catch(error){
  if(ticket!==requestSerial)return;
  stop(false);notify(error?.message||'Не удалось подключиться.');
 }
}
function send(action){
 if(!connected||!net){notify('Подключение к PocketNet потеряно.');return false;}
 try{net.sendGame(action);return true;}catch{notify('Команда не отправлена, ждём подключения.');return false;}
}
function flushBoard(){
 clearTimeout(pendingSend);pendingSend=0;
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 send({type:'edit',glyphs:draft});
}
function queueBoard(){
 clearTimeout(pendingSend);
 pendingSend=setTimeout(flushBoard,130);
}
function remember(){undo.push(draft.map(g=>({...g})));if(undo.length>30)undo.shift();}
function paintBoard(){
 const stage=document.querySelector('#liveStage');
 if(stage)stage.innerHTML=draft.map((g,i)=>(g.frame??0)===activeFrame?stampHTML(g,i,true):'').join('');
 const count=document.querySelector('.board-foot span:last-child');if(count)count.textContent=draft.length+' / '+(state.semanticVersion===4?'48':'26')+' ЗНАКОВ';
 document.querySelectorAll('[data-action="rotate-left"],[data-action="rotate-right"],[data-action="shrink"],[data-action="grow"],[data-action="delete"]').forEach(b=>b.disabled=selected<0);
 const undoBtn=document.querySelector('[data-action="undo"]');if(undoBtn)undoBtn.disabled=!undo.length;
 const publish=document.querySelector('[data-action="publish"]');if(publish)publish.disabled=!draft.length||!connected;
}
function addSymbol(id){
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 if(state.palette?.length&&!state.palette.includes(id)){notify('Этот знак недоступен в раунде.');return;}
 if(draft.length>=(state.semanticVersion===4?48:26)){notify('На доске закончилось место для знаков.');return;}
 remember();
 const offset=(draft.length%7-3)*4;
 draft.push({id,x:Math.max(8,Math.min(92,50+offset)),y:Math.max(10,Math.min(90,50+(Math.floor(draft.length/7)-1)*9)),r:0,s:1,...(state.semanticVersion===4?{frame:activeFrame}:{})});
 selected=draft.length-1;paintBoard();const hint=document.querySelector('#glyphHint');if(hint)hint.textContent=GLYPHS.find(g=>g[0]===id)?.[1]||'ЗНАК';queueBoard();playTone(620);
}
function transform(type){
 if(selected<0||!draft[selected])return;
 remember();const g=draft[selected];
 if(type==='rotate-left')g.r=g.r<=-150?g.r+315:g.r-45;
 if(type==='rotate-right')g.r=g.r>=150?g.r-315:g.r+45;
 if(type==='shrink')g.s=Math.max(.55,Math.round((g.s-.15)*100)/100);
 if(type==='grow')g.s=Math.min(2.2,Math.round((g.s+.15)*100)/100);
 if(type==='delete'){draft.splice(selected,1);selected=-1;}
 paintBoard();queueBoard();playTone(490);
}
function confirmBox(title,body,callback){
 confirmAction=callback;
 modal.classList.remove('hidden');
 modal.innerHTML='<div class="modal-box"><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p><div class="modal-actions"><button class="btn quiet" data-confirm="no">Отмена</button><button class="btn primary" data-confirm="yes">Подтвердить</button></div></div>';
 modal.querySelector('[data-confirm="no"]')?.focus();
}
function hideConfirm(){modal.classList.add('hidden');modal.textContent='';confirmAction=null;}
modal.addEventListener('click',e=>{
 if(e.target.closest('[data-modal-close]')){hideConfirm();return;}
 const b=e.target.closest('[data-confirm]');if(!b)return;
 const cb=confirmAction;hideConfirm();if(b.dataset.confirm==='yes')cb?.();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))hideConfirm();});
async function copyText(value){
 try{await navigator.clipboard.writeText(value);}
 catch{
  const input=document.createElement('textarea');input.value=value;input.style.cssText='position:fixed;opacity:0';document.body.append(input);input.select();
  const copied=document.execCommand('copy');input.remove();if(!copied){notify('Не удалось скопировать. Выдели код вручную.');return;}
 }
 notify('Скопировано.');playTone(690);
}
root.addEventListener('click',e=>{
 const glyph=e.target.closest('[data-glyph]');if(glyph&&!glyph.disabled){addSymbol(glyph.dataset.glyph);return;}
 const cat=e.target.closest('[data-category]');if(cat){paletteCategory=cat.dataset.category;refreshGlyphs();return;}
 const frame=e.target.closest('[data-frame]');if(frame){activeFrame=Number(frame.dataset.frame);selected=-1;document.querySelectorAll('[data-frame]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.frame)===activeFrame);b.setAttribute('aria-pressed',String(Number(b.dataset.frame)===activeFrame));});paintBoard();return;}
 const word=e.target.closest('[data-lexicon-use]');if(word&&state?.phase==='compose'&&state.author===me?.id){const entry=state.lexicon?.[Number(word.dataset.lexiconUse)];if(!entry)return;const apply=()=>{remember();draft=entry.board.filter(g=>(g.frame??0)<(state.frames||1)&&state.palette.includes(g.id)).slice(0,48).map(g=>({...g}));selected=-1;activeFrame=0;paintBoard();queueBoard();notify('Композиция из словаря загружена.');};if(draft.length)confirmBox('Заменить композицию?','Знаки можно вернуть кнопкой отмены.',apply);else apply();return;}
 
 const option=e.target.closest('[data-choice]');
 if(option&&!option.disabled){
  if(send({type:'answer',choice:Number(option.dataset.choice)})){option.disabled=true;option.classList.add('selected');playTone(740);}return;
 }
 const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
 const action=btn.dataset.action;
 if(action==='create'||action==='join'||action==='resume'){connect(action);return;}
 if(action==='retry'){checkHealth();return;}
 
 if(action==='sound'){soundEnabled=!soundEnabled;try{localStorage.setItem(STORE+'sound',soundEnabled?'on':'off');}catch{}render();return;}
 if(action==='copy-code'){copyText(code);return;}
 if(action==='copy-link'){copyText(new URL(location.pathname+'?room='+encodeURIComponent(code),location.origin).href);return;}
 if(action==='start'||action==='again'||action==='next'){send({type:action});playTone(700);return;}
 if(action==='publish'){flushBoard();if(draft.length)send({type:'publish'});return;}
 if(action==='save-word'){send({type:'save-word'});return;}
  if(action==='submit-guess'){
   if(state?.phase!=='guess'||state.author===me?.id||answerSending||draftAnswer.every(v=>v===null))return;
   if(send({type:'answer',cells:[...draftAnswer]})){answerSending=true;updateGuessDraft();playTone(740);}return;
  }
 if(action==='undo'){if(!undo.length)return;draft=undo.pop();selected=Math.min(selected,draft.length-1);paintBoard();queueBoard();return;}
 if(['rotate-left','rotate-right','grow','shrink','delete'].includes(action)){transform(action);return;}
 if(action==='leave')confirmBox('Покинуть комнату?','Твоя текущая композиция останется у остальных участников, но ты выйдешь из партии.',()=>stop(true));
});
root.addEventListener('input',e=>{
 if(e.target?.id==='roomCode'){typedCode=e.target.value=e.target.value.toUpperCase().replace(/\s/g,'');}
 if(e.target?.id==='glyphSearch'){paletteQuery=e.target.value.toLowerCase().trim();refreshGlyphs();}
});
root.addEventListener('change',e=>{
 const el=e.target.closest('[data-guess-slot]');
 if(!el||state?.phase!=='guess'||state.author===me?.id||answerSending||state.answered.includes(me?.id))return;
 const slot=Number(el.dataset.guessSlot);
 draftAnswer[slot]=el.value===''?null:Number(el.value);
 if(slot===3&&state.semanticVersion!==4){
  const place=document.querySelector('[data-guess-slot="4"]');
  if(place){
   const selected=draftAnswer[4],words=guessWords(4,draftAnswer);
   place.innerHTML='<option value="">— оставить пустым —</option>'+
    words.map((word,i)=>'<option value="'+i+'" '+(selected===i?'selected':'')+'>'+esc(word)+'</option>').join('');
  }
 }
 updateGuessDraft();playTone(510);
});
root.addEventListener('pointerdown',e=>{
 if(state?.phase!=='compose'||state.author!==me?.id)return;
 const stamp=e.target.closest('[data-stamp]');
 const stage=e.target.closest('#liveStage');
 if(!stamp||!stage)return;
 const index=Number(stamp.dataset.stamp);
 if(!draft[index])return;
 e.preventDefault();selected=index;remember();
 const box=stage.getBoundingClientRect();
 drag={pointer:e.pointerId,stage,box,index,changed:false};
 try{stage.setPointerCapture(e.pointerId);}catch{}
 paintBoard();
});
root.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.pointer)return;
 e.preventDefault();
 const g=draft[drag.index];if(!g)return;
 const x=Math.max(4,Math.min(96,100*(e.clientX-drag.box.left)/drag.box.width));
 const y=Math.max(5,Math.min(95,100*(e.clientY-drag.box.top)/drag.box.height));
 if(Math.hypot(x-g.x,y-g.y)<.15)return;
 g.x=Math.round(x*10)/10;g.y=Math.round(y*10)/10;drag.changed=true;
 paintBoard();queueBoard();
});
function finishDrag(e){
 if(!drag||e.pointerId!==drag.pointer)return;
 try{drag.stage.releasePointerCapture(drag.pointer);}catch{}
 if(!drag.changed)undo.pop();
 drag=null;paintBoard();if(state?.phase==='compose')flushBoard();
}
root.addEventListener('pointerup',finishDrag);
root.addEventListener('pointercancel',finishDrag);
window.addEventListener('pagehide',()=>{activeToken=null;clearTimeout(pendingSend);});
window.addEventListener('focus',async()=>{if(state)return;await loadProfile();render();});
setInterval(()=>{
 if(state?.deadline)updateClock();
 if(connected&&net&&state&&!['lobby','results'].includes(state.phase))try{net.sendGame({type:'pulse'});}catch{}
},1900);
setInterval(updateClock,350);
render();
(async()=>{await loadProfile();render();await checkHealth();})();
