import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [client,server,physics,prediction]=await Promise.all([
 readFile(new URL('../game.js',import.meta.url),'utf8'),
 readFile(new URL('../server/module.ts',import.meta.url),'utf8'),
 readFile(new URL('../physics-core.js',import.meta.url),'utf8'),
 readFile(new URL('../input-prediction.js',import.meta.url),'utf8')
]);
const START='// BEGIN GENERATED BLOCKIES PHYSICS CORE (apps/blockies/physics-core.js)\n';
const END='// END GENERATED BLOCKIES PHYSICS CORE\n';
test('standalone PocketNet physics is an exact generated copy of the canonical module',()=>{
 const at=server.indexOf(START),end=server.indexOf(END,at+START.length);
 assert.ok(at>=0&&end>at);
 assert.equal(server.indexOf(START,at+START.length),-1,'only one generated physics block is permitted');
 assert.equal(server.slice(at+START.length,end),physics.replace(/^export /gm,''));
});
test('local play and input prediction import canonical physics rather than duplicate it',()=>{
 assert.match(client,/from '\.\/physics-core\.js'/);
 assert.match(prediction,/from '\.\/physics-core\.js'/);
 assert.doesNotMatch(client,/\bconst SHAPES\s*=/);
 assert.doesNotMatch(client,/\bfunction rotatedClockwise\s*\(/);
 assert.doesNotMatch(prediction,/\bfunction collision\s*\(/);
 assert.doesNotMatch(server.slice(endOfGenerated(server)),/\bconst KICK_OFFSETS\s*=/);
});
function endOfGenerated(s){return s.indexOf(END)+END.length;}
test('line ownership credit remains equivalent locally and online',()=>{
 const start='function creditClearedRows(',end='function setRandomSeed(';
 const from=source=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 assert.equal(from(client),from(server));
});
