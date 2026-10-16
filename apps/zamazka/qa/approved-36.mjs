import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {WORKS} from '../../art-cabinet/catalog.js';
import {APPROVED_2026_ADDITIONS} from '../museum-approved-2026.js';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,RETIRED_ARTWORK_IDS,ARCHIVE_EDITION,normalizeArchiveEntry,artworkURL,artworkFallbackURL,zoneFor} from '../artworks.js';
import {ART_SCHOOLS} from '../art-provenance.js';

const requested=[1,2,3,4,5,6,7,11,12,16,17,18,23,26,30,33,36,37,38,42,43,44,53,68,69,71,72,75,78,80,81,82,88,90,92,95];
assert.equal(APPROVED_2026_ADDITIONS.length,36);
assert.deepEqual(APPROVED_2026_ADDITIONS.map(art=>art.kartotekaId),requested,'user-approved list stays pinned');
assert.equal(REAL_COUNT,136);
assert.equal(ART_SCHOOLS.length,REAL_COUNT);
assert.deepEqual(RETIRED_ARTWORK_IDS,[2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69]);
assert.equal(PLAYABLE_IDS.length,109);
const originals=ARTS.slice(0,72);
const files=new Set(originals.map(w=>w.file));
for(const [i,work] of APPROVED_2026_ADDITIONS.entries()){
 const id=72+i;
 const source=WORKS[work.kartotekaId-1];
 assert.equal(work.title,source.title,'do not substitute different work at '+source.id);
 assert.equal(ARTS[id].title,source.title,'game ID '+id);
 assert.equal(ARTS[id].isReal,true);
 assert.equal(ARTS[id].kartotekaId,source.id);
 assert.equal(ARTS[id].schoolCountry,ART_SCHOOLS[id]);
 assert.ok(work.artist.length>3&&work.date&&work.museum);
 assert.ok(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(work.source));
 assert.ok(/^[0-9a-f]\/[0-9a-f]{2}\/$/i.test(work.path));
 assert.match(work.file,/\.(?:jpe?g|png)$/i);
 const canonical=decodeURIComponent(work.file);
 assert.equal(canonical.replaceAll('_',' '),work.commonsFile);
 const md5=createHash('md5').update(canonical).digest('hex');
 assert.equal(work.path,md5[0]+'/'+md5.slice(0,2)+'/','Commons shard for '+work.title);
 assert.equal(work.source,'https://commons.wikimedia.org/wiki/File:'+work.file);
 assert.ok(!files.has(work.file),'no source duplicates');
 files.add(work.file);
 assert.ok(artworkURL(id).endsWith('/1920px-'+work.file));
 assert.ok(artworkFallbackURL(id,artworkURL(id)).endsWith('/1280px-'+work.file));
 assert.ok(zoneFor(id,413).points.length>=4);
 assert.ok(PLAYABLE_IDS.includes(id));
}
assert.equal(new Set(APPROVED_2026_ADDITIONS.map(a=>a.file)).size,36);
const horse=APPROVED_2026_ADDITIONS.find(a=>a.kartotekaId===78);
assert.ok(horse,'Whistlejacket retained under original user selection #78');
assert.equal(horse.file,'Whistlejacket_by_George_Stubbs.jpg');
assert.equal(horse.path,'4/48/');
assert.equal(horse.source,'https://commons.wikimedia.org/wiki/File:Whistlejacket_by_George_Stubbs.jpg');
assert.equal(ARTS[100].file,horse.file,'existing game art ID 100 unchanged');
for(const id of RETIRED_ARTWORK_IDS) assert.ok(!PLAYABLE_IDS.includes(id),'retired IDs cannot be sent to new players');
assert.equal(ARTS[17].title,'Вавилонская башня');
assert.equal(ARTS[22].title,'Сад земных наслаждений');
assert.equal(ARTS[36].title,'Юпитер и Семела');
assert.equal(ARTS[0].title,'Девушка с жемчужной серёжкой');
// Historical artwork 0..71 must not move (active rooms and past restorations).
for(let i=0;i<72;i++)assert.equal(ARTS[i].file,originals[i].file);
assert.equal(ARCHIVE_EDITION,6);
for(const [edition,oldId,expectedId] of [
 [5,0,0],[5,107,107],[5,108,136],[5,157,185],
 [4,0,0],[4,53,53],[4,71,71],[4,72,136],[4,121,185],
 [3,53,53],[3,54,136],[3,103,185],
 [2,7,7],[2,8,136],[1,0,136]
])assert.equal(normalizeArchiveEntry({art:oldId,edition}).art,expectedId, 'migration '+edition+'/'+oldId);
assert.equal(normalizeArchiveEntry({art:108,edition:6}).art,108,'new original not migrated');
const server=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const pinned=readFileSync(new URL('../../../pocketnet/module-versions/zamazka/v22.ts',import.meta.url),'utf8');
assert.equal(server,pinned,'new immutable PocketNet snapshot must match module source');
assert.match(server,/const CATALOG_COUNT=136;/);
assert.match(server,/const EXCLUDED_PAINTINGS=new Set\(\[2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69\]\)/);
const lock=JSON.parse(readFileSync(new URL('../../../pocketnet/modules.lock.json',import.meta.url),'utf8'));
assert.equal(lock.zamazka.current,'v22');
assert.ok(lock.zamazka.versions.includes('v21')&&lock.zamazka.versions.includes('v22'));
const manifest=JSON.parse(readFileSync(new URL('../app.config.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.equal(manifest.version,'1.40.9');
assert.match(html,/data-app-version="1\.40\.9"/);
assert.match(sw,/const APP_VERSION = '1\.40\.9'/);
assert.match(sw,/\.\/museum-approved-2026\.js/);
assert.match(sw,/\.\/museum-approved-second-2026\.js/);
console.log('ЗАМАЗКА: all 36 originals pinned, 108 originals, 104 playable IDs, v1–v5 archive compatibility, immutable v21 backend with v20 preserved OK');
