// Research-only actual asset runtime route, with separate music duck probe.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const [engine,root,music,out,rateArg='44100',repair]=process.argv.slice(2);
const sampleRate=Number(rateArg);if(![44100,48000].includes(sampleRate)||!repair)throw Error('Explicit sample rate and repaired loop required');
const launcher={chromium,webkit}[engine];if(!launcher)throw Error('engine');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const modules=new Set(['virtual-audio.js','sound-family.js','spatial-audio.js','continuous-audio.js','score-director.js','music-ducking.js']);
const assets=new Set([...manifest.variants.map(x=>'variants/'+x.file),...manifest.layers.map(x=>'layers/'+x.file),'layers/thunder.wav']);
const server=createServer(async(req,res)=>{try{
 const n=new URL(req.url,'http://localhost').pathname.slice(1);
 if(!n){res.setHeader('Content-Type','text/html');return res.end('<button id="start">Start audio</button>')}
 let f;if(modules.has(n)){f=path.join('shared/capabilities',n);res.setHeader('Content-Type','text/javascript')}
 else if(n==='music.wav'){f=path.join(music,'lanterns-of-home.wav');res.setHeader('Content-Type','audio/wav')}
 else if(n==='layers/drips-runtime.wav'){f=path.join(repair,'drips-runtime.wav');res.setHeader('Content-Type','audio/wav')}
 else if(assets.has(n)){f=path.join(root,n);res.setHeader('Content-Type','audio/wav')}
 else return res.writeHead(404).end();
 res.end(await readFile(f));
}catch(e){res.writeHead(500).end(String(e))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await launcher.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(({manifest,sampleRate})=>{
  document.querySelector('#start').onclick=async()=>{
   let c,scene;
   try{
    const {createBudgetedAudioScene}=await import('/virtual-audio.js'),{spatialProfile}=await import('/spatial-audio.js');
    const check=(a,b)=>{if(!a)throw Error(b)},wait=ms=>new Promise(r=>setTimeout(r,ms));
    c=new (window.AudioContext||window.webkitAudioContext)({sampleRate});await c.resume();check(c.state==='running'&&c.sampleRate===sampleRate,'unlock/sample rate '+c.sampleRate);
    let seed=52118;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
    const families={};for(const v of manifest.variants){const f=families[v.family]??={contexts:{},pitchCents:0,gainSpread:0};(f.contexts[v.context]??={variants:[]}).variants.push('/variants/'+v.file)}
    const decode=async url=>c.decodeAudioData(await(await fetch(url)).arrayBuffer());
    const layers={};let layerBytes=0;const seams={};
    for(const l of manifest.layers){
      const b=await decode('/layers/'+(l.id==='drips'?'drips-runtime.wav':l.file));layers[l.id]=b;layerBytes+=b.length*b.numberOfChannels*4;
      check(b.sampleRate===sampleRate,'decoded rate');
      const offline=new OfflineAudioContext(b.numberOfChannels,4096,sampleRate),src=offline.createBufferSource();src.buffer=b;src.loop=true;src.connect(offline.destination);src.start(0,(b.length-2048)/sampleRate);const wrap=await offline.startRendering();
      seams[l.id]=[];
      for(let ch=0;ch<b.numberOfChannels;ch++){const x=b.getChannelData(ch),y=wrap.getChannelData(ch);let mean=0;for(let i=1;i<x.length;i++)mean+=Math.abs(x[i]-x[i-1]);mean/=x.length-1;const jump=Math.abs(x[0]-x.at(-1)),renderJump=Math.abs(y[2048]-y[2047]),limit=mean*12+.001;seams[l.id].push({jump,renderJump,limit,rate:b.sampleRate});check(jump<limit&&renderJump<limit,'loop seam '+l.id+' '+JSON.stringify(seams[l.id]));}
    }
    families.thunder={variants:['/layers/thunder.wav'],pitchCents:0,gainSpread:0};
    let fetches=0;const fetcher=(url,opts)=>{fetches++;return fetch(url,opts)};
    scene=createBudgetedAudioScene({context:c,budget:{total:11,events:6,music:0},families,random:rng,fetcher,maxBuffers:8,maxEventDecodedBytes:3*1024*1024,maxAmbienceDecodedBytes:32*1024*1024});
    const starts=[];const get=(key)=>manifest.variants.find(v=>v.key===key);
    const request=async(key,priority=2,extra={})=>{const v=get(key);let receipt;const ok=await scene.events.play(v.family,{context:v.context,priority,...extra,onStart:r=>{receipt=r}});if(ok){check(receipt&&receipt.family===v.family&&receipt.context===v.context&&receipt.url.startsWith('/variants/'+key+'-'),'context receipt mismatch');starts.push(receipt);}else check(!receipt,'rejected request emitted receipt');return ok};
    check(!await scene.events.play('footstep',{context:'unknown'}),'invalid context');
    const before=fetches;check(!await request('step-wood',2,{canStart:()=>false})&&fetches===before,'rejected request used cache');
    // Three actual starts exhaust the context bag; a rejected fourth must not advance it.
    for(let i=0;i<3;i++){check(await request('step-wood'),'wood play');scene.events.stopAll()}
    check(new Set(starts.map(x=>x.url)).size===3,'context coverage');
    check(await request('step-wood',9),'priority probe');const accepted=scene.events.stats.accepted;
    // Reserve all six voices, then reject lower priority without any load or draw.
    for(let i=0;i<5;i++)check(await request('step-wood',9),'priority fill');
    const pre=fetches;check(!await request('step-wood',0)&&fetches===pre&&scene.events.stats.accepted===accepted+5,'priority rejection');
    check(scene.events.stats.cacheHits>0,'no real cache hits');scene.events.stopAll();
    const analyser=c.createAnalyser();analyser.fftSize=2048;scene.mixer.bus('world').connect(analyser);
    const layerSources=(outside)=>Object.entries(layers).map(([id,buffer])=>({id,buffer,position:{x:3,y:2},volume:id==='hearth'?(1-outside)*.7:id==='drips'?.5:.75,occlusion:['rain','wind','leaves'].includes(id)?1-outside:0,zone:id==='hearth'?'interior':'open',referenceDistance:5,maxDistance:40}));
    const clock=c.currentTime;let maxAllocated=0,maxBytes=0,updates=0,lastRoute=-1,peak=0;const actual=[];
    const sample=new Float32Array(analyser.fftSize);const route=t=>t<14?1:t<19?1-(t-14)/5*.87:t<42?.13:t<49?.36:t<56?.13:t<60?.13+(t-56)/4*.87:1;
    const events=[...manifest.events].sort((a,b)=>a.time-b.time);let idx=0,thunderIdx=0;
    while(c.currentTime-clock<72){
      const t=c.currentTime-clock;
      if(Math.floor(t)!==lastRoute){lastRoute=Math.floor(t);check(await scene.world.reconcile({listener:{x:0,y:0},sources:layerSources(route(t))}),'world reconcile');updates++}
      while(idx<events.length&&events[idx].time<=t){
        const e=events[idx++],v=get(e.key),beforeCount=starts.length;
        const spatial={source:{x:e.distance,y:e.distance*.25},listener:{x:0,y:0},referenceDistance:3,maxDistance:60,occlusion:e.occlusion,zone:route(t)<.5?'interior':'stone'};
        const ok=await request(e.key,e.priority,{spatial});if(ok){check(starts.length===beforeCount+1&&starts.at(-1).context===v.context,'event receipt');actual.push({requested:e.key,selected:starts.at(-1).url,time:t})}
      }
      if(thunderIdx<3&&t>=[7,30,65][thunderIdx]){check(await scene.events.play('thunder',{gain:.65,priority:3,spatial:{source:{x:18+thunderIdx*7,y:3},listener:{x:0,y:0},referenceDistance:12,maxDistance:80,occlusion:1-route(t),zone:'open'}}),'thunder event');thunderIdx++}
      const stat=scene.stats;maxAllocated=Math.max(maxAllocated,stat.allocated);maxBytes=Math.max(maxBytes,stat.totalAccountedDecodedBytes);check(stat.externalAmbienceBytes===layerBytes,'external layer accounting');
      check(stat.allocated<=11&&stat.eventDecodedBytes<=3*1024*1024&&scene.events.stats.buffers<=8,'budget');
      analyser.getFloatTimeDomainData(sample);for(const x of sample)peak=Math.max(peak,Math.abs(x));
      await wait(45);
    }
    check(actual.length>=Math.floor(events.length*.85)&&peak>.0001,'scene output/coverage');
    const sceneStats=scene.stats,eventStats=scene.events.stats;scene.destroy();check(scene.stats.totalAccountedDecodedBytes===0&&scene.stats.allocated===0,'cleanup');
    // Independent short music test: never mix into the 72s music-free route.
    const track=await decode('/music.wav');const musicBytes=track.length*track.numberOfChannels*4;
    scene=createBudgetedAudioScene({context:c,budget:{total:4,events:2,music:1},families,fetcher,stems:[{id:'music',buffer:track,base:1}],maxScoreDecodedBytes:64*1024*1024,stingers:{impact:{url:'/variants/shield-wood-01.wav',duckGain:.55,duckHold:.35}}});
    check(await scene.music.start(),'music probe');check(scene.stats.musicDecodedBytes===musicBytes,'music memory');check(await scene.playStinger('impact'),'duck probe');await wait(120);check(scene.stats.musicDucking.gain<=.56,'duck gain');await wait(1300);check(scene.stats.musicDucking.gain>.98,'duck release');
    scene.destroy();await c.close();window.result={sampleRate,actual,updates,peak,maxAllocated,maxBytes,layerBytes,thunderEvents:thunderIdx,musicBytes,sceneStats,eventStats,fetches,seams,elapsed:c.currentTime-clock};
   }catch(e){scene?.destroy();if(c&&c.state!=='closed')await c.close();window.result={error:String(e),stack:e.stack}}
  };
 },{manifest,sampleRate});
 await page.click('#start');await page.waitForFunction(()=>window.result,{},{timeout:120000});const r=await page.evaluate(()=>window.result);
 if(r.error||errors.length)throw Error(JSON.stringify({r,errors}));
 await mkdir(out,{recursive:true});await writeFile(path.join(out,engine+'-'+sampleRate+'.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({...r,actual:r.actual.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
