import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {tabGuestName,rememberTabName,prepareTabGuest,markTabGuest,clearTabGuest} from './tab-guests.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,artworkURL,artworkFallbackURL,primeGallery} from './artworks.js';
import {Editor,renderArtwork} from './editor.js';
installMobileRuntime();
createWorkshopMode({appName:'ЗАМАЗКА',version:'1.7.1',cachePrefix: 'zamazka-',storageNamespace: 'pocket-works:zamazka',onReset(){try{const server=localStorage.getItem('pocket-works:zamazka:server');if(server)sessionStorage.removeItem('pocket-net:'+server)}catch{}for(const storage of [localStorage,sessionStorage])try{for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith('pocket-works:zamazka:'))storage.removeItem(key)}}catch{}location.reload()}});
const screen=document.querySelector('#screen'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
const NS='pocket-works:zamazka:',SERVER_KEY=NS+'server',GALLERY_KEY=NS+'gallery',PRACTICE_KEY=NS+'practice';
const DEFAULT_SERVER=location.origin+'/pocketnet';
const q=new URLSearchParams(location.search);
if(q.get('server')&&/^https?:\/\//.test(q.get('server')))localStorage.setItem(SERVER_KEY,q.get('server'));
else {
  // The old setup pointed users to a temporary Cloudflare Tunnel or local Windows host.
  // Move those obsolete default addresses to the bundled Durable Objects endpoint.
  const previous=localStorage.getItem(SERVER_KEY);
  try {
    const url=new URL(previous);
    if(url.hostname.endsWith('.trycloudflare.com')||['localhost','127.0.0.1'].includes(url.hostname))
      localStorage.setItem(SERVER_KEY,DEFAULT_SERVER);
  } catch { /* First-time visitor: DEFAULT_SERVER is used without storing anything. */ }
}
let page='home',net=null,me=null,view=null,roomId='',editor=null,practice=null,choice=null,chips=[0,0,0,0,0],chipTarget='',connectionEpoch=0,beepEnabled=localStorage.getItem(NS+'sound')!=='off',lastPulse=0,lastUiKey='';
let saved=(()=>{try{const a=JSON.parse(localStorage.getItem(GALLERY_KEY)||'[]');return Array.isArray(a)?a.slice(0,24).map(g=>({...g,art:g.edition===3?g.art:g.edition===2?(g.art>=8?g.art+46:g.art):Number(g.art)+REAL_COUNT,edition:3})):[]}catch{return[]}})();

// Retry a smaller Wikimedia thumbnail when the original master is too small.
document.addEventListener('error',e=>{
 const image=e.target;
 if(!(image instanceof HTMLImageElement)||!image.dataset.artId)return;
 const id=Number(image.dataset.artId);
 const fallback=artworkFallbackURL(id,image.currentSrc||image.src);
 if(fallback&&fallback!==image.src){image.src=fallback;return}
 image.alt=ARTS[id]?.title+' · изображение временно недоступно';
},true);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sound(f=560){if(!beepEnabled)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ac=window.__zamazkaAudio||(window.__zamazkaAudio=new Audio());if(ac.state==='suspended')ac.resume();const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(f,ac.currentTime);o.frequency.exponentialRampToValueAtTime(f*.83,ac.currentTime+.09);g.gain.setValueAtTime(.025,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.11);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.12)}catch{}}
let toastTimer;function notify(t){toast.textContent=t;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}
function closeDialog(){dialog.classList.add('hidden');dialog.innerHTML=''}
function modal(title,body,buttons){dialog.classList.remove('hidden');dialog.innerHTML='<div class="dialog-box"><h2>'+title+'</h2>'+body+'<div class="stack" id="modalActions"></div></div>';const actionBox=dialog.querySelector('#modalActions');buttons.forEach(([label,fn,cls])=>{const b=document.createElement('button');b.className='btn '+(cls||'');b.textContent=label;b.addEventListener('click',()=>{sound();fn()});actionBox.append(b)})}
function stopEditor(){if(editor){editor.dispose();editor=null}}
function change(html,which){if(page!==which)closeDialog();stopEditor();page=which;lastUiKey='';screen.innerHTML=html;screen.scrollTop=0}
const head=(phase,title,until)=>'<div class="phase-head"><div><div class="eyebrow">'+esc(phase)+'</div><h2>'+esc(title)+'</h2></div><div class="timer" id="clock">'+(until?'…':'')+'</div></div>';
const picture=id=>'<div class="frame"><img src="'+artworkURL(id)+'" alt="'+esc(ARTS[id].title)+'"></div>';
function home(){
 connectionEpoch++;
 clearTabGuest();
 if(net){try{net.leaveRoom()}catch{}net.close();net=null}
 view=null;roomId='';practice=null;
 change('<section class="museum-home">'+
  '<div class="museum-kicker"><span>ATELIER · № 001</span><span>БЮРО РЕСТАВРАЦИИ</span></div>'+
  '<div class="museum-headline"><div class="museum-smalltitle">Игра для тех, кто видит детали</div><h1>Искусство<br><em>подделки.</em></h1><p>Подлинные шедевры. Утраченные фрагменты.<br>Одна очень убедительная ложь.</p></div>'+
  '<div class="museum-display">'+
    '<div class="museum-echo museum-echo-left"><img data-art-id="3" src="'+artworkURL(3)+'" alt=""></div>'+
    '<figure class="museum-centerpiece"><div class="museum-gilded"><img data-art-id="0" src="'+artworkURL(0)+'" alt="Ян Вермеер — Девушка с жемчужной серёжкой"><span class="museum-ribbon">НАСТОЯЩИЕ ПРОИЗВЕДЕНИЯ</span></div><figcaption><strong>Ян Вермеер</strong><span>Девушка с жемчужной серёжкой, ок. 1665</span></figcaption></figure>'+
    '<div class="museum-echo museum-echo-right"><img data-art-id="1" src="'+artworkURL(1)+'" alt=""></div>'+
    '<span class="museum-exhibit-number">I / LIV</span>'+
  '</div>'+
  '<div class="museum-control">'+
    '<button class="start-restoration" id="primary-action" data-action="practice" disabled><span class="start-emblem" aria-hidden="true">✳</span><span><strong>Загружаем оригиналы…</strong><small>Готовим музейную экспозицию</small></span><span class="start-arrow" aria-hidden="true">↗</span></button>'+
    '<div class="museum-lower"><button data-action="create"><span>＋</span> Создать комнату</button><button data-action="join"><span>↗</span> По приглашению</button></div>'+
    '<div class="museum-footer"><button data-action="collection">МОЙ АРХИВ <span>'+String(saved.length).padStart(2,'0')+'</span></button>'+
    (localStorage.getItem(PRACTICE_KEY)?'<button data-action="resume">ПРОДОЛЖИТЬ ЧЕРНОВИК ↗</button>':'<span>54 ПОЛОТНА · 2–8 ИГРОКОВ</span>')+'</div>'+
  '</div></section>','home');
 primeGallery().then(results=>{
   if(page!=='home')return;
   const primary=screen.querySelector('#primary-action');
   if(!primary)return;
   const ready=results.every(r=>r.status==='fulfilled');
   primary.disabled=!ready;
   primary.querySelector('strong').textContent=ready?'Начать реставрацию':'Оригиналы пока недоступны';
   primary.querySelector('small').textContent=ready?'Один пробный раунд · без регистрации':'Нужен интернет для первой загрузки';
   if(!ready){
     const foot=screen.querySelector('.museum-footer');
     const retry=document.createElement('button');retry.dataset.action='retry-gallery';retry.textContent='ПОВТОРИТЬ ЗАГРУЗКУ ↗';foot?.append(retry);
   }
 });
}
function setup(mode){change('<section class="page"><div class="section-label">ПРИЁМНАЯ / '+(mode==='create'?'НОВАЯ КОМНАТА':'ПРИСОЕДИНЕНИЕ')+'</div><h2>'+(mode==='create'?'Открыть выставку':'Найти выставку')+'</h2><label class="field" for="who">Имя реставратора</label><input class="input" id="who" maxlength="22" autocomplete="nickname" value="'+esc(tabGuestName())+'"><label class="field" for="address">Адрес PocketNet</label><input class="input" id="address" type="url" inputmode="url" placeholder="https://ваш-игровой-сервер" value="'+esc(localStorage.getItem(SERVER_KEY)||DEFAULT_SERVER)+'"><p class="hint">Онлайн-комнаты работают на Cloudflare PocketNet без запуска сервера на компьютере. Адрес выбран автоматически; для самостоятельного сервера его можно изменить.</p>'+(mode==='join'?'<label class="field" for="room">Ссылка или идентификатор комнаты</label><input class="input" id="room" placeholder="UUID комнаты" value="'+esc(q.get('room')||'')+'">':'')+'<div class="subtle-rule"></div><div class="stack"><button class="btn primary" data-action="connect" data-mode="'+mode+'">'+(mode==='create'?'Создать комнату':'Присоединиться')+'</button><button class="btn ghost" data-action="menu">Назад</button></div></section>','setup')}
function lobby(){
 if(!view)return;
 const players=view.participants||[],leader=view.host===me?.id;
 change('<section class="page"><div class="section-label">ЧАСТНАЯ ЭКСПОЗИЦИЯ</div><h2>Комната готова</h2><p class="hint">Поделись приглашением. Можно играть вдвоём; дополнительные участники присоединятся до начала партии.</p><div class="room-ticket"><div class="section-label">КОД ПРИГЛАШЕНИЯ</div><div class="code">'+esc(roomId)+'</div><button class="btn ghost" data-action="share">Скопировать ссылку</button></div><div class="section-label">ГОСТИ · '+players.length+'/8</div><div class="players">'+players.map(p=>'<div class="player"><div class="seal">'+esc(p.name.slice(0,1).toUpperCase())+'</div><div class="player-name">'+esc(p.name)+'</div><span class="status">'+(p.id===view.host?'Куратор':'Реставратор')+'</span></div>').join('')+'</div><div class="stack">'+(leader?'<label class="field" for="rounds">Раундов</label><select class="input" id="rounds"><option value="3">3 раунда</option><option value="1">1 раунд</option><option value="5">5 раундов</option></select><button class="btn primary" data-action="start" '+(players.length<2?'disabled':'')+'>Открыть экспозицию</button>':'<div class="notice">Ожидаем, пока куратор начнёт выставку.</div>')+'<button class="btn ghost" data-action="leave">Покинуть комнату</button></div></section>','lobby')
}
function galleryHtml(list,select=false){return '<div class="gallery exhibition-grid">'+list.map((id,i)=>'<button class="picture'+(choice===id&&select?' selected':'')+'" data-'+(select?'choice':'inspect')+'="'+id+'"><span class="picture-image"><img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Картина')+'" loading="eager"></span><span class="picture-index">ОБЪЕКТ '+String(i+1).padStart(2,'0')+'</span><span class="caption">'+esc(ARTS[id]?.title||'Картина')+'</span><span class="style">'+esc(ARTS[id]?.artist||ARTS[id]?.style)+' · '+esc(ARTS[id]?.date||'')+'</span></button>').join('')+'</div>'}
function preview(local=false){
 const v=local?practice:view;
 change('<section class="phase-page">'+head('РАУНД '+v.round+' / '+(v.rounds||1),'Запомни оригиналы',v.deadline)+'<div class="phase-body"><div class="notice">Пять настоящих произведений. Запомни их детали: повреждение появится в случайном месте и каждый раз будет другой формы.</div>'+galleryHtml(v.selected)+'<p class="hint">Оригиналы исчезнут после начала реставрации. Все работы — настоящие музейные произведения.</p>'+(local?'<button class="btn primary wide" data-action="skip">Перейти к реставрации</button>':'')+'</div></section>','preview');
}
function toolbar(){return '<div class="tools">'+[['brush','◉','Кисть'],['picker','◈','Пипетка'],['erase','⌫','Ластик'],['hand','✥','Панорама']].map(([id,icon,label])=>'<button class="tool'+(id==='brush'?' active':'')+'" data-tool="'+id+'" aria-label="'+label+'"><strong>'+icon+'</strong><span>'+label+'</span></button>').join('')+'</div><div class="colors">'+['#304a43','#9d4c3c','#d6ae6f','#f1e4c5','#263d57','#637f68'].map((c,i)=>'<button class="swatch'+(i===0?' active':'')+'" data-color="'+c+'" aria-label="Цвет '+(i+1)+'" style="background:'+c+'"></button>').join('')+'<input type="color" class="color-input" id="customColor" value="#304a43" aria-label="Другой цвет"></div><div class="adjust"><label for="brushSize">Размер</label><input type="range" id="brushSize" min="1" max="48" value="12"><button class="tool" data-cmd="undo" aria-label="Отменить">↶</button><button class="tool" data-cmd="redo" aria-label="Вернуть">↷</button><button class="tool" data-cmd="out" aria-label="Отдалить">−</button><button class="tool" data-cmd="in" aria-label="Приблизить">+</button><button class="tool" data-cmd="center" aria-label="К повреждению">◎</button></div>'}
function drawing(local=false){
 const v=local?practice:view,ass=local?v.mine:v.mine;
 if(!ass){change('<section class="phase-page">'+head('ЭКСПОЗИЦИЯ','Матч уже идёт',v.deadline)+'<div class="phase-body"><div class="notice">Ты подключился после начала. Доступ к реставрации откроется в новой комнате после завершения матча.</div><button class="btn ghost wide" data-action="leave">Выйти из комнаты</button></div></section>','waiting');return}
 if(!local&&v.done?.includes(me?.id)){change('<section class="phase-page">'+head('РАУНД '+v.round,'Работа принята',v.deadline)+'<div class="phase-body"><div class="notice">Твоя реставрация сохранена. Ждём остальные работы: <strong id="readyCount">'+v.done.length+'/'+v.participants.length+'</strong>.</div><p class="hint">Ожидай остальных реставраторов. Результаты откроются после экспертизы.</p></div></section>','waiting');return}
 change('<section class="restore"><div class="rest-head">'+head('РАУНД '+v.round+' · РЕСТАВРАЦИЯ',ARTS[ass.art].title,v.deadline)+'</div><div class="work-area"><div class="work-stage"><div class="viewport" data-gesture-surface><canvas id="paintCanvas" width="600" height="450" aria-label="Холст для дорисовывания"></canvas></div></div><div class="work-tip">02 / РЕСТАВРАЦИЯ　·　Кисть внутри пробела · СКМ/Space — перемещение · колесо — масштаб</div></div><div class="work-tools">'+toolbar()+'<div class="work-foot"><div class="quiet" id="strokeCount">Мазков: 0 / 72</div><button class="btn primary" data-action="submit">Сдать работу</button></div></div></section>','drawing');
 editor=new Editor(screen,{id:ass.art,variation:ass.variation,round:v.round,onChange:n=>{const t=document.querySelector('#strokeCount');if(t)t.textContent=n<0?'Лимит мазков, используй отмену':'Мазков: '+n+' / 72'}});
 const counter=document.querySelector('#strokeCount');if(counter)counter.textContent='Мазков: '+editor.strokes.length+' / 72';
}
function chipDots(count){return '<span class="chip-dots">'+Array.from({length:count},()=>'<i class="chip-dot" aria-hidden="true"></i>').join('')+'</span>'}
function updateChips(){
 const total=chips.reduce((a,b)=>a+b,0);
 screen.querySelectorAll('[data-chip-count]').forEach(el=>{el.textContent=chips[Number(el.dataset.chipCount)]});
 screen.querySelectorAll('[data-chipadd]').forEach(el=>{el.disabled=total>=3});
 screen.querySelectorAll('[data-chipsub]').forEach(el=>{el.disabled=chips[Number(el.dataset.chipsub)]===0});
 screen.querySelectorAll('[data-stake-card]').forEach(el=>{const i=Number(el.dataset.stakeCard),n=chips[i];el.classList.toggle('has-chips',n>0);el.querySelector('[data-chip-pips]').innerHTML=chipDots(n)});
 const remain=screen.querySelector('#chipsRemaining');if(remain)remain.innerHTML=chipDots(3-total)+'<strong>'+(3-total)+'</strong> свободно';
 const button=screen.querySelector('[data-action="vote"]');if(button)button.disabled=total!==3;
}
function vote(){
 const v=view,target=v.author,isOwn=target?.id===me?.id,already=(v.voted||[]).includes(me?.id);
 const sessionKey=v.round+':'+v.turn;
 if(chipTarget!==sessionKey){chipTarget=sessionKey;chips=[0,0,0,0,0]}
 const count=(v.voted||[]).length,expected=v.participants.length-1;
 change('<section class="phase-page expert-phase">'+head('ЭКСПЕРТИЗА · '+(v.turn+1)+' / '+v.participants.length,'Суд реставраторов',v.deadline)+
 '<div class="phase-body expert-layout"><div class="expert-focus"><span class="step-stamp">I. ПОДОЗРИТЕЛЬНЫЙ ЭКСПОНАТ</span><h3>'+esc(target?.name||'Неизвестный реставратор')+'</h3><p class="hint">Перед тобой восстановленная картина. Найди среди оригиналов ту, с которой она была создана.</p><div class="expert-focus-frame"><canvas id="examinedCanvas" aria-label="Восстановленная картина"></canvas></div><p class="expert-observers">Получено заключений: <strong id="votesReady">'+count+' / '+expected+'</strong></p></div>'+
 '<div class="expert-ballot"><span class="step-stamp">II. МУЗЕЙНЫЙ КАТАЛОГ</span><h3>Куда поставить фишки?</h3><p class="hint">'+(isOwn?'Это твоя работа. Остальные раздают свои три фишки.':already?'Твои фишки приняты. Ждём остальных реставраторов.':'Раздай ровно три фишки между любыми оригиналами. Каждая правильная приносит очки.')+'</p>'+
 '<div class="stake-gallery">'+v.selected.map((id,i)=>'<div class="stake-card" data-stake-card="'+i+'"><div class="stake-frame"><img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Полотно')+'" loading="eager"><span class="stake-number">'+String(i+1).padStart(2,'0')+'</span></div><div class="stake-details"><strong>'+esc(ARTS[id]?.title||'Картина')+'</strong><small>'+esc(ARTS[id]?.artist||'')+'</small></div>'+(!isOwn&&!already?'<div class="stake-actions"><button data-chipsub="'+i+'" aria-label="Убрать фишку с картины '+(i+1)+'">−</button><div class="stake-amount"><strong data-chip-count="'+i+'">0</strong><span data-chip-pips></span></div><button data-chipadd="'+i+'" aria-label="Поставить фишку на картину '+(i+1)+'">＋</button></div>':'<span class="stake-locked">№ '+(i+1)+'</span>')+'</div>').join('')+'</div>'+
 (!isOwn&&!already?'<div class="stake-tray"><div id="chipsRemaining">'+chipDots(3)+'<strong>3</strong> свободно</div><button class="btn primary" data-action="vote" disabled>Подтвердить три фишки</button></div>':'<div class="stake-wait"><span class="busy"></span> Судейская коллегия рассматривает работу…</div>')+
 '</div></div></section>','vote');
 const targetCanvas=screen.querySelector('#examinedCanvas');
 if(v.candidate&&targetCanvas)renderArtwork(targetCanvas,v.candidate.art,v.candidate.variation,v.candidate.strokes||[],true);
 if(!isOwn&&!already)updateChips();
}
function verdict(){
 const v=view,g=v.gallery?.[v.turn];if(!g)return;
 const people=v.participants||[];
 const ballotTotals=v.selected.map((id,i)=>Object.values(g.votes||{}).reduce((n,bet)=>n+(Array.isArray(bet)?bet[i]||0:0),0));
 const stakeNames=(index)=>people.filter(p=>p.id!==g.id).flatMap(p=>Array.from({length:Array.isArray(g.votes?.[p.id])?(g.votes[p.id][index]||0):0},()=>p.name));
 change('<section class="phase-page verdict-phase">'+head('ПРОТОКОЛ ГОЛОСОВАНИЯ · '+(v.turn+1)+' / '+people.length,'Фишки уже на столе',v.deadline)+
 '<div class="phase-body"><div class="verdict-intro"><span class="step-stamp">I. ОТКРЫТИЕ БЮЛЛЕТЕНЕЙ</span><h3>'+esc(g.name)+' — реставратор под следствием</h3><p>Ставки всех участников раскрыты. Но какой из пяти подлинников правильный, станет известно лишь через мгновение.</p></div>'+
 '<div class="verdict-gallery">'+v.selected.map((id,i)=>'<div class="verdict-card"><div class="verdict-image"><img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Картина')+'"><span>№ '+(i+1)+'</span></div><strong>'+esc(ARTS[id]?.title||'Картина')+'</strong><div class="verdict-tokens">'+chipDots(ballotTotals[i])+'<em>'+ballotTotals[i]+' фиш.</em></div><small>'+esc(stakeNames(i).join(' · ')||'Без ставок')+'</small></div>').join('')+'</div>'+
 '<div class="verdict-footer"><span>Следующий этап — сравнение с подлинником</span>'+(me?.id===v.host?'<button class="btn ghost" data-action="advance">Раскрыть сейчас ↗</button>':'<span class="busy"></span>')+'</div></div></section>','verdict');
}
function reveal(local=false){
 const v=local?practice:view,index=local?0:v.turn;
 const g=local?{name:'Твоя реставрация',...v.mine,strokes:v.strokes,votes:{}}:v.gallery?.[index];
 if(!g)return;
 const idIndex=local?-1:v.selected.indexOf(g.art),others=Math.max(1,(v.participants?.length||2)-1);
 const breakdown=local?[]:v.participants.filter(p=>p.id!==g.id).map(p=>{
  const ballot=g.votes?.[p.id],correct=Array.isArray(ballot)?ballot[idIndex]||0:0;
  const total=Array.isArray(ballot)?ballot.reduce((a,b)=>a+b,0):0;
  return {name:p.name,correct,wrong:total-correct,points:Math.round(correct*100/others)};
 });
 const wrong=breakdown.reduce((n,x)=>n+x.wrong,0);
 const bonus=Math.round(wrong*50/others);
 change('<section class="phase-page reveal-phase">'+head(local?'УЧЕБНАЯ РЕСТАВРАЦИЯ · ГОТОВО':'РАЗОБЛАЧЕНИЕ · '+(index+1)+' / '+v.participants.length,'Подлинник найден',local?0:v.deadline)+
 '<div class="phase-body reveal-layout"><div class="reveal-main"><span class="step-stamp">II. СНЯТИЕ ПОДДЕЛКИ</span><h3>'+esc(g.name)+'</h3><p class="hint">Подлинник: <strong>'+esc(ARTS[g.art].title)+'</strong> · '+esc(ARTS[g.art].artist)+'</p>'+
 '<div class="unveil-frame" id="unveilStage" style="--split:100%"><canvas id="restCanvas" class="unveil-bottom" aria-label="Реставрация"></canvas><canvas id="origCanvas" class="unveil-top" aria-label="Подлинник"></canvas><span class="unveil-label left">РЕСТАВРАЦИЯ</span><span class="unveil-label right">ОРИГИНАЛ</span><div class="unveil-ruler"></div></div>'+
 '<label class="unveil-control" for="unveilRange">Сравнение: двигай разделитель <input id="unveilRange" type="range" min="0" max="100" value="100" aria-label="Показать фрагмент оригинала"></label>'+
 (g.source?'<p class="hint">'+esc(g.source)+'</p>':'')+'</div>'+
 '<div class="reveal-brief"><span class="step-stamp">III. ПРОТОКОЛ ЭКСПЕРТИЗЫ</span>'+
 (local?'<h3>Личная реставрация</h3><p>Сдвигай разделитель и сравни свою работу с настоящим изображением.</p>':
 '<div class="outcome-head"><span>ПРАВИЛЬНЫЙ ОТВЕТ</span><h3>Полотно № '+(idIndex+1)+'</h3><strong>'+esc(ARTS[g.art].title)+'</strong></div>'+
 '<div class="audit-lines">'+breakdown.map(x=>'<div class="audit-line"><span>'+esc(x.name)+'</span><span class="audit-chips">'+chipDots(x.correct)+'<small>'+x.correct+' верно · '+x.wrong+' мимо</small></span><strong>+'+x.points+'</strong></div>').join('')+'</div>'+
 '<div class="outcome-bonus"><span>Реставратору за '+wrong+' ошибочных фишек</span><strong>+'+bonus+' очк.</strong></div>')+
 '<p class="hint">За точную фишку — 100 очков в партии на двоих. Для большой компании очки нормируются по числу судей, чтобы партии оставались честными.</p>'+
 (local?'<div class="stack"><button class="btn primary" data-action="practice">Новая реставрация</button><button class="btn ghost" data-action="collection">Моя галерея</button><button class="btn ghost" data-action="menu">В главное меню</button></div>':(me?.id===v.host?'<button class="btn primary" data-action="advance">Следующий экспонат ↗</button>':'<div class="stake-wait">Ожидаем следующий экспонат…</div>'))+
 '</div></div></section>','reveal');
 const source=screen.querySelector('#restCanvas'),original=screen.querySelector('#origCanvas'),stage=screen.querySelector('#unveilStage');
 Promise.all([renderArtwork(original,g.art,0,null,false),renderArtwork(source,g.art,g.variation,g.strokes||[],true)]).then(()=>{
  if(stage?.isConnected){requestAnimationFrame(()=>{if(stage.isConnected)stage.style.setProperty('--split','50%')});const range=screen.querySelector('#unveilRange');if(range)range.value='50';}
 });
}
function results(){
 const rank=[...view.participants].sort((a,b)=>(view.scores[b.id].mask+view.scores[b.id].eye)-(view.scores[a.id].mask+view.scores[a.id].eye));
 change('<section class="page"><div class="section-label">ИТОГИ ВЫСТАВКИ</div><h2>Каталог разоблачений</h2><div class="notice">Обман и наблюдательность оцениваются отдельно. Побеждает самая высокая сумма.</div>'+rank.map((p,i)=>'<div class="result-item"><div class="result-rank"><div><span class="section-label">№ '+(i+1)+'</span><h3>'+esc(p.name)+'</h3></div><div class="points">'+(view.scores[p.id].mask+view.scores[p.id].eye)+' очк.</div></div><div class="quiet">Маскировка '+view.scores[p.id].mask+' · Экспертиза '+view.scores[p.id].eye+'</div></div>').join('')+'<div class="stack" style="margin-top:20px">'+(me?.id===view.host?'<button class="btn primary" data-action="next">Новый матч с этой компанией</button>':'<div class="hint">Создатель комнаты может начать следующий матч.</div>')+'<button class="btn ghost" data-action="leave">Выйти из комнаты</button></div></section>','results')
}
function collection(){
 change('<section class="page"><div class="section-label">ЛИЧНЫЙ ФОНД</div><h2>Мои реставрации</h2>'+(saved.length?'<div class="gallery">'+saved.map((g,i)=>'<button class="picture" data-saved="'+i+'"><canvas data-saved-canvas="'+i+'"></canvas><span class="caption">'+esc(ARTS[g.art]?.title||'Работа')+'</span><span class="style">'+new Date(g.time).toLocaleDateString('ru-RU')+'</span></button>').join('')+'</div>':'<div class="notice">Фонд пуст. Сделай первую реставрацию в тренировке, и она появится здесь.</div>')+'<div class="subtle-rule"></div><button class="btn ghost wide" data-action="menu">В главное меню</button></section>','collection');
 screen.querySelectorAll('[data-saved-canvas]').forEach(c=>{const g=saved[Number(c.dataset.savedCanvas)];renderArtwork(c,g.art,g.variation,g.strokes,true)});
}
function saveArtwork(art,variation,strokes){saved=[{art,variation,strokes,time:Date.now(),edition:3},...saved].slice(0,24);try{localStorage.setItem(GALLERY_KEY,JSON.stringify(saved))}catch{}}
function persistPractice(){if(practice)try{localStorage.setItem(PRACTICE_KEY,JSON.stringify({phase:practice.phase,round:practice.round,rounds:practice.rounds,selected:practice.selected,deadline:practice.deadline,mine:practice.mine,strokes:practice.strokes,edition:3}))}catch{}}
function newPractice(){const order=[...PLAYABLE_IDS];for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}const selected=order.slice(0,5);practice={phase:'preview',round:1,rounds:1,selected,deadline:Date.now()+25000,mine:{art:selected[Math.floor(Math.random()*5)],variation:Math.floor(Math.random()*0xffffffff)},strokes:[]};persistPractice();preview(true)}
function resumePractice(){try{const p=JSON.parse(localStorage.getItem(PRACTICE_KEY)||'null');if(!p||!Array.isArray(p.selected)||!ARTS[p.mine?.art]||!['preview','drawing'].includes(p.phase))throw Error('missing');if(p.edition===2){p.mine.art=p.mine.art>=8?p.mine.art+46:p.mine.art;p.selected=p.selected.map(i=>i>=8?i+46:i)}else if(p.edition!==3){p.mine.art+=REAL_COUNT;p.selected=p.selected.map(i=>i+REAL_COUNT)}practice=p;if(p.deadline<Date.now())practice.deadline=Date.now()+30000;if(p.phase==='drawing')drawing(true);else preview(true)}catch{newPractice()}}
function practiceStep(){if(!practice)return;if(practice.phase==='preview'){practice.phase='drawing';practice.deadline=Date.now()+105000;persistPractice();drawing(true)}else if(practice.phase==='drawing')finishPractice()}
function finishPractice(){if(!practice||practice.phase!=='drawing')return;practice.strokes=editor?editor.getData():[];saveArtwork(practice.mine.art,practice.mine.variation,practice.strokes);editor?.clearDraft();practice.phase='reveal';practice.deadline=0;localStorage.removeItem(PRACTICE_KEY);reveal(true)}
function renderView(){
 if(!view)return;
 const key=view.phase+':'+view.round+':'+view.turn+':'+(view.done||[]).includes(me?.id)+':'+(view.voted||[]).includes(me?.id);
 if(page==='drawing'&&view.phase==='drawing'&&key===lastUiKey)return;
 if(page==='vote'&&view.phase==='voting'&&key===lastUiKey){
  const ready=screen.querySelector('#votesReady');if(ready)ready.textContent=(view.voted||[]).length+' / '+(view.participants.length-1);
  return;
 }
 lastUiKey=key;choice=null;
 if(view.phase==='lobby')lobby();
 else if(view.phase==='preview')preview();
 else if(view.phase==='drawing')drawing();
 else if(view.phase==='voting')vote();
 else if(view.phase==='verdict')verdict();
 else if(view.phase==='reveal')reveal();
 else if(view.phase==='results')results();
 lastUiKey=key;
}
async function connect(mode){
 const name=(screen.querySelector('#who')?.value||'').trim(),address=(screen.querySelector('#address')?.value||'').trim();
 if(!name||name.length>22){notify('Укажи имя до 22 символов');return}
 let u;try{u=new URL(address);if(!['https:','http:'].includes(u.protocol)||u.protocol==='http:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('HTTPS required')}catch{notify('Нужен корректный HTTPS-адрес PocketNet-сервера');return}
 let room='';
 if(mode==='join'){const raw=(screen.querySelector('#room')?.value||'').trim();room=raw.includes('?')?(new URL(raw,location.href).searchParams.get('room')||''):raw;
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(room)){notify('Вставь ссылку или идентификатор комнаты');return}}
 // Older self-hosted servers may still run the three-player rule even after
 // the browser app updates. Verify the live server before entering the lobby.
 try{
  const endpoint=u.origin+(u.pathname.replace(/\/$/,'')==='/pocketnet'?'/pocketnet':'');
  const response=await fetch(endpoint+'/health',{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(response.ok){
   const health=await response.json();
   if(health?.gameId==='zamazka'&&(Number(health.minPlayers)!==2||Number(health.rulesVersion||0)<2)){
    modal('Сервер использует старые правила','<p class="hint">Этот сервер ещё не поддерживает новые правила фишек и повреждений. Закрой окно старого сервера на Windows, заново запусти <strong>INSTALL-AND-START.bat</strong>, скопируй новый HTTPS-адрес и создай новую комнату.</p><p class="hint">Для версии 1.7 нужен обновлённый сервер с rulesVersion 2.</p>',[['Понятно',closeDialog,'primary']]);
    return;
   }
  }
 }catch{ /* Unreachable servers will report a connection error below. */ }
 localStorage.setItem(SERVER_KEY,endpoint);
 const epoch=++connectionEpoch;
 me=null;view=null;roomId='';
 change('<section class="page center"><h2>Открываем зал</h2><p class="hint"><span class="busy"></span> Подключаемся к игровому серверу…</p><button class="btn ghost wide" data-action="menu">Отменить</button></section>','connecting');
 try{
  // localStorage is deliberately NOT passed to PocketNet: tabs must never share
  // a guest token. Detect copied/duplicated tab sessions before authentication.
  const storage=await prepareTabGuest(endpoint,name);
  if(epoch!==connectionEpoch)return; // User left the connecting screen.
  if(net)net.close();
  const client=new PocketNet({serverUrl:endpoint,name,storage});
  net=client;
  // A deliberate create/join starts without a pending room auto-join.
  client.roomId=null;client.persist();
  client.on('connected',data=>{
    if(client.closed)return;
    me=data.player;
    markTabGuest(endpoint,client.token);
  });
  client.on('room_joined',msg=>{
    if(client.closed)return;
    roomId=msg.roomId;
    client.sendGame({type:'sync'});
    // The lightweight Windows host may deliver onJoin game_event BEFORE
    // room_joined; redraw the lobby now that its invitation code is known.
    if(view)renderView();
    else change('<section class="page center"><h2>Получаем экспозицию</h2><p class="hint"><span class="busy"></span> Загружаем комнату…</p></section>','connecting');
  });
  client.on('game_event',msg=>{
    if(client.closed)return;
    const e=msg.event;
    if(e?.type==='state'){view=e.payload;renderView()}
    else if(e?.type==='notice'){
      const message=String(e.payload||'Не удалось выполнить действие');
      if(/минимум три участника/i.test(message)){
        modal('Нужно обновить сервер','<p class="hint">Этот игровой сервер работает на старых правилах для трёх участников. Останови его, снова запусти актуальный <strong>INSTALL-AND-START.bat</strong> и создай новую комнату.</p>',[['Понятно',closeDialog,'primary']]);
      }else notify(message);
    }
  });
  client.on('presence',data=>{
    if(client.closed)return;
    if(data.disconnected)notify('Один из гостей потерял соединение');
    try{client.sendGame({type:'sync'})}catch{}
  });
  client.on('disconnected',()=>{
    if(!client.closed)notify('Связь прервана. Переподключаемся…');
  });
  client.on('error',error=>{
    if(!client.closed)notify('Сеть: '+(error?.code||error?.message||'ошибка'));
  });
  await client.connect();
  if(epoch!==connectionEpoch){client.close();return}
  if(mode==='create')client.createRoom('zamazka');
  else client.joinRoom(room);
 }catch(e){
  if(epoch!==connectionEpoch)return;
  const cause=e?.message||'нет ответа';
  notify('Не удалось подключиться: '+cause);
  net?.close();net=null;clearTabGuest();setup(mode);
 }
}
function doSubmit(){if(page==='drawing'&&practice){finishPractice();return}
 if(!editor||!net)return;
 const data=editor.getData();modal('Сдать реставрацию?','<p class="hint">После отправки изменять мазки нельзя. Работа будет доступна остальным на экспертизе.</p>',[
 ['Сдать',()=>{closeDialog();const a=view.mine;saveArtwork(a.art,a.variation,data);editor?.clearDraft();try{net.sendGame({type:'submit',strokes:data});notify('Работа отправлена')}catch{notify('Нет подключения — сохранили работу в личном фонде')}} ,'primary'],
 ['Продолжить рисовать',closeDialog,'ghost']]);}
function share(){const link=new URL(location.href);link.searchParams.set('room',roomId);const server=net?.serverUrl||localStorage.getItem(SERVER_KEY);if(server)link.searchParams.set('server',server);const href=link.toString();if(navigator.share){navigator.share({title:'ЗАМАЗКА — приглашение',url:href}).catch(()=>navigator.clipboard?.writeText(href))}else if(navigator.clipboard){navigator.clipboard.writeText(href).then(()=>notify('Приглашение скопировано')).catch(()=>notify(href))}else notify(href)}
function inspect(id){const a=ARTS[id];modal(esc(a.title),'<img class="art-inspection" data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+esc(a.title)+'"><div class="art-metadata">'+esc(a.artist)+' · '+esc(a.date)+'<div>'+esc(a.museum)+'</div></div><p class="hint">Запомни цвета и фактуру оригинала.</p>'+(a.isReal?'<a class="art-source" href="'+esc(a.source)+'" target="_blank" rel="noopener noreferrer">Происхождение изображения ↗</a>':''),[['Закрыть',closeDialog,'primary']])}
function magnify(id){const cand=view?.candidate;modal(esc(ARTS[id].title),'<canvas id="largeCandidate" style="width:100%;aspect-ratio:4/3;display:block;max-height:55vh"></canvas><p class="hint">'+esc(ARTS[id].style)+' · Внимательно изучи мазки и фактуру.</p>',[['Закрыть',closeDialog,'primary']]);renderArtwork(dialog.querySelector('#largeCandidate'),id,cand?.variation||0,cand?.strokes||[],cand?.art===id)}
function settings(){modal('Настройки','<label class="field" for="settingName">Имя</label><input class="input" id="settingName" maxlength="22" value="'+esc(tabGuestName())+'"><label class="field" for="settingServer">Сервер интернет-комнат</label><input class="input" id="settingServer" type="url" value="'+esc(localStorage.getItem(SERVER_KEY)||DEFAULT_SERVER)+'" placeholder="https://"><label class="field"><input type="checkbox" id="settingSound" '+(beepEnabled?'checked':'')+'> Звуки интерфейса</label><p class="hint">Новое имя и адрес применятся при следующем подключении. Каждая вкладка может использовать собственное имя и игровую сессию.</p>',[
 ['Сохранить',()=>{rememberTabName(dialog.querySelector('#settingName').value.trim().slice(0,22)||'Реставратор');localStorage.setItem(SERVER_KEY,dialog.querySelector('#settingServer').value.trim());beepEnabled=dialog.querySelector('#settingSound').checked;localStorage.setItem(NS+'sound',beepEnabled?'on':'off');closeDialog();notify('Настройки сохранены')},'primary'],['Отмена',closeDialog,'ghost']])}
document.querySelector('#settingsBtn').addEventListener('click',settings);
screen.addEventListener('click',e=>{
 const b=e.target.closest('[data-action],[data-inspect],[data-magnify],[data-choice],[data-saved],[data-chipadd],[data-chipsub]');if(!b)return;
 if(b.hasAttribute('data-magnify')){magnify(Number(b.dataset.magnify));return}
 if(b.hasAttribute('data-chipadd')){const i=Number(b.dataset.chipadd);if(chips.reduce((a,b)=>a+b,0)<3){chips[i]++;sound(450);updateChips()}return}
 if(b.hasAttribute('data-chipsub')){const i=Number(b.dataset.chipsub);if(chips[i]>0){chips[i]--;sound(360);updateChips()}return}
 if(b.hasAttribute('data-choice')){choice=Number(b.dataset.choice);screen.querySelectorAll('[data-choice]').forEach(x=>x.closest('.picture')?.classList.toggle('selected',Number(x.dataset.choice)===choice));const v=screen.querySelector('[data-action=vote]');if(v)v.disabled=false;return}
 if(b.hasAttribute('data-inspect')){if(page==='preview'||page==='vote'&&(view?.author?.id===me?.id||(view?.voted||[]).includes(me?.id)))inspect(Number(b.dataset.inspect));return}
 if(b.hasAttribute('data-saved')){const g=saved[Number(b.dataset.saved)];modal('Реставрация из фонда','<div class="compare"><div><img src="'+artworkURL(g.art)+'" style="width:100%" alt=""><small>Подлинник</small></div><div><canvas id="savedFull"></canvas><small>Твоя работа</small></div></div>',[['Закрыть',closeDialog,'primary']]);renderArtwork(dialog.querySelector('#savedFull'),g.art,g.variation,g.strokes,true);return}
 const action=b.dataset.action;sound();
 if(action==='create'||action==='join')setup(action);
 else if(action==='practice')newPractice();
 else if(action==='retry-gallery')home();
 else if(action==='resume')resumePractice();
 else if(action==='collection')collection();
 else if(action==='menu'){if(net||practice&&practice.phase==='drawing'){modal('Покинуть выставку?','<p class="hint">Текущая партия будет покинута. Несданные мазки сохраняются на устройстве.</p>',[['Покинуть',()=>{closeDialog();home()},'primary'],['Остаться',closeDialog,'ghost']])}else home()}
 else if(action==='connect')connect(b.dataset.mode);
 else if(action==='share')share();
 else if(action==='start')net?.sendGame({type:'start',rounds:Number(screen.querySelector('#rounds')?.value||3)});
 else if(action==='leave')modal('Выйти из комнаты?','<p class="hint">Другие реставраторы смогут продолжить без тебя.</p>',[['Выйти',()=>{closeDialog();home()},'primary'],['Отмена',closeDialog,'ghost']]);
 else if(action==='skip')practiceStep();
 else if(action==='submit')doSubmit();
 else if(action==='vote'&&chips.reduce((a,b)=>a+b,0)===3){try{net?.sendGame({type:'vote',chips:[...chips]});b.disabled=true;notify('Три фишки поставлены')}catch{notify('Потеряно соединение')}}
 else if(action==='advance')net?.sendGame({type:'advance'});
 else if(action==='next')net?.sendGame({type:'next'});
});
function tick(){
 if(practice&&['preview','drawing'].includes(practice.phase)&&Date.now()>=practice.deadline)practiceStep();
 const v=practice||view,clock=document.querySelector('#clock');
 if(clock&&v?.deadline){const s=Math.max(0,Math.ceil((v.deadline-Date.now())/1000));clock.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');clock.classList.toggle('urgent',s<=10)}
 if(net&&view&&view.deadline&&Date.now()>view.deadline-2400&&Date.now()-lastPulse>1800){lastPulse=Date.now();try{net.sendGame({type:'pulse'})}catch{}}
}
screen.addEventListener('input',e=>{if(e.target.id==='unveilRange'){const stage=screen.querySelector('#unveilStage');if(stage){stage.style.transition='none';stage.style.setProperty('--split',e.target.value+'%')}}});
setInterval(tick,350);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
if(q.get('room'))setup('join');else home();
// Shared update manager owns service worker registration and activation.
