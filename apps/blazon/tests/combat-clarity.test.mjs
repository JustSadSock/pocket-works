import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCombatClarity,stepBattle} from '../combat-clarity.js';

function member(id,side,x,y,index=0,type='infantry'){
  return{id,side,squadId:`${side}-i0`,index,type,x,y,vx:0,vy:0,hp:1,morale:1,state:'forming',targetId:null,slotX:x,slotY:y,phase:index};
}
function state(){
  const p1=member('p1','player',100,500,0),p2=member('p2','player',104,502,1),e1=member('e1','enemy',102,496,0),e2=member('e2','enemy',108,497,1);
  p1.targetId='e1';p2.targetId='e1';
  const squad=(side,list)=>({id:`${side}-i0`,side,type:'infantry',index:0,maxStrength:list.length,members:list});
  return{time:1,events:[],effects:[],impact:0,player:{infantry:[squad('player',[p1,p2])],archers:[]},enemy:{infantry:[squad('enemy',[e1,e2])],archers:[]}};
}

test('warriors remain visually upright for both movement directions',()=>{
  const s=state();s.player.infantry[0].members[0].facingY=1;s.enemy.infantry[0].members[0].facingY=1;
  applyCombatClarity(s);
  assert.equal(s.player.infantry[0].members[0].facingY,-1);
  assert.equal(s.enemy.infantry[0].members[0].facingY,-1);
});

test('opposing warriors cannot occupy the same front cell',()=>{
  const s=state();applyCombatClarity(s);
  const p=s.player.infantry[0].members[0],e=s.enemy.infantry[0].members[0];
  assert.ok(p.y-e.y>=10);
});

test('volley events create readable impact feedback',()=>{
  const s=state();applyCombatClarity(s);s.events.push({rule:'volley',side:'player',targetSquadId:'enemy-i0'});applyCombatClarity(s);
  assert.ok(s.effects.length>=1);assert.ok(s.impact>=.11);
});

test('wrapper calls base step and restores upright rendering',()=>{
  const s=state();const base=value=>{value.time+=.05;value.player.infantry[0].members[0].facingY=1;};
  stepBattle(base,s,.05);
  assert.equal(s.time,1.05);assert.equal(s.player.infantry[0].members[0].facingY,-1);
});
