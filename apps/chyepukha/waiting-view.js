import {readiness,waitingHeading} from './finale-state.js';

// The editorial dispatch tray uses only public readiness flags; never displays
// other authors' hidden pages, selected words or question text.
export function renderWaiting({players=[],myId='',escape,round=0,totalRounds=0}={}){
 const {ready,total,remaining}=readiness(players);
 const safe=escape||((x)=>String(x));
 const headline=waitingHeading(players);
 const cards=players.map((p,index)=>{
  const done=p.submitted===true,own=p.id===myId;
  return '<div class="dispatch-card '+(done?'is-ready':'')+(own?' is-you':'')+'" data-receipt-id="'+safe(p.id)+'" style="--receipt-index:'+index+'"><div class="dispatch-icon" aria-hidden="true">'+(done?'✓':'·')+'</div><div class="dispatch-label"><strong>'+safe(p.name)+'</strong><span class="dispatch-status">'+(done?'Аркуш здано':'Пише…')+'</span></div><span class="dispatch-stamp" aria-hidden="true">ЗДАНО</span></div>';
 }).join('');
 return '<section class="paper waiting dispatch-room"><div class="dispatch-overline"><span class="eyebrow">РЕДАКЦІЙНИЙ ЛОТОК</span><span class="dispatch-round">РАУНД '+(round+1)+' / '+totalRounds+'</span></div><div class="dispatch-seal" aria-hidden="true"><span class="dispatch-seal-core">✓</span><span class="dispatch-seal-ring"></span></div><h2 class="dispatch-heading" aria-live="polite">'+safe(headline)+'</h2><p class="lead">Твій аркуш запечатано. Інші автори закінчують свої частини.</p><div class="dispatch-count" aria-label="Готово '+ready+' із '+total+'"><span class="dispatch-count-value">'+ready+' / '+total+'</span><span>рукописів прийнято</span></div><div class="dispatch-track" role="progressbar" aria-label="Здані рукописи" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+ready+'"><span style="width:'+(total?Math.round(100*ready/total):0)+'%"></span></div><div class="dispatch-grid">'+cards+'</div><button class="leave" data-act="leave">Залишити партію</button><span class="dispatch-a11y" aria-live="polite" aria-atomic="true"></span></section>';
}
