import {nextMusicBoundary} from './continuous-audio.js';
// Horizontal score transport. One current clip and at most one scheduled successor.
export function createScoreDirector({context,destination=context?.destination,graph,buffers,bridgeBuffers={},volume=.7,maxDecodedBytes=128*1024*1024}={}){
 if(!context||!destination||!graph||!graph.states||!graph.edges||!Number.isFinite(volume)||volume<0||volume>1)throw Error('Invalid score director');
 const entries=Object.entries(graph.states);
 if(!entries.length||entries.length>32||!Object.hasOwn(graph.states,graph.initial))throw Error('Invalid score graph');
 const clips=new Map();
 for(const [id,s] of entries){
  const b=buffers?.[id];
  if(!b||!Number.isInteger(b.length)||b.length<2||!Number.isFinite(b.sampleRate)||b.sampleRate<8000||typeof b.getChannelData!=='function'||![1,2].includes(b.numberOfChannels))throw Error('Missing score buffer '+id);
  if(!Number.isFinite(s.tempo)||s.tempo<20||s.tempo>300||!Number.isInteger(s.beatsPerBar)||s.beatsPerBar<1||s.beatsPerBar>16||!Number.isInteger(s.bars)||s.bars<1||s.bars>128)throw Error('Invalid score grid '+id);
  const frames=60/s.tempo*s.beatsPerBar*s.bars*b.sampleRate;
  if(Math.abs(b.length-frames)>1.01)throw Error('Score buffer is not bar aligned: '+id);
  const edges=graph.edges[id];
  if(!Array.isArray(edges)||new Set(edges).size!==edges.length||edges.some(e=>e===id||!Object.hasOwn(graph.states,e)))throw Error('Invalid score edges '+id);
  clips.set(id,{id,buffer:b,bpm:s.tempo,meter:s.beatsPerBar,edges:new Set(edges)});
 }
 const bridges=new Map();
 for(const [key,desc] of Object.entries(graph.bridges??{})){
  const [from,to,...extra]=key.split(':');
  const target=clips.get(to),b=bridgeBuffers[key];
  if(extra.length||!clips.get(from)?.edges.has(to)||!target||!desc||!b||!Number.isInteger(b.length)||b.length<2||b.length/b.sampleRate>15||b.sampleRate!==target.buffer.sampleRate||b.numberOfChannels!==target.buffer.numberOfChannels||typeof b.getChannelData!=='function')throw Error('Invalid score bridge '+key);
  bridges.set(key,b);
 }
 if(!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<1)throw Error('Invalid score memory budget');
 const bytes=b=>b.length*b.numberOfChannels*4;
 const baseBytes=[...new Set([...clips.values()].map(c=>c.buffer).concat([...bridges.values()]))].reduce((n,b)=>n+bytes(b),0);
 // At most two composite buffers can be held by scheduled/playing voices.
 const largest=[...bridges].map(([edge,b])=>bytes(b)+bytes(clips.get(edge.split(':')[1]).buffer)).sort((a,b)=>b-a);
 const reservedBytes=baseBytes+2*(largest[0]??0);
 if(!Number.isSafeInteger(reservedBytes)||reservedBytes>maxDecodedBytes)throw Error('Score decoded memory budget exceeded');
 const master=context.createGain();master.gain.value=volume;master.connect(destination);
 let current=null,pending=null,queued=null,closed=false,starting=false,epoch=0;
 function cleanup(v){if(!v)return;try{v.source.stop()}catch{};try{v.source.disconnect()}catch{};try{v.gain.disconnect()}catch{}}
 function make(id,when,level,bridge){
  const clip=clips.get(id),source=context.createBufferSource();let gain;
  try{
   gain=context.createGain();gain.gain.value=level;source.loop=true;
   let bridgeDuration=0;
   if(bridge){
    const target=clip.buffer,combined=context.createBuffer(target.numberOfChannels,bridge.length+target.length,target.sampleRate);
    for(let c=0;c<target.numberOfChannels;c++){const data=combined.getChannelData(c);data.set(bridge.getChannelData(c));data.set(target.getChannelData(c),bridge.length);}
    bridgeDuration=bridge.length/bridge.sampleRate;source.buffer=combined;source.loopStart=bridgeDuration;source.loopEnd=combined.length/combined.sampleRate;
   }else source.buffer=clip.buffer;
   source.connect(gain);gain.connect(master);source.start(when);
   return {id,clip,source,gain,startTime:when+bridgeDuration,bridgeUntil:bridgeDuration?when+bridgeDuration:null};
  }catch(e){try{source.stop()}catch{};source.disconnect();gain?.disconnect();throw e;}
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
   current.source.stop(end);
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
  update,stop,
  destroy(){if(closed)return;closed=true;stop();master.disconnect()},
  get memory(){return {baseBytes,reservedBytes,maxDecodedBytes}},
 get state(){return {current:current?.id??null,pending:pending?.next.id??null,queued:queued?.id??null,transitionAt:pending?.at??null,transitionEnd:pending?.end??null,voices:(current?1:0)+(pending?1:0),startTime:current?.startTime??null,bridgeUntil:pending?.next.bridgeUntil??current?.bridgeUntil??null}}
 };
}
