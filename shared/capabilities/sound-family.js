// Opt-in Web Audio family player. Owns voices, not the caller's AudioContext.
import { spatialProfile } from './spatial-audio.js';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const finite=(n,fallback)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
export function createVariantBag(variants,random=Math.random){
  if(!Array.isArray(variants)||!variants.length||variants.length>32||new Set(variants).size!==variants.length) throw new Error('Expected 1–32 distinct variants');
  const values=[...variants];let bag=[],last;
  function peek(){
      if(!bag.length){
        bag=[...values];
        for(let i=bag.length-1;i>0;i--){
          const j=Math.floor(clamp(finite(random(),0),0,1-Number.EPSILON)*(i+1));
          [bag[i],bag[j]]=[bag[j],bag[i]];
        }
        if(bag.length>1&&bag.at(-1)===last) [bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];
      }
      return bag.at(-1);
  }
  function commit(value){if(!bag.length||bag.at(-1)!==value)throw Error('Invalid variant reservation');last=bag.pop();return last;}
  return {peek,commit,next(){return commit(peek())}};
}
export function createSoundFamilyPlayer({context,destination=context?.destination,families,random=Math.random,fetcher=globalThis.fetch,maxVoices=16,maxBuffers=64,maxDecodedBytes=64*1024*1024}={}){
  if(!context||!destination||typeof fetcher!=='function') throw new Error('Audio context, output and fetch required');
  if(!Number.isInteger(maxVoices)||maxVoices<1||maxVoices>128||!Number.isInteger(maxBuffers)||maxBuffers<1||maxBuffers>256) throw new Error('Invalid audio budget');
  if(!Number.isSafeInteger(maxDecodedBytes)||maxDecodedBytes<1)throw new Error('Invalid decoded memory budget');
  const definitions=new Map(),cache=new Map(),voices=new Set();
  let enabled=true,destroyed=false,generation=0,pending=0,cacheHits=0,cacheMisses=0,decodes=0,accepted=0;
  function variantDefinition(id,definition){
    const urls=definition.variants;
    if(!Array.isArray(urls)||urls.some(x=>typeof x!=='string'||!x.trim())) throw new Error('Invalid variants for '+id);
    return {bag:createVariantBag(urls,random),urls:[...urls],gain:clamp(finite(definition.gain,1),0,1),pitch:clamp(finite(definition.pitchCents,35),0,120),gainSpread:clamp(finite(definition.gainSpread,.1),0,.4),queue:Promise.resolve()};
  }
  for(const [id,definition] of Object.entries(families??{})){
    if(definition.contexts!==undefined){
      const entries=Object.entries(definition.contexts??{});
      if(definition.variants||!entries.length||entries.length>16)throw Error('Invalid contextual family '+id);
      const contexts=new Map();
      for(const [key,value] of entries){
        if(!/^[a-z0-9-]{1,64}$/.test(key)||!value)throw Error('Invalid sound context');
        contexts.set(key,variantDefinition(id+':'+key,{...definition,...value}));
      }
      definitions.set(id,{contexts});
    }else definitions.set(id,{fallback:variantDefinition(id,definition)});
  }
  function resolve(id,ctx){
    const family=definitions.get(id);if(!family)return null;
    return family.contexts?family.contexts.get(ctx)??null:ctx===undefined?family.fallback:null;
  }
  function bytes(buffer){
    const n=buffer.length*buffer.numberOfChannels*4;
    if(!Number.isSafeInteger(buffer.length)||buffer.length<1||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||!Number.isSafeInteger(n))throw new Error('Invalid decoded audio dimensions');
    return n;
  }
  function retainedBytes(extra){
    const buffers=new Set([...cache.values()].filter(e=>e.ready).map(e=>e.buffer));
    for(const v of voices)buffers.add(v.buffer);
    if(extra)buffers.add(extra);
    return [...buffers].reduce((n,b)=>n+bytes(b),0);
  }
  function fit(buffer,protectedEntry){
    if(bytes(buffer)>maxDecodedBytes)return false;
    while(retainedBytes(buffer)>maxDecodedBytes){
      const candidate=[...cache].find(([,e])=>e.ready&&e!==protectedEntry&&!([...voices].some(v=>v.buffer===e.buffer)));
      if(!candidate)return false;
      cache.delete(candidate[0]);
    }
    return true;
  }
  function load(url){
    if(cache.has(url)){cacheHits++;const entry=cache.get(url);cache.delete(url);cache.set(url,entry);return entry.promise;}
    cacheMisses++;
    // Keep in-flight requests deduplicated and the cache strictly bounded.
    if(cache.size>=maxBuffers){
      const key=[...cache].find(([,v])=>v.ready&&![...voices].some(voice=>voice.buffer===v.buffer))?.[0];
      if(key===undefined) return Promise.reject(new Error('Audio buffer budget busy'));
      cache.delete(key);
    }
    const entry={ready:false,controller:new AbortController(),promise:null};
    entry.promise=Promise.resolve().then(()=>fetcher(url,{signal:entry.controller.signal})).then(response=>{
      if(!response.ok) throw new Error('Audio fetch failed: '+response.status);
      return response.arrayBuffer();
    }).then(data=>context.decodeAudioData(data)).then(buffer=>{
      decodes++;
      if(destroyed) throw new Error('Audio player destroyed');
      if(!fit(buffer,entry))throw new Error('Decoded memory budget exceeded');
      entry.buffer=buffer;entry.ready=true;return buffer;
    }).catch(error=>{if(cache.get(url)===entry) cache.delete(url);throw error;});
    cache.set(url,entry);return entry.promise;
  }
  function remove(voice,stop=false){
    if(!voices.delete(voice)) return;
    if(voice.tailTimer!==undefined)clearTimeout(voice.tailTimer);
    if(stop) try{voice.source.stop()}catch{}
    for(const node of voice.nodes) try{node.disconnect()}catch{}
  }
  const jitter=()=>2*clamp(finite(random(),.5),0,1)-1;
  return {
    async preload(id,{context:variantContext}={}){
      const def=resolve(id,variantContext);
      if(destroyed||!def) return false;
      // Sequential: supports a family larger than a small cache budget.
      try{for(const url of def.urls){if(destroyed)return false;await load(url)}return true}catch{return false}
    },
    async play(id,{gain=1,pan=0,rate=1,priority=0,spatial,canStart,onStart,context:variantContext}={}){
      const def=resolve(id,variantContext);
      if(!enabled||destroyed||!def||pending>=maxVoices) return false;
      const epoch=generation;pending++;
      let source,level,panner,voice,releaseTurn;const extra=[];
      priority=finite(priority,0);
      const eligible=()=>!destroyed&&enabled&&epoch===generation&&context.state==='running'&&(typeof canStart!=='function'||canStart())&&(voices.size<maxVoices||[...voices].some(v=>v.priority<=priority));
      try{
        const profile=spatial===undefined?null:spatialProfile(spatial);
        if(profile&&profile.gain<=0)return false;
        // Unlock before any network await to preserve mobile user activation.
        if(context.state==='suspended'||context.state==='interrupted') await context.resume();
        if(context.state!=='running'||epoch!==generation||destroyed||!enabled)return false;
        // Serialize selection per context, not globally. Peek is committed only after a real start.
        if(!eligible())return false;
        const turn=def.queue;def.queue=new Promise(resolve=>{releaseTurn=resolve});
        await turn;if(!eligible())return false;
        const url=def.bag.peek(),buffer=await load(url);
        if(!eligible())return false;
        if(voices.size>=maxVoices){
          const victim=[...voices].reduce((a,b)=>b.priority<a.priority?b:a);
          if(victim.priority>priority)return false;
          remove(victim,true);
        }
        if(!fit(buffer))return false;
        source=context.createBufferSource();level=context.createGain();
        source.buffer=buffer;
        source.playbackRate.value=clamp(finite(rate,1)*2**(def.pitch*jitter()/1200),.5,2);
        level.gain.value=clamp(finite(gain,1)*def.gain*(1+def.gainSpread*jitter())*(profile?.gain??1),0,1);
        source.connect(level);
        let signal=level;
        if(profile&&typeof context.createBiquadFilter==='function'){
          const filter=context.createBiquadFilter();extra.push(filter);filter.type='lowpass';
          filter.frequency.value=Math.min(profile.cutoff,(context.sampleRate??48000)*.45);filter.Q.value=.707;
          signal.connect(filter);signal=filter;
        }
        if(typeof context.createStereoPanner==='function'){
          panner=context.createStereoPanner();panner.pan.value=clamp(profile?.pan??finite(pan,0),-1,1);signal.connect(panner);signal=panner;
        }
        signal.connect(destination);
        let tail=0;
        if(profile&&profile.reflection>0&&typeof context.createDelay==='function'){
          const delay=context.createDelay(.2);extra.push(delay);
          const reflection=context.createGain();extra.push(reflection);
          delay.delayTime.value=profile.delay;reflection.gain.value=profile.reflection;
          signal.connect(delay);delay.connect(reflection);reflection.connect(destination);tail=profile.delay;
        }
        voice={source,buffer,nodes:[source,level,...(panner?[panner]:[]),...extra],priority};
        voices.add(voice);
        source.onended=()=>{if(!voices.has(voice))return;if(tail)voice.tailTimer=setTimeout(()=>remove(voice),Math.ceil(tail*1000)+20);else remove(voice)};
        source.start();
        def.bag.commit(url);accepted++;
        if(typeof onStart==='function')try{onStart({time:context.currentTime,duration:buffer.length/(buffer.sampleRate??context.sampleRate??48000)/source.playbackRate.value,family:id,context:variantContext??null,url})}catch{}
        return true;
      }catch{
        if(voice)remove(voice,true);
        else for(const node of [source,level,panner,...extra])try{node?.disconnect()}catch{}
        return false;
      }finally{releaseTurn?.();pending--}
    },
    stopAll(){generation++;for(const voice of [...voices])remove(voice,true)},
    setEnabled(value){enabled=Boolean(value);if(!enabled)this.stopAll()},
    get stats(){return {voices:voices.size,pending,buffers:cache.size,decodedBytes:retainedBytes(),maxDecodedBytes,cacheHits,cacheMisses,decodes,accepted,enabled:enabled&&!destroyed}},
    destroy(){
      if(destroyed)return;
      destroyed=true;enabled=false;this.stopAll();
      for(const entry of cache.values())if(!entry.ready)entry.controller.abort();
      cache.clear();
    }
  };
}
