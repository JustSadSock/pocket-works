import {spatialProfile} from './spatial-audio.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function number(value,fallback,min,max,label){
  const n=value??fallback;
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error('Invalid '+label);
  return n;
}
function checkBuffer(b){
  if(!b||!Number.isInteger(b.length)||b.length<2||!Number.isInteger(b.numberOfChannels)||b.numberOfChannels<1||b.numberOfChannels>2||!Number.isFinite(b.sampleRate)||b.sampleRate<8000||typeof b.getChannelData!=='function')throw new Error('Invalid audio buffer');
}
function automate(param,value,now,seconds=.035){
  if(typeof param.cancelAndHoldAtTime==='function'){
    param.cancelAndHoldAtTime(now);
  }else{
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value,now);
  }
  if(seconds===0)param.setValueAtTime(value,now);
  else param.linearRampToValueAtTime(value,now+seconds);
}
// Overlap the end and beginning, shortening the loop by the overlap.
export function makeSeamlessLoop(context,buffer,{crossfadeSeconds=.12}={}){
  checkBuffer(buffer);
  const seconds=number(crossfadeSeconds,.12,.001,2,'crossfade');
  const k=Math.round(seconds*buffer.sampleRate),n=buffer.length;
  if(k<2||k*2>=n)throw new Error('Crossfade must be shorter than half the buffer');
  const result=context.createBuffer(buffer.numberOfChannels,n-k,buffer.sampleRate);
  for(let c=0;c<buffer.numberOfChannels;c++){
    const input=buffer.getChannelData(c),out=result.getChannelData(c);
    for(let i=0;i<n-k;i++){
      if(!Number.isFinite(input[i]))throw new Error('Non-finite PCM');
      if(i<k){
        const tail=input[n-k+i];if(!Number.isFinite(tail))throw new Error('Non-finite PCM');
        const t=i/(k-1);const w=.5-.5*Math.cos(Math.PI*t);
        out[i]=(1-w)*tail+w*input[i];
      }else out[i]=input[i];
    }
  }
  return result;
}
// This factory owns its nodes but never closes or suspends the app context.
export function createDynamicEmitter({context,destination=context?.destination,buffer,loop=true,spatial,volume=1}={}){
  if(!context||!destination)throw new Error('Audio context and destination required');
  checkBuffer(buffer);
  let profile=spatialProfile(spatial),level=number(volume,1,0,1,'volume');
  let source=null,graph=null,epoch=0,closed=false,starting=false;
  function dispose(){
    if(!graph)return;
    const old=graph;graph=null;source=null;
    try{old.source.stop()}catch{}
    for(const n of old.nodes)try{n.disconnect()}catch{}
  }
  function updateNodes(seconds){
    if(!graph)return;
    const t=context.currentTime;
    automate(graph.gain.gain,level*profile.gain,t,seconds);
    automate(graph.filter.frequency,Math.min(profile.cutoff,context.sampleRate*.45),t,seconds);
    if(graph.pan)automate(graph.pan.pan,profile.pan,t,seconds);
    if(graph.wet)automate(graph.wet.gain,profile.reflection,t,seconds);
    if(graph.delay)automate(graph.delay.delayTime,profile.delay,t,seconds);
  }
  return {
    async start({offsetSeconds=0,fadeInSeconds=0}={}){
      if(closed||starting||source)return false;
      const offset=number(offsetSeconds,0,0,1e12,'offset');
      const fade=number(fadeInSeconds,0,0,2,'fade in');
      const duration=buffer.length/buffer.sampleRate;
      if(!loop&&offset>=duration)return false;
      starting=true;const token=++epoch;const nodes=[];
      try{
        const offline=typeof context.startRendering==='function';
        if(!offline&&(context.state==='suspended'||context.state==='interrupted'))await context.resume();
        if(closed||token!==epoch||(!offline&&context.state!=='running')||(offline&&context.state==='closed'))return false;
        const s=context.createBufferSource();nodes.push(s);s.buffer=buffer;s.loop=Boolean(loop);
        const filter=context.createBiquadFilter();nodes.push(filter);filter.type='lowpass';filter.Q.value=.707;
        const gain=context.createGain();nodes.push(gain);
        s.connect(filter);filter.connect(gain);let signal=gain,pan=null,delay=null,wet=null;
        if(typeof context.createStereoPanner==='function'){pan=context.createStereoPanner();nodes.push(pan);signal.connect(pan);signal=pan;}
        signal.connect(destination);
        if(typeof context.createDelay==='function'){
          delay=context.createDelay(.2);nodes.push(delay);wet=context.createGain();nodes.push(wet);
          signal.connect(delay);delay.connect(wet);wet.connect(destination);
        }
        source=s;graph={source:s,filter,gain,pan,delay,wet,nodes};updateNodes(0);
        s.onended=()=>{if(source===s)dispose()};
        if(fade>0){
          const t=context.currentTime;
          gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(0,t);
          gain.gain.linearRampToValueAtTime(level*profile.gain,t+fade);
        }
        s.start(0,loop?offset%duration:offset);return true;
      }catch{if(graph)dispose();else for(const n of nodes)try{n.disconnect()}catch{};return false}
      finally{starting=false}
    },
    update(nextSpatial,{rampSeconds=.035}={}){
      if(closed)return false;
      const next=spatialProfile(nextSpatial),seconds=number(rampSeconds,.035,0,2,'ramp');
      profile=next;updateNodes(seconds);return true;
    },
    setVolume(value){if(closed)return false;level=number(value,1,0,1,'volume');updateNodes(.035);return true},
    stop(){epoch++;dispose()},
    destroy(){if(closed)return;closed=true;epoch++;dispose()},
    get active(){return source!==null},
    get profile(){return {...profile}}
  };
}
// Pure gain law shared with offline audition production.
export function stemGainAtIntensity(stem,intensity){
  const value=number(intensity,0,0,1,'intensity');
  const base=number(stem.base,0,0,1,'base'),gain=number(stem.gain,1,0,1,'stem gain');
  const threshold=number(stem.threshold,0,0,1,'threshold'),width=number(stem.width,.25,.01,1,'width');
  return gain*(base+(1-base)*clamp((value-threshold)/width,0,1));
}
// Schedule against the transport's audio clock, never a wall-clock timer.
export function nextMusicBoundary({startTime,now,bpm,beatsPerBar=4,quantize='bar',lookahead=.03}){
  number(startTime,0,0,1e12,'startTime');number(now,0,0,1e12,'now');
  const tempo=number(bpm,120,20,300,'bpm'),meter=number(beatsPerBar,4,1,16,'meter'),lead=number(lookahead,.03,0,.5,'lookahead');
  if(!Number.isInteger(meter)||!['beat','bar'].includes(quantize))throw new Error('Invalid musical grid');
  const step=60/tempo*(quantize==='bar'?meter:1);
  return startTime+Math.max(0,Math.ceil((now+lead-startTime)/step-1e-10))*step;
}
function envelopeValue(e,t){
  if(t<e.start)return e.from;
  if(t>=e.end)return e.to;
  return e.from+(e.to-e.from)*(t-e.start)/(e.end-e.start);
}
function scheduleStem(voice,target,now,at,fade){
  const p=voice.gain.gain,held=envelopeValue(voice.envelope,now);
  p.cancelScheduledValues(now);
  p.setValueAtTime(held,now);
  if(at>now)p.setValueAtTime(held,at);
  if(fade===0)p.setValueAtTime(target,at);
  else p.linearRampToValueAtTime(target,at+fade);
  voice.envelope={from:held,to:target,start:at,end:at+fade};
}
// All stems are authored on the same sample grid and are started on one audio clock.
// Intensity changes gains rather than restarting the underlying transport.
export function createAdaptiveMusic({context,destination=context?.destination,stems,intensity=0,volume=.7,bpm=120,beatsPerBar=4}={}){
  if(!context||!destination||!Array.isArray(stems)||!stems.length||stems.length>8)throw new Error('Expected 1–8 music stems');
  let value=number(intensity,0,0,1,'intensity'),masterVolume=number(volume,.7,0,1,'volume');
  const tempo=number(bpm,120,20,300,'bpm'),meter=number(beatsPerBar,4,1,16,'meter');
  if(!Number.isInteger(meter))throw new Error('Invalid meter');
  const ids=new Set();
  const tracks=stems.map(s=>{
    checkBuffer(s.buffer);
    if(typeof s.id!=='string'||!s.id||ids.has(s.id))throw new Error('Invalid stem id');
    ids.add(s.id);
    const threshold=number(s.threshold,0,0,1,'threshold'),width=number(s.width,.25,.01,1,'width');
    return {id:s.id,buffer:s.buffer,threshold,width,base:number(s.base,0,0,1,'base'),gain:number(s.gain,1,0,1,'stem gain')};
  });
  if(tracks.some(s=>s.buffer.length!==tracks[0].buffer.length||s.buffer.sampleRate!==tracks[0].buffer.sampleRate))throw new Error('Stems must have identical sample grids');
  const master=context.createGain();master.gain.value=masterVolume;master.connect(destination);
  let voices=[],closed=false,starting=false,epoch=0,startTime=null,transitionAt=null;
  const target=s=>stemGainAtIntensity(s,value);
  function dispose(){
    const old=voices;voices=[];startTime=null;transitionAt=null;
    for(const v of old){try{v.source.stop()}catch{};try{v.source.disconnect()}catch{};try{v.gain?.disconnect()}catch{}}
  }
  return {
    async start(){
      if(closed||starting||voices.length)return false;
      starting=true;const token=++epoch;
      try{
        const offline=typeof context.startRendering==='function';
        if(!offline&&(context.state==='suspended'||context.state==='interrupted'))await context.resume();
        if(closed||token!==epoch||(!offline&&context.state!=='running')||(offline&&context.state==='closed'))return false;
        for(const track of tracks){
          const source=context.createBufferSource();
          const voice={source,gain:null,track};voices.push(voice);
          const gain=context.createGain();voice.gain=gain;
          source.buffer=track.buffer;source.loop=true;gain.gain.value=target(track);
          voice.envelope={from:target(track),to:target(track),start:context.currentTime,end:context.currentTime};
          source.connect(gain);gain.connect(master);
        }
        startTime=context.currentTime+.05;
        for(const v of voices)v.source.start(startTime);
        return true;
      }catch{dispose();return false}finally{starting=false}
    },
    setIntensity(next,{fadeSeconds=.75,quantize='immediate'}={}){
      if(closed)return false;
      const v=number(next,0,0,1,'intensity'),s=number(fadeSeconds,.75,0,10,'fade');
      if(!['immediate','beat','bar'].includes(quantize))throw new Error('Invalid quantize');
      const now=context.currentTime;
      const at=startTime===null||quantize==='immediate'?now:nextMusicBoundary({startTime,now,bpm:tempo,beatsPerBar:meter,quantize});
      value=v;transitionAt=voices.length?at:null;
      for(const voice of voices)scheduleStem(voice,target(voice.track),now,at,s);
      return true;
    },
    setVolume(next){if(closed)return false;masterVolume=number(next,.7,0,1,'volume');automate(master.gain,masterVolume,context.currentTime,.035);return true},
    stop(){epoch++;dispose()},
    destroy(){if(closed)return;closed=true;epoch++;dispose();master.disconnect()},
    get state(){return {active:voices.length>0,startTime,transitionAt,intensity:value,targets:Object.fromEntries(tracks.map(s=>[s.id,target(s)]))}}
  };
}
