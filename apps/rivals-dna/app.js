
import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { HEROES, SNAPSHOT } from './hero-data.js';
import { byId, sequenceFor } from './questions.js';
import { AXIS_TITLES, ROLE_NAMES, isValidAnswer, chooseAdaptive, answeredCount, rankHeroes, resultsSummary, explanation, pairRecommendations, verifyDataset } from './engine.js';
installMobileRuntime();

const KEY='pocket-works:rivals-dna:state:v1';
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FIRST_PROFILE=()=>({id:'player-'+Math.random().toString(36).slice(2,10),name:'Игрок 1',answers:{},mode:'full',order:[],position:0,complete:false,resultMode:'joy',feedback:{},matches:{}});
function restore(){
  try{
    const v=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!v||v.version!==1||!Array.isArray(v.profiles))throw Error('invalid');
    const profiles=v.profiles.slice(0,20).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string').map(p=>({
      ...FIRST_PROFILE(),...p,
      name:p.name.slice(0,42),answers:Object.fromEntries(Object.entries(p.answers||{}).filter(([k,n])=>isValidAnswer(byId[k],n))),
      order:Array.isArray(p.order)?p.order.filter(k=>byId[k]).slice(0,24):[],
      feedback:p.feedback&&typeof p.feedback==='object'?p.feedback:{},matches:p.matches&&typeof p.matches==='object'?p.matches:{},
      resultMode:p.resultMode==='easy'?'easy':'joy',
      position:Math.max(0,Number.isInteger(p.position)?p.position:0)
    }));
    if(!profiles.length)throw Error('empty');
    return {version:1,profiles,activeId:profiles.some(p=>p.id===v.activeId)?v.activeId:profiles[0].id,screen:['home','test','result','profiles','duo'].includes(v.screen)?v.screen:'home',duoId:v.duoId||''};
  }catch{return {version:1,profiles:[FIRST_PROFILE()],activeId:null,screen:'home',duoId:''};}
}
let state=restore(); if(!state.activeId)state.activeId=state.profiles[0].id;
let confirmAction=null;
let openHero=null;
let toastTimer=0;
const active=()=>state.profiles.find(p=>p.id===state.activeId)||state.profiles[0];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{announce('Хранилище недоступно. Экспортируй результаты, чтобы не потерять их.');}};
const go=screen=>{state.screen=screen;openHero=null;save();render();scrollTo({top:0,behavior:'instant'});};
function announce(message){const toast=$('#toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2900);}
function button(label,action,extra=''){return '<button type="button" data-action="'+action+'" '+extra+'>'+escapeHtml(label)+'</button>';}
function miniIcon(type='cross'){return type==='cross'?'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 3v12m0 18v12M3 24h12m18 0h12" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="2"/><path d="M19 24h10m-5-5v10" stroke="currentColor" stroke-width="2"/></svg>':
'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M5 35L20 7l8 14 15-8-8 30H9Z" stroke="currentColor" stroke-width="2"/><path d="M12 32l11-6 9 10" stroke="currentColor" stroke-width="2"/></svg>';}
function badge(role){return ({Vanguard:'V',Duelist:'D',Strategist:'S',Flex:'F'})[role]||'•';}
function nameMark(name){const pieces=name.split(' ').filter(Boolean);return pieces.length===1?name.slice(0,2).toUpperCase():pieces.slice(0,2).map(p=>p[0]).join('').toUpperCase();}
function heroMark(hero,large=false) {const hash=[...hero.id].reduce((n,ch)=>n+ch.charCodeAt(0),0);return '<div class="hero-mark '+(large?'large ':'')+'role-'+hero.role.toLowerCase()+'" style="--hero-rot:'+(hash%80-40)+'deg"><div class="insignia-lines"></div><span>'+escapeHtml(nameMark(hero.name))+'</span><small>'+badge(hero.role)+'</small></div>';}
function header(){
  const showProfile=state.screen!=='profiles';
  return '<header class="topbar" data-ui><a class="exit" href="../../" data-app-control>← Pocket Works</a><span class="top-brand"><i class="dna-sigil">✦</i> RIVALS <b>DNA</b></span><button class="top-profile" data-action="'+(state.screen==='profiles'?'home':'profiles')+'" aria-label="Профили игроков">'+(state.screen==='profiles'?'Закрыть':escapeHtml(active().name))+'</button></header>';
}
function shell(markup){$('#app').innerHTML=header()+markup;}
function home(){
 const p=active();const n=answeredCount(p.answers,p.mode,p.order.filter(id=>byId[id]?.adaptive));const hasProgress=p.order.length&&!p.complete;
 shell('<section class="landing"><div class="landing-identity"><div class="eyebrow">ТВОЯ ИГРА • ТВОИ ПРАВИЛА</div><div class="brand-graphic">'+miniIcon()+'<span class="brand-shadow">R/D</span></div><h1>Найди свой<br><em>боевой почерк.</em></h1><p>Не «на кого ты похож», а за кого тебе действительно будет интересно играть.</p></div><div class="start-cluster"><div class="roster-strip"><span><b>'+SNAPSHOT.heroCount+'</b> героя</span><span><b>20</b> вопросов</span><span><b>10</b> рекомендаций</span></div>'
 +(p.complete?'<button class="continue-result" data-action="results">Твой топ-10 <span>Открыть результат →</span></button>':'')
 +(hasProgress?'<button class="continue-result" data-action="continue">Продолжить тест <span>'+n+'/'+p.order.length+' →</span></button>':'')
 +'<button class="primary-action" data-action="start-full">Пройти полный тест <span>20 вопросов →</span></button><div class="split-actions"><button data-action="start-quick">Быстрый режим <small>12 вопросов</small></button><button data-action="duo">Подобрать дуэт <small>Два профиля</small></button></div></div><div class="landing-foot">Подбор по стилю, а не по мете. Работает без сети.</div></section>');
}
function scenarioSVG(type){
 const labels={save:'ПОД ОГНЁМ',push:'ПРОРЫВ НА ТОЧКУ',duel:'ДУЭЛЬ',crisis:'КРИТИЧЕСКИЙ МОМЕНТ'};
 const svg='<svg class="scenario-svg" viewBox="0 0 340 180" role="img" aria-label="Схема боевой ситуации: союзники обозначены голубым и зелёным, враги — красным"><defs><pattern id="arena-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#fff" stroke-opacity=".08"/></pattern></defs><rect width="340" height="180" fill="url(#arena-grid)"/><path d="M18 156L92 113L168 146L244 85L322 112" fill="none" stroke="#e3efc4" stroke-opacity=".14" stroke-width="13"/><path d="M44 125L145 82L262 56" fill="none" stroke="#a4c9d3" stroke-dasharray="5 6" stroke-width="2"/><g fill="#f18b76"><circle cx="253" cy="54" r="11"/><circle cx="218" cy="105" r="11"/></g><g fill="#a5d3c2"><circle cx="145" cy="82" r="11"/></g><circle cx="44" cy="125" r="15" fill="#adc8ef" stroke="#ecf6ff" stroke-width="3"/><g stroke="#f18b76" stroke-width="2" stroke-dasharray="5 4" opacity=".8"><path d="M244 65l-85 13M208 102l-49-17"/></g><g fill="#fff" font-size="10" letter-spacing="2" font-family="system-ui"><text x="19" y="102">ТЫ</text><text x="109" y="56">СОЮЗНИК</text><text x="266" y="42">ВРАГ</text></g><rect x="115" y="100" width="60" height="5" rx="2" fill="#39504c"/><rect x="115" y="100" width="20" height="5" rx="2" fill="#9fd7bb"/></svg>';
 return '<div class="scenario"><div class="scenario-top"><span>ТАКТИЧЕСКАЯ СИТУАЦИЯ</span><span>'+labels[type]+'</span></div>'+svg+'</div>';
}
function renderQuestion(){
 const p=active();
 if(!p.order.length)return go('home');
 p.position=Math.min(p.position,p.order.length-1);
 const q=byId[p.order[p.position]]; if(!q)return go('home');
 const total=p.mode==='quick'?12:20;
 const current=p.position+1;
 const answer=p.answers[q.id];
 const percent=((current-1)/total*100).toFixed(2);
 let control='';
 if(q.kind==='scale'){
   const value=isValidAnswer(q,answer)?answer:2;
   control='<div class="scale-sheet"><div class="scale-current" id="scale-value">'+['Совсем нет','Скорее нет','Посередине','Скорее да','Очень'][value]+'</div><input type="range" data-question="'+q.id+'" min="0" max="4" step="1" value="'+value+'" aria-label="'+escapeHtml(q.title)+'"><div class="scale-labels"><span>'+escapeHtml(q.low)+'</span><span>'+escapeHtml(q.high)+'</span></div><div class="scale-notice">Передвинь ползунок, чтобы зафиксировать ответ</div></div>';
 } else {
   control='<div class="choices">'+q.options.map((opt,i)=>'<button class="choice '+(answer===i?'chosen':'')+'" type="button" data-action="choose" data-index="'+i+'"><span class="choice-index">'+String.fromCharCode(65+i)+'</span><span class="choice-body">'+escapeHtml(opt.text)+'</span><span class="choice-check">'+(answer===i?'✓':'↗')+'</span></button>').join('')+'</div>';
 }
 shell('<section class="question-screen"><div class="question-top"><div class="question-count">ВОПРОС <b>'+String(current).padStart(2,'0')+'</b><span>/ '+total+'</span></div><div class="chapter">'+escapeHtml(q.section)+'</div></div><div class="progress-track"><span style="width:'+percent+'%"></span></div>'+(q.scenario?scenarioSVG(q.scenario):'')+'<div class="question-copy"><h1>'+escapeHtml(q.title)+'</h1>'+(q.subtitle?'<p>'+escapeHtml(q.subtitle)+'</p>':'')+'</div>'+control+'<div class="question-nav"><button class="secondary-action" data-action="back">'+(p.position===0?'На главную':'← Назад')+'</button><button class="primary-action next" data-action="next" '+(!isValidAnswer(q,answer)?'disabled':'')+'>'+(current>=total?'Результат →':'Далее →')+'</button></div><div class="question-bottom">Нет правильных ответов. Важнее первое желание.</div></section>');
}
function start(mode){
 const p=active();
 if(p.order.length&&Object.keys(p.answers).length){
   confirmAction={type:'restart',mode};return render();
 }
 restart(mode);
}
function restart(mode){
 const p=active();p.mode=mode;p.answers={};p.order=sequenceFor(mode).map(q=>q.id);p.position=0;p.complete=false;
 confirmAction=null;go('test');
}
function next(){
 const p=active(),id=p.order[p.position],q=byId[id];
 if(!isValidAnswer(q,p.answers[id])){announce('Сначала выбери ответ.');return;}
 const base=sequenceFor(p.mode).length;
 if(p.position===p.order.length-1 && p.order.length<base+2){
   const adaptive=chooseAdaptive(p.answers,p.order.filter(id=>byId[id]?.adaptive));
   if(adaptive)p.order.push(adaptive.id);
 }
 if(p.position<p.order.length-1){p.position++;save();render();return;}
 p.complete=true;go('result');
}
function meter(label,value){return '<div class="trait"><span>'+escapeHtml(label)+'</span><div class="trait-bar"><i style="width:'+value+'%"></i></div><b>'+value+'</b></div>';}
function heroTile(entry,index){
 const h=entry.hero;
 return '<button class="rank-row" data-action="hero" data-hero="'+h.id+'"><span class="rank-num">'+String(index+1).padStart(2,'0')+'</span>'+heroMark(h)+'<span class="rank-copy"><b>'+escapeHtml(h.name)+'</b><small>'+ROLE_NAMES[h.role]+' • '+escapeHtml(h.archetype)+'</small></span><span class="rank-score">'+entry.score+'<small>/100</small></span><span class="rank-arrow">↗</span></button>';
}
function renderResults(){
 const p=active();if(!p.complete)return go('home');
 const data=resultsSummary(p.answers,p.feedback,p.resultMode), {player,ranking}=data, first=ranking[0];
 const top=first.hero;const exp=explanation(top,player);
 shell('<section class="result-page"><div class="result-intro"><div class="eyebrow">ПРОФИЛЬ: '+escapeHtml(p.name.toUpperCase())+' • '+(p.mode==='quick'?'БЫСТРЫЙ':'ПОЛНЫЙ')+' ТЕСТ</div><h1>Твоё боевое<br><em>ДНК.</em></h1><p>Индекс — сравнение стилей, а не процент гарантированного успеха.</p></div><div class="result-columns"><div class="result-primary"><div class="winner-plate"><div class="plate-serial">СОВПАДЕНИЕ №01 <span>'+data.confidence+'/100 · НАДЁЖНОСТЬ АНКЕТЫ</span></div><div class="winner-center">'+heroMark(top,true)+'<div class="winner-info"><small>'+ROLE_NAMES[top.role]+'</small><h2>'+escapeHtml(top.name)+'</h2><div class="winner-score">'+first.score+'<span>/100</span></div></div></div><div class="fit-splits"><span>Интерес <b>'+first.enjoyment+'</b></span><span>Удобство <b>'+first.ease+'</b></span></div><button data-action="hero" data-hero="'+top.id+'" class="outline-light">Почему подходит →</button></div><div class="profile-traits"><div class="panel-kicker">ТВОЯ СИГНАТУРА</div>'+Object.entries(player.vector).filter(([axis])=>player.measured[axis]>.6).sort((a,b)=>Math.abs(b[1]-50)-Math.abs(a[1]-50)).slice(0,5).map(([axis,val])=>meter(AXIS_TITLES[axis],val)).join('')+'</div></div><div class="ranking"><div class="ranking-head"><div><div class="panel-kicker">ЛИЧНЫЙ РЕЙТИНГ</div><h2>10 героев для тебя</h2></div><div class="mode-switch"><button data-action="result-mode" data-mode="joy" class="'+(p.resultMode==='joy'?'active':'')+'">Интерес</button><button data-action="result-mode" data-mode="easy" class="'+(p.resultMode==='easy'?'active':'')+'">Освоение</button></div></div><div class="rank-list">'+ranking.slice(0,10).map(heroTile).join('')+'</div><p class="ranking-foot">Можно раскрыть любого героя, оценить его после матча и уточнить подбор.</p></div></div><div class="result-actions"><button data-action="share" class="secondary-action">Поделиться результатом</button><button data-action="home" class="secondary-action">Главная</button><button data-action="retake" class="primary-action">Пройти заново →</button></div></section>');
}
function feedbackText(rating){return ({'-2':'Не моё','-1':'Скорее нет','0':'Не оценён','1':'Понравился','2':'Мой герой'})[String(rating)]||'Не оценён';}
function renderHero(){
 const p=active(),hero=HEROES.find(h=>h.id===openHero);if(!hero)return;
 const data=resultsSummary(p.answers,p.feedback,p.resultMode);
 const entry=data.ranking.find(x=>x.hero.id===hero.id);
 const exp=explanation(hero,data.player);
 const matches=Math.max(0,Math.min(3,Number(p.matches[hero.id]||0)));
 const rating=Number(p.feedback?.[hero.id]?.rating||0);
 const report=hero.tags.slice(0,4).map(t=>'<span>'+escapeHtml(t.replaceAll('-',' '))+'</span>').join('');
 $('#detail').innerHTML='<div class="modal-screen" data-action="close-modal"><section class="detail-sheet" role="dialog" aria-modal="true" aria-label="Информация о герое"><div class="sheet-top"><span>ДОСЬЕ ПЕРСОНАЖА</span><button data-action="close-modal" aria-label="Закрыть">✕</button></div><div class="detail-hero">'+heroMark(hero,true)+'<div><small>'+ROLE_NAMES[hero.role]+'</small><h2>'+escapeHtml(hero.name)+'</h2><div class="detail-score">'+entry.score+' <span>/100</span></div></div></div><div class="detail-two"><div><span>ИНТЕРЕС</span><b>'+entry.enjoyment+'</b></div><div><span>УДОБСТВО</span><b>'+entry.ease+'</b></div></div><h3>Что совпадает</h3><p>'+(exp.matching.length?exp.matching.map(t=>escapeHtml(t.label.toLowerCase())).join(' • '):'Недостаточно ответов для уточнения')+'</p><h3>Что может не понравиться</h3><p>'+(exp.tensions.length?exp.tensions.map(t=>escapeHtml(t.label.toLowerCase())+' — разница '+t.difference).join('; '):'Сильных противоречий в ответах не найдено.')+'</p><h3>Проверка в трёх матчах</h3><div class="match-row"><span>'+matches+'/3 матча</span><button data-action="match" data-hero="'+hero.id+'" '+(matches===3?'disabled':'')+'>Отметить матч +</button><button data-action="reset-match" data-hero="'+hero.id+'">Сбросить</button></div><h3>Как ощущался герой?</h3><div class="rating-row">'+[-2,-1,0,1,2].map(n=>'<button data-action="rate" data-rating="'+n+'" data-hero="'+hero.id+'" class="'+(rating===n?'active':'')+'">'+escapeHtml(feedbackText(n))+'</button>').join('')+'</div><div class="tag-line">'+report+'</div><button class="detail-close" data-action="close-modal">К рейтингу →</button></section></div>';
}
function profiles(){
 shell('<section class="profiles-page"><div class="eyebrow">НЕСКОЛЬКО ИГРОКОВ • ОДНО УСТРОЙСТВО</div><h1>Профили</h1><p>У каждого игрока собственный тест, история матчей и корректировки рейтинга.</p><div class="profile-list">'+state.profiles.map(p=>'<div class="profile-item '+(p.id===state.activeId?'is-active':'')+'"><button data-action="switch-profile" data-id="'+p.id+'"><span class="profile-avatar">'+escapeHtml(p.name[0]||'И')+'</span><span><b>'+escapeHtml(p.name)+'</b><small>'+(p.complete?'Топ-10 готов':p.order.length?'Тест начат':'Без результатов')+'</small></span><i>'+(p.id===state.activeId?'✓':'→')+'</i></button>'+(state.profiles.length>1?'<button class="profile-remove" data-action="ask-delete" data-id="'+p.id+'" aria-label="Удалить профиль '+escapeHtml(p.name)+'">×</button>':'')+'</div>').join('')+'</div><form id="profile-form" class="new-profile"><label for="new-profile-name">Добавить игрока</label><div><input id="new-profile-name" name="playerName" maxlength="28" placeholder="Имя игрока" required autocomplete="off"><button type="submit">Создать +</button></div></form><div class="profile-footer"><button data-action="export" class="secondary-action">Экспорт данных</button><label class="import-label">Импорт данных <input id="import-file" type="file" accept="application/json,.json"></label></div></section>');
}
function duo(){
 const p=active(),others=state.profiles.filter(x=>x.id!==p.id&&x.complete),other=others.find(x=>x.id===state.duoId)||others[0];
 const canUse=p.complete&&other;
 shell('<section class="duo-page"><div class="eyebrow">КОМАНДНАЯ ХИМИЯ</div><h1>Два почерка.<br><em>Один бой.</em></h1><p>Рекомендации учитывают совместимость стилей и сочетание ролей. Это не статистика побед.</p>'+(canUse?'<div class="duo-choose"><label>Первый игрок <b>'+escapeHtml(p.name)+'</b></label><label>Второй игрок <select id="duo-choose">'+others.map(x=>'<option value="'+x.id+'" '+(x.id===other.id?'selected':'')+'>'+escapeHtml(x.name)+'</option>').join('')+'</select></label></div><div class="duo-list">'+pairRecommendations(p,other).map((r,i)=>'<div class="duo-item"><span class="duo-index">'+String(i+1).padStart(2,'0')+'</span>'+heroMark(r.left.hero)+heroMark(r.right.hero)+'<div><b>'+escapeHtml(r.left.hero.name)+' <i>×</i> '+escapeHtml(r.right.hero.name)+'</b><small>'+escapeHtml(p.name)+' + '+escapeHtml(other.name)+' • '+r.score+' очков сочетания</small></div></div>').join('')+'</div>':'<div class="duo-empty"><div class="dna-seal">'+miniIcon()+'</div><h2>Нужно два готовых профиля</h2><p>Пройди тест для каждого игрока. Подбор дуэта появится сразу после этого.</p><button data-action="'+(p.complete?'profiles':'start-full')+'" class="primary-action">'+(p.complete?'Добавить второго →':'Начать тест →')+'</button></div>')+'<button class="secondary-action" data-action="home">← Главная</button></section>');
}
function modalConfirm(){
 if(!confirmAction){$('#detail').innerHTML='';return;}
 const title=confirmAction.type==='restart'?'Начать тест заново?':'Удалить профиль?';
 const desc=confirmAction.type==='restart'?'Текущие ответы будут сброшены. Отзывы о героях сохранятся.':'Результаты, ответы и отзывы выбранного игрока будут удалены.';
 $('#detail').innerHTML='<div class="modal-screen" data-action="dismiss-confirm"><section class="confirm-sheet" role="alertdialog" aria-modal="true" aria-label="'+title+'"><h2>'+title+'</h2><p>'+desc+'</p><div class="confirm-actions"><button data-action="dismiss-confirm">Отмена</button><button data-action="confirm-action" class="danger-action">Подтвердить</button></div></section></div>';
}
function render(){
 document.documentElement.dataset.screen=state.screen;
 if(!verifyDataset()){$('#app').innerHTML='<section class="fatal"><h1>Не удалось загрузить базу героев</h1><a href="../../">Вернуться в Pocket Works</a></section>';return;}
 if(state.screen==='test')renderQuestion();
 else if(state.screen==='result')renderResults();
 else if(state.screen==='profiles')profiles();
 else if(state.screen==='duo')duo();
 else home();
 $('#detail').innerHTML='';
 if(confirmAction)modalConfirm();
 else if(openHero)renderHero();
}
function share(){
 const p=active(),list=rankHeroes(p.answers,p.feedback,p.resultMode).slice(0,10);
 const message='RIVALS DNA — топ-10 для '+p.name+'\n'+list.map((r,i)=>(i+1)+'. '+r.hero.name+' — '+r.score+'/100').join('\n')+'\nПодбор по игровому стилю, без учёта меты.';
 if(navigator.share){navigator.share({title:'RIVALS DNA',text:message}).catch(()=>{});return;}
 if(navigator.clipboard?.writeText){navigator.clipboard.writeText(message).then(()=>announce('Топ-10 скопирован')).catch(()=>announce('Не удалось скопировать.'));}
 else{const t=document.createElement('textarea');t.value=message;document.body.append(t);t.select();try{document.execCommand('copy');announce('Топ-10 скопирован');}catch{announce('Копирование недоступно.');}t.remove();}
}
function exportData(){
 const payload=JSON.stringify({format:'rivals-dna',version:1,exportedAt:new Date().toISOString(),profiles:state.profiles},null,2);
 const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='rivals-dna-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);announce('Резервная копия создана');
}
async function importData(file){
 if(!file||file.size>512000){announce('Нужен файл JSON до 500 КБ');return;}
 try{
   const payload=JSON.parse(await file.text());
   if(payload.format!=='rivals-dna'||payload.version!==1||!Array.isArray(payload.profiles))throw Error('format');
   let added=0;
   for(const imported of payload.profiles.slice(0,20)){
     if(typeof imported?.name!=='string'||state.profiles.length>=20)continue;
     const p=FIRST_PROFILE();p.name=imported.name.slice(0,28)||'Игрок';
     p.answers=Object.fromEntries(Object.entries(imported.answers||{}).filter(([id,n])=>isValidAnswer(byId[id],n)));
     p.mode=imported.mode==='quick'?'quick':'full';
     p.order=Array.isArray(imported.order)?imported.order.filter(id=>byId[id]).slice(0,24):[];
     p.complete=Boolean(imported.complete)&&p.order.length>0&&p.order.every(id=>isValidAnswer(byId[id],p.answers[id]));
     p.position=Math.min(p.order.length-1,Math.max(0,imported.position||0));
     p.feedback=typeof imported.feedback==='object'&&imported.feedback?Object.fromEntries(Object.entries(imported.feedback).filter(([id,r])=>HEROES.some(h=>h.id===id)&&[-2,-1,0,1,2].includes(r?.rating)).map(([id,r])=>[id,{rating:r.rating}])):{};
     p.matches=typeof imported.matches==='object'&&imported.matches?Object.fromEntries(Object.entries(imported.matches).filter(([id,n])=>HEROES.some(h=>h.id===id)&&Number.isInteger(n)&&n>=0&&n<=3)):{};
     state.profiles.push(p);added++;
   }
   save();render();announce('Импортировано профилей: '+added);
 }catch{announce('Не удалось прочитать файл RIVALS DNA');}
}
$('#app').addEventListener('submit',event=>{
 if(event.target.id!=='profile-form')return;event.preventDefault();
 const field=$('#new-profile-name'),name=field.value.trim();
 if(!name||state.profiles.length>=20){announce('Имя обязательно; максимум 20 игроков');return;}
 const p=FIRST_PROFILE();p.name=name.slice(0,28);state.profiles.push(p);state.activeId=p.id;go('home');announce('Профиль создан');
});
$('#app').addEventListener('input',event=>{
 const el=event.target;
 if(el.matches('input[type=range][data-question]')){
   const p=active();p.answers[el.dataset.question]=Number(el.value);save();
   const badge=$('#scale-value');if(badge)badge.textContent=['Совсем нет','Скорее нет','Посередине','Скорее да','Очень'][Number(el.value)];
   const next=$('.next');if(next)next.disabled=false;
   const notice=$('.scale-notice');if(notice)notice.textContent='Ответ сохранён';
 }
});
$('#app').addEventListener('change',event=>{
 if(event.target.id==='duo-choose'){state.duoId=event.target.value;save();render();}
 if(event.target.id==='import-file')importData(event.target.files?.[0]);
});
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-action]');if(!target)return;
 const act=target.dataset.action,p=active();
 if(confirmAction&&!['dismiss-confirm','confirm-action'].includes(act))return;
 if(act==='home'){confirmAction=null;go('home');}
 else if(act==='profiles')go('profiles');
 else if(act==='duo')go('duo');
 else if(act==='start-full')start('full');
 else if(act==='start-quick')start('quick');
 else if(act==='retake')start(p.mode);
 else if(act==='continue')go('test');
 else if(act==='results')go('result');
 else if(act==='choose'){
   const q=byId[p.order[p.position]],value=Number(target.dataset.index);
   if(isValidAnswer(q,value)){p.answers[q.id]=value;save();render();}
 }else if(act==='next')next();
 else if(act==='back'){if(p.position===0)go('home');else{p.position--;save();render();}}
 else if(act==='result-mode'){p.resultMode=target.dataset.mode==='easy'?'easy':'joy';save();render();}
 else if(act==='hero'){openHero=target.dataset.hero;renderHero();}
 else if(act==='close-modal'){if(target.classList.contains('modal-screen')&&event.target!==target)return;openHero=null;$('#detail').innerHTML='';}
 else if(act==='rate'){const id=target.dataset.hero;p.feedback[id]={rating:Number(target.dataset.rating)};save();render();openHero=id;renderHero();announce('Подбор обновлён по твоей оценке');}
 else if(act==='match'){const id=target.dataset.hero;p.matches[id]=Math.min(3,Number(p.matches[id]||0)+1);save();renderHero();if(p.matches[id]===3)announce('Три матча: оцени, понравился ли герой');}
 else if(act==='reset-match'){p.matches[target.dataset.hero]=0;save();renderHero();}
 else if(act==='switch-profile'){state.activeId=target.dataset.id;go('home');}
 else if(act==='ask-delete'){confirmAction={type:'delete',id:target.dataset.id};modalConfirm();}
 else if(act==='dismiss-confirm'){confirmAction=null;$('#detail').innerHTML='';}
 else if(act==='confirm-action'){
   if(confirmAction.type==='restart'){const mode=confirmAction.mode;confirmAction=null;restart(mode);}
   else {const id=confirmAction.id;state.profiles=state.profiles.filter(x=>x.id!==id);if(!state.profiles.some(x=>x.id===state.activeId))state.activeId=state.profiles[0].id;confirmAction=null;go('profiles');}
 }
 else if(act==='share')share();
 else if(act==='export')exportData();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){if(confirmAction){confirmAction=null;$('#detail').innerHTML='';}else if(openHero){openHero=null;$('#detail').innerHTML='';}else if(state.screen!=='home')go('home');}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
window.addEventListener('pagehide',save);
window.__RIVALS_DNA_QA={getState:()=>({screen:state.screen,profile:active().name,progress:active().position,complete:active().complete,count:HEROES.length,top:active().complete?rankHeroes(active().answers,active().feedback).slice(0,10).map(x=>x.hero.id):[]})};
render();
