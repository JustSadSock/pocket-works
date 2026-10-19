import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../simulation.js';
test('terminal activation, energy, boss and final victory survive PocketNet serialization',()=>{
 const actual=Date.now;let now=1e6;Date.now=()=>now;
 try{const player={id:'a',name:'A'};let state=game.createRoom({player}).state;const send=(event,payload={})=>{state=game.onMessage({state:JSON.parse(JSON.stringify(state)),player,payload:{event,payload}}).state;};send('start_game');
 for(let t=0;t<3;t++){const terminal=state.room.terminals[t];state.room.players[0][1].x=terminal.x;state.room.players[0][1].y=terminal.y;for(let i=0;i<18;i++){now+=200;send('input',{interact:true});}assert.equal(state.room.terminals[t].active,true);}
 state.room.reactor.energy=state.room.reactor.target;now+=200;send('sync');assert.equal(state.room.boss.spawned,true);assert.equal(state.room.mode,'playing');assert.ok(state.room.enemies.some(e=>e.type==='boss'));state.room.enemies=state.room.enemies.filter(e=>e.type!=='boss');now+=200;send('sync');assert.equal(state.room.mode,'won');send('restart_game');assert.equal(state.room.mode,'lobby');assert.equal(state.room.reactor.energy,0);assert.ok(state.room.terminals.every(t=>!t.active));
 }finally{Date.now=actual;}
});
test('reactor loss ends the match; non-host cannot start or reset',()=>{
 const a={id:'a',name:'A'},b={id:'b',name:'B'};let state=game.createRoom({player:a}).state;state=game.onJoin({state,player:b}).state;assert.throws(()=>game.onMessage({state,player:b,payload:{event:'start_game'}}));state=game.onMessage({state,player:b,payload:{event:'set_ready',payload:{ready:true}}}).state;state=game.onMessage({state,player:a,payload:{event:'start_game'}}).state;state.room.reactor.integrity=0;state.lastTick-=200;state=game.onMessage({state,player:a,payload:{event:'sync'}}).state;assert.equal(state.room.mode,'lost');assert.throws(()=>game.onMessage({state,player:b,payload:{event:'restart_game'}}));
});
