// УЗЕЛ — deterministic host-owned 2D simulation + canvas art.
export const WORLD={w:700,h:900};
export const COLORS=['#c96f53','#e7b06d','#799f8e','#8d8fb0','#c47d9f','#78a1b6'];
export const LEVELS=[
 {name:'Первый узел',subtitle:'Проведи верёвкой сквозь огни',start:{x:350,y:742},exit:{x:348,y:146},stones:[{x:351,y:423,r:68}],sparks:[{x:342,y:605},{x:216,y:347}]},
 {name:'Каменный танец',subtitle:'Обойди камни с двух сторон',start:{x:352,y:764},exit:{x:353,y:133},stones:[{x:220,y:469,r:72},{x:489,y:498,r:80},{x:360,y:286,r:60}],sparks:[{x:360,y:600},{x:348,y:463},{x:361,y:294}]},
 {name:'Крутой поворот',subtitle:'Натяни канат между островами',start:{x:356,y:771},exit:{x:358,y:127},stones:[{x:351,y:610,r:68},{x:213,y:412,r:72},{x:480,y:367,r:72}],sparks:[{x:495,y:610},{x:210,y:590},{x:358,y:430},{x:348,y:217}]},
 {name:'Один за всех',subtitle:'Двигайтесь в одном ритме',start:{x:353,y:777},exit:{x:351,y:119},stones:[{x:355,y:622,r:61},{x:213,y:500,r:59},{x:482,y:500,r:59},{x:353,y:343,r:60}],sparks:[{x:213,y:666},{x:483,y:661},{x:354,y:505},{x:213,y:293},{x:480,y:292}]}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function newMatch(identities,levelIndex=0,solo=false){
 const level=LEVELS[clamp(levelIndex,0,LEVELS.length-1)];
 const players=identities.slice(0,6).map((p,i)=>({
   id:String(p.id).slice(0,80),name:String(p.name||'Игрок').slice(0,22),
   x:level.start.x+(i-(identities.length-1)/2)*62,y:level.start.y+(i%2)*15,
   vx:0,vy:0,boost:0,cooldown:0,color:COLORS[i%COLORS.length]
 }));
 return {level:clamp(levelIndex,0,3),phase:'play',paused:false,solo,players,
  sparks:level.sparks.map(()=>false),elapsed:0,rev:0,activeId:players[0]?.id||null,finishedAt:0};
}
export function activatePlayer(game,id){if(game.solo&&game.players.some(p=>p.id===id))game.activeId=id}
function collidePlayer(p,level){
 const radius=23,edge=49;
 p.x=clamp(p.x,edge,WORLD.w-edge);p.y=clamp(p.y,edge,WORLD.h-edge);
 for(const s of level.stones){
   const dx=p.x-s.x,dy=p.y-s.y,rr=s.r+radius,d=Math.hypot(dx,dy);
   if(d<rr){let nx=dx/(d||1),ny=dy/(d||1);if(d<.001){nx=1;ny=0}
    p.x=s.x+nx*rr;p.y=s.y+ny*rr;
    const inward=p.vx*nx+p.vy*ny;if(inward<0){p.vx-=nx*inward;p.vy-=ny*inward}
   }
 }
}
export function command(game,id,input){
 const p=game?.players?.find(x=>x.id===id);
 if(!p||game.phase!=='play')return;
 if(input?.tug && p.cooldown<=0){p.boost=.22;p.cooldown=1.25}
}
function inputFor(game,p,index,inputs){
 if(!game.solo||p.id===game.activeId)return inputs[p.id]||{x:0,y:0};
 // Companions follow the selected hero and hold enough separation to make the rope useful.
 const leader=game.players.find(x=>x.id===game.activeId)||game.players[0];
 const ownIndex=game.players.indexOf(leader);
 const side=index<ownIndex?-1:1;
 const behindX=leader.x+side*107;
 const behindY=leader.y+120+(index%2)*24;
 let tx=clamp(behindX,70,630),ty=clamp(behindY,70,820);
 for(const stone of LEVELS[game.level].stones){
  const d=Math.hypot(tx-stone.x,ty-stone.y);
  if(d<stone.r+45){const ang=Math.atan2(ty-stone.y,tx-stone.x);tx=stone.x+Math.cos(ang)*(stone.r+65);ty=stone.y+Math.sin(ang)*(stone.r+65)}
 }
 const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy);
 return d>18?{x:dx/d*Math.min(d/65,1),y:dy/d*Math.min(d/65,1)}:{x:0,y:0};
}
export function step(game,inputs,dt){
 if(!game||game.phase!=='play'||game.paused)return [];
 dt=clamp(dt,0,1/20);game.elapsed+=dt;
 const level=LEVELS[game.level],events=[];
 const active=game.players;
 for(let i=0;i<active.length;i++){
  const p=active[i],inp=inputFor(game,p,i,inputs);
  const x=clamp(Number(inp?.x)||0,-1,1),y=clamp(Number(inp?.y)||0,-1,1);
  const mag=Math.max(1,Math.hypot(x,y));
  const speed=p.boost>0?430:254;
  const damp=Math.min(1,dt*11);
  p.vx+=(x/mag*speed-p.vx)*damp;p.vy+=(y/mag*speed-p.vy)*damp;
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  p.boost=Math.max(0,p.boost-dt);p.cooldown=Math.max(0,p.cooldown-dt);
  collidePlayer(p,level);
 }
 // A rope constraint with equal and opposite displacement, followed by obstacle projection.
 for(let k=0;k<9;k++){
  for(let i=0;i<active.length-1;i++){
   const a=active[i],b=active[i+1],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
   const excess=d-198;if(excess>0){
    const nx=dx/d,ny=dy/d,corr=excess*.52;
    a.x+=nx*corr;a.y+=ny*corr;b.x-=nx*corr;b.y-=ny*corr;
    a.vx+=nx*excess*.14;b.vx-=nx*excess*.14;
   }
  }
  for(const p of active)collidePlayer(p,level);
 }
 const paths=ropePaths(active,level.stones);
 for(let i=0;i<level.sparks.length;i++){
  if(game.sparks[i])continue;
  const spark=level.sparks[i];
  for(const path of paths){
   if(path.tension<.24)continue;
   for(let j=1;j<path.points.length;j++){
    if(lineDistance(spark,path.points[j-1],path.points[j])<31){
     game.sparks[i]=true;game.rev++;events.push({type:'spark',index:i});break;
    }
   }
   if(game.sparks[i])break;
  }
 }
 if(game.sparks.every(Boolean) && active.every(p=>distance(p,level.exit)<123)){
   game.phase='won';game.finishedAt=game.elapsed;game.rev++;events.push({type:'won'});
 }
 return events;
}
function lineDistance(p,a,b){
 const x=b.x-a.x,y=b.y-a.y,l=x*x+y*y;
 const t=l?clamp(((p.x-a.x)*x+(p.y-a.y)*y)/l,0,1):0;
 return Math.hypot(p.x-(a.x+t*x),p.y-(a.y+t*y));
}
function wrapSegment(a,b,stones){
 // The rope drapes around the first intersected circular stake. Render-only bend;
 // the underlying length constraint remains stable and independent of rendering.
 let selected=null,score=Infinity;
 for(const s of stones){
  const d=lineDistance(s,a,b),min=s.r+7;
  if(d<min&&distance(a,s)>min&&distance(b,s)>min){
   const mid=Math.hypot(a.x-s.x,a.y-s.y)+Math.hypot(b.x-s.x,b.y-s.y);
   if(mid<score){score=mid;selected=s}
  }
 }
 if(!selected)return [a,b];
 const s=selected,dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;
 const nx=-dy/l,ny=dx/l;
 const sign=( (s.x-a.x)*dy-(s.y-a.y)*dx )>0?1:-1;
 const pivot={x:s.x+nx*(s.r+20)*sign,y:s.y+ny*(s.r+20)*sign};
 return [a,pivot,b];
}
export function ropePaths(players,stones){
 const paths=[];
 for(let i=0;i<players.length-1;i++){
  const a=players[i],b=players[i+1],d=distance(a,b);
  paths.push({points:wrapSegment(a,b,stones),tension:clamp((d-94)/104,0,1)});
 }
 return paths;
}
export function snapshot(game){
 return {level:game.level,phase:game.phase,paused:game.paused,elapsed:Math.round(game.elapsed*10)/10,
  sparks:[...game.sparks],players:game.players.map(p=>({id:p.id,name:p.name,x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,color:p.color,boost:Math.round(p.boost*10)/10})),
  rev:game.rev,finishedAt:game.finishedAt};
}
export function validSnapshot(data){
 if(!data||!Number.isInteger(data.level)||data.level<0||data.level>=LEVELS.length||!['play','won'].includes(data.phase)||!Array.isArray(data.players)||data.players.length<1||data.players.length>6||!Array.isArray(data.sparks)||data.sparks.length!==LEVELS[data.level].sparks.length)return false;
 return data.players.every(p=>typeof p.id==='string'&&p.id.length<=80&&typeof p.name==='string'&&p.name.length<=22&&Number.isFinite(p.x)&&p.x>=0&&p.x<=WORLD.w&&Number.isFinite(p.y)&&p.y>=0&&p.y<=WORLD.h)&&data.sparks.every(b=>typeof b==='boolean');
}
export function drawBoard(canvas,data,time=0,playersOverride=null){
 if(!data)return;
 const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
 const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
 const scale=Math.min(rect.width/WORLD.w,rect.height/WORLD.h);
 const ox=(rect.width-WORLD.w*scale)/2,oy=(rect.height-WORLD.h*scale)/2;
 ctx.fillStyle='#d0dacd';ctx.fillRect(0,0,rect.width,rect.height);
 ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
 const level=LEVELS[data.level],t=time/1000;
 const bg=ctx.createLinearGradient(0,0,700,900);bg.addColorStop(0,'#d4ded0');bg.addColorStop(1,'#bed2bf');ctx.fillStyle=bg;ctx.fillRect(0,0,700,900);
 // Hatching and quiet handcrafted field marks.
 ctx.strokeStyle='#f4efdf60';ctx.lineWidth=2;for(let k=0;k<27;k++){const x=(k*97+43)%690,y=(k*149+51)%870;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+18,y-9);ctx.stroke()}
 ctx.strokeStyle='#a7bdaa';ctx.lineWidth=2;
 for(let r=0;r<4;r++){ctx.beginPath();ctx.ellipse(350,450,310-r*38,403-r*47,-.08,0,Math.PI*2);ctx.stroke()}
 ctx.fillStyle='#eae3cc';ctx.strokeStyle='#8fa791';ctx.lineWidth=6;rounded(ctx,35,36,630,828,31);ctx.fill();ctx.stroke();
 ctx.save();rounded(ctx,38,39,624,822,30);ctx.clip();
 ctx.fillStyle='#ebe8d7';ctx.fillRect(40,39,620,822);
 ctx.strokeStyle='#dccfb6';ctx.lineWidth=1;for(let x=70;x<680;x+=40){ctx.beginPath();ctx.moveTo(x,42);ctx.lineTo(x,855);ctx.stroke()}for(let y=65;y<850;y+=40){ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(660,y);ctx.stroke()}
 ctx.fillStyle='#d8d2b8';ctx.globalAlpha=.45;for(let i=0;i<60;i++){const x=60+((i*83)%590),y=50+((i*137)%780);ctx.beginPath();ctx.arc(x,y,2+(i%3),0,7);ctx.fill()}ctx.globalAlpha=1;
 const open=data.sparks.every(Boolean),exit=level.exit;
 ctx.save();ctx.translate(exit.x,exit.y);ctx.shadowBlur=open?25:0;ctx.shadowColor='#f2b756';ctx.fillStyle=open?'#eddbaa':'#a9b2a3';ctx.strokeStyle=open?'#b88e53':'#8f9c8e';ctx.lineWidth=10;ctx.beginPath();ctx.arc(0,0,78,0,7);ctx.fill();ctx.stroke();ctx.setLineDash([11,10]);ctx.strokeStyle=open?'#fff8d7':'#d6e1d6';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,57,0,7);ctx.stroke();ctx.setLineDash([]);ctx.font='900 18px system-ui';ctx.fillStyle=open?'#7c5a38':'#637166';ctx.textAlign='center';ctx.fillText(open?'ВЫХОД':'ЗАКРЫТО',0,7);ctx.restore();
 for(const s of level.stones){
  ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#7f8d77';ctx.beginPath();ctx.ellipse(6,12,s.r+16,s.r*.62+20,0,0,7);ctx.fill();ctx.fillStyle='#a1aa95';ctx.beginPath();ctx.arc(0,0,s.r+5,0,7);ctx.fill();ctx.fillStyle='#c0bea9';ctx.beginPath();ctx.arc(-4,-6,s.r,0,7);ctx.fill();ctx.strokeStyle='#898f78';ctx.lineWidth=5;ctx.beginPath();ctx.arc(-4,-6,s.r,0,7);ctx.stroke();ctx.strokeStyle='#e1d7c3';ctx.lineWidth=3;ctx.beginPath();ctx.arc(-7,-8,s.r*.72,-2.8,1.2);ctx.stroke();ctx.beginPath();ctx.arc(-6,-8,s.r*.36,.15,4.3);ctx.stroke();ctx.restore();
 }
 for(let i=0;i<level.sparks.length;i++){
  const s=level.sparks[i],collected=Boolean(data.sparks[i]);ctx.save();ctx.translate(s.x,s.y);
  if(!collected){const p=1+Math.sin(t*4+i*2)*.10;ctx.scale(p,p);ctx.shadowBlur=24;ctx.shadowColor='#eba647';ctx.fillStyle='#fff4c9';ctx.strokeStyle='#ca964f';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,22,0,7);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(0,-13);ctx.lineTo(9,0);ctx.lineTo(0,13);ctx.closePath();ctx.fillStyle='#e0a34d';ctx.fill()}else{ctx.strokeStyle='#b3b59d';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,19,0,7);ctx.stroke();ctx.fillStyle='#b2b6a0';ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill()}ctx.restore();
 }
 const players=playersOverride||data.players;
 const rope=ropePaths(players,level.stones);
 for(const item of rope){const pts=item.points,stroke=ctx;
  stroke.beginPath();stroke.moveTo(pts[0].x,pts[0].y);
  if(pts.length===3)stroke.quadraticCurveTo(pts[1].x,pts[1].y,pts[2].x,pts[2].y);
  else stroke.lineTo(pts[1].x,pts[1].y);
  stroke.strokeStyle='#6e4e3b';stroke.lineWidth=19;stroke.lineJoin='round';stroke.lineCap='round';stroke.stroke();
  stroke.strokeStyle=item.tension>.70?'#efbb74':'#c6815e';stroke.lineWidth=13;stroke.stroke();
  stroke.setLineDash([3,17]);stroke.strokeStyle='#f1d3a0';stroke.lineWidth=3;stroke.stroke();stroke.setLineDash([]);
 }
 for(let i=0;i<players.length;i++){
  const p=players[i];ctx.save();ctx.translate(p.x,p.y);const bob=Math.sin(t*5+i)*1.4;
  ctx.fillStyle='#675b4c30';ctx.beginPath();ctx.ellipse(2,21,27,13,0,0,7);ctx.fill();
  ctx.fillStyle='#6f594a';ctx.beginPath();ctx.arc(0,bob,26,0,7);ctx.fill();
  ctx.fillStyle=p.color||COLORS[i%COLORS.length];ctx.beginPath();ctx.arc(0,bob-3,22,0,7);ctx.fill();
  ctx.fillStyle='#f6dbc2';ctx.beginPath();ctx.arc(-10,bob-19,10,0,7);ctx.arc(11,bob-19,10,0,7);ctx.fill();
  ctx.fillStyle=p.color||COLORS[i%COLORS.length];ctx.beginPath();ctx.arc(-10,bob-20,6,0,7);ctx.arc(11,bob-20,6,0,7);ctx.fill();
  ctx.fillStyle='#332e2a';ctx.beginPath();ctx.arc(-7,bob-4,3.8,0,7);ctx.arc(9,bob-4,3.8,0,7);ctx.fill();
  ctx.fillStyle='#f8e1c4';ctx.beginPath();ctx.arc(2,bob+5,5,0,7);ctx.fill();
  if(p.boost>0){ctx.strokeStyle='#fbe9ae';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,bob-3,32,0,7);ctx.stroke()}
  ctx.font='800 17px system-ui';ctx.fillStyle='#4b4139';ctx.strokeStyle='#f6eddb';ctx.lineWidth=5;ctx.textAlign='center';ctx.lineJoin='round';const label=String(p.name||'').slice(0,12);ctx.strokeText(label,0,49);ctx.fillText(label,0,49);ctx.restore();
 }
 ctx.restore();ctx.restore();
}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
