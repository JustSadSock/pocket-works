import test from 'node:test';
import assert from 'node:assert/strict';
import {MAGES} from '../mages.mjs';
import {drawMage} from '../mage-art.mjs';
import {MageMotion,basePose,RIGS} from '../mage-motion.mjs';
import {drawGarbBack,drawGarbFront,garbSignature,GARB} from '../mage-regalia.mjs';

function tracingCanvas(){
 const operations=[];let depth=0;
 const ctx=new Proxy({},{
  get(obj,key){
   if(key==='depth')return depth;
   if(key in obj)return obj[key];
   return (...args)=>{
    if(key==='save')depth++;
    else if(key==='restore')depth--;
    assert.ok(depth>=0,'Canvas state underflow');
    for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),'nonfinite canvas geometry');
    operations.push([String(key),...args]);
   };
  },
  set(obj,key,value){obj[key]=value;operations.push(['set',String(key),value]);return true}
 });
 return {ctx,operations};
}
const guest={source:'guest',colors:['#65735e','#d9bb87','#364b42'],mascot:null};
const states={
 idle:basePose(),
 walk:{...basePose(),move:.9,step:2.25,footSpread:4,cloth:2,bodyBob:-1.8,scarf:2},
 windup:{...basePose(),attack:1,windup:1,weaponTilt:-.45,weaponRise:10,shoulderTurn:-.14,crouch:2},
 release:{...basePose(),attack:.75,release:1,weaponTilt:.34,weaponRise:-7,shoulderTurn:.14},
 guard:{...basePose(),guard:1,footSpread:4,shoulderTurn:-.06},
 hurt:{...basePose(),impact:1,bodyBob:3,headTilt:-.15},
 dash:{...basePose(),move:1,dash:1,cloth:-5,footSpread:6}
};
test('six redesigned costume silhouettes are not interchangeable',()=>{
 assert.equal(Object.keys(GARB).length,6);
 assert.equal(new Set(MAGES.map(m=>garbSignature(m.id))).size,6);
 const seen=[];
 for(const {id} of MAGES){
  const sheet=tracingCanvas();
  drawGarbBack(sheet.ctx,id,states.walk);
  drawGarbFront(sheet.ctx,id,{...states.walk,...guest.colors});
  assert.equal(sheet.ctx.depth,0);
  seen.push(JSON.stringify(sheet.operations));
 }
 assert.equal(new Set(seen).size,6);
});
test('every class has seven visibly distinct full-body animation states',()=>{
 for(const m of MAGES){
  const hashes=[];
  for(const [name,pose] of Object.entries(states)){
   const {ctx,operations}=tracingCanvas();
   drawMage(ctx,guest,{x:90,y:110,mageId:m.id,scale:1.32,time:.23,
    casting:name==='windup'?.53:name==='release'?.23:0,
    shield:name==='guard'?42:0,flash:name==='hurt'?.17:0,
    dashing:name==='dash'?.12:0,
    face:name==='dash'?Math.PI:0,moving:name==='walk'?1:0,pose});
   assert.equal(ctx.depth,0,m.id+' '+name+' must balance the Canvas stack');
   assert.ok(operations.length>90,m.id+' '+name+' contains too little drawing');
   hashes.push(JSON.stringify(operations));
  }
  assert.ok(new Set(hashes).size>=6,m.id+' states lack readable differences');
 }
});
test('account art remains an actual overlaid coat cameo, with parent MASKOT head untouched',()=>{
 const artCanvas={tag:'account-drawing'};
 const appearance={source:'drawing',colors:guest.colors,mascot:{animal:'rabbit',hat:'crown'},artCanvas};
 const {ctx,operations}=tracingCanvas();
 drawMage(ctx,appearance,{x:100,y:120,mageId:'slate',pose:states.windup,casting:.43});
 assert.equal(ctx.depth,0);
 assert.ok(operations.some(op=>op[0]==='drawImage'&&op[1]===artCanvas),
  'profile drawing must still render on the coat');
 assert.ok(operations.some(op=>op[0]==='set'&&op[1]==='fillStyle'&&op[2]==='#e2c078'),
  'official MASKOT crown should not disappear');
});
test('cast keyframing has distinct windup, follow-through and recovery per school',()=>{
 const seen=[];
 for(const m of MAGES){
  const actor={id:0,mageId:m.id,face:-.7,cast:0,flash:0,shield:0,dash:0,stun:0};
  const rig=new MageMotion();rig.sample(actor,{x:140,y:270},0,1);
  actor.cast=.56;
  const start=rig.sample(actor,{x:140,y:270},.016,1);
  actor.cast=.48;
  const middle=rig.sample(actor,{x:140,y:270},.085,1);
  actor.cast=.21;
  const late=rig.sample(actor,{x:140,y:270},.23,1);
  assert.ok(start.windup>0,'windup should visibly start at cast');
  assert.ok(middle.weaponTilt!==start.weaponTilt,'weapon must articulate over time');
  assert.ok(late.release!==start.release||late.recover>0,'later frames must change state');
  assert.ok([start,middle,late].every(p=>Math.abs(p.weaponTilt)<2&&Number.isFinite(p.shoulderTurn)));
  seen.push([middle.windup,middle.release,late.recover].map(n=>n.toFixed(4)).join('/'));
 }
 assert.ok(new Set(seen).size>=4,'animation rhythms should not all be identical');
});
test('reduce motion removes kinetic choreography while retaining class distinctions',()=>{
 for(const m of MAGES){
  const a={id:0,mageId:m.id,face:0,cast:0,shield:0,flash:0,dash:0,stun:0};
  const director=new MageMotion();director.sample(a,{x:160,y:300},0,1,true);
  a.cast=.56;const pose=director.sample(a,{x:165,y:299},.016,1,true);
  assert.equal(pose.weaponTilt,0);
  assert.equal(pose.shoulderTurn,0);
  assert.equal(pose.windup,0);
  assert.equal(pose.aimLift,0);
  const c=tracingCanvas();
  drawMage(c.ctx,guest,{x:100,y:110,mageId:m.id,pose,time:5});
  assert.equal(c.ctx.depth,0);
 }
});
