// PocketNet v46: schedule timed Zamazka phases without a client heartbeat.
// This is a pure projection of the immutable module's existing pulse rules.
// No alarm may shorten the 25s final grace or 120s recoverable transfer.
export const ZAMAZKA_ALARM_VERSION='v46';
export const ZAMAZKA_FINAL_GRACE_MS=25_000;
export const ZAMAZKA_FINAL_RECOVERY_MS=120_000;
const TIMED_PHASES=new Set(['preparing','preview','drawing','sealing','voting','verdict','reveal']);

export function nextZamazkaDeadlineAt(state){
  if(!state||state.paused||!TIMED_PHASES.has(state.phase)||
     !Number.isFinite(state.deadline)||state.deadline<=0)return null;
  if(state.phase!=='drawing')return state.deadline;
  if(state.drawingSeconds===0)return null;
  const unfinished=(state.participants||[]).filter(player=>
    !Array.isArray(state.assignments?.[player.id]?.strokes));
  if(!unfinished.length)return state.deadline;
  const recovering=unfinished.some(player=>
    Number.isFinite(state.pendingFinals?.[player.id])||
    state.draftAssemblies?.[player.id]?.kind==='submit_chunk');
  return state.deadline+(recovering?ZAMAZKA_FINAL_RECOVERY_MS:ZAMAZKA_FINAL_GRACE_MS);
}

export function shouldAdvanceZamazkaDeadline(state,at=Date.now()){
  const deadline=nextZamazkaDeadlineAt(state);
  return deadline!==null&&at>=deadline;
}
