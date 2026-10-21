// ЗАМАЗКА · one authoritative countdown schedule for preview and restoration.
// The threshold crossing is independent of render cadence and PocketNet messages.
export const CLOCK_START_SECONDS=15;
export const CLOCK_ALERTS=Object.freeze([
  {at:10,event:'watch-warning'},
  {at:5,event:'watch-five'},
  {at:0,event:'time-up'}
]);
export function stepClockSound(previous,key,milliseconds,{phase='',totalSeconds=0}={}){
  if(!key||!Number.isFinite(milliseconds))return {state:null,ticking:false,cue:null};
  const seconds=Math.max(0,Math.ceil(milliseconds/1000));
  const fresh=!previous||previous.key!==key;
  const before=fresh?Number.POSITIVE_INFINITY:previous.seconds;
  const sounded=new Set(fresh?[]:previous.sounded);
  let cue=null;
  // Allow up to one late frame, but never stack stale alerts after tab suspension.
  // Draw-time milestones are contextual, unlike the 10/5/0 countdown.
  // A 120-second round has the same midpoint and minute; ring once.
  const milestones=phase==='drawing'&&Number.isFinite(totalSeconds)&&totalSeconds>0?[
    ...(totalSeconds>60?[{at:60,event:'watch-minute'}]:[]),
    ...(totalSeconds>=60&&Math.floor(totalSeconds/2)!==60?
      [{at:Math.floor(totalSeconds/2),event:'watch-half'}]:[])
  ].sort((a,b)=>b.at-a.at):[];
  for(const {at,event} of [...milestones,...CLOCK_ALERTS]){
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
