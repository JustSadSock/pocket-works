// Real Web Audio probe for shared scale planner, not a recording of offline battlefield master.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const [engine,root,out]=process.argv.slice(2),launcher={chromium,webkit}[engine];if(!launcher)throw Error('engine');
const manifest=JSON.parse(await readFile(path.join(root,'soundscape/manifest.json'),'utf8'));
const modules=new Set(['scaled-audio.js','virtual-audio.js','sound-family.js','spatial-audio.js','continuous-audio.js','score-director.js','music-ducking.js']);
const files=new Set([...manifest.variants.map(v=>'variants/'+v.file),...manifest.layers.map(v=>'layers/'+v.file)]);
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!name){res.setHeader('Content-Type','text/html');return res.end('<button id="go">Start</button>')}let f;if(modules.has(name)){f=path.join('shared/capabilities',name);res.setHeader('Content-Type','text/javascript')}else if(files.has(name)){f=path.join(root,'soundscape',name);res.setHeader('Content-Type','audio/wav')}else return res.writeHead(404).end();res.end(await readFile(f))}catch(e){res.writeHead(500).end(String(e))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await launcher.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(manifest=>{
 document.querySelector('#go').onclick=async()=>{
 let c,scene;
 try{
  const {createScaledAudioPlanner}=await import('/scaled-audio.js'),{createBudgetedAudioScene}=await import('/virtual-audio.js');
  const check=(v,m)=>{if(!v)throw Error(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));
  c=new (window.AudioContext||window.webkitAudioContext)();await c.resume();check(c.state==='running','audio unlock');
  const decode=async url=>c.decodeAudioData(await(await fetch(url)).arrayBuffer());
  // Real admitted ambient loops as representative regional/local assets. Not claiming battlefield beds.
  const buffers={regional:await decode('/layers/wind.wav'),local:await decode('/layers/leaves.wav')};
  const externalBytes=Object.values(buffers).reduce((n,b)=>n+b.length*b.numberOfChannels*4,0);
  const families={};for(const v of manifest.variants){if(!['blade','shield','footstep'].includes(v.family))continue;const f=families[v.family]??={contexts:{},pitchCents:0,gainSpread:0};(f.contexts[v.context]??={variants:[]}).variants.push('/variants/'+v.file)}
  let fetches=0;scene=createBudgetedAudioScene({context:c,budget:{total:12,events:4,music:0},families,maxBuffers:8,maxEventDecodedBytes:4*1024*1024,maxAmbienceDecodedBytes:16*1024*1024,fetcher:(url,opts)=>{fetches++;return fetch(url,opts)}});
  const planner=createScaledAudioPlanner({buffers,maxEmitters:8,referenceDistance:12,maxDistance:120});
  const formations=Array.from({length:4},(_,i)=>({id:'formation'+i,region:'sector'+Math.floor(i/2),family:'troops',detailAsset:'local',regionalAsset:'regional',x:8+i*6,y:(i-1.5)*8,density:75,activity:.8,priority:3}));
  const strategic=Array.from({length:1000},(_,i)=>({id:'settlement'+i,region:'province'+i%4,family:'settlement',detailAsset:'local',regionalAsset:'regional',x:(i%20)*3,y:Math.floor(i/20)%20,density:30,activity:.7,priority:1}));
  const analyser=c.createAnalyser();analyser.fftSize=2048;scene.mixer.bus('world').connect(analyser);scene.mixer.bus('events').connect(analyser);const samples=new Float32Array(analyser.fftSize);
  let maxAllocated=0,peak=0,maxBytes=0,planningMs=0,updates=0;const starts=[],phases=[];
  const clock=c.currentTime;
  while(c.currentTime-clock<24){
   const t=c.currentTime-clock,zoom=t<6?t/6:t<16?1:Math.max(0,1-(t-16)/8),listener={x:t,y:Math.sin(t/4)*5},activity=t<8?.4:t<17?1:.3;
   const begin=performance.now(),plan=planner.plan({listener,zoom,deltaSeconds:.15,entities:formations.map(e=>({...e,activity}))});planningMs+=performance.now()-begin;
   check(await scene.world.reconcile({listener,sources:plan.sources}),'world reconcile');
   if(updates%5===0){const family=t<8?'footstep':t<17?'blade':'shield',ctx=family==='footstep'?'earth':family==='blade'?'heavy-steel':'wood';let receipt;
    const ok=await scene.events.play(family,{context:ctx,spatial:{source:{x:15,y:5},listener,referenceDistance:10,maxDistance:120},priority:2,onStart:r=>receipt=r});if(ok){check(receipt?.family===family&&receipt.context===ctx&&families[family].contexts[ctx].variants.includes(receipt.url),'context receipt');starts.push(receipt)}else check(!receipt,'unexpected receipt');}
   const stat=scene.stats;maxAllocated=Math.max(maxAllocated,stat.allocated);maxBytes=Math.max(maxBytes,stat.totalAccountedDecodedBytes);check(stat.allocated<=12&&stat.oneShots<=4&&scene.world.stats.snapshotAndActiveBytes<=16*1024*1024,'budget');
   analyser.getFloatTimeDomainData(samples);for(const x of samples)peak=Math.max(peak,Math.abs(x));if(updates%20===0)phases.push({t,zoom:plan.zoom,local:plan.sources.filter(x=>x.id.startsWith('detail:')).length,regional:plan.sources.filter(x=>x.id.startsWith('region:')).length});updates++;await wait(150);
  }
  check(starts.length>=10&&peak>.0001&&scene.events.stats.cacheHits>0,'actual audio coverage');
  planner.reset();const far=planner.plan({listener:{x:0,y:0},zoom:0,deltaSeconds:0,entities:strategic});check(far.logical===1000&&far.sources.length===4&&far.regionalGroups===4,'strategic aggregation');
  check(await scene.world.reconcile({listener:{x:0,y:0},sources:far.sources}),'strategic world');
  await wait(150);const near=planner.plan({listener:{x:10,y:0},zoom:1,deltaSeconds:2,entities:strategic});check(near.sources.length<=8&&near.detail>.99,'strategic LOD');
  check(await scene.world.reconcile({listener:{x:10,y:0},sources:near.sources}),'strategic local world');const worldStats=scene.world.stats,eventStats=scene.events.stats;
  scene.destroy();check(scene.stats.allocated===0&&scene.stats.totalAccountedDecodedBytes===0,'scene cleanup');await c.close();window.result={sampleRate:c.sampleRate,externalBytes,maxAllocated,maxBytes,peak,planningMs,updates,fetches,starts:starts.length,phases,worldStats,eventStats,strategic:{logical:1000,regional:far.sources.length,local:near.sources.length},limitations:'External buffers owned by caller, accounting not process RSS; representative ambient assets, not exact offline battlefield.'};
 }catch(e){scene?.destroy();if(c&&c.state!=='closed')await c.close();window.result={error:String(e),stack:e.stack}}
 };
 },manifest);await page.click('#go');await page.waitForFunction(()=>window.result,{},{timeout:60000});const result=await page.evaluate(()=>window.result);if(result.error||errors.length)throw Error(JSON.stringify({result,errors}));await mkdir(out,{recursive:true});await writeFile(path.join(out,engine+'.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(r=>server.close(r))}
