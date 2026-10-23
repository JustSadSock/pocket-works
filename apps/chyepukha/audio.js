import {getScore,midiToHz} from './audio-score.js';

// Procedural paper, pen and stamp sounds. All audio is local WebAudio and
// only starts after an explicit user interaction. No assets, downloads or API.
export function createSoundscape(){
 let ctx=null,effectsBus=null,musicBus=null,noiseBuffer=null;
 let clock=null,beat=0,scene='menu',effects=false,music=false,fxVolume=.45,musicVolume=.22;
 const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(+n)?+n:0));
 function unlock(){
  try{
   if(!ctx){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return false;
    ctx=new Audio();
    effectsBus=ctx.createGain();musicBus=ctx.createGain();
    effectsBus.connect(ctx.destination);musicBus.connect(ctx.destination);
    const length=Math.max(1,Math.floor(ctx.sampleRate*.8));
    noiseBuffer=ctx.createBuffer(1,length,ctx.sampleRate);
    const data=noiseBuffer.getChannelData(0);
    let seed=912367;
    for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;data[i]=((seed/4294967296)*2-1)*.7}
   }
   if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
   effectsBus.gain.value=effects?fxVolume*.28:0;
   musicBus.gain.value=music?musicVolume*.14:0;
   if(music&&!document.hidden)start();
   return true;
  }catch{return false}
 }
 function voice(midi,at,length=.3,volume=.12,bus=musicBus,type='sine'){
  if(!ctx||!bus)return;
  const oscillator=ctx.createOscillator(),env=ctx.createGain(),tone=ctx.createBiquadFilter();
  oscillator.type=type;oscillator.frequency.value=midiToHz(midi);
  tone.type='lowpass';tone.frequency.value=type==='triangle'?2200:1400;
  env.gain.setValueAtTime(.0001,at);
  env.gain.exponentialRampToValueAtTime(Math.max(.0003,volume),at+.009);
  env.gain.exponentialRampToValueAtTime(.0001,at+length);
  oscillator.connect(tone).connect(env).connect(bus);
  oscillator.start(at);oscillator.stop(at+length+.02);
 }
 function noise(at,duration,{cut=1100,highpass=false,volume=.3,attack=.007,bus=effectsBus}={}){
  if(!ctx||!noiseBuffer||!bus)return;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();
  source.buffer=noiseBuffer;source.loop=false;
  filter.type=highpass?'highpass':'lowpass';filter.frequency.value=cut;
  env.gain.setValueAtTime(.0001,at);
  env.gain.linearRampToValueAtTime(Math.max(.0002,volume),at+Math.min(attack,duration*.3));
  env.gain.exponentialRampToValueAtTime(.0001,at+duration);
  source.connect(filter).connect(env).connect(bus);
  source.start(at);source.stop(at+duration+.01);
 }
 function musicBeat(){
  if(!ctx||!music||document.hidden||ctx.state!=='running')return;
  const score=getScore(scene),i=beat++%score.notes.length,t=ctx.currentTime+.016;
  if(score.notes[i]!=null)voice(score.notes[i],t,scene==='writing'?.42:.36,.09,musicBus,'triangle');
  if(i%4===0)voice(score.bass[i]-12,t,.7,.047,musicBus,'sine');
  // Long spaces between phrases keep long writing sessions calm.
 }
 function start(){
  if(clock!==null||!ctx||!music||document.hidden)return;
  beat=0;musicBeat();
  clock=setInterval(musicBeat,getScore(scene).tempo);
 }
 function stop(){
  if(clock!==null){clearInterval(clock);clock=null}
 }
 function config({effectsEnabled=effects,musicEnabled=music,effectsLevel=fxVolume,musicLevel=musicVolume}={}){
  effects=Boolean(effectsEnabled);music=Boolean(musicEnabled);
  fxVolume=clamp(effectsLevel);musicVolume=clamp(musicLevel);
  if(!ctx)return;
  effectsBus.gain.setTargetAtTime(effects?fxVolume*.28:0,ctx.currentTime,.025);
  musicBus.gain.setTargetAtTime(music?musicVolume*.14:0,ctx.currentTime,.075);
  if(!music||document.hidden)stop();
  else if(ctx.state==='running')start();
 }
 function fx(type='tap'){
  if(!effects||!unlock()||ctx.state!=='running')return;
  const now=ctx.currentTime+.008;
  switch(type){
   case 'word':
    noise(now,.038,{cut:1900,volume:.12,highpass:true});
    voice(78,now,.055,.075,effectsBus,'sine');break;
   case 'seal':
    noise(now,.12,{cut:410,volume:.66,attack:.002});
    voice(47,now,.14,.22,effectsBus,'triangle');
    noise(now+.10,.18,{cut:1100,volume:.22,highpass:true});break;
   case 'page':case 'turn':
    noise(now,.22,{cut:1450,volume:.3,highpass:true,attack:.035});
    noise(now+.07,.16,{cut:890,volume:.16,attack:.02});break;
   case 'receive':
    noise(now,.18,{cut:1100,volume:.28,highpass:true});
    voice(67,now+.12,.11,.08,effectsBus,'sine');break;
   case 'ready':case 'join':
    noise(now,.06,{cut:760,volume:.24});
    voice(type==='ready'?79:72,now+.025,.13,.10,effectsBus,'triangle');break;
   case 'reveal':
    noise(now,.28,{cut:970,volume:.28,highpass:true,attack:.05});
    [60,64,67,72].forEach((m,i)=>voice(m,now+.12+i*.1,.4,.13,effectsBus,'triangle'));break;
   case 'error':
    voice(51,now,.10,.13,effectsBus,'triangle');
    voice(48,now+.09,.12,.12,effectsBus,'triangle');break;
   case 'tap':default:
    noise(now,.05,{cut:1050,volume:.2,attack:.002});break;
  }
 }
 function setScene(next){
  if(scene===next)return;
  scene=next;beat=0;
  if(ctx&&music&&!document.hidden){stop();if(ctx.state==='running')start()}
 }
 const onVisibility=()=>{if(document.hidden)stop();else if(ctx&&music&&ctx.state==='running')start()};
 document.addEventListener('visibilitychange',onVisibility);
 return {
  unlock,config,fx,setScene,
  dispose(){
   stop();document.removeEventListener('visibilitychange',onVisibility);
   if(ctx){const ending=ctx;ctx=null;void ending.close().catch(()=>{})}
  }
 };
}
