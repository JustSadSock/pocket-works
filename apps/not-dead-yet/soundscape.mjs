// Apartment no.17 acoustic system. Sound is synthesized locally; no remote samples.
// One AudioContext, no intervals, safe on iOS and browsers that forbid audio.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createSoundscape({Context=(typeof window!=='undefined'?(window.AudioContext||window.webkitAudioContext):null)}={}){
 let ctx=null,enabled=true,noise=null,lastPulse=-100,lastRoom='',clockTick=-100,lastAmbienceCycle=-1;
 const safe=(callback)=>{if(!enabled||!ctx)return;try{callback()}catch{}};
 function activate(){if(!enabled||!Context)return false;try{
   if(!ctx){ctx=new Context();if(!ctx.createBuffer)return false;
    noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.5),ctx.sampleRate);
    const data=noise.getChannelData(0);let x=183741;for(let i=0;i<data.length;i++){x^=x<<13;x^=x>>>17;x^=x<<5;data[i]=((x>>>0)/2147483648-1)*.45}
   }
   if(ctx.state==='suspended')Promise.resolve(ctx.resume()).catch(()=>{});
   return true
 }catch{return false}}
 function envelope({at=ctx?.currentTime||0,duration=.12,volume=.035,attack=.005,pan=0}={}){
   const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,at);
   gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),at+attack);
   gain.gain.exponentialRampToValueAtTime(.0001,at+Math.max(attack+.015,duration));
   if(ctx.createStereoPanner){const stereo=ctx.createStereoPanner();stereo.pan.value=clamp(pan,-.85,.85);gain.connect(stereo);stereo.connect(ctx.destination)}
   else gain.connect(ctx.destination);
   return gain
 }
 function note(freq,{duration=.17,volume=.035,type='sine',end=freq,pan=0,at=ctx.currentTime}={}){
   const osc=ctx.createOscillator(),gain=envelope({at,duration,volume,pan});osc.type=type;
   osc.frequency.setValueAtTime(Math.max(25,freq),at);
   osc.frequency.exponentialRampToValueAtTime(Math.max(25,end),at+Math.max(.02,duration*.75));
   osc.connect(gain);osc.start(at);osc.stop(at+duration+.016)
 }
 function hiss({duration=.17,volume=.025,frequency=750,pan=0,at=ctx.currentTime}={}){
   if(!noise||!ctx.createBufferSource)return;
   const src=ctx.createBufferSource();src.buffer=noise;
   const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=frequency;
   src.connect(filter);filter.connect(envelope({at,duration,volume,pan}));src.start(at);src.stop(at+duration+.012)
 }
 function event(name,{room='hall',pan=0,intensity=1}={}){
   if(!activate())return false;
   const scale=clamp(intensity,0,2),now=ctx.currentTime;
   safe(()=>{
    switch(name){
     case 'footstep': {
      const hard=room==='Ванная'||room==='Кухня';hiss({duration:hard?.085:.10,frequency:hard?1550:560,volume:(hard?.015:.021)*scale,pan});
      note(hard?110:75,{duration:.08,volume:.017*scale,end:hard?70:43,pan});break
     }
     case 'shot':
      hiss({duration:.36,frequency:690,volume:.15*scale,pan});
      note(92,{type:'sawtooth',end:30,duration:.21,volume:.10*scale,pan});
      note(155,{type:'triangle',end:95,duration:.08,volume:.045*scale,pan,at:now+.10});break;
     case 'empty':note(520,{duration:.03,volume:.03,type:'square',end:340});break;
     case 'reload':
      for(let i=0;i<4;i++)note([470,390,600,550][i],{type:'triangle',volume:.019,duration:.055,at:now+i*.19,pan});break;
     case 'memory':
      note(261.6,{duration:.43,volume:.026,type:'triangle',end:293.6,pan});
      note(329.6,{duration:.60,volume:.023,type:'sine',end:392,at:now+.13,pan});
      hiss({frequency:490,duration:.32,volume:.012,pan});break;
     case 'pickup':
      for(let i=0;i<3;i++)note([392,494,588][i],{volume:.028,duration:.32,at:now+i*.105,pan});break;
     case 'shift':
      note(80,{type:'sawtooth',end:46,duration:.5,volume:.022,pan});hiss({frequency:220,duration:.62,volume:.02,pan});break;
     case 'sighting':
      note(134,{type:'sine',end:73,duration:.66,volume:.018,pan});break;
     case 'heartbeat':
      note(66,{type:'sine',end:38,duration:.15,volume:.035*scale,pan});
      note(52,{type:'sine',end:32,duration:.13,volume:.023*scale,at:now+.2,pan});break;
     case 'clock':
      note(970,{type:'sine',end:770,duration:.026,volume:.007,pan});break;
     case 'pipe':
      note(144,{type:'triangle',end:73,duration:1.1,volume:.012,pan});
      hiss({duration:1.2,frequency:360,volume:.007,pan});break;
     case 'radio':
      hiss({duration:.9,frequency:1500,volume:.008,pan});break;
     case 'radio-static':
      hiss({duration:1.0,frequency:1600,volume:.023,pan});
      note(151,{duration:.31,volume:.012,type:'triangle',end:119,pan});break;
     case 'radio-melody':
      hiss({duration:.42,frequency:720,volume:.014,pan});
      for(let i=0;i<5;i++)note([294,330,392,330,262][i],{type:'sine',volume:.018,duration:.26,at:now+.16+i*.25,pan});break;
     case 'radio-memory':
      hiss({duration:.55,frequency:550,volume:.013,pan});
      for(let i=0;i<5;i++)note([262,294,330,392,330][i],{type:'triangle',volume:.022,duration:.36,at:now+.15+i*.30,pan});
      note(131,{duration:1.2,volume:.014,type:'sine',end:165,at:now+.30,pan});break;
     case 'blackout':
      note(95,{type:'sawtooth',end:33,duration:.6,volume:.055,pan});
      hiss({frequency:280,duration:.75,volume:.040,pan});
      note(880,{type:'square',end:370,duration:.06,volume:.021,at:now+.24,pan});break;
     case 'breaker':
      note(360,{type:'square',end:120,duration:.075,volume:.035,pan});
      note(195,{type:'triangle',end:90,duration:.22,volume:.019,at:now+.07,pan});break;
     case 'power-return':
      note(72,{type:'sine',end:104,duration:1.1,volume:.035,pan});
      note(650,{type:'triangle',end:520,duration:.18,volume:.019,at:now+.23,pan});
      hiss({frequency:460,duration:.50,volume:.012,at:now+.33,pan});break;
     case 'door':
      note(132,{type:'triangle',end:71,duration:.39,volume:.033,pan});
      hiss({duration:.28,volume:.020,frequency:520,pan});
      note(460,{type:'triangle',end:230,duration:.07,volume:.020,at:now+.32,pan});break;
     case 'torch':note(320,{type:'triangle',end:210,duration:.07,volume:.025});break;
     case 'win':for(let i=0;i<4;i++)note([262,330,392,523][i],{type:'triangle',volume:.032,duration:.56,at:now+i*.2});break;
     case 'lose':note(116,{type:'sine',end:38,duration:1.3,volume:.036});break
    }
   });
   return true
 }
 function tone(freq,duration=.12,volume=.025,type='sine'){if(!activate())return;safe(()=>note(freq,{duration,volume,type,end:Math.max(28,freq*.65)}))}
 function tick({elapsed=0,room='Прихожая',stress=0,active=true}={}){
  if(!active||!enabled||!ctx)return;
  if(elapsed-clockTick>=1.25){clockTick=elapsed;event('clock',{room,pan:-.5})}
  if(stress>48&&elapsed-lastPulse>clamp(2.4-stress*.017,.7,2)){lastPulse=elapsed;event('heartbeat',{intensity:stress/85})}
  // Deterministic, low-rate domestic sounds. No jump-scare randomness and no timers.
  const cycle=Math.floor(elapsed/7),pulse=(cycle*1103515245+room.length*97)>>>0;
  if(cycle!==lastAmbienceCycle){lastAmbienceCycle=cycle;if(pulse%4===0)event(room==='Ванная'?'pipe':'radio',{pan:pulse%2===0?-.7:.7})}
  lastRoom=room
 }
 function setEnabled(value){enabled=Boolean(value);if(!enabled&&ctx?.state==='running')Promise.resolve(ctx.suspend()).catch(()=>{});else if(enabled&&ctx?.state==='suspended')Promise.resolve(ctx.resume()).catch(()=>{})}
 function suspend(){if(ctx?.state==='running')Promise.resolve(ctx.suspend()).catch(()=>{})}
 function dispose(){try{ctx?.close?.()}catch{}ctx=null;noise=null}
 return {activate,event,tone,tick,setEnabled,suspend,dispose,get enabled(){return enabled},get active(){return Boolean(ctx)}};
}
