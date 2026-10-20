// Katana Echo: authored 2D lacquer-dojo renderer. World coordinates are authoritative.
const TWO=Math.PI*2;
const copper='#dfab64',pale='#f2ead8',floor='#232c2c',ink='#101b1d',blue='#82d5cd',red='#e5a18c';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rounded(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
function line(ctx,points,color,width){
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
  ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
}
function drawCourtyard(ctx,map){
 // The arena is a finite fighting surface, but the courtyard continues beyond it.
 // This makes portrait framing intentional rather than leaving unused black bands.
 const w=map.bounds?.w||22,h=map.bounds?.h||14;
 ctx.fillStyle='#1b2929';ctx.fillRect(-36,-42,72,84);
 for(let y=-42;y<42;y+=1.6){
  const row=Math.round((y+42)/1.6);
  ctx.fillStyle=row%2?'#1c2929':'#202d2b';ctx.fillRect(-36,y,72,1.6);
  ctx.strokeStyle='#2f4140';ctx.lineWidth=.038;
  ctx.beginPath();ctx.moveTo(-36,y);ctx.lineTo(36,y);ctx.stroke();
  const offset=row%2?2.2:0;
  for(let x=-36+offset;x<36;x+=4.4){
   ctx.beginPath();ctx.moveTo(x,y+.07);ctx.lineTo(x,y+1.52);ctx.stroke();
  }
 }
 // Two raised perimeter thresholds: solid outer architecture, not phantom walls.
 for(const sign of [-1,1]){
  const y=sign*(h/2+1.35);
  ctx.fillStyle='#0d1a1b';ctx.fillRect(-w/2-1.2,y-.72,w+2.4,1.44);
  ctx.fillStyle='#42534a';ctx.fillRect(-w/2-.55,y-.51,w+1.1,1.02);
  ctx.fillStyle='#161f1e';ctx.fillRect(-w/2-.45,y-.38,w+.9,.76);
  ctx.fillStyle='#8c7551';ctx.fillRect(-w/2-.45,y-(sign>0?.42:.39),w+.9,.065);
  ctx.fillRect(-w/2-.45,y+(sign>0?.36:.39),w+.9,.065);
  for(let x=-w/2+1;x<w/2;x+=2){
   ctx.fillStyle='#6b6350';ctx.fillRect(x,y-.23,.065,.46);
  }
 }
 ctx.fillStyle='#141f1e';ctx.fillRect(-w/2-.42,-h/2-.42,w+.84,h+.84);
 ctx.strokeStyle='#725b40';ctx.lineWidth=.16;ctx.strokeRect(-w/2-.42,-h/2-.42,w+.84,h+.84);
}

function floorboards(ctx,map,t){
  const w=map.bounds?.w||22,h=map.bounds?.h||14;
  ctx.fillStyle=floor;ctx.fillRect(-w/2,-h/2,w,h);
  // Deep timber parquet: organized, not noise.
  for(let row=0;row<Math.ceil(h);row++){
    const y=-h/2+row;
    ctx.fillStyle=row%2?'#293231':'#26302f';ctx.fillRect(-w/2,y,w,1);
    ctx.strokeStyle='rgba(192,162,115,.14)';ctx.lineWidth=.026;
    ctx.beginPath();ctx.moveTo(-w/2,y);ctx.lineTo(w/2,y);ctx.stroke();
    for(let x=-Math.ceil(w/2)-2;x<w/2;x+=4){
      const xx=x+(row%2)*2;
      line(ctx,[[xx,y+.08],[xx,y+.92]],'rgba(8,16,17,.25)',.025);
    }
  }
  ctx.save();ctx.globalAlpha=.19;ctx.strokeStyle=copper;
  ctx.lineWidth=.045;ctx.beginPath();ctx.arc(0,0,4.55,0,TWO);ctx.stroke();
  ctx.lineWidth=.025;ctx.beginPath();ctx.arc(0,0,4.18,0,TWO);ctx.stroke();
  for(let i=0;i<16;i++){let a=i*TWO/16;line(ctx,[[Math.cos(a)*4.22,Math.sin(a)*4.22],[Math.cos(a)*4.5,Math.sin(a)*4.5]],copper,.05);}
  ctx.restore();
  // Engraved diagonal center cut (visual metaphor for the echo's temporal split).
  line(ctx,[[-1.3,1.4],[1.3,-1.4]],'rgba(235,196,134,.11)',.16);
  ctx.strokeStyle='#8b7659';ctx.lineWidth=.17;ctx.strokeRect(-w/2+.08,-h/2+.08,w-.16,h-.16);
  ctx.strokeStyle='#0c1515';ctx.lineWidth=.11;ctx.strokeRect(-w/2-.18,-h/2-.18,w+.36,h+.36);
}
function drawWall(ctx,w){
  const x=w.x-w.w/2,y=w.y-w.h/2;
  ctx.fillStyle='rgba(0,0,0,.36)';rounded(ctx,x+.13,y+.19,w.w,w.h,.09);ctx.fill();
  ctx.fillStyle='#111e20';rounded(ctx,x,y,w.w,w.h,.07);ctx.fill();
  ctx.strokeStyle='#6c6f5e';ctx.lineWidth=.045;ctx.stroke();
  ctx.fillStyle='#3e4b45';rounded(ctx,x+.11,y+.10,w.w-.22,w.h-.20,.045);ctx.fill();
  ctx.strokeStyle='#826e51';ctx.lineWidth=.045;ctx.beginPath();
  if(w.w>w.h){ctx.moveTo(x+.18,y+w.h*.28);ctx.lineTo(x+w.w-.18,y+w.h*.28);
  ctx.moveTo(x+.18,y+w.h*.72);ctx.lineTo(x+w.w-.18,y+w.h*.72);}
  else{ctx.moveTo(x+w.w*.28,y+.18);ctx.lineTo(x+w.w*.28,y+w.h-.18);ctx.moveTo(x+w.w*.72,y+.18);ctx.lineTo(x+w.w*.72,y+w.h-.18);}ctx.stroke();
  for(const [px,py] of [[x+.16,y+.15],[x+w.w-.16,y+.15],[x+.16,y+w.h-.15],[x+w.w-.16,y+w.h-.15]]){
    ctx.beginPath();ctx.fillStyle='#b28c59';ctx.arc(px,py,.045,0,TWO);ctx.fill();
  }
}
function drawActor(ctx,p,local,t,ghost=false){
  const s=p.state;if(!s)return;
  const alive=p.alive!==false;
  const accent=local?blue:red,cloak=local?'#236560':'#8e514c';
  const breathing=Math.sin(t*.0028+(local?0:1.2))*.019;
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.facing||0);
  ctx.globalAlpha=ghost?.43:alive?1:.17;
  // Ground shadow.
  ctx.fillStyle='#06101299';ctx.beginPath();ctx.ellipse(.05,.14,.64,.42,0,0,TWO);ctx.fill();
  if(ghost){
    ctx.strokeStyle=accent;ctx.lineWidth=.025;ctx.beginPath();ctx.arc(0,0,.64,0,TWO);ctx.stroke();
  }
  // Trailing ribbon follows movement: ornamental but shows momentum.
  const moving=clamp(Math.hypot(s.vx||0,s.vy||0)/12,0,1);
  ctx.strokeStyle=accent;ctx.lineCap='round';ctx.lineWidth=.09;
  ctx.beginPath();ctx.moveTo(-.2,-.14);ctx.quadraticCurveTo(-.6,-.23-moving*.07,-.85-moving*.36,-.04+Math.sin(t*.005)*.085);ctx.stroke();
  // Broad samurai hakama and separated feet, not a token circle.
  ctx.fillStyle=ink;
  rounded(ctx,-.38,-.32,.75,.64,.13);ctx.fill();
  ctx.fillStyle=cloak;
  ctx.beginPath();ctx.moveTo(-.15,-.35);ctx.lineTo(-.52,-.21);ctx.lineTo(-.48,.27);ctx.lineTo(-.08,.37);ctx.lineTo(.39,.30);ctx.lineTo(.41,-.28);ctx.lineTo(.05,-.37);ctx.closePath();ctx.fill();
  ctx.fillStyle='#0e1b1d';rounded(ctx,-.45,-.36,.2,.24,.06);ctx.fill();rounded(ctx,-.45,.16,.2,.24,.06);ctx.fill();
  ctx.fillStyle=accent;ctx.beginPath();ctx.arc(-.04,breathing,.285,0,TWO);ctx.fill();
  ctx.fillStyle='#122224';ctx.beginPath();ctx.arc(.035,breathing,.20,0,TWO);ctx.fill();
  ctx.strokeStyle=accent;ctx.lineWidth=.067;ctx.beginPath();ctx.arc(.03,breathing,.23,-1.35,1.35);ctx.stroke();
  line(ctx,[[.14,-.27],[.26,.22]],copper,.07);
  // Katana guard, handle, spine and glint; visible at small scale.
  const swing=s.attacking?Math.sin((1-clamp((s.attackTimer||0)/200,0,1))*Math.PI)*.65:0;
  ctx.save();ctx.rotate(-.08-swing);
  const charge=clamp((s.charge||0)/1800,0,1);
  if(charge>.01){
    ctx.strokeStyle='rgba(223,171,100,'+(.17+charge*.6)+')';ctx.lineWidth=.045+.04*charge;
    ctx.beginPath();ctx.arc(0,0,.93+charge*.32,-.63,.65);ctx.stroke();
  }
  line(ctx,[[.26,0],[.45,0]],'#1c1919',.16);
  line(ctx,[[.43,-.18],[.43,.19]],copper,.08);
  line(ctx,[[.47,0],[1.06+.18*charge,-.07]],pale,.09);
  line(ctx,[[.49,.05],[1.07+.18*charge,-.02]],'#a4b9ae',.027);
  if(s.attacking){
    ctx.strokeStyle=local?'rgba(126,221,208,.95)':'rgba(241,168,143,.95)';
    ctx.lineWidth=.18;ctx.beginPath();ctx.arc(0,0,1.25,-.85,.85);ctx.stroke();
    ctx.strokeStyle=pale;ctx.lineWidth=.045;ctx.beginPath();ctx.arc(0,0,1.39,-.56,.56);ctx.stroke();
  }
  ctx.restore();
  if(s.shieldUp){
    ctx.strokeStyle=s.parryWindow>0?'#ffe5ac':accent;
    ctx.lineWidth=s.parryWindow>0?.22:.12;ctx.lineCap='round';
    ctx.beginPath();ctx.arc(0,0,.71,-.94,.94);ctx.stroke();
  }
  ctx.restore();
}
function drawEffect(ctx,e,t){
  const progress=clamp((t-e.started)/e.duration,0,1),a=1-progress;
  ctx.save();ctx.translate(e.x,e.y);ctx.globalAlpha=a;
  if(e.type==='death'){
    ctx.strokeStyle=red;ctx.lineWidth=.07;ctx.beginPath();ctx.arc(0,0,.25+progress*1.45,0,TWO);ctx.stroke();
    for(let i=0;i<8;i++){const ang=i*TWO/8+.23,r=.15+progress*(1.5+i%3*.23);line(ctx,[[Math.cos(ang)*r*.5,Math.sin(ang)*r*.5],[Math.cos(ang)*r,Math.sin(ang)*r]],i%2?copper:red,.055);}
  }else{
    const color=e.type==='parry'?'#ffe19d':e.type==='ghost'?blue:pale;
    ctx.strokeStyle=color;ctx.lineWidth=.07*(1-progress)+.02;
    ctx.beginPath();ctx.arc(0,0,.3+progress*(e.type==='ghost'?1.25:.8),0,TWO);ctx.stroke();
    for(let i=0;i<6;i++){let ang=i*TWO/6+e.seed,rr=.35+progress*1.05;
      line(ctx,[[Math.cos(ang)*rr*.7,Math.sin(ang)*rr*.7],[Math.cos(ang)*rr,Math.sin(ang)*rr]],color,.08*(1-progress)+.008);}
  }
  ctx.restore();
}

