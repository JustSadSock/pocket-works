import test from 'node:test';
import assert from 'node:assert/strict';
import {playerRoomView} from '../private-views.mjs';
const players=[{id:'alpha'},{id:'beta'}];
const state={phase:'play',secret:{alpha:'white',beta:'black'},version:7};
const secretModule={viewForPlayer({state,player}){return {phase:state.phase,ownSecret:state.secret[player.id]}}};
test('legacy games receive unchanged snapshots',()=>{
 assert.equal(playerRoomView({},state,players[0],players),state);
});
test('private projection is per player and excludes other secrets',()=>{
 const a=playerRoomView(secretModule,state,players[0],players);
 const b=playerRoomView(secretModule,state,players[1],players);
 assert.deepEqual(a,{phase:'play',ownSecret:'white'});
 assert.deepEqual(b,{phase:'play',ownSecret:'black'});
 assert.ok(!JSON.stringify(a).includes('black'));
 assert.ok(!JSON.stringify(b).includes('white'));
});
test('projection cannot mutate authoritative state',()=>{
 const module={viewForPlayer({state,players}){state.secret.alpha='corrupt';players[0].id='corrupt';return {status:'ok'}}};
 playerRoomView(module,state,players[0],players);
 assert.equal(state.secret.alpha,'white');assert.equal(players[0].id,'alpha');
});
test('fail closed on invalid recipient or invalid view',()=>{
 assert.throws(()=>playerRoomView(secretModule,state,{id:'unknown'},players),/invalid_private_view_recipient/);
 assert.throws(()=>playerRoomView({viewForPlayer(){return null}},state,players[0],players),/invalid_private_room_view/);
 assert.throws(()=>playerRoomView({viewForPlayer(){return []}},state,players[0],players),/invalid_private_room_view/);
});
