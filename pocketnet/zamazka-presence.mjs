// Durable room-presence reconciliation, with injected time for deterministic QA.
// Rooms pinned before v47 retain the historical all-offline pause semantics.
// New v47 rooms freeze on any absent seat and may resume on an explicit
// curator-approved, minimum-two-online reduced roster without deleting work.
export function reconcileZamazkaPresence(state, connectedIds, now) {
  const connected=new Set(connectedIds);
  const onlineIds=state.participants.filter(p=>connected.has(p.id)).map(p=>p.id);
  const previous=state.onlineIds||[];
  const onlineChanged=onlineIds.length!==previous.length||
    onlineIds.some((id,index)=>id!==previous[index]);
  const wasPaused=!!state.paused;
  state.onlineIds=onlineIds;
  const inMatch=state.phase!=='lobby'&&state.phase!=='results';
  const protectedRoom=state.protectedPresence===true;
  const missing=state.participants.filter(p=>!connected.has(p.id)).map(p=>p.id);
  const approved=new Set(protectedRoom?state.allowedAbsentIds||[]:[]);
  // A previously approved seat returning to the game is no longer exempt.
  if(protectedRoom)state.allowedAbsentIds=missing.filter(id=>approved.has(id));
  let resumed=false;
  const newAbsence=missing.some(id=>!approved.has(id));
  if(inMatch&&!state.paused&&(protectedRoom?newAbsence:onlineIds.length===0)){
    state.paused=true;
    state.pauseRemainingMs=state.deadline?Math.max(0,state.deadline-now):null;
    state.pausedAt=now;
  }else if(state.paused&&(missing.length===0||
    (protectedRoom&&onlineIds.length>=2&&!newAbsence))){
    state.paused=false;
    if(state.deadline&&Number.isFinite(state.pauseRemainingMs))
      state.deadline=now+state.pauseRemainingMs;
    state.pauseRemainingMs=null;
    state.pausedAt=0;
    resumed=true;
  }
  return {changed:onlineChanged||wasPaused!==!!state.paused,resumed};
}
