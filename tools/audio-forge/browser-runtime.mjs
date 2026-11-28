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
const files=new Set(['continuous-audio.js','spatial-audio.js','sound-family.js','virtual-audio.js','score-director.js','music-ducking.js']);
const server=createServer(async(req,res)=>{
  try{
    const name=req.url.slice(1);
    if(name===''){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><button id="start">Start audio</button>');return;}
    if(name==='tools/audio-forge/adapters/banners-of-war.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.resolve(name)));return;}
    if(name==='banners-game-contract.js'&&process.env.BANNERS_AUDIO_CONTRACT){res.setHeader('Content-Type','text/javascript');res.end(await readFile(process.env.BANNERS_AUDIO_CONTRACT));return;}
    if(name.startsWith('shared/capabilities/')&&files.has(name.split('/').at(-1))){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.resolve(name)));return;}
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
  const result=await page.evaluate(async(hasGameContract)=>{
    const {makeSeamlessLoop,createDynamicEmitter,createAdaptiveMusic}=await import('/continuous-audio.js');
    const {createSpatialMixer}=await import('/spatial-audio.js');
    const {createBudgetedAudioScene}=await import('/virtual-audio.js');
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
        scene=createBudgetedAudioScene({context:c,budget:{total:18,events:4,music:4},
          families:{impact:{variants:['impact']}},fetcher:async()=>new Response(wav),maxEventDecodedBytes:65536,maxScoreDecodedBytes:4194304,
          stingers:{victory:{url:'victory',cooldown:2,states:['peace'],duckGain:.35,duckHold:.4}},score:{graph:{initial:'peace',states:{peace:{tempo:120,beatsPerBar:2,bars:1},battle:{tempo:90,beatsPerBar:3,bars:1}},edges:{peace:['battle'],battle:['peace']},bridges:{'peace:battle':{file:'fixture.wav'}}},
          buffers:{peace:make(c,sr,220),battle:make(c,sr*2,440)},bridgeBuffers:{'peace:battle':make(c,sr*.5,330)},layers:{peace:[{id:'peace-detail',buffer:make(c,sr,660),threshold:.1,width:.8}],battle:[{id:'battle-detail',buffer:make(c,sr*2,880),threshold:.1,width:.8}]}}});
        director=scene.music;
        const scoreBus=scene.mixer.bus('music'),scoreAnalyser=c.createAnalyser();
        scoreAnalyser.fftSize=4096;scoreAnalyser.smoothingTimeConstant=0;scoreBus.connect(scoreAnalyser);
        check(await director.start(),'Horizontal start failed');
        const peaceStart=director.state.startTime;
        check(await scene.preloadStinger('victory'),'Stinger preload failed');
        const stingerAccepted=await scene.playStinger('victory');
        check(stingerAccepted&&!await scene.playStinger('victory'),'Stinger decode or cooldown failed');
        const memory={events:scene.stats.eventDecodedBytes,score:scene.stats.scoreReservedBytes};
        check(memory.events>0&&memory.events<=65536&&memory.score>0&&memory.score<=4194304,'Decoded budget exceeded');
        check(scene.stats.allocated<=18&&director.state.startTime===peaceStart,'Stinger broke music transport');
        const waitClock=async t=>{const deadline=performance.now()+3000;while(c.currentTime<t&&performance.now()<deadline)await new Promise(r=>setTimeout(r,20));check(c.currentTime>=t,'Horizontal audio clock stalled')};
        await waitClock(peaceStart+.2);
        function scoreBand(hz){
          const a=new Float32Array(scoreAnalyser.frequencyBinCount);scoreAnalyser.getFloatFrequencyData(a);
          const b=Math.round(hz*scoreAnalyser.fftSize/c.sampleRate);return Math.max(a[b-1],a[b],a[b+1]);
        }
        const ducked=scoreBand(220);
        const duckUntil=scene.stats.musicDucking.until;
        check(scene.stats.musicDucking.gain<.5,'Music duck gain failed');
        await waitClock(duckUntil+.15);
        const peaceBefore=scoreBand(220),battleBefore=scoreBand(440);
        check(peaceBefore-ducked>6,'Rendered music ducking did not recover');
        check(peaceBefore>-50&&battleBefore<peaceBefore-15,'Peace spectrum invalid');
        const quietDetail=scoreBand(660);
        director.setIntensity(1,{fadeSeconds:.08});
        await waitClock(c.currentTime+.25);
        const loudDetail=scoreBand(660);
        check(loudDetail>-50&&quietDetail<loudDetail-15&&director.state.startTime===peaceStart&&director.state.voices===2,'Peace vertical adaptation failed');
        check(director.request('battle',{quantize:'beat',fadeSeconds:.12}),'Horizontal request failed');
        const transition=director.state.transitionAt,end=director.state.transitionEnd;
        check(scene.stats.music===4&&scene.stats.allocated<=18&&director.state.voices===4&&Math.abs((transition-peaceStart)/.5-Math.round((transition-peaceStart)/.5))<1e-6,'Horizontal scheduling invalid');
        const bridgeUntil=director.state.bridgeUntil;
        await waitClock(end+.15);director.update();
        const bridgeDuring=scoreBand(330);
        check(bridgeDuring>-50&&scoreBand(440)<bridgeDuring-15&&scoreBand(880)<bridgeDuring-15,'Authored bridge not audible before destination');
        await waitClock(bridgeUntil+.2);director.update();
        const peaceAfter=scoreBand(220),battleAfter=scoreBand(440);
        check(director.state.current==='battle'&&director.state.voices===2&&battleAfter>-50&&peaceAfter<battleAfter-15,'Horizontal clip replacement invalid');
        const battleDetail=scoreBand(880),battleClock=director.state.startTime;
        check(battleDetail>-50&&scoreBand(660)<battleDetail-15,'State-specific layer replacement failed');
        director.setIntensity(0,{fadeSeconds:.08});
        await waitClock(c.currentTime+.25);
        const battleDetailMuted=scoreBand(880);
        check(battleDetailMuted<battleDetail-15&&scoreBand(440)>-50&&director.state.startTime===battleClock,'Battle vertical adaptation restarted base');
        await waitClock(bridgeUntil+2.2);const bridgeAfterLoop=scoreBand(330);check(scoreBand(440)>-50&&bridgeAfterLoop<scoreBand(440)-15,'Bridge repeated inside destination loop');
        check(!await scene.playStinger('victory'),'Incompatible state accepted stinger');
        const horizontal={unified:{quietDetail:Number.isFinite(quietDetail)?quietDetail:null,loudDetail,battleDetail,battleDetailMuted:Number.isFinite(battleDetailMuted)?battleDetailMuted:null,requiredVoices:director.state.requiredVoices},stingerAccepted,memory,ducked,duckRecoveryDb:peaceBefore-ducked,bridgeDuring,bridgeAfterLoop:Number.isFinite(bridgeAfterLoop)?bridgeAfterLoop:null,bridgeUntil,peaceBefore:Number.isFinite(peaceBefore)?peaceBefore:null,battleBefore:Number.isFinite(battleBefore)?battleBefore:null,peaceAfter:Number.isFinite(peaceAfter)?peaceAfter:null,battleAfter:Number.isFinite(battleAfter)?battleAfter:null,transition,fadeSeconds:.12};
        scene.destroy();scoreAnalyser.disconnect();check(director.state.voices===0&&scene.stats.allocated===0,'Horizontal cleanup failed');
        let banners=null;
        if(hasGameContract){
          const {createBannersAudioAdapter,deriveBattleMusic}=await import('/tools/audio-forge/adapters/banners-of-war.js');
          const {soundEvents,audible}=await import('/banners-game-contract.js');
          const F={W:1000,H:1000,alive:u=>u.n>0,visible:(_s,_side,u)=>u.visible,spec:()=>({horse:0}),sample:()=>({canopy:.5}),riverX:()=>20};
          const cam={x:0,y:0,k:1},unit={id:1,x:0,y:0,n:90,side:0,v:1,contact:0,motionDistance:0};
          const hidden={...unit,id:2,side:1,visible:false,contact:30};
          const snap=(time,u)=>({time,fog:true,terrain:{},units:[u,hidden]});
          const observation=deriveBattleMusic({F,s:snap(0,unit),cam,audible});
          check(!observation.battle&&!observation.tension&&observation.units===1,'Hidden enemy affected score');
          const adapter=createBannersAudioAdapter({context:c,F,soundEvents,audible,assets:{approved:true,families:{step:{variants:['fixture'],pitchCents:0,gainSpread:0}},ambient:{wind:march}},budget:{total:8,events:4,music:0},fetcher:async()=>new Response(wav)});
          try{
            check(await adapter.unlock(),'Banners unlock failed');
            await adapter.update(snap(0,unit),cam,{playing:true});
            await adapter.update(snap(.7,{...unit,motionDistance:1}),cam,{playing:true});
            await waitClock(c.currentTime+.2);
            const live=adapter.status();
            check(live.counts.step===1&&live.scene.logical===1&&live.scene.allocated<=8,'Banners actual extractor or audio budget failed');
            await adapter.update(snap(.7,unit),cam,{active:false,playing:false});
            await waitClock(c.currentTime+.08);
            await adapter.update(snap(.7,unit),cam,{active:false,playing:false});
            check(adapter.status().scene.allocated===0,'Banners inactive cleanup failed');
            banners={counts:live.counts,logical:live.scene.logical,allocated:live.scene.allocated,hiddenIgnored:true};
          }finally{adapter.destroy();}
          check(adapter.status().scene.allocated===0,'Banners destroy leaked voices');
        }
        check(!source.active&&!musicPlayer.state.active,'Stop failed');
        check(await source.start()&&await musicPlayer.start(),'Restart failed');
        check(musicPlayer.state.startTime>startTime,'Restart clock invalid');
        window.runtimeResult={liveRms:rms(data),restart:true,quantizedBeat:boundary,battleDb,world:worldReport,horizontal,banners};
      }catch(e){window.runtimeResult={error:String(e)}}finally{
        director?.destroy();scene?.destroy();source?.destroy();musicPlayer?.destroy();mixer?.destroy();if(c)await c.close();window.runtimeDone=true;
      }
    },{once:true});
    return {loopFrames:loop.length,seam,loopSeam,calm,combat};
  },Boolean(process.env.BANNERS_AUDIO_CONTRACT));
  await page.click('#start');await page.waitForFunction(()=>window.runtimeDone===true,{},{timeout:15000});
  const live=await page.evaluate(()=>window.runtimeResult);
  assert.ok(!live.error,live.error);assert.deepEqual(errors,[]);
  const report={engine,...result,live};
  await writeFile(path.join(out,engine+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
