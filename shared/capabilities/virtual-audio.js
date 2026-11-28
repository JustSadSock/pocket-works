import {spatialProfile,createSpatialMixer} from './spatial-audio.js';
import {createDynamicEmitter,createAdaptiveMusic} from './continuous-audio.js';
import {createSoundFamilyPlayer} from './sound-family.js';
import {createScoreDirector} from './score-director.js';
import {createMusicDucker} from './music-ducking.js';
const bounded=(value,fallback,min,max,label)=>{
 const n=value??fallback;
 if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('Invalid '+label);
 return n;
};
// A bounded pool for continuous emitters. Music and one-shots have separate quotas.
export function createVirtualAudioWorld({context,destination=context?.destination,maxVoices=12,maxSources=4096,minAudible=.002,retentionBonus=.15,releaseSeconds=.05,createEmitter=createDynamicEmitter}={}){
 if(!context||!destination||!Number.isInteger(maxVoices)||maxVoices<1||maxVoices>64||!Number.isInteger(maxSources)||maxSources<maxVoices||maxSources>16384)throw Error('Invalid audio world budget');
 const floor=bounded(minAudible,.002,0,1,'audibility floor');
 const bonus=bounded(retentionBonus,.15,0,1,'retention');
 const release=bounded(releaseSeconds,.05,.035,1,'release');
 const active=new Map(),origin=context.currentTime;
 let disposed=false,busy=false,logical=0,audible=0,selected=0,peak=0,starts=0,retires=0,failures=0;
 function remove(id,entry){entry.emitter.destroy();active.delete(id);}
 function getStats(){const buffers=new Set([...active.values()].map(v=>v.buffer));const decodedBytes=[...buffers].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0);return {decodedBytes,logical,audible,selected,active:active.size,retiring:[...active.values()].filter(v=>v.retireAt!==null).length,virtual:Math.max(0,logical-[...active.values()].filter(v=>v.retireAt===null).length),maxVoices,peak,starts,retires,failures,busy};}
 return {
  async reconcile({listener,heading=0,sources}={}){
   if(disposed||busy)return false;
   if(!Array.isArray(sources)||sources.length>maxSources)throw Error('Logical source budget exceeded');
   const ids=new Set(),ranked=[];
   // Validate the complete snapshot before touching the current audio graph.
   for(const s of sources){
    if(!s||typeof s.id!=='string'||!s.id||s.id.length>128||ids.has(s.id))throw Error('Invalid or duplicate emitter ID');
    ids.add(s.id);
    const b=s.buffer;
    if(!b||!Number.isInteger(b.length)||b.length<2||!Number.isFinite(b.sampleRate)||b.sampleRate<8000||![1,2].includes(b.numberOfChannels)||typeof b.getChannelData!=='function')throw Error('Invalid emitter buffer');
    const volume=bounded(s.volume,1,0,1,'volume'),priority=bounded(s.priority,1,0,10,'priority');
    const phaseOrigin=bounded(s.phaseOrigin,origin,0,1e12,'phase origin');
    const spatial={source:s.position,listener,heading,referenceDistance:s.referenceDistance,maxDistance:s.maxDistance,rolloff:s.rolloff,occlusion:s.occlusion,zone:s.zone};
    const profile=spatialProfile(spatial),gain=volume*profile.gain;
    if(gain<=floor||priority===0)continue;
    const incumbent=active.get(s.id);
    const retained=incumbent&&incumbent.retireAt===null&&incumbent.buffer===b&&incumbent.phaseOrigin===phaseOrigin;
    ranked.push({id:s.id,buffer:b,volume,spatial,phaseOrigin,score:gain*priority*(retained?1+bonus:1)});
   }
   ranked.sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0));
   const desired=ranked.slice(0,maxVoices),wanted=new Map(desired.map(s=>[s.id,s]));
   logical=sources.length;audible=ranked.length;selected=desired.length;busy=true;
   try{
    const now=context.currentTime;
    for(const [id,v] of active){
     const next=wanted.get(id),same=next&&next.buffer===v.buffer&&next.phaseOrigin===v.phaseOrigin;
     if(v.retireAt!==null&&now>=v.retireAt){remove(id,v);continue;}
     if(same){
      if(v.retireAt!==null||v.volume!==next.volume){v.emitter.setVolume(next.volume);v.volume=next.volume;}
      v.retireAt=null;v.emitter.update(next.spatial);
     }else if(v.retireAt===null){
      // Keep retiring voices in the physical budget until the audio-clock fade has elapsed.
      v.emitter.setVolume(0);v.retireAt=now+release;retires++;
     }
    }
    for(const s of desired){
     if(disposed||active.size>=maxVoices)break;
     if(active.has(s.id))continue;
     let emitter;
     try{
      emitter=createEmitter({context,destination,buffer:s.buffer,spatial:s.spatial,volume:s.volume,loop:true});
      const v={emitter,buffer:s.buffer,phaseOrigin:s.phaseOrigin,volume:s.volume,retireAt:null};
      active.set(s.id,v);peak=Math.max(peak,active.size);
      const offset=Math.max(0,context.currentTime-s.phaseOrigin);
      const ok=await emitter.start({offsetSeconds:offset,fadeInSeconds:.025});
      if(disposed)return false;
      if(!ok){remove(s.id,v);failures++;}else starts++;
     }catch{if(disposed)return false;if(active.has(s.id))remove(s.id,active.get(s.id));else emitter?.destroy();failures++;}
    }
    return !disposed;
   }finally{busy=false;}
  },
  destroy(){if(disposed)return;disposed=true;for(const [id,v] of active)remove(id,v);logical=0;audible=0;selected=0;},
  get stats(){return getStats()},
  get activeIds(){return [...active].filter(([,v])=>v.retireAt===null).map(([id])=>id)}
 };
}

