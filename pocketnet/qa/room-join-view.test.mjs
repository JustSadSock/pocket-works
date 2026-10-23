import assert from 'node:assert/strict';
import test from 'node:test';
import {roomJoinView} from '../room-join-view.mjs';

test('ZAMAZKA join never exposes other players\' draft, assignment, or private votes',()=>{
 const room={gameId:'zamazka',state:{phase:'drawing',assignments:{
  artist:{strokes:[{c:'#ff0000',p:[[1,2]]}]},
  guest:{strokes:[{c:'#000000',p:[[3,4]]}]}
 },drafts:{guest:[{p:[[3,4]]}]},votes:{guest:{artist:[3,0,0,0,0]}}}};
 let projections=0;
 const joined=roomJoinView(room,()=>{projections++;return room.state});
 assert.deepEqual(joined,{phase:'drawing'});
 assert.equal(projections,0,'do not deserialize or project the full gallery at join');
 assert.equal(JSON.stringify(joined).includes('strokes'),false);
});

test('Other PocketNet modules preserve their existing projected join view',()=>{
 const view={phase:'lobby',participants:[{id:'a'}]};
 let projections=0;
 assert.equal(roomJoinView({gameId:'other-game',state:{phase:'lobby'}},()=>{projections++;return view}),view);
 assert.equal(projections,1);
});
