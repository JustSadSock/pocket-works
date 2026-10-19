// PetriForge adapter — loaded after every Shpilka engine patch; no effect outside ?petri=1.
(function () {
  'use strict';
  if (!window.__petriHarness || window.parent === window) return;
  const ORIGIN=location.origin,DT=1/120;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rngFor=seed=>{let v=seed>>>0||1;return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};};
  const post=(type,data={})=>parent.postMessage({bridge:'petri-shpilka-v1',type,...data},ORIGIN);
  const valid=p=>Array.isArray(p)&&p.length===9&&p.every(x=>Number.isFinite(x)&&x>=-2&&x<=2);
  const originalControls=playerControls;
  let control=null,running=false,task=null,checkpoint=[.95,.72,.95,.9,.7,.65,.75,.65,.7],lastTrace=null;
  // A nine-parameter sensor policy. It reads only the public track and nearby car observations.
  function observe(){
    if(!player||!track?.length)return null;
    const car=player,point=track[car.trackIndex]||track[0],ahead=track[(car.trackIndex+Math.max(1,Math.round(16+Math.hypot(car.vx,car.vy)/22)))%track.length];
    const dx=ahead.x-car.x,dy=ahead.y-car.y,heading=wrapAngle(Math.atan2(dy,dx)-car.angle);
    const tx=point.tx||Math.cos(point.heading),ty=point.ty||Math.sin(point.heading);
    const nx=-ty,ny=tx,offset=(car.x-point.x)*nx+(car.y-point.y)*ny;
    const speed=Math.hypot(car.vx,car.vy);
    const ahead2=track[(car.trackIndex+Math.max(1,Math.round(50+speed/10)))%track.length];
    const futureCurve=Math.abs(wrapAngle((ahead2.heading||0)-(point.heading||0)));
    let rivalDist=1e4,rivalSide=0;
    for(const rival of cars){if(rival===car)continue;const rx=rival.x-car.x,ry=rival.y-car.y,d=Math.hypot(rx,ry);
      if(d<rivalDist){rivalDist=d;rivalSide=Math.sign(rx*nx+ry*ny);}
    }
    return {speed,heading,offset,roadHalf:Math.max(28,roadHalf),futureCurve,slip:car.slip||0,
      yaw:car.yawRate||0,airborne:car.airborne,rivalDist,rivalSide,
      progress:car.progressDistance||0,completedLaps:car.completedLaps||0,offroad:Math.max(0,(car.distanceFromRoad||0)-roadHalf),
      finished:car.finishTime!=null,seconds:raceElapsed,x:car.x,y:car.y,angle:car.angle};
  }
  function decide(o,p){
    const steer=clamp(o.heading*(p[0]*2.5)+(-o.offset/o.roadHalf)*p[1]*1.8-o.yaw*p[2]*.2
      +(o.rivalDist<85?-o.rivalSide*p[8]*.22:0),-1,1);
    const bend=clamp(o.futureCurve*(.8+p[4]*2),0,1);
    const target=clamp((390+p[3]*260)*(1-bend*(.45+p[5]*.42)),100,640);
    const speedError=target-o.speed;
    const throttle=clamp((speedError+45)/(60+p[6]*80),0,1);
    const brake=clamp((-speedError-5)/(50+p[7]*115),0,1);
    return {steer,throttle,brake};
  }
  playerControls=function petriDriverControls(){
    if(control)return control;
    return originalControls();
  };
  // Training must not mutate a player's records on the host origin.
  saveState=function petriNoGameSaves(){};
  function resetEpisode(seed){
    prepareRoute(seed>>>0||1);
    setupRace();
    mode='paused';raceElapsed=0;
    startScreen.hidden=true;pauseScreen.hidden=true;finishScreen.hidden=true;
    document.querySelector('#loadingScreen')?.setAttribute('hidden','');
    countdownNode.hidden=true;showRaceUi(false);
    hud.hidden=false;speedCluster.hidden=false;controls.hidden=true;
    document.querySelector('#pauseButton')?.setAttribute('disabled','');
    countdownElapsed=0;
    lastFrame=performance.now();
    control={steer:0,throttle:0,brake:0};
  }
  function runEpisode(p,seed,steps=3300,record=false){
    resetEpisode(seed);
    const trace=[],limit=Math.max(100,Math.min(steps,4500));
    let stuck=0,lastProgress=0,offroad=0,contacts=0;
    for(let i=0;i<limit;i++){
      if(!player||player.finishTime!=null)break;
      if(i%8===0){const o=observe();if(!o)break;control=decide(o,p);if(record&&i%40===0)trace.push(o);}
      mode='race';
      try{updateSimulation(DT);}finally{mode='paused';}
      if(!player||!Number.isFinite(player.x)||!Number.isFinite(player.y))break;
      if(player.distanceFromRoad>roadHalf+15)offroad++;
      if(player.collisionCooldown>.14)contacts++;
      if(i%120===0){const progress=player.progressDistance||0;if(progress-lastProgress<16)stuck++;else stuck=0;lastProgress=progress;if(stuck>4)break;}
      if(player.finishTime!=null)break;
    }
    const o=observe()||{progress:0,completedLaps:0,offroad:0};
    const distance=Math.max(0,o.progress),lap=track?.totalLength||1;
    // Progress capped; no reverse-drive/recovery farming. Collision and offroad consequences matter.
    const completion=Math.min(lapsToWin||2,Math.max(0,o.completedLaps||0));
    const fitness=distance/Math.max(1,lap)*6+completion*5-offroad*.007-contacts*.002-
      ((o.offroad||0)>35?2:0);
    if(record)trace.push(o);
    return {fitness,progress:distance,laps:completion,offroad,contacts,seconds:o.seconds||0,trace,
      finished:!!o.finished};
  }
  function evaluate(p,seed){
    const a=runEpisode(p,seed,2400),b=runEpisode(p,seed+13217,2400);
    return {score:(a.fitness+b.fitness)/2,progress:(a.progress+b.progress)/2,laps:a.laps+b.laps,offroad:a.offroad+b.offroad};
  }
  function singleStepReplay(trace,index){
    if(!trace?.length)return;const o=trace[Math.min(index,trace.length-1)];
    if(!o||!player)return;
    // Render a historical path preview: interpolation does not pretend to be a re-simulated race.
    player.x=o.x;player.y=o.y;player.angle=o.angle;player.vx=o.speed*Math.cos(o.angle);player.vy=o.speed*Math.sin(o.angle);
    draw();
  }
  function trainingTick(){
    const t=task;if(!t)return;
    try{
      let runs=0;
      while(task===t&&t.index<t.iterations&&runs++<1){
        const r=rngFor(t.seed+t.index*3191),candidate=t.best.map(x=>clamp(x+(r()+r()-1)*t.scale,-2,2));
        const seed=t.seed+8000+t.index*1337,old=evaluate(t.best,seed),next=evaluate(candidate,seed);
        if(next.score>old.score){t.best=candidate;t.accepted++;}
        t.index++;post('progress',{complete:t.index,total:t.iterations,fitness:next.score,bestFitness:Math.max(old.score,next.score),accepted:t.accepted,policy:t.best});
      }
      if(t.index>=t.iterations){
        checkpoint=t.best.slice();task=null;
        const baseline=evaluate(t.initial,t.seed+900001),validation=evaluate(checkpoint,t.seed+900001);
        const replay=runEpisode(checkpoint,t.seed+909101,3500,true);
        lastTrace=replay.trace;
        draw();
        post('trained',{policy:checkpoint,baseline,validation,replay,complete:t.index,accepted:t.accepted});
      }else setTimeout(trainingTick,0);
    }catch(err){task=null;post('error',{message:String(err.message||err)});}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==ORIGIN||event.source!==window.parent||event.data?.bridge!=='petri-shpilka-v1')return;
    const {type,payload={}}=event.data;
    try{
      if(type==='train'){
        if(task)throw Error('Тренировка уже идёт');
        const iterations=clamp(Math.floor(Number(payload.iterations)||10),1,40),seed=(Number(payload.seed)>>>0)||41;
        const p=valid(payload.policy)?payload.policy.slice():checkpoint.slice();
        task={iterations,seed,index:0,best:p,initial:p.slice(),accepted:0,scale:.35};
        post('started',{iterations});setTimeout(trainingTick,0);
      }else if(type==='stop'){
        if(task){checkpoint=task.best.slice();const t=task;task=null;post('stopped',{complete:t.index,total:t.iterations,policy:checkpoint});}
      }else if(type==='load'){
        if(task)throw Error('Остановите обучение');if(!valid(payload.policy))throw Error('Некорректный мозг');
        checkpoint=payload.policy.slice();post('loaded',{policy:checkpoint,requestId:payload.requestId??null});
      }else if(type==='test'){
        if(task)throw Error('Сначала закончите обучение');
        const seed=(Number(payload.seed)>>>0)||8411;
        const result=runEpisode(checkpoint,seed,3500,true);lastTrace=result.trace;draw();
        post('tested',{result,policy:checkpoint});
      }else if(type==='preview'){
        if(!task){singleStepReplay(lastTrace,Number(payload.frame)||0);post('previewed',{frame:Number(payload.frame)||0,total:lastTrace?.length||0});}
      }else if(type==='reset'){
        if(task)throw Error('Сначала закончите обучение');
        checkpoint=[.95,.72,.95,.9,.7,.65,.75,.65,.7];post('loaded',{policy:checkpoint});
      }
    }catch(error){post('error',{message:String(error.message||error)});}
  });
  setTimeout(()=>{if(typeof prepareRoute==='function'&&typeof updateSimulation==='function'){
    try{resetEpisode(41);draw();post('ready',{version:'shpilka-2.9-physics',policy:checkpoint});}
    catch(e){post('error',{message:'Не удалось подготовить трассу: '+e.message});}
  }},90);
})();
