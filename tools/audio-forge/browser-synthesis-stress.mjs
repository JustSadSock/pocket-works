// Real Web Audio probe for shared scale planner, not a recording of offline battlefield master.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const [engine,root,out,old]=process.argv.slice(2),launcher={chromium,webkit}[engine];if(!launcher)throw Error('engine');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const modules=new Set(['scaled-audio.js','virtual-audio.js','sound-family.js','spatial-audio.js','continuous-audio.js','score-director.js','music-ducking.js']);
const files=new Set(manifest.files.filter(v=>v.file.startsWith('variants/')).map(v=>v.file));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!name){res.setHeader('Content-Type','text/html');return res.end('<button id="go">Start</button>')}let f;if(modules.has(name)){f=path.join('shared/capabilities',name);res.setHeader('Content-Type','text/javascript')}else if(['layers/wind.wav','layers/leaves.wav'].includes(name)){f=path.join(old,name);res.setHeader('Content-Type','audio/wav')}else if(files.has(name)){f=path.join(root,name);res.setHeader('Content-Type','audio/wav')}else return res.writeHead(404).end();res.end(await readFile(f))}catch(e){res.writeHead(500).end(String(e))}});
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
  const families=manifest.runtime;for(const f of Object.values(families))for(const v of Object.values(f.contexts))v.variants=v.variants.map(p=>'/'+p);
  let fetches=0;scene=createBudgetedAudioScene({context:c,budget:{total:12,events:4,music:0},families,maxBuffers:8,maxEventDecodedBytes:4*1024*1024,maxAmbienceDecodedBytes:16*1024*1024,fetcher:(url,opts)=>{fetches++;return fetch(url,opts)}});
  const planner=createScaledAudioPlanner({buffers,maxEmitters:8,referenceDistance:12,maxDistance:120});
  const strategic=Array.from({length:1000},(_,i)=>({id:'settlement'+i,region:'province'+i%4,family:'settlement',detailAsset:'local',regionalAsset:'regional',x:(i%40)*2.5,y:Math.floor(i/40)*3,density:10+i%90,activity:.35+(i%7)*.09,priority:1+i%3*.2}));
  const analyser=c.createAnalyser();analyser.fftSize=2048;scene.mixer.bus('world').connect(analyser);scene.mixer.bus('events').connect(analyser);const samples=new Float32Array(analyser.fftSize);
  let maxAllocated=0,peak=0,maxBytes=0,updates=0,saturated=0,churn=0,maxChurn=0,maxRmsDelta=0,previousRms=null,previous=new Set(),lastEvent=-1,previousT=0,physicalChurn=0,previousActive=new Set();
  const starts=[],phases=[],times=[],reconcileTimes=[];const contexts=[['blade','cross'],['blade','glance'],['blade','heavy'],['shield','wood'],['shield','metal']];
  const clock=c.currentTime;
  while(c.currentTime-clock<32){
   const t=c.currentTime-clock,zoom=t<4?0:t<10?(t-4)/6:t<22?1:t<28?1-(t-22)/6:0,listener={x:8+t*2.5,y:30+Math.sin(t/3)*25};
   const begin=performance.now(),plan=planner.plan({listener,zoom,deltaSeconds:t-previousT,entities:strategic});times.push(performance.now()-begin);previousT=t;
   check(plan.logical===1000&&plan.sources.length<=8,'logical or selected budget');if(plan.candidates>8)saturated++;
   const ids=new Set(plan.sources.map(s=>s.id));const n=[...ids].filter(x=>!previous.has(x)).length;churn+=n;maxChurn=Math.max(maxChurn,n);previous=ids;
   const r0=performance.now();check(await scene.world.reconcile({listener,sources:plan.sources}),'world reconcile');reconcileTimes.push(performance.now()-r0);
   const active=new Set(scene.world.activeIds);physicalChurn+=[...active].filter(x=>!previousActive.has(x)).length;previousActive=active;
   if(Math.floor(t/.85)>lastEvent){lastEvent=Math.floor(t/.85);const [family,ctx]=contexts[Math.min(4,Math.floor(t/6.4))];let receipt;
    const ok=await scene.events.play(family,{context:ctx,spatial:{source:{x:listener.x+4,y:listener.y+2},listener,referenceDistance:10,maxDistance:120},priority:2,onStart:r=>receipt=r});if(ok){check(receipt?.family===family&&receipt.context===ctx&&families[family].contexts[ctx].variants.includes(receipt.url),'context receipt');starts.push(receipt)}else check(!receipt,'unexpected receipt');}
   const stat=scene.stats;maxAllocated=Math.max(maxAllocated,stat.allocated);maxBytes=Math.max(maxBytes,stat.totalAccountedDecodedBytes);check(stat.allocated<=12&&stat.oneShots<=4&&scene.world.stats.snapshotAndActiveBytes<=16*1024*1024,'budget');
   analyser.getFloatTimeDomainData(samples);let rms=0;for(const x of samples){peak=Math.max(peak,Math.abs(x));rms+=x*x}rms=Math.sqrt(rms/samples.length);if(previousRms!==null)maxRmsDelta=Math.max(maxRmsDelta,Math.abs(rms-previousRms));previousRms=rms;
   if(updates%20===0)phases.push({t,zoom:plan.zoom,local:plan.sources.filter(x=>x.id.startsWith('detail:')).length,regional:plan.sources.filter(x=>x.id.startsWith('region:')).length,candidates:plan.candidates,active:stat.continuous,rms});updates++;await wait(100);
  }
  check(updates>=100&&saturated>20&&starts.length>=20&&peak>.0001&&scene.events.stats.cacheHits>0,'continuous coverage');
  check(new Set(starts.map(x=>x.family+':'+x.context)).size===5,'all new material contexts');
  const summary=x=>{const a=[...x].sort((a,b)=>a-b);return {p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1)}};
  const worldStats=scene.world.stats,eventStats=scene.events.stats;scene.destroy();check(scene.stats.allocated===0&&scene.stats.totalAccountedDecodedBytes===0,'scene cleanup');await c.close();
  window.result={sampleRate:c.sampleRate,externalBytes,maxAllocated,maxBytes,peak,planning:summary(times),reconcile:summary(reconcileTimes),updates,saturated,churn,maxChurn,physicalChurn,maxRmsDelta,fetches,starts:starts.length,phases,worldStats,eventStats,strategic:{logical:1000,routeSeconds:32},limitations:'Existing wind/leaves are representative assets; peak sampled, not full waveform. Top-K churn is measured not eliminated; RMS changes include events and moving camera. External buffers owned by caller, accounted PCM not browser RSS.'};
 }catch(e){scene?.destroy();if(c&&c.state!=='closed')await c.close();window.result={error:String(e),stack:e.stack}}
 };
 },manifest);await page.click('#go');await page.waitForFunction(()=>window.result,{},{timeout:60000});const result=await page.evaluate(()=>window.result);if(result.error||errors.length)throw Error(JSON.stringify({result,errors}));await mkdir(out,{recursive:true});await writeFile(path.join(out,engine+'.json'),JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(r=>server.close(r))}
