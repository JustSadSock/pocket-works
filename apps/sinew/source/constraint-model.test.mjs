import assert from 'node:assert/strict';
import { ConstraintArm, vec3 } from './constraint-model.js';

const dt=1/120;
function runImpulse(dx,dy,label){
  const arm=new ConstraintArm(); arm.reset(vec3());
  let maxSpeed=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
  let prev=arm.pose().tip;
  for(let i=0;i<220;i++){
    const burst=i<20?vec3(dx,dy,Math.hypot(dx,dy)*.08):vec3();
    const pose=arm.step({shoulder:vec3(),guardHand:vec3(.24,-.13,.55),guardTip:vec3(.32,-.03,1.57),drive:burst,brace:.8,dt});
    const speed=Math.hypot(pose.tip.x-prev.x,pose.tip.y-prev.y,pose.tip.z-prev.z)/dt;maxSpeed=Math.max(maxSpeed,speed);prev=pose.tip;
    minX=Math.min(minX,pose.tip.x);maxX=Math.max(maxX,pose.tip.x);minY=Math.min(minY,pose.tip.y);maxY=Math.max(maxY,pose.tip.y);minZ=Math.min(minZ,pose.tip.z);maxZ=Math.max(maxZ,pose.tip.z);
    assert(Math.abs(pose.upperLength-.34)<.008,`${label}: upper arm stretched`);
    assert(Math.abs(pose.lowerLength-.33)<.008,`${label}: forearm stretched`);
    assert(Math.abs(pose.toolLength-1.04)<.008,`${label}: tool stretched`);
    for(const point of [pose.elbow,pose.hand,pose.tip]) for(const n of Object.values(point)) assert(Number.isFinite(n),`${label}: non-finite point`);
  }
  return{label,maxSpeed,x:maxX-minX,y:maxY-minY,z:maxZ-minZ,final:arm.pose()};
}

const reports=[runImpulse(1.8,0,'horizontal'),runImpulse(-1.8,0,'backhand'),runImpulse(0,-1.8,'overhead'),runImpulse(0,1.8,'rising'),runImpulse(1.4,-1.4,'diagonal')];

// Build gates protect physical/numerical correctness. Exact arc widths are tuning metrics,
// not deployment contracts: changing brace, guard or mass should not brick the whole site.
for(const r of reports){
  const totalSpan=r.x+r.y+r.z;
  assert(totalSpan>.08,`${r.label}: input produced no meaningful motion`);
  assert(r.maxSpeed>1.0,`${r.label}: solver stopped responding`);
  assert(r.maxSpeed<28,`${r.label}: solver exploded`);
}

const arm=new ConstraintArm();arm.reset(vec3());
for(let i=0;i<14400;i++){
  const phase=(i%720)/720*Math.PI*2,active=(i%180)<26;const drive=active?vec3(Math.sin(phase)*1.8,Math.cos(phase*1.7)*1.6,.12):vec3();
  const p=arm.step({shoulder:vec3(),guardHand:vec3(.24,-.13,.55),guardTip:vec3(.32,-.03,1.57),drive,brace:.76,dt});
  assert(Math.abs(p.upperLength-.34)<.009&&Math.abs(p.lowerLength-.33)<.009&&Math.abs(p.toolLength-1.04)<.009,'long sparring accumulated stretch');
  for(const point of [p.elbow,p.hand,p.tip]) for(const n of Object.values(point)) assert(Number.isFinite(n),'long sparring produced a non-finite point');
}

console.log('SINEW constraint diagnostics:',reports.map(r=>`${r.label} ${r.maxSpeed.toFixed(1)}m/s span=${r.x.toFixed(2)}/${r.y.toFixed(2)}/${r.z.toFixed(2)}`).join(' | '));
console.log('SINEW constraint invariants passed');
