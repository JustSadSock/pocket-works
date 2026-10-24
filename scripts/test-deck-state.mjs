import assert from 'node:assert/strict';
import { defaultDeckState, cleanDeckState, createDeckStateStore, DECK_WIDGET_KINDS } from '../shared/deck-state.js';

const baseline=defaultDeckState();
assert.equal(baseline.view,'home');
assert.equal(baseline.widgets.length,3);
assert.equal(baseline.density,'compact');
assert.equal(DECK_WIDGET_KINDS.length,7);

const malicious=cleanDeckState({
  view:'invalid', density:'wrong',
  widgets:[{id:'continue',kind:'saved',size:'huge'},{id:'continue',kind:'saved'},{id:'bad id!',kind:'random'},{id:'author',kind:'spoofed'}],
  archived:['my-game','my-game','../../evil','other-game'],
  projectStages:{'my-game':'building','../../etc':'archive','other-game':'unsupported'},
  projectNotes:{'my-game':'Keep this sentence','../bad':'Unsafe'},
  order:['my-game','my-game','../bad']
});
assert.equal(malicious.view,'home');
assert.equal(malicious.widgets.length,1);
assert.equal(malicious.widgets[0].size,'wide');
assert.deepEqual(malicious.archived,['my-game','other-game']);
assert.equal(malicious.projectStages['my-game'],'building');
assert.equal(malicious.projectStages['other-game'],undefined);
assert.equal(malicious.projectNotes['../bad'],undefined);
assert.deepEqual(malicious.order,['my-game']);

const values=new Map();
const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
const one=createDeckStateStore({storage,database:null});
assert.equal(one.get().view,'home');
const state=one.get();
state.view='archive';
state.widgets=[{id:'continue',kind:'continue',size:'large',tag:'',slug:''},{id:'mine',kind:'collection',size:'half',tag:'medieval',slug:''}];
state.archived=['bad-prototype'];
state.projectStages['good-game']='building';
state.projectNotes['good-game']='Improve wing animation and the camera follow spring';
await one.save(state);
assert.equal(one.get().widgets.length,2);
const two=createDeckStateStore({storage,database:null});
assert.equal(two.get().view,'archive');
assert.deepEqual(two.get().archived,['bad-prototype']);
assert.equal(two.get().projectNotes['good-game'],'Improve wing animation and the camera follow spring');
const backup=two.exportBackup();
assert.equal(backup.schema,'pocket-works-deck-v1');
const three=createDeckStateStore({storage:{getItem:()=>null,setItem:()=>{}},database:null});
await three.importBackup(backup);
assert.equal(three.get().widgets[1].tag,'medieval');
assert.throws(()=>three.importBackup({schema:'wrong',data:{}}),/Not a PocketWorks layout backup/);

const fromOtherTab={...backup,savedAt:Date.now()+15000,data:{...backup.data,view:'library'}};
assert.equal(two.onStorage(fromOtherTab),true);
assert.equal(two.get().view,'library');
assert.equal(two.onStorage(fromOtherTab),false);
await two.flush();

const blocked=createDeckStateStore({storage:{getItem:()=>null,setItem(){throw Error('quota')}},database:null});
await blocked.update({view:'library'});
assert.equal(blocked.get().view,'library');
assert.match(blocked.getWarning(),/storage unavailable/i);
// Personal archives and project notes belong to one authenticated account.
const alice='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
await two.setAccount(alice);
assert.deepEqual(two.get().archived,[],'unknown guest archive must not leak to Pocket ID');
await two.update({archived:['alice-hidden'],projectNotes:{'alice-game':'Alice only'}});
assert.equal(two.getStorageKey(),'pocket-works:deck:v1:account:'+alice);
await two.setAccount(bob);
assert.deepEqual(two.get().archived,[]);
assert.equal(two.get().projectNotes['alice-game'],undefined);
await two.update({archived:['bob-hidden']});
await two.setAccount(alice);
assert.deepEqual(two.get().archived,['alice-hidden']);
assert.equal(two.get().projectNotes['alice-game'],'Alice only');
await two.setAccount(bob);
assert.deepEqual(two.get().archived,['bob-hidden']);
await two.setAccount(null);
assert.deepEqual(two.get().archived,['bad-prototype'],'guest archive restored after logout');
await assert.rejects(()=>two.setAccount('invalid'),TypeError);
console.log('Pocket Deck persistence, widget layout, archival state, import/export, tab sync, quota fallback and account isolation passed.');
