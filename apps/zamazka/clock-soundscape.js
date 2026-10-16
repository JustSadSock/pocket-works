// ЗАМАЗКА · one authoritative countdown schedule for preview and restoration.
// The threshold crossing is independent of render cadence and PocketNet messages.
export const CLOCK_START_SECONDS=15;
export const CLOCK_ALERTS=Object.freeze([
  {at:10,event:'watch-warning'},
  {at:5,event:'watch-five'},
  {at:0,event:'time-up'}
]);
export function stepClockSound(previous,key,milliseconds){
  if(!key||!Number.isFinite(milliseconds))return {state:null,ticking:false,cue:null};
  const seconds=Math.max(0,Math.ceil(milliseconds/1000));
  const fresh=!previous||previous.key!==key;
  const before=fresh?Number.POSITIVE_INFINITY:previous.seconds;
  const sounded=new Set(fresh?[]:previous.sounded);
  let cue=null;
  // Allow up to one late frame, but never stack stale alerts after tab suspension.
  for(const {at,event} of CLOCK_ALERTS){
    const reached=before>at && seconds<=at && seconds>=Math.max(0,at-1);
    if(reached&&!sounded.has(at)&&(!fresh||seconds>0)){
      cue=event;sounded.add(at);break;
    }
  }
  return {
    state:{key,seconds,sounded:[...sounded]},
    ticking:milliseconds>0&&milliseconds<=CLOCK_START_SECONDS*1000,
    cue
  };
}
