// Audio Forge WAV/OGG buffers, scheduled only for events already crossed.
export class EventAudio{
 constructor(context,buffers,{onSchedule=()=>{},enabled=true,maxVoices=8}={}){if(!Number.isInteger(maxVoices)||maxVoices<1||maxVoices>32)throw Error('Invalid voice budget');Object.assign(this,{context,buffers,onSchedule,enabled,maxVoices});this.voices=new Set();this.serial=0;}
 async unlock(){try{await this.context.resume();return this.context.state==='running';}catch{return false;}}
 play(key,event,{volume=.35}={}){
  const buffer=this.buffers[key];if(!this.enabled||this.context.state!=='running'||!buffer)return false;
  if(!Number.isFinite(volume)||volume<0||volume>1)throw Error('Invalid audio volume');
  if(this.voices.size>=this.maxVoices){const old=this.voices.values().next().value;old.source.stop();this.voices.delete(old);}
  const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;
  source.playbackRate.value=1+((this.serial++%5)-2)*.012;gain.gain.value=volume;
  source.connect(gain);gain.connect(this.context.destination);const voice={source,gain,generation:event.generation};this.voices.add(voice);
  source.onended=()=>{source.disconnect();gain.disconnect();this.voices.delete(voice);};
  const when=this.context.currentTime;source.start(when);this.onSchedule({key,clip:event.clip,eventTime:event.time,when,generation:event.generation});return true;
 }
 cancel(generation){for(const voice of this.voices)if(generation===undefined||voice.generation===generation){voice.source.stop();this.voices.delete(voice);}}
 dispose(){this.cancel();}
}
