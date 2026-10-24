import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isReadOnlyChyepukhaUpdate} from '../chyepukha-persistence.mjs';

const source=readFileSync(new URL('../../apps/chyepukha/server/module.ts',import.meta.url),'utf8');
// The authoritative .ts source contains standard JavaScript and runs without TS transforms.
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const host={id:'author-1',name:'Автор 1',verified:false};
const room={gameId:'chyepukha',version:'v7'};
const copy=state=>structuredClone(state);
const created=()=>game.createRoom({player:host,payload:{}}).state;

test('v7 sync and denied submissions are read-only and do not need SQLite checkpoints',()=>{
 const before=created();
 const sync=game.onMessage({state:copy(before),player:host,payload:{type:'sync'}});
 assert.equal(sync.state.revision,before.revision);
 assert.equal(isReadOnlyChyepukhaUpdate(room,before,sync.state),true);
 const rejected=game.onMessage({state:copy(before),player:host,payload:{type:'submit',requestId:'rejected_123456',round:0,sheetId:'sheet-0',answer:'test'}});
 assert.equal(rejected.state.revision,before.revision);
 assert.equal(isReadOnlyChyepukhaUpdate(room,before,rejected.state),true);
});

test('legitimate lobby settings increment revision and must still persist',()=>{
 const before=created();
 const updated=game.onMessage({state:copy(before),player:host,payload:{type:'settings',settings:{maxPlayers:6}}});
 assert.equal(updated.state.settings.maxPlayers,6);
 assert.equal(updated.state.revision,before.revision+1);
 assert.equal(isReadOnlyChyepukhaUpdate(room,before,updated.state),false);
});

test('never suppress writes for legacy versions, other games, or malformed revision',()=>{
 const a={revision:4},b={revision:4};
 assert.equal(isReadOnlyChyepukhaUpdate(room,a,b),true);
 assert.equal(isReadOnlyChyepukhaUpdate({...room,version:'v6'},a,b),false);
 assert.equal(isReadOnlyChyepukhaUpdate({...room,gameId:'zamazka'},a,b),false);
 assert.equal(isReadOnlyChyepukhaUpdate(room,{},{}),false);
 assert.equal(isReadOnlyChyepukhaUpdate(room,{revision:4},{revision:5}),false);
});
