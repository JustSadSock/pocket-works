// Original procedural sound design for 5×5 Arena. One AudioContext, cached
// noise, tuned transient/envelope recipes and bounded node lifetimes.
// Calling play() is always safe without autoplay permission or WebAudio support.
export const SOUND_PALETTE=Object.freeze({
 tap:{name:'Ceramic key',duration:.13},
 plan:{name:'Twin mechanical latch',duration:.19},
 move:{name:'Board slide',duration:.23},
 attack:{name:'Air-cut slash',duration:.31},
 shield:{name:'Hollow glass shield',duration:.54},
 block:{name:'Steel-on-glass contact',duration:.49},
 hit:{name:'Heavy stone strike',duration:.41},
 collapse:{name:'Fractured slab avalanche',duration:1.16},
 fall:{name:'Gravity drop',duration:.68},
 win:{name:'Three-note resolve',duration:.71},
 error:{name:'Muted rejection',duration:.28}
});
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export const soundDuration=name=>SOUND_PALETTE[name]?.duration??.15;
export function createArenaSoundscape({AudioContextClass=null}={}){
 let ctx=null,noise=null,master=null,sequence=0;
 const ensure=()=>{
  if(ctx)return ctx;
  const ctor=AudioContextClass||globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!ctor)return null;
  ctx=new ctor();
  const compressor=ctx.createDynamicsCompressor();
  compressor.threshold.value=-18;compressor.knee.value=13;compressor.ratio.value=3;
  compressor.attack.value=.004;compressor.release.value=.18;
  master=ctx.createGain();master.gain.value=.5;
  master.connect(compressor);compressor.connect(ctx.destination);
  const buffer=ctx.createBuffer(1,Math.max(4096,Math.round(ctx.sampleRate)),ctx.sampleRate);
  const data=buffer.getChannelData(0);let rand=0x9e3779b9;
  for(let i=0;i<data.length;i++){
   rand^=rand<<13;rand^=rand>>>17;rand^=rand<<5;
   data[i]=(rand/2147483648)-1;
  }
  noise=buffer;
  return ctx;
 };
 const envelope=(time,attack,level,decay,tail=0)=>{
  const gain=ctx.createGain();
  const g=gain.gain;
  g.setValueAtTime(.00001,time);
  g.linearRampToValueAtTime(Math.max(.0001,level),time+Math.max(.002,attack));
  g.exponentialRampToValueAtTime(.00001,time+Math.max(attack+.008,decay));
  gain.connect(master);
  return gain;
 };
 const tone=(time,settings)=>{
  const {freq=440,to=freq*.77,dur=.12,attack=.008,level=.12,
   wave='sine',pan=0,filter=0}=settings;
  const oscillator=ctx.createOscillator(),output=envelope(time,attack,level,dur);
  oscillator.type=wave;
  oscillator.frequency.setValueAtTime(freq,time);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,to),time+dur);
  let current=oscillator;
  if(filter){
   const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=filter;
   current.connect(lp);current=lp;
  }
  if(pan&&typeof ctx.createStereoPanner==='function'){
   const panner=ctx.createStereoPanner();panner.pan.value=clamp(pan,-.8,.8);
   current.connect(panner);current=panner;
  }
  current.connect(output);oscillator.start(time);oscillator.stop(time+dur+.015);
 };
 const texture=(time,{dur=.17,level=.12,attack=.004,highpass=0,lowpass=3000,pan=0}={})=>{
  const source=ctx.createBufferSource();source.buffer=noise;
  const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=lowpass;
  source.connect(low);
  let current=low;
  if(highpass){
   const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=highpass;
   current.connect(high);current=high;
  }
  if(pan&&typeof ctx.createStereoPanner==='function'){
   const panner=ctx.createStereoPanner();panner.pan.value=clamp(pan,-.8,.8);
   current.connect(panner);current=panner;
  }
  current.connect(envelope(time,attack,level,dur));
  source.start(time,(sequence*.071)%Math.max(.1,noise.duration-dur-.02),dur+.015);
 };
 const compose=(kind,time,variant)=>{
  const v=((variant%7)-3)/3;
  switch(kind){
   case 'tap':
    texture(time,{dur:.045,level:.06,highpass:2900,lowpass:9000});
    tone(time,{freq:950+v*80,to:510,dur:.085,level:.04});
    break;
   case 'plan':
    tone(time,{freq:370+v*20,to:180,dur:.1,level:.09,wave:'triangle'});
    texture(time+.055,{dur:.08,level:.105,highpass:1400,lowpass:5800});
    tone(time+.064,{freq:680,to:290,dur:.11,level:.05});
    break;
   case 'move':
    texture(time,{dur:.13,level:.09,highpass:460,lowpass:2700,pan:v*.27});
    tone(time+.018,{freq:205+v*24,to:115,dur:.165,level:.09,wave:'triangle'});
    texture(time+.115,{dur:.032,level:.07,highpass:2300,lowpass:8800});
    break;
   case 'attack':
    texture(time,{dur:.25,level:.24,highpass:660,lowpass:7600,pan:v*.28});
    tone(time+.012,{freq:820+v*80,to:140,dur:.235,level:.1,wave:'sawtooth',filter:1400});
    texture(time+.16,{dur:.065,level:.12,highpass:1900,lowpass:9000});
    break;
   case 'shield':
    tone(time,{freq:270,to:240,dur:.36,level:.12,wave:'sine'});
    tone(time+.023,{freq:505,to:474,dur:.46,level:.075});
    tone(time+.048,{freq:760,to:744,dur:.45,level:.04});
    texture(time,{dur:.15,level:.11,highpass:1200,lowpass:7000});
    break;
   case 'block':
    texture(time,{dur:.09,level:.29,highpass:620,lowpass:6800});
    tone(time,{freq:165,to:92,dur:.18,level:.22,wave:'triangle'});
    tone(time+.017,{freq:630,to:584,dur:.4,level:.12});
    tone(time+.041,{freq:940,to:872,dur:.32,level:.08});
    break;
   case 'hit':
    tone(time,{freq:145,to:46,dur:.35,level:.29,wave:'triangle'});
    tone(time+.008,{freq:235,to:64,dur:.26,level:.15,wave:'sawtooth',filter:480});
    texture(time,{dur:.15,level:.27,highpass:190,lowpass:2400});
    texture(time+.028,{dur:.09,level:.1,highpass:1600,lowpass:7500});
    break;
   case 'collapse':
    // Staggered chunks move across the stereo field; low rumble remains below.
    tone(time,{freq:94,to:29,dur:1.04,level:.22,wave:'sawtooth',filter:350});
    texture(time,{dur:.85,attack:.13,level:.2,lowpass:900,highpass:55});
    for(let i=0;i<7;i++){
     const offset=i*.107+(i%2)*.017,pan=(i-3)*.24;
     tone(time+offset,{freq:155-i*11,to:55-i*3,dur:.25,level:.1+i*.01,wave:'triangle',pan});
     texture(time+offset,{dur:.16,level:.15,highpass:240+i*130,lowpass:2800+i*260,pan});
    }
    break;
   case 'fall':
    texture(time,{dur:.48,attack:.024,level:.22,highpass:140,lowpass:2700});
    tone(time,{freq:310,to:42,dur:.56,level:.21,wave:'triangle'});
    tone(time+.36,{freq:97,to:38,dur:.27,level:.15,wave:'sawtooth',filter:320});
    break;
   case 'win':
    [392,494,588].forEach((freq,i)=>{
     tone(time+i*.135,{freq,to:freq*.97,dur:.31,attack:.012,level:.105,wave:'triangle'});
     tone(time+i*.135+.01,{freq:freq*2,to:freq*1.98,dur:.33,level:.035});
    });
    break;
   case 'error':
    tone(time,{freq:235,to:171,dur:.23,level:.13,wave:'triangle'});
    texture(time,{dur:.058,level:.07,highpass:850,lowpass:2900});
    break;
  }
 };
 const play=(kind='tap',{volume=70,enabled=true,preview=false}={})=>{
  if(!SOUND_PALETTE[kind]||(!preview&&(!enabled||volume<=0)))return false;
  try{
   if(!ensure())return false;
   // Browser gesture gating: resume is attempted, never treated as a promise
   // that can block the game loop or trigger repeated sounds.
   if(ctx.state==='suspended')ctx.resume().catch(()=>{});
   master.gain.setTargetAtTime(clamp(Number(volume)||0,0,100)/140,ctx.currentTime,.02);
   const number=sequence++;
   compose(kind,ctx.currentTime+.008,number);
   return true;
  }catch{return false}
 };
 const stop=()=>{const current=ctx;ctx=null;noise=null;master=null;current?.close?.().catch(()=>{})};
 return {play,stop,description:SOUND_PALETTE};
}
