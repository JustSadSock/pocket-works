const SHORT_HERO={
 'Doctor Strange':'Стрэндж','Loki':'Локи','Mister Fantastic':'Мистер Фантастик','Star-lord':'Стар-Лорд',
 'Gambit':'Гамбит','Black Panther':'Чёрная Пантера','Groot':'Грут','Peni Parker':'Пени Паркер',
 'Adam Warlock':'Адам Уорлок','The Thing':'Существо','Invisible Woman':'Женщина-невидимка',
 'Cloak & Dagger':'Плащ и Кинжал','Scarlet Witch':'Алая Ведьма','Magik':'Мэджик',
 'Jeff The Land Shark':'Джефф','Rocket Raccoon':'Ракета','Squirrel Girl':'Девушка-белка',
 'Spider-man':'Человек-паук','White Fox':'Белая Лисица','Phoenix':'Феникс'
};
const balanceUrl='https://www.marvelrivals.com/balancepost/20261110/41667_1319209.html';
const displayHero=h=>SHORT_HERO[h]||h;
const siteDate='16 ноября 2026';
for(const id of ['a','b'])Object.assign(PROFILES[id],SNAPSHOT.profiles[id]);
SOURCES.unshift(['Обновление баланса S11',balanceUrl,'Изменения с 13 ноября 2026.']);
CHAPTERS[0][1]='Наши герои';
const freshHero=(id,h,ranked=false)=>DATA[id+(ranked?'c':'')].find(r=>r.hero===h);
function roster(id){
 const rs=DATA[id].slice().sort((a,b)=>b.n-a.n||b.seconds-a.seconds).slice(0,10);
 const pl=PROFILES[id];
 return `<section class="roster-sheet roster-${id}" aria-labelledby="roster-${id}">
  <div class="roster-label"><div><h2 tabindex="-1" id="roster-${id}">${id==='a'?'JustSadSock':'Яся'}</h2><small>${id==='a'?pl.time:pl.name+' · '+pl.time}</small></div><span><strong>${fmt(pl.games,0)}</strong><small>матчей</small></span></div>
  <div class="roster-columns"><span>Герой</span><span>Игры</span><span>Победы</span></div>
  <ol>${rs.map((r,i)=>`<li><button class="roster-slot${i===0?' roster-lead':''}" data-roster-player="${id}" data-roster-hero="${esc(r.hero)}" style="--share:${100*r.n/rs[0].n}%"><span class="slot-rank">${String(i+1).padStart(2,'0')}</span>${img(r.hero)}<span class="slot-name">${displayHero(r.hero)}<i></i></span><b>${r.n}</b><span class="slot-wr">${fmt(r.wr)}%</span></button></li>`).join('')}</ol></section>`;
}
function currentVerdict(){
 const lines=[
  ['Рейтинг · 20+ игр',outcomeLeaders(account,'ranked',20)[0],'ranked'],
  ['Карьера · 50+ игр',outcomeLeaders(account,'all',50)[0],'all']
 ];
 return `<section class="fresh-verdict" aria-labelledby="strength-title"><h2 id="strength-title">Кто выигрывает чаще: ${account==='a'?'JustSadSock':'Яся'}</h2>
 <div class="grid">${lines.map(([label,r,mode])=>r?`<article class="card"><p class="eyebrow">${label}</p><h3>${displayHero(r.hero)}</h3><p class="metric">${fmt(r.wr)}%</p><p>${r.wins} побед из ${r.n}</p><button class="text-button" data-roster-player="${account}" data-roster-hero="${esc(r.hero)}" data-roster-mode="${mode}">Карточка героя →</button></article>`:'').join('')}</div>
 <p>${account==='a'?'Локи — почти самый наигранный герой, а Гамбит пока чаще выигрывает в рейтинге. У Гамбита мало свежих ranked-матчей: результат преимущественно из S9.5.':'Алая Ведьма лидирует по карьерному ranked-WR при пороге 20 игр, но её 23 матча дают гораздо менее устойчивый ориентир, чем 170 игр Невидимки. Для текущей практики важнее её 27/54 в S10.5.'}</p>
 <details class="strength-method"><summary>Посмотреть рейтинг своих героев и изменить порог</summary><div class="controls"><label>Срез <select id="strengthMode"><option value="ranked" ${strengthMode==='ranked'?'selected':''}>Только ranked</option><option value="all" ${strengthMode==='all'?'selected':''}>Вся карьера</option></select></label><label>Минимум игр <select id="strengthMinimum">${[5,20,50,100].map(n=>`<option value="${n}" ${strengthMinimum===n?'selected':''}>${n}</option>`).join('')}</select></label></div><div id="outcomeTable">${outcomeTable()}</div></details></section>`;
}
relativeAnswer=function(){
 const rs=[['wrTop','победам'],['dpmTop','урону в минуту'],['hpmTop','лечению в минуту'],['kdaTop','KDA']];
 return rs.map(([k,label])=>{const r=relativeLeaders(account,k)[0];return r?`${displayHero(r.hero)} — TOP ${fmt(r[k],2)}% по ${label}`:''}).filter(Boolean).join('; ')+'. Это позиции RivalsMeta среди игроков на том же герое для доступных метрик.';
};
relativePanel=function(){return `<section class="relative-summary"><p class="eyebrow">По сравнению с игроками на том же герое</p><h2>Где вы выше середины?</h2><p class="lead">${relativeAnswer()}</p><div class="controls"><label>Показатель <select id="relativeMetric">${Object.entries(RELATIVE_LABELS).map(([k,v])=>`<option value="${k}" ${relativeMetric===k?'selected':''}>${v}</option>`).join('')}</select></label></div><div id="relativeTable">${relativeTable()}</div></section>`};
brief=function(){
 return `<div class="roster-heading"><div><p class="eyebrow">Marvel Rivals · ${siteDate}</p><h1>Наши герои</h1><p>Топ‑10 каждого по числу зачтённых матчей за всю карьеру.</p><button class="roster-jump text-button" data-roster-jump>Сразу к ростеру Яси ↓</button></div><button class="team-ticket" data-go="duo"><strong>${fmt(DUO_AUDIT.officialSharedMatches,0)}</strong><span>совместных матчей →</span></button></div><div class="roster-board">${roster('a')}${roster('b')}</div>
 <p class="small">Все режимы. Нажмите на героя, чтобы открыть статистику и перейти к его сезонам.</p>${currentVerdict()}`;
};
level=function(){
 const rr=RANKS[account];
 return `${intro(5,'Рейтинг по сезонам','Счёт, доля побед и сравнение с игроками на тех же героях.')}
 <div class="stats">${stat(p().rank,'ранг в сохранённом профиле S11')}${stat(fmt(p().rs,0),'очков S11')}${stat(p().peak,'пик в сохранённом профиле S11')}</div>
 <div class="table-wrap"><table><thead><tr><th>Сезон</th><th>Ranked</th><th>WR</th><th>RS</th><th>Пик RS</th></tr></thead><tbody>${rr.map(([s,n,wr,rs,peak])=>`<tr><td>S${s}</td><td>${n}</td><td>${fmt(wr)}%</td><td>${fmt(rs,0)}</td><td>${fmt(peak,0)}</td></tr>`).join('')}</tbody></table></div>
 <p class="small">RS — профиль игры; WR — матчи, учтённые трекером. В начале S11 эти выборки могут расходиться.</p>${relativePanel()}`;
};
function freshProgressStory(rs){
 const latest=rs.at(-1), prior=rs.at(-2);
 if(!latest)return '';
 const result=`S${latest.season}: ${latest.n} игр, ${fmt(latest.wr)}% побед, ${fmt(latest.deaths)} смертей за игру.`;
 return prior?result+` В S${prior.season} было ${prior.n} игр и ${fmt(prior.wr)}% побед.`:result;
}
const earlierImpact=impactBeforeDefense;
impact=function(){
 const d=DEFENSE_SNAPSHOT[account], r=freshHero(account,impactHero);
 return `<section class="defense-panel" id="defense-panel"><h2>Входящий урон и защита</h2><p>${r?.takenPm==null?'Для выбранного героя нет данных о входящем уроне.':`На ${displayHero(impactHero)} — <b>${fmt(r.takenPm,0)} входящего урона в минуту</b> за карьеру.`} Входящий урон показывает нагрузку на вашу позицию. Щиты, спасения и отбитые заходы требуют отдельной оценки.</p><p class="small"><a href="${d.source}" target="_blank" rel="noopener">Архив Tracker.gg от 21 октября</a>: ${fmt(d.blocked,0)} по полю Damage Blocked на аккаунте целиком. Ноябрьской разбивки по героям для этого показателя нет.</p></section>`+earlierImpact();
};
const oldMaps=mapsPage;
mapsPage=function(){
 const content=oldMaps();
 return content.replace(/<div class="split">[\s\S]*?<\/div><div class="controls">/,'<div class="controls">').replace('Агрегация видимых таблиц Maps по всем доступным сезонам.','Пересчитано по ноябрьскому журналу матчей. Учитываются завершённые записи с решённым исходом.');
};
const priorDuo=duo;
duo=function(){
 const body=priorDuo(), ranked=DUO_MATCHES.filter(r=>r[1]==='Competitive'), quick=DUO_MATCHES.filter(r=>r[1]==='Quick Play');
 const a=pairStats(ranked.filter(r=>r[0]==='10.5')).filter(r=>r.n>=8).sort((x,y)=>y.wr-x.wr||y.n-x.n).slice(0,3);
 const start=body.indexOf('<div class="stats">'),controls=body.indexOf('<div class="controls">',start);
 const top=`<div class="stats">${stat(fmt(DUO_AUDIT.officialSharedMatches,0),'совместных матчей по RivalsMeta')}${stat(ranked.length,'рейтинговых записей по ID')}${stat(quick.length,'записей Quick Play по ID')}</div><section class="card"><h3>Свежие пары · S10.5 ranked</h3><p>${a.map(r=>`${displayHero(r.a)} + ${displayHero(r.b)} — <b>${r.w}/${r.n}</b>`).join(' · ')}</p><p class="small">От восьми матчей. Для таблицы берём общий ID матча, одну команду и совпавший исход; выходы и ничьи исключаем. Показанный герой мог меняться в матче.</p></section>`;
 return body.slice(0,start)+top+body.slice(controls);
};
const newHeroDetail=showHeroBeforeDefense;
showHero=function(name,mode=heroMode){
 const r=freshHero(account,name,mode==='ranked');if(!r)return;
 newHeroDetail(name,mode);
 $('#heroDetail').insertAdjacentHTML('beforeend',`<section class="hero-load"><h3>Входящий урон</h3><p><b>${fmt(r.takenPm,0)} / мин</b> · ${mode==='ranked'?'карьерный ranked':'вся карьера'}. Это нагрузка, которую отмечает RivalsMeta; сколько герой заблокировал или предотвратил, трекер в этом срезе не показывает.</p><button class="text-button" data-defense-details>Как оценивать защиту →</button></section>`);
};
const beforeFreshFuture=future;
future=function(){
 const old=beforeFreshFuture(),at=old.indexOf('<div class="section-head">');
 const tip=account==='a'?`<h2 id="development-verdict">Гамбит — тест для рейтинга, Локи — второй мейн</h2><p>Гамбит: 15/27 в карьерном ranked. Локи: 16/40, зато 313 игр суммарно и много практики на рунах, клонах и копиях ульты. У Гамбита лишь один ranked-матч вне S9.5; сравнение S11 ещё впереди.</p><p><b>План:</b> Гамбит — отработать дистанцию после увеличения разброса и оставить рывок на выход; Локи — готовить безопасного клона и заранее выбирать цель для копии. Сыграйте оба блока с Ясей в одном режиме. Для танка проверьте Грута: 10/16 в S10.5.</p>`:`<h2 id="development-verdict">Невидимка — основа, C&D — второй выбор</h2><p>В S10.5 на Невидимке 27/54 в ranked, на C&D — 7/18. У Невидимки ставьте щит заранее и держите отталкивание под заход. У C&D отрабатывайте попадания завесой по нескольким целям: в S11 это ускоряет возврат Dagger Storm.</p><p>На другой роли оставьте Мэджик. Эмма — более свежая проба для контроля: 7/13 в QP S10.5; ближняя форма переносит привычку ловить момент для входа, дальняя требует отдельной практики.</p>`;
 return old.slice(0,at)+`<section class="verdict">${tip}<a href="${balanceUrl}" target="_blank" rel="noopener">Что изменилось в S11 ↗</a></section>`+old.slice(at);
};
sources=function(){return `<h1>Данные и источники</h1><section class="card"><h2>Срез ${siteDate}</h2><p><a href="https://rivalsmeta.com/player/1480038980?tab=all-time">JustSadSock</a> и <a href="https://rivalsmeta.com/player/1689724361?tab=all-time">Hioydfts</a> · RivalsMeta. Выгружены All Time, сезонные герои и журнал: ${fmt(DUO_AUDIT.historyCounts.a,0)} / ${fmt(DUO_AUDIT.historyCounts.b,0)} записей. Новейший видимый матч в обоих журналах: ${SNAPSHOT.players.a.trackerLastMatch} (UTC).</p>
 <p>Карьерные рейтинги по героям суммируют записи по режимам; смены героя могут влиять на учёт. Сезоны и карты считаются отдельно. TOP = 100 минус перцентиль источника; это не процент прироста над средним. «Входящий урон» — поле Damage Taken.</p>
 <p>RivalsMeta указывает 1 666 общих матчей в обоих профилях, но счётчик побед расходится (840 и 852). Для пар используем ${fmt(DUO_AUDIT.standardMatched,0)} записей Quick Play и Competitive с общим ID и проверенным исходом. Режим, патч и состав меняют результат; таблица пар не доказывает синергию.</p><button class="secondary" id="download">Выгрузить JSON ↓</button></section>
 <div class="source-list">${SOURCES.map(([name,url,note])=>`<p><a href="${url}" target="_blank" rel="noopener">${name} ↗</a> · ${note}</p>`).join('')}</div>`};
