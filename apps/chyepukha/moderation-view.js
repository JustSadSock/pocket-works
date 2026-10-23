const clean=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function moderationStrip(view,me){
 if(!view||view.phase!=='writing')return '';
 const host=view.host===me,paused=view.paused===true;
 return '<div class="mod-strip" role="group" aria-label="Управління партією"><span class="mod-room-state">'+(paused?'ПАУЗА · РУКОПИСИ ЗБЕРЕЖЕНО':'ПАРТІЯ · '+String(view.round+1)+' / '+view.total)+'</span><div class="mod-strip-actions">'+(host?'<button type="button" data-act="mod-toggle-pause">'+(paused?'Продовжити':'Пауза')+'</button><button type="button" data-act="mod-open">Учасники'+(view.waitlist?.length?' · '+view.waitlist.length:'')+'</button>':!view.onlineIds?.includes(view.host)?'<button type="button" data-act="mod-open">Ведучий відсутній</button>':'')+'</div></div>';
}
export function moderationModal(view,me,targetId){
 const host=view.host===me;
 const target=view.players.find(p=>p.id===targetId);
 const candidates=(view.waitlist||[]).filter(p=>view.onlineIds?.includes(p.id));
 const listing=view.players.map(p=>'<button type="button" data-act="mod-select" data-id="'+clean(p.id)+'" class="mod-person '+(targetId===p.id?'is-selected':'')+'"><span class="mod-avatar">'+clean(p.name.charAt(0).toUpperCase())+'</span><span><b>'+clean(p.name)+'</b><small>'+(p.autoSkip?'Пропуск фрагментів':p.vacant?'Місце вільне':p.departed?'Не в мережі':p.submitted?'Здано':'Пише')+(p.id===view.host?' · Ведучий':'')+'</small></span><span aria-hidden="true">›</span></button>').join('');
 const selected=target&&host?'<div class="mod-person-actions"><strong>'+clean(target.name)+'</strong>'+(target.id!==me?'<button data-act="mod-ask-kick" type="button">Виключити з кімнати</button>':'')+(target.id!==me&&!target.vacant&&!target.departed&&view.onlineIds?.includes(target.id)?'<button data-act="mod-transfer" type="button">Призначити ведучим</button>':'')+(target.vacant&&candidates.length?'<div class="mod-candidates"><span>Передати місце:</span>'+candidates.map(p=>'<button type="button" data-act="mod-assign" data-id="'+clean(p.id)+'">'+clean(p.name)+' →</button>').join('')+'</div>':'')+(target.vacant&&!target.autoSkip?'<button data-act="mod-ask-skip" type="button">Пропускати порожнє місце</button>':'')+'</div>':'';
 const voting=!host&&view.hostOfflineSince&&view.onlineIds&&!view.onlineIds.includes(view.host)?'<div class="mod-vote"><p>Ведучий відсутній. Через п’ять хвилин автори можуть обрати нового.</p>'+view.players.filter(p=>!p.departed&&!p.vacant&&!p.autoSkip).map(p=>'<button type="button" data-act="mod-vote" data-id="'+clean(p.id)+'">Голос за '+clean(p.name)+'</button>').join('')+'</div>':'';
 return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Учасники партії"><section class="comic-inner mod-panel"><header class="mod-header"><div><div class="eyebrow">РЕДАКЦІЯ</div><h3>Автори партії</h3></div><button type="button" data-act="mod-close" aria-label="Закрити">×</button></header><div class="mod-list">'+listing+'</div>'+selected+(host&&candidates.length?'<div class="mod-waitlist"><div class="eyebrow">ОЧІКУЮТЬ ПРИЗНАЧЕННЯ</div>'+candidates.map(p=>'<p>'+clean(p.name)+' — обери порожнє місце вище</p>').join('')+'</div>':'')+voting+'<button type="button" class="button outline" data-act="mod-close">Готово</button></section></div>';
}
export function candidateWaiting(){
 return '<section class="paper waiting mod-candidate"><div class="eyebrow">НОВИЙ АВТОР</div><h2>Очікуємо запрошення до аркуша</h2><p>Ведучий бачить твою заявку і може передати тобі вільне місце. Попередні рукописи інших авторів залишаються прихованими.</p><button class="leave" data-act="leave" type="button">Вийти з кімнати</button></section>';
}
export function pauseOverlay(isHost){
 return '<div class="mod-pause-overlay"><section class="mod-pause-paper"><div class="eyebrow">ПАРТІЯ ПРИЗУПИНЕНА</div><h2>Аркуші збережено</h2><p>Можна продовжити з того самого раунду.</p>'+(isHost?'<button class="button" data-act="mod-toggle-pause" type="button">Продовжити писати</button>':'<p class="mini">Чекаємо рішення ведучого.</p>')+'</section></div>';
}
