import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FILM_MODES,estimateFilmTimes,validateFilmMode} from '../film-cleanup.js';
test('three film models are genuine independent choices',()=>{
 assert.deepEqual(FILM_MODES.map(x=>x.id),['umx','hybrid','scnet']);
 for(const m of FILM_MODES)assert.equal(validateFilmMode(m.id),m.id);
 assert.throws(()=>validateFilmMode('mrx'));
});
test('time estimates use measured comparative runtime without promising fixed results',()=>{
 const t=estimateFilmTimes(90);
 assert.equal(t.umx,5);
 assert.equal(t.scnet,150);
 assert(t.hybrid>t.umx&&t.hybrid<t.scnet);
 assert.equal(estimateFilmTimes(0).umx,0);
});
test('cleaned PCM really replaces source audio in exported video',()=>{
 const code=readFileSync(new URL('../media-lab.js',import.meta.url),'utf8');
 assert.match(code,/audioPCM\s*=\s*null/);
 assert.match(code,/audioSource\.connect\(destination\)/);
 assert.match(code,/audioSource\?\.start\(\)/);
 assert.match(code,/else if \(keepAudio\)/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/await cleanFilmSound\(/);
 assert.match(app,/audioPCM:plan\.channels/);
 assert.match(app,/videoExportBlob=result;filmPreparedBlob=result/);
 assert.match(app,/cleaned:!!cleaned/);
});
test('regional hybrid passes only selected original PCM, full SCNet passes whole scene',()=>{
 const code=readFileSync(new URL('../film-cleanup.js',import.meta.url),'utf8');
 assert.match(code,/const sc=await model\(original,'scnet'\)/);
 assert.match(code,/selectProblemSegments\(original,vocals,buzz\.artifact/);
 assert.match(code,/const sc=await model\(packed\.packed,'scnet'\)/);
 assert.match(code,/mixSelectivePatches\(clean,patches,1\)/);
});
test('three UI models default to UMX and display three relative estimates',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/name="film-clean-mode" value="umx" checked/);
 assert.match(html,/name="film-clean-mode" value="hybrid"/);
 assert.match(html,/name="film-clean-mode" value="scnet"/);
 for(const id of ['film-time-umx','film-time-hybrid','film-time-scnet','film-clean-cancel','film-skip'])assert(html.includes('id="'+id+'"'));
});
test('multiplayer server module and deployed v4 snapshot are identical',()=>{
 const live=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
 const pin=readFileSync(new URL('../../../pocketnet/module-versions/ne-tem-golosom/v4.ts',import.meta.url),'utf8');
 assert.equal(live,pin);
 assert.match(live,/cleaned:x\.custom===true&&x\.cleaned===true/);
});
