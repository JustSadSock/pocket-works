import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,tick,STEP,validState} from '../core.mjs';
import {MAGES} from '../mages.mjs';
import {drawSignatureForeground,drawSignatureGround} from '../signature-art.mjs';
const stop={x:0,y:0,attack:false,dash:false,shield:false};
function setup(id,{ax=100,ay=310,bx=178,by=310}={}){
 const s=makeMatch(492,id,'kindle');
 Object.assign(s.actors[0],{x:ax,y:ay});
 Object.assign(s.actors[1],{x:bx,y:by,runes:[]}); // Isolate base attacks from reactive armor runes.
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
 assert.equal(s.actors[0].windup?.kind,'coil');
 assert.equal(s.beams.length,0);
 for(let i=0;i<15;i++)tick(s,{...stop,aim:{x:100,y:310}},STEP,stop);
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
 for(const s of [bare,dormant,mastered]){
  tick(s,{...stop,attack:true,aim:{x:178,y:310}},STEP,stop);
  for(let i=0;i<15;i++)tick(s,{...stop,aim:{x:100,y:310}},STEP,stop);
 }
 assert.equal(bare.actors[1].hp,dormant.actors[1].hp);
 assert.ok(mastered.actors[1].hp<bare.actors[1].hp);
});

test('stone boulder has a locked windup, real arc and landing-only contact',()=>{
 const s=setup('pebble',{bx:207}),a=s.actors[0],b=s.actors[1];
 const target={x:207,y:310};
 tick(s,{...stop,attack:true,aim:target},STEP,stop);
 assert.equal(a.windup?.kind,'pebble');
 assert.equal(s.lobs.length,0);
 // Changing cursor after the windup begins does not retarget the projectile.
 for(let i=0;i<18;i++)tick(s,{...stop,aim:{x:50,y:450}},STEP,stop);
 assert.equal(s.lobs.length,1);
 let lob=s.lobs[0];
 assert.equal(lob.tx,207);assert.equal(lob.ty,310);
 assert.equal(s.shots.filter(q=>q.owner===0).length,0);
 const before=b.hp;
 let previous=lob.x,slowStep=0,fastStep=0,peak=0,impact=false;
 for(let i=0;i<80&&s.phase==='fight'&&s.lobs.length;i++){
  tick(s,{...stop,aim:{x:20,y:20}},STEP,stop);
  lob=s.lobs[0];
  if(lob){
   peak=Math.max(peak,lob.height);
   if(i===2)slowStep=lob.x-previous;
   if(i===20)fastStep=lob.x-previous;
   previous=lob.x;
   assert.equal(b.hp,before,'boulder must not damage during flight');
  }
  impact ||= s.fx.some(f=>f.k==='impact_rock');
 }
 assert.ok(peak>20,'arc must be visibly above the ground');
 assert.ok(fastStep>slowStep,'ground projection must accelerate across the first half');
 assert.equal(s.lobs.length,0);
 assert.ok(impact,'impact event must come from the confirmed landing');
 assert.ok(b.hp<before,'landing deals damage only when target is still inside impact area');
});
test('stone can arc over low buttresses and misses a moving landing target',()=>{
 const s=setup('pebble',{ax:83,ay:203,bx:215,by:203});
 tick(s,{...stop,attack:true,aim:{x:215,y:203}},STEP,stop);
 for(let i=0;i<20;i++)tick(s,stop,STEP,stop);
 assert.equal(s.lobs.length,1);
 s.actors[1].x=300;s.actors[1].y=330;
 const hp=s.actors[1].hp;
 for(let i=0;i<85;i++)tick(s,stop,STEP,stop);
 assert.equal(s.actors[1].hp,hp,'the target dodged the grounded landing point');
 assert.equal(s.lobs.length,0);
});
test('heavy windup can be interrupted by dash without late ghost hits',()=>{
 const s=setup('coil');
 tick(s,{...stop,attack:true,aim:{x:178,y:310}},STEP,stop);
 assert.ok(s.actors[0].windup);
 tick(s,{...stop,dash:true,x:1},STEP,stop);
 assert.equal(s.actors[0].windup,null);
 for(let i=0;i<22;i++)tick(s,stop,STEP,stop);
 assert.equal(s.beams.length,0);
 assert.equal(s.actors[1].hp,100);
});
test('flame grows on hold; quick ball speeds rise while wire pulse slows',()=>{
 const hot=setup('cinder');tick(hot,{...stop,attack:true,aim:{x:178,y:310}},STEP,stop);
 const first=hot.streams[0].length;
 for(let i=0;i<13;i++)tick(hot,{...stop,attack:true,aim:{x:178,y:310}},STEP,stop);
 assert.ok(hot.streams[0].length>first);
 tick(hot,stop,STEP,stop);assert.equal(hot.streams.length,0);
 const orb=setup('kindle',{bx:320}),bolt=setup('wire',{bx:320});
 for(const s of [orb,bolt])tick(s,{...stop,attack:true,aim:{x:320,y:310}},STEP,stop);
 const a=orb.shots[0],b=bolt.shots[0];
 const firstOrb=Math.hypot(a.vx,a.vy),firstBolt=Math.hypot(b.vx,b.vy);
 for(let i=0;i<8;i++){tick(orb,stop,STEP,stop);tick(bolt,stop,STEP,stop)}
 assert.ok(Math.hypot(a.vx,a.vy)>firstOrb);
 assert.ok(Math.hypot(b.vx,b.vy)<firstBolt);
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
