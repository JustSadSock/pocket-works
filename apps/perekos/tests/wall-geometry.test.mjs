import test from 'node:test';
import assert from 'node:assert/strict';
import {firstCollision,rayCollision} from '../collision-geometry.mjs';
import {makeMatch,tick,STEP,previewAttack,CLASS_SPELLS} from '../core.mjs';
import module,{RULESET_VERSION} from '../server/module.ts';
const idle={x:0,y:0,attack:false,shield:false,dash:false,special:false,aim:{x:300,y:210}};
test('a very fast projectile cannot tunnel through a thin court wall and hit the actor beyond it',()=>{
 const s=makeMatch(42,'wire','wire','duel');s.actors[0].x=70;s.actors[0].y=210;s.actors[1].x=220;s.actors[1].y=210;
 tick(s,{...idle,attack:true},STEP,idle);assert.ok(s.shots.length>0);s.shots[0].vx=14000;s.shots[0].vy=0;
 tick(s,idle,STEP,idle);
 assert.equal(s.actors[1].hp,100);assert.equal(s.shots.length,0);
});
test('moving target before an obstacle is hit first; equal-time contacts prefer cover',()=>{
 const s=makeMatch(11,'wire','wire','duel');s.actors[1].x=215;s.actors[1].y=210;
 const blocked=firstCollision(s,70,210,170,0,3,0,{actors:true});
 assert.equal(blocked.type,'wall');assert.ok(blocked.x<102);
 s.actors[1].x=92;s.actors[1].y=210;
 assert.equal(firstCollision(s,70,210,170,0,3,0,{actors:true}).type,'actor');
});
test('ricochets use actual contact normals and have finite bounce count',()=>{
 const s=makeMatch(80,'wire','kindle','duel','striker','striker');s.actors[0].x=70;s.actors[0].y=210;
 tick(s,{...idle,special:true},STEP,idle);
 assert.equal(s.shots.length,1);assert.equal(s.shots[0].bounces,2);
 for(let i=0;i<6;i++)tick(s,idle,STEP,idle);
 assert.ok(s.shots.some(q=>q.owner===0&&q.bounces<2&&q.vx<0));
 assert.ok(s.actors[0].specialCd>0);
});
test('the Shaper one-way aperture blocks enemy shots but allows owner shots',()=>{
 const s=makeMatch(44,'wire','wire','duel','shaper','striker');
 s.actors[0].x=200;s.actors[0].y=310;s.actors[1].x=350;s.actors[1].y=310;
 tick(s,{...idle,special:true,aim:{x:350,y:310}},STEP,idle);
 const wall=s.barriers.find(b=>b.aperture);
 assert.ok(wall);assert.equal(wall.owner,0);
 const own=firstCollision(s,205,310,125,0,4,0,{actors:false});
 const enemy=firstCollision(s,340,310,-125,0,4,1,{actors:false});
 assert.equal(own,null);
 assert.equal(enemy.type,'barrier');
});
test('Distorter phases through exactly one cover and continues as an ordinary projectile',()=>{
 const s=makeMatch(144,'wire','wire','duel','distorter','striker');
 s.actors[0].x=70;s.actors[0].y=210;s.actors[1].x=218;s.actors[1].y=210;
 tick(s,{...idle,special:true},STEP,idle);
 assert.equal(s.shots[0].phase,1);
 for(let i=0;i<45;i++)tick(s,idle,STEP,idle);
 assert.ok(s.actors[1].hp<100);
 assert.ok(s.actors[0].specialCd>0);
});
test('reticle clips near cover and conveys sector, flame, beam and lob shape',()=>{
 for(const id of ['kindle','cinder','coil','slate','pebble']){
  const s=makeMatch(97,id,'wire');const a=s.actors[0];a.x=70;a.y=210;
  const p=previewAttack(s,a,{x:300,y:210});
  if(id!=='pebble')assert.ok(p.x<103,JSON.stringify({id,p}));
  if(id==='pebble')assert.ok(p.radius>20);
  if(id==='cinder'||id==='slate')assert.ok(p.width>0);
  if(id==='coil')assert.equal(p.type,'beam');
 }
});
test('preview distinguishes the special ricochet, phase path and placement',()=>{
 for(const arch of ['striker','shaper','distorter']){
  const s=makeMatch(51,'wire','kindle','forge',arch,'striker'),a=s.actors[0];a.x=70;a.y=210;
  const p=previewAttack(s,a,{x:320,y:210},true);
  assert.ok(CLASS_SPELLS.some(x=>x.id===arch));
  assert.equal(p.type,{striker:'ricochet',shaper:'placement',distorter:'phase'}[arch]);
  if(arch==='striker')assert.ok(p.segments.length>=2);
  if(arch==='distorter')assert.ok(p.segments.some(x=>x.phase));
 }
});
test('area attacks require genuine unobstructed line of sight',()=>{
 const s=makeMatch(115,'wire','wire','duel');s.actors[0].x=90;s.actors[0].y=210;s.actors[1].x=175;s.actors[1].y=210;
 s.actors[0].runes=['on_cast','blast','wide'];
 tick(s,{...idle,attack:true},STEP,idle);assert.equal(s.actors[1].hp,100);
});
test('server v9 accepts bounded class cast inputs and never accepts a forged cooldown override',()=>{
 assert.equal(RULESET_VERSION,18);
 const player={id:'host'},other={id:'guest'},state=module.createRoom({player}).state;
 module.onJoin({state,player:other,players:[player,other]});
 module.onMessage({state,player,payload:{type:'archetype',archetype:'shaper'}});
 module.onMessage({state,player,payload:{type:'start'}});
 const input={...idle,special:true};
 const res=module.onMessage({state,player,payload:{type:'input',round:state.match.round,seq:0,control:input}});
 assert.ok(!res.events.some(e=>e.type==='notice'));
 const reject=module.onMessage({state,player,payload:{type:'input',round:state.match.round,seq:1,control:{...input,x:9999}}});
 assert.ok(reject.events.some(e=>e.type==='notice'));
});


