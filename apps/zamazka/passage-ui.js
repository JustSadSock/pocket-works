// ЗАМАЗКА / admission and restoration transitions.
// Rendering is pure: the PocketNet authoritative state remains in app.js.
export function admissionMarkup({creating,name,member,portrait,roomValue='',error='',escapeText,artURL}){
 const e=value=>escapeText(String(value??''));
 const action=creating?'Создать выставку':'Войти в выставку';
 return '<section class="page lobby-entry passage-entry" data-passage="entry">'+
  '<div class="passage-document"><header class="entry-heading passage-heading"><span class="section-label">ЧАСТНАЯ ВЫСТАВКА</span>'+
  '<h2>'+(creating?'Открыть зал':'Ваше приглашение')+'</h2></header>'+
  '<div class="entry-content passage-entry-content">'+
   '<button type="button" class="entry-profile passage-identity" data-action="pocket-profile">'+
   '<span data-pocket-identity>'+portrait+'</span><span><strong>'+e(name)+'</strong>'+
   '<small>'+(member?'Профиль Pocket ID':'Гостевой посетитель · изменить профиль')+'</small></span><span aria-hidden="true">↗</span></button>'+
   '<form class="passage-entry-form" id="passageEntryForm" autocomplete="off">'+
    '<div class="entry-fields"><label class="field" for="who">Имя игрока</label>'+
    '<input class="input" id="who" name="nickname" maxlength="22" autocomplete="nickname" placeholder="Как тебя зовут?" value="'+e(name)+'"'+(member?' readonly aria-readonly="true"':'')+'>'+
    (creating?'':'<label class="field" for="room">Код или ссылка на комнату</label>'+
    '<div class="passage-code-field"><input class="input room-entry-input" id="room" name="room" maxlength="250" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="Код приглашения" value="'+e(roomValue)+'">'+
    '<button type="button" class="passage-paste" data-action="paste-invite" aria-label="Вставить код из буфера">Вставить</button></div>')+
    (error?'<div class="notice entry-error passage-error" role="alert">'+e(error)+'</div>':'')+
    '</div><div class="entry-actions"><button class="btn primary passage-submit" type="submit" data-mode="'+(creating?'create':'join')+'">'+action+' <span aria-hidden="true">↗</span></button>'+
    '<button class="btn ghost" type="button" data-action="menu">В меню</button></div>'+
   '</form>'+
   '<button type="button" class="passage-switch" data-action="'+(creating?'join':'create')+'">'+
   (creating?'Есть приглашение? Ввести код':'Нет приглашения? Создать комнату')+' <span aria-hidden="true">→</span></button>'+
   '</div></div>'+
  '<aside class="entry-art passage-art"><div class="passage-art-light" aria-hidden="true"></div>'+
   '<span class="entry-art-frame passage-art-frame"><img src="'+artURL+'" alt="" loading="eager"></span>'+
   '<div class="passage-art-label"><span>01</span><span>ЗАМАЗКА<br><small>Музей подлинников</small></span></div></aside></section>';
}

