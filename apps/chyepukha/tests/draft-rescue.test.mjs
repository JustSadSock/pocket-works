import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftStore,worstDraftMode,draftStorageLabel} from '../draft-rescue.js';
import {renderWriting} from '../writing-view.js';
function storage({failRead=false,failWrite=false,failDelete=false}={}){
 const values=new Map();
 return {
  values,
  getItem:k=>{if(failRead)throw Error('blocked');return values.get(k)??null},
  setItem:(k,v)=>{if(failWrite)throw Error('quota');values.set(k,String(v))},
  removeItem:k=>{if(failDelete)throw Error('disabled');values.delete(k)}
 };
}
test('normal durable draft saves to localStorage and survives a fresh instance',()=>{
 const primary=storage(),tab=storage(),store=createDraftStore(primary,tab);
 assert.equal(store.write('draft:a','Власна пригода почалась у театрі'),'local');
 assert.equal(primary.getItem('draft:a'),'Власна пригода почалась у театрі');
 assert.equal(tab.getItem('draft:a'),null);
 assert.equal(createDraftStore(primary,tab).read('draft:a'),'Власна пригода почалась у театрі');
 assert.equal(store.mode('draft:a'),'local');
});
test('quota falls back to tab storage and survives reloading the app',()=>{
 const primary=storage({failWrite:true}),tab=storage();
 const store=createDraftStore(primary,tab);
 assert.equal(store.write('draft:x','Зберегти рукопис навіть при переповненні'),'tab');
 assert.equal(store.write('draft:x:editor',JSON.stringify({step:'select',selection:[0,1,3]})),'tab');
 const reopened=createDraftStore(primary,tab);
 assert.equal(reopened.mode('draft:x'),'tab');
 assert.equal(reopened.read('draft:x'),'Зберегти рукопис навіть при переповненні');
 assert.deepEqual(JSON.parse(reopened.read('draft:x:editor')).selection,[0,1,3]);
});
test('total storage failure still keeps live manuscript in memory and reports honest loss risk',()=>{
 const primary=storage({failRead:true,failWrite:true,failDelete:true});
 const tab=storage({failRead:true,failWrite:true,failDelete:true});
 const store=createDraftStore(primary,tab);
 assert.equal(store.write('draft:y','Чернетка залишається на сторінці'),'memory');
 assert.equal(store.read('draft:y'),'Чернетка залишається на сторінці');
 assert.equal(store.mode('draft:y'),'memory');
 assert.equal(createDraftStore(primary,tab).read('draft:y'),null);
 assert.match(draftStorageLabel('memory'),/скопіюй/);
});
test('return of localStorage clears obsolete tab data, including after another edit',()=>{
 const primary=storage(),tab=storage();
 const store=createDraftStore(primary,tab);
 tab.setItem('draft:z','стара версія');
 assert.equal(store.read('draft:z'),'стара версія');
 assert.equal(store.write('draft:z','нова версія'),'local');
 assert.equal(tab.getItem('draft:z'),null);
 assert.equal(createDraftStore(primary,tab).read('draft:z'),'нова версія');
 assert.equal(worstDraftMode('local','tab'),'tab');
 assert.equal(worstDraftMode('tab','memory'),'memory');
 store.remove('draft:z');
 assert.equal(primary.getItem('draft:z'),null);
 assert.equal(tab.getItem('draft:z'),null);
});
test('the editor exposes a real copy rescue action only when persistence is degraded',()=>{
 const view={phase:'writing',round:0,total:2,settings:{visibleTailWords:3},
  sheet:{id:'sheet-0',question:{prompt:'Хто герой?'},tail:'',genreLabel:'Комедія',setLabel:'Сюжет'}};
 const props={view,roomVersion:'v5',draft:'Драматичний банан загубив усі свої документи',
  meta:{step:'draft',anchor:'',gender:'unspecified'},chosen:[],escape:s=>String(s??''),
  rosterCompact:()=>'',turnProgress:()=>'',genres:{},genders:[]};
 const durable=renderWriting({...props,draftMode:'local'});
 assert.match(durable,/id="draftStorageNotice"[^>]*hidden/);
 const tab=renderWriting({...props,draftMode:'tab'});
 assert.match(tab,/тільки в цій вкладці/);
 assert.match(tab,/data-act="copy-draft"/);
 const volatile=renderWriting({...props,draftMode:'memory'});
 assert.match(volatile,/перед виходом або перезавантаженням/);
 assert.doesNotMatch(volatile,/id="draftStorageNotice"[^>]*hidden/);
});

test('receipt outbox uses tab persistence if local quota is full and clears both copies',()=>{
 const primary=storage({failWrite:true}),tab=storage(),key='pocket-works:chyepukha:submit:seat:room';
 const payload=JSON.stringify({requestId:'1234-5678-9abc',sheetId:'sheet-0',answer:'Не губити відповідь'});
 const store=createDraftStore(primary,tab);
 assert.equal(store.write(key,payload),'tab');
 assert.equal(createDraftStore(primary,tab).read(key),payload);
 const reopened=createDraftStore(primary,tab);
 reopened.remove(key);
 assert.equal(reopened.read(key),null);
 assert.equal(tab.getItem(key),null);
});
