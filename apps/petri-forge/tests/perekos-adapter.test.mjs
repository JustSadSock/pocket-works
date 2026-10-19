import test from 'node:test';
import assert from 'node:assert/strict';
import {PEREKOS_ENVIRONMENT,PerekosEnvironment,validPerekosAction} from '../perekos-adapter.mjs';

test('adapter exposes an explicit compatible environment contract',()=>{
 assert.equal(PEREKOS_ENVIRONMENT.id,'perekos');
 assert.ok(PEREKOS_ENVIRONMENT.actions.buttons.includes('attack'));
 assert.ok(PEREKOS_ENVIRONMENT.supports.includes('restore'));
});
test('agent receives public observations without the opponent hidden rune inventory',()=>{
 const environment=new PerekosEnvironment({seed:121});
 const o=environment.observe();
 assert.equal(o.phase,'fight');assert.equal(o.self.hp,1);
 assert.ok(Array.isArray(o.self.runes));assert.equal(o.opponent.runes,undefined);
 assert.equal(o.arena.height,620);assert.equal(o.arena.width,400);
});
test('real core receives controls and advances its fixed timestep deterministically',()=>{
 const left=new PerekosEnvironment({seed:112}),right=new PerekosEnvironment({seed:112});
 const action={x:.4,y:-.2,attack:true,aim:{x:320,y:140}};
 for(let i=0;i<85;i++){
  const l=left.step(action,{x:-.3,y:.1,attack:true,aim:{x:60,y:480}});
  const r=right.step(action,{x:-.3,y:.1,attack:true,aim:{x:60,y:480}});
  assert.deepEqual(l,r);
 }
 assert.equal(left.steps,85);
 assert.ok(left.state.ticks>0);
});
test('snapshot and restore maintain a resumable live match',()=>{
 const a=new PerekosEnvironment({seed:77});
 for(let i=0;i<33;i++)a.step({x:.2,y:.2});
 const checkpoint=a.snapshot();
 const b=new PerekosEnvironment({seed:88});
 b.restore(checkpoint);
 assert.deepEqual(b.observe(),a.observe());
 const controls={x:1,y:0,shield:true,aim:{x:330,y:190}};
 assert.deepEqual(b.step(controls),a.step(controls));
});
test('invalid actions and manipulated snapshots are rejected',()=>{
 assert.equal(validPerekosAction({x:3}),false);
 assert.equal(validPerekosAction({aim:{x:999,y:12}}),false);
 assert.equal(validPerekosAction({attack:'yes'}),false);
 const env=new PerekosEnvironment();
 assert.throws(()=>env.step({x:NaN}));
 assert.throws(()=>env.restore({version:1,steps:-1,state:{}}));
});
