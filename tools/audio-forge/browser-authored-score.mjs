import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const engine=process.argv[2],launcher={chromium,webkit}[engine];
if(!launcher)throw Error('Unknown browser');
const pack=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);
const modules=new Set(['score-pack.js','score-director.js','continuous-audio.js','spatial-audio.js','virtual-audio.js','sound-family.js','music-ducking.js']);
const server=createServer(async(req,res)=>{
 try{
  const name=req.url.slice(1);
  if(!name){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><button id="start">Start</button>');return;}
  let file,type;
  if(modules.has(name)){file=path.resolve('shared/capabilities',name);type='text/javascript';}
  else if(/^pack\/(score-graph\.json|score-metrics\.json|(adaptive|bridges|states)\/[a-z0-9-]+\.wav)$/.test(name)){file=path.join(pack,name.slice(5));type=name.endsWith('.json')?'application/json':'audio/wav';}
  else{res.writeHead(404).end();return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':type,'Content-Length':data.length});res.end(data);
 }catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await launcher.launch({headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
  const {loadForgeScore}=await import('/score-pack.js');
  const {createBudgetedAudioScene}=await import('/virtual-audio.js');
  document.querySelector('#start').addEventListener('click',async()=>{
   let context,scene,analyser;
   const check=(v,m)=>{if(!v)throw Error(m)};
   try{
    context=new AudioContext();await context.resume();
    const baseUrl=new URL('/pack/',location.href).href;
    const [graph,metrics]=await Promise.all(['score-graph.json','score-metrics.json'].map(f=>fetch(baseUrl+f).then(r=>r.json())));
    const before=performance.now();
    const score=await loadForgeScore({context,graph,metrics,baseUrl,maxDecodedBytes:128*1024*1024});
    const loadMs=performance.now()-before;
    check(score.files===12,'Wrong number of adaptive and bridge assets');
    analyser=context.createAnalyser();analyser.fftSize=2048;analyser.connect(context.destination);
    scene=createBudgetedAudioScene({context,destination:analyser,budget:{total:18,events:4,music:4},score});
    check(scene.music.memory.reservedBytes===score.reservedBytes,'Loader and director memory reservation mismatch');
    check(await scene.music.start(),'Authored score did not start');
    const samples=new Float32Array(analyser.fftSize),results=[];
    let peakVoices=0;
    async function until(time){
     const deadline=performance.now()+15000;
     while(context.currentTime<time&&performance.now()<deadline){
      scene.music.update();peakVoices=Math.max(peakVoices,scene.stats.music);
      check(scene.stats.allocated<=18&&scene.stats.music<=4,'Authored score exceeded quota');
      await new Promise(r=>setTimeout(r,20));
     }
     check(context.currentTime>=time,'Audio clock stalled');scene.music.update();
    }
    for(const id of ['peace','tension','battle','aftermath','peace']){
     if(scene.music.state.current!==id){
      check(scene.music.request(id,{quantize:'beat',fadeSeconds:.15}),'Authored transition rejected');
      peakVoices=Math.max(peakVoices,scene.stats.music);
      const state=scene.music.state;
      check(state.pending===id&&state.bridgeUntil>state.transitionAt,'Bridge not scheduled');
      await until(state.bridgeUntil+.25);
     }
     check(scene.music.state.current===id&&scene.stats.music===2,'Wrong destination or voice count');
     const clock=scene.music.state.startTime;
     scene.music.setIntensity(.85,{fadeSeconds:.12});
     let maxRms=0;
     for(let i=0;i<5;i++){
      await until(context.currentTime+.1);analyser.getFloatTimeDomainData(samples);
      const rms=Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length);
      maxRms=Math.max(maxRms,rms);
     }
     check(maxRms>.002&&scene.music.state.startTime===clock,'Authored state silent or restarted');
     results.push({id,clock,maxRms,voices:scene.stats.music});
    }
    check(peakVoices===4,'Transition voice count not exercised');
    const report={engine:undefined,contextRate:context.sampleRate,packRate:score.buffers.peace.sampleRate,files:score.files,loadMs,reservedBytes:score.reservedBytes,peakVoices,states:results};
    scene.destroy();check(scene.stats.allocated===0,'Authored scene leaked voices');
    window.authoredResult=report;
   }catch(e){window.authoredResult={error:String(e)}}finally{scene?.destroy();analyser?.disconnect();if(context)await context.close();window.authoredDone=true;}
  },{once:true});
 });
 await page.click('#start');await page.waitForFunction(()=>window.authoredDone===true,{},{timeout:45000});
 const report=await page.evaluate(()=>window.authoredResult);assert.ok(!report.error,report.error);assert.deepEqual(errors,[]);
 await mkdir(out,{recursive:true});await writeFile(path.join(out,engine+'-authored.json'),JSON.stringify({...report,engine},null,2)+'\n');
 console.log(JSON.stringify({...report,engine},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