export function cameraFor(world,width,height){
  const portrait=height>width*1.3&&width<=650;
  if(!portrait||!world.players?.length)return {scale:Math.min(width/25.6,height/17.7),x:width/2,y:height/2};
  const alive=world.players.filter(p=>p.alive&&p.state).map(p=>p.state);
  const actors=alive.length?alive:world.players.filter(p=>p.state).map(p=>p.state);
  if(!actors.length)return {scale:Math.min(width/25.6,height/17.7),x:width/2,y:height/2};
  const xs=actors.map(a=>a.x),ys=actors.map(a=>a.y);
  const cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2;
  const spread=Math.max(...xs)-Math.min(...xs),rise=Math.max(...ys)-Math.min(...ys);
  const scale=Math.min(width/Math.max(11.8,spread+5.8),height/Math.max(13.2,rise+9));
  return {scale,x:width/2-cx*scale,y:height*.42-cy*scale};
}
export function renderScene(ctx,world,localId,t,width,height,effects=[],smoothing=null){
  ctx.clearRect(0,0,width,height);
  const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#101a1b');bg.addColorStop(1,'#071112');
  ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  const camera=cameraFor(world,width,height);
  ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);
  const map=world.map||{bounds:{w:22,h:14},walls:[]};
  drawCourtyard(ctx,map);
  floorboards(ctx,map,t);
  for(const wall of map.walls||[])drawWall(ctx,wall);
  for(const p of world.players||[]){
    if(p.ghostActor?.alive)drawActor(ctx,p.ghostActor,p.id===localId,t,true);
  }
  for(const p of world.players||[]){
    const actor=smoothing?.get(p.id);
    drawActor(ctx,actor?{...p,state:{...p.state,x:actor.x,y:actor.y}}:p,p.id===localId,t);
  }
  for(const e of effects)drawEffect(ctx,e,t);
  ctx.restore();
  // Screen-edge vignette gives stage depth without masking duel readability.
  const vignette=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*.16,width/2,height/2,Math.max(width,height)*.72);
  vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'rgba(2,8,9,.58)');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
}
