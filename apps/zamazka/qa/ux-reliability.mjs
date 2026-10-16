import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

let time=1_000_000;
class Clock extends Date {static now(){return time}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(js,{exports,Date:Clock,Math,Number,Array,Set,Map,JSON,Object,Error,console});
const game=exports.default;
assert.equal(exports.RULESET_VERSION,18);
const host={id:'host',name:'Host'},b={id:'b',name:'B'},c={id:'c',name:'C'};
const players=[host,b,c],state=game.createRoom({player:host}).state;
game.onJoin({state,player:b,players});game.onJoin({state,player:c,players});
const send=(who,payload)=>game.onMessage({state,player:who,players,payload});
send(host,{type:'start',preload:true,rounds:1,drawingSeconds:60});
assert.equal(state.phase,'preparing','new rooms wait for selected art');
assert.equal(state.selected.length,5);
send(host,{type:'art_ready',round:1});
send(host,{type:'art_ready',round:1});
assert.equal(state.readyPlayers.length,1,'duplicate ready packet is idempotent');
send(b,{type:'art_ready',round:1});
assert.equal(state.phase,'preparing','do not consume study time before last client is ready');
send(c,{type:'art_ready',round:1});
assert.equal(state.phase,'preview');
assert.equal(state.deadline-time,25_000,'the full 25-second study window begins after readiness');
time=state.deadline+1;send(host,{type:'pulse'});
assert.equal(state.phase,'drawing');
for(const p of players)send(p,{type:'submit',strokes:[]});
assert.equal(state.phase,'drawing','all players may submit early without ending the visible timer');
time=state.deadline+1;send(host,{type:'pulse'});
assert.equal(state.phase,'voting');
const ballot={type:'vote',chips:[3,0,0,0,0]};
const first=send(b,ballot);
assert.ok(first.events.some(e=>e.type==='vote_saved'&&e.to==='b'&&e.payload.turn===0));
assert.equal(state.phase,'voting','one vote cannot advance a three-player ballot');
const again=send(b,ballot);
assert.ok(again.events.some(e=>e.type==='vote_saved'&&e.to==='b'),'retry receives server receipt');
assert.equal(Object.keys(state.votes.host).length,1,'retry never counts twice');
const final=send(c,ballot);
assert.ok(final.events.some(e=>e.type==='vote_saved'&&e.to==='c'&&e.payload.turn===0));
assert.equal(state.phase,'reveal');
const old=game.createRoom({player:host}).state;
game.onJoin({state:old,player:b,players:[host,b]});
game.onMessage({state:old,player:host,players:[host,b],payload:{type:'start',rounds:1}});
assert.equal(old.phase,'preview','existing clients retain legacy start flow');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const archive=readFileSync(new URL('../round-review.js',import.meta.url),'utf8');
assert.match(app,/preload:true/);
assert.match(app,/type:'art_ready'/);
assert.match(app,/type==='vote_saved'/);
assert.match(app,/IntersectionObserver/,'archive thumbnails load lazily');
assert.match(editor,/thumbnail\?Math\.min\(2,Math\.max\(1,screenWidth\*dpr\/W\*1\.2\)\)/,'archive previews size the canvas to actual display density');
assert.match(archive,/phase==='archive'/,'archive retains full-detail navigation');
const voteBody=app.split('function vote(){')[1]?.split('function verdict(){')[0]||'';
assert.ok(!voteBody.includes('data-magnify'),'voting intentionally has no magnification');
console.log('ZAMAZKA UX: synchronized art, complete voting receipts, legacy start, compact archive, no vote zoom: OK');

// Run the curator-only kick and network seat regression in the existing UX gate.
import './kick-player.mjs';

// Coin autovote and artwork-aspect regression shares the stable UX gate.
import './coins-and-aspect.mjs';

// Phone-sized touch controls, swipe navigation, and safe-area regressions.
import './mobile-touch.mjs';

// Gallery, compact archive and precision-on-iPhone failure cases.
import './mobile-visual-fixes.mjs';
