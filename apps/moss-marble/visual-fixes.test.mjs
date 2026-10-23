import assert from 'node:assert/strict';
import { generateEndlessLevel, inspectEndlessLevel } from './procedural.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { makeStoneRimProfile } from './curb-profile.js';

// The previously sampled spline offset sometimes crossed itself although
// the original generated outline was simple. Audit the actual rendered
// boundary (which runtime also installs as the physics collider).
function orient(a,b,c) {
  return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
}
function edgesCross(a,b,c,d) {
  return orient(a,b,c)*orient(a,b,d) < -1e-6
    && orient(c,d,a)*orient(c,d,b) < -1e-6;
}
function assertSimplePolygon(points, message) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      if ((j + 1) % points.length === i) continue;
      assert.equal(edgesCross(points[i],points[(i+1)%points.length],
        points[j],points[(j+1)%points.length]), false,
        message+' at edges '+i+','+j);
    }
  }
}
function pointInside(point, polygon) {
  let inside = false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a.y>point.y)!==(b.y>point.y)
      &&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
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
    const meshOutline = compiled.course18.surfaceMesh.outline;
    const profile=makeStoneRimProfile(meshOutline, compiled.course18.field.heightAt);
    assert.equal(profile.length, meshOutline.length);
    assertSimplePolygon(meshOutline, 'surface must not fold across itself');
    assertSimplePolygon(profile.map(p => ({x:p.cap[0],y:p.cap[1]})),
      'outer limestone cap must not self-intersect');
    assert.ok(pointInside(compiled.start,meshOutline),'tee remains inside rendered physics outline');
    assert.ok(pointInside(compiled.hole,meshOutline),'cup remains inside rendered physics outline');
    const left = meshOutline.slice(0, meshOutline.length/2);
    const right = meshOutline.slice(meshOutline.length/2).reverse();
    for(let row=0;row<left.length-1;row++){
      const a=left[row],b=right[row],c=left[row+1],d=right[row+1];
      assert.ok(orient(a,c,d)*orient(a,d,b)>0,
        'cross-course terrain quads must preserve their winding');
    }
    for(let i=0;i<profile.length;i++){
      assert.ok(profile[i].inner.every(Number.isFinite),'finite curb');
      assert.ok(Math.hypot(profile[i].inner[0]-meshOutline[i].x,profile[i].inner[1]-meshOutline[i].y)<1e-6,'rim anchored to rendered physical edge');
    }
    for(const rotor of compiled.rotors||[]){
      const clearance=Math.min(...compiled.outline.map((p,i)=>distanceToSegment(rotor,p,compiled.outline[(i+1)%compiled.outline.length])));
      assert.ok(rotor.length/2+rotor.thickness/2+15<=clearance+1.001,'rotor must not sweep outside course');
    }
  }
}
console.log('Moss & Marble 1.24: 60 compiled procedural holes, rims and rotors checked.');
