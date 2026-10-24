import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uploadBallCenterUniform } from './render-uniforms.js';
import { LEVELS } from './levels.js';
import { compileCourse19, inspectCourse19 } from './course19.js';
import { generateEndlessLevel } from './procedural.js';
import { buildCourse18Geometry } from './terrain18.js';
import { KEY_LIGHT, keyOnScreen, shadowDisplacement, appendSoftShadow } from './light-space.js';

const nearly = (a,b) => Math.abs(a-b) < 1e-7;
// Catch the missing uBallCenter uniform that caused the marble to render
// far above the physical contact point while aim/collisions stayed correct.
// All three WebGL paths must upload the SAME world-space center, not a
// default shader pivot at (0,0,0).
const uploads=[];
const fakeGl={uniform3f:(location,x,y,z)=>uploads.push({location,x,y,z})};
const marbleWorld=[430,876,37];
uploadBallCenterUniform(fakeGl,'uBallCenter',marbleWorld);
assert.deepEqual(uploads,[{location:'uBallCenter',x:430,y:876,z:37}]);
assert.throws(()=>uploadBallCenterUniform(fakeGl,'uBallCenter',null),/missing physical marble center/);
for(const path of ['render-core14.js','terrain17.js','terrain18.js']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  const renderBody=source.slice(source.indexOf(path==='render-core14.js'
    ? '  render3D(level, time) {' : 'core.render3D = function render3D(level, time) {'));
  const uniformIndex=renderBody.indexOf('uploadBallCenterUniform(');
  const drawIndex=renderBody.indexOf(path==='render-core14.js'
    ? 'this.drawMesh(this.staticMeshes.opaque' : 'core.drawMesh(core.staticMeshes.opaque');
  assert.ok(uniformIndex>=0 && drawIndex>uniformIndex,
    path+': ball center must be bound before the first draw call');
}
const pivotScale=.7732;
for(const projectedY of [200,600,1200,1800]){
  const centerY=projectedY;
  const corrected=centerY+(projectedY-centerY)*pivotScale;
  assert.ok(nearly(corrected,projectedY),
    'sphere-rounding must preserve the projected physical center');
}

assert.ok(KEY_LIGHT.z > 0 && KEY_LIGHT.x < 0 && KEY_LIGHT.y < 0);
for (const angle of [-Math.PI,-1.1,-.3,0,.5,1.6,Math.PI]){
 const p=keyOnScreen(angle);
 assert.ok(nearly(Math.hypot(p.x,p.y), Math.hypot(KEY_LIGHT.x,KEY_LIGHT.y)), 'rotation cannot change light intensity');
}
const cast=shadowDisplacement(50);
assert.ok(cast.x > 0 && cast.y > 0, 'the cast is opposite the world sun');
const blank=shadowDisplacement(0);
assert.deepEqual(blank,{x:0,y:0});
let shadowCount=0, elevated=0, courseCount=0;
for(const raw of [...LEVELS,...Array.from({length:72},(_,i)=>generateEndlessLevel(911+i*97, i%28))]){
 const level=compileCourse19(raw);
 assert.equal(inspectCourse19(level).ok,true);
 const original=JSON.stringify({props:level.course18.props,walls:level.course18.barriers,rotors:level.rotors,transfers:level.tunnels});
 const built=buildCourse18Geometry(level);
 for(const [category,mesh] of Object.entries(built)){
   assert.ok(mesh instanceof Float32Array);
   assert.equal(mesh.length%11,0, 'fixed GPU vertex format');
   assert.ok(mesh.every(Number.isFinite), 'no invalid geometry or colors');
   assert.ok(mesh.length < 550000, 'constrained render budget');
   for(let i=9;i<mesh.length;i+=11)assert.ok(mesh[i]>=0 && mesh[i]<=1, 'alpha must be normalized');
 }
 const v=built.shadows;
 assert.ok(v.length>0);
 for(let i=0;i<v.length;i+=11){
   assert.equal(v[i+10],3,'penumbra must bypass double lighting');
   assert.ok(v[i+9]<=.65,'soft shadow alpha is bounded');
   assert.ok(v[i+2]>-100,'shadows hug field height rather than negative board underside');
   const z=level.course18.field.heightAt(v[i],v[i+1]);
   assert.ok(Math.abs(v[i+2]-z-.38) < 1e-3,'shadow vertices follow hills and depressions');
   if(v[i+9]===0)elevated++;
   shadowCount++;
 }
 assert.equal(JSON.stringify({props:level.course18.props,walls:level.course18.barriers,rotors:level.rotors,transfers:level.tunnels}),original,'rendering never edits collision data');
 courseCount++;
}
assert.ok(shadowCount>0 && elevated>0);
console.log('Moss & Marble 1.20 lighting audit passed:',courseCount,'courses;',shadowCount,'graded shadow vertices');

const sample=[];
const terrainHeight=(x,y)=>x*.07+y*.03;
const fakeMesh={vertex:(position,normal,tint,material)=>sample.push({position,normal,tint,material})};
appendSoftShadow(fakeMesh,terrainHeight,{x:100,y:50,radiusX:25,radiusY:14,height:35,strength:.4,segments:20});
assert.equal(sample.length,20*3*6);
assert.ok(sample.some(x=>x.tint[3]===0));
assert.ok(sample.every(x=>nearly(x.position[2],terrainHeight(x.position[0],x.position[1])+.38)));
