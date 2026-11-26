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
const files=new Set(['continuous-audio.js','spatial-audio.js','sound-family.js','virtual-audio.js','score-director.js']);
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
    const {createBudgetedAudioScene}=await import('/virtual-audio.js');
    const {createScoreDirector}=await import('/score-director.js');
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
      let c,mixer,source,musicPlayer,world,events,scene,director;
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
        // Let the first audible beat settle, then schedule the next beat.
        await new Promise(r=>setTimeout(r,160));
        musicPlayer.setIntensity(1,{fadeSeconds:.05,quantize:'beat'});
        const boundary=musicPlayer.state.transitionAt;
        check(musicPlayer.state.startTime===time&&musicPlayer.state.targets.battle===1,'Music restarted on intensity update');
        check(boundary>=c.currentTime-.02&&Math.abs((boundary-time)/.5-Math.round((boundary-time)/.5))<1e-6,'Beat clock invalid');
        // Read rendered output after the scheduled transition, not just requested state.
        const until=boundary+.25;
        const deadline=performance.now()+3000;
        while(c.currentTime<until&&performance.now()<deadline)await new Promise(r=>setTimeout(r,25));
        check(c.currentTime>=until,'Audio clock stalled before transition');
        analyser.smoothingTimeConstant=0;
        const spectrum=new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(spectrum);
        const bin=Math.round(440*analyser.fftSize/c.sampleRate);
        const battleDb=Math.max(spectrum[bin-1],spectrum[bin],spectrum[bin+1]);
        check(battleDb>-50,'Quantized battle stem missing from output');
        const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
        check(rms(data)>.005,'Live music bus silent');
        const startTime=musicPlayer.state.startTime;
        source.stop();musicPlayer.stop();
        // Independent integrated battlefield: a shared mixer and a hard total reservation.
        const march=makeSeamlessLoop(c,make(c,sr,92,.06),{crossfadeSeconds:.1});
        const army=Array.from({length:512},(_,i)=>({
          id:'unit-'+i,buffer:march,position:{x:(i<256?0:200)+(i%16)*2,y:Math.floor(i%256/16)*2},
          priority:i%23===0?3:1,volume:.8,referenceDistance:8,maxDistance:70,zone:'open'
        }));
        // A real decoder and one-shot family share the same mixer, with separate quota.
        const wav=new Uint8Array(44+2400*2),view=new DataView(wav.buffer);
        const str=(at,value)=>{for(let i=0;i<value.length;i++)wav[at+i]=value.charCodeAt(i)};
        str(0,'RIFF');view.setUint32(4,wav.length-8,true);str(8,'WAVEfmt ');
        view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
        view.setUint32(24,48000,true);view.setUint32(28,96000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
        str(36,'data');view.setUint32(40,wav.length-44,true);
        for(let i=0;i<2400;i++)view.setInt16(44+i*2,Math.round(4000*Math.sin(i*.1)*Math.sin(Math.PI*i/2400)),true);
        scene=createBudgetedAudioScene({context:c,budget:{total:18,events:4,music:2},maxSources:4096,
          families:{impact:{variants:['impact'],pitchCents:0,gainSpread:0}},fetcher:async()=>new Response(wav),
          stems:[{id:'calm',buffer:make(c,sr,220),base:1},{id:'battle',buffer:make(c,sr,440),threshold:.2,width:.6}]});
        world=scene.world;events=scene.events;
        const armyBus=scene.mixer.bus('world');scene.mixer.setBusVolume('world',.25);
        const armyAnalyser=c.createAnalyser();armyAnalyser.fftSize=2048;armyBus.connect(armyAnalyser);
        check(await scene.music.start(),'Scene music failed');
        const sceneClock=scene.music.state.startTime;
        let t0=performance.now();
        check(await world.reconcile({listener:{x:0,y:0},sources:army}),'Initial army update failed');
        const initialMs=performance.now()-t0,first=world.activeIds;
        check(first.length===12&&first.every(id=>Number(id.slice(5))<256),'Initial selection wrong');
        const firstStats=world.stats;

        const burst=await Promise.all(Array.from({length:8},()=>events.play('impact',{priority:2})));
        check(burst.filter(Boolean).length===4,'Combat burst exceeded reservation or decode failed');
        const withEvent=scene.stats;check(withEvent.allocated<=18&&withEvent.music===2,'Combined budget invalid');
        scene.music.setIntensity(1,{quantize:'beat',fadeSeconds:.05});
        t0=performance.now();
        check(await world.reconcile({listener:{x:200,y:0},sources:army}),'Listener travel update failed');
        const retireMs=performance.now()-t0,retiring=world.stats;
        check(retiring.active===12&&retiring.retiring===12,'Retiring voices escaped cap');
        const readyAt=c.currentTime+.08,travelDeadline=performance.now()+3000;
        while(c.currentTime<readyAt&&performance.now()<travelDeadline)await new Promise(r=>setTimeout(r,20));
        check(c.currentTime>=readyAt,'Audio clock stalled during retirement');
        t0=performance.now();
        check(await world.reconcile({listener:{x:200,y:0},sources:army}),'Army activation failed');
        const activateMs=performance.now()-t0,second=world.activeIds;
        check(second.length===12&&second.every(id=>Number(id.slice(5))>=256),'Wrong army activated');
        const signalAt=c.currentTime+.15,signalDeadline=performance.now()+3000;
        while(c.currentTime<signalAt&&performance.now()<signalDeadline)await new Promise(r=>setTimeout(r,20));
        const armyData=new Float32Array(armyAnalyser.fftSize);armyAnalyser.getFloatTimeDomainData(armyData);
        const armyRms=rms(armyData);
        check(armyRms>.0001&&world.stats.peak===12&&world.stats.failures===0,'Virtual army output or budget invalid');
        const worldReport={first:firstStats,retiring,final:world.stats,firstIds:first,secondIds:second,initialMs,retireMs,activateMs,armyRms,combatDecoded:true,acceptedEvents:burst.filter(Boolean).length,withEvent,combined:scene.stats,musicContinued:scene.music.state.startTime===sceneClock};
        check(worldReport.musicContinued,'Scene restarted score');
        const sweep=[];
        for(const count of [512,1024,4096]){
          // Deliberately dense sound field: every unit is in hearing range.
          const dense=Array.from({length:count},(_,i)=>({
            id:'dense-'+i,buffer:march,position:{x:3+(i%64)*.5,y:Math.floor(i/64)*.5},
            priority:i%23===0?3:1,volume:.8,referenceDistance:8,maxDistance:100
          }));
          const elapsed=[];
          for(let tick=0;tick<30;tick++){
            const before=performance.now();
            check(await world.reconcile({listener:{x:5+tick*.2,y:5},sources:dense}),'Dense update failed');
            elapsed.push(performance.now()-before);
            check(scene.stats.allocated<=18&&world.stats.active<=12,'Dense update exceeded budget');
            await new Promise(r=>setTimeout(r,5));
          }
          elapsed.sort((a,b)=>a-b);
          sweep.push({count,updates:elapsed.length,p50Ms:elapsed[14],p95Ms:elapsed[28],maxMs:elapsed.at(-1),active:world.stats.active,peak:world.stats.peak,failures:world.stats.failures});
        }
        worldReport.sweep=sweep;
        check(world.stats.failures===0,'Dense activation failed');
        scene.destroy();armyAnalyser.disconnect();
        check(scene.stats.allocated===0,'Scene cleanup failed');
        const scoreBus=mixer.bus('horizontal'),scoreAnalyser=c.createAnalyser();
        scoreAnalyser.fftSize=4096;scoreAnalyser.smoothingTimeConstant=0;scoreBus.connect(scoreAnalyser);
        director=createScoreDirector({context:c,destination:scoreBus,
          graph:{initial:'peace',states:{peace:{tempo:120,beatsPerBar:2,bars:1},battle:{tempo:90,beatsPerBar:3,bars:1}},edges:{peace:['battle'],battle:['peace']},bridges:{'peace:battle':{file:'fixture.wav'}}},
          buffers:{peace:make(c,sr,220),battle:make(c,sr*2,440)},bridgeBuffers:{'peace:battle':make(c,sr*.5,330)}});
        check(await director.start(),'Horizontal start failed');
        const peaceStart=director.state.startTime;
        const waitClock=async t=>{const deadline=performance.now()+3000;while(c.currentTime<t&&performance.now()<deadline)await new Promise(r=>setTimeout(r,20));check(c.currentTime>=t,'Horizontal audio clock stalled')};
        await waitClock(peaceStart+.2);
        function scoreBand(hz){
          const a=new Float32Array(scoreAnalyser.frequencyBinCount);scoreAnalyser.getFloatFrequencyData(a);
          const b=Math.round(hz*scoreAnalyser.fftSize/c.sampleRate);return Math.max(a[b-1],a[b],a[b+1]);
        }
        const peaceBefore=scoreBand(220),battleBefore=scoreBand(440);
        check(peaceBefore>-50&&battleBefore<peaceBefore-15,'Peace spectrum invalid');
        check(director.request('battle',{quantize:'beat',fadeSeconds:.12}),'Horizontal request failed');
        const transition=director.state.transitionAt,end=director.state.transitionEnd;
        check(director.state.voices===2&&Math.abs((transition-peaceStart)/.5-Math.round((transition-peaceStart)/.5))<1e-6,'Horizontal scheduling invalid');
        const bridgeUntil=director.state.bridgeUntil;
        await waitClock(end+.15);director.update();
        const bridgeDuring=scoreBand(330);
        check(bridgeDuring>-50&&scoreBand(440)<bridgeDuring-15,'Authored bridge not audible before destination');
        await waitClock(bridgeUntil+.2);director.update();
        const peaceAfter=scoreBand(220),battleAfter=scoreBand(440);
        check(director.state.current==='battle'&&director.state.voices===1&&battleAfter>-50&&peaceAfter<battleAfter-15,'Horizontal clip replacement invalid');
        await waitClock(bridgeUntil+2.2);const bridgeAfterLoop=scoreBand(330);check(scoreBand(440)>-50&&bridgeAfterLoop<scoreBand(440)-15,'Bridge repeated inside destination loop');
        const horizontal={bridgeDuring,bridgeAfterLoop:Number.isFinite(bridgeAfterLoop)?bridgeAfterLoop:null,bridgeUntil,peaceBefore:Number.isFinite(peaceBefore)?peaceBefore:null,battleBefore:Number.isFinite(battleBefore)?battleBefore:null,peaceAfter:Number.isFinite(peaceAfter)?peaceAfter:null,battleAfter:Number.isFinite(battleAfter)?battleAfter:null,transition,fadeSeconds:.12};
        director.destroy();scoreAnalyser.disconnect();check(director.state.voices===0,'Horizontal cleanup failed');
        check(!source.active&&!musicPlayer.state.active,'Stop failed');
        check(await source.start()&&await musicPlayer.start(),'Restart failed');
        check(musicPlayer.state.startTime>startTime,'Restart clock invalid');
        window.runtimeResult={liveRms:rms(data),restart:true,quantizedBeat:boundary,battleDb,world:worldReport,horizontal};
      }catch(e){window.runtimeResult={error:String(e)}}finally{
        director?.destroy();scene?.destroy();source?.destroy();musicPlayer?.destroy();mixer?.destroy();if(c)await c.close();window.runtimeDone=true;
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
