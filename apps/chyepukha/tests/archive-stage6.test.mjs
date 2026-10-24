import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEditions,searchEditions,toggleEditionFavorite,createArchiveBackup,parseArchiveBackup,mergeArchiveBackup,MAX_EDITIONS,MAX_BACKUP_BYTES,storyText} from '../story-library.js';
import {renderArchive} from '../archive-view.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function issue(id,at=1000){
 return {id,savedAt:at,playerCount:3,stories:[
  {id:'sheet-0',starter:'Марта',setLabel:'Ланцюг провалів',genre:'Абсурдна комедія',fragments:[
   {author:'Марта',question:'Хто?',answer:'Дракон купив місячну валізу'},
   {author:'Назар',question:'Що?',answer:'Пошта зникла після вибуху огірків'}
  ]},
  {id:'sheet-1',starter:'Віра',setLabel:'Детективна справа',genre:'Нуар',fragments:[
   {author:'Віра',question:'Чому?',answer:'Загадка про секретний будинок'}
  ]}
 ]};
}
test('search finds manuscripts by Cyrillic prose, starter, genre and author without changing storage',()=>{
 const library=normalizeEditions([issue('a',100),issue('b',200)]);
 const before=JSON.stringify(library);
 for(const word of ['місячну','валізу','НАЗАР','Нуар','мАрТа','детективна']){
  const results=searchEditions(library,word);
  assert.equal(results.length,2,word);
 }
 const result=searchEditions(library,'секретний');
 assert.equal(result.length,2);
 assert.equal(result[0].stories.length,1);
 assert.equal(result[0].stories[0].id,'sheet-1');
 assert.equal(searchEditions(library,'такого тут нема').length,0);
 assert.equal(JSON.stringify(library),before);
 assert.equal(searchEditions(library,'').length,2);
});
test('favorite issues stay ahead of recent ones and survive older archive normalization',()=>{
 const base=normalizeEditions([issue('old',100),issue('new',200)]);
 assert.equal(base[0].id,'new');
 const pinned=toggleEditionFavorite(base,'old');
 assert.deepEqual(pinned.map(x=>x.id),['old','new']);
 assert.equal(pinned[0].favorite,true);
 assert.equal(toggleEditionFavorite(pinned,'old')[0].id,'new');
 assert.deepEqual(toggleEditionFavorite(base,'nonexistent'),base);
 const many=Array.from({length:MAX_EDITIONS+4},(_,i)=>issue('r'+i,i));
 const normalized=normalizeEditions(many);
 assert.equal(normalized.length,MAX_EDITIONS);
 assert.equal(normalized[0].id,'r'+(MAX_EDITIONS+3));
});
test('JSON backup round-trip keeps every chapter and favorite without changing old identifiers',()=>{
 const original=toggleEditionFavorite([issue('edition:issue-2',1000),issue('edition:issue-1',500)],'edition:issue-1');
 const serialized=createArchiveBackup(original,1234);
 const data=JSON.parse(serialized);
 assert.equal(data.format,'pocketworks-chyepukha-archive');
 assert.equal(data.version,1);
 assert.equal(data.createdAt,1234);
 const imported=parseArchiveBackup(serialized);
 assert.deepEqual(imported,normalizeEditions(original));
 assert.equal(storyText(imported[0].stories[0]),'Дракон купив місячну валізу\n\nПошта зникла після вибуху огірків');
});
test('restore merges missing editions and never replaces a local edition with a duplicate backup',()=>{
 const local=toggleEditionFavorite([issue('same',100),issue('local',200)],'local');
 const imported=toggleEditionFavorite([issue('same',999),issue('from-file',50)],'from-file');
 const merged=mergeArchiveBackup(local,imported);
 assert.equal(merged.added,1);
 assert.equal(merged.editions.length,3);
 assert.equal(merged.editions.find(x=>x.id==='same').savedAt,100);
 assert.equal(merged.editions.find(x=>x.id==='local').favorite,true);
 assert.equal(merged.editions.find(x=>x.id==='from-file').favorite,true);
 assert.equal(mergeArchiveBackup(merged.editions,imported).added,0);
});
test('malformed and oversized input is rejected; untrusted fields are escaped when rendered',()=>{
 for(const raw of ['not json','{}','{"format":"pocketworks-chyepukha-archive","version":99,"editions":[]}',JSON.stringify({format:'pocketworks-chyepukha-archive',version:1,editions:[{id:'bad',stories:[]}]})]){
  assert.throws(()=>parseArchiveBackup(raw));
 }
 assert.throws(()=>parseArchiveBackup(' '.repeat(MAX_BACKUP_BYTES+1)),/великий/);
 const raw=issue('edition-unsafe',1000);
 raw.stories[0].starter='<img src=x onerror=alert(1)>';
 raw.stories[0].fragments[0].answer='<script>steal()</script>';
 const all=normalizeEditions([raw]);
 const result=renderArchive({all,visible:all,edition:all[0],story:all[0].stories[0],readerMode:'pages',readerPage:0,escape});
 assert.doesNotMatch(result,/<script>|<img src=/);
 assert.match(result,/&lt;img/);
 assert.match(result,/&lt;script&gt;/);
});
test('archive has actual page navigation, full-text mode, search, backup and favorites',()=>{
 const all=normalizeEditions([issue('new',200),issue('old',100)]);
 const args={all,visible:all,edition:all[0],story:all[0].stories[0],query:'',readerPage:0,escape};
 const page=renderArchive({...args,readerMode:'pages'});
 assert.match(page,/data-act="archive-export"/);
 assert.match(page,/data-act="archive-import"/);
 assert.match(page,/id="archiveImportFile"/);
 assert.match(page,/id="archiveSearch"/);
 assert.equal((page.match(/data-act="archive-pin"/g)||[]).length,2);
 assert.match(page,/data-act="archive-next-part"/);
 assert.doesNotMatch(page,/Пошта зникла/);
 const last=renderArchive({...args,readerMode:'pages',readerPage:1});
 assert.match(last,/data-act="archive-next-story"/);
 const full=renderArchive({...args,readerMode:'full'});
 assert.match(full,/Пошта зникла/);
 assert.match(full,/Аркуші/);
 const empty=renderArchive({...args,visible:[],edition:null,story:null,query:'xyz'});
 assert.match(empty,/Нічого не знайдено/);
 assert.match(empty,/data-act="archive-clear-search"/);
 const noIssues=renderArchive({...args,all:[],visible:[],edition:null,story:null});
 assert.match(noIssues,/ПОЛИЦЯ ПОКИ ПОРОЖНЯ/);
 assert.match(noIssues,/data-act="archive-import"/);
});

test('a full 12-issue shelf cannot lose even its oldest issue during restore',()=>{
 const existing=Array.from({length:MAX_EDITIONS},(_,i)=>issue('kept-'+i,100+i));
 const incoming=toggleEditionFavorite([issue('new-favorite',9999)],'new-favorite');
 const before=normalizeEditions(existing);
 const after=mergeArchiveBackup(existing,incoming);
 assert.equal(after.added,0);
 assert.equal(after.skipped,1);
 assert.deepEqual(after.editions,before);
 const partlyFull=mergeArchiveBackup(existing.slice(0,MAX_EDITIONS-1),[issue('new-1',300),issue('new-2',200)]);
 assert.equal(partlyFull.added,1);
 assert.equal(partlyFull.skipped,1);
 assert.equal(partlyFull.editions.length,MAX_EDITIONS);
 for(const item of existing.slice(0,MAX_EDITIONS-1))assert.ok(partlyFull.editions.some(x=>x.id===item.id));
});
