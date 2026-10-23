// Durable room-presence reconciliation, with the clock injected so reconnect
// and timeout behavior can be regression-tested without live sockets.
export function reconcileZamazkaPresence(state, connectedIds, now) {
  const connected=new Set(connectedIds);
  const onlineIds=state.participants.filter(p=>connected.has(p.id)).map(p=>p.id);
  const previous=state.onlineIds||[];
  const onlineChanged=onlineIds.length!==previous.length||
    onlineIds.some((id,index)=>id!==previous[index]);
  const wasPaused=!!state.paused;
  state.onlineIds=onlineIds;
  const inMatch=state.phase!=='lobby'&&state.phase!=='results';
  let resumed=false;
  if(inMatch&&!state.paused&&onlineIds.length===0){
    state.paused=true;
    state.pauseRemainingMs=state.deadline?Math.max(0,state.deadline-now):null;
    state.pausedAt=now;
  }else if(state.paused&&state.participants.every(p=>connected.has(p.id))){
    state.paused=false;
    if(state.deadline&&Number.isFinite(state.pauseRemainingMs))
      state.deadline=now+state.pauseRemainingMs;
    state.pauseRemainingMs=null;
    state.pausedAt=0;
    resumed=true;
  }
  return {changed:onlineChanged||wasPaused!==!!state.paused,resumed};
}
