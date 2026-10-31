// Keep a neural-cleaned film soundtrack locked to the actual video media clock.
// Canvas/MediaRecorder and Web Audio use different clocks. A single
// AudioBufferSource.start() after video.play() drifts after decoder stalls,
// tab suspensions and slow seek, even though the PCM duration is correct.
export function createFilmBedSync({context,buffer,destination,video,sceneStart=0}){
 if(!context||!buffer||!destination||!video)throw TypeError('Missing film audio sync dependency');
 let current=null,lastClock=0,rendered=0,rate=1,restarts=0,drift=0;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function stop(){
  if(!current)return;
  const old=current;current=null;
  const now=context.currentTime;
  try{
   old.gain.gain.cancelScheduledValues(now);
   old.gain.gain.setValueAtTime(old.gain.gain.value,now);
   old.gain.gain.linearRampToValueAtTime(0,now+.012);
   old.source.stop(now+.014);
  }catch{}
  // Keep the output routing alive until the short fade ends.
  old.source.onended=()=>{try{old.source.disconnect();old.gain.disconnect()}catch{}};
 }
 function begin(position){
  if(position>=buffer.duration-.01){stop();return false}
  stop();
  const now=context.currentTime,offset=clamp(position,0,Math.max(0,buffer.duration-.01));
  const source=context.createBufferSource(),gain=context.createGain();
  source.buffer=buffer;source.playbackRate.value=1;
  gain.gain.setValueAtTime(0,now);
  gain.gain.linearRampToValueAtTime(1,now+.008);
  source.connect(gain);gain.connect(destination);
  current={source,gain};lastClock=now;rendered=offset;rate=1;restarts++;
  source.start(now,offset);
  return true;
 }
 function sync(force=false){
  if(video.paused||video.seeking){stop();return false}
  const position=video.currentTime-sceneStart;
  if(!Number.isFinite(position)||position<-.1||position>=buffer.duration-.005){stop();return false}
  const now=context.currentTime;
  if(!current||force)return begin(position);
  const delta=Math.max(0,now-lastClock);
  rendered+=delta*rate;lastClock=now;
  drift=position-rendered;
  if(Math.abs(drift)>.12)return begin(position);
  // Tiny rate corrections are inaudible and prevent small drift from growing.
  const nextRate=1+clamp(drift*.45,-.03,.03);
  current.source.playbackRate.setTargetAtTime(nextRate,now,.06);
  rate=nextRate;
  return true;
 }
 return {
  sync,pause:stop,dispose:stop,
  diagnostics:()=>({active:!!current,driftSeconds:drift,restarts,mediaSeconds:rendered})
 };
}
