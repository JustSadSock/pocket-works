// PEREKOS / eight-direction anatomy without changing hit detection.
// World angles: 0=right, +PI/2=down (front), -PI/2=up (back).
// The simulation heading is authoritative. This renderer only decides which
// face, costume planes and body projection are visible to the camera.
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const DIRECTIONS=Object.freeze(['E','SE','S','SW','W','NW','N','NE']);
export function normalizeFacing(angle){
 if(!Number.isFinite(angle))return 0;
 return ((angle+Math.PI)%TAU+TAU)%TAU-Math.PI;
}
export function facingSector(angle){
 const a=normalizeFacing(angle);
 return ((Math.round(a/(Math.PI/4))%8)+8)%8;
}
export function faceView(angle){
 const a=normalizeFacing(angle),sector=facingSector(a);
 const forward=Math.sin(a),side=Math.cos(a);
 const front=clamp((forward+.32)/.87,0,1);
 const back=clamp((-.18-forward)/.82,0,1);
 const profile=clamp(1-Math.abs(forward),0,1);
 const quarter=clamp(Math.abs(forward*side)*2,0,1);
 return {
  sector,heading:a,label:DIRECTIONS[sector],
  left:side<0,front,back,profile,quarter,
  // A side-facing torso occupies less width than a front-facing one, while
  // the hitbox and projectile origin remain exactly where core placed them.
  shoulderScale:.77+.23*Math.abs(forward),
  headOffset:side<0?-profile*.9:profile*.9,
  // Whether the near eye is visible and the far eye is obscured.
  eyes:back>.58?0:profile>.74?1:quarter>.42?1:2,
  isRear:back>.58,
  isSide:profile>.74,
  isQuarter:quarter>.42,
  weaponFront:forward>.02,
  // Back-facing armor covers the chest insignia. In all other directions
  // the official Pocket avatar's face/coat art remains visible.
  showChest:back<.7,
 };
}
export function signedTurn(from,to){
 return normalizeFacing(to-from);
}
export function artFacing(origin,target){
 if(!origin||!target)return 0;
 const dx=target.x-origin.x,dy=target.y-origin.y;
 return !Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<.001
  ?0:Math.atan2(dy,dx);
}
export function directionalOcclusion(ctx,view,{trim='#c6af8a',coat='#65765f',shade='#34483f',
  cloth=0,school='fire'}={}){
 if(!ctx||!view)return;
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))};
 ctx.save();
 if(view.back>.25){
  ctx.globalAlpha=Math.min(1,view.back);
  // Back of the cloak: two distinct folds, padded backplate and a collar.
  const drift=Math.max(-5,Math.min(5,cloth));
  ctx.fillStyle=shade;ctx.beginPath();
  ctx.moveTo(-11,-6);ctx.lineTo(10,-6);ctx.lineTo(13+drift*.24,17);
  ctx.lineTo(3+drift*.4,21);ctx.lineTo(-2+drift*.1,17);
  ctx.lineTo(-9+drift*.2,20);ctx.lineTo(-14,-1);ctx.closePath();ctx.fill();
  rect(-11,-7,22,5,coat);
  rect(-9,-2,4,18,coat);rect(5,-2,4,18,coat);
  rect(-1,-5,3,22,trim);
  rect(-8,7,16,2,'#1b332b');
  if(school==='stone'){rect(-10,-7,20,5,'#849980');rect(-8,10,16,4,'#6b7e6d')}
  if(school==='storm'){rect(-9,7,3,8,'#85c2ba');rect(6,7,3,8,'#82bcb6')}
  if(school==='fire'){rect(-10,11,4,4,'#b97e54');rect(7,11,3,4,'#d39365')}
 }else if(view.profile>.55){
  // The far arm is hidden by the torso in profile rather than drawn on top.
  ctx.globalAlpha=(view.profile-.55)/.45;
  rect(-13,-5,4,15,shade);
  rect(-12,8,4,4,trim);
 }
 ctx.restore();
}
