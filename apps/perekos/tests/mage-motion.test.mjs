import test from 'node:test';
import assert from 'node:assert/strict';
import {MageMotion,basePose,rigSignature,RIGS} from '../mage-motion.mjs';
import {MAGES} from '../mages.mjs';
const fighter=id=>({id:0,mageId:id,face:0,cast:0,dash:0,shield:0,flash:0,stun:0});
test('six classes have distinct weight, gait, and cast language',()=>{
 const ids=MAGES.map(x=>x.id);
 assert.equal(ids.length,6);
 assert.equal(new Set(ids.map(rigSignature)).size,6);
 for(const id of ids){const rig=RIGS[id];assert.ok(rig.weight>0&&rig.step>0&&rig.gait>0);assert.ok(basePose(id).style)}
});
test('feet respond to actual displacement, never idle frame time or teleportation',()=>{
 const motion=new MageMotion(),a=fighter('wire');
 const idle=motion.sample(a,{x:160,y:240},0,1);
 const idle2=motion.sample(a,{x:160,y:240},.016,1);
 assert.equal(idle.move,0);assert.equal(idle2.move,0);
 const walking=motion.sample(a,{x:162,y:241},.032,1);
 assert.ok(walking.move>0);assert.ok(walking.footSpread>0);
 assert.ok(Number.isFinite(walking.bodyBob));
 const jumped=motion.sample(a,{x:335,y:543},.048,1);
 assert.ok(jumped.move<walking.move,'network correction must not count as running');
});
test('real cast, guard and hurt snapshots initiate independent body movements',()=>{
 const motion=new MageMotion(),a=fighter('pebble');
 motion.sample(a,{x:150,y:200},0,1);
 a.cast=.60;
 const cast=motion.sample(a,{x:150,y:200},.016,1);
 assert.ok(cast.attack>.8);
 a.cast=.56;a.shield=40;
 const guarded=motion.sample(a,{x:150,y:200},.032,1);
 assert.ok(guarded.guard>.8);
 a.flash=.15;
 const hurt=motion.sample(a,{x:150,y:200},.048,1);
 assert.ok(hurt.impact>.8);
 assert.equal(a.x,undefined,'pose calculation cannot authoritatively move actors');
});
test('new rounds clear spring motion and never leak old actor identity',()=>{
 const motion=new MageMotion(),a=fighter('kindle');
 motion.sample(a,{x:180,y:300},0,1);
 a.cast=.55;motion.sample(a,{x:180,y:300},.016,1);
 a.cast=0;
 const fresh=motion.sample(a,{x:180,y:300},.032,2);
 assert.equal(fresh.attack,0);
 assert.equal(fresh.move,0);
 const changed=motion.sample({...a,mageId:'slate'},{x:180,y:300},.048,2);
 assert.equal(changed.style,'brace');
});
test('reduce motion disables temporal displacement but keeps logical shield stance',()=>{
 const motion=new MageMotion(),a=fighter('coil');
 motion.sample(a,{x:120,y:300},0,1,true);
 a.cast=.5;a.shield=35;
 const still=motion.sample(a,{x:124,y:298},.017,1,true);
 for(const prop of ['move','step','lean','bodyBob','cloth','headTilt','headBob','footSpread','attack','impact','dash'])assert.equal(still[prop],0,prop);
 assert.ok(still.guard>0);
});
