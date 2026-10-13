import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,RETIRED_ARTWORK_IDS,ARCHIVE_EDITION,normalizeArchiveEntry,artworkURL,artworkFallbackURL,zoneFor} from '../artworks.js';
import {PLAYFUL_ADDITIONS} from '../museum-playful.js';
import {ART_SCHOOLS} from '../art-provenance.js';

const oldRealCount=54;
assert.equal(REAL_COUNT,72,'54 existing + 18 newly curated authentic paintings');
assert.equal(ART_SCHOOLS.length,REAL_COUNT,'each painting has a school, including additions');
assert.equal(PLAYFUL_ADDITIONS.length,18);
assert.deepEqual(RETIRED_ARTWORK_IDS,[17],'Babel is retired without shifting the original ID');
assert.equal(ARTS[17].title,'Вавилонская башня');
assert.ok(!PLAYABLE_IDS.includes(17),'retired painting cannot be selected in a new round');
assert.ok(!PLAYABLE_IDS.includes(0),'the original cover remains out of active games');
assert.equal(PLAYABLE_IDS.length,70,'five alternatives drawn from 70 playable classics');
assert.ok(PLAYABLE_IDS.includes(54)&&PLAYABLE_IDS.includes(71));
assert.deepEqual(PLAYABLE_IDS.slice(-18),Array.from({length:18},(_,i)=>54+i));

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
// Edition 3 legacy works were saved at 54+, now they begin at 72.
// Rebase archives without accidentally converting new artwork IDs.
assert.deepEqual(normalizeArchiveEntry({art:53,edition:3}),{art:53,edition:4});
assert.deepEqual(normalizeArchiveEntry({art:54,edition:3}),{art:72,edition:4});
assert.deepEqual(normalizeArchiveEntry({art:103,edition:3}),{art:121,edition:4});
assert.deepEqual(normalizeArchiveEntry({art:54,edition:ARCHIVE_EDITION}),{art:54,edition:4});
assert.deepEqual(normalizeArchiveEntry({art:8,edition:2}),{art:72,edition:4});
assert.deepEqual(normalizeArchiveEntry({art:0,edition:1}),{art:72,edition:4});
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
assert.equal(data.version,'1.28.0');
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={},sandbox={exports,Date,Math,Number,Array,Object,JSON,Set,Map,Error,console};
runInNewContext(compiled,sandbox);
assert.equal(exports.RULESET_VERSION,16,'new room protocol v17');
assert.match(source,/const CATALOG_COUNT=72;/);
assert.match(source,/EXCLUDED_PAINTINGS=new Set\(\[17\]\)/,'server excludes Babel');
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
console.log('ZAMAZKA: 18 curated works, safe Commons paths, no Tower of Babel, legacy archives and 70-art server lottery OK');
