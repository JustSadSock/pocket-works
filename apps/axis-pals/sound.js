// ОСИ v1.3 / quiet mechanical sound design. No external files or network fetch.
// Audio graph is created only after a user gesture; browsers may decline autoplay.
export const SOUND_PROFILE=Object.freeze({
 press:{hz:480,end:350,duration:.045,gain:.012,noise:.006,noiseHz:1650,type:'triangle'},
 move:{hz:330,end:215,duration:.115,gain:.018,noise:.016,noiseHz:850,type:'triangle'},
 collision:{hz:205,end:104,duration:.125,gain:.025,noise:.025,noiseHz:530,type:'triangle'},
 arrive:{hz:480,end:760,duration:.17,gain:.017,noise:.008,noiseHz:1300,type:'sine'},
 blocked:{hz:150,end:82,duration:.145,gain:.032,noise:.026,noiseHz:320,type:'triangle'},
 win:{hz:610,end:890,duration:.23,gain:.022,noise:.01,noiseHz:1200,type:'sine'},
 error:{hz:175,end:105,duration:.095,gain:.016,noise:.016,noiseHz:460,type:'triangle'}
});
export function soundForMove(m){
 if(!m)return 'press';
 const b=m.blocked||[];
 if(b.every(Boolean))return 'blocked';
 if(b.some(Boolean))return 'collision';
 return 'move';
}
export function createSoundPlayer(getAudioCtor){
 let ctx=null,noiseBuffer=null,sequence=0;
 function pulse({hz,end,duration,gain,noise,noiseHz,type},variation){
  const a=ctx,t=a.currentTime,change=1+variation*.024;
  const osc=a.createOscillator(),amp=a.createGain(),filter=a.createBiquadFilter();
  osc.type=type;
  osc.frequency.setValueAtTime(hz*change,t);
  osc.frequency.exponentialRampToValueAtTime(end*change,t+duration);
  filter.type='lowpass';filter.frequency.value=Math.max(hz,end)*3;
  osc.connect(filter).connect(amp).connect(a.destination);
  amp.gain.setValueAtTime(.0001,t);
  amp.gain.exponentialRampToValueAtTime(gain,t+.008);
  amp.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.start(t);osc.stop(t+duration+.01);
  if(!noiseBuffer){
   noiseBuffer=a.createBuffer(1,Math.ceil(a.sampleRate*.14),a.sampleRate);
   const out=noiseBuffer.getChannelData(0);
   // Stable pseudo-random grit; single buffer reused by all sounds.
   let n=0x735a219;
   for(let i=0;i<out.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;out[i]=((n/0xffffffff)*2-1)*(.55+.45*(1-i/out.length))}
  }
  const source=a.createBufferSource(),nf=a.createBiquadFilter(),ng=a.createGain();
  source.buffer=noiseBuffer;nf.type='bandpass';nf.frequency.value=noiseHz*change;nf.Q.value=.85;
  source.connect(nf).connect(ng).connect(a.destination);
  ng.gain.setValueAtTime(.0001,t);
  ng.gain.exponentialRampToValueAtTime(noise,t+.005);
  ng.gain.exponentialRampToValueAtTime(.0001,t+Math.min(duration,.13));
  source.start(t);source.stop(t+Math.min(duration,.13)+.008);
 }
 return {
  play(kind,enabled=true){
   if(!enabled||!Object.prototype.hasOwnProperty.call(SOUND_PROFILE,kind))return false;
   try{
    const Audio=getAudioCtor();
    if(!Audio)return false;
    if(!ctx)ctx=new Audio();
    if(ctx.state==='suspended')ctx.resume?.().catch?.(()=>{});
    if(ctx.state==='closed')return false;
    const variation=((sequence++%5)-2)/2;
    pulse(SOUND_PROFILE[kind],variation);
    return true;
   }catch{return false}
  },
  close(){try{ctx?.close?.()}catch{}ctx=null;noiseBuffer=null},
  get ready(){return !!ctx}
 };
}
