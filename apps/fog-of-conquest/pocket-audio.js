/* Fog of Conquest · locally synthesised war-table sound.
   No remote MP3, downloads, audio autoplay or network calls.
   User gesture creates one Web Audio context; settings always take precedence. */
(function(root){
  'use strict';
  const AudioContextClass=root.AudioContext||root.webkitAudioContext;
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  const setting={sfxEnabled:true,musicEnabled:false,sfxVolume:.5,musicVolume:.5};
  let ctx=null,musicBus=null,sfxBus=null,voices=[],started=false;
  let ambience=[];
  let lastTap=0;
  const state=()=>({...setting,started:!!ctx&&ctx.state==='running',available:!!AudioContextClass,
    ambiencePlaying:ambience.length>0});
  function ensure(){
    if(!AudioContextClass)return null;
    if(ctx)return ctx;
    try{
      ctx=new AudioContextClass();
      sfxBus=ctx.createGain();musicBus=ctx.createGain();
      sfxBus.gain.value=0;musicBus.gain.value=0;
      sfxBus.connect(ctx.destination);musicBus.connect(ctx.destination);
      updateGains();
    }catch{ctx=null;}
    return ctx;
  }
  function updateGains(){
    if(!ctx)return;
    const t=ctx.currentTime;
    sfxBus.gain.setTargetAtTime(setting.sfxEnabled?setting.sfxVolume*.42:0,t,.012);
    musicBus.gain.setTargetAtTime(setting.musicEnabled?setting.musicVolume*.13:0,t,.15);
  }
  function ambienceStart(){
    if(!ctx||!setting.musicEnabled||ambience.length)return;
    const voicesHz=[73.42,110,146.83,220];
    for(let i=0;i<voicesHz.length;i++){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      oscillator.type=i===3?'sine':'triangle';
      oscillator.frequency.value=voicesHz[i];
      filter.type='lowpass';filter.frequency.value=300;
      gain.gain.value=[.22,.11,.17,.055][i];
      oscillator.connect(filter);filter.connect(gain);gain.connect(musicBus);
      oscillator.start();ambience.push({oscillator,gain,filter});
    }
  }
  function ambienceStop(){
    for(const v of ambience){try{v.oscillator.stop();v.oscillator.disconnect();v.gain.disconnect();v.filter.disconnect();}catch{}}
    ambience=[];
  }
  async function unlock(){
    const audio=ensure();if(!audio)return false;
    try{if(audio.state!=='running')await audio.resume();}catch{}
    started=audio.state==='running';
    if(started){updateGains();if(setting.musicEnabled)ambienceStart();}
    return started;
  }
  function configure(next={}){
    for(const k of ['sfxEnabled','musicEnabled'])if(typeof next[k]==='boolean')setting[k]=next[k];
    for(const k of ['sfxVolume','musicVolume'])if(next[k]!==undefined)setting[k]=clamp(next[k]);
    updateGains();
    if(!setting.musicEnabled)ambienceStop();
    else if(ctx?.state==='running')ambienceStart();
    return state();
  }
  const recipes={
    attack:{notes:[[122,.12,'sawtooth'],[71,.23,'triangle']],depth:.9},
    heal:{notes:[[392,.24,'sine'],[523.25,.24,'sine'],[659.25,.26,'sine']],depth:.27},
    capture:{notes:[[196,.17,'triangle'],[293.66,.21,'triangle'],[392,.35,'sine']],depth:.34},
    spawn:{notes:[[174.61,.17,'triangle'],[261.63,.25,'sine']],depth:.23},
    move:{notes:[[118,.075,'triangle']],depth:.18},
    uiClick:{notes:[[340,.045,'sine']],depth:.16},
    uiHover:{notes:[[500,.025,'sine']],depth:.055},
    end:{notes:[[130.81,.22,'triangle'],[196,.32,'sine']],depth:.27}
  };
  function play(kind){
    if(!setting.sfxEnabled||!setting.sfxVolume||!ctx||ctx.state!=='running')return false;
    const recipe=recipes[kind];if(!recipe)return false;
    const now=ctx.currentTime,stamp=Date.now();
    if((kind==='uiHover'||kind==='uiClick')&&stamp-lastTap<42)return false;
    if(kind==='uiHover'||kind==='uiClick')lastTap=stamp;
    const oscillatorNodes=[];
    recipe.notes.forEach(([hz,duration,type],i)=>{
      const osc=ctx.createOscillator(),amp=ctx.createGain();
      const t=now+i*.033;
      osc.type=type;osc.frequency.setValueAtTime(hz*(kind==='attack'?1.1:1),t);
      if(kind==='attack'||kind==='move')osc.frequency.exponentialRampToValueAtTime(Math.max(35,hz*.64),t+duration);
      amp.gain.setValueAtTime(.0001,t);
      amp.gain.exponentialRampToValueAtTime(Math.max(.0002,recipe.depth/(i+1)),t+.008);
      amp.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(amp);amp.connect(sfxBus);osc.start(t);osc.stop(t+duration+.016);
      osc.onended=()=>{osc.disconnect();amp.disconnect();};
      oscillatorNodes.push(osc);
    });
    return !!oscillatorNodes.length;
  }
  function dispose(){
    ambienceStop();
    if(ctx){try{void ctx.close();}catch{}}
    ctx=null;musicBus=null;sfxBus=null;started=false;voices=[];
  }
  if(typeof document!=='undefined'){
    document.addEventListener('pointerdown',()=>{void unlock();},{capture:true,passive:true});
    document.addEventListener('keydown',()=>{void unlock();},{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(!ctx)return;
      if(document.hidden){try{void ctx.suspend();}catch{}}
      else if(started&&setting.musicEnabled){void unlock();}
    });
    root.addEventListener('pagehide',dispose,{once:true});
  }
  root.FogAudio={configure,unlock,play,state,dispose};
})(typeof window!=='undefined'?window:globalThis);