test('all nine techniques exist as three selectable real variants per path',()=>{
 assert.deepEqual(CLASS_SPELLS.map(c=>c.variants.length),[3,3,3]);
});
test('striker armour breaker destroys a runic barrier but cannot pierce the arena wall',()=>{
 const s=makeMatch(200,'wire','wire','forge','striker','striker');
 s.actors[0].x=70;s.actors[0].y=210;s.actors[1].x=225;s.actors[1].y=210;
 s.barriers.push({owner:1,x:90,y:210,r:9,hp:20,life:5});
 tick(s,{...idle,special:true,specialSlot:1,aim:{x:290,y:210}},STEP,idle);
 for(let i=0;i<10;i++)tick(s,idle,STEP,idle);
 assert.equal(s.barriers.length,0);
 assert.equal(s.actors[1].hp,100,'the permanent wall still blocks the broken-wall shot');
});
test('striker dashes first then releases a real projectile',()=>{
 const s=makeMatch(201,'wire','wire','forge','striker','striker');s.actors[0].x=190;s.actors[0].y=310;
 tick(s,{...idle,special:true,specialSlot:2,aim:{x:350,y:310}},STEP,idle);
 assert.ok(s.actors[0].dash>0);assert.equal(s.shots.length,0);
 for(let i=0;i<12;i++)tick(s,idle,STEP,idle);
 assert.ok(s.shots.some(q=>q.owner===0),'server-physical shot is released after dash');
});
test('shaper resonance fires two stone fragments from the nearest own wall',()=>{
 const s=makeMatch(202,'wire','wire','forge','shaper','striker');s.actors[0].x=200;s.actors[0].y=310;
 s.barriers.push({owner:0,x:247,y:310,r:14,life:5});
 tick(s,{...idle,special:true,specialSlot:1,aim:{x:335,y:310}},STEP,idle);
 assert.equal(s.shots.filter(q=>q.owner===0).length,2);
});
test('shaper defensive contour strengthens a barrier and nearby mines',()=>{
 const s=makeMatch(203,'wire','wire','forge','shaper','striker');s.actors[0].x=200;s.actors[0].y=310;
 s.barriers.push({owner:0,x:245,y:310,r:14,hp:24,life:4});
 s.mines.push({owner:0,x:260,y:310,r:40,damage:10,life:5});
 tick(s,{...idle,special:true,specialSlot:2,aim:{x:335,y:310}},STEP,idle);
 assert.ok(s.barriers[0].hp>24);assert.ok(s.mines[0].r>40);
});
test('distorter route bends in two separate, collision-aware segments',()=>{
 const s=makeMatch(204,'wire','wire','forge','distorter','striker');s.actors[0].x=70;s.actors[0].y=310;
 tick(s,{...idle,special:true,specialSlot:1,aim:{x:350,y:310}},STEP,idle);
 const shot=s.shots.find(q=>q.owner===0);assert.ok(shot);
 const vx=shot.vx,vy=shot.vy;
 for(let i=0;i<12;i++)tick(s,idle,STEP,idle);
 assert.ok(shot.vx!==vx||shot.vy!==vy,'the projectile turns during authoritative simulation');
 const preview=previewAttack(s,s.actors[0],{x:350,y:310},true,1);
 assert.equal(preview.type,'bend');assert.ok(preview.segments.length>=2);
});
test('distorter inversion changes barrier aperture ownership and restores it on timeout',()=>{
 const s=makeMatch(205,'wire','wire','forge','distorter','shaper');s.actors[0].x=200;s.actors[0].y=310;
 s.barriers.push({owner:1,x:245,y:310,r:16,life:6,aperture:false});
 tick(s,{...idle,special:true,specialSlot:2,aim:{x:350,y:310}},STEP,idle);
 assert.equal(s.barriers[0].owner,0);assert.equal(s.barriers[0].aperture,true);
 for(let i=0;i<145;i++)tick(s,idle,STEP,idle);
 assert.equal(s.barriers[0].owner,1);assert.equal(s.barriers[0].aperture,false);
});
test('network does not accept out-of-range or forged special variant',()=>{
 const player={id:'host'},other={id:'guest'},s=module.createRoom({player}).state;
 module.onJoin({state:s,player:other,players:[player,other]});module.onMessage({state:s,player,payload:{type:'start'}});
 const res=module.onMessage({state:s,player,payload:{type:'input',round:s.match.round,seq:0,control:{...idle,special:true,specialSlot:999}}});
 assert.ok(res.events.some(e=>e.type==='notice'));
});
