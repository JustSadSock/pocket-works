import {readiness,waitingHeading,justSubmitted} from './finale-state.js';

// Update only public readiness indicators; don't tear down the waiting screen
// on every PocketNet state message (which would replay the seal animation).
export function updateWaitingView(root,previous,next,{sound}={}){
 if(!root||!previous||previous.round!==next.round||previous.players.length!==next.players.length)return false;
 const {ready,total}=readiness(next.players);
 const cards=new Map([...root.querySelectorAll('[data-receipt-id]')].map(el=>[el.dataset.receiptId,el]));
 if(next.players.some(p=>!cards.has(p.id)))return false;
 root.querySelector('.dispatch-heading').textContent=waitingHeading(next.players);
 root.querySelector('.dispatch-count-value').textContent=ready+' / '+total;
 const progress=root.querySelector('.dispatch-track');
 progress?.setAttribute('aria-valuenow',String(ready));
 progress?.setAttribute('aria-valuemax',String(total));
 progress?.querySelector('span')?.style.setProperty('width',(total?Math.round(100*ready/total):0)+'%');
 const changed=justSubmitted(previous.players,next.players);
 const previousStatus=new Map(previous.players.map(p=>[p.id,p.submitted===true]));
 for(const player of next.players){
  const card=cards.get(player.id),done=player.submitted===true;
  card.classList.toggle('is-ready',done);
  card.classList.toggle('just-stamped',done&&!previousStatus.get(player.id));
  card.querySelector('.dispatch-icon').textContent=done?'✓':'·';
  card.querySelector('.dispatch-status').textContent=done?'Аркуш здано':'Пише…';
 }
 if(changed.length){
  root.querySelector('.dispatch-a11y').textContent=changed.length===1?'Один автор здав рукопис.':changed.length+' автори здали рукописи.';
  sound?.('ready');
 }
 return true;
}
