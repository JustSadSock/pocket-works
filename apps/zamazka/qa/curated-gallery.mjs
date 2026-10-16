import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,RETIRED_ARTWORK_IDS,ARCHIVE_EDITION,normalizeArchiveEntry,artworkURL,artworkFallbackURL,zoneFor} from '../artworks.js';
import {PLAYFUL_ADDITIONS} from '../museum-playful.js';
import {APPROVED_2026_ADDITIONS} from '../museum-approved-2026.js';
import {ART_SCHOOLS} from '../art-provenance.js';
// Execute the second edition and 26-removal invariants whenever the existing museum suite runs.
import './final-curation-28-26.mjs';

const oldRealCount=54;
assert.equal(REAL_COUNT,136,'54 original + 18 playful + 36 first approvals + 28 second approvals');
assert.equal(ART_SCHOOLS.length,REAL_COUNT,'each painting has a school, including additions');
assert.equal(PLAYFUL_ADDITIONS.length,18);
assert.equal(APPROVED_2026_ADDITIONS.length,36);
assert.equal(ARTS[22].title,'Сад земных наслаждений');
assert.equal(ARTS[36].title,'Юпитер и Семела');
assert.ok(!PLAYABLE_IDS.includes(22)&&!PLAYABLE_IDS.includes(36));
assert.deepEqual(RETIRED_ARTWORK_IDS,[2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69],'All 26 user-rejected old paintings excluded, original IDs retained');
assert.equal(ARTS[17].title,'Вавилонская башня');
assert.ok(!PLAYABLE_IDS.includes(17),'retired painting cannot be selected in a new round');
assert.ok(!PLAYABLE_IDS.includes(0),'the original cover remains out of active games');
assert.equal(PLAYABLE_IDS.length,109,'136 originals minus cover and 26 rejected works');
assert.ok(!PLAYABLE_IDS.includes(54)&&PLAYABLE_IDS.includes(71)&&PLAYABLE_IDS.includes(107)&&PLAYABLE_IDS.includes(135));
assert.deepEqual(PLAYABLE_IDS.slice(-28),Array.from({length:28},(_,i)=>108+i));

const existingFileNames=new Set(ARTS.slice(0,54).map(a=>a.file));
const newNames=new Set();
for(const [idx,a] of PLAYFUL_ADDITIONS.entries()){
 const id=oldRealCount+idx;
 assert.equal(ARTS[id].title,a.title,'curation order gives stable id '+id);
 assert.equal(ARTS[id].schoolCountry,ART_SCHOOLS[id]);
 assert.ok(typeof a.artist==='string'&&a.artist.length>=5);
 assert.ok(typeof a.museum==='string'&&a.museum.length>=5);
 assert.ok(typeof a.date==='string'&&a.date.length>=4);
 const canonical=decodeURIComponent(a.file);
 assert.equal(a.commonsFile,canonical.replaceAll('_',' '),'filename matches Commons source');
 assert.ok(!existingFileNames.has(a.file),'no duplicate of an existing painting');
 assert.ok(!newNames.has(a.file),'no duplicate among the 18 additions');
 newNames.add(a.file);
 const digest=createHash('md5').update(canonical).digest('hex');
 assert.equal(a.path,digest[0]+'/'+digest.slice(0,2)+'/','Wikimedia shard path correct for '+a.title);
 assert.equal(a.source,'https://commons.wikimedia.org/wiki/File:'+a.file);
 const image=artworkURL(id);
 assert.ok(image.endsWith('/1920px-'+a.file),'usable 1920px thumbnail format for '+a.title);
 assert.ok(artworkFallbackURL(id,image).endsWith('/1280px-'+a.file),'1280px fallback is available');
 assert.equal(ARTS[id].isReal,true);
 assert.ok(zoneFor(id,123).points.length>=4,'procedural damage exists on new original '+id);
}
// Edition 3 legacy works were saved at 54+; they now begin at 108.
// Rebase archives without accidentally converting new artwork IDs.
assert.deepEqual(normalizeArchiveEntry({art:53,edition:3}),{art:53,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:54,edition:3}),{art:136,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:103,edition:3}),{art:185,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:54,edition:ARCHIVE_EDITION}),{art:54,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:8,edition:2}),{art:136,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:0,edition:1}),{art:136,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:71,edition:4}),{art:71,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:72,edition:4}),{art:136,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:121,edition:4}),{art:185,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:107,edition:5}),{art:107,edition:6});
assert.deepEqual(normalizeArchiveEntry({art:108,edition:5}),{art:136,edition:6});
assert.equal(ARTS[normalizeArchiveEntry({art:54,edition:3}).art].isReal,false,'saved legacy restoration keeps its original image');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(app,/museumOrder=\[0,\.\.\.PLAYABLE_IDS/,'museum carousel hides retired painting');
assert.match(app,/map\(normalizeArchiveEntry\)/,'old local archive IDs are migrated');
assert.match(app,/items\.map\(normalizeArchiveEntry\)/,'old cloud archive IDs are migrated');
assert.match(app,/p\.selected=p\.selected\.map\(art=>normalizeArchiveEntry/,'saved solo round migrated too');
const cloud=readFileSync(new URL('../cloud-sync.js',import.meta.url),'utf8');
assert.match(cloud,/normalizeArchiveEntry\(original\)/,'cloud sync unifies old and new editions');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.match(sw,/\.\/museum-playful\.js/,'offline shell contains new catalogue');
const data=JSON.parse(readFileSync(new URL('../app.config.json',import.meta.url),'utf8'));
assert.equal(data.version,sw.match(/const APP_VERSION = '([^']+)'/)?.[1], 'app manifest and offline runtime versions match');
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={},sandbox={exports,Date,Math,Number,Array,Object,JSON,Set,Map,Error,console};
runInNewContext(compiled,sandbox);
assert.equal(exports.RULESET_VERSION,19,'new room protocol version');
assert.match(source,/const CATALOG_COUNT=136;/);
assert.match(source,/EXCLUDED_PAINTINGS=new Set\(\[2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69\]\)/,'server excludes all 26 rejected paintings');
const mod=exports.default,players=[{id:'a',name:'A'},{id:'b',name:'B'}];
const state=mod.createRoom({player:players[0]}).state;
mod.onJoin({state,player:players[1],players});
for(let n=0;n<35;n++){
 state.phase='lobby';
 mod.onMessage({state,player:players[0],players,payload:{type:'start',rounds:1}});
 assert.equal(state.selected.length,5);
 assert.equal(new Set(state.selected).size,5,'each voting wall keeps five distinct original paintings');
 assert.ok(state.selected.every(id=>PLAYABLE_IDS.includes(id)),'server lottery stays in playable museum');
 assert.ok(state.participants.every(p=>state.selected.includes(state.assignments[p.id].art)));
}
console.log('ZAMAZKA: 36 approved works, 108 real paintings, old archive migrations and 104 playable paintings OK');
