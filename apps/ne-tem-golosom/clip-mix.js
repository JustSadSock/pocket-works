// Manual, per-take mixer. No automatic loudness normalization.
export const MAX_CLIP_GAIN=8;
export const DEFAULT_MIX=Object.freeze({volume:1,fadeIn:.06,fadeOut:.14});
const bound=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
export function clipMix(clip={}){
 return {
  volume:bound(clip.volume,0,MAX_CLIP_GAIN,DEFAULT_MIX.volume),
  fadeIn:bound(clip.fadeIn,0,2,DEFAULT_MIX.fadeIn),
  fadeOut:bound(clip.fadeOut,0,2,DEFAULT_MIX.fadeOut)
 };
}
export function envelopeGain(clip,t){
 const {volume,fadeIn,fadeOut}=clipMix(clip);
 const duration=Math.max(0,clip.end-clip.start);
 if(duration===0||t<0||t>duration)return 0;
 const head=fadeIn>0?Math.min(1,t/fadeIn):1;
 const tail=fadeOut>0?Math.min(1,(duration-t)/fadeOut):1;
 return volume*Math.max(0,Math.min(head,tail));
}
// Web Audio gain automation for sample-accurate start/end, including a clipped
// segment already in progress when playback starts.
export function scheduleEnvelope(param,clip,when,late=0,length=clip.end-clip.start-late){
 const {fadeIn,fadeOut}=clipMix(clip);
 const duration=Math.max(0,clip.end-clip.start);
 const len=Math.max(0,Math.min(length,duration-late));
 const boundaries=[late,late+len];
 if(fadeIn>late&&fadeIn<late+len)boundaries.push(fadeIn);
 if(duration-fadeOut>late&&duration-fadeOut<late+len)boundaries.push(duration-fadeOut);
 boundaries.sort((a,b)=>a-b);
 param.cancelScheduledValues(when);
 param.setValueAtTime(envelopeGain(clip,late),when);
 for(const t of boundaries.slice(1)){
  const at=when+(t-late);
  param.linearRampToValueAtTime(envelopeGain(clip,t),at);
 }
}
