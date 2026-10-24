import {hostRecovery,recoveryLabel,seatOptions} from './moderation-state.js';
// Small, purpose-built editorial host controls. All permissions are checked
// again in the authoritative PocketNet v6 module.
const safe=(x,escape)=>escape(String(x??''));
export function controlsBar(view,me,version,escape){
 if(!['v6','v7','v8','v9'].includes(version)||!view||!['lobby','writing'].includes(view.phase))return '';
 const h=view.host===me,paused=view.paused;
 return '<div class="moderation-bar"><span class="moderation-state">'+(paused?'ПАУЗА · РУКОПИСИ ЗБЕРЕЖЕНІ':'РЕДАКЦІЯ · '+(view.round+1)+' / '+(view.total||'—'))+'</span><div class="moderation-actions">'+(h&&view.phase==='writing'?'<button type="button" class="moderation-pause" data-act="'+(paused?'unpause':'pause')+'">'+(paused?'Продовжити':'Пауза')+'</button>':'')+'<button type="button" data-act="manage-players" class="moderation-manage">'+(h?'Керування':'Учасники')+' <span aria-hidden="true">↗</span></button></div></div>';
}
export function controlsDialog(view,me,escape){
 if(!view)return '';
 const host=view.host===me,players=view.players||[],recovery=hostRecovery(view,me);
 const rows=players.map(p=>{
  const self=p.id===me,here=!p.departed&&!p.excluded;
  const status=p.excluded?'Виключено':p.departed?'Не в мережі':p.submitted?'Здав рукопис':'Пише';
  let commands='';
  if(host&&!self){
   const actions=[];
   if(here)actions.push('<button type="button" data-act="ask-transfer-host" data-id="'+safe(p.id,escape)+'">Зробити ведучим</button>');
   else if(view.phase==='writing')actions.push('<button type="button" data-act="open-seat" data-id="'+safe(p.id,escape)+'">Замінити автора</button>');
   if(!here&&!p.submitted&&view.phase==='writing'&&!view.paused)actions.push('<button type="button" data-act="ask-skip" data-id="'+safe(p.id,escape)+'">Пропустити фрагмент</button>');
   if(!p.excluded)actions.push('<button type="button" data-act="ask-kick" data-id="'+safe(p.id,escape)+'">Виключити</button>');
   commands='<div class="moderation-person-actions">'+actions.join('')+'</div>';
  }else if(!host&&recovery.active&&here&&p.id!==view.host){
   const label=self?'Стати ведучим':'Голосувати';
   const votes=recovery.counts[p.id]||0;
   commands='<div class="moderation-person-actions"><button type="button" data-act="vote-host" data-recovery-candidate data-id="'+safe(p.id,escape)+'"'+(recovery.canVote?'':' disabled')+'>'+label+'</button><small class="vote-tally">'+votes+' / '+recovery.threshold+'</small></div>';
  }
  return '<div class="moderation-person"><div class="moderation-person-info"><strong>'+safe(p.name,escape)+'</strong><small>'+(p.id===view.host?'Ведучий · ':'')+status+'</small></div>'+commands+'</div>';
 }).join('');
 const token=host&&view.claim?'<div class="moderation-ticket"><small>КОД ЗАМІНИ · '+safe(players.find(p=>p.id===view.claim.seatId)?.name||'Місце',escape)+'</small><strong>'+safe(view.claim.code,escape)+'</strong><p>Передай цей код новому автору разом із кодом кімнати. Дійсний 10 хвилин, лише для одного входу.</p><button type="button" data-act="copy-seat-code">Копіювати код</button><button type="button" data-act="close-seat">Скасувати заміну</button></div>':'';
 const note=!host&&recovery.active?'<p class="moderation-recovery" role="status" aria-live="off" data-recovery-countdown>'+recoveryLabel(recovery)+'</p>':'';
 return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Учасники кімнати"><section class="comic-inner moderation-sheet"><div class="eyebrow">РЕДАКЦІЙНІ ПОВНОВАЖЕННЯ</div><h3>'+(host?'Керування авторами':'Учасники')+'</h3><p class="mini">Написані частини історій залишаться на місці незалежно від того, хто з авторів вийшов.</p>'+rows+token+note+'<button type="button" class="button outline moderation-close" data-act="cancel">Закрити</button></section></div>';
}
export function updateRecoveryCountdown(root,view,me,now=Date.now()){
 const note=root?.querySelector('[data-recovery-countdown]');
 if(!note)return;
 const recovery=hostRecovery(view,me,now);
 note.textContent=recoveryLabel(recovery);
 root.querySelectorAll('[data-recovery-candidate]').forEach(button=>{
  const id=button.dataset.id;
  button.disabled=!recovery.canVote;
  button.textContent=recovery.ownVote===id?'Ваш голос':id===me?'Стати ведучим':'Голосувати';
  button.title=recovery.remainingMs>0?recoveryLabel(recovery):'';
 });
}
export function skipDialog(view,person,escape){
 if(!person)return '';
 return '<div class="comic-modal" role="dialog" aria-modal="true"><section class="comic-inner moderation-sheet"><div class="eyebrow">РАУНД '+(view.round+1)+'</div><h3>Пропустити фрагмент '+safe(person.name,escape)+'?</h3><p>Цю частину буде позначено пропуском. Редакція перейде далі, щойно решта авторів здадуть свої листи. Уже написані частини не зміняться.</p><div class="button-row"><button type="button" data-act="manage-players" class="button outline">Назад</button><button type="button" data-act="confirm-skip" data-id="'+safe(person.id,escape)+'" class="button">Пропустити</button></div></section></div>';
}
export function kickDialog(view,person,escape){
 if(!person)return '';
 return '<div class="comic-modal" role="dialog" aria-modal="true"><section class="comic-inner moderation-sheet"><div class="eyebrow">ПІДТВЕРДИТИ ДІЮ</div><h3>Виключити '+safe(person.name,escape)+'?</h3><p>Доступ до кімнати буде закрито. Уже написані фрагменти залишаться. Після виключення обери, що робити з місцем: замінити автора, пропустити його незданий фрагмент або залишити місце до повернення.</p><div class="button-row"><button type="button" data-act="manage-players" class="button outline">Назад</button><button type="button" data-act="confirm-kick" data-id="'+safe(person.id,escape)+'" class="button">Виключити</button></div></section></div>';
}

