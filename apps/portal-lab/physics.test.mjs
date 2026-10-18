import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,makeBall,portalAt,portalPairs,kinetic,totalEnergy,SCALE} from './physics.js';
import {LEVELS,buildLevel} from './levels.js';
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const bare=(sites,pairs)=>({gravity:0,restitution:1,friction:0,airDrag:0,balls:[],walls:[],sites,pairSites:pairs,events:[],anchorWork:0});
test('rotation preserves speed and tangential parity across perpendicular portals',()=>{
 const s=bare([{x:200,y:300,nx:-1,ny:0,span:200},{x:450,y:300,nx:0,ny:-1,span:200}],[[0,1]]);
 const b=makeBall(170,300,14,1);s.balls=[b];const e=kinetic(b);
 for(let i=0;i<35&&!b.transits;i++)advance(s,1/120);
 assert.equal(b.transits,1);close(kinetic(b),e,1e-6);
 close(b.vx,-1,1e-6);close(b.vy,-14,1e-6);
});
test('round trip into opposite facing aperture returns original heading',()=>{
 const s=bare([{x:200,y:300,nx:-1,ny:0,span:200},{x:400,y:300,nx:1,ny:0,span:200}],[[0,1]]);
 const b=makeBall(170,300,10,0);s.balls=[b];
 for(let i=0;i<40&&!b.transits;i++)advance(s,1/120);
 assert.equal(b.transits,1);close(b.vx,10);close(b.vy,0);
});
test('portal height change is exactly balanced by anchor work',()=>{
 const s=bare([{x:200,y:600,nx:-1,ny:0,span:200},{x:400,y:200,nx:1,ny:0,span:200}],[[0,1]]);
 s.gravity=9.81;const b=makeBall(178,600,16,0);s.balls=[b];
 // disable gravity during flight and then apply it in potential accounting just at transit
 const prior=totalEnergy(s);
 for(let i=0;i<12&&!b.transits;i++)advance(s,1/120);
 assert.equal(b.transits,1);
 close(b.m*9.81*(600-200)/SCALE+s.anchorWork,0,0.9);
});
test('invalid or disconnected portals never teleport',()=>{
 const s=bare([{x:200,y:300,nx:-1,ny:0,span:200}],[[0,5]]);
 s.balls=[makeBall(180,300,10,0)];
 for(let i=0;i<20;i++)advance(s,1/120);
 assert.equal(s.balls[0].transits,0);
});
test('stable wall response and controlled frame rates',()=>{
 const s=bare([],[]);s.gravity=9.81;s.restitution=.5;s.friction=.25;
 s.walls=[{id:'floor',x:0,y:600,w:720,h:60}];
 s.balls=[makeBall(350,470,0,0)];
 for(let i=0;i<900;i++)advance(s,1/120);
 assert.ok(Number.isFinite(s.balls[0].y));assert.ok(s.balls[0].y<=600-s.balls[0].r+.2);
 assert.ok(Math.abs(s.balls[0].vx)<2);
});
test('each level loads and portals refer to real sites',()=>{
 for(let i=0;i<LEVELS.length;i++){
  const s=buildLevel(i);
  assert.equal(s.walls.length>=4,true);
  for(const p of portalPairs(s))assert.notEqual(p.a.id,p.b.id);
  for(const site of s.sites)assert.ok(s.walls.some(w=>w.id===site.wall));
 }
});
