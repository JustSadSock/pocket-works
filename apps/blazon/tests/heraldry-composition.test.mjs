import test from 'node:test';
import assert from 'node:assert/strict';
import {HERALDIC_SCHOOLS,compositionForDoctrine,shieldGeometry} from '../heraldry.js';
const mains=['lion','boar','tower','stag'];
const secondaries=['eagle','rose','key','sun'];
const ordinaries=['pale','fess','bend','chevron'];
const schools=Object.keys(HERALDIC_SCHOOLS);
function box(p){return{x:p.x,y:p.y,w:120*p.scale,h:120*p.scale};}
function overlap(a,b){const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return w*h;}
test('every composition stays inside the shield drawing area',()=>{
  for(const school of schools)for(const ordinary of ordinaries)for(const main of mains)for(const secondary of secondaries){
    const c=compositionForDoctrine({field:'azure',school,ordinary,main,secondary});
    const mb=box(c.main);assert.ok(mb.x>=14&&mb.y>=30&&mb.x+mb.w<=108&&mb.y+mb.h<=171,`${school}/${ordinary}/${main}`);
    for(const p of c.secondary){const b=box(p);assert.ok(b.x>=14&&b.y>=30&&b.x+b.w<=108&&b.y+b.h<=171,`${school}/${ordinary}/${secondary}`);assert.ok(overlap(mb,b)<b.w*b.h*.68,`excess overlap ${school}/${ordinary}/${main}/${secondary}`);}
  }
});
test('static towers are never tilted or mirrored',()=>{
  for(const school of schools)for(const ordinary of ordinaries){const p=compositionForDoctrine({school,ordinary,main:'tower',secondary:'key'}).main;assert.equal(p.rotate,0);assert.equal(p.flip,false);}
});
test('ordinary changes the actual composition, not only the painted stripe',()=>{
  for(const school of schools)for(const main of mains){const signatures=new Set(ordinaries.map(ordinary=>{const p=compositionForDoctrine({school,ordinary,main,secondary:'rose'}).main;return`${Math.round(p.x)}:${Math.round(p.y)}:${p.scale.toFixed(3)}`;}));assert.ok(signatures.size>=3,`${school}/${main}`);}
});
test('schools retain distinct shield geometry and secondary rhythm',()=>{
  const shieldIds=new Set(schools.map(school=>shieldGeometry({school}).id));assert.equal(shieldIds.size,4);
  const counts=new Set(schools.map(school=>compositionForDoctrine({school,ordinary:'fess',main:'lion',secondary:'rose'}).secondary.length));assert.ok(counts.size>=2);
});
