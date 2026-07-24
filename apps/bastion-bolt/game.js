import { Node, clamp, damp, smoothstep, TAU, add3, sub3, mul3, len3, norm3 } from './engine.js';
import { SiegeAudio } from './audio.js';
import { STORAGE_KEY, AMMO } from './config.js';

export function startSiegeGame({ ui, renderer, scene }) {
  let profile = loadProfile();
  const {
    GEO, root, world, castle, ballista, effects, COLORS, node, box, cylinder, sphere, beamBetween, rand,
    targetDefs, gate, loadedProjectile, loadedShaft, loadedTip, winch, turret, stringLeft, stringRight,
    particles, smokeColumns, rubble, scars, flags, spawnParticle,
  } = scene;

  const state = {
    mode:'intro', ammo:'bolt', power:74, angle:19, yaw:0, wind:(rand()-.5)*6.4, selected:gate,
    shot:null, cameraMode:'ballista', sound:profile.sound !== false, time:0, shake:0, drag:null,
  };

  function loadProfile(){ try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return{bestHit:Number(raw.bestHit)||0,destroyed:Number(raw.destroyed)||0,shots:Number(raw.shots)||0,sound:raw.sound!==false};}catch{return{bestHit:0,destroyed:0,shots:0,sound:true};} }
  function saveProfile(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(profile)); }
  function renderRecords(){ ui.bestHit.textContent=Math.round(profile.bestHit);ui.destroyedCount.textContent=profile.destroyed;ui.shotCount.textContent=profile.shots; }
  renderRecords();

  const audio=new SiegeAudio(() => state.sound);
  function haptic(pattern){if(navigator.vibrate)navigator.vibrate(pattern);}

  function setCallout(title,sub='',duration=1250){ui.callout.querySelector('b').textContent=title;ui.callout.querySelector('span').textContent=sub;ui.callout.classList.add('show');clearTimeout(setCallout.timer);setCallout.timer=setTimeout(()=>ui.callout.classList.remove('show'),duration);}
  function setGameVisible(value){for(const el of [ui.topbar,ui.controls,ui.targetCard,ui.windCard,ui.reticle])el.hidden=!value;}
  function beginGame(){ui.intro.hidden=true;ui.brief.hidden=true;ui.result.hidden=true;setGameVisible(true);state.mode='ready';updateControls();setCallout('БАЛЛИСТА ГОТОВА','коснись части замка, чтобы выбрать цель');audio.ensure();}
  ui.start.addEventListener('click',beginGame);ui.briefStart.addEventListener('click',beginGame);ui.briefButton.addEventListener('click',()=>ui.brief.hidden=false);ui.briefClose.addEventListener('click',()=>ui.brief.hidden=true);

  function updateControls(){
    state.power=Number(ui.power.value);state.angle=Number(ui.angle.value);state.yaw=Number(ui.yaw.value);
    ui.powerOut.textContent=`${state.power}%`;ui.angleOut.textContent=`${state.angle}°`;ui.yawOut.textContent=`${state.yaw>0?'+':''}${state.yaw.toFixed(1)}°`;
    ui.windValue.textContent=Math.abs(state.wind).toFixed(1);ui.windArrow.textContent=state.wind>=0?'→':'←';
    ui.fireHint.textContent=`${AMMO[state.ammo].label} заряжен`;ui.fire.disabled=state.mode!=='ready';
    updateTargetCard();
  }
  [ui.power,ui.angle,ui.yaw].forEach(input=>input.addEventListener('input',()=>{if(state.mode==='ready'){updateControls();audio.tone(55,.03,'square',.025,5)}}));
  ui.ammoRow.addEventListener('click',event=>{const button=event.target.closest('[data-ammo]');if(!button||state.mode!=='ready')return;state.ammo=button.dataset.ammo;for(const b of ui.ammoRow.querySelectorAll('button'))b.setAttribute('aria-checked',String(b===button));loadedShaft.color=[...AMMO[state.ammo].color];loadedTip.color=[...AMMO[state.ammo].tip];loadedShaft.visible=state.ammo!=='stone';loadedTip.visible=state.ammo!=='stone';setCallout(button.querySelector('span').textContent,button.querySelector('small').textContent,700);updateControls();haptic(10);});
  ui.reset.addEventListener('click',()=>{if(state.mode!=='ready')return;ui.power.value=74;ui.angle.value=19;ui.yaw.value=0;state.selected=gate;updateControls();setCallout('ПОПРАВКИ СБРОШЕНЫ','базовая пристрелка');});
  ui.camera.addEventListener('click',()=>{if(state.mode!=='ready')return;state.cameraMode=state.cameraMode==='ballista'?'wide':'ballista';setCallout(state.cameraMode==='wide'?'ОБЩИЙ ВИД':'У БАЛЛИСТЫ','камера переключена',650);});
  ui.sound.addEventListener('click',()=>{state.sound=!state.sound;profile.sound=state.sound;saveProfile();ui.sound.classList.toggle('off',!state.sound);if(state.sound)audio.tone(220,.08,'triangle',.08,30);});ui.sound.classList.toggle('off',!state.sound);

  function updateTargetCard(){const t=state.selected,ratio=clamp(t.health/t.maxHealth,0,1);ui.targetName.textContent=t.label;ui.targetHealth.style.width=`${ratio*100}%`;ui.targetStatus.textContent=t.destroyed?'РАЗРУШЕНО':ratio>.72?'ЦЕЛЫ':ratio>.36?'ПОВРЕЖДЕНЫ':'НА ГРАНИ';}
  function selectTargetAt(clientX,clientY){
    let best=null,bestD=84;for(const t of targetDefs){if(t.destroyed)continue;const p=renderer.project(t.center);if(!p||p.z>1)continue;const d=Math.hypot(clientX-p.x,clientY-p.y);if(d<bestD){best=t;bestD=d;}}
    if(best){state.selected=best;updateTargetCard();const predicted=estimateAtCastle();const desiredYaw=Math.atan2(best.center[0]-predicted.x,100)*180/Math.PI+state.yaw;ui.yaw.value=clamp(desiredYaw,-14,14);updateControls();setCallout(best.label,'цель отмечена',700);haptic(8);}
  }
  ui.canvas.addEventListener('pointerdown',event=>{if(state.mode!=='ready')return;state.drag={x:event.clientX,y:event.clientY,yaw:Number(ui.yaw.value),angle:Number(ui.angle.value),moved:false};ui.canvas.setPointerCapture?.(event.pointerId);});
  ui.canvas.addEventListener('pointermove',event=>{if(!state.drag||state.mode!=='ready')return;const dx=event.clientX-state.drag.x,dy=event.clientY-state.drag.y;if(Math.hypot(dx,dy)>7)state.drag.moved=true;ui.yaw.value=clamp(state.drag.yaw+dx*.055,-14,14);ui.angle.value=clamp(state.drag.angle-dy*.045,5,42);updateControls();});
  ui.canvas.addEventListener('pointerup',event=>{if(!state.drag)return;if(!state.drag.moved)selectTargetAt(event.clientX,event.clientY);state.drag=null;});

  function initialVelocity(){const cfg=AMMO[state.ammo],speed=(25+state.power*.31)*cfg.speed,ang=state.angle*Math.PI/180,yaw=state.yaw*Math.PI/180;return [Math.sin(yaw)*Math.cos(ang)*speed,Math.sin(ang)*speed,-Math.cos(yaw)*Math.cos(ang)*speed];}
  function muzzlePosition(){const yaw=state.yaw*Math.PI/180;return [Math.sin(yaw)*6.1,4.35,19-Math.cos(yaw)*6.1];}
  function estimateAtCastle(){let p=muzzlePosition(),v=initialVelocity(),t=0;const cfg=AMMO[state.ammo];while(t<8&&p[2]>-82&&p[1]>0){const dt=.025;v[0]+=state.wind*.055*cfg.wind*dt;v[1]-=9.81*cfg.gravity*dt;p=add3(p,mul3(v,dt));t+=dt;}return{x:p[0],y:p[1],t,distance:Math.hypot(p[0],p[2]-19)};}

  function setBallistaAim(){const yaw=state.yaw*Math.PI/180,angle=state.angle*Math.PI/180;ballista.rotation[1]=yaw;turret.rotation[0]=-angle*.62;}
  function updateReticle(){const est=estimateAtCastle(),p=renderer.project([est.x,clamp(est.y,1,24),-79]);if(p){ui.reticle.style.left=`${p.x}px`;ui.reticle.style.top=`${p.y}px`;ui.rangeLabel.textContent=`${Math.round(est.distance)} м · ${Math.max(0,est.y).toFixed(1)} м`;}}

  function fireShot(){
    if(state.mode!=='ready')return;state.mode='charging';ui.fire.disabled=true;state.shot={phase:'charge',timer:0,flightTime:0,position:muzzlePosition(),velocity:initialVelocity(),ammo:state.ammo,node:null,trailTimer:0,start:muzzlePosition(),impact:null};
    profile.shots++;saveProfile();renderRecords();setCallout('НАТЯЖЕНИЕ','держим раму',900);audio.creak();haptic(18);
  }
  ui.fire.addEventListener('click',fireShot);

  function createProjectile(){
    const cfg=AMMO[state.shot.ammo],g=new Node({name:'projectile'});effects.add(g);
    if(state.shot.ammo==='stone'){sphere(cfg.color,[0,0,0],[1.0,1.0,1.0],[0,0,0],g,{roughness:1});}
    else {box(cfg.color,[0,0,0],[.18,.18,3.2],[0,0,0],g,{roughness:1});node(GEO.cone,cfg.tip,[0,0,-1.95],[.45,.9,.45],[Math.PI/2,0,0],g,{emissive:state.shot.ammo==='fire'?.7:0,roughness:.25});for(const s of [-1,1])box(COLORS.woodLight,[s*.32,0,1.1],[.55,.05,.65],[0,0,s*.35],g);}
    g.position=[...state.shot.position];state.shot.node=g;loadedProjectile.visible=false;
  }
  function orientProjectile(){const s=state.shot;if(!s?.node)return;const v=s.velocity;s.node.rotation[1]=Math.atan2(v[0],-v[2]);s.node.rotation[0]=Math.atan2(v[1],Math.hypot(v[0],v[2]));}
  function pointInTarget(p,t,r=0){return Math.abs(p[0]-t.center[0])<=t.size[0]/2+r&&Math.abs(p[1]-t.center[1])<=t.size[1]/2+r&&Math.abs(p[2]-t.center[2])<=t.size[2]/2+r;}
  function nearestTarget(p,r){let best=null,d=Infinity;for(const t of targetDefs){if(t.destroyed)continue;const dd=len3(sub3(p,t.center));if(pointInTarget(p,t,r)&&dd<d){best=t;d=dd;}}return best;}

  function impactShot(target,position,ground=false){
    const s=state.shot,cfg=AMMO[s.ammo];s.phase='impact';s.timer=0;s.impact={target,position:[...position],ground};state.mode='impact';if(s.node)s.node.visible=false;
    const speed=len3(s.velocity),direct=target?Math.max(.55,1-len3(sub3(position,target.center))/(Math.max(...target.size)*1.4)):0;
    let damage=target?cfg.damage*(.65+speed/70)*direct*(target.material==='wood'?cfg.wood:cfg.stone):0;
    if(target&&target.destroyed)damage=0;damage=Math.round(damage);
    if(target){target.health=Math.max(0,target.health-damage);if(target.health===0&&!target.destroyed){target.destroyed=true;profile.destroyed++;profile.bestHit=Math.max(profile.bestHit,damage);saveProfile();renderRecords();collapseTarget(target);}else{profile.bestHit=Math.max(profile.bestHit,damage);saveProfile();renderRecords();damageTarget(target,position,damage);}}
    s.impact.damage=damage;s.impact.error=target?len3(sub3(position,target.center)):len3(sub3(position,state.selected.center));
    const wood=target?.material==='wood';audio.impact(clamp(speed/48,.7,1.5),wood);haptic(damage>80?[35,25,55]:[22,18,30]);spawnImpactFX(position,cfg,target,ground);
    ui.flash.classList.remove('active');void ui.flash.offsetWidth;ui.flash.classList.add('active');
    if(target)setCallout(damage>90?'ТЯЖЁЛОЕ ПОПАДАНИЕ':'ПОПАДАНИЕ',`${target.label} · ${damage} урона`,1500);else setCallout('ПРОМАХ','земля тоже была против замка',1300);
    updateTargetCard();
  }
  function damageTarget(t,position,damage){
    t.node.rotation[2]+=(rand()-.5)*.009*(damage/50);const local=[position[0],position[1],position[2]+2.1];const scar=box(COLORS.ash,local,[1.1+damage/90,.12,1.1+damage/90],[Math.PI/2,0,rand()*TAU],castle,{roughness:1});scar.userData.life=999;scars.push(scar);
    for(let i=0;i<Math.min(8,Math.ceil(damage/12));i++){const chip=box(t.material==='wood'?COLORS.wood:COLORS.stoneDark,add3(position,[(rand()-.5)*2,(rand()-.5)*1.5,1.8]),[.25+rand()*.4,.2+rand()*.45,.2+rand()*.35],[rand()*TAU,rand()*TAU,rand()*TAU],effects);chip.userData={velocity:[(rand()-.5)*8,3+rand()*7,2+rand()*5],life:1.5+rand(),maxLife:2.5,gravity:-9,kind:'debris',baseScale:.4};particles.push(chip);rubble.push(chip);}
    if(t.material==='wood'&&state.shot.ammo==='fire')igniteTarget(t,position);
  }
  function collapseTarget(t){
    t.node.rotation[2]=(t.center[0]>=0?-1:1)*(.08+rand()*.09);t.node.position[1]-=t.id.includes('tower')?2.8:1.2;
    for(let i=0;i<20;i++){const mat=t.material==='wood'?COLORS.wood:COLORS.stone;const size=.25+rand()*.9;const p=add3(t.center,[(rand()-.5)*t.size[0],(rand()-.5)*t.size[1],3+(rand()-.5)*3]);const chip=box(mat,p,[size,size*(.55+rand()),size],[rand()*TAU,rand()*TAU,rand()*TAU],effects);chip.userData={velocity:[(rand()-.5)*12,4+rand()*10,2+rand()*7],life:2.6+rand(),maxLife:3.6,gravity:-9.8,kind:'debris',baseScale:size};particles.push(chip);rubble.push(chip);}
    if(t.material==='wood')igniteTarget(t,t.center);
  }
  function igniteTarget(t,position){for(let i=0;i<10;i++)spawnParticle({position:add3(position,[(rand()-.5)*3,(rand()-.5)*2,2]),velocity:[(rand()-.5)*1.2,2+rand()*3,(rand()-.5)],color:i%2?[1,.22,.04]:[.9,.55,.12],scale:.22+rand()*.25,life:.7+rand()*.8,gravity:.4,alpha:.9,emissive:1.3,kind:'fire'});t.userData={...(t.userData||{}),burn:6};}
  function spawnImpactFX(position,cfg,target,ground){
    const dustColor=ground?COLORS.earth:(target?.material==='wood'?COLORS.woodLight:COLORS.stoneLight);
    for(let i=0;i<26;i++){const dir=norm3([(rand()-.5)*2,.25+rand()*1.4,.3+rand()*1.6]),speed=2+rand()*10;spawnParticle({position:add3(position,[(rand()-.5),rand()*.5,(rand()-.5)]),velocity:mul3(dir,speed),color:dustColor,scale:.22+rand()*.5,life:.6+rand()*1.4,gravity:-5,alpha:.75,kind:'dust'});}
    if(cfg.trail)igniteTarget(target||{userData:{}},position);
  }

  function showResult(){
    const s=state.shot,hit=s.impact.target,damage=s.impact.damage;state.mode='result';setGameVisible(false);ui.result.hidden=false;
    ui.resultKicker.textContent=hit?(hit.destroyed?'УЗЕЛ РАЗРУШЕН':'ПОПАДАНИЕ'):'ПРОМАХ';
    ui.resultTitle.textContent=hit?(hit.destroyed?'Крепость стала чуть менее вечной.':damage>90?'Вот теперь они заметили.':'Камень помнит.'):'Красиво. Бесполезно. Повторим.';
    ui.damageValue.textContent=damage;ui.resultTarget.textContent=hit?hit.label:'ЗЕМЛЯ';ui.resultDistance.textContent=`${Math.round(len3(sub3(s.impact.position,s.start)))} м`;ui.resultTime.textContent=`${s.flightTime.toFixed(2)} с`;ui.resultError.textContent=`${s.impact.error.toFixed(1)} м`;
  }
  ui.reload.addEventListener('click',()=>{ui.result.hidden=true;setGameVisible(true);state.mode='ready';state.shot=null;loadedProjectile.visible=true;loadedProjectile.position[2]=0;stringLeft.scale[2]=1;stringRight.scale[2]=1;turret.position[2]=-.6;state.wind=clamp(state.wind+(rand()-.5)*2.4,-6,6);ui.fire.disabled=false;updateControls();setCallout('ПЕРЕЗАРЯЖЕНО','ветер немного изменился',900);});
  ui.resultReset.addEventListener('click',()=>{resetCastle();ui.result.hidden=true;setGameVisible(true);state.mode='ready';state.shot=null;loadedProjectile.visible=true;loadedProjectile.position[2]=0;stringLeft.scale[2]=1;stringRight.scale[2]=1;turret.position[2]=-.6;updateControls();setCallout('ЗАМОК ВОССТАНОВЛЕН','осадная бюрократия творит чудеса',900);});
  function resetCastle(){for(const t of targetDefs){t.health=t.maxHealth;t.destroyed=false;t.node.position=[...t.basePosition];t.node.rotation=[0,0,0];delete t.userData;}for(const s of scars)s.visible=false;for(const r of rubble)r.visible=false;updateTargetCard();}

  function updateShot(dt){
    const s=state.shot;if(!s)return;
    if(s.phase==='charge'){
      s.timer+=dt;const t=clamp(s.timer/.9,0,1),pull=smoothstep(0,1,t);winch.rotation[0]+=dt*4;turret.position[2]=-.6+Math.sin(t*Math.PI)*.12;stringLeft.scale[2]=1-pull*.035;stringRight.scale[2]=1-pull*.035;loadedProjectile.position[2]=pull*.7;
      if(t>=1){s.phase='flight';s.timer=0;state.mode='flight';createProjectile();audio.fire();haptic(28);setCallout('ВЫСТРЕЛ','камера сопровождает снаряд',700);state.shake=.32;}
      return;
    }
    if(s.phase==='flight'){
      const cfg=AMMO[s.ammo],step=Math.min(dt,.026);s.flightTime+=step;s.velocity[0]+=state.wind*.055*cfg.wind*step;s.velocity[1]-=9.81*cfg.gravity*step;s.position=add3(s.position,mul3(s.velocity,step));s.node.position=[...s.position];orientProjectile();s.trailTimer-=step;
      if(cfg.trail&&s.trailTimer<=0){s.trailTimer=.045;spawnParticle({position:add3(s.position,[0,0,.8]),velocity:[(rand()-.5)*.4,.5+rand(),1.5],color:rand()>.5?[1,.28,.05]:[.9,.58,.12],scale:.17+rand()*.15,life:.45+rand()*.35,gravity:.1,alpha:.9,emissive:1.2,kind:'fire'});}
      const hit=nearestTarget(s.position,cfg.radius*.18);if(hit){impactShot(hit,s.position,false);return;}if(s.position[1]<=.05){impactShot(null,[s.position[0],.05,s.position[2]],true);return;}if(s.flightTime>9||s.position[2]<-145){impactShot(null,s.position,false);return;}
    } else if(s.phase==='impact'){s.timer+=dt;if(s.timer>1.45)showResult();}
  }

  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){const p=particles[i],u=p.userData;if(!p.visible||!u||!Number.isFinite(u.life)){particles.splice(i,1);continue;}u.life-=dt;if(u.life<=0){p.visible=false;particles.splice(i,1);continue;}u.velocity[1]+=u.gravity*dt;p.position=add3(p.position,mul3(u.velocity,dt));p.rotation[0]+=dt*(u.kind==='debris'?3:1);p.rotation[2]+=dt*2;const life=clamp(u.life/(u.maxLife||u.life),0,1);if(u.kind==='dust'){p.alpha=life*.72;p.scale=p.scale.map(()=>u.baseScale*(1+(1-life)*2.4));}else if(u.kind==='fire'){p.alpha=life;p.scale[0]=p.scale[2]=u.baseScale*(.65+life*.6);}else if(p.position[1]<.1){p.position[1]=.1;u.velocity=[0,0,0];u.gravity=0;p.alpha=Math.min(p.alpha,life);}}
    for(const t of targetDefs){if(t.userData?.burn>0){t.userData.burn-=dt;if(rand()<dt*8){const p=add3(t.center,[(rand()-.5)*t.size[0]*.5,rand()*t.size[1]*.35,2]);spawnParticle({position:p,velocity:[(rand()-.5)*.4,1.2+rand()*2,(rand()-.5)*.4],color:rand()>.55?[1,.25,.04]:[.85,.5,.1],scale:.15+rand()*.2,life:.45+rand()*.6,gravity:.1,alpha:.9,emissive:1.2,kind:'fire'});}}}
  }

  function updateAmbient(dt){
    for(const flag of flags){flag.userData.phase+=dt*2.4;flag.rotation[1]=Math.sin(flag.userData.phase)*.12;flag.scale[0]=1+Math.sin(flag.userData.phase*1.7)*.05;}
    for(const smoke of smokeColumns){smoke.t-=dt;if(smoke.t<=0){smoke.t=.3+rand()*.4;spawnParticle({position:[smoke.x,.5,smoke.z],velocity:[(rand()-.5)*.5,.8+rand()*1.2,(rand()-.5)*.4],color:[.22,.22,.20],scale:.55+rand()*.45,life:3+rand()*2,gravity:.05,alpha:.26,kind:'dust'});}}
  }

  function updateCamera(dt){
    let desiredPos,desiredTarget;
    if(state.mode==='flight'&&state.shot){const p=state.shot.position,v=norm3(state.shot.velocity);desiredPos=add3(p,[-v[0]*5+3,2.2,-v[2]*5+2]);desiredTarget=add3(p,mul3(v,9));renderer.camera.fov=damp(renderer.camera.fov,56*Math.PI/180,4,dt);}
    else if(state.mode==='impact'&&state.shot?.impact){const p=state.shot.impact.position;desiredPos=add3(p,[8,5,10]);desiredTarget=add3(p,[0,1,0]);renderer.camera.fov=damp(renderer.camera.fov,45*Math.PI/180,5,dt);}
    else if(state.cameraMode==='wide'){desiredPos=[29,18,30];desiredTarget=[0,9,-72];renderer.camera.fov=damp(renderer.camera.fov,48*Math.PI/180,4,dt);}
    else {desiredPos=[8.8,6.6,31];desiredTarget=[state.yaw*.45,7,-73];renderer.camera.fov=damp(renderer.camera.fov,46*Math.PI/180,4,dt);}
    const shake=state.shake;state.shake=Math.max(0,state.shake-dt*1.7);if(shake>0){desiredPos=add3(desiredPos,[(rand()-.5)*shake,(rand()-.5)*shake,(rand()-.5)*shake]);}
    renderer.camera.position=renderer.camera.position.map((v,i)=>damp(v,desiredPos[i],state.mode==='flight'?6:3.5,dt));renderer.camera.target=renderer.camera.target.map((v,i)=>damp(v,desiredTarget[i],state.mode==='flight'?8:4,dt));
  }

  let last=performance.now();
  function frame(now){
    const dt=Math.min(.045,(now-last)/1000||.016);last=now;state.time+=dt;renderer.time=state.time;setBallistaAim();updateShot(dt);updateParticles(dt);updateAmbient(dt);updateCamera(dt);renderer.render(root);if(state.mode==='ready')updateReticle();requestAnimationFrame(frame);
  }

  function init(){
    const lines=['выкатываем тяжёлую раму','поднимаем пыль над лагерем','проверяем ворота на излишнюю целостность'];let i=0;const timer=setInterval(()=>{ui.loadingText.textContent=lines[i++%lines.length];},380);
    setTimeout(()=>{clearInterval(timer);ui.loading.hidden=true;requestAnimationFrame(frame);},850);
    if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
    document.addEventListener('visibilitychange',()=>{last=performance.now();});
    updateControls();
  }
  init();
}
