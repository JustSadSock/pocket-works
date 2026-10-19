import test from 'node:test';
import assert from 'node:assert/strict';
import game,{createPractice} from '../simulation.js';
const members=['a','b','c'].map(id=>({id,name:id}));
function session(){let state=game.createRoom({player:members[0],payload:{nickname:'a'}}).state;for(const player of members.slice(1))state=game.onJoin({state,player}).state;return state;}
const send=(state,id,type,payload)=>game.onMessage({state:JSON.parse(JSON.stringify(state)),player:{id},payload:{type,payload}});
test('minimum three, readiness and host permission are enforced',()=>{
 let state=game.createRoom({player:members[0]}).state;state=send(state,'a','start_game').state;assert.equal(state.room.phase,'lobby');for(const player of members.slice(1))state=game.onJoin({state,player}).state;state=send(state,'a','start_game').state;assert.equal(state.room.phase,'lobby');for(const id of ['b','c'])state=send(state,id,'toggle_ready').state;state=send(state,'b','start_game').state;assert.equal(state.room.phase,'lobby');state=send(state,'a','start_game').state;assert.equal(state.room.phase,'playing');
});
test('foreign tiles cannot move; trails block other players and expire',()=>{
 const real=Date.now;let now=1e6;Date.now=()=>now;
 try{let state=session();for(const id of ['b','c'])state=send(state,id,'toggle_ready').state;state=send(state,'a','start_game').state;
 state=send(state,'b','drag_update',{tileId:0,cells:[0],targetCell:0}).state;assert.deepEqual(state.room.game.activeDrags,{});
 state=send(state,'a','drag_update',{tileId:0,cells:[0],targetCell:0}).state;state=send(state,'a','drag_end',{tileId:0,cells:[0],targetCell:0}).state;assert.equal(state.room.game.board[0],0);
 let r=send(state,'b','drag_update',{tileId:1,cells:[0,1],targetCell:1});state=r.state;assert.ok(r.events.some(e=>e.type==='legacy'&&e.payload.type==='drag_denied'));now+=30001;state=send(state,'b','drag_update',{tileId:1,cells:[0,1],targetCell:1}).state;assert.ok(state.room.game.activeDrags.b);state=send(state,'b','drag_end',{tileId:1,cells:[0,1],targetCell:1}).state;assert.equal(state.room.game.board[1],1);
 }finally{Date.now=real;}
});
test('offline practice completes entire puzzle, persists and returns to lobby',()=>{
 let state=createPractice(members[0]);state=send(state,'a','start_game').state;for(let tile=0;tile<state.room.game.totalTiles;tile++){state=send(state,'a','drag_update',{tileId:tile,cells:[tile],targetCell:tile}).state;state=send(state,'a','drag_end',{tileId:tile,cells:[tile],targetCell:tile}).state;}
 assert.equal(state.room.phase,'results');const view=game.viewForPlayer({state:JSON.parse(JSON.stringify(state)),player:members[0]});assert.equal(view.game.score.completion,1);assert.equal(view.game.score.completionPercent,100);state=send(state,'a','play_again').state;assert.equal(state.room.phase,'lobby');assert.equal(state.room.game,null);
});
