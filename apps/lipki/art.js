import {W,H,R,LEVELS,COLORS} from './physics.js';
const cameras=new WeakMap();
const rand=(n)=>{let x=Math.sin(n*127.17+55.4)*43758.55;return x-Math.floor(x);};
const rounded=(c,x,y,w,h,r)=>{c.beginPath();c.roundRect(x,y,w,h,r);};
const fill=(c,x,y,w,h,r,color)=>{rounded(c,x,y,w,h,r);c.fillStyle=color;c.fill();};
const ink='#453a37',cotton='#f6e8d6';
function texture(c,x,y,w,h,seed,density=30){
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.strokeStyle='rgba(68,58,54,.12)';c.lineWidth=1;
 for(let j=0;j<density;j++){let px=x+rand(seed*4+j)*w,py=y+rand(seed*9+j)*h;let l=4+rand(j+seed)*10;c.beginPath();c.moveTo(px,py);c.lineTo(px+l,py+rand(j*4+seed)*2);c.stroke();}
 c.restore();
}
function stitch(c,x1,y1,x2,y2){
 c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle='rgba(81,61,53,.38)';c.lineWidth=2;c.setLineDash([3,8]);c.stroke();c.setLineDash([]);
}
function textile(c,x,y,w,h,col,seed=0){
 c.save();c.shadowColor='#6b5f56';c.shadowBlur=11;c.shadowOffsetY=8;
 fill(c,x,y,w,h,8,col);c.restore();
 c.save();c.strokeStyle='rgba(255,255,255,.46)';c.lineWidth=4;rounded(c,x+3,y+3,w-6,h-6,6);c.stroke();c.restore();
 texture(c,x+6,y+5,w-12,h-10,seed,Math.max(10,Math.floor(w*h/650)));
 stitch(c,x+11,y+9,x+w-11,y+9);
}
function button(c,s,active){
 c.save();c.translate(s.x,s.y);c.shadowColor='rgba(73,47,32,.2)';c.shadowBlur=6;c.shadowOffsetY=4;
 c.beginPath();c.ellipse(0,0,43,11,0,0,Math.PI*2);c.fillStyle=active?'#92ae69':'#d2a64c';c.fill();c.restore();
 c.beginPath();c.ellipse(s.x,s.y-5,36,10,0,0,Math.PI*2);c.fillStyle=active?'#bbd78e':'#f6cf79';c.fill();
 c.fillStyle=active?'#5f7956':'#956e31';
 for(const dx of [-9,9])for(const dy of [-3,3]){c.beginPath();c.arc(s.x+dx,s.y-5+dy,2.8,0,7);c.fill();}
}
function platform(c,r,index){textile(c,r.x,r.y,r.w,r.h,['#8ba8a2','#be998f','#b1a8ca','#bca58b'][index%4],index+3);}
function spring(c,s,time){
 c.save();c.translate(s.x,s.y);
 fill(c,-43,-8,86,10,5,'#bc6d62');
 c.strokeStyle='#536e6a';c.lineWidth=6;c.lineJoin='round';c.beginPath();c.moveTo(-27,-8);
 for(let i=0;i<7;i++)c.lineTo(-24+i*8,-22+(i%2?0:-15));c.lineTo(-20+i*8,-8);c.stroke();
 fill(c,-39,-27,78,10,6,'#dfad5e');stitch(c,-32,-22,32,-22);c.restore();
}
function ball(c,b,t){
 c.save();c.translate(b.x,b.y);c.rotate(b.x*.04);
 c.shadowColor='rgba(47,40,38,.18)';c.shadowOffsetY=7;c.shadowBlur=7;
 c.beginPath();c.arc(0,0,b.r,0,7);c.fillStyle='#d1a26d';c.fill();c.shadowBlur=0;
 c.strokeStyle='#a47259';c.lineWidth=2;for(let i=-3;i<=3;i++){c.beginPath();c.ellipse(0,0,20+i*3,24-i*2,i*.15,0,7);c.stroke();}
 c.beginPath();c.arc(0,0,8,0,7);c.fillStyle='#795b56';c.fill();c.restore();
}
function hero(c,q,index,time,localId){
 const color=COLORS[index%COLORS.length],squash=Math.min(.19,(q.squash||0)*.14),stuck=q.stuck;
 c.save();c.translate(q.x,q.y);c.rotate(Math.max(-.2,Math.min(.2,(q.vx||0)*.00035)));
 c.scale(1+squash,1-squash);
 // contact shadow; arms and ears sway according to velocity
 c.fillStyle='#5f4b46';c.globalAlpha=.17;c.beginPath();c.ellipse(0,25,22,4,0,0,7);c.fill();c.globalAlpha=1;
 c.strokeStyle='#4d4741';c.lineCap='round';c.lineWidth=7;
 let sway=Math.sin(time*5+index)*2.5,lean=Math.max(-5,Math.min(5,(q.vx||0)*.025));
 for(const f of [-1,1]){
  c.beginPath();c.moveTo(f*11,12);c.lineTo(f*15+lean,24+sway);c.stroke();
 }
 // Fabric ears
 c.fillStyle=color;c.strokeStyle='#5b4b46';c.lineWidth=2.5;
 for(const f of [-1,1]){c.save();c.translate(f*12,-19);c.rotate(f*(.12+Math.sin(time*3+index)*.08));rounded(c,-8,-13,16,25,7);c.fill();c.stroke();c.restore();}
 c.save();c.shadowColor='rgba(73,53,48,.24)';c.shadowOffsetY=4;c.shadowBlur=5;
 c.beginPath();c.ellipse(0,0,23,24,-.04,0,7);c.fillStyle=color;c.fill();c.shadowBlur=0;c.stroke();c.restore();
 c.beginPath();c.ellipse(-7,-8,12,7,-.2,0,7);c.fillStyle='rgba(255,255,255,.24)';c.fill();
 c.fillStyle=ink;for(const x of [-8,8]){c.beginPath();c.ellipse(x,-2,3.4,4.6,0,0,7);c.fill();}
 c.strokeStyle=ink;c.lineWidth=1.7;c.beginPath();c.arc(0,6,5,.1,Math.PI-.1);c.stroke();
 c.fillStyle='rgba(244,167,145,.75)';for(const x of [-15,15]){c.beginPath();c.ellipse(x,6,4,3,0,0,7);c.fill();}
 // Sewn badge and the velcro patch across the belly
 fill(c,-9,12,18,7,3,'#f7ebdf');stitch(c,-6,15,6,15);
 if(stuck){c.strokeStyle='#fff9e1';c.lineWidth=3;for(let i=0;i<8;i++){let a=i*Math.PI/4;c.beginPath();c.moveTo(Math.cos(a)*27,Math.sin(a)*28);c.lineTo(Math.cos(a)*33,Math.sin(a)*34);c.stroke();}}
 if(q.id===localId){c.strokeStyle='#fff6ca';c.lineWidth=3.2;c.setLineDash([7,7]);c.beginPath();c.arc(0,0,29,0,7);c.stroke();}
 c.restore();
}
export function draw(canvas,view,{me='',time=0}={}){
 if(!canvas||!view)return;
 const r=canvas.getBoundingClientRect(),scale=Math.min(2,window.devicePixelRatio||1);
 if(r.width<10||r.height<10)return;
 const dw=Math.round(r.width*scale),dh=Math.round(r.height*scale);
 if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
 const c=canvas.getContext('2d');
 // Preserve world-unit proportions on every viewport; the camera follows the
 // locally controlled hero instead of squeezing the full level into the phone.
 const portrait=r.height>r.width*1.05;
 const zoom=portrait?Math.max(1,Math.min(1.3,r.height/540)):Math.max(.82,Math.min(r.width/950,r.height/305));
 const visibleWidth=r.width/zoom,visibleHeight=r.height/zoom;
 const focus=view.players.find(p=>p.id===me)||view.players[0]||{x:W/2};
 const targetX=Math.max(0,Math.min(Math.max(0,W-visibleWidth),focus.x-visibleWidth*.43));
 const targetY=Math.max(0,Math.min(Math.max(0,H-visibleHeight),focus.y-visibleHeight*.68));
 const previous=cameras.get(canvas);
 const snap=!previous||previous.hero!==me||Math.abs(previous.zoom-zoom)>.08;
 const cameraX=snap?targetX:previous.x+(targetX-previous.x)*.18;
 const cameraY=snap?targetY:previous.y+(targetY-previous.y)*.12;
 cameras.set(canvas,{hero:me,zoom,x:cameraX,y:cameraY});
 c.setTransform(1,0,0,1,0,0);
 c.clearRect(0,0,dw,dh);
 const ds=scale*zoom;
 c.setTransform(ds,0,0,ds,-cameraX*ds,-cameraY*ds);
 const d=LEVELS[view.level]||LEVELS[0];
 // Deep textile stage: wall felt, oversized stitched patches, cabinets.
 c.fillStyle='#d4d9c7';c.fillRect(0,0,W,H);
 for(let i=0;i<7;i++){
  const x=i*176-45,y=95+(i%2)*36;c.beginPath();c.ellipse(x,y,120,105,0,0,7);
  c.fillStyle=i%2?'#ccd8c2':'#d8ddc9';c.fill();
 }
 c.globalAlpha=.28;c.strokeStyle='#7a8a78';c.lineWidth=1;
 for(let x=10;x<W;x+=19)for(let y=10;y<H;y+=24)if(rand(x*13+y)<.17){c.beginPath();c.moveTo(x,y);c.lineTo(x+7,y+2);c.stroke();}
 c.globalAlpha=1;
 fill(c,0,0,W,69,0,'#eee2d0');stitch(c,14,64,W-14,64);
 fill(c,0,H-22,W,40,0,'#ad8f76');
 // Clothes hanger / pincushion ornaments placed behind the gameplay.
 for(const [x,y,r] of [[126,175,60],[520,145,45],[880,198,63]]){
  c.beginPath();c.arc(x,y,r,0,7);c.strokeStyle='rgba(110,119,99,.14)';c.lineWidth=5;c.stroke();
 }
 // Sewn pocket / exit is always the far-right focal object.
 c.save();c.shadowColor='rgba(45,43,42,.25)';c.shadowBlur=14;c.shadowOffsetY=9;
 fill(c,958,360,80,148,12,'#6d938b');c.restore();
 fill(c,972,376,52,120,14,view.finished?'#f6dc91':'#aac0a8');
 c.strokeStyle='#f5ead4';c.lineWidth=4;c.beginPath();c.moveTo(978,398);c.lineTo(1016,398);c.stroke();
 for(let i=0;i<5;i++)stitch(c,965,380+i*23,965,393+i*23);
 // Board floor and platform geometry.
 d.floors.forEach((s,i)=>platform(c,s,i+5));
 d.platforms.forEach((s,i)=>platform(c,s,i+11));
 for(const s of d.springs||[])spring(c,s,time);
 for(const [i,s] of (d.pads||[]).entries())button(c,s,view.gateOpen||view.pads?.[i]);
 if(d.target){c.strokeStyle='#e3bb6b';c.lineWidth=5;c.beginPath();c.arc(d.target.x,d.target.y-5,37,0,7);c.stroke();c.lineWidth=2;stitch(c,d.target.x-18,d.target.y-5,d.target.x+18,d.target.y-5);}
 if(d.gate&&!view.gateOpen){textile(c,d.gate.x,d.gate.y,d.gate.w,d.gate.h,'#c87663',45);for(let y=d.gate.y+20;y<d.gate.y+d.gate.h-10;y+=25)stitch(c,d.gate.x+3,y,d.gate.x+24,y);}
 if(view.ball)ball(c,view.ball,time);
 // Soft elongated seams show the anchors between stuck players.
 for(const q of view.players)if(q.stuck?.kind==='player'){
  const anchor=view.players.find(v=>v.id===q.stuck.id);if(!anchor)continue;
  c.beginPath();c.moveTo(q.x,q.y);c.quadraticCurveTo((q.x+anchor.x)/2,(q.y+anchor.y)/2-15,anchor.x,anchor.y);
  c.strokeStyle='#f8e5c1';c.lineWidth=7;c.stroke();c.strokeStyle='#8d685a';c.lineWidth=2;c.setLineDash([3,5]);c.stroke();c.setLineDash([]);
 }
 view.players.forEach((q,i)=>hero(c,q,i,time,me));
 if(view.players.some(q=>q.x>905)){
  c.fillStyle='rgba(255,255,255,.95)';c.font='700 17px system-ui';c.textAlign='right';c.fillText('ВСЕ В КАРМАН →',1026,349);
 }
}