document.addEventListener('click',e=>{
 if(e.target.closest('[data-roster-jump]')){
  const heading=$('#roster-b');
  heading.scrollIntoView({block:'start'});
  heading.focus({preventScroll:true});
  return;
 }
 const b=e.target.closest('[data-roster-hero]');
 if(!b)return;
 account=b.dataset.rosterPlayer;
 document.querySelectorAll('[data-account]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.account===account));
 showHero(b.dataset.rosterHero,b.dataset.rosterMode||'all');
 $('#heroDialog').addEventListener('close',()=>{if(chapter==='brief'){const offset=scrollY;render();window.scrollTo({top:offset,behavior:'instant'});document.querySelector(`[data-roster-player="${b.dataset.rosterPlayer}"][data-roster-hero="${CSS.escape(b.dataset.rosterHero)}"]`)?.focus({preventScroll:true});}},{once:true});
});
NOTES.a['Gambit']='Карьерный ranked: 15/27, в основном из S9.5. В QP S10.5 — 4/13. Проверьте заново на S11, с приоритетом выживания.';
NOTES.a['Loki']='313 игр за карьеру. S10.5: 37/76 в Quick Play. Ваш лучший ориентир для рейтинга — свежая совместная проверка рун, выбора ульты и позиционирования.';
NOTES.a['Mister Fantastic']='В ranked S10.5 — 6/11. Этот срез заметно свежее длинной истории S8 и пока слишком мал для итогового вердикта.';
NOTES.a['Peni Parker']='В S10.5 — 17 побед из 26 игр Quick Play. Рейтинговый срез: 10 побед из 19 игр за карьеру.';
NOTES.b['Invisible Woman']='S10.5: 27/54 в ranked, 69/126 в Quick Play. Большой свежий срез делает её лучшим кандидатом на основной пик Яси.';
NOTES.b['Cloak & Dagger']='S10.5: 7/18 в ranked. В S11 два вида завесы могут ускорять восстановление Dagger Storm. Тренируйте попадание завесами через несколько целей.';
for(const [id,updates] of Object.entries({a:{Gambit:NOTES.a.Gambit,Loki:NOTES.a.Loki,'Peni Parker':NOTES.a['Peni Parker'],'Mister Fantastic':NOTES.a['Mister Fantastic']},b:{'Invisible Woman':NOTES.b['Invisible Woman'],'Cloak & Dagger':NOTES.b['Cloak & Dagger']}})){
 for(const r of RECS[id])if(updates[r[1]])r[3]=updates[r[1]];
}
render();
