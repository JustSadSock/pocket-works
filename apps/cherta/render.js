'use strict';
function waveLabel(style){return{rush:'НАТИСК',needle:'ИГЛЫ',heavy:'ТЯЖЁЛЫЕ',mixed:'СМЕШЕНИЕ'}[style]||'КРУГ'}
function advanceWave(){
  wave++;waveClock=0;bestWave=Math.max(bestWave,wave);localStorage.setItem('pocket-works:cherta:bestWave',bestWave);waveStyle=styleForWave(wave);addPaperMark(W*.5,rand(130,H-150),rand(80,150),'crease');
  if(wave%5===0){bossPending=true;spawnClock=.4;callout('ПЕЧАТЬ СОБИРАЕТСЯ');tone(82,.3,'sawtooth',.035,55)}else{callout(waveLabel(waveStyle)+' · '+(ROMAN[wave-1]||wave));tone(170,.2,'sine',.03,160)}
}
function chooseSpawnType(){
  if(wave>=3&&Math.random()<.105&&!enemies.some(e=>e.kind==='eraser'&&!e.dead))return'eraser';
  const r=Math.random();if(waveStyle==='rush')return r<.82?'stalker':'needle';if(waveStyle==='needle')return r<.62?'needle':'stalker';if(waveStyle==='heavy')return r<.42&&!enemies.some(e=>e.kind==='brute'&&!e.dead)?'brute':'stalker';
  if(r<Math.min(.17+.025*wave,.4))return'needle';if(wave%4===0&&Math.random()<.28&&!enemies.some(e=>e.kind==='brute'&&!e.dead))return'brute';return'stalker'
}
function spawnInterval(){const base=Math.max(.72,2.15-wave*.065);return base*(waveStyle==='rush'?.72:waveStyle==='heavy'?1.18:1)+rand(0,.48)}
function updateAmbient(dt){
  shake=Math.max(0,shake-dt*35);flash=Math.max(0,flash-dt*2.3);dangerSlow=Math.max(0,dangerSlow-dt);dangerPulse=Math.max(0,dangerPulse-dt*2.7);healPulse=Math.max(0,healPulse-dt*1.4);grazePulse=Math.max(0,grazePulse-dt*2.5);
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-p.drag*dt);p.vy*=Math.exp(-p.drag*dt);p.life-=dt}
  for(const e of enemies){if(!e.dead)continue;e.deathT-=dt;e.x+=e.vx*dt;e.y+=e.vy*dt;e.vx*=Math.exp(-7*dt);e.vy*=Math.exp(-7*dt)}
  for(const s of stamps)if(!s.permanent)s.life-=dt;for(const x of intersectionFx)x.life-=dt;
  particles=particles.filter(p=>p.life>0);enemies=enemies.filter(e=>!e.dead||e.deathT>0);stamps=stamps.filter(s=>s.permanent||s.life>0);intersectionFx=intersectionFx.filter(x=>x.life>0);
}
function update(dt){
  updateAmbient(dt);if(!running||paused||gameOver)return;
  const focusScale=player.focus&&!player.dashing?.16:1,dangerScale=dangerSlow>0?.42:1,scaled=dt*Math.min(focusScale,dangerScale);timeScale=scaled/dt;
  score+=scaled*.8;if(!bossPhase&&!bossPending)waveClock+=scaled;spawnClock-=scaled;player.invuln=Math.max(0,player.invuln-scaled);player.hitFlash=Math.max(0,player.hitFlash-scaled);
  if(waveClock>16)advanceWave();
  const alive=enemies.filter(e=>!e.dead).length;
  if(bossPending&&alive===0&&spawnWarnings.length===0){const a=arena();queueEnemy('boss',.85,{x:W*.5,y:a.t+44,edge:0})}
  const maxEnemies=Math.min(11,2+Math.floor(wave*.72));
  if(!bossPending&&!bossPhase&&spawnClock<=0&&alive+spawnWarnings.length<maxEnemies){queueEnemy(chooseSpawnType(),.52);spawnClock=spawnInterval()}
  for(const w of spawnWarnings){w.t-=scaled;if(w.t<=0&&!w.done){w.done=true;spawnEnemy(w.type,{...w.options,x:w.x,y:w.y,edge:w.edge})}}
  spawnWarnings=spawnWarnings.filter(w=>!w.done);
  if(player.dashing){player.dashT+=dt;const t=clamp(player.dashT/player.dashDur,0,1),q=ease(t);player.x=lerp(player.fromX,player.toX,q);player.y=lerp(player.fromY,player.toY,q);for(const e of enemies){if(!e.dead&&segDist(e.x,e.y,player.fromX,player.fromY,player.x,player.y)<e.r+player.r&&e.dashStamp!==player.dashId){damageEnemy(e,.34);e.dashStamp=player.dashId}}if(t>=1)finishDash()}
  else if(player.lines.length&&!player.detonating){player.comboTimer-=scaled;if(player.comboTimer<=0)detonate()}
  for(const e of enemies)enemyLogic(e,scaled);
  for(const p of projectiles){p.x+=p.vx*scaled;p.y+=p.vy*scaled;p.life-=scaled;const d=dist(p.x,p.y,player.x,player.y);if(d<p.r+player.r+2){if(player.invuln>0){graze(p);p.life=0}else{hurtPlayer();p.life=0}}}
  for(const q of cutQueue)q.t-=dt;for(const q of cutQueue.filter(q=>q.t<=0&&!q.done)){q.done=true;if(q.finish){player.detonating=false;player.charges=3;player.grazes=0;updateUI()}else if(q.point)performIntersection(q.point);else performCut(q.line)}
  cutQueue=cutQueue.filter(q=>!q.done);projectiles=projectiles.filter(p=>p.life>0);updateUI();
}
function drawPaper(){
  const age=clamp((wave-1)/18,0,1);ctx.fillStyle=`rgb(${233-age*12},${225-age*13},${207-age*15})`;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(32,36,33,.07)';ctx.lineWidth=1;for(let y=96;y<H-96;y+=34){ctx.beginPath();ctx.moveTo(17,y+.5);ctx.lineTo(W-17,y+.5);ctx.stroke()}
  ctx.strokeStyle='rgba(169,71,56,.16)';ctx.beginPath();ctx.moveTo(46,92);ctx.lineTo(46,H-104);ctx.stroke();
  for(const m of paperMarks){ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.rot);ctx.globalAlpha=m.alpha;if(m.type==='crease'){ctx.strokeStyle='#202421';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-m.size,0);ctx.quadraticCurveTo(0,5,m.size,0);ctx.stroke()}else if(m.type==='seal'){ctx.strokeStyle='#6e2e29';ctx.lineWidth=3;ctx.strokeRect(-m.size*.55,-m.size*.55,m.size*1.1,m.size*1.1)}else{ctx.fillStyle='#6e2e29';ctx.beginPath();ctx.ellipse(0,0,m.size,m.size*.42,0,0,TAU);ctx.fill()}ctx.restore()}
  const a=arena();ctx.strokeStyle='rgba(32,36,33,.45)';ctx.setLineDash([4,7]);ctx.strokeRect(a.l+.5,a.t+.5,a.r-a.l,a.b-a.t);ctx.setLineDash([])
}
function drawLine(l,alpha=1){
  const erase=clamp(l.erase||0,0,1);ctx.save();ctx.globalAlpha=alpha*(1-erase*.72);ctx.strokeStyle=l.graze?'#4e6970':'#202421';ctx.lineCap='round';ctx.lineWidth=l.ordinal===3?5.2:3.2;ctx.setLineDash(erase>0?[5+erase*5,3+erase*7]:[]);ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle=l.ordinal===3?'rgba(169,71,56,.95)':'rgba(169,71,56,.72)';ctx.lineWidth=l.ordinal===3?1.8:1;ctx.beginPath();ctx.moveTo(l.x1+2,l.y1-1);ctx.lineTo(l.x2+2,l.y2-1);ctx.stroke();ctx.restore()
}
function drawAim(){if(!pointer.down||!player.focus)return;const dx=pointer.x-pointer.sx,dy=pointer.y-pointer.sy,len=Math.hypot(dx,dy);if(len<4)return;const d=clamp(len*1.15,45,124),nx=dx/len,ny=dy/len,a=arena(),tx=clamp(player.x+nx*d,a.l+player.r,a.r-player.r),ty=clamp(player.y+ny*d,a.t+player.r,a.b-player.r);ctx.save();ctx.strokeStyle='rgba(32,36,33,.43)';ctx.setLineDash([3,7]);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=player.charges===1?'rgba(169,71,56,.34)':'rgba(169,71,56,.22)';ctx.beginPath();ctx.arc(tx,ty,12+Math.sin(performance.now()/90)*2,0,TAU);ctx.fill();ctx.restore()}
function drawSpawnWarning(w){const p=1-w.t/w.max,pulse=.55+.45*Math.sin(performance.now()/55);ctx.save();ctx.translate(w.x,w.y);ctx.globalAlpha=.25+.7*p;ctx.strokeStyle=w.type==='boss'?'#202421':'#a94738';ctx.lineWidth=w.type==='boss'?4:2;ctx.beginPath();ctx.arc(0,0,(w.type==='boss'?34:15)*(1-p*.35)+pulse*2,0,TAU*p);ctx.stroke();ctx.fillStyle=`rgba(169,71,56,${.08+.14*p})`;ctx.beginPath();ctx.arc(0,0,w.type==='boss'?29:10,0,TAU);ctx.fill();ctx.restore()}
function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);const hit=e.hit>0;ctx.rotate(e.boss?e.spin:Math.sin(e.seed*7)*.08);
  if(e.dead){const p=clamp(e.deathT/e.deathDur,0,1);ctx.globalAlpha=p;ctx.scale(.72+.28*p,.72+.28*p);ctx.rotate((1-p)*.5)}
  if(!e.dead&&e.wind>0){const p=1-e.wind/(e.windMax||.5);ctx.strokeStyle=`rgba(169,71,56,${.25+.65*p})`;ctx.lineWidth=e.boss?4:2;ctx.beginPath();ctx.arc(0,0,e.boss&&e.attackMode==='slam'?e.attackRadius:e.kind==='brute'?75:e.kind==='needle'?e.r+10:e.r+13,0,TAU*p);ctx.stroke();if(e.kind==='needle'||e.attackMode==='dash'){ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(e.lockedX-e.x,e.lockedY-e.y);ctx.stroke();ctx.setLineDash([])}}
  ctx.fillStyle=hit?'#202421':'#a94738';ctx.strokeStyle='#6e2e29';ctx.lineWidth=2;
  if(e.boss){ctx.beginPath();for(let i=0;i<e.sides*2;i++){const a=i*TAU/(e.sides*2),r=i%2?e.r*e.inner:e.r;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e9e1cf';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r*.38,0,TAU);ctx.stroke();ctx.rotate(-e.spin);ctx.fillStyle='#202421';ctx.fillRect(-e.r,-e.r-13,e.r*2,4);ctx.fillStyle='#a94738';ctx.fillRect(-e.r,-e.r-13,e.r*2*clamp(e.hp/e.maxHp,0,1),4)}
  else if(e.kind==='stalker'){ctx.rotate(Math.PI/4);ctx.fillRect(-e.r*.72,-e.r*.72,e.r*1.44,e.r*1.44);ctx.strokeRect(-e.r*.72,-e.r*.72,e.r*1.44,e.r*1.44);ctx.fillStyle='#e9e1cf';ctx.fillRect(-2,-7,4,14);ctx.fillRect(-7,-2,14,4)}
  else if(e.kind==='needle'){ctx.beginPath();ctx.moveTo(0,-e.r-3);ctx.lineTo(e.r,e.r);ctx.lineTo(-e.r,e.r);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#e9e1cf';ctx.fillRect(-1,-5,2,10)}
  else if(e.kind==='eraser'){ctx.rotate(-.18);ctx.fillRect(-e.r,-e.r*.58,e.r*2,e.r*1.16);ctx.strokeRect(-e.r,-e.r*.58,e.r*2,e.r*1.16);ctx.fillStyle='#e9e1cf';ctx.fillRect(-e.r*.72,-2,e.r*1.44,4)}
  else{ctx.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8+(i%2?.16:0),r=i%2?e.r*.78:e.r;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e9e1cf';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r*.42,0,TAU);ctx.stroke()}
  ctx.restore()
}
function drawPlayer(){
  ctx.save();ctx.translate(player.x,player.y);const a=player.dashing?Math.atan2(player.toY-player.fromY,player.toX-player.fromX):0;ctx.rotate(a+Math.PI/4);
  if(player.invuln>0||grazePulse>0){ctx.strokeStyle=`rgba(78,105,112,${.25+Math.sin(performance.now()/45)*.22})`;ctx.lineWidth=2;ctx.strokeRect(-15,-15,30,30)}
  if(healPulse>0){ctx.strokeStyle=`rgba(32,36,33,${healPulse*.45})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,14+(1-healPulse)*20,0,TAU);ctx.stroke()}
  ctx.fillStyle=player.hitFlash>0?'#a94738':'#202421';ctx.fillRect(-8,-8,16,16);ctx.fillStyle='#e9e1cf';ctx.fillRect(-2,-10,4,20);ctx.restore()
}
function drawProjectile(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillStyle='#a94738';ctx.fillRect(-8,-2,16,4);ctx.restore()}
function drawFx(){
  for(const x of intersectionFx){const p=x.life/x.max;ctx.globalAlpha=p;ctx.strokeStyle='#a94738';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x.x,x.y,8+(1-p)*32,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(x.x-15,x.y);ctx.lineTo(x.x+15,x.y);ctx.moveTo(x.x,x.y-15);ctx.lineTo(x.x,x.y+15);ctx.stroke()}
  ctx.globalAlpha=1;for(const s of stamps){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);ctx.globalAlpha=s.permanent?.12:clamp(s.life/s.max,0,1);ctx.strokeStyle='#6e2e29';ctx.lineWidth=3;ctx.strokeRect(-27,-27,54,54);ctx.fillStyle='#6e2e29';ctx.font='700 25px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s.text,0,1);ctx.restore()}
}
function render(){
  drawPaper();ctx.save();if(shake>0&&!reducedMotion)ctx.translate(rand(-shake,shake),rand(-shake,shake));
  for(const w of spawnWarnings)drawSpawnWarning(w);for(const l of player.lines)drawLine(l,.82);drawAim();for(const p of projectiles)drawProjectile(p);for(const e of enemies)drawEnemy(e);drawPlayer();
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill()}ctx.globalAlpha=1;drawFx();ctx.restore();
  if(player.focus&&running&&!paused){ctx.fillStyle='rgba(32,36,33,.055)';ctx.fillRect(0,0,W,H)}
  if(dangerPulse>0){ctx.strokeStyle=`rgba(169,71,56,${dangerPulse*.55})`;ctx.lineWidth=5;ctx.strokeRect(3,3,W-6,H-6)}
  if(flash>0){ctx.fillStyle=`rgba(169,71,56,${flash*.23})`;ctx.fillRect(0,0,W,H)}
}
function loop(t){const dt=Math.min(.034,(t-last)/1000||.016);last=t;update(dt);render();raf=requestAnimationFrame(loop)}
function endGame(){gameOver=true;running=false;pointer.down=false;player.focus=false;syncChrome();best=Math.max(best,Math.floor(score));bestWave=Math.max(bestWave,wave);localStorage.setItem('pocket-works:cherta:best',best);localStorage.setItem('pocket-works:cherta:bestWave',bestWave);ui.finalScore.textContent=Math.floor(score);ui.finalKills.textContent=kills;ui.finalWave.textContent=wave;ui.finalBestCut.textContent=bestCut;ui.finalGrazes.textContent=totalGrazes;ui.finalBosses.textContent=bossesKilled;ui.gameover.classList.remove('hidden');syncSettings();tone(110,.45,'sawtooth',.04,-55)}
