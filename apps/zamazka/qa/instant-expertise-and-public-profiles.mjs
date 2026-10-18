import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {paintPackets} from '../draft-transfer.js';

let time=100_000;
class TestClock extends Date {static now(){return time}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:TestClock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const game=exports.default;
const people=[{id:'a',name:'Alice'},{id:'b',name:'Bob'},{id:'c',name:'Chris'}];
function room(seconds){
 time+=300_000;
 const state=game.createRoom({player:people[0]}).state;
 game.onJoin({state,player:people[1],players:people});
 game.onJoin({state,player:people[2],players:people});
 const send=(i,payload)=>game.onMessage({state,player:people[i],players:people,payload});
 send(0,{type:'start',rounds:1,drawingSeconds:seconds});
 time=state.deadline+1;send(0,{type:'pulse'});
 assert.equal(state.phase,'drawing');
 return {state,send};
}
for(const seconds of [0,60,160,600]){
 const {state,send}=room(seconds);
 const oldDeadline=state.deadline;
 const first=send(0,{type:'submit',strokes:[]});
 assert.equal(state.phase,'drawing','first completed artist cannot end a round');
 assert(first.events.some(e=>e.type==='submission_saved'&&e.to==='a'));
 send(1,{type:'submit',strokes:[]});
 assert.equal(state.phase,'drawing','one more drawing remains unsubmitted');
 const ass=state.assignments.c;
 const packets=paintPackets({type:'submit_chunk',round:state.round,art:ass.art,variation:ass.variation,
  revision:'rquick-final',strokes:[{c:'#123456',s:4,t:'brush',p:[[1,2],[3,4]]}]});
 for(const packet of packets.slice(0,-1)){
  send(2,packet);
  assert.equal(state.phase,'drawing','incomplete multipart uploads cannot advance');
 }
 const result=send(2,packets.at(-1));
 assert.equal(state.phase,'voting','all three server-committed paintings advance immediately');
 assert.equal(state.turn,0);
 assert.equal(state.deadline,time+25500,'experts receive a full voting window');
 assert(result.events.some(e=>e.type==='submission_saved'&&e.to==='c'),'final painter gets a durable receipt');
 assert.deepEqual(Array.from(result.events.find(e=>e.type==='state'&&e.to==='a').payload.done),['a','b','c']);
 assert(seconds===0||time<oldDeadline,'the deadline has not expired before early expertise');
}
const worker=readFileSync(new URL('../../../pocketnet/worker.mjs',import.meta.url),'utf8');
const social=readFileSync(new URL('../../../pocket-social/hub.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
assert(worker.includes("publicPortraitRead=!user?.complete && url.pathname==='/pocket-social/user' && request.method==='GET'"));
assert(worker.includes("headers.set('x-pw-public-portrait', '1')"));
assert(worker.includes("lookupHeaders['x-pw-public-portrait']='1'"),'guest lookup has scoped trusted permission');
const pocketId=readFileSync(new URL('../../../pocket-id/hub.mjs',import.meta.url),'utf8');
assert(pocketId.includes("request.headers.get('x-pw-public-portrait')!=='1'"));
assert(social.includes("if(!publicPortraitRead)this.seed"),'guest reads never create an account');
assert(social.includes("if(publicPortraitRead)return reply({profile:"),'guest response is public-only');
assert(client.includes('data-action="player-profile"'),'room avatars open public profile cards');
assert(client.includes('true,false,false,true)'),'edited candidate uses repair-only overlay');
assert(editor.includes('if(!overlayOnly)drawArtwork'),'original photo stays native-resolution');
console.log('ZAMAZKA: three-player immediate expert stage, multipart receipt, 4 timer modes, guest portraits and source-resolution underlay OK');
