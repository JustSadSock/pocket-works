import test from 'node:test';
import assert from 'node:assert/strict';
import {MODES,start,apply,legal,validateStored} from './core.js';
import {chooseAIAction,isAITurn} from './ai.js';
const levels=['easy','normal','hard'];
function move(s,a){const r=apply(s,a);assert.equal(r.ok,true,'illegal AI or scripted action '+JSON.stringify(a)+': '+r.reason);assert.ok(validateStored(r.state));return r.state}
function humanAction(s){
  if(s.kind==='rotate')return s.stage==='rotate'?{type:'rotate',block:(s.ply*3)%9,dir:s.ply%2?1:-1}:{type:'move',id:legal(s)[0]};
  if(s.kind==='influence')return s.phase==='reveal'?{type:'continue'}:{type:'submit',alloc:[0,0,1,1,1]};
  if(s.kind==='protocol')return s.phase==='reveal'?{type:'continue'}:{type:'submit',commands:['up','right']};
  return {id:legal(s)[0]};
}
for(const kind of Object.keys(MODES))test(kind+' — all difficulties return legal deterministic AI actions',()=>{
  let s=start(kind);s.opponent='ai';
  if(kind==='influence'||kind==='protocol'){
    s=move(s,humanAction(s));
    assert.equal(isAITurn(s),true);
    s=move(s,chooseAIAction(s));
    assert.equal(s.phase,'plan');
  }else{
    // First player must always be human. Reversi, Hex, Void and Rotate have legal first turns.
    s=move(s,humanAction(s));
    if(kind==='rotate')s=move(s,humanAction(s));
  }
  assert.equal(isAITurn(s),true);
  for(const difficulty of levels){
    const action=chooseAIAction(s,difficulty);
    assert.deepEqual(action,chooseAIAction(s,difficulty),'AI should have no random tie-break');
    assert.ok(action,'AI has a legal move');
    const next=move(s,action);
    if(kind==='rotate'&&!next.finished){
      assert.equal(next.stage,'move');
      const follow=chooseAIAction(next,difficulty);
      assert.ok(follow&&follow.type==='move');
      move(next,follow);
    }
  }
});
test('bots cannot peek at an unrevealed human secret allocation or command',()=>{
  for(const kind of ['influence','protocol']){
    let s=start(kind);s.opponent='ai';
    s=move(s,humanAction(s));s=move(s,{type:'continue'});
    assert.equal(s.planner,1);
    const other=structuredClone(s);
    other.pending[0]=kind==='influence'?[3,0,0,0,0]:['left','left'];
    for(const difficulty of levels)
      assert.deepEqual(chooseAIAction(s,difficulty),chooseAIAction(other,difficulty),kind+' must not read private plans');
  }
});
test('AI identifies a one-move Hex win',()=>{
  let s=start('bridge');s.opponent='ai';s.turn=1;
  for(let row=0;row<6;row++)s.cells[row*7]=1;
  const a=chooseAIAction(s,'hard');
  assert.ok(Number.isInteger(a.id));
  const n=move(s,a);
  assert.equal(n.finished,true);assert.equal(n.winner,1);
});
test('AI moves preserve all state invariants across complete easy-level matches',()=>{
  for(const kind of Object.keys(MODES)){
    let s=start(kind);s.opponent='ai';s.difficulty='easy';let iterations=0;
    while(!s.finished&&iterations<250){
      if(isAITurn(s)){
        const action=chooseAIAction(s,s.difficulty);
        assert.ok(action,kind+' must return an action at phase '+s.phase);
        s=move(s,action);
      }else s=move(s,humanAction(s));
      iterations++;
    }
    assert.ok(s.finished,kind+' match did not end');
    assert.ok(iterations<250,kind+' took too long');
    assert.ok([0,1,-1].includes(s.winner));
  }
});
test('old saved human vs human states stay local without new fields',()=>{
  for(const kind of Object.keys(MODES)){
    const s=start(kind);assert.equal(isAITurn(s),false);
    assert.ok(validateStored(JSON.parse(JSON.stringify(s))));
  }
});
