import test from 'node:test';
import assert from 'node:assert/strict';
import {startFighters,resolveExchange,neutral,actionOf,botChoice,commitment,digest,bladeOf,CX,CY,R} from '../engine.js';

test('idle is inert: no automatic hit or bind',()=>{
  const s=startFighters(),out=resolveExchange(s,[neutral(),neutral()]);
  assert.equal(out.hit,null);
  assert.equal(out.contact,null);
  assert.deepEqual(out.before,out.after);
  assert.equal(out.frames.length,19);
});

test('input validation rejects non-numbers, overlarge values and non-finite controls',()=>{
  assert.equal(actionOf({mx:Infinity,my:0,blade:0}),null);
  assert.equal(actionOf({mx:0,my:0,blade:2}),null);
  assert.equal(actionOf({mx:'1',my:0,blade:0}),null);
  assert.ok(actionOf({mx:1,my:1,blade:.5}));
});

test('simulator is deterministic for identical actions',()=>{
  const actions=[{mx:.3,my:-.61,blade:-.78},{mx:-.1,my:.2,blade:.4}];
  const a=resolveExchange(startFighters(),actions);
  const b=resolveExchange(startFighters(),actions);
  assert.deepEqual(a,b);
  assert.ok(a.frames.length>=2&&a.frames.length<=19);
});

test('thousand exchanges preserve bounded positions and finite sword segments',()=>{
  let fighters=startFighters();
  for(let i=0;i<1000;i++){
    const left=actionOf({mx:Math.sin(i*.37),my:Math.cos(i*.41),blade:Math.sin(i*.51)});
    const right=botChoice(fighters,i),out=resolveExchange(fighters,[left,right]);
    for(const f of out.after){
      assert.ok(Number.isFinite(f.x)&&Number.isFinite(f.y)&&Number.isFinite(f.a));
      assert.ok(Math.hypot(f.x-CX,f.y-CY)<=R);
      const blade=bladeOf(f);
      assert.ok(Object.values(blade).every(Number.isFinite));
    }
    assert.ok(out.hit===null||out.hit===0||out.hit===1||out.hit==='double');
    fighters=out.hit===null?out.after:startFighters();
  }
});

test('commitment includes round, player, action and secret nonce',async()=>{
  const a={mx:0,my:1,blade:-.5},nonce='9af93111-eeee-4455-aaaa-bbbbccccdddd';
  const hash=await digest(commitment(4,0,a,nonce));
  assert.match(hash,/^[0-9a-f]{64}$/);
  assert.notEqual(hash,await digest(commitment(4,1,a,nonce)));
  assert.notEqual(hash,await digest(commitment(5,0,a,nonce)));
  assert.notEqual(hash,await digest(commitment(4,0,{...a,blade:.5},nonce)));
  assert.notEqual(hash,await digest(commitment(4,0,a,'21d4dd99-eeee-4455-aaaa-bbbbccccdddd')));
});
