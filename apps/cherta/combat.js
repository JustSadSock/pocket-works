'use strict';
function edgePoint(){
  const a=arena();let x,y,edge=Math.floor(rand(0,4));
  if(edge===0){x=rand(a.l+20,a.r-20);y=a.t+9}else if(edge===1){x=a.r-9;y=rand(a.t+20,a.b-20)}else if(edge===2){x=rand(a.l+20,a.r-20);y=a.b-9}else{x=a.l+9;y=rand(a.t+20,a.b-20)}
  return{x,y,edge}
}
function queueEnemy(type,delay=.58,options={}){
  const p=options.x==null?edgePoint():{x:options.x,y:options.y,edge:options.edge??0};
  spawnWarnings.push({type,x:p.x,y:p.y,edge:p.edge,t:delay,max:delay,options});
}
function createBoss(x,y){
  const rgen=mulberry32((runSeed^Math.imul(wave,0x9e3779b1))>>>0);
  const attackModes=['dash','burst','slam'],moveModes=['chase','orbit'];
  const attackMode=attackModes[Math.floor(rgen()*attackModes.length)],moveMode=moveModes[Math.floor(rgen()*moveModes.length)];
  const sides=5+Math.floor(rgen()*5),r=30+Math.floor(rgen()*9),speed=18+rgen()*16;
  const adjectives=['ЛОМАНАЯ','ГЛУХАЯ','КОЛЮЧАЯ','КРУЖНАЯ','РВАНАЯ','КОСАЯ'];
  return{x,y,vx:0,vy:0,r,hp:15+wave*1.7,maxHp:15+wave*1.7,speed,cd:.9+rgen()*.55,kind:'boss',boss:true,bossName:adjectives[Math.floor(rgen()*adjectives.length)]+' ПЕЧАТЬ',attackMode,moveMode,sides,inner:.54+rgen()*.28,projectileCount:5+Math.floor(rgen()*5),dashSpeed:190+rgen()*95,attackRadius:68+rgen()*34,orbitDir:rgen()<.5?-1:1,spin:rgen()*TAU,dead:false,deathT:0,deathDur:.58,hit:0,wind:0,windMax:0,attack:0,angle:0,lockedX:0,lockedY:0,seed:rgen()*99,grazed:false}
}
function spawnEnemy(type,options={}){
  const p=options.x==null?edgePoint():options,x=p.x,y=p.y,scale=1+wave*.055;
  if(type==='boss'){
    const b=createBoss(x,y);enemies.push(b);bossPhase=true;bossPending=false;callout(b.bossName);tone(58,.42,'sawtooth',.045,70);vibrate(35);inkSplash(x,y,34,'#6e2e29',.8);return b
  }
  const defs={
    stalker:{r:14,hp:2.0*scale,maxHp:2.0*scale,speed:43+wave*1.6,cd:rand(.8,1.4),kind:'stalker'},
    needle:{r:11,hp:1.55*scale,maxHp:1.55*scale,speed:31+wave,cd:rand(.5,1.1),kind:'needle'},
    brute:{r:23,hp:6.2*scale,maxHp:6.2*scale,speed:24+wave*.7,cd:1.4,kind:'brute'},
    eraser:{r:16,hp:3.2*scale,maxHp:3.2*scale,speed:35+wave*.8,cd:1.1,kind:'eraser',eraseT:0}
  };
  const e={x,y,vx:0,vy:0,dead:false,deathT:0,deathDur:.28,hit:0,wind:0,windMax:0,attack:0,angle:0,lockedX:0,lockedY:0,seed:Math.random()*99,grazed:false,...defs[type]};enemies.push(e);
  inkSplash(x,y,type==='brute'?18:10,'#a94738',.45);return e
}
function inkSplash(x,y,n=8,color='#202421',life=.45){n=reducedMotion?Math.ceil(n*.35):n;for(let i=0;i<n;i++){const a=rand(0,TAU),s=rand(10,65);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rand(1,4),life,max:life,color,drag:3})}}
function inwardInk(x,y){for(let i=0;i<(reducedMotion?5:14);i++){const a=i*TAU/14+rand(-.16,.16),d=rand(34,62);particles.push({x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,vx:-Math.cos(a)*rand(40,70),vy:-Math.sin(a)*rand(40,70),r:rand(1.3,3.2),life:.65,max:.65,color:'#202421',drag:1.8})}}
function slashParticles(x1,y1,x2,y2,color='#202421'){const len=dist(x1,y1,x2,y2),n=reducedMotion?4:Math.max(7,Math.floor(len/17));for(let i=0;i<n;i++){const t=Math.random(),x=lerp(x1,x2,t),y=lerp(y1,y2,t),a=Math.atan2(y2-y1,x2-x1)+Math.PI/2;particles.push({x,y,vx:Math.cos(a)*rand(-24,24),vy:Math.sin(a)*rand(-24,24),r:rand(.7,2.2),life:.28,max:.28,color,drag:4})}}
function addPaperMark(x,y,size=12,type='stain'){paperMarks.push({x,y,size,rot:rand(-.5,.5),alpha:rand(.07,.15),type,wave});if(paperMarks.length>30)paperMarks.shift()}
function addStamp(text,x=W*.5,y=H*.34,life=.9,permanent=false){stamps.push({text,x,y,life,max:life,permanent,rot:rand(-.09,.09)});if(stamps.length>10)stamps.shift()}
function dangerCue(e,d){if(d>145||e.dangerCued)return;e.dangerCued=true;dangerSlow=Math.max(dangerSlow,.11);dangerPulse=Math.max(dangerPulse,.22);tone(95,.07,'square',.018,35);vibrate(7)}
function beginDash(dx,dy){
  if(!running||paused||gameOver||player.dashing||player.detonating||player.charges<=0)return false;
  const len=Math.hypot(dx,dy);if(len<12)return false;const a=arena(),d=clamp(len*1.15,45,124),nx=dx/len,ny=dy/len;
  player.fromX=player.x;player.fromY=player.y;player.toX=clamp(player.x+nx*d,a.l+player.r,a.r-player.r);player.toY=clamp(player.y+ny*d,a.t+player.r,a.b-player.r);player.dashT=0;player.dashId++;player.dashing=true;player.focus=false;player.invuln=.24;player.charges--;tone(185,.07,'triangle',.025,180);hiss(.06,.012);vibrate(8);return true
}
function finishDash(){
  player.dashing=false;player.x=player.toX;player.y=player.toY;
  const ordinal=3-player.charges,line={x1:player.fromX,y1:player.fromY,x2:player.toX,y2:player.toY,age:0,cut:false,ordinal,power:ordinal===3?1.28:1,erase:0,graze:player.grazes>0};
  player.lines.push(line);player.comboTimer=.95;slashParticles(line.x1,line.y1,line.x2,line.y2,ordinal===3?'#a94738':'#202421');
  if(ordinal===3){flash=Math.max(flash,.08);tone(235,.08,'square',.02,115)}
  if(player.charges<=0){queuedDash=null;setTimeout(()=>{if(running&&!gameOver&&!paused)detonate()},80)}
  else if(queuedDash){const next=queuedDash;queuedDash=null;requestAnimationFrame(()=>{if(running&&!paused&&!gameOver&&!player.dashing&&!player.detonating&&player.charges>0)beginDash(next.dx,next.dy)})}
  else if(pointer.down){player.focus=true}
  updateUI();
}
function collectIntersections(lines){const pts=[];for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){const p=segmentIntersection(lines[i],lines[j]);if(p&&!pts.some(q=>dist(p.x,p.y,q.x,q.y)<12))pts.push(p)}return pts}
function detonate(){
  if(player.detonating||!player.lines.length)return;player.detonating=true;player.comboTimer=0;queuedDash=null;
  const lines=player.lines.map(l=>({...l,graze:l.graze||player.grazes>0})),points=collectIntersections(lines);player.lines=[];
  lines.forEach((l,i)=>cutQueue.push({t:i*.095,line:l}));points.forEach((p,i)=>cutQueue.push({t:lines.length*.095+i*.075+.02,point:p}));cutQueue.push({t:lines.length*.095+points.length*.075+.12,finish:true});
  tone(110,.16,'sawtooth',.03,250);updateUI();
}
function performCut(l){
  let hitCount=0,cutKills=0;flash=Math.max(flash,l.ordinal===3?.23:.16);shake=Math.max(shake,l.ordinal===3?7:5);slashParticles(l.x1,l.y1,l.x2,l.y2,l.graze?'#4e6970':'#a94738');
  const damage=1.45*l.power+(l.graze?.25:0);
  for(const e of enemies){if(e.dead)continue;const d=segDist(e.x,e.y,l.x1,l.y1,l.x2,l.y2);if(d<e.r+(l.ordinal===3?11:8)){if(damageEnemy(e,damage,l))cutKills++;hitCount++}}
  bestCut=Math.max(bestCut,cutKills);score+=hitCount*5*Math.max(1,hitCount)+cutKills*cutKills*7;
  if(cutKills>=2){const words=['','ОДИН','ДВОЕ','ТРОЕ','ЧЕТВЕРО','ПЯТЕРО'];callout((words[Math.min(cutKills,5)]||cutKills)+' ОДНОЙ ЧЕРТОЙ');addStamp('×'+cutKills,W*.5,H*.31,.72)}
  tone(290+hitCount*45+(l.ordinal===3?70:0),.075,'square',.028,-110);hiss(.09,.02);vibrate(hitCount>=2?24:13);
}
function performIntersection(p){
  intersectionFx.push({x:p.x,y:p.y,life:.34,max:.34});let hits=0;
  for(const e of enemies){if(e.dead)continue;if(dist(e.x,e.y,p.x,p.y)<e.r+34){damageEnemy(e,.95,null);hits++}}
  if(hits){score+=hits*9;callout('ПЕРЕСЕЧЕНИЕ');shake=Math.max(shake,7);tone(480,.09,'triangle',.03,-180);vibrate(18)}
}
function damageEnemy(e,dmg,line=null){if(e.dead)return false;e.hp-=dmg;e.hit=.18;if(line){const a=Math.atan2(line.y2-line.y1,line.x2-line.x1);e.vx+=Math.cos(a)*32;e.vy+=Math.sin(a)*32}inkSplash(e.x,e.y,5,'#a94738',.3);if(e.hp<=0){killEnemy(e);return true}return false}
function healPlayer(){if(player.hp>=player.maxHp)return;player.hp++;healPulse=.7;inwardInk(player.x,player.y);callout('ЧЕРНИЛА СОБРАНЫ');tone(330,.24,'sine',.03,180);vibrate(18);updateUI()}
function killEnemy(e){
  if(e.dead)return;e.dead=true;e.deathT=e.deathDur;e.hit=0;e.wind=0;e.attack=0;e.cd=Infinity;e.grazed=true;
  const value=e.boss?260:e.kind==='brute'?45:e.kind==='eraser'?28:e.kind==='needle'?18:14;kills++;score+=value;
  inkSplash(e.x,e.y,e.boss?44:e.kind==='brute'?28:14,e.boss?'#202421':'#7a3029',e.boss?.9:.62);addPaperMark(e.x,e.y,e.boss?32:e.r*.72,e.boss?'seal':'stain');shake=Math.max(shake,e.boss?16:e.kind==='brute'?11:5);
  tone(e.boss?54:e.kind==='brute'?70:130,e.boss?.32:.14,'sawtooth',e.boss?.055:.035,e.boss?120:e.kind==='brute'?70:110);
  if(e.boss){bossesKilled++;bossPhase=false;bossPending=false;waveClock=15.35;addStamp('破',e.x,e.y,3.5,true);callout('ПЕЧАТЬ РАЗБИТА');if(player.hp<player.maxHp)healPlayer()}
  else if(kills%6===0)healPlayer();updateUI();
}
function hurtPlayer(){if(player.invuln>0||gameOver)return;player.hp--;player.invuln=1.0;player.hitFlash=.35;shake=13;flash=.35;inkSplash(player.x,player.y,18,'#202421',.5);tone(85,.24,'sawtooth',.055,-30);vibrate(40);callout('ПРОПУЩЕНО',true);updateUI();if(player.hp<=0)endGame()}
function graze(obj){if(obj.grazed)return;obj.grazed=true;player.grazes=Math.min(4,player.grazes+1);totalGrazes++;score+=8;grazePulse=.32;inkSplash(player.x,player.y,9,'#4e6970',.35);callout('ЧИСТО');tone(510,.07,'sine',.022,160);vibrate(9)}
function eraseNearestLine(e,dt){
  if(!player.lines.length)return false;let bestLine=null,bestD=Infinity,index=-1;
  player.lines.forEach((l,i)=>{const mx=(l.x1+l.x2)/2,my=(l.y1+l.y2)/2,d=dist(e.x,e.y,mx,my);if(d<bestD){bestD=d;bestLine=l;index=i}});
  if(!bestLine)return false;const tx=(bestLine.x1+bestLine.x2)/2,ty=(bestLine.y1+bestLine.y2)/2,dx=tx-e.x,dy=ty-e.y,d=Math.max(.01,Math.hypot(dx,dy));
  if(d>e.r+10){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;e.eraseT=0}else{e.eraseT+=dt;bestLine.erase=clamp(e.eraseT/.72,0,1);if(e.eraseT>=.72){player.lines.splice(index,1);player.charges=Math.min(3,player.charges+1);e.eraseT=0;callout('ЧЕРТА СТЁРТА',true);tone(74,.13,'square',.025,-20);updateUI()}}return true
}
function bossLogic(e,dt,dx,dy,d,nx,ny){
  e.spin+=dt*(.35+e.speed*.015);e.cd-=dt;
  if(e.wind>0){e.wind-=dt;if(e.wind<=0){
    if(e.attackMode==='burst'){const base=e.spin;for(let i=0;i<e.projectileCount;i++){const a=base+i*TAU/e.projectileCount;projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*(175+wave*3),vy:Math.sin(a)*(175+wave*3),r:5,life:3.2,grazed:false})}tone(88,.18,'sawtooth',.04,130)}
    else if(e.attackMode==='dash'){e.attack=.36;e.angle=Math.atan2(e.lockedY-e.y,e.lockedX-e.x);tone(72,.14,'square',.04,90)}
    else{e.attack=.14;shake=Math.max(shake,8);tone(63,.2,'sawtooth',.045,40)}
  }}else if(e.attack>0){e.attack-=dt;if(e.attackMode==='dash'){e.x+=Math.cos(e.angle)*e.dashSpeed*dt;e.y+=Math.sin(e.angle)*e.dashSpeed*dt;if(dist(e.x,e.y,player.x,player.y)<e.r+player.r+4){if(player.invuln>0)graze(e);else hurtPlayer()}}
    else if(e.attackMode==='slam'&&e.attack<=0&&d<e.attackRadius){if(player.invuln>0)graze(e);else hurtPlayer()}
  }else if(e.cd<=0){e.windMax=e.attackMode==='slam'?.78:e.attackMode==='burst'?.68:.56;e.wind=e.windMax;e.lockedX=player.x;e.lockedY=player.y;e.cd=1.15+Math.random()*.65;dangerCue(e,d)}
  else if(e.moveMode==='orbit'){const desired=145,radial=d>desired+18?1:d<desired-18?-1:0;e.x+=(nx*radial-ny*e.orbitDir*.72)*e.speed*dt;e.y+=(ny*radial+nx*e.orbitDir*.72)*e.speed*dt}
  else{e.x+=nx*e.speed*dt;e.y+=ny*e.speed*dt}
}
function enemyLogic(e,dt){
  if(e.dead)return;e.hit=Math.max(0,e.hit-dt);const dx=player.x-e.x,dy=player.y-e.y,d=Math.max(.01,Math.hypot(dx,dy)),nx=dx/d,ny=dy/d;e.dangerCued=false;
  if(e.boss){bossLogic(e,dt,dx,dy,d,nx,ny)}
  else if(e.kind==='eraser'){
    if(!eraseNearestLine(e,dt)){e.cd-=dt;if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.attack=.14;dangerCue(e,d)}}else if(e.attack>0){e.attack-=dt;if(e.attack<=0&&d<62){if(player.invuln>0)graze(e);else hurtPlayer()}}else if(d<70&&e.cd<=0){e.windMax=.55;e.wind=.55;e.cd=1.6;dangerCue(e,d)}else{e.x+=nx*e.speed*dt;e.y+=ny*e.speed*dt}}
  }else{e.cd-=dt;if(e.kind==='stalker'){
    if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.attack=.18;e.angle=Math.atan2(e.lockedY-e.y,e.lockedX-e.x);tone(120,.08,'square',.02,80)}}
    else if(e.attack>0){e.attack-=dt;e.x+=Math.cos(e.angle)*210*dt;e.y+=Math.sin(e.angle)*210*dt;if(dist(e.x,e.y,player.x,player.y)<e.r+player.r+3){if(player.invuln>0)graze(e);else hurtPlayer()}}
    else if(d<84&&e.cd<=0){e.windMax=.48;e.wind=.48;e.lockedX=player.x;e.lockedY=player.y;e.cd=1.3+rand(.1,.55);dangerCue(e,d)}else{e.x+=nx*e.speed*dt;e.y+=ny*e.speed*dt}
  }else if(e.kind==='needle'){
    if(e.wind>0){e.wind-=dt;if(e.wind<=0){const a=Math.atan2(e.lockedY-e.y,e.lockedX-e.x);projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*(235+wave*4),vy:Math.sin(a)*(235+wave*4),r:4,life:3,grazed:false});tone(380,.06,'triangle',.018,-160)}}
    else if(e.cd<=0){e.windMax=.62;e.wind=.62;e.lockedX=player.x;e.lockedY=player.y;e.cd=2.05+rand(0,.55);dangerCue(e,d)}
    else{const desired=165,dir=d>desired+18?1:d<desired-18?-1:0;e.x+=nx*e.speed*dir*dt;e.y+=ny*e.speed*dir*dt;e.x+=-ny*Math.sin(e.seed+performance.now()/900)*11*dt;e.y+=nx*Math.sin(e.seed+performance.now()/900)*11*dt}
  }else{
    if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.attack=.20;shake=Math.max(shake,7);tone(75,.16,'sawtooth',.04,30)}}
    else if(e.attack>0){e.attack-=dt;if(e.attack<=0&&d<80){if(player.invuln>0)graze(e);else hurtPlayer()}}
    else if(d<92&&e.cd<=0){e.windMax=.75;e.wind=.75;e.cd=2.0;dangerCue(e,d)}else{e.x+=nx*e.speed*dt;e.y+=ny*e.speed*dt}
  }}
  const a=arena();e.x=clamp(e.x,a.l+e.r,a.r-e.r);e.y=clamp(e.y,a.t+e.r,a.b-e.r)
}
