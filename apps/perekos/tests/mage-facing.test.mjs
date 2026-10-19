import test from 'node:test';
import assert from 'node:assert/strict';
import {DIRECTIONS,normalizeFacing,faceView,facingSector,weaponRotation,signedTurn,artFacing} from '../mage-facing.mjs';
import {drawMage} from '../mage-art.mjs';
import {MAGES} from '../mages.mjs';
import {MageMotion} from '../mage-motion.mjs';
import {makeMatch,tick,STEP} from '../core.mjs';

const TAU=Math.PI*2;
const close=(a,b,epsilon=1e-7)=>Math.abs(a-b)<epsilon;
const castPose={windup:.8,release:.3,weaponTilt:0,weaponRise:0,headTilt:0};
function trace(){
 const ops=[];let depth=0;
 const ctx=new Proxy({},{
  get(o,k){
   if(k==='depth')return depth;
   if(k in o)return o[k];
   return (...args)=>{
    if(k==='save')depth++;if(k==='restore')depth--;
    assert.ok(depth>=0,'canvas restore without matching save');
    for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),'nonfinite canvas coordinates');
    ops.push([String(k),...args]);
   };
  },set(o,k,value){o[k]=value;ops.push(['set',String(k),value]);return true}
 });
 return {ctx,ops};
}
const guest={source:'guest',colors:['#607c68','#d7ad79','#365246'],mascot:null};
test('all eight directions are mapped consistently across the 360-degree wrap',()=>{
 assert.deepEqual(DIRECTIONS,['E','SE','S','SW','W','NW','N','NE']);
 const labels=DIRECTIONS;
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,v=faceView(angle);
  assert.equal(v.sector,i);
  assert.equal(v.label,labels[i]);
  assert.equal(facingSector(angle+TAU*3),i);
  assert.equal(facingSector(angle-TAU*7),i);
  assert.ok(v.shoulderScale>=.75&&v.shoulderScale<=1.001);
 }
 assert.equal(faceView(Math.PI/2).isRear,false);
 assert.equal(faceView(-Math.PI/2).isRear,true);
 assert.equal(faceView(0).isSide,true);
 assert.equal(faceView(Math.PI).isSide,true);
});
test('mirrored western weapon always rotates to its real world-space shot direction',()=>{
 for(let i=0;i<128;i++){
  const facing=-Math.PI+i*TAU/128,r=weaponRotation(facing);
  // Original weapon shaft is (0,-1). Rotate it locally, then root-mirror.
  const sx=Math.cos(facing)<-.12?-1:1;
  const worldX=sx*Math.sin(r),worldY=-Math.cos(r);
  assert.ok(close(worldX,Math.cos(facing),1e-8),'weapon x mismatch at '+facing);
  assert.ok(close(worldY,Math.sin(facing),1e-8),'weapon y mismatch at '+facing);
 }
});
test('front, profile, quarter and rear draw anatomically different faces',()=>{
 const variants=[];
 for(let i=0;i<8;i++){
  const {ctx,ops}=trace();
  drawMage(ctx,guest,{x:120,y:140,scale:1.3,face:i*Math.PI/4,
    mageId:'kindle',time:0,pose:{...castPose,still:true}});
  assert.equal(ctx.depth,0);
  variants.push(JSON.stringify(ops));
 }
 assert.equal(new Set(variants).size,8);
});
test('six classes each render eight valid directions with layered account identity',()=>{
 for(const actor of MAGES){
  const views=[];
  for(let i=0;i<8;i++){
   const canvas=trace();
   const before=JSON.stringify(castPose);
   drawMage(canvas.ctx,guest,{x:170,y:310,mageId:actor.id,face:i*Math.PI/4,
     scale:1.32,time:.25,casting:.38,pose:castPose});
   assert.equal(canvas.ctx.depth,0,actor.id+' '+i+' balanced state');
   assert.equal(before,JSON.stringify(castPose),'pure artwork must not mutate pose');
   assert.ok(canvas.ops.length>140);
   views.push(JSON.stringify(canvas.ops));
  }
  assert.equal(new Set(views).size,8,actor.id+' has a repeated directional sprite');
 }
});
test('face turns stay close to aim with no state mutation or shot angle offsets',()=>{
 const no={x:0,y:0,attack:false,shield:false,dash:false};
 for(const m of MAGES){
  const actor={id:0,mageId:m.id,face:0,cast:0,shield:0,flash:0,dash:0,stun:0};
  const director=new MageMotion();
  director.sample(actor,{x:200,y:310},0,1);
  for(let i=0;i<8;i++){
   const angle=i*Math.PI/4;
   actor.face=angle;
   const p=director.sample(actor,{x:200,y:310},.016*(i+1),1);
   assert.ok(Math.abs(signedTurn(p.look,p.aimFace))<=.181,'turn lag max 10 degrees');
   const s=makeMatch(19,m.id,'pebble');s.actors[0].x=200;s.actors[0].y=310;
   const aim={x:200+Math.cos(angle)*125,y:310+Math.sin(angle)*125};
   const copy=JSON.stringify(aim);
   tick(s,{x:0,y:0,attack:true,aim},STEP,no);
   const q=s.shots.find(x=>x.owner===0);
   assert.ok(q);
   assert.ok(close(signedTurn(Math.atan2(q.vy,q.vx),normalizeFacing(angle)),0,1e-7),
     m.id+' wrong projectile heading '+angle);
   assert.equal(JSON.stringify(aim),copy,'cannot rewrite aim');
  }
 }
});
test('Reduce Motion uses exact orientation instead of interpolated temporal turns',()=>{
 const a={id:0,mageId:'wire',face:0,cast:0,flash:0,shield:0,dash:0};
 const director=new MageMotion();
 director.sample(a,{x:200,y:310},0,1,true);
 a.face=-3*Math.PI/4;
 const p=director.sample(a,{x:200,y:310},.016,1,true);
 assert.ok(close(p.look,normalizeFacing(a.face)));
 assert.equal(p.windup,0);
 assert.equal(p.weaponTilt,0);
 assert.equal(faceView(p.look).label,'NW');
});