// Reserve actual source-node slots by category. Reflections share their parent's slot.
export function planVoiceBudget({total=24,events=8,music=4}={}){
 for(const [key,value,min,max] of [['total',total,3,200],['events',events,1,128],['music',music,0,8]]){
  if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid voice budget '+key);
 }
 const continuous=total-events-music;
 if(continuous<1||continuous>64)throw Error('Invalid continuous voice allocation');
 return Object.freeze({total,events,music,continuous});
}
// Optional integration facade. Enforces fixed quotas by construction, without
// allowing any one category to starve a reserved music or critical event slot.
export function createBudgetedAudioScene({context,destination=context?.destination,budget,families,stems=[],score,bpm=120,beatsPerBar=4,fetcher,random,maxBuffers=32,maxSources=4096,maxEventDecodedBytes=64*1024*1024,maxScoreDecodedBytes=128*1024*1024,stingers={},volume=.7}={}){
 const quota=planVoiceBudget(budget);
 if(!Array.isArray(stems)||stems.length>quota.music)throw Error('Music stems exceed voice reservation');
 if(score!==undefined&&(!score||stems.length||quota.music<2))throw Error('Horizontal score requires two reserved music slots and no vertical stems');
 const musicCount=stems.length;
 const adaptiveBytes=[...new Set(stems.map(s=>s.buffer).filter(Boolean))].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0);
 if(!score&&(!Number.isSafeInteger(adaptiveBytes)||adaptiveBytes>maxScoreDecodedBytes))throw Error('Adaptive decoded music budget exceeded');
 const eventFamilies=Object.assign(Object.create(null),families??{}),stingerDefs=new Map();
 for(const [id,d] of Object.entries(stingers)){
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(id)||!d||typeof d.url!=='string'||!d.url.trim())throw Error('Invalid stinger');
  const key='music-stinger:'+id;
  if(Object.hasOwn(eventFamilies,key))throw Error('Stinger family collision');
  eventFamilies[key]={variants:[d.url],gain:bounded(d.gain,.8,0,1,'stinger gain'),pitchCents:0,gainSpread:0};
  const states=d.states===undefined?null:d.states;
  if(states!==null&&(!score||!Array.isArray(states)||!states.length||states.some(s=>typeof s!=='string'||!Object.hasOwn(score.graph?.states??{},s))))throw Error('Invalid stinger state compatibility');
  stingerDefs.set(id,{key,states:states&&new Set(states),duckGain:bounded(d.duckGain,1,0,1,'duck gain'),duckHold:bounded(d.duckHold,0,0,10,'duck hold'),cooldown:bounded(d.cooldown,1,0,60,'stinger cooldown'),priority:bounded(d.priority,5,0,10,'stinger priority'),last:-Infinity,pending:false});
 }
 let mixer,world,events,music,ducker,closed=false;
 try{
  mixer=createSpatialMixer({context,destination,volume});
  world=createVirtualAudioWorld({context,destination:mixer.bus('world'),maxVoices:quota.continuous,maxSources});
  events=createSoundFamilyPlayer({context,destination:mixer.bus('events'),families:eventFamilies,fetcher,random,maxVoices:quota.events,maxBuffers,maxDecodedBytes:maxEventDecodedBytes});
  if(score||stems.length)ducker=createMusicDucker({context,destination:mixer.bus('music')});
  if(score)music=createScoreDirector({context,destination:ducker.input,graph:score.graph,buffers:score.buffers,bridgeBuffers:score.bridgeBuffers,layers:score.layers,intensity:score.intensity,maxVoices:quota.music,volume:score.volume,maxDecodedBytes:maxScoreDecodedBytes});
  else if(stems.length)music=createAdaptiveMusic({context,destination:ducker.input,stems,bpm,beatsPerBar});
 }catch(e){music?.destroy();ducker?.destroy();events?.destroy();world?.destroy();mixer?.destroy();throw e;}
 return {
  world,events,music,quota,mixer,
  async preloadStinger(id){const d=stingerDefs.get(id);return !closed&&!!d&&await events.preload(d.key);},
  async playStinger(id){
   const d=stingerDefs.get(id);
   if(closed||!d||d.pending||context.currentTime-d.last<d.cooldown)return false;
   const compatible=()=>!closed&&(!d.states||(d.states.has(music.state.current)&&!music.state.pending&&context.currentTime>=(music.state.bridgeUntil??0)));
   if(!compatible())return false;
   d.pending=true;
   try{return await events.play(d.key,{priority:d.priority,rate:1,canStart:compatible,onStart:({time,duration})=>{d.last=time;if(ducker&&d.duckGain<1)ducker.trigger({gain:d.duckGain,duration:Math.min(60,Math.max(duration,d.duckHold))});}});}finally{d.pending=false;}
  },
  destroy(){if(closed)return;closed=true;music?.destroy();ducker?.destroy();events.destroy();world.destroy();mixer.destroy();},
  get stats(){
   const continuous=world.stats.active,oneShots=events.stats.voices,musicVoices=score?(music?.state.voices??0):(music?.state.active?musicCount:0);
   const eventDecodedBytes=events.stats.decodedBytes,ambienceDecodedBytes=world.stats.decodedBytes;
   const musicDecodedBytes=closed?0:score?(music?.memory.reservedBytes??0):adaptiveBytes;
   return {musicDucking:ducker?.state??{gain:1,until:null},continuous,oneShots,music:musicVoices,allocated:continuous+oneShots+musicVoices,quota,logical:world.stats.logical,pendingEvents:events.stats.pending,eventDecodedBytes,scoreReservedBytes:score?musicDecodedBytes:0,musicDecodedBytes,ambienceDecodedBytes,totalAccountedDecodedBytes:eventDecodedBytes+ambienceDecodedBytes+musicDecodedBytes};
  }
 };
}
