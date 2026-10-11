import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {HOUSES,REGIONS,mapSvg,portraitSvg} from './world.js';
import {initial,validate,when,clamp,chance,offer,gift,levy,audit,march,decree,councilAct,resolveIncident,seasonAdvance,score,UPGRADES} from './engine.js';
installMobileRuntime();
const KEY='pocket-works:klyatvy:save-v1';
const $=id=>document.getElementById(id);
const stored=(()=>{try{const value=JSON.parse(localStorage.getItem(KEY));return validate(value)?value:null}catch{return null}})();
let game=stored||initial(),panel='',draft=null,toastTimer=0,audio=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(game))}catch{ /* private mode: current session remains playable */ }}
function notice(message){const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2700)}
function sound(type='tap'){if(!game.sound)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.type=type==='seal'?'triangle':'sine';o.frequency.setValueAtTime(type==='seal'?155:type==='bad'?235:480,t);o.frequency.exponentialRampToValueAtTime(type==='seal'?98:type==='bad'?167:370,t+.12);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.055,t+.014);g.gain.exponentialRampToValueAtTime(.0001,t+.19);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.21)}catch{}}
function render(){
 for(const k of ['gold','stability','legitimacy','troops'])$(k).textContent=Math.round(game[k]);
 $('season').textContent=when(game).toUpperCase().replace(' ',' · ');
 $('mapHint').textContent={legal:'ЗЕМЛИ И ГЕРБЫ',control:'ФАКТИЧЕСКАЯ ВЛАСТЬ',oaths:'ОБЯЗАТЕЛЬСТВА И ПРИСЯГИ'}[game.mode];
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===game.mode));
 const r=REGIONS[game.selected],id=game.owners[game.selected],h=game.houses[id],reb=game.rebels.includes(game.selected);
 $('selectedName').textContent=r.name;$('selectedSigil').textContent=id===0?'♛':reb?'⚔':'♜';
 $('selectedSigil').style.background=reb?'#69382f':h.color;
 $('selectedSub').textContent=reb?'Мятежники удерживают землю':id>=8?'Независимая марка · '+h.lord:id===0?'Прямой домен короны':h.lord+' · верность '+h.loyalty+'%';
 $('world').innerHTML=mapSvg(game);
 $('seasonBtn').disabled=!!game.ended;
 save();
}
function show(body,kind='modal',closable=true){panel=kind;$('veil').classList.remove('hidden');$('sheet').innerHTML='<div class="sheet-crest"><small>✥ · CANCELLARIA REGIS · ✥</small>'+(closable?'<button class="close" type="button" data-act="close" aria-label="Закрыть">×</button>':'<span>✥</span>')+'</div>'+body;$('sheet').scrollTop=0;}
function hide(){if(game.pending&&panel==='incident')return;$('veil').classList.add('hidden');panel='';draft=null}
function buttons(rows){return '<div class="sheet-buttons">'+rows+'</div>'}
function rowButton(act,title,right='',cl=''){return '<button type="button" data-act="'+act+'" class="'+cl+'">'+title+' <span>'+right+'</span></button>'}
function housePanel(index=game.selected){
 game.selected=index;render();const r=REGIONS[index],id=game.owners[index],h=game.houses[id],reb=game.rebels.includes(index),t=h.contract;
 let choices='';
 if(id>0&&id<8&&!reb){
  choices=rowButton('negotiate','Составить новую клятву','✒')+rowButton('gift','Пожаловать 18 монет','+14 верность','secondary')+rowButton('levy','Созвать ополчение','По грамоте','secondary')+rowButton('audit','Королевская ревизия','Право суда','secondary');
 }else if(reb||id>=8)choices=rowButton('march','Начать королевский поход','⚔','danger');
 else choices=rowButton('council','Управление доменом','Совет','secondary');
 show('<h2 class="sheet-h">'+r.name+'</h2><p class="sheet-lead">'+(reb?'Восставшие удерживают укрепления. Восстановить власть может королевский поход.':id>=8?'Независимая марка, не признавшая королевскую присягу.':id===0?'Непосредственное владение короны.':'Вассальное владение, связанное с короной обязательствами.')+'</p><div class="house-portrait"><div class="person-medallion">'+portraitSvg(h)+'</div><div class="portrait-copy"><b>'+h.lord+'</b><span>'+h.title+' · '+h.trait+'</span><span>Укрепления: '+r.fort+' · Владений дома: '+game.owners.filter(o=>o===id).length+'</span></div></div><div class="details"><div><small>ВЕРНОСТЬ</small><b>'+(id===0?'—':h.loyalty+'%')+'</b></div><div><small>ВОИНЫ ДОМА</small><b>'+h.troops+'</b></div><div><small>АВТОНОМИЯ</small><b>'+(t?t.autonomy+'/3':'—')+'</b></div></div>'+(t?'<div class="sheet-subhead">ДЕЙСТВУЮЩАЯ ГРАМОТА</div><p class="sheet-lead">Подать: '+t.tax+' · Служба: '+t.levies+' · Вольности: '+t.autonomy+' · До истечения: '+Math.max(0,h.exp-game.turn)+' сез.</p>':'')+buttons(choices)+'<p class="charter-note">Вассал имеет собственные интересы. Присяга не гарантирует послушание, а память о решениях переживёт самого правителя.</p>','house');
}
function charterPanel(){
 const id=game.owners[game.selected],h=game.houses[id];if(id<=0||id>=8)return;
 if(!draft)draft={...(h.contract||{tax:1,levies:1,autonomy:1,term:12}),term:12};
 const terms=[['tax','Налоговая подать'],['levies','Военная служба'],['autonomy','Вольности вассала'],['term','Срок, сезонов']];
 const termHTML=terms.map(([key,label])=>'<div class="term"><label>'+label+'</label><div class="stepper"><button type="button" data-term="'+key+'" data-inc="-1" aria-label="Уменьшить '+label+'">−</button><b>'+draft[key]+'</b><button type="button" data-term="'+key+'" data-inc="1" aria-label="Увеличить '+label+'">+</button></div></div>').join('');
 show('<h2 class="sheet-h">Грамота о верности</h2><p class="sheet-lead">Договор с '+h.title+'. Более высокая подать и повинность раздражают вассала; широкие вольности делают его уступчивее.</p><div class="charter"><div class="charter-header">✥ · SIGILLUM REGIS · ✥</div><h3>Новая клятва</h3><p>«Да пребудет согласие наше истинным до истечения назначенного срока».</p><div class="charter-terms">'+termHTML+'</div><div class="likelihood">Готовность принять: <strong>'+chance(game,id,draft)+'%</strong></div><div class="seal-zone"><div class="seal-slot" id="sealSlot">ПОЛЕ<br>ПЕЧАТИ</div><button class="seal-wax" id="wax" type="button" aria-label="Подписать грамоту">♛</button></div><div class="charter-note">Перетащите печать в круг или коснитесь её для отправки грамоты.</div></div>'+buttons(rowButton('house','Назад к владению','‹','secondary')),'charter');
 attachWax();
}
function attachWax(){
 const wax=$('wax'),slot=$('sealSlot');if(!wax)return;
 let x=0,y=0,moving=false;
 wax.addEventListener('pointerdown',e=>{x=e.clientX;y=e.clientY;moving=false;wax.setPointerCapture(e.pointerId)});
 wax.addEventListener('pointermove',e=>{if(!wax.hasPointerCapture(e.pointerId))return;const dx=e.clientX-x,dy=e.clientY-y;if(Math.hypot(dx,dy)>9)moving=true;if(moving)wax.style.transform='translate('+dx+'px,'+dy+'px) scale(1.06)'});
 wax.addEventListener('pointerup',e=>{
  const dragged=moving;wax.style.transform='';
  if(!dragged){sign();return}
  const r=slot.getBoundingClientRect();if(e.clientX>=r.left-18&&e.clientX<=r.right+18&&e.clientY>=r.top-18&&e.clientY<=r.bottom+18)sign();else notice('Поставьте печать в отмеченный круг.');
 });
}
function sign(){
 if(panel!=='charter'||!draft)return;
 const id=game.owners[game.selected],h=game.houses[id],result=offer(game,id,draft);
 draft=null;sound(result?'seal':'bad');render();
 show('<h2 class="sheet-h">'+(result?'Клятва скреплена':'Воск остыл напрасно')+'</h2><p class="sheet-lead">'+(result?h.lord+' принял договор. Печати внесены в архив, новые обязанности вступили в силу.':h.lord+' отверг условия. Недоверие и обида останутся даже после следующего переговорщика.')+'</p><div class="charter"><div class="charter-header">✥ · '+(result?'RATUM EST':'NON ACCEPTUM')+' · ✥</div><h3>'+(result?'Слово дано':'В согласии отказано')+'</h3><div class="seal-zone"><span class="seal-wax signed" style="display:grid;place-items:center">♛</span></div></div>'+buttons(rowButton('close','Вернуться к королевству','→')),'result');
 if(game.ended)endPanel();
}
function councilPanel(){
 const ready=game.councilTurn!==game.turn;
 const list=Object.entries(UPGRADES).map(([id,u])=>'<div class="edict"><h3>'+u.title+'</h3><p>'+u.desc+'</p><button type="button" data-edict="'+id+'" '+(!ready||game.gold<u.cost||game.reforms[id]?'disabled':'')+'>'+(game.reforms[id]?'Учреждено':u.cost+' монет · Утвердить')+'</button></div>').join('');
 show('<h2 class="sheet-h">Королевский совет</h2><p class="sheet-lead">Каждый сезон можно провести одно решение совета. Новые законы навсегда меняют устройство королевства.</p><div class="details"><div><small>КАЗНА</small><b>'+game.gold+'</b></div><div><small>СОВЕТ</small><b>'+(ready?'Готов':'Созван')+'</b></div><div><small>УСТОЙЧ.</small><b>'+game.stability+'</b></div></div><div class="sheet-subhead">УСТАВЫ КОРОЛЕВСТВА</div>'+list+'<div class="sheet-subhead">РАЗОВЫЕ УКАЗЫ</div><div class="sheet-buttons"><button class="secondary" data-act="tax-decree" '+(!ready?'disabled':'')+'>Чрезвычайный сбор <span>+35 казна, −8 устойчивость</span></button><button class="secondary" data-act="feast" '+(!ready||game.gold<25?'disabled':'')+'>Пир примирения <span>−25 казна, +верность</span></button></div>','council');
}
function archivePanel(){
 show('<h2 class="sheet-h">Королевская летопись</h2><p class="sheet-lead">Договоры помнят больше, чем подданные. Здесь хранится всё правление.</p><div class="details"><div><small>СЕЗОН</small><b>'+(game.turn+1)+'</b></div><div><small>ГРАМОТ</small><b>'+game.charters.length+'</b></div><div><small>СОБЫТИЙ</small><b>'+game.history.length+'</b></div></div><div class="sheet-subhead">СКРЕПЛЁННЫЕ КЛЯТВЫ</div>'+(game.charters.length?game.charters.slice(0,12).map(c=>'<div class="archive-item"><small>'+c.date+' · '+c.status+'</small><b>'+c.house+'</b><p>Подать '+c.terms.tax+' · Служба '+c.terms.levies+' · Вольности '+c.terms.autonomy+' · Срок '+c.terms.term+' сез.</p></div>').join(''):'<p class="charter-note">Первый новый договор появится здесь после заключения клятвы.</p>')+'<div class="sheet-subhead">ЗАПИСИ КАНЦЕЛЯРИИ</div>'+game.history.map(v=>'<div class="archive-item"><small>'+v.date+'</small><b>'+v.title+'</b><p>'+v.detail+'</p></div>').join(''),'archive');
}
function menuPanel(){
 show('<h2 class="sheet-h">Королевский атлас</h2><p class="sheet-lead">История автоматически сохраняется после каждого решения. Все инструменты королевства доступны здесь.</p>'+buttons(rowButton('close','Вернуться к карте','→')+rowButton('sound','Звуки канцелярии',game.sound?'Включены':'Выключены','secondary')+rowButton('archive','Прочесть летопись','▤','secondary')+rowButton('rules','Правила правления','?','secondary')+rowButton('restart','Начать новую хронику','↻','danger')+'<a class="sheet-button secondary" href="../../" data-app-control>Вернуться в Pocket Works <span>↗</span></a>'),'menu');
}
function rulesPanel(){
 show('<h2 class="sheet-h">Закон королевства</h2><p class="sheet-lead">Цель — удержать трон шестнадцать лет (64 сезона) и оставить устойчивое государство.</p>'+[
 ['Коснитесь замка','Откроются его владелец, доступное войско и отношения с короной.'],
 ['Заключайте грамоты','Повышайте подать ради казны, военную службу ради солдат или даруйте вольности ради согласия. Отвергнутые требования портят отношения.'],
 ['Созывайте войско','Вассалы предоставляют солдат в пределах своих клятв. Войска расходуются в походах против мятежей и свободных марок.'],
 ['Выносите указы','Каждый сезон возможно одно решение совета. Реформы меняют экономику и политические последствия.'],
 ['Держите слово','Если законность или устойчивость падают до нуля, королевство распадается. Все решения сохраняются в летописи.']
 ].map(v=>'<div class="archive-item"><b>'+v[0]+'</b><p>'+v[1]+'</p></div>').join('')+buttons(rowButton('menu','Вернуться в меню','‹')),'rules');
}
function incidentPanel(){
 const p=game.pending;if(!p)return;
 show('<div class="sheet-subhead">ГОНЕЦ ПРИ ДВОРЕ · '+when(game)+'</div><h2 class="sheet-h">'+p.title+'</h2><p class="sheet-lead">'+p.body+'</p><div class="parchment-line"></div><div class="sheet-buttons"><button type="button" data-choice="0">'+p.a+' <span>◈</span></button><button class="secondary" type="button" data-choice="1">'+p.b+' <span>⚖</span></button></div><p class="charter-note">Решение будет занесено в летопись. Обратного пути нет.</p>','incident',false);
}
function endPanel(){
 const value=score(game);
 show('<div class="sheet-subhead">FINIS CHRONICAE · '+when(game)+'</div><h2 class="sheet-h">'+(game.ended==='victory'?'Корона пережила время':'Королевство распалось')+'</h2><p class="sheet-lead">'+(game.ended==='victory'?'Шестнадцать лет договоров, походов и судов стали историей.':'Власть не удержалась. Прежние клятвы потеряли силу вместе с престолом.')+'</p><div class="end-score">'+value+'</div><p class="end-caption">Наследие короны · '+(value>=75?'Великое королевство':value>=45?'Хрупкий порядок':'Тяжёлое наследие')+'</p><div class="details"><div><small>ДОМЕНЫ</small><b>'+game.owners.filter(o=>o===0).length+'</b></div><div><small>ГРАМОТЫ</small><b>'+game.charters.length+'</b></div><div><small>РЕФОРМЫ</small><b>'+Object.values(game.reforms).filter(Boolean).length+'</b></div></div>'+buttons(rowButton('archive','Прочесть летопись','▤')+rowButton('restart','Начать новое правление','↻','secondary')+'<a class="sheet-button secondary" href="../../" data-app-control>Вернуться в Pocket Works <span>↗</span></a>'),'end',false);
}
function restartDialog(){
 show('<h2 class="sheet-h">Начать заново?</h2><p class="sheet-lead">Новая хроника уничтожит текущую кампанию и весь архив. Это действие нельзя отменить.</p>'+buttons(rowButton('restart-confirm','Удалить хронику и начать заново','↻','danger')+rowButton('menu','Сохранить текущую историю','‹','secondary')),'restart');
}
function act(name){
 if(name==='close'){hide();return}
 if(name==='house'){housePanel();return}
 if(name==='negotiate'){draft=null;charterPanel();return}
 if(name==='council'){councilPanel();return}
 if(name==='archive'){archivePanel();return}
 if(name==='menu'){menuPanel();return}
 if(name==='rules'){rulesPanel();return}
 if(name==='restart'){restartDialog();return}
 if(name==='restart-confirm'){game=initial();draft=null;hide();render();$('opening').classList.remove('dismissed');$('startBtn').textContent='Открыть хронику →';return}
 if(name==='sound'){game.sound=!game.sound;save();menuPanel();return}
 if(name==='gift'||name==='levy'||name==='audit'||name==='march'){
  const id=game.owners[game.selected];let message='';
  if(name==='gift'&&id>0&&id<8)message=gift(game,id);
  if(name==='levy'&&id>0&&id<8)message=levy(game,id);
  if(name==='audit'&&id>0&&id<8)message=audit(game,id);
  if(name==='march')message=march(game,game.selected);
  notice(message);sound('seal');render();housePanel();if(game.ended)endPanel();return;
 }
 if(name==='tax-decree'||name==='feast'){
  if(councilAct(game,name)){sound('seal');notice('Королевский указ исполнен.');render();if(game.ended)endPanel();else councilPanel()}else notice('Совет уже собран или недостаточно денег.');
 }
}
$('startBtn').textContent=stored?'Продолжить хронику →':'Открыть хронику →';
$('startBtn').addEventListener('click',()=>{
 $('opening').classList.add('dismissed');sound('seal');
 if(game.ended)endPanel();else if(game.pending)incidentPanel();
 else if(!stored&&game.turn===0)show('<h2 class="sheet-h">Первое утро правления</h2><p class="sheet-lead">Семь вассальных домов принесли присягу. Две пограничные марки остались независимы. Ваше слово станет законом — если другие согласятся.</p>'+buttons(rowButton('close','Взглянуть на королевство','→')+rowButton('rules','Как править королевством','?','secondary')),'intro');
});
$('pauseBtn').addEventListener('click',()=>{sound();menuPanel()});
$('councilBtn').addEventListener('click',()=>{sound();councilPanel()});
$('archiveBtn').addEventListener('click',()=>{sound();archivePanel()});
$('seasonBtn').addEventListener('click',()=>{
 if(game.pending){incidentPanel();return}
 const earned=seasonAdvance(game);sound();render();
 if(game.ended)endPanel();else if(game.pending)incidentPanel();else notice('Начался '+when(game)+'. Казна пополнена на '+earned+' монет.');
});
$('inspectBtn').addEventListener('click',()=>{sound();housePanel()});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{game.mode=b.dataset.mode;sound();render()}));
function selectLand(e){const el=e.target.closest('[data-land]');if(!el)return;game.selected=Number(el.dataset.land);sound();housePanel()}
$('world').addEventListener('click',selectLand);
$('world').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectLand(e)}});
$('sheet').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.term){if(!draft)return;const k=b.dataset.term;draft[k]=clamp(draft[k]+Number(b.dataset.inc),k==='term'?4:0,k==='term'?24:3);sound();charterPanel();return}
 if(b.dataset.edict){if(decree(game,b.dataset.edict)){sound('seal');render();notice('Королевский устав учреждён.');councilPanel()}else notice('Совет не может исполнить этот указ.');return}
 if(b.dataset.choice){resolveIncident(game,Number(b.dataset.choice));$('veil').classList.add('hidden');panel='';render();sound('seal');if(game.ended)endPanel();else notice('Суд состоялся. Решение вошло в хронику.');return}
 if(b.id==='wax')return;
 if(b.dataset.act){sound();act(b.dataset.act)}
});
$('veil').addEventListener('click',e=>{if(e.target===$('veil')&&!['incident','end'].includes(panel))hide()});
window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});
createWorkshopMode({
 appName:'Клятвы',
 version:'1.0.0',
 cachePrefix: 'klyatvy-',
 storageNamespace: 'pocket-works:klyatvy',
 onReset(){
  game=initial();draft=null;hide();render();
  $('opening').classList.remove('dismissed');
  $('startBtn').textContent='Открыть хронику →';
 }
});
window.__KLYATVY_QA__=()=>({turn:game.turn,gold:game.gold,stability:game.stability,legitimacy:game.legitimacy,troops:game.troops,selected:game.selected,owners:[...game.owners],rebels:[...game.rebels],charters:game.charters.length,history:game.history.length,pending:!!game.pending,ended:game.ended,panel});
render();