// Small, purpose-built editorial host controls. All permissions are checked
// again in the authoritative PocketNet v6 module.
const safe=(x,escape)=>escape(String(x??''));
export function controlsBar(view,me,version,escape){
 if(version!=='v6'||!view||!['lobby','writing'].includes(view.phase))return '';
 const h=view.host===me,paused=view.paused;
 return '<div class="moderation-bar"><span class="moderation-state">'+(paused?'ПАУЗА · РУКОПИСИ ЗБЕРЕЖЕНІ':'РЕДАКЦІЯ · '+(view.round+1)+' / '+(view.total||'—'))+'</span><div class="moderation-actions">'+(h&&view.phase==='writing'?'<button type="button" class="moderation-pause" data-act="'+(paused?'unpause':'pause')+'">'+(paused?'Продовжити':'Пауза')+'</button>':'')+'<button type="button" data-act="manage-players" class="moderation-manage">'+(h?'Керування':'Учасники')+' <span aria-hidden="true">↗</span></button></div></div>';
}
export function controlsDialog(view,me,escape){
 if(!view)return '';
 const host=view.host===me,players=view.players||[];
 const rows=players.map(p=>{
  const self=p.id===me,here=!p.departed&&!p.excluded;
  const status=p.excluded?'Виключено':p.departed?'Не в мережі':p.submitted?'Здав рукопис':'Пише';
  const commands=host&&!self?
   '<div class="moderation-person-actions">'+(here?'<button type="button" data-act="transfer-host" data-id="'+safe(p.id,escape)+'">Зробити ведучим</button>':'<button type="button" data-act="open-seat" data-id="'+safe(p.id,escape)+'">Замінити автора</button>')+
   (!here&&!p.submitted&&view.phase==='writing'?'<button type="button" data-act="ask-skip" data-id="'+safe(p.id,escape)+'">Пропустити фрагмент</button>':'')+
   (!p.excluded?'<button type="button" data-act="ask-kick" data-id="'+safe(p.id,escape)+'">Виключити</button>':'')+'</div>':
   (!host&&!self&&here&&view.hostOfflineSince?'<button type="button" data-act="vote-host" data-id="'+safe(p.id,escape)+'">Голосувати за ведучого</button>':'');
  return '<div class="moderation-person"><div class="moderation-person-info"><strong>'+safe(p.name,escape)+'</strong><small>'+(p.id===view.host?'Ведучий · ':'')+status+'</small></div>'+commands+'</div>';
 }).join('');
 const token=host&&view.claim?'<div class="moderation-ticket"><small>КОД ЗАМІНИ · '+safe(players.find(p=>p.id===view.claim.seatId)?.name||'Місце',escape)+'</small><strong>'+safe(view.claim.code,escape)+'</strong><p>Передай цей код новому автору разом із кодом кімнати. Дійсний 10 хвилин, лише для одного входу.</p><button type="button" data-act="copy-seat-code">Копіювати код</button><button type="button" data-act="close-seat">Скасувати заміну</button></div>':'';
 const note=!host&&view.hostOfflineSince?'<p class="mini">Якщо ведучий не повернеться протягом 5 хвилин, більшість присутніх зможе обрати нового.</p>':'';
 return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Учасники кімнати"><section class="comic-inner moderation-sheet"><div class="eyebrow">РЕДАКЦІЙНІ ПОВНОВАЖЕННЯ</div><h3>'+ (host?'Керування авторами':'Учасники')+'</h3><p class="mini">Написані частини історій залишаться на місці незалежно від того, хто з авторів вийшов.</p>'+rows+token+note+'<button type="button" class="button outline moderation-close" data-act="cancel">Закрити</button></section></div>';
}
export function skipDialog(view,person,escape){
 if(!person)return '';
 return '<div class="comic-modal" role="dialog" aria-modal="true"><section class="comic-inner moderation-sheet"><div class="eyebrow">РАУНД '+(view.round+1)+'</div><h3>Пропустити фрагмент '+safe(person.name,escape)+'?</h3><p>Цю частину буде позначено пропуском. Редакція перейде далі, щойно решта авторів здадуть свої листи. Уже написані частини не зміняться.</p><div class="button-row"><button type="button" data-act="manage-players" class="button outline">Назад</button><button type="button" data-act="confirm-skip" data-id="'+safe(person.id,escape)+'" class="button">Пропустити</button></div></section></div>';
}
export function kickDialog(view,person,escape){
 if(!person)return '';
 return '<div class="comic-modal" role="dialog" aria-modal="true"><section class="comic-inner moderation-sheet"><div class="eyebrow">ПІДТВЕРДИТИ ДІЮ</div><h3>Виключити '+safe(person.name,escape)+'?</h3><p>Доступ до кімнати буде закрито. Уже написані фрагменти залишаться. Якщо потрібен інший автор, потім відкрий заміну місця.</p><div class="button-row"><button type="button" data-act="manage-players" class="button outline">Назад</button><button type="button" data-act="confirm-kick" data-id="'+safe(person.id,escape)+'" class="button">Виключити</button></div></section></div>';
}
