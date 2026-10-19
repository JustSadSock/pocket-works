// PEREKOS v0.9: hand-authored pixel spell choreography. Rendering only.
// All cues originate from a confirmed FX event, current fighter status, or
// a visible projectile. No new targeting, collision, hit timing or damage.
import {mage} from './mages.mjs';
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const palette={fire:['#f7dfa0','#e99965','#9b553e'],storm:['#e9f9da','#9adbd3','#548e93'],stone:['#e2ddb1','#aab99a','#708478']};
const ink=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))};
const stroke=(c,pts,color,width=2)=>{
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(pts[0][0],pts[0][1]);
 for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.stroke();
};
const circle=(c,x,y,r,color,width=2,start=0,end=TAU)=>{
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,Math.max(.1,r),start,end);c.stroke();
};
const fragment=(s,n)=>{
 let v=(Math.imul(s+17,1664525)+Math.imul(n+11,1013904223))>>>0;
 v^=v<<13;v^=v>>>17;v^=v<<5;return(v>>>0)/4294967296;
};
const artStyle={orb:'kindle',flame:'cinder',bolt:'wire',arc:'coil',rock:'pebble',wave:'slate',echo:'kindle'};
const reactionPairs={react_steam:['fire','storm'],react_crack:['storm','stone'],react_slag:['stone','fire']};
export const MAX_SPELL_MOTIFS=24;
export const MAX_SPELL_PROJECTILES=16;
export const MAGE_SIGNS=Object.freeze(['kindle','cinder','wire','coil','pebble','slate']);
function selectSource(state,event){
 const shots=Array.isArray(state.shots)?state.shots:[];
 let found=null,best=Infinity;
 for(const q of shots.slice(0,80)){
  if(!finite(q.x)||!finite(q.y)||!finite(q.vx)||!finite(q.vy))continue;
  // Server snapshots can arrive a few ticks after the launch; only a near
  // match is credible. Falling back to a neutral sign is preferable to lying.
  const d=Math.hypot(q.x-event.x,q.y-event.y);
  if(d<best){best=d;found=q}
 }
 if(found&&best<=35){
  const a=state.actors?.[found.owner];
  return {style:a?.mageId&&MAGE_SIGNS.includes(a.mageId)?a.mageId:artStyle[found.style]||'kindle',
   element:['fire','storm','stone'].includes(found.element)?found.element:'fire'};
 }
 const actors=state.actors||[];
 const a=actors.find(x=>finite(x.x)&&finite(x.y)&&Math.hypot(x.x-event.x,x.y-event.y)<19);
 return {style:MAGE_SIGNS.includes(a?.mageId)?a.mageId:'kindle',element:mage(a?.mageId).school};
}
function motifFrom(event,state,reduced=false){
 const kind=event.k||'';
 const x=Number(event.x),y=Number(event.y);
 if(!finite(x)||!finite(y)||x<-20||x>420||y<-20||y>640)return null;
 const id=Number(event.id)||0;
 if(kind==='shoot'){
  const src=selectSource(state,event);
  return {id,x,y,kind:'cast',style:src.style,element:src.element,age:0,life:reduced?.20:.44};
 }
 if(reactionPairs[kind])return {id,x,y,kind:'reaction',reaction:kind,
  age:0,life:reduced?.34:.82};
 if(kind==='overload')return {id,x,y,kind:'overload',age:0,life:reduced?.24:.65};
 if(kind==='shield')return {id,x,y,kind:'guard',age:0,life:reduced?.22:.48};
 if(kind==='dash')return {id,x,y,kind:'dash',age:0,life:reduced?.2:.36};
 if(kind.startsWith('impact_'))return {id,x,y,kind:'impact',style:artStyle[kind.slice(7)]||'kindle',
  age:0,life:reduced?.16:.4};
 return null;
}
export class SpellChoreography{
 constructor(){this.reset()}
 reset(){this.motifs=[];this.round=null;this.serial=0;this.ticks=-1}
 ingest(state,reduced=false){
  if(!state||!Array.isArray(state.fx))return;
  if(this.round!==state.round||Number(state.serial)<this.serial||
   (finite(state.ticks)&&state.ticks<this.ticks-3)){
   this.reset();this.round=state.round;
  }
  this.ticks=finite(state.ticks)?state.ticks:this.ticks;
  for(const event of state.fx){
   if(!finite(event.id)||event.id<=this.serial)continue;
   const motif=motifFrom(event,state,reduced);
   if(motif)this.motifs.push(motif);
  }
  this.serial=Math.max(this.serial,finite(state.serial)?state.serial:0);
  if(this.motifs.length>MAX_SPELL_MOTIFS)this.motifs.splice(0,this.motifs.length-MAX_SPELL_MOTIFS);
 }
 advance(seconds){
  const dt=clamp(finite(seconds)?seconds:0,0,.05);
  for(const motif of this.motifs)motif.age+=dt;
  this.motifs=this.motifs.filter(m=>m.age<m.life);
 }
}
function drawSigil(c,x,y,r,style,element,t,seed,reduced=false){
 const [bright,body,dark]=palette[element]||palette.fire;
 const s=Math.sin(t*Math.PI),phase=reduced?0:t;
 c.save();c.globalAlpha=clamp((1-t)*1.65,0,.88);
 const radius=r*(.6+.4*t);
 // Six unique outlines are the visual grammar of each actual mage.
 switch(style){
 case 'kindle':{
  circle(c,x,y,radius,body,2,-1.18,1.37);
  circle(c,x-4,y-2,radius*.6,bright,2,-.7,1.5);
  ink(c,x+radius*.7,y-4,4,7,bright);break;
 }
 case 'cinder':{
  for(let i=0;i<5;i++){
   const a=i*TAU/5+phase*.45;
   const rr=radius*(.5+(i%2)*.38);
   ink(c,x+Math.cos(a)*rr,y+Math.sin(a)*rr*.65,5+i%2,3,i%2?dark:bright);
  }
  circle(c,x,y,radius*.62,body,3,.4,3.2);break;
 }
 case 'wire':{
  const w=radius*.94;stroke(c,[[x-w,y+4],[x-w*.35,y-7],[x+w*.1,y+6],[x+w*.55,y-8],[x+w,y-1]],bright,2);
  stroke(c,[[x-w*.6,y+radius*.6],[x+w*.6,y-radius*.6]],body,2);break;
 }
 case 'coil':{
  for(let i=0;i<3;i++)circle(c,x,y,radius*(.45+i*.23),i===1?bright:body,2,
    -1.5+phase*.5+i*.2,1.3+phase*.5+i*.2);
  ink(c,x-2,y-2,4,4,bright);break;
 }
 case 'pebble':{
  const n=5;
  for(let i=0;i<n;i++){
   const a=TAU*i/n+.19,dx=Math.cos(a)*radius*.76,dy=Math.sin(a)*radius*.6;
   ink(c,x+dx-3,y+dy-4,6+(i%2)*3,5,i%2?bright:body);
  }
  stroke(c,[[x-7,y-3],[x+2,y+5],[x+10,y-5]],dark,2);break;
 }
 case 'slate':{
  const d=radius*.62;
  stroke(c,[[x-d,y-d*.3],[x-d*.5,y-d],[x+d*.65,y-d],[x+d,y+d*.3],
   [x+d*.5,y+d],[x-d*.65,y+d],[x-d,y-d*.3]],bright,3);
  stroke(c,[[x-8,y-5],[x+1,y+5],[x+9,y+1]],body,2);break;
 }
 default:circle(c,x,y,radius,bright,2);
 }
 if(!reduced){
  ink(c,x+Math.cos(seed+phase*TAU)*radius,
   y+Math.sin(seed+phase*TAU)*radius*.7,2+Math.round(s),2,bright);
 }
 c.restore();
}
export function drawSpellGround(ctx,choreography,reduced=false){
 if(!ctx||!choreography)return;
 for(const m of choreography.motifs){
  const t=clamp(m.age/m.life,0,1);
  if(m.kind==='cast')drawSigil(ctx,m.x,m.y+8,18,m.style,m.element,t,m.id,reduced);
  else if(m.kind==='reaction'){
   const pairs=reactionPairs[m.reaction],size=21+52*(1-(1-t)**2);
   ctx.save();ctx.globalAlpha=clamp((1-t)*.68,0,.7);
   for(let i=0;i<2;i++){
    const a=i*TAU/2+m.id*.1;
    circle(ctx,m.x,m.y,size,palette[pairs[i]][1],3,a,a+Math.PI*1.05);
   }
   if(m.reaction==='react_crack'){
    // Two facing saw-tooth fault lines in the floor.
    const d=size*.65;
    stroke(ctx,[[m.x-d,m.y-4],[m.x-d*.45,m.y+6],[m.x,m.y-5],
      [m.x+d*.4,m.y+7],[m.x+d,m.y-3]],'#d8dfbe',3);
   }
   ctx.restore();
  }else if(m.kind==='overload'){
   ctx.save();ctx.globalAlpha=(1-t)*.7;
   circle(ctx,m.x,m.y,12+44*t,'#e7a676',3);
   for(let i=0;i<8;i++){
    const a=TAU*i/8+m.id*.13,outer=13+48*t;
    stroke(ctx,[[m.x+Math.cos(a)*11,m.y+Math.sin(a)*8],
     [m.x+Math.cos(a)*outer,m.y+Math.sin(a)*outer*.74]],i%2?'#f1c58f':'#ad6b55',2);
   }ctx.restore();
  }else if(m.kind==='guard'){
   ctx.save();ctx.globalAlpha=(1-t)*.6;
   for(let i=0;i<5;i++){const a=TAU*i/5+.4;
    ink(ctx,m.x+Math.cos(a)*(23+10*t),m.y+Math.sin(a)*(14+10*t),5,4,'#b7d5b6')}
   ctx.restore();
  }
 }
}
export function drawSpellActors(ctx,state,time=0,reduced=false){
 if(!ctx||state?.phase!=='fight')return;
 for(const a of (state.actors||[]).slice(0,2)){
  if(!finite(a.x)||!finite(a.y)||!finite(a.cast)||a.cast<=.08)continue;
  const style=MAGE_SIGNS.includes(a.mageId)?a.mageId:'kindle';
  const school=mage(style).school;
  const t=clamp(a.cast/.7,.04,.94);
  // The glyph is a visible casting afterimage, not a fake pre-fire telegraph.
  drawSigil(ctx,a.x,a.y-19,15,style,school,1-t,a.id,reduced);
 }
}
export function drawSpellProjectiles(ctx,state,time=0,reduced=false){
 if(!ctx||state?.phase!=='fight')return;
 let count=0;
 for(const shot of state.shots||[]){
  if(++count>MAX_SPELL_PROJECTILES)break;
  if(!finite(shot.x)||!finite(shot.y)||!finite(shot.vx)||!finite(shot.vy))continue;
  const style=artStyle[shot.style]||'kindle';
  const el=['fire','storm','stone'].includes(shot.element)?shot.element:'fire';
  const speed=Math.hypot(shot.vx,shot.vy)||1,dx=shot.vx/speed,dy=shot.vy/speed;
  const x=shot.x,y=shot.y,phase=reduced?0:time*9,offset=Math.sin(phase+(shot.owner||0)*3);
  const [bright,body,dark]=palette[el];
  ctx.save();ctx.globalAlpha=reduced?.68:.82;
  // Material, not just hue, signals projectile identity.
  switch(style){
  case 'kindle':
   circle(ctx,x,y,Math.max(5,(shot.r||5)+5),body,2,-1.5+phase*.4,1.1+phase*.4);
   ink(ctx,x-dx*11-2,y-dy*11-2,4,4,bright);break;
  case 'cinder':
   for(let j=0;j<3;j++){
    const d=8+j*9;
    ink(ctx,x-dx*d-dy*(j-1)*4,y-dy*d+dx*(j-1)*4,6-j,4+j, j===1?dark:body);
   }
   ink(ctx,x-dy*6-2,y+dx*6-2,4,4,bright);break;
  case 'wire':
   for(let j=0;j<3;j++){
    const d=7+j*7;
    const lateral=(j%2?1:-1)*(4+offset*1.5);
    stroke(ctx,[[x-dx*(d-4),y-dy*(d-4)],
      [x-dx*d-dy*lateral,y-dy*d+dx*lateral],
      [x-dx*(d+5),y-dy*(d+5)]],j%2?bright:body,2);
   }break;
  case 'coil':
   for(let j=0;j<3;j++){
    const d=7+j*8,side=(j%2?1:-1)*(7+offset*1.2);
    circle(ctx,x-dx*d-dy*side,y-dy*d+dx*side,3+j%2,j%2?bright:body,2);
   }break;
  case 'pebble':
   for(let j=0;j<3;j++){
    const d=9+j*10;
    ink(ctx,x-dx*d-dy*(j%2?7:-4)-3,y-dy*d+dx*(j%2?7:-4)-3,
     6-j,5-j, j===0?bright:dark);
   }break;
  case 'slate':
   const px=x-dx*12,py=y-dy*12;
   stroke(ctx,[[px-dy*10,py+dx*10],[px+dx*6,py+dy*6],
     [px+dy*10,py-dx*10]],bright,3);
   stroke(ctx,[[px-dy*5,py+dx*5],[px-dx*9,py-dy*9]],body,2);break;
  }
  ctx.restore();
 }
}
export function drawSpellForeground(ctx,choreography,reduced=false){
 if(!ctx||!choreography)return;
 for(const m of choreography.motifs){
  const t=clamp(m.age/m.life,0,1);
  if(m.kind==='impact'){
   ctx.save();ctx.globalAlpha=(1-t)*.8;
   const n=reduced?3:6,kind=m.style;
   for(let i=0;i<n;i++){
    const angle=TAU*i/n+fragment(m.id,i)*.35;
    const d=7+32*(1-(1-t)**2),x=m.x+Math.cos(angle)*d,y=m.y+Math.sin(angle)*d*.8;
    const color=palette[mage(kind).school][i%3];
    if(kind==='wire'||kind==='coil')stroke(ctx,[[x-4,y-3],[x+3,y+2],[x-2,y+6]],color,2);
    else ink(ctx,x,y,kind==='slate'||kind==='pebble'?7:3,kind==='slate'?4:6,color);
   }
   ctx.restore();
  }else if(m.kind==='reaction'){
   ctx.save();ctx.globalAlpha=(1-t)*.92;
   const pair=reactionPairs[m.reaction];
   const r=7+40*t;
   // Steam: rising curls; crack: hard shards; slag: falling molten chips.
   for(let i=0;i<(reduced?4:9);i++){
    const f=fragment(m.id,i+5),a=TAU*(i/9)+f*.3;
    const x=m.x+Math.cos(a)*r,y=m.y+Math.sin(a)*r*.72-(m.reaction==='react_steam'?t*27:0);
    const color=palette[pair[i%2]][i%3];
    if(m.reaction==='react_steam')circle(ctx,x,y,3+i%3,color,2,-1.2,1.4);
    else if(m.reaction==='react_crack')stroke(ctx,[[x-4,y+4],[x+2,y-4],[x+6,y+1]],color,3);
    else ink(ctx,x,y-t*12,5+i%3,4+i%2,color);
   }
   ctx.restore();
  }
 }
}
