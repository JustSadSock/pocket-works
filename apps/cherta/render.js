'use strict';
function update(dt){
  if(!running||paused||gameOver)return;
  const scaled=dt*(player.focus&&!player.dashing?.16:1);timeScale=scaled/dt;
  score+=scaled*.8;waveClock+=scaled;spawnClock-=scaled;player.invuln=Math.max(0,player.invuln-scaled);player.hitFlash=Math.max(0,player.hitFlash-scaled);
  if(waveClock>16){wave++;waveClock=0;bestWave=Math.max(bestWave,wave);localStorage.setItem('pocket-works:cherta:bestWave',bestWave);callout('КРУГ '+(ROMAN[wave-1]||wave));tone(170,.2,'sine',.03,160)}
  const maxEnemies=Math.min(10,2+Math.floor(wave*.72));if(spawnClock<=0&&enemies.filter(e=>!e.dead).length<maxEnemies){const r=Math.random();let type=r<Math.min(.17+.025*wave,.4)?'needle':'stalker';if(wave%4===0&&Math.random()<.28&&!enemies.some(e=>e.kind==='brute'&&!e.dead))type='brute';spawnEnemy(type);spawnClock=Math.max(.7,2.2-wave*.07)+rand(0,.55)}
  if(player.dashing){player.dashT+=dt;const t=clamp(player.dashT/player.dashDur,0,1),q=ease(t);player.x=lerp(player.fromX,player.toX,q);player.y=lerp(player.fromY,player.toY,q);for(const e of enemies){if(!e.dead&&segDist(e.x,e.y,player.fromX,player.fromY,player.x,player.y)<e.r+player.r&&e.dashStamp!==player.dashId){damageEnemy(e,.34);e.dashStamp=player.dashId}}if(t>=1)finishDash()}
  else if(player.lines.length&&!player.detonating){player.comboTimer-=scaled;if(player.comboTimer<=0)detonate()}
  for(const e of enemies)enemyLogic(e,scaled);
  for(const p of projectiles){p.x+=p.vx*scaled;p.y+=p.vy*scaled;p.life-=scaled;const d=dist(p.x,p.y,player.x,player.y);if(d<p.r+player.r+2){if(player.invuln>0){graze(p);p.life=0}else{hurtPlayer();p.life=0}}}
  for(const p of particles){p.x+=p.vx*scaled;p.y+=p.vy*scaled;p.vx*=Math.exp(-p.drag*scaled);p.vy*=Math.exp(-p.drag*scaled);p.life-=scaled}
  for(const q of cutQueue)q.t-=dt;for(const q of cutQueue.filter(q=>q.t<=0&&!q.done)){q.done=true;if(q.finish){player.detonating=false;player.charges=3;player.grazes=0;updateUI()}else performCut(q.line)}
  cutQueue=cutQueue.filter(q=>!q.done);projectiles=projectiles.filter(p=>p.life>0);particles=particles.filter(p=>p.life>0);enemies=enemies.filter(e=>!e.dead||e.hit>.01);
  shake=Math.max(0,shake-dt*35);flash=Math.max(0,flash-dt*2.3);updateUI();
}
function drawPaper(){
  ctx.fillStyle='#e9e1cf';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(32,36,33,.07)';ctx.lineWidth=1;for(let y=96;y<H-96;y+=34){ctx.beginPath();ctx.moveTo(17,y+.5);ctx.lineTo(W-17,y+.5);ctx.stroke()}
  ctx.strokeStyle='rgba(169,71,56,.16)';ctx.beginPath();ctx.moveTo(46,92);ctx.lineTo(46,H-104);ctx.stroke();
  const a=arena();ctx.strokeStyle='rgba(32,36,33,.45)';ctx.setLineDash([4,7]);ctx.strokeRect(a.l+.5,a.t+.5,a.r-a.l,a.b-a.t);ctx.setLineDash([])
}
function drawLine(l,alpha=1){const age=l.age||0;ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle='#202421';ctx.lineCap='round';ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(l.x1,l.y1);ctx.lineTo(l.x2,l.y2);ctx.stroke();ctx.strokeStyle='rgba(169,71,56,.72)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(l.x1+2,l.y1-1);ctx.lineTo(l.x2+2,l.y2-1);ctx.stroke();ctx.restore()}
function drawAim(){if(!pointer.down||!player.focus)return;const dx=pointer.x-pointer.sx,dy=pointer.y-pointer.sy,len=Math.hypot(dx,dy);if(len<4)return;const d=clamp(len*1.15,45,124),nx=dx/len,ny=dy/len,a=arena(),tx=clamp(player.x+nx*d,a.l+player.r,a.r-player.r),ty=clamp(player.y+ny*d,a.t+player.r,a.b-player.r);ctx.save();ctx.strokeStyle='rgba(32,36,33,.43)';ctx.setLineDash([3,7]);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(169,71,56,.22)';ctx.beginPath();ctx.arc(tx,ty,12+Math.sin(performance.now()/90)*2,0,TAU);ctx.fill();ctx.restore()}
function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);const hit=e.hit>0;ctx.rotate(Math.sin(e.seed*7)*.08);
  if(e.wind>0){const p=e.kind==='brute'?1-e.wind/.75:e.kind==='needle'?1-e.wind/.62:1-e.wind/.48;ctx.strokeStyle=`rgba(169,71,56,${.25+.55*p})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.kind==='brute'?75:e.kind==='needle'?e.r+10:e.r+13,0,TAU*p);ctx.stroke();if(e.kind==='needle'){ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(e.lockedX-e.x,e.lockedY-e.y);ctx.stroke();ctx.setLineDash([])}}
  ctx.fillStyle=hit?'#202421':'#a94738';ctx.strokeStyle='#6e2e29';ctx.lineWidth=2;
  if(e.kind==='stalker'){ctx.rotate(Math.PI/4);ctx.fillRect(-e.r*.72,-e.r*.72,e.r*1.44,e.r*1.44);ctx.strokeRect(-e.r*.72,-e.r*.72,e.r*1.44,e.r*1.44);ctx.fillStyle='#e9e1cf';ctx.fillRect(-2,-7,4,14);ctx.fillRect(-7,-2,14,4)}
  else if(e.kind==='needle'){ctx.beginPath();ctx.moveTo(0,-e.r-3);ctx.lineTo(e.r,e.r);ctx.lineTo(-e.r,e.r);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#e9e1cf';ctx.fillRect(-1,-5,2,10)}
  else{ctx.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8+(i%2?.16:0),r=i%2?e.r*.78:e.r;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e9e1cf';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r*.42,0,TAU);ctx.stroke()}
  ctx.restore()
}
function drawPlayer(){
  ctx.save();ctx.translate(player.x,player.y);const a=player.dashing?Math.atan2(player.toY-player.fromY,player.toX-player.fromX):0;ctx.rotate(a+Math.PI/4);if(player.invuln>0){ctx.strokeStyle=`rgba(78,105,112,${.25+Math.sin(performance.now()/45)*.2})`;ctx.lineWidth=2;ctx.strokeRect(-15,-15,30,30)}ctx.fillStyle=player.hitFlash>0?'#a94738':'#202421';ctx.fillRect(-8,-8,16,16);ctx.fillStyle='#e9e1cf';ctx.fillRect(-2,-10,4,20);ctx.restore()
}
function drawProjectile(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillStyle='#a94738';ctx.fillRect(-8,-2,16,4);ctx.restore()}
function render(){
  drawPaper();ctx.save();if(shake>0&&!reducedMotion)ctx.translate(rand(-shake,shake),rand(-shake,shake));
  for(const l of player.lines)drawLine(l,.82);drawAim();for(const p of projectiles)drawProjectile(p);for(const e of enemies)drawEnemy(e);drawPlayer();
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill()}ctx.globalAlpha=1;ctx.restore();
  if(player.focus&&running&&!paused){ctx.fillStyle='rgba(32,36,33,.055)';ctx.fillRect(0,0,W,H)}
  if(flash>0){ctx.fillStyle=`rgba(169,71,56,${flash*.23})`;ctx.fillRect(0,0,W,H)}
}
function loop(t){const dt=Math.min(.034,(t-last)/1000||.016);last=t;update(dt);render();raf=requestAnimationFrame(loop)}
function endGame(){gameOver=true;running=false;pointer.down=false;player.focus=false;best=Math.max(best,Math.floor(score));bestWave=Math.max(bestWave,wave);localStorage.setItem('pocket-works:cherta:best',best);localStorage.setItem('pocket-works:cherta:bestWave',bestWave);ui.finalScore.textContent=Math.floor(score);ui.finalKills.textContent=kills;ui.finalWave.textContent=wave;ui.gameover.classList.remove('hidden');syncSettings();tone(110,.45,'sawtooth',.04,-55)}
