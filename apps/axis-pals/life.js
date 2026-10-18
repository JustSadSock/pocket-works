// ОСИ / v1.4 — context-bound character reactions.
// Everything is derived from a local authoritative-state transition. No random game state.
// When a PocketNet revision arrives, both clients derive the same reaction from the same positions.
export const REACTION_MS=Object.freeze({
 duet:1380,comfort:920,relief:650,blocked:700,partner:860,
 arrival:980,nearby:560
});
const same=(a,b)=>a?.x===b?.x&&a?.y===b?.y;
const onDock=(p,g)=>same(p,g);
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export function makeReaction(motion,level,phase='play',at=0){
 if(!motion||!Array.isArray(motion.from)||!Array.isArray(motion.to)||motion.to.length!==2||!Array.isArray(level?.goals))return null;
 const before=motion.from,after=motion.to,blocked=motion.blocked||[false,false];
 let kind=null,faces=null;
 if(phase==='won'||phase==='complete'){kind='duet';faces=['cheer','cheer']}
 else if(phase==='lost'){kind='comfort';faces=['concerned','reassure']}
 else if(motion.kind==='undo'){kind='relief';faces=['relieved','relieved']}
 else if(blocked.every(Boolean)){kind='blocked';faces=['startled','grumble']}
 else{
  const arrival=[0,1].map(i=>!onDock(before[i],level.goals[i])&&onDock(after[i],level.goals[i]));
  if(arrival.some(Boolean)){
   kind='arrival';faces=arrival.map(ok=>ok?'proud':'reassure');
  }else if(blocked.some(Boolean)){
   kind='partner';faces=blocked.map((v,i)=>v?(i===0?'startled':'grumble'):'reassure');
  }else if(dist(after[0],after[1])<=2&&dist(before[0],before[1])<=2){
   kind='nearby';faces=['curious','wave'];
  }
 }
 if(!kind)return null;
 return {kind,faces,at,duration:REACTION_MS[kind],positions:after.map(p=>({x:p.x,y:p.y}))};
}
export function reactionFrame(reaction,now,reduced=false){
 if(!reaction||!Number.isFinite(now)||!Number.isFinite(reaction.at))return null;
 const age=now-reaction.at;
 if(age<0||age>=reaction.duration)return null;
 const t=clamp(age/reaction.duration);
 return {
  kind:reaction.kind,faces:reaction.faces,progress:t,
  // Motion reduction keeps a short, static expressive face, but removes the bounce/bubbles.
  motion:reduced?0:Math.sin(Math.PI*t),
  alpha:reduced?1:clamp((1-t)*3),
  reduced
 };
}
export function idleMoment(lastAction,now,reduced=false){
 if(reduced||!Number.isFinite(now)||!Number.isFinite(lastAction))return null;
 const elapsed=now-lastAction;
 // One restrained 420 ms reaction after genuine inactivity. Never periodic dancing.
 if(elapsed>=6250&&elapsed<6670)return {id:0,face:'curious',strength:Math.sin(Math.PI*(elapsed-6250)/420)};
 return null;
}
const dot=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill()};
const line=(c,x1,y1,x2,y2,color,width)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke()};
function spark(c,x,y,s,tint,energy){
 c.save();c.translate(x,y);c.rotate(-.2);
 c.globalAlpha=energy;
 line(c,-s*.2,0,s*.2,0,tint,Math.max(1,s*.045));
 line(c,0,-s*.2,0,s*.2,tint,Math.max(1,s*.045));
 dot(c,0,0,s*.045,'#fff5cf');
 c.restore();
}
export function drawReactions(c,reaction,positions,size,now,reduced=false){
 const frame=reactionFrame(reaction,now,reduced);
 if(!frame||frame.reduced||!Array.isArray(positions)||positions.length!==2||size<=0)return;
 const {kind,progress,motion,alpha}=frame;
 c.save();c.lineCap='round';
 if(kind==='duet'){
  // Three-beat cooperative handoff: acknowledge / radio pulse / settle.
  // Each bot celebrates IN ITS OWN CELL; no teleportation or confusion about occupancy.
  const beat=clamp((progress-.13)/.62);
  for(let i=0;i<2;i++){
   const p=positions[i],x=(p.x+.5)*size,y=(p.y+.5)*size;
   c.globalAlpha=alpha*.86;
   spark(c,x+(i?-.21:.21)*size,y-.43*size,size,i?'#f4bd7c':'#89dccc',Math.sin(Math.PI*beat)**2);
   if(beat>0&&beat<1){
    const up=size*(.17+.10*beat);
    line(c,x-size*.17,y-up,x-size*.23,y-up-size*.06,'#f8ebbf',Math.max(1,size*.035));
    line(c,x+size*.17,y-up,x+size*.23,y-up-size*.06,'#f8ebbf',Math.max(1,size*.035));
   }
  }
  // Short connecting "we did it" ping only in mid-celebration, not a permanent laser.
  const strength=clamp((progress-.3)/.12)*clamp((.83-progress)/.2);
  if(strength>0){
   const a=positions[0],b=positions[1];
   c.setLineDash([size*.075,size*.12]);
   c.globalAlpha=.23*strength;
   line(c,(a.x+.5)*size,(a.y+.2)*size,(b.x+.5)*size,(b.y+.2)*size,'#f8e7b1',Math.max(1,size*.028));
   c.setLineDash([]);
  }
 }else{
  for(let i=0;i<2;i++){
   const face=frame.faces[i];
   if(!['startled','grumble','reassure','proud','concerned','wave','relieved'].includes(face))continue;
   const p=positions[i],x=(p.x+.5)*size,y=(p.y+.5)*size;
   const lift=motion*size*.11;
   c.globalAlpha=alpha*.75;
   if(face==='startled'){
    line(c,x+size*.18,y-size*.47-lift,x+size*.18,y-size*.62-lift,'#fff2bf',Math.max(1,size*.04));
    dot(c,x+size*.18,y-size*.70-lift,size*.023,'#f3ca7c');
   }else if(face==='grumble'||face==='concerned'){
    c.beginPath();c.ellipse(x+size*.2,y-size*.58-lift,size*.12,size*.055,-.2,0,Math.PI*2);
    c.strokeStyle='#b8876e';c.lineWidth=Math.max(1,size*.025);c.stroke();
   }else if(face==='proud'){
    spark(c,x+size*.23,y-size*.5-lift,size,'#f8dba2',.8);
   }else if(face==='reassure'||face==='wave'||face==='relieved'){
    const offset=i===0?1:-1;
    line(c,x+offset*size*.16,y-size*.48-lift,x+offset*size*.27,y-size*.56-lift,'#f4e1b3',Math.max(1,size*.04));
   }
  }
 }
 c.restore();
}