export function seatDecisionDialog(view,person,me,escape){
 if(!person)return '';
 const opts=seatOptions(view,me,person.id);
 return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Доля місця автора"><section class="comic-inner moderation-sheet"><div class="eyebrow">АВТОР ВИКЛЮЧЕНИЙ</div><h3>Що робити з місцем '+safe(person.name,escape)+'?</h3><p>Уже здані фрагменти збережено. Поточний раунд не рухатиметься далі, доки це місце не здасть свою частину або ведучий її не пропустить.</p><div class="seat-decision-actions">'+(opts.canReplace?'<button type="button" class="button" data-act="choice-replace" data-id="'+safe(person.id,escape)+'">Запросити заміну</button>':'')+(opts.canSkip?'<button type="button" class="button outline" data-act="choice-skip" data-id="'+safe(person.id,escape)+'">Пропустити незданий фрагмент</button>':'')+'<button type="button" class="button outline" data-act="choice-later">Вирішити пізніше</button></div></section></div>';
}
export function transferHostDialog(person,escape){
 if(!person)return '';
 return '<div class="comic-modal" role="dialog" aria-modal="true" aria-label="Передача повноважень"><section class="comic-inner moderation-sheet"><div class="eyebrow">ПЕРЕДАТИ УПРАВЛІННЯ</div><h3>Призначити '+safe(person.name,escape)+' ведучим?</h3><p>Ти втратиш керування паузою, заміною авторів і завершенням випуску. Поточні рукописи залишаться без змін.</p><div class="button-row"><button class="button outline" type="button" data-act="manage-players">Назад</button><button class="button" type="button" data-act="confirm-transfer-host" data-id="'+safe(person.id,escape)+'">Передати роль</button></div></section></div>';
}
