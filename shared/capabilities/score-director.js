import {nextMusicBoundary,stemGainAtIntensity} from './continuous-audio.js';
// Horizontal state transitions with optional phase-locked vertical layers.
export function createScoreDirector({context,destination=context?.destination,graph,buffers,bridgeBuffers={},layers={},intensity=0,maxVoices=8,volume=.7,maxDecodedBytes=128*1024*1024}={}){
 if(!context||!destination||!graph||!graph.states||!graph.edges||!Number.isFinite(volume)||volume<0||volume>1)throw Error('Invalid score director');
 const entries=Object.entries(graph.states);
 if(!entries.length||entries.length>32||!Object.hasOwn(graph.states,graph.initial))throw Error('Invalid score graph');
 if(!Number.isInteger(maxVoices)||maxVoices<1||maxVoices>16||!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('Invalid adaptive score budget');
 const clips=new Map();
 for(const id of Object.keys(layers))if(!Object.hasOwn(graph.states,id))throw Error('Unknown layer state '+id);
 for(const [id,s] of entries){
  const b=buffers?.[id];
  if(!b||!Number.isInteger(b.length)||b.length<2||!Number.isFinite(b.sampleRate)||b.sampleRate<8000||typeof b.getChannelData!=='function'||![1,2].includes(b.numberOfChannels))throw Error('Missing score buffer '+id);
  if(!Number.isFinite(s.tempo)||s.tempo<20||s.tempo>300||!Number.isInteger(s.beatsPerBar)||s.beatsPerBar<1||s.beatsPerBar>16||!Number.isInteger(s.bars)||s.bars<1||s.bars>128)throw Error('Invalid score grid '+id);
  const frames=60/s.tempo*s.beatsPerBar*s.bars*b.sampleRate;
  if(Math.abs(b.length-frames)>1.01)throw Error('Score buffer is not bar aligned: '+id);
  const edges=graph.edges[id];
  if(!Array.isArray(edges)||new Set(edges).size!==edges.length||edges.some(e=>e===id||!Object.hasOwn(graph.states,e)))throw Error('Invalid score edges '+id);
  const extras=layers[id]??[];
  if(!Array.isArray(extras)||extras.length>7)throw Error('Invalid state layers '+id);
  const ids=new Set();
  const tracks=extras.map(layer=>{
   const v=layer?.buffer;
   if(typeof layer?.id!=='string'||!layer.id||ids.has(layer.id)||!v||v.length!==b.length||v.sampleRate!==b.sampleRate||![1,2].includes(v.numberOfChannels)||typeof v.getChannelData!=='function')throw Error('Invalid or unaligned state layer '+id);
   ids.add(layer.id);
   const def={id:layer.id,buffer:v,base:layer.base??0,gain:layer.gain??1,threshold:layer.threshold??0,width:layer.width??.25};
   stemGainAtIntensity(def,intensity);
   return def;
  });
  clips.set(id,{id,buffer:b,tracks,bpm:s.tempo,meter:s.beatsPerBar,edges:new Set(edges)});
 }
 const requiredVoices=Math.max(...[...clips.values()].flatMap(c=>[1+c.tracks.length,...[...c.edges].map(id=>2+c.tracks.length+clips.get(id).tracks.length)]));
 if(requiredVoices>maxVoices)throw Error('Adaptive score voice reservation exceeded');
 const bridges=new Map();
 for(const [key,desc] of Object.entries(graph.bridges??{})){
  const [from,to,...extra]=key.split(':');
  const target=clips.get(to),b=bridgeBuffers[key];
  if(extra.length||!clips.get(from)?.edges.has(to)||!target||!desc||!b||!Number.isInteger(b.length)||b.length<2||b.length/b.sampleRate>15||b.sampleRate!==target.buffer.sampleRate||b.numberOfChannels!==target.buffer.numberOfChannels||typeof b.getChannelData!=='function')throw Error('Invalid score bridge '+key);
  bridges.set(key,b);
 }
 if(!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<1)throw Error('Invalid score memory budget');
 const bytes=b=>b.length*b.numberOfChannels*4;
 const baseBytes=[...new Set([...clips.values()].flatMap(c=>[c.buffer,...c.tracks.map(t=>t.buffer)]).concat([...bridges.values()]))].reduce((n,b)=>n+bytes(b),0);
 // At most two composite buffers can be held by scheduled/playing voices.
 const largest=[...bridges].map(([edge,b])=>{const c=clips.get(edge.split(':')[1]);return bytes(b)+bytes(c.buffer)+c.tracks.reduce((n,t)=>n+(b.length+t.buffer.length)*t.buffer.numberOfChannels*4,0)}).sort((a,b)=>b-a);
 const reservedBytes=baseBytes+2*(largest[0]??0);
 if(!Number.isSafeInteger(reservedBytes)||reservedBytes>maxDecodedBytes)throw Error('Score decoded memory budget exceeded');
 const master=context.createGain();master.gain.value=volume;master.connect(destination);
 let current=null,pending=null,queued=null,closed=false,starting=false,epoch=0;
 function cleanup(v){if(!v)return;for(const t of v.sources){try{t.source.stop()}catch{};try{t.source.disconnect()}catch{};try{t.gain?.disconnect()}catch{}}try{v.gain.disconnect()}catch{}}
 function make(id,when,level,bridge){
  const clip=clips.get(id),gain=context.createGain(),sources=[];
  const bridgeDuration=bridge?bridge.length/bridge.sampleRate:0;
  const v={id,clip,gain,sources,startTime:when+bridgeDuration,bridgeUntil:bridgeDuration?when+bridgeDuration:null};
  try{
   gain.gain.value=level;gain.connect(master);
   for(const def of [null,...clip.tracks]){
    const source=context.createBufferSource(),t={source,def,gain:null};sources.push(t);
    const target=def?.buffer??clip.buffer;source.loop=true;
    if(bridge){
     const combined=context.createBuffer(target.numberOfChannels,bridge.length+target.length,target.sampleRate);
     for(let c=0;c<target.numberOfChannels;c++){
      const data=combined.getChannelData(c);
      if(!def)data.set(bridge.getChannelData(c));
      data.set(target.getChannelData(c),bridge.length);
     }
     source.buffer=combined;source.loopStart=bridgeDuration;source.loopEnd=combined.length/combined.sampleRate;
    }else source.buffer=target;
    if(def){
     t.gain=context.createGain();const value=stemGainAtIntensity(def,intensity);
     t.gain.gain.value=value;t.envelope={from:value,to:value,start:when,end:when};
     source.connect(t.gain);t.gain.connect(gain);
    }else source.connect(gain);
   }
   for(const t of sources)t.source.start(when);
   return v;
  }catch(e){cleanup(v);throw e;}
 }
 function layerValue(e,now){if(now<e.start)return e.from;if(now>=e.end)return e.to;return e.from+(e.to-e.from)*(now-e.start)/(e.end-e.start)}
 function changeLayers(group,now,quantize,fade){
  const at=quantize==='immediate'?now:nextMusicBoundary({startTime:group.startTime,now,bpm:group.clip.bpm,beatsPerBar:group.clip.meter,quantize});
  for(const t of group.sources){
   if(!t.def)continue;
   const held=layerValue(t.envelope,now),target=stemGainAtIntensity(t.def,intensity),p=t.gain.gain;
   p.cancelScheduledValues(now);p.setValueAtTime(held,now);
   if(at>now)p.setValueAtTime(held,at);
   if(fade)p.linearRampToValueAtTime(target,at+fade);else p.setValueAtTime(target,at);
   t.envelope={from:held,to:target,start:at,end:at+fade};
  }
 }
 function schedule(request){
  const {id,quantize,fadeSeconds}=request;
  const now=context.currentTime;
  const at=quantize==='immediate'?Math.max(now+.03,current.startTime):nextMusicBoundary({startTime:current.startTime,now,bpm:current.clip.bpm,beatsPerBar:current.clip.meter,quantize});
  const end=at+fadeSeconds;
  const bridge=bridges.get(current.id+':'+id);
  const next=make(id,at,0,bridge);
  try{
   const a=current.gain.gain,b=next.gain.gain;
   a.setValueAtTime(1,at);b.setValueAtTime(0,at);
   if(fadeSeconds===0){a.setValueAtTime(0,at);b.setValueAtTime(1,at)}
   else{a.linearRampToValueAtTime(0,end);b.linearRampToValueAtTime(1,end)}
   for(const t of current.sources)t.source.stop(end);
   pending={next,at,end};return true;
  }catch(e){
   cleanup(next);current.gain.gain.cancelScheduledValues(now);current.gain.gain.setValueAtTime(1,now);throw e;
  }
 }
 function update(){
  if(closed)return false;
  if(pending&&context.currentTime>=pending.end){
   cleanup(current);current=pending.next;pending=null;
   const req=queued;queued=null;
   if(req&&req.id!==current.id&&current.clip.edges.has(req.id))schedule(req);
  }
  return true;
 }
 function stop(){
  epoch++;cleanup(current);cleanup(pending?.next);current=null;pending=null;queued=null;
 }
 return {
  async start(){
   if(closed||starting||current)return false;
   starting=true;const token=++epoch;
   try{
    const offline=typeof context.startRendering==='function';
    if(!offline&&(context.state==='suspended'||context.state==='interrupted'))await context.resume();
    if(closed||token!==epoch||(!offline&&context.state!=='running')||context.state==='closed')return false;
    current=make(graph.initial,context.currentTime+.05,1);return true;
   }finally{starting=false;}
  },
  request(id,{quantize='bar',fadeSeconds=.3}={}){
   if(closed||!current)return false;
   if(!['immediate','beat','bar'].includes(quantize)||!Number.isFinite(fadeSeconds)||fadeSeconds<0||fadeSeconds>2)throw Error('Invalid score transition');
   update();
   const from=pending?.next??current;
   if(id===from.id){queued=null;return true;}
   if(!from.clip.edges.has(id))return false;
   const req={id,quantize,fadeSeconds};
   if(pending){queued=req;return true}
   return schedule(req);
  },
  setIntensity(value,{quantize='immediate',fadeSeconds=.75}={}){
   if(closed)return false;
   if(!Number.isFinite(value)||value<0||value>1||!['immediate','beat','bar'].includes(quantize)||!Number.isFinite(fadeSeconds)||fadeSeconds<0||fadeSeconds>10)throw Error('Invalid score intensity');
   update();intensity=value;const now=context.currentTime;
   for(const group of [current,pending?.next])if(group)changeLayers(group,now,quantize,fadeSeconds);
   return true;
  },
  update,stop,
  destroy(){if(closed)return;closed=true;stop();master.disconnect()},
  get memory(){return {baseBytes,reservedBytes,maxDecodedBytes}},
 get state(){return {current:current?.id??null,pending:pending?.next.id??null,queued:queued?.id??null,transitionAt:pending?.at??null,transitionEnd:pending?.end??null,intensity,requiredVoices,voices:(current?.sources.length??0)+(pending?.next.sources.length??0),startTime:current?.startTime??null,bridgeUntil:pending?.next.bridgeUntil??current?.bridgeUntil??null}}
 };
}
