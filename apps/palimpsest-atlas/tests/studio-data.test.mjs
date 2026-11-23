import test from 'node:test';
import assert from 'node:assert/strict';
import {stories} from '../stories.js';
import {compareSnapshots,eventLane,timelineClusters,snapshotAt} from '../core.js';
import {createDraft,cloneAsDraft,parseStory,parseImport,exportPackage,
  loadLibrary,persistLibrary,upsertLibrary,LIBRARY_KEY,MAX_PACKAGE_BYTES} from '../studio-data.js';

const memory=()=>{
  const db=new Map();
  return {getItem:key=>db.get(key)||null,setItem:(k,v)=>db.set(k,v),removeItem:key=>db.delete(key)};
};
test('blank draft runs through the exact history renderer schema',()=>{
  const item=createDraft({title:'Мой Лаций',start:-900,end:-700});
  const restored=parseStory(item);
  assert.equal(restored.title,'Мой Лаций');
  assert.equal(snapshotAt(restored,-850).currentEvent.id,item.events[0].id);
  assert.equal(restored.events[0].confidence,'hypothetical');
});
test('built-in histories can become independent editable copies without mutation',()=>{
  for(const original of stories){
    const c=cloneAsDraft(original);
    assert.ok(c.id.startsWith('user-'));
    assert.equal(c.events.length,original.events.length);
    assert.equal(c.entities.length,original.entities.length);
    assert.equal(c.type,'custom');
    assert.deepEqual(parseStory(c).events,c.events);
    assert.notEqual(original.id,c.id);
    assert.ok(c.sources.length);
  }
});
test('full story with regions and route roundtrips and keeps provenance',()=>{
  const story=createDraft({start:1550,end:1600,title:'Торговые пути'});
  story.sources.push({id:'archive',title:'Архивное свидетельство',url:'https://example.org/source'});
  story.events[0].sources=['archive'];
  story.events[0].confidence='confirmed';
  story.events.push({id:'event2',time:1580,title:'Вторая точка',subtitle:'Торговля',text:'Место встречи',
    confidence:'estimated',category:'ЭКОНОМИКА',lane:'politics',importance:4,sources:['archive'],focus:[450,290]});
  story.entities.push({id:'settlement1',name:'Фактория',type:'settlement',x:410,y:220,
    from:1550,confidence:'confirmed',sources:['archive'],current:'Торговый двор',description:'Существовал до 1600'});
  story.features.push({id:'zone1',kind:'region',x:500,y:350,rx:120,ry:90,label:'Зона торговли',
    from:1550,confidence:'estimated'});
  story.paths.push({id:'route1',kind:'track',from:1580,confidence:'estimated',points:[[380,240],[520,380],[690,420]]});
  const exported=exportPackage(story);
  assert.ok(exported.length<MAX_PACKAGE_BYTES);
  const imported=parseImport(exported);
  assert.equal(imported.events.length,2);
  assert.equal(imported.entities.length,1);
  assert.equal(imported.features.length,1);
  assert.equal(imported.paths[0].points.length,3);
  assert.equal(imported.sources[0].url,'https://example.org/source');
  assert.equal(snapshotAt(imported,1551).paths.length,0);
  assert.equal(snapshotAt(imported,1590).paths.length,1);
});
test('local library upsert, reload, replace and delete persist deterministically',()=>{
  const storage=memory();
  const a=createDraft({title:'Story A'}),b=createDraft({title:'Story B'});
  const list=upsertLibrary(upsertLibrary([],a),b);
  const saved=persistLibrary(list,storage);
  assert.equal(saved.length,2);
  assert.ok(storage.getItem(LIBRARY_KEY));
  assert.equal(loadLibrary(storage).length,2);
  a.title='Story A revised';
  const next=upsertLibrary(loadLibrary(storage),a);
  persistLibrary(next,storage);
  assert.equal(loadLibrary(storage).find(s=>s.id===a.id).title,'Story A revised');
  persistLibrary(next.filter(s=>s.id!==b.id),storage);
  assert.equal(loadLibrary(storage).length,1);
});
test('rejects malicious/invalid packages instead of unsafe links or invented certainty',()=>{
  const a=createDraft();
  assert.throws(()=>parseImport('{invalid'),/JSON/);
  assert.throws(()=>parseImport(JSON.stringify({format:'wrong',schemaVersion:1,story:a})),/формат/);
  assert.throws(()=>parseImport(' '.repeat(MAX_PACKAGE_BYTES+1)),/слишком большой/);
  assert.throws(()=>parseStory({...a,events:[{...a.events[0],time:0}]}),/вне исторического периода/);
  assert.throws(()=>parseStory({...a,range:[-100,100]}),/границу эр/);
  assert.throws(()=>parseStory({...a,events:[{...a.events[0],confidence:'confirmed'}]}),/источник/);
  const dangerous={...a,sources:[{id:'bad',title:'evil',url:'javascript:alert(1)'}]};
  assert.throws(()=>parseStory(dangerous),/https/);
  const unsupported={...a,id:'rome'};
  assert.throws(()=>parseStory(unsupported),/пользовательские/);
});
test('unknown events do not create fake entries and removed objects reverse perfectly',()=>{
  const rome=stories[0];
  const forward=compareSnapshots(rome,-950,-600);
  const reverse=compareSnapshots(rome,-600,-950);
  assert.equal(forward.additions,reverse.removals);
  assert.equal(forward.removals,reverse.additions);
  assert.ok(forward.additions>0);
  assert.equal(forward.passedEvents,reverse.passedEvents);
  assert.deepEqual(compareSnapshots(rome,-900,-900).sections.entities.added,[]);
});
test('timeline lane grouping preserves all events including dense battles',()=>{
  const war=stories[1],bins=timelineClusters(war.events,war.range,200,12);
  assert.equal(bins.reduce((sum,b)=>sum+b.events.length,0),war.events.length);
  assert.equal(eventLane(war.events.find(x=>x.category==='БИТВА')),'military');
  assert.equal(eventLane(war.events.find(x=>x.category==='ПОЛИТИКА')),'politics');
  assert.ok(bins.length<=war.events.length);
});
