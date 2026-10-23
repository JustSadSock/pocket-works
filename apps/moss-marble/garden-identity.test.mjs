import assert from 'node:assert/strict';
import { LEVELS } from './levels.js';
import { generateEndlessLevel } from './procedural.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { buildCourse18Geometry } from './terrain18.js';
import { gardenSites, appendGardenIdentity, GARDEN_STYLES } from './garden-identity.js';
import { courseFit, portraitCourseRotation, anchoredCameraOffset, worldToScreenPoint, inverseRotateXY } from './camera-space.js';

assert.equal(Object.keys(GARDEN_STYLES).length,9,'all nine motifs need distinct visual structures');
assert.equal(new Set(Object.values(GARDEN_STYLES)).size,9,'each garden should have a unique shape, not a recolor');

function inside(p, outline) {
  let value=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const a=outline[i],b=outline[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)value=!value;
  }
  return value;
}
let siteCount=0, totalPoints=0;
for (const [index,raw] of LEVELS.entries()){
  const level=compileCourse19(raw);
  assert.equal(inspectCourse19(level).ok,true,'course must remain playable');
  const sites=gardenSites(level);
  assert.equal(sites.length,4,`course ${index+1} needs four ornaments`);
  assert.equal(sites[0].theme,level.visual.motif);
  const baseline=JSON.stringify({
    obstacles:level.obstacles,walls:level.walls,tunnels:level.tunnels,
    rotors:level.rotors,hole:level.hole,start:level.start,
    surface:level.course18.scenario
  });
  const geometry=buildCourse18Geometry(level);
  assert.ok(geometry.opaque instanceof Float32Array);
  assert.ok(geometry.opaque.every(Number.isFinite),`course ${index+1}: invalid vertex`);
  assert.ok(geometry.opaque.length<550000,`course ${index+1}: polygon budget`);
  const dummy={vertex(){},quad(){},triangle(a,b,c){if(![...a,...b,...c].every(Number.isFinite)) throw new Error('invalid garden triangle');}};
  const result=appendGardenIdentity(dummy,level,level.course18.field.heightAt);
  assert.equal(result.length,4);
  for(const site of sites){
    assert.ok(!inside(site,level.outline),`course ${index+1}: deco interferes with playing area`);
    const idx=sites.findIndex(p=>p===site);
    for(const next of sites.slice(idx+1))assert.ok(Math.hypot(next.x-site.x,next.y-site.y)>=110);
  }
  const w=390,h=844,rotation=portraitCourseRotation(level,w,h);
  const fit=courseFit(level,w,h,rotation,90,90);
  const worldCenter=inverseRotateXY(fit.bounds.centerX,fit.bounds.centerY,rotation);
  const off=anchoredCameraOffset(worldCenter.x,worldCenter.y,fit.scale,rotation,fit.view);
  for(const site of sites){
    const point=worldToScreenPoint(site.x,site.y,0,fit.scale,off.x,off.y,rotation);
    assert.ok(point.x>=-1 && point.x<=w+1 && point.y>=fit.view.top-1 && point.y<=h-fit.view.bottom+1,
      `garden ${index+1}: overview must include ornaments`);
  }
  assert.equal(JSON.stringify({
    obstacles:level.obstacles,walls:level.walls,tunnels:level.tunnels,
    rotors:level.rotors,hole:level.hole,start:level.start,
    surface:level.course18.scenario
  }),baseline,'decorative renderer must not mutate physics');
  siteCount+=sites.length;
  totalPoints+=geometry.opaque.length/11;
}
for(let i=0;i<60;i++){
 const level=compileCourse19(generateEndlessLevel(i*89+2501,i%23));
 assert.equal(inspectCourse19(level).ok,true);
 assert.ok(buildCourse18Geometry(level).opaque.every(Number.isFinite));
}
console.log('Moss & Marble nine gardens:',siteCount,'distinct mounted ornaments,',totalPoints,'campaign render vertices, 60 endless levels checked');