export function connectionMarkup({mode='join',artURL=''}={}){
 const label=mode==='create'?'Открываем новый зал':mode==='resume'?'Восстанавливаем комнату':'Находим вашу выставку';
 return '<section class="page connecting-room passage-connection" data-passage="connection">'+
  '<div class="passage-connection-panel"><span class="passage-connection-seal" aria-hidden="true"><img src="'+artURL+'" alt=""></span>'+
  '<span class="section-label">ПОДКЛЮЧЕНИЕ</span><h2>'+label+'</h2>'+
  '<p class="passage-connection-status" id="connectionDetail" role="status" aria-live="polite">Подключаемся…</p>'+
  '<button class="btn ghost" data-action="cancel-connect">Отменить</button></div></section>';
}
export function setConnectionStep(root,index,detail){
 if(!root)return;
 root.querySelectorAll('[data-connection-step]').forEach(el=>{
  const n=Number(el.dataset.connectionStep);
  el.classList.toggle('is-current',n===index);
  el.classList.toggle('is-complete',n<index);
 });
 const label=root.querySelector('#connectionDetail');if(label&&detail)label.textContent=detail;
}
export function preparingMarkup({round,total,ready=0,local=false}={}){
 const safeTotal=Math.max(1,Number(total)||1);
 return '<section class="page art-preparing passage-preparing" data-passage="preparing">'+
 '<header class="passage-prep-header"><span class="section-label">РАУНД '+Number(round||1)+' · ПОДГОТОВКА</span>'+
 '<h2>Готовим экспозицию</h2><p>Пять оригиналов для новой выставки.</p></header>'+
 '<div class="passage-prep-workspace"><div class="passage-image-strip" aria-label="Прогресс загрузки пяти картин">'+
 Array.from({length:5},(_,i)=>'<span class="passage-image-slot" data-art-slot="'+i+'"><i aria-hidden="true"></i><b>'+String(i+1).padStart(2,'0')+'</b></span>').join('')+'</div>'+
 '<div class="passage-prep-progress"><div><span>Оригиналы</span><strong id="artLoadCount">0 / 5</strong></div>'+
 '<div class="passage-load-track" role="progressbar" aria-label="Загрузка картин" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0" id="artLoadTrack"><i></i></div></div>'+
 '<p id="artPreparingStatus" class="passage-prep-status" role="status" aria-live="polite">Загружаем картины…</p>'+
 (!local?'<div class="passage-prep-peer"><span>Готовность участников</span><strong id="artReadyCount">'+Math.max(0,Number(ready)||0)+' / '+safeTotal+'</strong></div>':'')+
 '</div><footer class="passage-prep-actions"><button class="btn primary" data-action="retry-art-preload" hidden>Повторить загрузку</button>'+
 '<button class="btn ghost preparing-menu" data-action="menu">В главное меню</button></footer></section>';
}
export function updateArtLoad(root,count,total=5,loadedIndices=null){
 if(!root)return;
 const n=Math.max(0,Math.min(total,Math.round(Number(count)||0)));
 const meter=root.querySelector('#artLoadCount');if(meter)meter.textContent=n+' / '+total;
 const bar=root.querySelector('#artLoadTrack');if(bar){bar.setAttribute('aria-valuenow',String(n));bar.style.setProperty('--passage-progress',100*n/total+'%')}
 const loaded=Array.isArray(loadedIndices)?new Set(loadedIndices):null;
 root.querySelectorAll('.passage-image-slot').forEach((slot,i)=>slot.classList.toggle('is-loaded',loaded?loaded.has(i):i<n));
}
export function updateReady(root,count,total){
 const label=root?.querySelector('#artReadyCount');if(label)label.textContent=Number(count||0)+' / '+Number(total||0);
}
export function waitingMarkup({view,ass,arts,escapeText,memberSeal,head,artFactsHtml}){
 const e=value=>escapeText(String(value??''));
 const finished=view.done||[],players=view.participants||[];
 const complete=finished.length,total=players.length||1;
 return '<section class="phase-page waiting-phase passage-waiting" data-passage="waiting">'+
  head('РАУНД '+view.round+' · РАБОТА СДАНА','Твоя работа принята',view.deadline,artFactsHtml(ass.art),view.drawingSeconds===0)+
  '<div class="phase-body waiting-layout passage-waiting-layout">'+
  '<div class="waiting-work passage-waiting-work"><div class="passage-waiting-heading">'+
  '<span class="section-label">СТОЛ РЕСТАВРАТОРА</span><h3>'+e(arts[ass.art]?.title||'Твоя картина')+'</h3></div>'+
  '<div class="passage-compare-legend"><span>Твоя работа</span><span>Оригинал</span></div>'+
  '<div class="unveil-frame" id="unveilStage" style="--split:50%"><canvas id="restCanvas" class="unveil-bottom" aria-label="Моя реставрация"></canvas>'+
  '<canvas id="origCanvas" class="unveil-top" aria-label="Оригинальная картина"></canvas><span class="unveil-label left">МОЯ РАБОТА</span>'+
  '<span class="unveil-label right">ОРИГИНАЛ</span><div class="unveil-ruler"></div></div>'+
  '<label class="unveil-control passage-compare-control" for="unveilRange">Сравнить <input id="unveilRange" type="range" min="0" max="100" value="50" aria-label="Сравнить мою реставрацию и оригинал"></label>'+
  '</div><aside class="waiting-progress passage-waiting-status"><header><span class="section-label">УЧАСТНИКИ</span>'+
  '<h3>Ожидаем остальных</h3></header><div class="passage-ready-number"><strong id="readyCount">'+complete+' / '+total+'</strong><span>закончили реставрацию</span></div>'+
  '<div class="passage-ready-track" id="waitingReadyTrack" role="progressbar" aria-label="Готовность игроков" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+complete+'" style="--passage-progress:'+(complete/total*100).toFixed(2)+'%"><i></i></div>'+
  '<div class="passage-roster-caption">Состояние игроков обновляется автоматически</div>'+
  '<div id="readyList" class="waiting-roster passage-roster">'+players.map(p=>'<div class="waiting-person'+(finished.includes(p.id)?' is-ready':'')+'" data-wait-player="'+e(p.id)+'">'+
     memberSeal(p)+'<span>'+e(p.name)+'</span><strong>'+(finished.includes(p.id)?'Готово':'Рисует')+'</strong></div>').join('')+'</div>'+
  '<div class="passage-waiting-foot"><span class="passage-breath" aria-hidden="true"></span><span id="waitingStatusMessage">'+(complete===total?'Все работы сданы. Переходим к экспертизе.':'Можно изучить результат, пока остальные рисуют.')+'</span></div>'+
  '</aside></div></section>';
}
export function updateWaiting(root,done=[],players=[]){
 if(!root)return;
 const doneSet=new Set(done),total=players.length||1,ready=players.filter(p=>doneSet.has(p.id)).length;
 const count=root.querySelector('#readyCount');if(count)count.textContent=ready+' / '+total;
 const meter=root.querySelector('#waitingReadyTrack');
 if(meter){meter.style.setProperty('--passage-progress',(100*ready/total).toFixed(2)+'%');meter.setAttribute('aria-valuemax',String(total));meter.setAttribute('aria-valuenow',String(ready))}
 for(const element of root.querySelectorAll('[data-wait-player]')){
  const active=doneSet.has(element.dataset.waitPlayer),prev=element.classList.contains('is-ready');
  if(active&&!prev){element.classList.add('just-ready');setTimeout(()=>element.classList.remove('just-ready'),440)}
  element.classList.toggle('is-ready',active);
  const status=element.querySelector('strong');if(status)status.textContent=active?'Готово':'Рисует';
 }
 const message=root.querySelector('#waitingStatusMessage');
 if(message)message.textContent=ready===total?'Все работы сданы. Переходим к экспертизе.':'Можно изучить результат, пока остальные рисуют.';
 root.classList.toggle('passage-all-ready',ready===total);
}
