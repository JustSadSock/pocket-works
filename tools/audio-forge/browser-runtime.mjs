// Real browser audio checks. Run with PLAYWRIGHT_MODULE pointing to playwright.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const engine=process.argv[2]??'chromium';
const launcher={chromium,webkit}[engine];
if(!launcher)throw new Error('Unknown engine');
const out=path.resolve(process.argv[3]??'.audio-runtime-browser');
await mkdir(out,{recursive:true});
const files=new Set(['continuous-audio.js','spatial-audio.js','sound-family.js']);
const server=createServer(async(req,res)=>{
  try{
    const name=req.url.slice(1);
    if(name===''){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><button id="start">Start audio</button>');return;}
    if(!files.has(name)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.resolve('shared/capabilities',name)));
  }catch{res.writeHead(500).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await launcher.launch({headless:true});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{
    const {makeSeamlessLoop,createDynamicEmitter,createAdaptiveMusic}=await import('/continuous-audio.js');
    const {createSpatialMixer}=await import('/spatial-audio.js');
    function check(condition,message){if(!condition)throw Error(message)}
    const sr=48000;
    const make=(ctx,length,frequency,amp=.12)=>{
      const b=ctx.createBuffer(1,length,sr),v=b.getChannelData(0);
      for(let i=0;i<length;i++)v[i]=amp*Math.sin(2*Math.PI*frequency*i/sr);
      return b;
    };
    const ctx=new OfflineAudioContext(2,sr*2,sr);
    // Deliberately nonperiodic source, then render multiple prepared cycles.
    const raw=make(ctx,Math.floor(sr*.73),223.7);
    const loop=makeSeamlessLoop(ctx,raw,{crossfadeSeconds:.08});
    const samples=loop.getChannelData(0),seam=Math.abs(samples[0]-samples.at(-1));
    check(loop.length===raw.length-3840,'Wrong loop length');
    check(seam<.006,'Loop boundary discontinuity');
    const emitter=createDynamicEmitter({context:ctx,buffer:loop,spatial:{source:{x:0,y:0},listener:{x:0,y:0}}});
    check(await emitter.start(),'Offline emitter failed');
    const audio=await ctx.startRendering();
    const rms=(v,start=0,end=v.length)=>Math.sqrt(v.slice(start,end).reduce((a,b)=>a+b*b,0)/(end-start));
    const left=audio.getChannelData(0);
    check(rms(left,5000,30000)>.02,'Silent loop output');
    const loopSeam=Math.abs(left[loop.length]-left[loop.length-1]);
    check(loopSeam<.01,'Rendered loop click');
    emitter.destroy();

    // Actual rendered stems, with the same grid and two intensity snapshots.
    async function music(intensity){
      const c=new OfflineAudioContext(2,sr*2,sr);
      const stems=[{id:'base',buffer:make(c,sr,220,.1),base:1},{id:'tension',buffer:make(c,sr,330,.1),threshold:.3,width:.5}];
      const player=createAdaptiveMusic({context:c,stems,intensity,volume:.7});
      check(await player.start(),'Offline stem transport failed');
      check(player.state.startTime===.05,'Transport clock');
      const out=await c.startRendering();const v=out.getChannelData(0);
      function amplitude(hz){
        let re=0,im=0;
        for(let i=4800;i<52800;i++){const phase=2*Math.PI*hz*i/sr;re+=v[i]*Math.cos(phase);im+=v[i]*Math.sin(phase)}
        return 2*Math.hypot(re,im)/48000;
      }
      const metrics={base:amplitude(220),tension:amplitude(330)};
      player.destroy();return metrics;
    }
    const calm=await music(0),combat=await music(1);
    check(calm.base>.05&&calm.tension<.002,'Calm stem mix invalid');
    check(combat.tension>.05&&Math.abs(combat.base-calm.base)<.002,'Combat stem mix invalid');
    // Real-time audio context is unlocked by the browser click, not by an autoplay flag.
    window.runtimeDone=false;
    document.querySelector('#start').addEventListener('click',async()=>{
      let c,mixer,source,musicPlayer;
      try{
        c=new (window.AudioContext||window.webkitAudioContext)();
        await c.resume();check(c.state==='running','AudioContext unlock failed');
        mixer=createSpatialMixer({context:c});
        const analyser=c.createAnalyser();analyser.fftSize=2048;mixer.bus('music').connect(analyser);
        source=createDynamicEmitter({context:c,destination:mixer.bus('ambience'),buffer:makeSeamlessLoop(c,make(c,sr,220)),spatial:{source:{x:5,y:0},listener:{x:0,y:0}}});
        check(await source.start(),'Live emitter start failed');
        const before=source.profile.gain;
        source.update({source:{x:100,y:0},listener:{x:0,y:0},occlusion:1,zone:'forest'});
        check(source.active&&source.profile.gain<before/10,'Dynamic update failed');
        musicPlayer=createAdaptiveMusic({context:c,destination:mixer.bus('music'),stems:[{id:'calm',buffer:make(c,sr,220),base:1},{id:'battle',buffer:make(c,sr,440),threshold:.2,width:.6}]});
        check(await musicPlayer.start(),'Live music failed');
        const time=musicPlayer.state.startTime;
        musicPlayer.setIntensity(1,{fadeSeconds:.05});
        check(musicPlayer.state.startTime===time&&musicPlayer.state.targets.battle===1,'Music restarted on intensity update');
        await new Promise(r=>setTimeout(r,300));
        const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
        check(rms(data)>.005,'Live music bus silent');
        const startTime=musicPlayer.state.startTime;
        source.stop();musicPlayer.stop();
        check(!source.active&&!musicPlayer.state.active,'Stop failed');
        check(await source.start()&&await musicPlayer.start(),'Restart failed');
        check(musicPlayer.state.startTime>startTime,'Restart clock invalid');
        window.runtimeResult={liveRms:rms(data),restart:true};
      }catch(e){window.runtimeResult={error:String(e)}}finally{
        source?.destroy();musicPlayer?.destroy();mixer?.destroy();if(c)await c.close();window.runtimeDone=true;
      }
    },{once:true});
    return {loopFrames:loop.length,seam,loopSeam,calm,combat};
  });
  await page.click('#start');await page.waitForFunction(()=>window.runtimeDone===true,{},{timeout:15000});
  const live=await page.evaluate(()=>window.runtimeResult);
  assert.ok(!live.error,live.error);assert.deepEqual(errors,[]);
  const report={engine,...result,live};
  await writeFile(path.join(out,engine+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
