import assert from 'node:assert/strict';
import { generateEndlessLevel, inspectEndlessLevel } from './procedural.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { makeStoneRimProfile } from './curb-profile.js';

function distanceToSegment(p,a,b) {
  const dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
}
for(const depth of [0,1,2,4,9,16]){
  for(let seed=1;seed<=10;seed++){
    const level=generateEndlessLevel(seed*13579,depth);
    assert.deepEqual(inspectEndlessLevel(level).issues,[], 'raw generated layout valid');
    assert.ok(level.outline.length>40,'banks subdivided into a continuous outline');
    const compiled=compileCourse19(level);
    const inspection=inspectCourse19(compiled);
    assert.ok(inspection.ok, 'compiled course valid: '+JSON.stringify({seed,depth,issues:inspection.issues}));
    const profile=makeStoneRimProfile(compiled.outline, compiled.course18.field.heightAt);
    assert.equal(profile.length,compiled.outline.length);
    for(let i=0;i<profile.length;i++){
      assert.ok(profile[i].inner.every(Number.isFinite),'finite curb');
      assert.ok(Math.hypot(profile[i].inner[0]-compiled.outline[i].x,profile[i].inner[1]-compiled.outline[i].y)<1e-6,'rim anchored to physical edge');
    }
    for(const rotor of compiled.rotors||[]){
      const clearance=Math.min(...compiled.outline.map((p,i)=>distanceToSegment(rotor,p,compiled.outline[(i+1)%compiled.outline.length])));
      assert.ok(rotor.length/2+rotor.thickness/2+15<=clearance+1.001,'rotor must not sweep outside course');
    }
  }
}
console.log('Moss & Marble 1.24: 60 compiled procedural holes, rims and rotors checked.');
