import {exhibitFacets} from './exhibition-ui.js';
// The exhibition's final three beats share the same dossier hierarchy.
// Pure markup lets Playwright render real cards without a live PocketNet room.
export const FINALE_REVISION='1.39.0';
const safe=(escapeText,value)=>escapeText(String(value??''));
const totalFor=(score)=>Math.max(0,Number(score?.mask)||0)+Math.max(0,Number(score?.eye)||0);
export function finaleVerdictMarkup({view:v,artworks,artworkURL,escapeText,head,chipDots,hostId}){
 const g=v.gallery?.[v.turn],players=v.participants||[];
 if(!g)return '';
 const balloters=players.filter(p=>p.id!==g.id);
 const totals=v.selected.map((id,i)=>Object.values(g.votes||{}).reduce((sum,ballot)=>sum+(Array.isArray(ballot)?(Number(ballot[i])||0):0),0));
 const largest=Math.max(1,...totals),count=totals.reduce((a,b)=>a+b,0);
 const tagged=totals.map((n,i)=>({n,i})).sort((a,b)=>b.n-a.n||a.i-b.i)[0];
 const votesFor=i=>balloters.flatMap(p=>Array.from({length:Math.max(0,Math.min(3,Number(g.votes?.[p.id]?.[i])||0))},()=>p.name));
 const label=s=>safe(escapeText,s);
 const cards=v.selected.map((id,i)=>{
  const art=artworks[id]||{},voters=votesFor(i),count=totals[i];
  return '<article class="verdict-card finale-ballot-card'+(count===largest&&count>0?' has-majority':'')+(i===tagged.i?' is-featured':'')+'" style="--case-index:'+i+';--vote-ratio:'+(100*count/largest).toFixed(1)+'%;--vote-scale:'+(0.84+0.16*count/largest).toFixed(3)+'">'+
   '<div class="zam-exhibit-stage" data-exhibit-stage><div class="verdict-image zam-exhibit-rim">'+exhibitFacets()+'<img data-art-id="'+id+'" src="'+artworkURL(id)+'" alt="'+label(art.title||'Полотно')+'"></div></div>'+
   '<div class="finale-ballot-votes" aria-label="'+count+' фишек"><div class="finale-vote-tally"><span>Поставлено</span><strong aria-label="'+count+' фишек">'+count+'</strong></div>'+
   '<div class="finale-vote-bar" role="img" aria-label="Ставки: '+count+'"><i></i></div>'+
   '<div class="verdict-tokens" role="img" aria-label="'+count+' фишек">'+chipDots(count)+'</div>'+
   '<small class="finale-voters">'+label(voters.length?voters.join(' · '):'Без ставок')+'</small></div></article>';
 }).join('');
 return '<section class="phase-page verdict-phase finale-scene" data-finale-phase="ballot">'+
  head('ДЕЛО '+String(v.turn+1).padStart(2,'0')+' · ПРОТОКОЛ','Ставки вскрыты',v.deadline)+
  '<div class="phase-body finale-verdict-body"><div class="finale-overview"><div><span class="finale-overline">ЭКСПЕРТИЗА / '+(v.turn+1)+' ИЗ '+players.length+'</span><h3>Куда легли фишки?</h3><p>Реставратор — '+label(g.name)+'. Подлинник пока скрыт.</p></div>'+
  '<div class="finale-ledger" aria-label="Всего поставлено фишек"><span>ЗАРЕГИСТРИРОВАНО</span><strong>'+count+'</strong><small>фишек</small></div></div>'+
  '<div class="verdict-gallery finale-ballot-grid">'+cards+'</div>'+
  '<footer class="verdict-footer finale-verdict-footer"><span><i class="finale-live-dot"></i> Протокол составлен. Следом — разоблачение.</span>'+
  (v.host===hostId?'<button class="btn primary" data-action="advance">Вскрыть полотно <span aria-hidden="true">→</span></button>':'<div class="finale-wait-label"><span class="busy" aria-hidden="true"></span> Ожидаем организатора</div>')+'</footer></div></section>';
}
export function finaleResultsMarkup({view:v,escapeText,memberSeal,pocketPlayerBadge,hostId}){
 const label=s=>safe(escapeText,s);
 const people=[...(v.participants||[])];
 const scored=people.map(p=>({person:p,mask:Math.max(0,Number(v.scores?.[p.id]?.mask)||0),eye:Math.max(0,Number(v.scores?.[p.id]?.eye)||0)}))
  .sort((a,b)=>(b.mask+b.eye)-(a.mask+a.eye));
 if(!scored.length)return '<section class="page finale-results"><h2>Результаты недоступны</h2><button class="btn ghost" data-action="menu">В главное меню</button></section>';
 const total=s=>s.mask+s.eye,winner=scored[0],max=Math.max(1,...scored.map(total)),ties=scored.filter(s=>total(s)===total(winner)).length;
 const points=n=>n+' очк.';
 const ranking=scored.map((s,i)=>{
  const rank=1+scored.filter(x=>total(x)>total(s)).length;
  const pos=i===0?'is-leading':'';
  return '<article class="finale-ranking-row '+pos+'" style="--rank-index:'+i+'" aria-label="Место '+rank+': '+label(s.person.name)+', '+total(s)+' очков">'+
    '<span class="finale-ranking-place">'+String(rank).padStart(2,'0')+'</span>'+
    '<div class="finale-ranking-name">'+memberSeal(s.person)+'<span><strong>'+label(s.person.name)+pocketPlayerBadge(s.person)+'</strong><small>'+((rank===1)?'Верхняя строка каталога':'Участник выставки')+'</small></span></div>'+
    '<div class="finale-ranking-score"><b>'+total(s)+'</b><small>очков</small></div>'+
    '<div class="finale-score-breakdown"><span>Маскировка <b>'+s.mask+'</b></span><span>Экспертиза <b>'+s.eye+'</b></span></div>'+
    '<div class="finale-score-track" aria-hidden="true"><span style="width:'+(100*s.mask/max).toFixed(2)+'%"></span><i style="width:'+(100*s.eye/max).toFixed(2)+'%"></i></div>'+
   '</article>';
 }).join('');
 return '<section class="page finale-results finale-scene" data-finale-phase="results">'+
  '<header class="finale-results-head"><span class="finale-overline">ПОДВЕДЕНИЕ ИТОГОВ / ЭКСПОЗИЦИЯ ЗАКРЫТА</span><h2>Каталог победителей</h2><p>'+(v.timedScoring?'Точность, скорость и выдержка входят в итоговый счёт.':'Обман и наблюдательность оцениваются отдельно.')+'</p></header>'+
  '<div class="finale-results-main"><div class="finale-laureate"><span class="finale-laureate-hatch" aria-hidden="true"></span>'+
   '<div class="finale-laureate-seal" aria-hidden="true"><span>❦</span><i>Ⅰ</i></div><div class="finale-laureate-label">'+(ties>1?'ПЕРВОЕ МЕСТО РАЗДЕЛИЛИ':'ЛАУРЕАТ ВЫСТАВКИ')+'</div>'+
   '<div class="finale-laureate-person">'+memberSeal(winner.person)+'<div><h3>'+label(winner.person.name)+'</h3><p>'+(ties>1?'Лидеров с равным счётом: '+ties:'Первое место в каталоге')+'</p></div></div>'+
   '<div class="finale-laureate-total"><strong>'+total(winner)+'</strong><span>ОЧКОВ</span></div>'+
   '<div class="finale-laureate-split"><div><span>МАСКИРОВКА</span><b>'+winner.mask+'</b></div><div><span>ЭКСПЕРТИЗА</span><b>'+winner.eye+'</b></div></div>'+
   '</div>'+
   '<div class="finale-ledger-panel"><div class="finale-ledger-heading"><span class="finale-overline">ПОЛНАЯ ВЕДОМОСТЬ</span><strong>'+scored.length+' участников</strong></div>'+
   '<div class="results-shelf finale-ranking">'+ranking+'</div></div></div>'+
   '<footer class="finale-results-actions">'+
    (v.host===hostId?'<button class="btn primary" data-action="next">Новая выставка <span aria-hidden="true">→</span></button>':'<span class="finale-wait-label">Новую выставку начинает организатор</span>')+
    '<button class="btn ghost" data-action="achievements">Награды</button>'+
    '<button class="btn ghost" data-action="menu">В главное меню</button></footer></section>';
}
export function finaleRevealAuditMarkup({breakdown,wrong,bonus,authorExtras=null,escapeText,chipDots}){
 const endurance=Math.max(0,Number(authorExtras?.endurance)||0);
 const undetected=Math.max(0,Number(authorExtras?.undetected)||0);
 return '<div class="finale-audit-heading"><span class="finale-overline">ГОЛОСА</span></div>'+
  '<div class="audit-lines finale-audit-lines">'+breakdown.map((x,i)=>
   '<div class="audit-line" style="--case-index:'+i+'"><span>'+safe(escapeText,x.name)+'</span>'+
   '<div class="finale-jury-coins" role="img" aria-label="'+x.correct+' верных и '+x.wrong+' ошибочных фишек">'+
   '<span class="correct-coins">'+chipDots(x.correct)+'</span><span class="missed-coins">'+chipDots(x.wrong)+'</span>'+
   '</div><strong>+'+x.points+(x.speed>0?'<small class="audit-speed">включая +'+x.speed+' за скорость</small>':'')+'</strong></div>').join('')+'</div>'+
  '<div class="outcome-bonus finale-bonus"><span>'+(authorExtras?'Маскировка · '+wrong+' неверных монет':wrong+' фишек мимо — очки реставратору')+
   (authorExtras?'<small class="audit-endurance">'+(endurance?'Выдержка +'+endurance:'')+
    (endurance&&undetected?' · ':'')+(undetected?'Не разгадали +'+undetected:'')+'</small>':'')+
   '</span><strong>+'+bonus+'</strong></div>';
}
