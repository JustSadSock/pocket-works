// UI-only coordination for pinned Chyepukha v6/v7 rooms.
// Server authority stays in the immutable PocketNet game modules.
export const HOST_RECOVERY_DELAY_MS = 5 * 60_000;

export function hostRecovery(view, me, now=Date.now()) {
 const players=Array.isArray(view?.players)?view.players:[];
 const host=players.find(p=>p.id===view?.host);
 const since=Number(view?.hostOfflineSince)||0;
 const eligible=players.filter(p=>p.id!==view?.host&&!p.departed&&!p.excluded);
 const active=view?.phase==='writing'&&Boolean(host?.departed)&&since>0;
 const remainingMs=active?Math.max(0,HOST_RECOVERY_DELAY_MS-Math.max(0,now-since)):0;
 const voted=view?.hostVotes&&typeof view.hostVotes==='object'?view.hostVotes:{};
 const threshold=Math.floor(eligible.length/2)+1;
 const counts=Object.fromEntries(eligible.map(p=>[p.id,eligible.filter(v=>voted[v.id]===p.id).length]));
 return {
  active,remainingMs,ready:active&&remainingMs===0,canVote:active&&remainingMs===0&&eligible.some(p=>p.id===me),
  eligible,threshold,counts,ownVote:voted[me]||'',hostName:host?.name||'Ведучий'
 };
}

export function recoveryCountdown(ms) {
 const seconds=Math.ceil(Math.max(0,ms)/1000);
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}

export function seatOptions(view,me,seatId) {
 const seat=view?.players?.find(p=>p.id===seatId);
 const host=view?.host===me, writing=view?.phase==='writing';
 const canReplace=Boolean(host&&writing&&seat&&seat.id!==me&&(seat.departed||seat.excluded));
 const canSkip=Boolean(canReplace&&!seat.submitted&&!view.paused);
 return {seat,canReplace,canSkip};
}

export function recoveryLabel(recovery) {
 if(!recovery.active)return '';
 if(recovery.remainingMs>0)return 'До виборів нового ведучого: '+recoveryCountdown(recovery.remainingMs);
 if(!recovery.eligible.length)return 'Потрібен хоча б один учасник у мережі.';
 return 'Ведучий не повернувся. Для рішення потрібно '+recovery.threshold+' '+(recovery.threshold===1?'голос':'голоси')+'.';
}
