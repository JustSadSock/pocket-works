import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SECOND_APPROVED_WORKS} from '../../art-cabinet/second-approved.js';
import {SECOND_APPROVED_2026_ADDITIONS as SECOND} from '../museum-approved-second-2026.js';
import {APPROVED_2026_ADDITIONS as FIRST} from '../museum-approved-2026.js';
import {ARTS,REAL_COUNT,PLAYABLE_IDS,RETIRED_ARTWORK_IDS,ARCHIVE_EDITION,normalizeArchiveEntry,artworkURL,artworkFallbackURL,artworkOriginalURL,zoneFor} from '../artworks.js';
import {ART_SCHOOLS} from '../art-provenance.js';
const requestedRemoval=[2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69,115];
const chosen=[102,103,104,106,107,108,112,116,117,124,125,126,127,133,134,135,136,137,139,142,144,145,146,147,148,176,191,192];
assert.deepEqual(RETIRED_ARTWORK_IDS,requestedRemoval);
assert.equal(ARTS[115].title,'Смерть юного Бара');
assert.equal(ARTS[115].kartotekaId,116);
assert.ok(!PLAYABLE_IDS.includes(115),'Bara should not be selected in new games');
assert.equal(new Set(RETIRED_ARTWORK_IDS).size,27);
assert.ok(PLAYABLE_IDS.every(id=>!RETIRED_ARTWORK_IDS.includes(id)&&id>0));
assert.equal(SECOND.length,28);
assert.equal(FIRST.length,36);
assert.equal(REAL_COUNT,136);
assert.equal(ART_SCHOOLS.length,136);
assert.equal(PLAYABLE_IDS.length,108);
assert.deepEqual(SECOND.map(a=>a.kartotekaId),chosen);
assert.deepEqual(SECOND_APPROVED_WORKS.map(w=>w.displayId),chosen);
const oldNames=new Set(ARTS.slice(0,108).map(w=>w.file));
const newNames=new Set();
for(const [i,record] of SECOND.entries()){
 const id=108+i,chosenWork=SECOND_APPROVED_WORKS[i];
 assert.equal(record.title,chosenWork.title,'exact original title for selection '+record.kartotekaId);
 assert.equal(record.kartotekaId,chosenWork.displayId);
 assert.equal(ARTS[id].kartotekaId,chosenWork.displayId);
 assert.equal(ARTS[id].title,record.title);
 assert.equal(ARTS[id].artist,record.artist);
 assert.equal(ARTS[id].isReal,true);
 assert.equal(ARTS[id].schoolCountry,record.schoolCountry);
 assert.equal(record.schoolCountry,ART_SCHOOLS[id]);
 assert.ok(record.museum&&record.date);
 assert.match(record.file,/\.(?:jpe?g|png)$/i);
 assert.match(record.path,/^[a-f0-9]\/[a-f0-9]{2}\/$/);
 const canonical=decodeURIComponent(record.file);
 assert.equal(record.commonsFile,canonical.replaceAll('_',' '));
 const hex=createHash('md5').update(canonical).digest('hex');
 assert.equal(record.path,hex[0]+'/'+hex.slice(0,2)+'/', 'MD5 Commons shard for '+record.kartotekaId);
 assert.equal(record.source,'https://commons.wikimedia.org/wiki/File:'+record.file);
 assert.ok(!oldNames.has(record.file),'not duplicated from old collection');
 assert.ok(!newNames.has(record.file),'not duplicated in new collection');
 newNames.add(record.file);
 assert.ok(artworkURL(id).endsWith('/1920px-'+record.file));
 assert.ok(artworkFallbackURL(id,artworkURL(id)).endsWith('/1280px-'+record.file));
 assert.equal(artworkFallbackURL(id,artworkURL(id,960)),artworkOriginalURL(id),'full original used when all three thumbnail widths fail');
 assert.ok(artworkOriginalURL(id).endsWith(record.path+record.file));
 assert.equal(artworkFallbackURL(id,artworkOriginalURL(id)),'','last fallback must terminate');
 assert.ok(zoneFor(id,417).points.length>=4,'painting must generate damage');
 if(id!==115)assert.ok(PLAYABLE_IDS.includes(id),'other approved additions remain playable');
}
assert.equal(ARCHIVE_EDITION,6);
for(const [edition,stored,expected] of [
 [6,108,108],[6,136,136],[5,107,107],[5,108,136],[5,157,185],
 [4,0,0],[4,71,71],[4,72,136],[4,121,185],
 [3,53,53],[3,54,136],[3,103,185],
 [2,7,7],[2,8,136],[1,0,136]
]){
 const normalized=normalizeArchiveEntry({art:stored,edition});
 assert.equal(normalized.art,expected,'archive edition '+edition+', art '+stored);
 assert.equal(normalized.edition,6);
}
assert.equal(ARTS[136].isReal,false,'archived original synthetic image remains at 136');
assert.equal(ARTS[185].isReal,false,'archived last synthetic image remains in order');
const server=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const snapshot=readFileSync(new URL('../../../pocketnet/module-versions/zamazka/v24.ts',import.meta.url),'utf8');
assert.equal(server,snapshot,'new rooms must use exact immutable v24 copy');
assert.match(server,/RULESET_VERSION=21/);
assert.match(server,/const CATALOG_COUNT=136/);
assert.match(server,/EXCLUDED_PAINTINGS=new Set\(\[2,4,5,9,10,14,17,18,19,22,24,27,30,32,34,36,38,43,49,51,54,55,61,62,65,69,115\]\)/);
const lock=JSON.parse(readFileSync(new URL('../../../pocketnet/modules.lock.json',import.meta.url),'utf8'));
assert.equal(lock.zamazka.current,'v24');
assert.ok(lock.zamazka.versions.includes('v21')&&lock.zamazka.versions.includes('v24'));
const config=JSON.parse(readFileSync(new URL('../app.config.json',import.meta.url),'utf8'));
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.equal(config.version,'1.40.13');
assert.match(html,/data-app-version="1\.40\.13"/);
assert.match(sw,/APP_VERSION = '1\.40\.13'/);
assert.match(sw,/museum-approved-second-2026\.js/);
console.log('ZAMAZKA curation: 27 rejected originals excluded, 28 approved originals added, 108 playable, archive editions 1-6 safe, server v24 OK');
