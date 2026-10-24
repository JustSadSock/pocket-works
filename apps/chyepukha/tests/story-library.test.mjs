import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_EDITIONS,storyText,normalizeEditions,addFinishedEdition,planFinishedEdition,removeEdition,readEditions,writeEditions} from '../story-library.js';
const sample=(revision=41)=>({phase:'finished',revision,players:[{id:'a'},{id:'b'}],stories:[{
 id:'sheet-0',starter:'Марта',setLabel:'Пригода',genre:'Абсурдна комедія',
 fragments:[{question:'Хто?',author:'Марта',answer:'Кіт купив грозову хмару.'},{question:'Навіщо?',author:'Олеся',answer:'Щоб полити кактус.'}]
}]});
test('a finished game is archived once, restores authors and text and supports deletion',()=>{
 const state=sample();const first=addFinishedEdition([], 'abcdef12',state,1000);
 assert.equal(first.length,1);assert.equal(first[0].id,'abcdef12:41');
 assert.equal(storyText(first[0].stories[0]),'Кіт купив грозову хмару.\n\nЩоб полити кактус.');
 assert.equal(first[0].stories[0].fragments[1].author,'Олеся');
 assert.deepEqual(addFinishedEdition(first,'abcdef12',state,5000),first);
 assert.deepEqual(removeEdition(first,'abcdef12:41'),[]);
});
test('full library does not evict archived manuscripts when more games finish',()=>{
 let records=[];
 for(let i=0;i<MAX_EDITIONS+5;i++)records=addFinishedEdition(records,'abcdef12',sample(i),i*100);
 assert.equal(records.length,MAX_EDITIONS);
 assert.equal(records[0].id,'abcdef12:11');
 assert.equal(records.at(-1).id,'abcdef12:0');
 const full=planFinishedEdition(records,'abcdef12',sample(17),1700);
 assert.equal(full.status,'full');
 assert.deepEqual(full.editions,records);
});
test('untrusted or malformed local data cannot become executable markup or runaway storage',()=>{
 const records=normalizeEditions([{id:'bad',stories:[]},null,{id:'ok',savedAt:42,stories:[{
  id:'x',starter:'<img src=x onerror=alert(1)>',fragments:[{answer:'a'.repeat(9000),author:'<script>x</script>'}]
 }]}]);
 assert.equal(records.length,1);
 assert.equal(records[0].stories[0].fragments[0].answer.length,800);
 assert.equal(records[0].stories[0].starter,'<img src=x onerror=alert(1)>');
});
test('archive data is account-key isolated, survives reload and handles corrupt storage',()=>{
 const map=new Map();
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const one=addFinishedEdition([],'a1',sample(),3000);
 assert.equal(writeEditions(storage,'account:a',one),true);
 assert.equal(readEditions(storage,'account:a').length,1);
 assert.equal(readEditions(storage,'account:b').length,0);
 map.set('account:b','garbage');assert.deepEqual(readEditions(storage,'account:b'),[]);
});
test('quota failure keeps every existing manuscript intact and reports failure',()=>{
 const data=Array.from({length:6},(_,i)=>addFinishedEdition([],String(i),sample(i),i*100)[0]).reverse();
 const prior=JSON.stringify(data.slice(0,2));
 const map=new Map([['test',prior]]);
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>{if(v.length>1600)throw new Error('quota');map.set(k,v)}};
 assert.equal(writeEditions(storage,'test',data),false);
 assert.equal(map.get('test'),prior);
 assert.deepEqual(readEditions(storage,'test'),normalizeEditions(data.slice(0,2)));
});
test('duplicate IDs after truncation are rejected rather than creating ambiguous editions',()=>{
 const same='i'.repeat(160);
 const two=[{...sample().stories[0],id:'x'}];
 const raw=[{id:same+'-one',savedAt:1,stories:two},{id:same+'-two',savedAt:2,stories:two}];
 const normalized=normalizeEditions(raw);
 assert.equal(normalized.length,1);
 assert.equal(normalized[0].id,same);
});
test('a saved issue is not written again when its revision changes after reactions',()=>{
 const once=addFinishedEdition([],'room',sample(2),100);
 const another={...sample(3),issue:0};
 assert.equal(planFinishedEdition(once,'room',another).status,'ready');
 const v9={...sample(12),issue:7};
 const original=addFinishedEdition([],'room',v9,100);
 assert.equal(planFinishedEdition(original,'room',{...v9,revision:99}).status,'already-saved');
});

test('a v5 finished issue is saved only once even after the players leave and revision changes',()=>{
 const stories=[{id:'sheet-0',starter:'Автор',setLabel:'Історія',genre:'Комедія',fragments:[{question:'Хто?',author:'Автор',answer:'Дуже дивна історія нарешті завершилась'}]}];
 const first={phase:'finished',issue:1,revision:46,players:[{id:'a'},{id:'b'}],stories};
 const changed={...first,revision:49};
 const different={...first,issue:2,revision:53};
 const once=addFinishedEdition([], 'room-v5',first,1000);
 const twice=addFinishedEdition(once,'room-v5',changed,2000);
 assert.equal(twice.length,1);
 assert.equal(twice[0].savedAt,1000);
 assert.equal(addFinishedEdition(twice,'room-v5',different,3000).length,2);
});
