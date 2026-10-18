// ОСИ / v1.1 — character acting layer. No influence on simulation or PocketNet.
// Motion descriptors are local visual state; authoritative cell coordinates remain intact.
export const ROBOTS=Object.freeze([
 {name:'Тихоня',axis:'Y',shell:'#57c2b2',shade:'#247f77',rim:'#205850',lid:'#267f75',badge:'#dfd9aa'},
 {name:'Шустрик',axis:'X',shell:'#f59a70',shade:'#bb563f',rim:'#853e35',lid:'#b85139',badge:'#f0c77e'}
]);
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const ease=t=>{t=clamp(t);return t*t*(3-2*t)};
const same=(a,b)=>a.x===b.x&&a.y===b.y;
const copy=p=>({x:p.x,y:p.y});
export function describeMove(from,to,at,direction='',kind='move'){
 if(!Array.isArray(from)||!Array.isArray(to)||from.length!==2||to.length!==2)return null;
 const f=from.map(copy),t=to.map(copy);
 const delta=t.map((p,i)=>({x:p.x-f[i].x,y:p.y-f[i].y}));
 const moved=delta.map(d=>d.x!==0||d.y!==0);
 if(!moved.some(Boolean))return null;
 // One global command applies to both bodies; a blocked body has zero displacement.
 const representative=delta[moved.findIndex(Boolean)];
 let dx=direction==='left'?-1:direction==='right'?1:direction==='up'||direction==='down'?0:Math.sign(representative.x);
 let dy=direction==='up'?-1:direction==='down'?1:direction==='left'||direction==='right'?0:Math.sign(representative.y);
 if(kind==='undo'){dx=Math.sign(representative.x);dy=Math.sign(representative.y)}
 return {from:f,to:t,at,dx,dy,blocked:moved.map(x=>!x),kind};
}
export function bumpMotion(positions,at,direction){
 const p=positions.map(copy);
 return {from:p,to:p.map(copy),at,dx:direction==='left'?-1:direction==='right'?1:0,dy:direction==='up'?-1:direction==='down'?1:0,blocked:[true,true],kind:'move'};
}
export function poseFor(motion,index,now,reduced=false){
 if(!motion||reduced||!Number.isFinite(now))return {x:motion?.to?.[index]?.x??0,y:motion?.to?.[index]?.y??0,travel:0,impact:0,lean:0,hop:0,dx:0,dy:0};
 const from=motion.from[index],to=motion.to[index],elapsed=Math.max(0,now-motion.at),t=clamp(elapsed/310);
 const blocked=motion.blocked[index]&&motion.kind!=='undo';
 const travelling=!same(from,to);
 // 0–11% anticipation; 11–84% travel; 84–100% soft settle.
 const slide=t<.11?0:ease((t-.11)/.77);
 const progress=clamp(slide);
 const impact=blocked?Math.sin(Math.PI*clamp(elapsed/330)):0;
 const hop=travelling?Math.sin(Math.PI*progress)*.065:0;
 const lean=travelling?Math.sin(Math.PI*t)*.075:0;
 const recoil=blocked?Math.sin(Math.PI*clamp(elapsed/245))*.048:0;
 return {
  x:from.x+(to.x-from.x)*progress-motion.dx*recoil,
  y:from.y+(to.y-from.y)*progress-motion.dy*recoil,
  travel:travelling?Math.sin(Math.PI*progress):0,impact,lean,hop,dx:motion.dx,dy:motion.dy
 };
}
export function robotMood({onGoal=false,win=false,impact=0,travelling=false,idleTime=0,reduced=false}={}){
 if(win)return 'celebrate';
 if(impact>.22)return 'squint';
 if(onGoal)return 'pleased';
 if(travelling)return 'focused';
 if(!reduced&&idleTime>0&&idleTime%10500>8250&&idleTime%10500<8550)return 'curious';
 return 'idle';
}
function rr(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}
function fill(c,color){c.fillStyle=color;c.fill()}
function stroke(c,color,width){c.strokeStyle=color;c.lineWidth=width;c.stroke()}
function disk(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);fill(c,color)}
function eye(c,x,y,w,h,look,blink){
 c.fillStyle='#fffef0';rr(c,x-w/2,y-h/2,w,h,Math.min(w,h)*.44);c.fill();
 if(blink)return;
 disk(c,x+look*w*.22,y+h*.075,w*.26,'#203b39');
 disk(c,x+look*w*.22-w*.065,y-h*.05,w*.08,'#ffffff');
}
function drawMouth(c,id,mood){
 c.save();c.translate(0,.067);
 c.lineCap='round';c.lineWidth=.026;c.strokeStyle='#25423e';
 c.beginPath();
 if(mood==='squint'){c.ellipse(0,0,.035,.06,0,0,2*Math.PI);c.stroke()}
 else if(mood==='celebrate'){c.moveTo(-.075,-.015);c.quadraticCurveTo(0,.115,.078,-.015);c.stroke()}
 else if(id===0){
  c.moveTo(-.055,0);c.quadraticCurveTo(0,mood==='pleased'?.06:.025,.057,0);c.stroke();
 }else{
  c.moveTo(-.077,-.013);c.quadraticCurveTo(.012,.08,.086,-.02);c.stroke();
  if(mood==='pleased'){c.beginPath();c.moveTo(-.04,.028);c.lineTo(.055,.025);c.stroke()}
 }
 c.restore();
}
export function drawRobot(c,id,p,other,size,now,pose,{onGoal=false,win=false,reduced=false}={}){
 const palette=ROBOTS[id];if(!palette||!p)return;
 const moving=pose?.travel>.06,impact=pose?.impact||0;
 const mood=robotMood({onGoal,win,impact,travelling:moving,idleTime:now+id*1700,reduced});
 const blink=!reduced&&!win&&mood==='idle'&&((now+id*1930)%4350)<110;
 const glance=other?clamp((other.x-p.x)/3,-1,1):0;
 const look=mood==='squint'?0:clamp((pose?.dx||0)*.4+glance*.6,-1,1);
 const moveBreath=!reduced&&mood==='idle'?Math.sin(now*.0016+id*1.3)*.006:0;
 const celebrate=win&&!reduced?Math.sin(now*.018+id*.6):0;
 const squish=impact*.21;
 const sway=pose?.lean||0;
 const ox=(p.x+.5)*size,oy=(p.y+.5)*size;
 c.save();c.translate(ox,oy);
 // Contact shadow remains anchored at the target plane even during hopping.
 c.fillStyle='#1f4d4755';c.beginPath();c.ellipse(.02*size,.32*size,size*(.34-impact*.02),size*.095,0,0,Math.PI*2);c.fill();
 c.translate(-(pose?.dx||0)*sway*size*.09,-((pose?.hop||0)+Math.max(0,celebrate)*.055)*size);
 c.rotate(((pose?.dx||0)*sway+celebrate*.028)*.48);
 c.scale(size*(1-squish*(pose?.dx?1:.16)),size*(1-squish*(pose?.dy?1:.16)+moveBreath));
 // Wheels are still small enough to read at the smallest gameplay tile.
 c.fillStyle='#314d49';
 rr(c,-.33,.20,.16,.17,.035);c.fill();
 rr(c,.18,.20,.16,.17,.035);c.fill();
 c.fillStyle='#819792';rr(c,-.31,.22,.09,.04,.02);c.fill();rr(c,.22,.22,.09,.04,.02);c.fill();
 // Different silhouettes: compact shy cube vs wide fast courier with side tabs.
 if(id===0){
  c.strokeStyle=palette.rim;c.lineWidth=.038;c.lineCap='round';c.beginPath();c.moveTo(0,-.29);c.lineTo(-.018,-.39);c.stroke();
  disk(c,-.02,-.41,.053,'#f6c87b');
 }else{
  c.fillStyle=palette.shade;rr(c,-.43,-.18,.14,.22,.045);c.fill();rr(c,.29,-.18,.14,.22,.045);c.fill();
  c.fillStyle='#fff0ce';disk(c,-.36,-.08,.033,'#ffe0a5');disk(c,.36,-.08,.033,'#ffe0a5');
 }
 // Side extrusion and main enamel shell.
 c.fillStyle=palette.rim;rr(c,-.345,-.295,.69,.60,.138);c.fill();
 c.fillStyle=palette.shade;rr(c,-.345,-.245,.69,.565,.13);c.fill();
 c.fillStyle=palette.shell;rr(c,-.345,-.307,.69,.555,.135);c.fill();
 c.fillStyle='#ffffff40';rr(c,-.27,-.258,.52,.08,.034);c.fill();
 // Faceplate and eyes make the actor visible from far away.
 c.fillStyle='#e5e9db';rr(c,-.27,-.15,.54,.295,.095);c.fill();
 c.fillStyle='#a8c0b6';rr(c,-.25,.108,.50,.034,.017);c.fill();
 c.save();c.beginPath();c.rect(-.25,-.15,.50,.29);c.clip();
 if(mood==='squint'){
  c.lineCap='round';c.strokeStyle='#304d48';c.lineWidth=.035;
  for(const x of [-.135,.135]){c.beginPath();c.moveTo(x-.063,-.03);c.lineTo(x+.055,.015);c.stroke()}
 }else{
  const y=id===0?-.035:-.035,wide=id===0?.123:.111;
  eye(c,-.135,y,wide,.143,look,blink);eye(c,.135,y,wide,.143,look,blink);
 }
 drawMouth(c,id,mood);c.restore();
 // Personality: a cautious badge on Y, high-speed chevrons on X.
 c.fillStyle=palette.badge;
 if(id===0){disk(c,.22,.24,.039,palette.badge)}
 else{c.beginPath();c.moveTo(.15,.24);c.lineTo(.22,.21);c.lineTo(.17,.285);c.closePath();c.fill()}
 if(onGoal||win){c.fillStyle='#fff3c8';disk(c,-.22,.23,.025,'#fff3c8');disk(c,-.14,.23,.014,'#fff3c8')}
 c.restore();
}
