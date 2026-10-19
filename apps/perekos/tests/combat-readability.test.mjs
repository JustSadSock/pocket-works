import test from 'node:test';
import assert from 'node:assert/strict';
import {combatCues,drawGroundCues,drawActorCues} from '../combat-readability.mjs';

const match=()=>({phase:'fight',actors:[{x:130,y:310,heat:88},{x:300,y:300,heat:20}],
 shots:[],mines:[],barriers:[]});
test('incoming danger is derived from confirmed hostile projectile trajectory',()=>{
 const s=match();s.shots=[{owner:1,x:65,y:310,vx:260,vy:0,r:5,life:1,element:'storm'}];
 const before=JSON.stringify(s);
 const c=combatCues(s,0);
 assert.equal(c.shots.length,1);assert.equal(c.shots[0].imminent,true);
 assert.equal(c.shots[0].eta>0,true);
 assert.equal(c.shots[0].element,'storm');
 assert.equal(JSON.stringify(s),before,'presentation must not mutate combat snapshot');
});
test('never reveal allied projectiles, hidden spell queues, or unfinished mines',()=>{
 const s=match();
 s.shots=[{owner:0,x:80,y:310,vx:260,vy:0,r:5,life:1},{owner:1,x:200,y:500,vx:0,vy:-260,r:5,life:1}];
 s.mines=[{owner:0,x:130,y:310,r:23},{owner:1,x:140,y:315,r:14,element:'fire'}];
 s.eventQueue=[{kind:'on_cast',owner:1}];s.actors[1].runes=['secret'];
 const c=combatCues(s);
 assert.equal(c.shots.length,1);assert.equal(c.mines.length,1);
 assert.equal(Object.keys(c).sort().join(','),'mines,shots');
 assert.ok(!JSON.stringify(c).includes('secret'));
});
test('wall blocks the danger guide before its path reaches the player',()=>{
 const s=match();s.actors[0].x=195;s.actors[0].y=205;
 s.shots=[{owner:1,x:70,y:205,vx:330,vy:0,r:5,life:1}];
 const c=combatCues(s);
 assert.equal(c.shots[0].imminent,false);
 assert.ok(c.shots[0].endX<102);
});
test('player-built walls block trajectory and range matches an existing mine',()=>{
 const s=match();s.actors[0].x=250;s.actors[0].y=310;
 s.barriers=[{x:170,y:310,r:17}];
 s.shots=[{owner:1,x:90,y:310,vx:300,vy:0,r:5,life:1}];
 s.mines=[{owner:1,x:200,y:300,r:23}];
 const c=combatCues(s);
 assert.ok(c.shots[0].endX<170);
 assert.equal(c.shots[0].imminent,false);
 assert.equal(c.mines[0].r,23);
});
test('malformed and excessive cues are discarded or capped for mobile',()=>{
 const s=match();
 for(let i=0;i<120;i++)s.shots.push({owner:1,x:45+i,y:310,vx:200,vy:0,r:5,life:1});
 s.shots.push({owner:1,x:NaN,y:310,vx:200,vy:0,r:5});
 for(let i=0;i<40;i++)s.mines.push({owner:1,x:200,y:250+i,r:10});
 const c=combatCues(s);assert.ok(c.shots.length<=12);assert.ok(c.mines.length<=6);
 assert.equal(combatCues({...s,phase:'draft'}).shots.length,0);
});
test('renderer does not change state, leaves canvas style and reduced motion stable',()=>{
 const s=match();s.shots=[{owner:1,x:65,y:310,vx:280,vy:0,r:5,life:1}];
 s.mines=[{owner:1,x:180,y:300,r:20}];
 const events=[],c={save(){events.push('save')},restore(){events.push('restore')},
  setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fillRect(){},fill(){},closePath(){},fillText(){}};
 const original=JSON.stringify(s);
 drawGroundCues(c,s,0,2,true);drawActorCues(c,s.actors[0],130,310,true,2,true);
 drawActorCues(c,s.actors[1],300,300,false,2,true);
 assert.deepEqual(events,['save','restore','save','restore','save','restore']);
 assert.equal(JSON.stringify(s),original);
});
