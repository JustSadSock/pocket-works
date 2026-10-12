import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,initialize,simulate,resetLevel,getView} from '../physics.js';
const members=[{id:'a',name:'A'},{id:'b',name:'B'}];
test('Ten handcrafted levels and valid spawn',()=>{
 const w=initialize(members);assert.equal(LEVELS.length,10);assert.equal(w.players.length,2);assert.equal(getView(w).level,0);
});
test('Players can land and jump using an input edge',()=>{
 const w=initialize(members);
 for(let i=0;i<120;i++)simulate(w,1/60);
 assert.equal(w.players[0].ground,true);
 w.inputs.a={jump:true,x:0};
 simulate(w,1/60);
 assert.ok(w.players[0].vy<0,'jump creates upward velocity');
});
test('All teammates are required to finish a level',()=>{
 const w=initialize(members);for(let i=0;i<30;i++)simulate(w,1/60);
 w.players[0].x=986;simulate(w,1/60);assert.equal(w.level,0);
 w.players[1].x=985;w.players[0].y=470;w.players[1].y=470;simulate(w,1/60);
 assert.equal(w.level,1);
});
test('Paired pads open their shared gate',()=>{
 const w=initialize(members,3);
 w.players[0].x=265;w.players[0].y=491;w.players[1].x=602;w.players[1].y=491;
 simulate(w,1/60);assert.equal(w.gateOpen,true);
});
test('Ball puzzle opens a gate only on target',()=>{
 const w=initialize(members,5);assert.equal(w.gateOpen,false);
 w.ball.x=690;w.ball.y=484;simulate(w,1/60);assert.equal(w.gateOpen,true);
});
test('Restart clears the puzzle and repositions players',()=>{
 const w=initialize(members,3);w.gateOpen=true;w.players[0].x=903;resetLevel(w);assert.equal(w.gateOpen,false);assert.ok(w.players[0].x<150);
});
test('Sticky hold attaches and jump releases',()=>{
 const w=initialize(members);for(let i=0;i<120;i++)simulate(w,1/60);
 w.inputs.a={stick:true};simulate(w,1/60);assert.ok(w.players[0].stuck);
 w.inputs.a={stick:false};simulate(w,1/60);
 w.inputs.a={jump:true};simulate(w,1/60);assert.equal(w.players[0].stuck,null);
});
