import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,actionOf,botAction} from '../engine.js';
const a=(dir,kind='step')=>({dir,kind});
test('only valid and bounded actions enter the simulation',()=>{
 assert.equal(actionOf({dir:'up',kind:'step'}).dir,'up');
 for(const x of [{dir:'infinity',kind:'jump'},{dir:'up',kind:'nuke'},[],null])
  assert.equal(actionOf(x),null);
});
test('the board and spawns are symmetric and reproducible',()=>{
 const x=createGame(),y=createGame();assert.deepEqual(x,y);
 assert.equal(x.tiles.length,49);assert.ok(x.tiles[x.pos[0]]>0);
});
test('standing still breaks a tile after three ticks',()=>{
 const x=createGame();advance(x,[a('stay'),a('stay')]);advance(x,[a('stay'),a('stay')]);advance(x,[a('stay'),a('stay')]);
 assert.equal(x.phase,'between');assert.equal(x.last,'Оба упали');
});
test('a jump crosses a hole but cannot land on one',()=>{
 const x=createGame();x.pos[0]=16; // x=2,y=2; x=2,y=3 is void
 advance(x,[a('down','jump'),a('stay')]);
 assert.equal(x.pos[0],30);
});
test('a push into the void awards the other player a round',()=>{
 const x=createGame();x.pos=[8,9];x.tiles[10]=0;
 advance(x,[a('right','push'),a('stay')]);
 assert.equal(x.scores[0],1);assert.equal(x.phase,'between');
});
test('both players contesting the same square are blocked',()=>{
 const x=createGame();x.pos=[15,17];x.tiles[16]=3;
 advance(x,[a('right'),a('left')]);
 assert.deepEqual(x.pos,[15,17]);
});
test('bot always selects allowed commands, series ends at three wins',()=>{
 const x=createGame();for(let i=0;i<300&&x.phase!=='finished';i++)
 advance(x,[a('stay'),botAction(x)]);
 assert.ok(['battle','between','finished'].includes(x.phase));
 x.scores=[2,0];x.phase='battle';x.pos=[8,9];x.tiles[10]=0;
 advance(x,[a('right','push'),a('stay')]);
 assert.equal(x.phase,'finished');assert.equal(x.winner,0);
});
