import test from 'node:test';
import assert from 'node:assert/strict';
import {TURN_SECONDS,buildCourse,sampleCourse,courseSpeed} from './course-motion.js';

const ship=(lengths)=>({x:0,y:0,orders:[
 {kind:'hold',route:lengths[0]>0?[{x:lengths[0],y:0}]:[]},
 {kind:'shoot',route:lengths[1]>0?[{x:lengths[0]+lengths[1],y:0}]:[]}
]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('only the first order has a course: ship travels over the entire turn',()=>{
 const c=buildCourse(ship([140,0]));
 near(sampleCourse(c,TURN_SECONDS*.25).x,35);
 near(sampleCourse(c,TURN_SECONDS*.5).x,70);
 near(sampleCourse(c,TURN_SECONDS*.75).x,105);
 near(sampleCourse(c,TURN_SECONDS).x,140);
});
test('only the SECOND order has waypoints: sailing starts at zero, not mid-turn',()=>{
 const c=buildCourse(ship([0,105]));
 near(sampleCourse(c,TURN_SECONDS*.25).x,26.25);
 near(sampleCourse(c,TURN_SECONDS*.75).x,78.75);
});
test('two action stages are one uninterrupted route, with no stage-boundary pause',()=>{
 const c=buildCourse(ship([60,80]));
 near(sampleCourse(c,TURN_SECONDS*.49).x,68.6);
 near(sampleCourse(c,TURN_SECONDS*.50).x,70);
 near(sampleCourse(c,TURN_SECONDS*.51).x,71.4);
 near(sampleCourse(c,TURN_SECONDS).x,140);
});
test('five versus ten movement points: same time, exactly twice the distance and speed',()=>{
 const five=buildCourse(ship([175,0])),ten=buildCourse(ship([350,0]));
 near(courseSpeed(ten)/courseSpeed(five),2);
 for(const fraction of [.1,.25,.5,.75,1])
  near(sampleCourse(ten,TURN_SECONDS*fraction).x,2*sampleCourse(five,TURN_SECONDS*fraction).x);
});
test('time stepping is deterministic and reaches the final waypoint at the turn end',()=>{
 const s={x:100,y:340,orders:[
  {route:[{x:130,y:300},{x:220,y:280}]},
  {route:[{x:310,y:390}]}
 ]};
 const c=buildCourse(s);
 const points=[45,90,135,270,540].map(n=>sampleCourse(c,TURN_SECONDS*n/135));
 for(const p of points){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));}
 near(points.at(-1).x,310);near(points.at(-1).y,390);
 near(sampleCourse(c,TURN_SECONDS+2).x,310);
});
test('empty courses neither invent movement nor require stage-one actions',()=>{
 const c=buildCourse(ship([0,0]));
 near(c.total,0);near(courseSpeed(c),0);
 near(sampleCourse(c,2.25).x,0);
});
