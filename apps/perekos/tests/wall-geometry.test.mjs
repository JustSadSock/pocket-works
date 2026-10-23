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
 assert.equal(RULESET_VERSION,9);
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
