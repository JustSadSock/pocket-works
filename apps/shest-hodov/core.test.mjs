import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, start, apply, legal, validateStored, ownerOfRegion, scoreOfRegions } from './core.js';
const must=(s,a)=>{const result=apply(s,a);assert.equal(result.ok,true,result.reason);return result.state};
test('all six strategies start and validate',()=>{
  assert.equal(Object.keys(MODES).length,6);
  for(const kind of Object.keys(MODES))assert.ok(validateStored(start(kind)),kind);
});
test('bridge blocks occupied cells and detects connected sides',()=>{
  let s=start('bridge');s=must(s,{id:0});
  assert.equal(apply(s,{id:0}).ok,false);
  s=must(s,{id:7});s=must(s,{id:1});s=must(s,{id:8});
  for(let i=2;i<7;i++){s=must(s,{id:i});if(i!==6)s=must(s,{id:7+i})}
  assert.equal(s.finished,true);assert.equal(s.winner,0);
});
test('infection flips surrounded chips',()=>{
  const s=start('infection');assert.equal(legal(s).length,4);
  const n=must(s,{id:legal(s)[0]});
  assert.equal(n.cells.filter(v=>v===0).length,4);
  assert.equal(n.turn,1);
  assert.equal(apply(s,{id:0}).ok,false);
});
test('chasm deletes old cells',()=>{
  const s=start('void');assert.equal(apply(s,{id:10}).ok,false);
  const next=must(s,{id:1});assert.equal(next.cells[0],-2);assert.equal(next.cells[1],0);
});
test('rotation requires a rotation and then a move',()=>{
  let s=start('rotate');assert.equal(apply(s,{type:'move',id:13}).ok,false);
  s=must(s,{type:'rotate',block:0,dir:1});
  assert.equal(s.stage,'move');s=must(s,{type:'move',id:legal(s)[0]});
  assert.equal(s.stage,'rotate');assert.equal(s.turn,1);
});
test('influence hides first plan and scores regions after reveal',()=>{
  let s=start('influence');
  assert.equal(apply(s,{type:'submit',alloc:[2,0,0,0,0]}).ok,false);
  s=must(s,{type:'submit',alloc:[3,0,0,0,0]});
  assert.equal(s.phase,'pass');
  s=must(s,{type:'continue'});
  s=must(s,{type:'submit',alloc:[0,3,0,0,0]});
  assert.equal(s.phase,'reveal');assert.equal(s.round,1);
  assert.equal(ownerOfRegion(s,0),0);assert.equal(ownerOfRegion(s,1),1);
  assert.deepEqual(scoreOfRegions(s),[1,1]);
});
test('protocol resolves simultaneous contested cells deterministically',()=>{
  let s=start('protocol');
  s=must(s,{type:'submit',commands:['right','right']});
  s=must(s,{type:'continue'});
  s=must(s,{type:'submit',commands:['left','left']});
  assert.deepEqual(s.positions,[11,13]);
  assert.equal(s.round,1);assert.equal(s.phase,'reveal');
});
test('both secret-games terminate after eight rounds',()=>{
  for(const kind of ['influence','protocol']){
    let s=start(kind);
    for(let r=0;r<8;r++){
      if(r)s=must(s,{type:'continue'});
      for(let p=0;p<2;p++){
        if(p)s=must(s,{type:'continue'});
        s=must(s,kind==='influence'?{type:'submit',alloc:p?[0,3,0,0,0]:[3,0,0,0,0]}:{type:'submit',commands:['up','stay']});
      }
    }
    assert.equal(s.finished,true);assert.equal(s.round,8);
  }
});
test('randomized complete games never reach illegal state',()=>{
  let seed=17;const rnd=n=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n;
  for(const kind of Object.keys(MODES))for(let run=0;run<20;run++){
    let s=start(kind),steps=0;
    while(!s.finished&&steps<200){
      let action;
      if(kind==='rotate')action=s.stage==='rotate'?{type:'rotate',block:rnd(9),dir:rnd(2)?1:-1}:{type:'move',id:legal(s)[rnd(legal(s).length)]};
      else if(kind==='influence'||kind==='protocol'){
        if(s.phase==='pass'||s.phase==='reveal')action={type:'continue'};
        else if(kind==='influence'){const alloc=[0,0,0,0,0];alloc[rnd(5)]=3;action={type:'submit',alloc}}
        else action={type:'submit',commands:[['up','down','left','right','stay'][rnd(5)],['up','down','left','right','stay'][rnd(5)]]};
      }else action={id:legal(s)[rnd(legal(s).length)]};
      s=must(s,action);assert.ok(validateStored(s));steps++;
    }
    assert.equal(s.finished,true,kind+' should terminate');
  }
});
