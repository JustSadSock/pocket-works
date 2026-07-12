'use strict';
function spawnEnemy(type){
  const a=arena();let x,y,edge=Math.floor(rand(0,4));if(edge===0){x=rand(a.l+15,a.r-15);y=a.t+8}else if(edge===1){x=a.r-8;y=rand(a.t+15,a.b-15)}else if(edge===2){x=rand(a.l+15,a.r-15);y=a.b-8}else{x=a.l+8;y=rand(a.t+15,a.b-15)}
  const scale=1+wave*.055;
  const defs={
    stalker:{r:14,hp:2.0*scale,speed:43+wave*1.6,cd:rand(.8,1.4),kind:'stalker'},
    needle:{r:11,hp:1.55*scale,speed:31+wave,cd:rand(.5,1.1),kind:'needle'},
    brute:{r:23,hp:6.2*scale,speed:24+wave*.7,cd:1.4,kind:'brute'}
  };
  const e={x,y,vx:0,vy:0,dead:false,deathT:0,deathDur:.28,hit:0,wind:0,attack:0,angle:0,lockedX:0,lockedY:0,seed:Math.random()*99,...defs[type]};enemies.push(e);
  inkSplash(x,y,type==='brute'?18:9,'#a94738',.45);
}
function inkSplash(x,y,n=8,color='#202421',life=.45){n=reducedMotion?Math.ceil(n*.35):n;for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(10,65);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rand(1,4),life,max:life,color,drag:3})}}
function slashParticles(x1,y1,x2,y2,color='#202421'){const len=dist(x1,y1,x2,y2),n=reducedMotion?4:Math.max(7,Math.floor(len/17));for(let i=0;i<n;i++){const t=Math.random(),x=lerp(x1,x2,t),y=lerp(y1,y2,t),a=Math.atan2(y2-y1,x2-x1)+Math.PI/2;particles.push({x,y,vx:Math.cos(a)*rand(-24,24),vy:Math.sin(a)*rand(-24,24),r:rand(.7,2.2),life:.28,max:.28,color,drag:4})}}
function beginDash(dx,dy){
  if(!running||paused||gameOver||player.dashing||player.detonating||player.charges<=0)return false;
  const len=Math.hypot(dx,dy);if(len<12)return false;const a=arena(),d=clamp(len*1.15,45,124),nx=dx/len,ny=dy/len;
  player.fromX=player.x;player.fromY=player.y;player.toX=clamp(player.x+nx*d,a.l+player.r,a.r-player.r);player.toY=clamp(player.y+ny*d,a.t+player.r,a.b-player.r);player.dashT=0;player.dashId++;player.dashing=true;player.focus=false;player.invuln=.24;player.charges--;tone(185,.07,'triangle',.025,180);hiss(.06,.012);vibrate(8);return true
}
function finishDash(){
  player.dashing=false;player.x=player.toX;player.y=player.toY;player.lines.push({x1:player.fromX,y1:player.fromY,x2:player.toX,y2:player.toY,age:0,cut:false});player.comboTimer=.95;
  slashParticles(player.fromX,player.fromY,player.toX,player.toY,'#202421');
  if(player.charges<=0){
    queuedDash=null;
    setTimeout(()=>{if(running&&!gameOver&&!paused)detonate()},80);
  }else if(queuedDash){
    const next=queuedDash;queuedDash=null;
    requestAnimationFrame(()=>{if(running&&!paused&&!gameOver&&!player.dashing&&!player.detonating&&player.charges>0)beginDash(next.dx,next.dy)});
  }else if(pointer.down){
    player.focus=true;
  }
  updateUI();
}
function detonate(){
  if(player.detonating||!player.lines.length)return;player.detonating=true;player.comboTimer=0;queuedDash=null;const lines=player.lines.map(l=>({...l}));player.lines=[];
  lines.forEach((l,i)=>cutQueue.push({t:i*.095,line:l}));cutQueue.push({t:lines.length*.095+.09,finish:true});tone(110,.16,'sawtooth',.03,250);updateUI();
}
function performCut(l){
  let hitCount=0;flash=Math.max(flash,.16);shake=Math.max(shake,5);slashParticles(l.x1,l.y1,l.x2,l.y2,'#a94738');
  for(const e of enemies){if(e.dead)continue;const d=segDist(e.x,e.y,l.x1,l.y1,l.x2,l.y2);if(d<e.r+8){damageEnemy(e,1.45+(player.grazes>0?.25:0),l);hitCount++}}
  score+=hitCount*5*Math.max(1,hitCount);if(hitCount>=2)callout(hitCount+' ЗА ОДНУ');tone(290+hitCount*45,.075,'square',.028,-110);hiss(.09,.02);vibrate(hitCount>=2?24:13);
}
function damageEnemy(e,dmg,line=null){if(e.dead)return;e.hp-=dmg;e.hit=.18;if(line){const a=Math.atan2(line.y2-line.y1,line.x2-line.x1);e.vx+=Math.cos(a)*32;e.vy+=Math.sin(a)*32}inkSplash(e.x,e.y,5,'#a94738',.3);if(e.hp<=0)killEnemy(e)}
function killEnemy(e){
  if(e.dead)return;
  e.dead=true;e.deathT=e.deathDur;e.hit=0;e.wind=0;e.attack=0;e.cd=Infinity;e.grazed=true;
  kills++;score+=e.kind==='brute'?45:e.kind==='needle'?18:14;inkSplash(e.x,e.y,e.kind==='brute'?28:14,'#7a3029',.62);shake=Math.max(shake,e.kind==='brute'?11:5);tone(e.kind==='brute'?70:130,.14,'sawtooth',.035,e.kind==='brute'?70:110);if(kills%6===0&&player.hp<player.maxHp){player.hp++;callout('ЧЕРНИЛА СТЯНУЛИСЬ');}updateUI()
}
function hurtPlayer(){if(player.invuln>0||gameOver)return;player.hp--;player.invuln=1.0;player.hitFlash=.35;shake=13;flash=.35;inkSplash(player.x,player.y,18,'#202421',.5);tone(85,.24,'sawtooth',.055,-30);vibrate(40);callout('ПРОПУЩЕНО',true);updateUI();if(player.hp<=0)endGame()}
function graze(obj){if(obj.grazed)return;obj.grazed=true;player.grazes=Math.min(4,player.grazes+1);score+=8;callout('ЧИСТО');tone(510,.07,'sine',.022,160);vibrate(9)}
function enemyLogic(e,dt){
  if(e.dead)return;e.hit=Math.max(0,e.hit-dt);const dx=player.x-e.x,dy=player.y-e.y,d=Math.max(.01,Math.hypot(dx,dy)),nx=dx/d,ny=dy/d;
  e.cd-=dt;
  if(e.kind==='stalker'){
    if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.attack=.18;e.angle=Math.atan2(e.lockedY-e.y,e.lockedX-e.x);tone(120,.08,'square',.02,80)}}
    else if(e.attack>0){e.attack-=dt;e.x+=Math.cos(e.angle)*210*dt;e.y+=Math.sin(e.angle)*210*dt;if(dist(e.x,e.y,player.x,player.y)<e.r+player.r+3){if(player.invuln>0)graze(e);else hurtPlayer()}}
    else if(d<84&&e.cd<=0){e.wind=.48;e.lockedX=player.x;e.lockedY=player.y;e.cd=1.3+rand(.1,.55)}
    else{e.x+=nx*e.speed*dt;e.y+=ny*e.speed*dt}
  }else if(e.kind==='needle'){
    if(e.wind>0){e.wind-=dt;if(e.wind<=0){const a=Math.atan2(e.lockedY-e.y,e.lockedX-e.x);projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*(235+wave*4),vy:Math.sin(a)*(235+wave*4),r:4,life:3,grazed:false});tone(380,.06,'triangle',.018,-160)}}
    else if(e.cd<=0){e.wind=.62;e.lockedX=player.x;e.lockedY=player.y;e.cd=2.05+rand(0,.55)}
    else{const desired=165,dir=d>desired+18?1:d<desired-18?-1:0;e.x+=nx*e.speed*dir*dt;e.y+=ny*e.speed*dir*dt;e.x+=-ny*Math.sin(e.seed+performance.now()/900)*11*dt;e.y+=nx*Math.sin(e.seed+performance.now()/900)*11*dt}
  }else{
    if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.attack=.20;shake=Math.max(shake,7);tone(75,.16,'sawtooth',.04,30)}}
    else if(e.attack>0){e.attack-=dt;if(e.attack<=0&&d<80){if(player.invuln>0)graze(e);else hurtPlayer()}}
    else if(d<92&&e.cd<=0){e.wind=.75;e.cd=2.0}else{e.x+=nx*e.speed*dt;e.y+=ny*e.speed*dt}
  }
  const a=arena();e.x=clamp(e.x,a.l+e.r,a.r-e.r);e.y=clamp(e.y,a.t+e.r,a.b-e.r)
}
