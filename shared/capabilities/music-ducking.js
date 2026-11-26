// Independent gain stage: does not overwrite the user's music bus volume.
export function createMusicDucker({context,destination,attack=.035,release=.18}={}){
 if(!context||!destination||![attack,release].every(n=>Number.isFinite(n)&&n>=.005&&n<=2))throw Error('Invalid music ducking');
 const node=context.createGain();node.gain.value=1;node.connect(destination);
 let closed=false,envelope=null;
 function gainAt(t){
  if(!envelope)return 1;
  const e=envelope;
  if(t<=e.start)return e.from;
  if(t<e.attackEnd)return e.from+(e.target-e.from)*(t-e.start)/(e.attackEnd-e.start);
  if(t<=e.holdEnd)return e.target;
  if(t<e.end)return e.target+(1-e.target)*(t-e.holdEnd)/(e.end-e.holdEnd);
  return 1;
 }
 return {
  input:node,
  trigger({gain=.5,duration=.2}={}){
   if(closed)return false;
   if(!Number.isFinite(gain)||gain<0||gain>1||!Number.isFinite(duration)||duration<0||duration>60)throw Error('Invalid duck request');
   if(gain===1)return true;
   const now=context.currentTime,from=gainAt(now);
   const overlapping=envelope&&now<envelope.holdEnd;
   const target=overlapping?Math.min(gain,envelope.target):gain;
   const attackEnd=now+attack,holdEnd=Math.max(attackEnd,now+duration,overlapping?envelope.holdEnd:0);
   const p=node.gain;
   p.cancelScheduledValues(now);p.setValueAtTime(from,now);
   p.linearRampToValueAtTime(target,attackEnd);p.setValueAtTime(target,holdEnd);
   p.linearRampToValueAtTime(1,holdEnd+release);
   envelope={start:now,from,target,attackEnd,holdEnd,end:holdEnd+release};
   return true;
  },
  get state(){return {gain:gainAt(context.currentTime),until:envelope?.end??null}},
  destroy(){if(closed)return;closed=true;envelope=null;node.disconnect();}
 };
}
