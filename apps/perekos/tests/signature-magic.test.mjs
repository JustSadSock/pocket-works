import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,tick,STEP,validState} from '../core.mjs';
import {MAGES} from '../mages.mjs';
import {drawSignatureForeground,drawSignatureGround} from '../signature-art.mjs';
const stop={x:0,y:0,attack:false,dash:false,shield:false};
function setup(id,{ax=100,ay=310,bx=178,by=310}={}){
 const s=makeMatch(492,id,'kindle');
 Object.assign(s.actors[0],{x:ax,y:ay});
 Object.assign(s.actors[1],{x:bx,y:by});
 return s;
}
function advance(s,n=60){
 for(let i=0;i<n&&s.phase==='fight';i++)tick(s,{...stop,attack:true,aim:{x:s.actors[1].x,y:s.actors[1].y}},STEP,stop);
}
test('flamethrower is an actual short-range held damage stream, not a projectile',()=>{
 const near=setup('cinder'),far=setup('cinder',{bx:320});
 advance(near,36);advance(far,36);
 assert.ok(near.actors[1].hp<95,near.actors[1].hp);
 assert.ok(near.actors[1].burn>0);
 assert.equal(near.shots.length,0);assert.equal(near.streams.length,1);
 assert.equal(far.actors[1].hp,100,'outside the stream must not burn');
 assert.ok(validState(near));
});
test('walls occlude flamethrower and instant lightning',()=>{
 for(const id of ['cinder','coil']){
  const s=setup(id,{ax:83,ay:203,bx:215,by:203});
  advance(s,45);
  assert.equal(s.actors[1].hp,100,id+' cannot attack through a stone buttress');
 }
});
test('lightning is an instant real shield-stripping contact with no flying bolt',()=>{
 const s=setup('coil');s.actors[1].shield=25;
 tick(s,{...stop,attack:true,aim:{x:178,y:310}},STEP,stop);
 assert.equal(s.shots.length,0);
 assert.equal(s.beams.length,1);
 assert.ok(s.actors[1].shield<25);
 assert.ok(s.actors[1].slow>0||s.actors[1].hp<100);
});
test('stone quake advances as a real finite wave and pushes only in front',()=>{
 const s=setup('slate');const original=s.actors[1].x;
 advance(s,20);
 assert.equal(s.shots.length,0);assert.ok(s.actors[1].x>original);
 assert.ok(s.actors[1].hp<100);
 const facingAway=setup('slate',{bx:100,by:260});
 for(let i=0;i<19;i++)tick(facingAway,{...stop,attack:i===0,aim:{x:250,y:310}},STEP,stop);
 assert.equal(facingAway.actors[1].hp,100);
});
test('connected HOW runes alter signature combat; unconnected HOW runes cannot',()=>{
 const bare=setup('coil'),dormant=setup('coil'),mastered=setup('coil');
 for(const s of [dormant,mastered])s.actors[0].runes=['on_cast','heal','strong'];
 dormant.actors[0].runes=['strong','on_cast','heal'];
 for(const s of [bare,dormant,mastered])tick(s,{...stop,attack:true,aim:{x:178,y:310}},STEP,stop);
 assert.equal(bare.actors[1].hp,dormant.actors[1].hp);
 assert.ok(mastered.actors[1].hp<bare.actors[1].hp);
});
test('every new signature spell produces deterministic fixed-step snapshots',()=>{
 for(const m of MAGES){
  const a=setup(m.id),b=setup(m.id);
  for(let i=0;i<90;i++){
   const cmd={...stop,attack:true,aim:{x:178,y:310}};
   tick(a,cmd,STEP,stop);tick(b,cmd,STEP,stop);
   assert.deepEqual(a,b,'diverged for '+m.id+' at '+i);
   assert.ok(validState(a));
  }
 }
});
test('spell shape rendering is read-only and never changes simulation',()=>{
 const s=setup('cinder');tick(s,{...stop,attack:true,aim:{x:180,y:310}},STEP,stop);
 const ops=[];
 const ctx=new Proxy({},{
  get(t,k){if(k in t)return t[k];return(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),k);ops.push(k)}},
  set(t,k,v){t[k]=v;return true}
 });
 const before=JSON.stringify(s);
 drawSignatureGround(ctx,s,10);drawSignatureForeground(ctx,s,10);
 assert.equal(JSON.stringify(s),before);
 assert.ok(ops.includes('fillRect'));
});
