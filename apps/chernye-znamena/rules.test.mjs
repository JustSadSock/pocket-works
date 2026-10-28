import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,validSaved,inside,distance,unitAt,leader,commanded,reachable,attackPreview,issue,endTurn,aiAction,terrainAt,MAX_ROUNDS} from './rules.mjs';

test('valid standard and marsh battle maps',()=>{
 for(const map of ['pass','moor']){
  const s=createBattle(map);assert.equal(s.units.length,10);assert.equal(s.orders,3);
  assert.equal(s.units.filter(u=>u.side===0).length,5);assert.equal(s.units.filter(u=>u.side===1).length,5);
  assert.equal(new Set(s.units.map(u=>u.q+','+u.r)).size,10);
  assert.ok(s.units.every(u=>inside(u.q,u.r)));assert.equal(validSaved(s),true);
 }
});
test('hex geometry and terrain movement are deterministic',()=>{
 const s=createBattle();
 assert.equal(distance({q:0,r:0},{q:1,r:1}),2);
 assert.equal(distance({q:2,r:1},{q:3,r:2}),2);
 assert.equal(terrainAt(s,3,2),'ford');
 const u=s.units.find(u=>u.id==='a1');
 assert.equal(reachable(s,u.id).some(p=>p.q===3 && p.r===1),false);
});
test('cannot order enemies, used units, or jump occupied tiles',()=>{
 let s=createBattle();
 let result=issue(s,{kind:'guard',unitId:'b0'});assert.ok(result.error);
 result=issue(s,{kind:'move',unitId:'a0',q:6,r:2});assert.ok(result.error);
 result=issue(s,{kind:'guard',unitId:'a0'});assert.equal(result.error,null);s=result.state;
 assert.equal(s.orders,2);assert.ok(s.units.find(u=>u.id==='a0').guard);
 assert.ok(issue(s,{kind:'guard',unitId:'a0'}).error);
 assert.equal(validSaved(s),true);
});
test('attacks are leadership gated; friendly support improves damage',()=>{
 const s=createBattle();const a=s.units.find(x=>x.id==='a0'),b=s.units.find(x=>x.id==='b0');
 b.q=1;b.r=2;
 assert.equal(attackPreview(s,a,b)?.damage>0,true);
 const p=attackPreview(s,a,b);s.units.find(x=>x.id==='a1').q=2;s.units.find(x=>x.id==='a1').r=1;
 const p2=attackPreview(s,a,b);assert.ok(p2.damage>=p.damage);
 a.q=3;a.r=2;
 assert.equal(commanded(s,a),true);
 b.q=6;b.r=4;assert.equal(attackPreview(s,a,b),null);
});
test('guard provides coverage and response never makes negative HP',()=>{
 const s=createBattle();const a=s.units.find(x=>x.id==='a0'),b=s.units.find(x=>x.id==='b0');
 a.q=3;a.r=2;b.q=4;b.r=2;
 const p=attackPreview(s,a,b);
 b.guard=true;const q=attackPreview(s,a,b);assert.ok(q.damage<=p.damage);
 let next=issue(s,{unitId:a.id,kind:'attack',targetId:b.id});
 assert.equal(next.error,null);assert.ok(next.state.units.every(u=>u.hp>=0));
});
test('objective two consecutive own turns awards win',()=>{
 let s=createBattle();
 const u=s.units.find(x=>x.id==='a0'),old=s.units.find(x=>x.id==='a4');u.q=3;u.r=2;old.q=0;old.r=0;
 // Remove the former tile occupant from the playfield without killing it.
 old.q=1;old.r=4;
 s=endTurn(s);assert.equal(s.hold[0],1);assert.equal(s.winner,null);
 s=endTurn(s);assert.equal(s.round,2);
 s=endTurn(s);assert.equal(s.winner,0);
});
test('banner passes when carrier dies',()=>{
 const s=createBattle();const banner=s.units.find(x=>x.id==='b0');
 const attacker=s.units.find(x=>x.id==='a0');
 attacker.q=4;attacker.r=2;banner.q=5;banner.r=2;banner.hp=1;
 const result=issue(s,{kind:'attack',unitId:'a0',targetId:'b0'});
 assert.equal(result.error,null);assert.equal(result.state.units.find(u=>u.id==='b0').hp,0);
 assert.ok(leader(result.state,1));assert.notEqual(leader(result.state,1).id,'b0');
});
test('AI proposes legal actionable orders, full match terminates',()=>{
 for(const map of ['pass','moor']){
  let s=createBattle(map);let actions=0;
  for(let turn=0;turn<MAX_ROUNDS*2+5 && s.winner===null;turn++){
   if(s.turn===0){
    // Deterministic player bot: select first legal strike, otherwise advance toward objective.
    for(let j=0;j<3;j++){
      const choices=[];
      for(const u of s.units.filter(u=>u.side===0&&u.hp>0&&!u.used)){
        for(const t of s.units.filter(t=>t.side===1&&t.hp>0)){
         if(attackPreview(s,u,t))choices.push({unitId:u.id,kind:'attack',targetId:t.id,score:100});
        }
        for(const p of reachable(s,u.id))choices.push({unitId:u.id,kind:'move',q:p.q,r:p.r,score:20-distance(p,{q:3,r:2})});
      }
      choices.sort((a,b)=>b.score-a.score);
      if(!choices.length)break;
      const first=choices[0],r=issue(s,first);assert.equal(r.error,null);s=r.state;actions++;
      if(s.winner!==null)break;
    }
   } else {
    for(let j=0;j<3;j++){
      const action=aiAction(s);if(!action)break;
      const r=issue(s,action);assert.equal(r.error,null,JSON.stringify(action));s=r.state;actions++;
      if(s.winner!==null)break;
    }
   }
   if(s.winner===null)s=endTurn(s);
   assert.ok(validSaved(s));assert.ok(actions<1000);
  }
  assert.ok(s.winner!==null,'Full simulation must finish');
  assert.ok(actions>4,'AI and player should actually interact');
 }
});
test('invalid saved state is rejected',()=>{
 const s=createBattle();
 assert.equal(validSaved({...s,round:-2}),false);
 assert.equal(validSaved({...s,units:[...s.units.slice(0,9)]}),false);
 assert.equal(validSaved({...s,orders:200}),false);
});
