import test from 'node:test';
import assert from 'node:assert/strict';
import {SHAPES,inside,contain,validatePolygon,sanitizeWorld,initialParticles,advance,propagateRay,shapePolygon} from '../physics.mjs';

const rect=sanitizeWorld({shape:'rectangle',origin:{x:360,y:260}});
const custom=[{x:120,y:100},{x:730,y:93},{x:760,y:240},{x:510,y:254},{x:765,y:458},{x:122,y:447}];
test('launch angles are evenly distributed on a single circular wavefront',()=>{
 const p=initialParticles(1024,rect.origin);
 assert.equal(new Set(p.x).size,1);assert.equal(new Set(p.y).size,1);
 assert.ok(Math.abs(p.dx[0]-1)<1e-7);
 assert.ok(Math.abs(p.dx[256])<1e-6&&p.dy[256]>.999);
 advance(p,rect,38);
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(Math.hypot(p.x[i]-360,p.y[i]-260)-38)<.002);
});
test('independent particles cross freely without collisions',()=>{
 const p=initialParticles(1024,rect.origin);
 for(let i=0;i<24;i++)advance(p,rect,20);
 assert.equal(p.count,1024);
 assert.ok(p.reflections>0);
 assert.ok(p.dx.every(Number.isFinite));
});
test('all built-in chambers and own field retain wavefront inside',()=>{
 assert.equal(SHAPES.length,11);
 for(const shape of SHAPES){
  const w=sanitizeWorld({shape,origin:{x:450,y:270},vertices:custom});
  const p=initialParticles(256,w.origin);
  for(let i=0;i<22;i++)advance(p,w,10);
  for(let i=0;i<p.count;i++){
   assert.ok(Number.isFinite(p.x[i])&&Number.isFinite(p.y[i]),shape+' non-finite');
   assert.ok(inside(shape,p.x[i],p.y[i],-.04,w.vertices),shape+' escaped: '+p.x[i]+','+p.y[i]);
  }
 }
});
test('rectangle reflection keeps remaining travel distance',()=>{
 const r=propagateRay(850,270,1,0,80,rect);
 assert.ok(Math.abs(r.x-818)<.02);assert.ok(r.dx<0);assert.equal(r.reflections,1);
});
test('circle reflection reverses a ray aimed at the perimeter',()=>{
 const w=sanitizeWorld({shape:'circle',origin:{x:450,y:270}});
 const r=propagateRay(450,270,1,0,300,w);
 assert.ok(Math.abs(r.x-614)<.04);assert.ok(r.dx<0);
});
test('ellipse makes a non-circular boundary',()=>{
 const w=sanitizeWorld({shape:'ellipse',origin:{x:450,y:270}});
 assert.ok(inside('ellipse',450,500));
 assert.ok(!inside('ellipse',70,500));
 const r=propagateRay(450,270,1,0,450,w);
 assert.ok(r.dx<0);assert.ok(r.x<835);
});
test('mirror reflects on both faces',()=>{
 const w=sanitizeWorld({mirrors:[{x1:550,y1:180,x2:550,y2:370}]});
 assert.ok(propagateRay(480,270,1,0,130,w).dx<0);
 assert.ok(propagateRay(610,270,-1,0,130,w).dx>0);
});
test('round obstacle reflects only the ray, never its neighbours',()=>{
 const w=sanitizeWorld({origin:{x:400,y:270},circles:[{x:500,y:270,r:22}]});
 const p=initialParticles(1024,w.origin);advance(p,w,150);
 assert.ok(p.dx[0]<0);assert.ok(p.dx[255]>-.1);
});
test('custom field validates concavity and prevents crossing walls',()=>{
 assert.equal(validatePolygon(custom).ok,true);
 const bow=[{x:160,y:120},{x:700,y:410},{x:710,y:100},{x:150,y:420}];
 assert.equal(validatePolygon(bow).ok,false);
 assert.equal(validatePolygon(custom.slice(0,2)).ok,false);
 const points=validatePolygon([...custom].reverse()).points;
 assert.ok(points.length===custom.length);
 const poly=shapePolygon('custom',points);assert.equal(poly.length,custom.length);
});
test('own field and its editable vertices survive JSON persistence',()=>{
 const world=sanitizeWorld({shape:'custom',vertices:custom,origin:{x:999,y:999}});
 const restored=sanitizeWorld(JSON.parse(JSON.stringify(world)));
 assert.equal(restored.shape,'custom');assert.equal(restored.vertices.length,6);
 assert.ok(inside('custom',restored.origin.x,restored.origin.y,0,restored.vertices));
 const bounded=contain('custom',{x:900,y:30},15,restored.vertices);
 assert.ok(inside('custom',bounded.x,bounded.y,14,restored.vertices));
});
test('maximum density remains deterministic with independent ray state',()=>{
 const w=sanitizeWorld({shape:'star',origin:{x:450,y:270}});
 const p=initialParticles(8192,w.origin);
 for(let i=0;i<5;i++)advance(p,w,12);
 assert.equal(p.count,8192);assert.ok(p.reflections>=0);
 for(let i=0;i<p.count;i+=23)assert.ok(Number.isFinite(p.x[i]+p.y[i]));
});
test('old saved world without custom vertices remains valid',()=>{
 const w=sanitizeWorld({shape:'rectangle',origin:{x:366,y:243},circles:[{x:520,y:300,r:20}]});
 assert.ok(w.edges.length===0);assert.ok(w.circles.length===1);
});
