import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,artworkURL,primeGallery} from './artworks.js';
import {Editor,renderArtwork} from './editor.js';
installMobileRuntime();
createWorkshopMode({appName:'ЗАМАЗКА',version:'1.2.0',cachePrefix: 'zamazka-',storageNamespace: 'pocket-works:zamazka',onReset(){for(const key of Object.keys(localStorage)){if(key.startsWith('pocket-works:zamazka:'))localStorage.removeItem(key)}location.reload()}});
const screen=document.querySelector('#screen'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
const NS='pocket-works:zamazka:',SERVER_KEY=NS+'server',NAME_KEY=NS+'name',GALLERY_KEY=NS+'gallery',PRACTICE_KEY=NS+'practice';
const q=new URLSearchParams(location.search);
if(q.get('server')&&/^https?:\/\//.test(q.get('server')))localStorage.setItem(SERVER_KEY,q.get('server'));
let page='home',net=null,me=null,view=null,roomId='',editor=null,practice=null,choice=null,beepEnabled=localStorage.getItem(NS+'sound')!=='off',lastPulse=0,lastUiKey='';
let saved=(()=>{try{const a=JSON.parse(localStorage.getItem(GALLERY_KEY)||'[]');return Array.isArray(a)?a.slice(0,24).map(g=>({...g,art:g.edition===2?g.art:Number(g.art)+REAL_COUNT,edition:2})):[]}catch{return[]}})();
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
 if(net){try{net.leaveRoom()}catch{}net.close();net=null}
 view=null;roomId='';practice=null;
 change('<section class="museum-home">'+
  '<div class="museum-kicker"><span>ATELIER · № 001</span><span>БЮРО РЕСТАВРАЦИИ</span></div>'+
  '<div class="museum-headline"><div class="museum-smalltitle">Игра для тех, кто видит детали</div><h1>Искусство<br><em>подделки.</em></h1><p>Подлинные шедевры. Утраченные фрагменты.<br>Одна очень убедительная ложь.</p></div>'+
  '<div class="museum-display">'+
    '<div class="museum-echo museum-echo-left"><img src="'+artworkURL(3)+'" alt=""></div>'+
    '<figure class="museum-centerpiece"><div class="museum-gilded"><img src="'+artworkURL(0)+'" alt="Ян Вермеер — Девушка с жемчужной серёжкой"><span class="museum-ribbon">НАСТОЯЩИЕ ПРОИЗВЕДЕНИЯ</span></div><figcaption><strong>Ян Вермеер</strong><span>Девушка с жемчужной серёжкой, ок. 1665</span></figcaption></figure>'+
    '<div class="museum-echo museum-echo-right"><img src="'+artworkURL(1)+'" alt=""></div>'+
    '<span class="museum-exhibit-number">I / VII</span>'+
  '</div>'+
  '<div class="museum-control">'+
    '<button class="start-restoration" id="primary-action" data-action="practice" disabled><span class="start-emblem" aria-hidden="true">✳</span><span><strong>Загружаем оригиналы…</strong><small>Готовим музейную экспозицию</small></span><span class="start-arrow" aria-hidden="true">↗</span></button>'+
    '<div class="museum-lower"><button data-action="create"><span>＋</span> Создать комнату</button><button data-action="join"><span>↗</span> По приглашению</button></div>'+
    '<div class="museum-footer"><button data-action="collection">МОЙ АРХИВ <span>'+String(saved.length).padStart(2,'0')+'</span></button>'+
    (localStorage.getItem(PRACTICE_KEY)?'<button data-action="resume">ПРОДОЛЖИТЬ ЧЕРНОВИК ↗</button>':'<span>7 ПОЛОТЕН · 2–8 ИГРОКОВ</span>')+'</div>'+
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
function setup(mode){change('<section class="page"><div class="section-label">ПРИЁМНАЯ / '+(mode==='create'?'НОВАЯ КОМНАТА':'ПРИСОЕДИНЕНИЕ')+'</div><h2>'+(mode==='create'?'Открыть выставку':'Найти выставку')+'</h2><label class="field" for="who">Имя реставратора</label><input class="input" id="who" maxlength="22" autocomplete="nickname" value="'+esc(localStorage.getItem(NAME_KEY)||'Реставратор')+'"><label class="field" for="address">Адрес PocketNet</label><input class="input" id="address" type="url" inputmode="url" placeholder="https://ваш-игровой-сервер" value="'+esc(localStorage.getItem(SERVER_KEY)||'')+'"><p class="hint">Для онлайна запусти бесплатный сервер на Windows через один BAT-файл. Адрес из окна запуска вставь сюда один раз. <a class="art-source" href="https://github.com/JustSadSock/pocket-works/blob/main/apps/zamazka/server/README-QUICKSTART.md" target="_blank" rel="noopener noreferrer">Инструкция и запуск сервера ↗</a></p>'+(mode==='join'?'<label class="field" for="room">Ссылка или идентификатор комнаты</label><input class="input" id="room" placeholder="UUID комнаты" value="'+esc(q.get('room')||'')+'">':'')+'<div class="subtle-rule"></div><div class="stack"><button class="btn primary" data-action="connect" data-mode="'+mode+'">'+(mode==='create'?'Создать комнату':'Присоединиться')+'</button><button class="btn ghost" data-action="menu">Назад</button></div></section>','setup')}
function lobby(){
 if(!view)return;
 const players=view.participants||[],leader=view.host===me?.id;
 change('<section class="page"><div class="section-label">ЧАСТНАЯ ЭКСПОЗИЦИЯ</div><h2>Комната готова</h2><p class="hint">Поделись приглашением. Можно играть вдвоём; дополнительные участники присоединятся до начала партии.</p><div class="room-ticket"><div class="section-label">КОД ПРИГЛАШЕНИЯ</div><div class="code">'+esc(roomId)+'</div><button class="btn ghost" data-action="share">Скопировать ссылку</button></div><div class="section-label">ГОСТИ · '+players.length+'/8</div><div class="players">'+players.map(p=>'<div class="player"><div class="seal">'+esc(p.name.slice(0,1).toUpperCase())+'</div><div class="player-name">'+esc(p.name)+'</div><span class="status">'+(p.id===view.host?'Куратор':'Реставратор')+'</span></div>').join('')+'</div><div class="stack">'+(leader?'<label class="field" for="rounds">Раундов</label><select class="input" id="rounds"><option value="3">3 раунда</option><option value="1">1 раунд</option><option value="5">5 раундов</option></select><button class="btn primary" data-action="start" '+(players.length<2?'disabled':'')+'>Открыть экспозицию</button>':'<div class="notice">Ожидаем, пока куратор начнёт выставку.</div>')+'<button class="btn ghost" data-action="leave">Покинуть комнату</button></div></section>','lobby')
}
function galleryHtml(list,select=false){return '<div class="gallery exhibition-grid">'+list.map((id,i)=>'<button class="picture'+(choice===id&&select?' selected':'')+'" data-'+(select?'choice':'inspect')+'="'+id+'"><span class="picture-image"><img src="'+artworkURL(id)+'" alt="'+esc(ARTS[id]?.title||'Картина')+'" loading="eager"></span><span class="picture-index">ОБЪЕКТ '+String(i+1).padStart(2,'0')+'</span><span class="caption">'+esc(ARTS[id]?.title||'Картина')+'</span><span class="style">'+esc(ARTS[id]?.artist||ARTS[id]?.style)+' · '+esc(ARTS[id]?.date||'')+'</span></button>').join('')+'</div>'}
function preview(local=false){
 const v=local?practice:view;
 change('<section class="phase-page">'+head('РАУНД '+v.round+' / '+(v.rounds||1),'Запомни оригиналы',v.deadline)+'<div class="phase-body"><div class="notice">Пять произведений. Через несколько секунд одному из них понадобится твоя кисть. Нажми на картину, чтобы рассмотреть её.</div>'+galleryHtml(v.selected)+'<p class="hint">Оригиналы исчезнут после начала реставрации. Все работы — настоящие музейные произведения.</p>'+(local?'<button class="btn primary wide" data-action="skip">Перейти к реставрации</button>':'')+'</div></section>','preview');
}
function toolbar(){return '<div class="tools">'+[['brush','◉','Кисть'],['pencil','╱','Контур'],['spray','✣','Фактура'],['picker','◈','Пипетка'],['erase','⌫','Ластик'],['hand','✥','Панорама']].map(([id,icon,label])=>'<button class="tool'+(id==='brush'?' active':'')+'" data-tool="'+id+'" aria-label="'+label+'"><strong>'+icon+'</strong><span>'+label+'</span></button>').join('')+'</div><div class="colors">'+['#304a43','#9d4c3c','#d6ae6f','#f1e4c5','#263d57','#637f68'].map((c,i)=>'<button class="swatch'+(i===0?' active':'')+'" data-color="'+c+'" aria-label="Цвет '+(i+1)+'" style="background:'+c+'"></button>').join('')+'<input type="color" class="color-input" id="customColor" value="#304a43" aria-label="Другой цвет"></div><div class="adjust"><label for="brushSize">Размер</label><input type="range" id="brushSize" min="1" max="48" value="12"><button class="tool" data-cmd="undo" aria-label="Отменить">↶</button><button class="tool" data-cmd="redo" aria-label="Вернуть">↷</button><button class="tool" data-cmd="out" aria-label="Отдалить">−</button><button class="tool" data-cmd="in" aria-label="Приблизить">+</button><button class="tool" data-cmd="center" aria-label="К повреждению">◎</button></div>'}
function drawing(local=false){
 const v=local?practice:view,ass=local?v.mine:v.mine;
 if(!ass){change('<section class="phase-page">'+head('ЭКСПОЗИЦИЯ','Матч уже идёт',v.deadline)+'<div class="phase-body"><div class="notice">Ты подключился после начала. Доступ к реставрации откроется в новой комнате после завершения матча.</div><button class="btn ghost wide" data-action="leave">Выйти из комнаты</button></div></section>','waiting');return}
 if(!local&&v.done?.includes(me?.id)){change('<section class="phase-page">'+head('РАУНД '+v.round,'Работа принята',v.deadline)+'<div class="phase-body"><div class="notice">Твоя реставрация сохранена. Ждём остальные работы: <strong id="readyCount">'+v.done.length+'/'+v.participants.length+'</strong>.</div><p class="hint">Ожидай остальных реставраторов. Результаты откроются после экспертизы.</p></div></section>','waiting');return}
 change('<section class="restore"><div class="rest-head">'+head('РАУНД '+v.round+' · РЕСТАВРАЦИЯ',ARTS[ass.art].title,v.deadline)+'</div><div class="work-area"><div class="work-stage"><div class="viewport" data-gesture-surface><canvas id="paintCanvas" width="600" height="450" aria-label="Холст для дорисовывания"></canvas></div></div><div class="work-tip">02 / РЕСТАВРАЦИЯ　·　Два пальца — масштаб · кисть — внутри пробела</div></div><div class="work-tools">'+toolbar()+'<div class="work-foot"><div class="quiet" id="strokeCount">Мазков: 0 / 72</div><button class="btn primary" data-action="submit">Сдать работу</button></div></div></section>','drawing');
 editor=new Editor(screen,{id:ass.art,variation:ass.variation,round:v.round,onChange:n=>{const t=document.querySelector('#strokeCount');if(t)t.textContent=n<0?'Лимит мазков, используй отмену':'Мазков: '+n+' / 72'}});
 const counter=document.querySelector('#strokeCount');if(counter)counter.textContent='Мазков: '+editor.strokes.length+' / 72';
}
function vote(){
 const v=view,target=v.author,isOwn=target?.id===me?.id,already=(v.voted||[]).includes(me?.id);
 const names=v.selected||[];
 change('<section class="phase-page">'+head('ЭКСПЕРТИЗА · '+(v.turn+1)+' / '+v.participants.length,'Чья-то рука дрогнула',v.deadline)+'<div class="phase-body"><div class="notice"><strong>'+esc(target?.name||'Неизвестный')+'</strong> дорисовал одну из пяти работ. '+(isOwn?'Твоя работа — теперь судят остальные.':already?'Заключение принято. Ожидаем остальных.':'Какая картина отличается от оригинала?')+'</div><div class="gallery">'+names.map((id,i)=>'<div class="picture'+(choice===id?' selected':'')+'"><canvas data-art-canvas="'+id+'"></canvas><span class="caption">'+(i+1)+' · '+esc(ARTS[id].title)+'</span><span class="style">'+esc(ARTS[id].style)+'</span><div class="choice-row"><button class="mini-action" data-magnify="'+id+'" aria-label="Увеличить картину">Увеличить</button>'+(!isOwn&&!already?'<button class="mini-action accent" data-choice="'+id+'">Выбрать</button>':'')+'</div></div>').join('')+'</div>'+(!isOwn&&!already?'<button class="btn primary wide" data-action="vote" '+(choice===null?'disabled':'')+'>Подтвердить выбор</button>':'<p class="hint center">Следующая экспертиза начнётся автоматически.</p>')+'</div></section>','vote');
 screen.querySelectorAll('[data-art-canvas]').forEach(c=>{const id=Number(c.dataset.artCanvas),cand=v.candidate;renderArtwork(c,id,cand?.variation||0,cand?.strokes||[],cand?.art===id)});
}
function reveal(local=false){
 const v=local?practice:view,index=local?0:v.turn,g=local?{name:'Твоя реставрация',...v.mine,strokes:v.strokes,votes:{}}:v.gallery?.[index];
 if(!g)return;
 const votes=Object.values(g.votes||{}),hits=votes.filter(x=>Number(x)===g.art).length;
 change('<section class="phase-page">'+head(local?'ТРЕНИРОВКА · ГОТОВО':'РАЗОБЛАЧЕНИЕ · '+(index+1)+' / '+v.participants.length,'Подлинник против копии',local?0:v.deadline)+'<div class="phase-body"><h3>'+esc(g.name)+'</h3><p class="hint">'+esc(ARTS[g.art].title)+' · '+esc(ARTS[g.art].style)+'</p><div class="compare"><div><canvas id="origCanvas"></canvas><small>Подлинник</small></div><div><canvas id="restCanvas"></canvas><small>Реставрация</small></div></div><div class="subtle-rule"></div><div class="notice">'+(local?'Сравни мазки с оригиналом. Лучшие работы останутся в личной коллекции.':'Подделку заметили '+hits+' из '+votes.length+' голосующих.')+'</div>'+(local?'<div class="stack" style="margin-top:18px"><button class="btn primary" data-action="practice">Ещё одна работа</button><button class="btn ghost" data-action="collection">Моя галерея</button><button class="btn ghost" data-action="menu">В главное меню</button></div>':'<p class="hint center">Следующее разоблачение начнётся автоматически.</p>')+'</div></section>','reveal');
 renderArtwork(screen.querySelector('#origCanvas'),g.art,0,null,false);
 renderArtwork(screen.querySelector('#restCanvas'),g.art,g.variation,g.strokes||[],true);
}
function results(){
 const rank=[...view.participants].sort((a,b)=>(view.scores[b.id].mask+view.scores[b.id].eye)-(view.scores[a.id].mask+view.scores[a.id].eye));
 change('<section class="page"><div class="section-label">ИТОГИ ВЫСТАВКИ</div><h2>Каталог разоблачений</h2><div class="notice">Обман и наблюдательность оцениваются отдельно. Побеждает самая высокая сумма.</div>'+rank.map((p,i)=>'<div class="result-item"><div class="result-rank"><div><span class="section-label">№ '+(i+1)+'</span><h3>'+esc(p.name)+'</h3></div><div class="points">'+(view.scores[p.id].mask+view.scores[p.id].eye)+' очк.</div></div><div class="quiet">Маскировка '+view.scores[p.id].mask+' · Экспертиза '+view.scores[p.id].eye+'</div></div>').join('')+'<div class="stack" style="margin-top:20px">'+(me?.id===view.host?'<button class="btn primary" data-action="next">Новый матч с этой компанией</button>':'<div class="hint">Создатель комнаты может начать следующий матч.</div>')+'<button class="btn ghost" data-action="leave">Выйти из комнаты</button></div></section>','results')
}
function collection(){
 change('<section class="page"><div class="section-label">ЛИЧНЫЙ ФОНД</div><h2>Мои реставрации</h2>'+(saved.length?'<div class="gallery">'+saved.map((g,i)=>'<button class="picture" data-saved="'+i+'"><canvas data-saved-canvas="'+i+'"></canvas><span class="caption">'+esc(ARTS[g.art]?.title||'Работа')+'</span><span class="style">'+new Date(g.time).toLocaleDateString('ru-RU')+'</span></button>').join('')+'</div>':'<div class="notice">Фонд пуст. Сделай первую реставрацию в тренировке, и она появится здесь.</div>')+'<div class="subtle-rule"></div><button class="btn ghost wide" data-action="menu">В главное меню</button></section>','collection');
 screen.querySelectorAll('[data-saved-canvas]').forEach(c=>{const g=saved[Number(c.dataset.savedCanvas)];renderArtwork(c,g.art,g.variation,g.strokes,true)});
}
function saveArtwork(art,variation,strokes){saved=[{art,variation,strokes,time:Date.now(),edition:2},...saved].slice(0,24);try{localStorage.setItem(GALLERY_KEY,JSON.stringify(saved))}catch{}}
function persistPractice(){if(practice)try{localStorage.setItem(PRACTICE_KEY,JSON.stringify({phase:practice.phase,round:practice.round,rounds:practice.rounds,selected:practice.selected,deadline:practice.deadline,mine:practice.mine,strokes:practice.strokes,edition:2}))}catch{}}
function newPractice(){const selected=[...PLAYABLE_IDS].sort(()=>Math.random()-.5).slice(0,5);practice={phase:'preview',round:1,rounds:1,selected,deadline:Date.now()+25000,mine:{art:selected[0],variation:Math.floor(Math.random()*4)},strokes:[]};persistPractice();preview(true)}
function resumePractice(){try{const p=JSON.parse(localStorage.getItem(PRACTICE_KEY)||'null');if(!p||!Array.isArray(p.selected)||!ARTS[p.mine?.art]||!['preview','drawing'].includes(p.phase))throw Error('missing');if(p.edition!==2){p.mine.art+=REAL_COUNT;p.selected=p.selected.map(i=>i+REAL_COUNT)}practice=p;if(p.deadline<Date.now())practice.deadline=Date.now()+30000;if(p.phase==='drawing')drawing(true);else preview(true)}catch{newPractice()}}
function practiceStep(){if(!practice)return;if(practice.phase==='preview'){practice.phase='drawing';practice.deadline=Date.now()+105000;persistPractice();drawing(true)}else if(practice.phase==='drawing')finishPractice()}
function finishPractice(){if(!practice||practice.phase!=='drawing')return;practice.strokes=editor?editor.getData():[];saveArtwork(practice.mine.art,practice.mine.variation,practice.strokes);editor?.clearDraft();practice.phase='reveal';practice.deadline=0;localStorage.removeItem(PRACTICE_KEY);reveal(true)}
function renderView(){
 if(!view)return;
 const key=view.phase+':'+view.round+':'+view.turn+':'+(view.done||[]).includes(me?.id);
 if(page==='drawing'&&view.phase==='drawing'&&key===lastUiKey)return;
 lastUiKey=key;choice=null;
 if(view.phase==='lobby')lobby();
 else if(view.phase==='preview')preview();
 else if(view.phase==='drawing')drawing();
 else if(view.phase==='voting')vote();
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
 localStorage.setItem(NAME_KEY,name);localStorage.setItem(SERVER_KEY,u.origin);
 change('<section class="page center"><h2>Открываем зал</h2><p class="hint"><span class="busy"></span> Подключаемся к игровому серверу…</p><button class="btn ghost wide" data-action="menu">Отменить</button></section>','connecting');
 try{
  if(net)net.close();net=new PocketNet({serverUrl:u.origin,name});
  net.roomId=null;net.persist();
  net.on('connected',data=>{me=data.player});
  net.on('room_joined',msg=>{roomId=msg.roomId;net.sendGame({type:'sync'});if(!view)change('<section class="page center"><h2>Получаем экспозицию</h2><p class="hint"><span class="busy"></span> Загружаем комнату…</p></section>','connecting')});
  net.on('game_event',msg=>{const e=msg.event;if(e?.type==='state'){view=e.payload;renderView()}else if(e?.type==='notice')notify(String(e.payload||'Не удалось выполнить действие'))});
  net.on('presence',data=>{if(data.disconnected)notify('Один из гостей потерял соединение');try{net.sendGame({type:'sync'})}catch{}});
  net.on('disconnected',()=>notify('Связь прервана. Переподключаемся…'));
  net.on('error',error=>notify('Сеть: '+(error?.code||error?.message||'ошибка')));
  await net.connect();
  if(mode==='create')net.createRoom('zamazka');
  else net.joinRoom(room);
 }catch(e){const cause=e?.message||'нет ответа';notify('Не удалось подключиться: '+cause);net?.close();net=null;setup(mode)}
}
function doSubmit(){if(page==='drawing'&&practice){finishPractice();return}
 if(!editor||!net)return;
 const data=editor.getData();modal('Сдать реставрацию?','<p class="hint">После отправки изменять мазки нельзя. Работа будет доступна остальным на экспертизе.</p>',[
 ['Сдать',()=>{closeDialog();const a=view.mine;saveArtwork(a.art,a.variation,data);editor?.clearDraft();try{net.sendGame({type:'submit',strokes:data});notify('Работа отправлена')}catch{notify('Нет подключения — сохранили работу в личном фонде')}} ,'primary'],
 ['Продолжить рисовать',closeDialog,'ghost']]);}
function share(){const link=new URL(location.href);link.searchParams.set('room',roomId);const server=localStorage.getItem(SERVER_KEY);if(server)link.searchParams.set('server',server);const href=link.toString();if(navigator.share){navigator.share({title:'ЗАМАЗКА — приглашение',url:href}).catch(()=>navigator.clipboard?.writeText(href))}else if(navigator.clipboard){navigator.clipboard.writeText(href).then(()=>notify('Приглашение скопировано')).catch(()=>notify(href))}else notify(href)}
function inspect(id){const a=ARTS[id];modal(esc(a.title),'<img class="art-inspection" src="'+artworkURL(id)+'" alt="'+esc(a.title)+'"><div class="art-metadata">'+esc(a.artist)+' · '+esc(a.date)+'<div>'+esc(a.museum)+'</div></div><p class="hint">Запомни цвета и фактуру оригинала.</p>'+(a.isReal?'<a class="art-source" href="'+esc(a.source)+'" target="_blank" rel="noopener noreferrer">Происхождение изображения ↗</a>':''),[['Закрыть',closeDialog,'primary']])}
function magnify(id){const cand=view?.candidate;modal(esc(ARTS[id].title),'<canvas id="largeCandidate" style="width:100%;aspect-ratio:4/3;display:block;max-height:55vh"></canvas><p class="hint">'+esc(ARTS[id].style)+' · Внимательно изучи мазки и фактуру.</p>',[['Закрыть',closeDialog,'primary']]);renderArtwork(dialog.querySelector('#largeCandidate'),id,cand?.variation||0,cand?.strokes||[],cand?.art===id)}
function settings(){modal('Настройки','<label class="field" for="settingName">Имя</label><input class="input" id="settingName" maxlength="22" value="'+esc(localStorage.getItem(NAME_KEY)||'Реставратор')+'"><label class="field" for="settingServer">Сервер интернет-комнат</label><input class="input" id="settingServer" type="url" value="'+esc(localStorage.getItem(SERVER_KEY)||'')+'" placeholder="https://"><label class="field"><input type="checkbox" id="settingSound" '+(beepEnabled?'checked':'')+'> Звуки интерфейса</label><p class="hint">Изменение адреса сервера действует при следующем подключении. Офлайн-тренировка не требует сервера.</p>',[
 ['Сохранить',()=>{localStorage.setItem(NAME_KEY,dialog.querySelector('#settingName').value.trim().slice(0,22)||'Реставратор');localStorage.setItem(SERVER_KEY,dialog.querySelector('#settingServer').value.trim());beepEnabled=dialog.querySelector('#settingSound').checked;localStorage.setItem(NS+'sound',beepEnabled?'on':'off');closeDialog();notify('Настройки сохранены')},'primary'],['Отмена',closeDialog,'ghost']])}
document.querySelector('#settingsBtn').addEventListener('click',settings);
screen.addEventListener('click',e=>{
 const b=e.target.closest('[data-action],[data-inspect],[data-magnify],[data-choice],[data-saved]');if(!b)return;
 if(b.hasAttribute('data-magnify')){magnify(Number(b.dataset.magnify));return}
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
 else if(action==='vote'&&choice!==null){try{net?.sendGame({type:'vote',art:choice});b.disabled=true;notify('Заключение отправлено')}catch{notify('Потеряно соединение')}}
 else if(action==='next')net?.sendGame({type:'next'});
});
function tick(){
 if(practice&&['preview','drawing'].includes(practice.phase)&&Date.now()>=practice.deadline)practiceStep();
 const v=practice||view,clock=document.querySelector('#clock');
 if(clock&&v?.deadline){const s=Math.max(0,Math.ceil((v.deadline-Date.now())/1000));clock.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');clock.classList.toggle('urgent',s<=10)}
 if(net&&view&&view.deadline&&Date.now()>view.deadline-2400&&Date.now()-lastPulse>1800){lastPulse=Date.now();try{net.sendGame({type:'pulse'})}catch{}}
}
setInterval(tick,350);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
if(q.get('room'))setup('join');else home();
// Shared update manager owns service worker registration and activation.
