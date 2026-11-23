import test from 'node:test';
import assert from 'node:assert/strict';
import {stories} from '../stories.js';
import {snapshotAt,compareSnapshots,validateStory} from '../core.js';
import {keyframeValue,locateAt,motionTrail,formatStoryTime,displayStoryTime,
  scenePortalCandidate,validateMotion} from '../motion.js';
import {createDraft,parseStory,cloneAsDraft,exportPackage,parseImport} from '../studio-data.js';

const war=stories.find(x=>x.id==='war');
const battle=stories.find(x=>x.id==='breitenfeld');

test('Breitenfeld is five ordinal phases with documented anchors, never fake hours',()=>{
  assert.equal(stories.length,3);
  assert.deepEqual(validateStory(battle),[]);
  assert.equal(battle.timeUnit,'phase');
  assert.deepEqual(battle.events.map(x=>x.time),[1,2,3,4,5]);
  assert.equal(displayStoryTime(3.2,battle),'3');
  assert.equal(formatStoryTime(3,battle),'ФАЗА III');
  assert.ok(battle.events.every(x=>x.sources.length>0));
  assert.ok(battle.entities.filter(x=>x.motion?.frames).length>=5);
});

test('semantic camera portal only opens near relevant event and battlefield',()=>{
  const anchor={x:475,y:376};
  const link=scenePortalCandidate(war,1631.71,anchor,3);
  assert.equal(link.targetId,'breitenfeld');
  assert.equal(scenePortalCandidate(war,1631.71,anchor,1),null);
  assert.equal(scenePortalCandidate(war,1630,anchor,7),null);
  assert.equal(scenePortalCandidate(war,1631.71,{x:100,y:100},7),null);
});

test('time-position movement is deterministic, reversible and distinct from known frames',()=>{
  const pappenheim=battle.entities.find(x=>x.id==='pappenheim');
  const first=keyframeValue(pappenheim,1);
  const middle=keyframeValue(pappenheim,1.5);
  assert.equal(first.interpolated,false);
  assert.equal(middle.interpolated,true);
  assert.equal(middle.x,(first.x+keyframeValue(pappenheim,2).x)/2);
  assert.equal(middle.y,(first.y+keyframeValue(pappenheim,2).y)/2);
  const rewind=snapshotAt(battle,1).entities.find(x=>x.id==='pappenheim');
  snapshotAt(battle,4);
  assert.deepEqual(snapshotAt(battle,1).entities.find(x=>x.id==='pappenheim'),rewind);
  assert.ok(motionTrail(pappenheim,2.5).length>=2);
});

test('step mode never invents a connecting march',()=>{
  const unit={x:5,y:5,motion:{mode:'hold',confidence:'hypothetical',
    frames:[{time:1,x:5,y:5},{time:3,x:45,y:50}]}};
  assert.deepEqual([keyframeValue(unit,2).x,keyframeValue(unit,2).y],[5,5]);
  assert.deepEqual([keyframeValue(unit,3).x,keyframeValue(unit,3).y],[45,50]);
  assert.equal(keyframeValue(unit,2).interpolated,false);
});

test('date comparison includes moved objects without falsely counting them as created',()=>{
  const forward=compareSnapshots(battle,1,4);
  const backward=compareSnapshots(battle,4,1);
  assert.ok(forward.movements>=5);
  assert.equal(forward.movements,backward.movements);
  assert.equal(forward.sections.entities.added.length,0);
  assert.equal(forward.sections.entities.removed.length,0);
  assert.ok(forward.sections.entities.moved.some(x=>x.before.id==='pappenheim'));
});

test('user story movement survives validation, storage serialization and import',()=>{
  const draft=createDraft({title:'Заселение долины',start:1100,end:1200});
  draft.entities.push({id:'ent1',name:'Передвижной лагерь',type:'army',x:100,y:200,
    from:1100,confidence:'hypothetical',sources:[],description:'Авторская схема',current:'Лагерь',
    motion:{mode:'illustrative',confidence:'hypothetical',
      frames:[{time:1100,x:100,y:200},{time:1150,x:450,y:300},{time:1200,x:850,y:320}]}});
  const serialized=exportPackage(draft);
  const imported=parseImport(serialized);
  assert.deepEqual(imported.entities[0].motion,draft.entities[0].motion);
  assert.ok(snapshotAt(imported,1175).entities[0].x>450);
  assert.equal(snapshotAt(imported,1100).entities[0].x,100);
});

test('import refuses unverifiable trajectories and forged precision',()=>{
  const draft=createDraft({title:'Проверка траектории',start:1700,end:1800});
  draft.entities.push({id:'e1',name:'Отряд автора',type:'army',x:100,y:100,from:1700,
    confidence:'hypothetical',sources:[],description:'',current:'',
    motion:{mode:'illustrative',confidence:'confirmed',frames:[{time:1750,x:99999,y:1}]}});
  assert.throws(()=>parseStory(draft),/маршрут|неточност|движен/i);
  draft.entities[0].motion.confidence='hypothetical';
  assert.throws(()=>parseStory(draft),/кадр|координат|движен/i);
  draft.entities[0].motion.frames=[{time:1750,x:200,y:200},{time:1750,x:210,y:220}];
  assert.throws(()=>parseStory(draft),/кадр|отсортированы|движен/i);
});

test('battle can be copied into editable phase-based story',()=>{
  const copy=cloneAsDraft(battle);
  assert.equal(copy.timeUnit,'phase');
  assert.equal(copy.entities.length,battle.entities.length);
  assert.equal(copy.events.length,5);
  assert.deepEqual(validateStory(copy),[]);
});
