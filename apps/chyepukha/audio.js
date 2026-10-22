// Small procedural, offline soundscape. No remote audio, autoplay or external API.
export function createSoundscape(){
 let ctx=null,fxGain=null,musicGain=null,clock=null,beat=0,scene='menu';
 let effects=false,music=false,fxVolume=.45,musicVolume=.22;
 const tones={menu:[60,64,67,72,67,64,59,62],lobby:[57,60,64,69,64,60,57,64],writing:[60,63,67,70,67,63,58,62],finished:[64,67,71,76,72,67,64,71]};
 const frequency=midi=>440*Math.pow(2,(midi-69)/12);
 function unlock(){
  try{
   if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;ctx=new C();
    fxGain=ctx.createGain();musicGain=ctx.createGain();fxGain.connect(ctx.destination);musicGain.connect(ctx.destination);
   }
   if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
   fxGain.gain.value=effects?fxVolume*.23:0;musicGain.gain.value=music?musicVolume*.12:0;
   if(music&&!document.hidden)start();return true;
  }catch{return false}
 }
 function note(midi,time,length,volume=.14,bus=musicGain,wave='triangle'){
  if(!ctx||!bus)return;
  const osc=ctx.createOscillator(),env=ctx.createGain();
  osc.type=wave;osc.frequency.value=frequency(midi);
  env.gain.setValueAtTime(.0001,time);env.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),time+.012);
  env.gain.exponentialRampToValueAtTime(.0001,time+length);
  osc.connect(env).connect(bus);osc.start(time);osc.stop(time+length+.02);
 }
 function pulse(){
  if(!ctx||!music||document.hidden||ctx.state!=='running')return;
  const seq=tones[scene]||tones.menu,i=beat++%seq.length,t=ctx.currentTime+.02;
  note(seq[i],t,.37,.15);
  if(i%2===0)note(seq[i]-24,t,.52,.12,musicGain,'sine');
  if(i%4===3)note(seq[i]+7,t,.27,.055);
 }
 function start(){if(clock!==null)return;pulse();clock=setInterval(pulse,510)}
 function stop(){if(clock!==null){clearInterval(clock);clock=null}}
 function config({effectsEnabled=effects,musicEnabled=music,effectsLevel=fxVolume,musicLevel=musicVolume}={}){
  effects=Boolean(effectsEnabled);music=Boolean(musicEnabled);
  fxVolume=Math.max(0,Math.min(1,Number(effectsLevel)||0));
  musicVolume=Math.max(0,Math.min(1,Number(musicLevel)||0));
  if(ctx){fxGain.gain.setTargetAtTime(effects?fxVolume*.23:0,ctx.currentTime,.025);
   musicGain.gain.setTargetAtTime(music?musicVolume*.12:0,ctx.currentTime,.08);
   if(!music||document.hidden)stop();else start();}
 }
 function fx(type='tap'){
  if(!effects||!unlock())return;
  const t=ctx.currentTime+.005,notes={tap:[74],word:[74,79],seal:[55,67],turn:[64,71],reveal:[60,67,72],page:[69],error:[51,48]};
  const list=notes[type]||notes.tap;
  list.forEach((n,i)=>note(n,t+i*.075,type==='seal'?.22:.12,.36,fxGain,type==='seal'?'sawtooth':'triangle'));
 }
 function setScene(next){if(scene===next)return;scene=next;beat=0;if(ctx&&music&&!document.hidden){stop();start()}}
 function onVisibility(){if(document.hidden)stop();else if(ctx&&music)start()}
 document.addEventListener('visibilitychange',onVisibility);
 return {unlock,config,fx,setScene,dispose(){stop();document.removeEventListener('visibilitychange',onVisibility);if(ctx)void ctx.close().catch(()=>{})}};
}
