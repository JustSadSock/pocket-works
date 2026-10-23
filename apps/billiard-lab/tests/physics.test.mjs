import test from 'node:test';
import assert from 'node:assert/strict';
import {WIDTH,HEIGHT,inside,contain,sanitizeWorld,initialParticles,propagateRay,advance} from '../physics.mjs';
const rect=sanitizeWorld({shape:'rectangle',origin:{x:360,y:260}});
test('all rays start at one source and uniformly cover 360 degrees',()=>{
 const field=initialParticles(4096,{x:360,y:260});
 assert.equal(field.count,4096);
 assert.equal(new Set(field.x).size,1);
 assert.equal(new Set(field.y).size,1);
 assert.ok(field.dx[0]>.999&&Math.abs(field.dy[0])<1e-6);
 assert.ok(Math.abs(field.dx[1024])<1e-6&&field.dy[1024]>.999);
 assert.ok(field.dx[2048]<-.999);
});
test('the initially expanding contour is a circle',()=>{
 const field=initialParticles(512,{x:360,y:260});
 advance(field,rect,45);
 for(let i=0;i<field.count;i++){
  const r=Math.hypot(field.x[i]-360,field.y[i]-260);
  assert.ok(Math.abs(r-45)<0.001,'radial deviation '+r);
 }
});
test('reflect from rectangle without tunneling',()=>{
 const result=propagateRay(850,270,1,0,80,rect);
 assert.ok(Math.abs(result.x-818)<.01);
 assert.ok(result.dx<0);assert.equal(result.reflections,1);
});
test('circle reflection returns the ray through the center',()=>{
 const world=sanitizeWorld({shape:'circle',origin:{x:450,y:270}});
 const result=propagateRay(450,270,1,0,300,world);
 assert.ok(Math.abs(result.x-614)<.01);assert.ok(result.dx<0);
});
test('stadium and triangle keep reflected particles inside',()=>{
 for(const shape of ['stadium','triangle']){
  const world=sanitizeWorld({shape,origin:{x:450,y:270}});
  const field=initialParticles(512,world.origin);
  for(let frame=0;frame<30;frame++)advance(field,world,25);
  for(let i=0;i<field.count;i++)assert.ok(inside(shape,field.x[i],field.y[i],-.01),shape+' ray '+i+' outside at '+field.x[i]+','+field.y[i]);
  assert.ok(field.reflections>0);
 }
});
test('reflecting obstacle redirects a ray without particle collisions',()=>{
 const world=sanitizeWorld({shape:'rectangle',origin:{x:400,y:270},circles:[{x:500,y:270,r:20}]});
 const result=propagateRay(420,270,1,0,100,world);
 assert.ok(result.dx<0);assert.ok(Math.abs(result.x-440)<.01);
 const field=initialParticles(512,{x:400,y:270});
 advance(field,world,100);
 assert.ok(field.dx[0]<0);
 assert.ok(field.dx[256]<0);
 assert.notEqual(field.x[0],field.x[256]);
});
test('mirror reflects rays from both faces',()=>{
 const world=sanitizeWorld({shape:'rectangle',mirrors:[{x1:550,y1:180,x2:550,y2:360}]});
 const right=propagateRay(480,270,1,0,130,world);
 const left=propagateRay(615,270,-1,0,130,world);
 assert.ok(right.dx<0);assert.ok(left.dx>0);
});
test('wave simulation preserves finite coordinates for thousands of rays',()=>{
 const world=sanitizeWorld({shape:'rectangle',origin:{x:366,y:243},circles:[{x:530,y:310,r:25}],mirrors:[{x1:450,y1:110,x2:630,y2:200}]});
 const field=initialParticles(4096,world.origin);
 for(let i=0;i<70;i++)advance(field,world,8);
 for(let i=0;i<field.count;i++){
  assert.ok(Number.isFinite(field.x[i])&&Number.isFinite(field.y[i]));
  assert.ok(inside(world.shape,field.x[i],field.y[i],-.01),'ray '+i+' escaped at '+field.x[i]+','+field.y[i]);
 }
 assert.ok(field.reflections>0);
});
test('invalid restored state is sanitized safely',()=>{
 const world=sanitizeWorld({shape:'nope',origin:{x:Infinity,y:NaN},circles:[{x:-999,y:1,r:200}],mirrors:[{x1:1,y1:2,x2:3,y2:4}]});
 assert.equal(world.shape,'rectangle');assert.equal(world.circles.length,0);assert.equal(world.mirrors.length,0);
 assert.ok(inside('rectangle',world.origin.x,world.origin.y,1));
});
test('source is constrained to the selected geometry',()=>{
 for(const shape of ['rectangle','circle','triangle','stadium']){
  const p=contain(shape,{x:900,y:0},42);
  assert.ok(inside(shape,p.x,p.y,41.9));
 }
});
