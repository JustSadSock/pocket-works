function render() {
  const palette=runtime.save?PALETTES[runtime.save.layer]:PALETTES.bloom;
  ctx.setTransform(VIEW.dpr,0,0,VIEW.dpr,0,0);
  ctx.fillStyle=palette.sky;ctx.fillRect(0,0,VIEW.width,VIEW.height);
  if(!runtime.zone||!runtime.save) return;
  ctx.save();
  ctx.translate(-Math.floor(camera.x)+camera.shakeX,-Math.floor(camera.y)+camera.shakeY);
  drawGround(palette);
  drawHazards(palette);
  drawObstacles(palette);
  drawWorldProps(palette);
  drawEntities(palette);
  drawProjectiles(palette);
  drawParticles();
  drawFloaters();
  ctx.restore();
  drawScreenTexture(palette);
}

function visibleBounds(pad=32){return {l:camera.x-pad,t:camera.y-pad,r:camera.x+VIEW.width+pad,b:camera.y+VIEW.height+pad};}
function onScreen(x,y,pad=40){const b=visibleBounds(pad);return x>b.l&&x<b.r&&y>b.t&&y<b.b;}

function drawGround(p) {
  const b=visibleBounds(0);
  const startX=Math.max(0,Math.floor(b.l/TILE)); const endX=Math.min(runtime.zone.size[0],Math.ceil(b.r/TILE));
  const startY=Math.max(0,Math.floor(b.t/TILE)); const endY=Math.min(runtime.zone.size[1],Math.ceil(b.b/TILE));
  for(let y=startY;y<endY;y++) for(let x=startX;x<endX;x++){
    const odd=(x+y+(runtime.zone.id.length%2))%2;
    ctx.fillStyle=odd?p.floorA:p.floorB;ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
    if((x*13+y*7+runtime.zone.id.length)%11===0){ctx.fillStyle=p.line;ctx.fillRect(x*TILE+3,y*TILE+4,2,2);ctx.fillRect(x*TILE+10,y*TILE+11,1,1);}
    if(runtime.save.layer===LAYERS.ASH&&(x*5+y*3)%17===0){ctx.fillStyle='#6b5d77';ctx.fillRect(x*TILE+7,y*TILE+2,1,5);}
  }
}

function drawObstacles(p) {
  for(const r of runtime.zone.obstacles[runtime.save.layer]){
    if(r.x+r.w<camera.x||r.x>camera.x+VIEW.width||r.y+r.h<camera.y||r.y>camera.y+VIEW.height) continue;
    ctx.fillStyle=p.line;ctx.fillRect(r.x,r.y+4,r.w,r.h);
    ctx.fillStyle=p.wall;ctx.fillRect(r.x,r.y,r.w,Math.max(4,r.h-4));
    ctx.fillStyle=p.wallTop;ctx.fillRect(r.x,r.y,r.w,4);
    for(let x=r.x+4;x<r.x+r.w-2;x+=16){ctx.fillStyle=p.line;ctx.fillRect(x,r.y+7,2,Math.max(2,r.h-12));}
  }
}

function drawHazards(p) {
  for(const r of runtime.zone.hazards[runtime.save.layer]){
    if(r.x+r.w<camera.x||r.x>camera.x+VIEW.width||r.y+r.h<camera.y||r.y>camera.y+VIEW.height) continue;
    ctx.fillStyle=p.water;ctx.fillRect(r.x,r.y,r.w,r.h);
    const off=Math.floor(runtime.renderTime/180)%12;
    ctx.fillStyle=p.waterLight;
    for(let y=r.y+5;y<r.y+r.h;y+=10) for(let x=r.x-12+off;x<r.x+r.w;x+=24) ctx.fillRect(Math.max(r.x,x),y,Math.min(10,r.x+r.w-Math.max(r.x,x)),2);
  }
}

function drawWorldProps(p) {
  const shrine=runtime.zone.shrine;
  if(onScreen(shrine.x,shrine.y)) drawShrine(shrine.x,shrine.y,p);
  for(const chest of runtime.zone.chests){
    if(chest.layer!=='both'&&chest.layer!==runtime.save.layer) continue;
    if(onScreen(chest.x,chest.y)) drawChest(chest,runtime.save.world.chests[chest.id]);
  }
  for(const portal of runtime.zone.portals) drawPortal(portal,p);
  const rng=seeded(hashString(`${runtime.zone.id}:${runtime.save.layer}`));
  for(let i=0;i<70;i++){
    const x=2*TILE+rng()*(runtime.zone.size[0]-4)*TILE,y=2*TILE+rng()*(runtime.zone.size[1]-4)*TILE;
    if(!onScreen(x,y,8)||isBlocked(runtime.zone.id,runtime.save.layer,x,y,3)||isHazard(runtime.zone.id,runtime.save.layer,x,y,3)) continue;
    ctx.fillStyle=i%3===0?p.accent:p.fog;
    if(runtime.save.layer===LAYERS.BLOOM){ctx.fillRect(x,y-3,1,4);ctx.fillRect(x-2,y-2,5,1);} else {ctx.fillRect(x-1,y-4,2,5);ctx.fillRect(x-3,y-2,6,1);}
  }
}

function drawPortal(portal,p) {
  const x=portal.x,y=portal.y,w=portal.w,h=portal.h;
  if(x+w<camera.x||x>camera.x+VIEW.width||y+h<camera.y||y>camera.y+VIEW.height) return;
  const unlocked=requirementMet(portal.requirement,runtime.save);
  ctx.fillStyle=p.line;ctx.fillRect(x,y,w,h);
  ctx.fillStyle=unlocked?p.accent:'#4d514b';
  if(w>h){ctx.fillRect(x,y,w,5);for(let px=x+4;px<x+w;px+=12)ctx.fillRect(px,y+5,4,h-5);} else {ctx.fillRect(x,y,5,h);for(let py=y+4;py<y+h;py+=12)ctx.fillRect(x+5,py,w-5,4);}
}

function drawShrine(x,y,p) {
  const pulse=2+Math.floor((Math.sin(runtime.renderTime*.004)+1)*2);
  ctx.fillStyle=p.line;ctx.fillRect(x-12,y+5,24,8);
  ctx.fillStyle=p.wall;ctx.fillRect(x-9,y-5,18,12);
  ctx.fillStyle=p.accent;ctx.fillRect(x-2,y-16,4,13);ctx.fillRect(x-7,y-9,14,3);
  ctx.strokeStyle=p.accent;ctx.lineWidth=1;ctx.strokeRect(x-10-pulse,y-18-pulse,20+pulse*2,30+pulse*2);
}

function drawChest(chest,opened) {
  const x=chest.x,y=chest.y;
  ctx.fillStyle='#2b2117';ctx.fillRect(x-10,y-5,20,13);
  ctx.fillStyle=opened?'#5c5142':'#9c7138';ctx.fillRect(x-9,y-(opened?2:8),18,9);
  ctx.fillStyle='#d8b45b';ctx.fillRect(x-2,y-3,4,5);
}

