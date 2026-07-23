function drawEntities(p) {
  const list=[];
  for(const npc of runtime.zone.npcs) if((npc.layer==='both'||npc.layer===runtime.save.layer)&&onScreen(npc.x,npc.y)) list.push({kind:'npc',y:npc.y,data:npc});
  for(const enemy of runtime.enemies) if(!enemy.dead&&isEnemyVisible(enemy)&&onScreen(enemy.x,enemy.y)) list.push({kind:'enemy',y:enemy.y,data:enemy});
  list.push({kind:'player',y:player.y,data:player});
  list.sort((a,b)=>a.y-b.y);
  for(const item of list){ if(item.kind==='npc')drawNpc(item.data,p); else if(item.kind==='enemy')drawEnemy(item.data,p); else drawPlayer(p); }
}

function drawNpc(npc,p) {
  const x=Math.round(npc.x),y=Math.round(npc.y);
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(x-8,y+6,16,4);
  ctx.fillStyle=npc.id.includes('mira')?'#c9a766':npc.id==='rag'?'#78658f':'#8e8a73';ctx.fillRect(x-6,y-9,12,15);
  ctx.fillStyle='#e8dfbf';ctx.fillRect(x-4,y-14,8,6);
  ctx.fillStyle=p.line;ctx.fillRect(x-3,y-12,2,2);ctx.fillRect(x+2,y-12,2,2);
  if(runtime.nearby?.kind==='npc'&&runtime.nearby.data.id===npc.id){ctx.fillStyle=p.accent;ctx.fillRect(x-1,y-24,3,7);ctx.fillRect(x-1,y-14,3,3);}
}

function drawPlayer(p) {
  const x=Math.round(player.x),y=Math.round(player.y);
  const blink=player.hurtFlash>0&&Math.floor(runtime.renderTime/45)%2===0;
  if(blink) return;
  ctx.fillStyle='rgba(0,0,0,.32)';ctx.fillRect(x-8,y+7,16,4);
  ctx.fillStyle=runtime.save.layer===LAYERS.ASH?'#74648a':'#806c45';ctx.fillRect(x-6,y-5,12,13);
  ctx.fillStyle='#d7c7a6';ctx.fillRect(x-5,y-12,10,8);
  ctx.fillStyle='#282b28';ctx.fillRect(x-4,y-11,3,2);ctx.fillRect(x+2,y-11,3,2);
  ctx.fillStyle=p.accent;ctx.fillRect(x-7,y-4,3,8);
  const fx=Math.round(player.facingX*11),fy=Math.round(player.facingY*11);
  ctx.fillStyle='#e8dfbf';ctx.fillRect(x+fx-1,y+fy-1,3,3);
  if(player.attackFlash>0){
    ctx.strokeStyle='#f4dc7b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,28,Math.atan2(player.facingY,player.facingX)-.75,Math.atan2(player.facingY,player.facingX)+.75);ctx.stroke();
  }
  if(player.skillFlash>0){ctx.strokeStyle='#d7c9f0';ctx.strokeRect(x-11,y-18,22,31);}
  if(player.invuln>0){ctx.strokeStyle=p.accent;ctx.setLineDash([3,3]);ctx.strokeRect(x-10,y-16,20,28);ctx.setLineDash([]);}
}

function drawEnemy(e,p) {
  const x=Math.round(e.x),y=Math.round(e.y); const flash=e.hitFlash>0;
  ctx.fillStyle='rgba(0,0,0,.32)';ctx.fillRect(x-e.radius,y+e.radius-2,e.radius*2,4);
  ctx.fillStyle=flash?'#fff4d4':e.color;
  if(e.type==='wisp'){
    ctx.fillRect(x-5,y-7,10,10);ctx.fillRect(x-2,y-12,4,5);ctx.fillRect(x-8,y-3,3,6);ctx.fillRect(x+5,y-3,3,6);
  } else if(e.type==='leech'){
    ctx.fillRect(x-10,y-4,20,9);ctx.fillRect(x-6,y-8,12,5);ctx.fillStyle='#202520';ctx.fillRect(x+4,y-5,2,2);
  } else if(e.boss){
    ctx.fillRect(x-14,y-18,28,31);ctx.fillStyle=p.line;ctx.fillRect(x-9,y-13,6,4);ctx.fillRect(x+4,y-13,6,4);ctx.fillRect(x-18,y-6,5,18);ctx.fillRect(x+13,y-6,5,18);
    if(e.phase>=2){ctx.fillStyle=p.accent;ctx.fillRect(x-2,y-24,4,7);}
  } else {
    const wide=e.type==='brute'?12:8;
    ctx.fillRect(x-wide,y-9,wide*2,18);ctx.fillRect(x-(wide-3),y-15,(wide-3)*2,7);ctx.fillStyle=p.line;ctx.fillRect(x-4,y-13,3,2);ctx.fillRect(x+2,y-13,3,2);
  }
  const now=performance.now()/1000;
  if(e.markLayer&&e.markUntil>now){
    ctx.strokeStyle=e.markLayer===LAYERS.BLOOM?'#d8b45b':'#b39cda';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-10,y-e.radius-9);ctx.lineTo(x,y-e.radius-14);ctx.lineTo(x+10,y-e.radius-9);ctx.stroke();
  }
  if(e.boss){ctx.fillStyle='#1b1d1b';ctx.fillRect(x-18,y+e.radius+5,36,4);ctx.fillStyle='#b85b4b';ctx.fillRect(x-18,y+e.radius+5,36*(e.hp/e.maxHp),4);}
}

function drawProjectiles() {
  for(const p of runtime.projectiles){
    if(p.layer!==runtime.save.layer||!onScreen(p.x,p.y,10)) continue;
    ctx.fillStyle=p.owner==='player'?'#f3e7bd':'#c18183';
    if(p.kind==='needle'||p.kind==='seam'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.fillRect(-7,-1,14,3);ctx.restore();}
    else {ctx.fillRect(p.x-p.radius,p.y-p.radius,p.radius*2,p.radius*2);}
  }
}

function drawParticles() {
  for(const p of runtime.particles){
    if(!onScreen(p.x,p.y,70)) continue;
    const alpha=Math.max(0,p.life/p.max);ctx.globalAlpha=alpha;ctx.strokeStyle=p.color;ctx.fillStyle=p.color;
    if(p.ring){const t=1-p.life/p.max;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,p.maxRadius*t,0,Math.PI*2);ctx.stroke();}
    else if(p.slash){ctx.fillRect(p.x-8,p.y-1,16,2);} else ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size);
  }
  ctx.globalAlpha=1;
}

function drawFloaters() {
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 10px ui-monospace, monospace';
  for(const f of runtime.floaters){if(!onScreen(f.x,f.y,20))continue;ctx.globalAlpha=Math.max(0,f.life/f.max);ctx.fillStyle='#171a18';ctx.fillText(f.text,f.x+1,f.y+1);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x,f.y);}
  ctx.globalAlpha=1;
}

function drawScreenTexture(p) {
  ctx.save();ctx.globalAlpha=.07;ctx.fillStyle='#000';
  for(let y=0;y<VIEW.height;y+=4)ctx.fillRect(0,y,VIEW.width,1);
  ctx.globalAlpha=1;ctx.strokeStyle=p.line;ctx.lineWidth=5;ctx.strokeRect(2,2,VIEW.width-4,VIEW.height-4);ctx.restore();
}

