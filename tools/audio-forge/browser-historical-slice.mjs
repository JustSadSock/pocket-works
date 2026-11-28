// Exercise actual vertical-slice WAVs through existing Web Audio runtime, not fixture tones.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const [engine,music,slice,out]=process.argv.slice(2);
const browserType={chromium,webkit}[engine];if(!browserType)throw Error('browser');
const allowed=new Set(['continuous-audio.js','spatial-audio.js','sound-family.js','virtual-audio.js','score-director.js','music-ducking.js']);
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://localhost').pathname.slice(1);
  if(!name){res.setHeader('Content-Type','text/html');return res.end('<button id="go">Start</button>');}
  let file;
  if(allowed.has(name)){file=path.join('shared/capabilities',name);res.setHeader('Content-Type','text/javascript');}
  else if(name==='music.wav'){file=path.join(music,'crown-v4-master.wav');res.setHeader('Content-Type','audio/wav');}
  else if(name==='ambience.wav'){file=path.join(slice,'rain-at-the-gate-loop.wav');res.setHeader('Content-Type','audio/wav');}
  else if(/^(blade|shield|footstep)-0[1-6]\.wav$/.test(name)){file=path.join(slice,'variants',name);res.setHeader('Content-Type','audio/wav');}
  else return res.writeHead(404).end();
  res.end(await readFile(file));
 }catch(e){res.writeHead(500).end(String(e))}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await browserType.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{
  document.querySelector('#go').addEventListener('click',async()=>{
   let c,scene;
   try{
    const {createBudgetedAudioScene}=await import('/virtual-audio.js'),{createVariantBag}=await import('/sound-family.js'),{spatialProfile}=await import('/spatial-audio.js');
    const check=(ok,msg)=>{if(!ok)throw Error(msg)};
    const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};let seed=91473;
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    c=new (window.AudioContext||window.webkitAudioContext)();await c.resume();check(c.state==='running','unlock');
    const decode=async url=>c.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const [track,amb]=await Promise.all([decode('/music.wav'),decode('/ambience.wav')]);
    check(Math.abs(track.duration-126.5)<.02&&Math.abs(amb.duration-40)<.02,'actual asset duration');
    const families=Object.fromEntries(['blade','shield','footstep'].map(k=>[k,{variants:Array.from({length:6},(_,i)=>'/'+k+'-0'+(i+1)+'.wav'),pitchCents:0,gainSpread:0}]));
    families.probe={variants:['/shield-01.wav'],pitchCents:0,gainSpread:0};
    const bag=createVariantBag(families.blade.variants,rng),draws=Array.from({length:18},()=>bag.next());
    check([0,6,12].every(i=>new Set(draws.slice(i,i+6)).size===6)&&draws.every((v,i)=>i===0||v!==draws[i-1]),'shuffle-bag');
    let fetches=0;const fetcher=(url,opts)=>{fetches++;return fetch(url,opts)};
    scene=createBudgetedAudioScene({context:c,budget:{total:9,events:6,music:1},families,stems:[{id:'crown',buffer:track,base:1}],bpm:96,beatsPerBar:5,maxBuffers:8,maxEventDecodedBytes:4*1024*1024,random:rng,fetcher,stingers:{'critical-impact':{url:'/shield-06.wav',duckGain:.55,duckHold:.35,cooldown:1}}});
    const analyser=c.createAnalyser();analyser.fftSize=2048;scene.mixer.bus('events').connect(analyser);
    const profile=(x,y)=>({source:{x,y},listener:{x:0,y:0},referenceDistance:3,maxDistance:60,zone:'stone'});
    const near=profile(3,0),far=profile(24,0);check(spatialProfile(near).gain>spatialProfile(far).gain*10,'distance profile');
    const capture=async spatial=>{
     check(await scene.events.play('probe',{gain:.8,spatial}),'probe play');
     let peak=0;const a=new Float32Array(analyser.fftSize);
     for(let i=0;i<20;i++){await wait(15);analyser.getFloatTimeDomainData(a);for(const x of a)peak=Math.max(peak,Math.abs(x))}
     scene.events.stopAll();await wait(120);return peak;
    };
    const nearPeak=await capture(near),farPeak=await capture(far);
    check(nearPeak>.001&&farPeak>0&&nearPeak>farPeak*3,'real distance output');
    const beforeCache=fetches;check(await scene.events.play('probe',{spatial:near}),'cached play');check(fetches===beforeCache,'cache miss on repeat');scene.events.stopAll();
    check(await scene.music.start(),'music start');const transport=scene.music.state.startTime;
    check(await scene.world.reconcile({listener:{x:0,y:0},sources:[{id:'rain',buffer:amb,position:{x:3,y:2},volume:.6,referenceDistance:5,maxDistance:70,zone:'open'},{id:'far-rain',buffer:amb,position:{x:24,y:12},volume:.4,referenceDistance:5,maxDistance:70,zone:'forest'}]}),'world start');
    check(scene.stats.continuous===2,'ambience sources');
    check(await scene.playStinger('critical-impact'),'critical impact');await wait(120);
    const duck=scene.stats.musicDucking.gain;check(duck<=.56,'ducking');
    const burst=await Promise.all(Array.from({length:12},(_,i)=>scene.events.play(['blade','shield','footstep'][i%3],{spatial:i%2?near:far,priority:2})));
    check(burst.some(Boolean)&&scene.stats.allocated<=9&&scene.events.stats.voices<=6,'voice budget');
    check(scene.events.stats.buffers<=8&&scene.events.stats.decodedBytes<=4*1024*1024,'cache budget');
    const stats=scene.stats,eventStats=scene.events.stats;await wait(1600);
    check(scene.stats.musicDucking.gain>.98&&scene.music.state.startTime===transport,'duck release or transport');
    const report={nearPeak,farPeak,duck,fetches,draws,burstAccepted:burst.filter(Boolean).length,stats,eventStats,trackBytes:track.length*track.numberOfChannels*4,ambienceBytes:amb.length*amb.numberOfChannels*4,clock:c.currentTime};
    scene.destroy();check(scene.stats.allocated===0,'cleanup');await c.close();window.done={report};
   }catch(e){scene?.destroy();if(c&&c.state!=='closed')await c.close();window.done={error:String(e),stack:e.stack}}
  });
 });
 await page.click('#go');await page.waitForFunction(()=>window.done,{},{timeout:30000});const result=await page.evaluate(()=>window.done);
 if(result.error||errors.length)throw Error(JSON.stringify({result,errors}));
 await mkdir(out,{recursive:true});await writeFile(path.join(out,engine+'.json'),JSON.stringify(result.report,null,2)+'\n');console.log(result.report);
}finally{await browser?.close();await new Promise(r=>server.close(r))}
