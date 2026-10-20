// PEREKOS / actor performance grammar. Cosmetic only.
// Distinct casting languages express the mass of the six disciplines
// through the non-weapon arm, grounded feet and trailing cloth.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));
const pulse=(n)=>clamp(n,0,1);
const FROZEN=Object.freeze({
 kindle:Object.freeze({reach:12,draw:-6,release:8,guard:-9,elbow:-7,hop:2,drag:1.25,curve:.3}),
 cinder:Object.freeze({reach:-7,draw:-12,release:15,guard:-5,elbow:5,hop:1,drag:1.6,curve:-.8}),
 wire:Object.freeze({reach:17,draw:-11,release:-7,guard:-7,elbow:-8,hop:3,drag:.72,curve:1}),
 coil:Object.freeze({reach:-5,draw:9,release:12,guard:-6,elbow:6,hop:1.4,drag:1.13,curve:.9}),
 pebble:Object.freeze({reach:5,draw:-4,release:-12,guard:-12,elbow:-2,hop:.5,drag:1.88,curve:-.5}),
 slate:Object.freeze({reach:-11,draw:6,release:-17,guard:-15,elbow:7,hop:.35,drag:2.1,curve:-.1})
});
export const PERFORMANCE=FROZEN;
export function actingSignature(id){
 const p=PERFORMANCE[id]||PERFORMANCE.kindle;
 return [p.reach,p.draw,p.release,p.guard,p.elbow,p.hop,p.drag,p.curve].join('/');
}
export function performancePose(id,pose={},reduced=false){
 const p=PERFORMANCE[id]||PERFORMANCE.kindle;
 const windup=pulse(pose.windup),release=pulse(pose.release),recover=pulse(pose.recover);
 const move=reduced?0:pulse(pose.move),guard=pulse(pose.guard),impact=reduced?0:pulse(pose.impact);
 const left=clamp(pose.leftStep,-1,1),right=clamp(pose.rightStep,-1,1);
 const strafe=clamp(pose.strafe,-1,1),dash=reduced?0:pulse(pose.dash);
 // Foot contacts are opposed, not the previous in-phase oscillating pair.
 // Lift is never negative, and never performed for an idle fighter.
 const leftLift=move*clamp(left,0,1)*p.hop;
 const rightLift=move*clamp(right,0,1)*p.hop;
 const brace=guard*(p.guard/3),jerk=impact*5;
 // Hands live in *torso-local* pixels; the head and costume stay independent.
 const elbowX=-13+p.elbow*.28*windup+strafe*1.2;
 const elbowY=-4-3.7*windup+2*release+brace*.45;
 const handX=-18+p.reach*.45*windup+p.release*.5*release-
   p.release*.18*recover+jerk*.3;
 const handY=5+p.draw*.52*windup-9*release+3*recover+brace-jerk*.6;
 const wrists=clamp(p.curve*windup-.65*release, -1,1);
 // Delayed cloth follows actual contact motion and striking impulse.
 const hem=clamp((windup*1.5-release*2+recover*.6+dash*2)*p.drag+
   (reduced?0:(pose.cloth||0)*.35),-7,7);
 const grounded=clamp(guard*.9+windup*(id==='slate'||id==='pebble'?1.1:.35),0,1.5);
 const shoulders=clamp(.25*windup+.6*release-.4*recover,-.8,1);
 return {elbowX,elbowY,handX,handY,wrists,hem,grounded,
   leftLift,rightLift,shoulders,headFocus:clamp(.15+windup*.55+release*.85+impact*.8,0,1),
   // All coordinates are visual: no gameplay aim, position or speed is returned.
   active:windup+release+recover>0.01};
}
