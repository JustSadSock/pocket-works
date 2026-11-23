import test from 'node:test';
import assert from 'node:assert/strict';
import {stories} from '../stories.js';
import {snapshotAt,compareSnapshots,validateStory} from '../core.js';
import {borderAt,boundaryChanged,storyTracks,validateBoundaryFrames,MAX_BORDER_FRAMES} from '../frontiers.js';
import {createPhaseDraft,parseStory,exportPackage,parseImport} from '../studio-data.js';

const battle=stories.find(x=>x.id==='breitenfeld');
const polygonA=[[200,200],[390,200],[385,380],[200,380]];
const polygonB=[[225,210],[410,215],[405,375],[220,380]];
function draft(){
  const story=createPhaseDraft();
  story.features.push({id:'border-one',kind:'boundary',label:'Рубеж долины',
    x:295,y:290,rx:95,ry:90,from:1,until:5,confidence:'hypothetical',sources:[],
    points:polygonA.map(p=>[...p]),boundaryFrames:[
      {time:3,points:polygonB.map(p=>[...p]),confidence:'estimated',sources:[]}
    ]});
  return story;
}

test('border geometry is a documented step function, never an invented morph',()=>{
  const item=draft().features[0];
  assert.deepEqual(borderAt(item,1).points,polygonA);
  assert.deepEqual(borderAt(item,2.99).points,polygonA);
  assert.deepEqual(borderAt(item,3).points,polygonB);
  assert.deepEqual(borderAt(item,4.5).points,polygonB);
  assert.equal(borderAt(item,2.99).activeBorderTime,null);
  assert.equal(borderAt(item,4).activeBorderTime,3);
  assert.equal(borderAt(item,4).confidence,'estimated');
  assert.deepEqual(item.points,polygonA); // immutable replay
});
test('reversible atlas snapshots count reshaped borders without fabricating births',()=>{
  const story=draft();
  const start=snapshotAt(story,1),end=snapshotAt(story,4);
  assert.deepEqual(start.features[0].points,polygonA);
  assert.deepEqual(end.features[0].points,polygonB);
  const forward=compareSnapshots(story,1,4),backward=compareSnapshots(story,4,1);
  assert.equal(forward.reshapes,1);
  assert.equal(backward.reshapes,1);
  assert.equal(forward.additions,0);
  assert.equal(forward.removals,0);
  assert.equal(forward.movements,0);
  assert.equal(compareSnapshots(story,3,4).reshapes,0);
  assert.equal(boundaryChanged(start.features[0],end.features[0]),true);
  assert.equal(boundaryChanged(end.features[0],end.features[0]),false);
  assert.deepEqual(snapshotAt(story,1).features[0].points,polygonA);
});
test('Breitenfeld phases III and IV expose an explicitly hypothetical frontier change',()=>{
  assert.deepEqual(validateStory(battle),[]);
  const at3=snapshotAt(battle,3).features.find(f=>f.id==='line-of-contact');
  const at4=snapshotAt(battle,4).features.find(f=>f.id==='line-of-contact');
  assert.ok(at3&&at4);
  assert.notDeepEqual(at3.points,at4.points);
  assert.equal(at4.confidence,'hypothetical');
  assert.equal(compareSnapshots(battle,3,4).reshapes,1);
});
test('dated border shapes retain independent provenance across JSON transfer',()=>{
  const story=draft();
  story.sources.push({id:'archive',title:'Archive catalogue',url:'https://example.org/catalogue'});
  story.features[0].boundaryFrames.push({
    time:5,points:[[230,230],[420,230],[410,410],[230,400]],
    confidence:'confirmed',sources:['archive']
  });
  const parsed=parseImport(exportPackage(story));
  assert.equal(parsed.features[0].boundaryFrames.length,2);
  assert.deepEqual(snapshotAt(parsed,2).features[0].points,polygonA);
  assert.deepEqual(snapshotAt(parsed,3).features[0].points,polygonB);
  assert.equal(snapshotAt(parsed,5).features[0].confidence,'confirmed');
  assert.deepEqual(snapshotAt(parsed,5).features[0].sources,['archive']);
  assert.equal(compareSnapshots(parsed,3,5).reshapes,1);
});
test('rejects impossible dated shapes, duplications, unsourced certainty and excess frames',()=>{
  const sourceIds=new Set();
  let item=draft().features[0];
  assert.deepEqual(validateBoundaryFrames(item,[1,5],{width:1000,height:700},sourceIds),[]);
  let wrong={...item,boundaryFrames:[{...item.boundaryFrames[0],time:0}]};
  assert.ok(validateBoundaryFrames(wrong,[1,5],{width:1000,height:700},sourceIds).length);
  wrong={...item,boundaryFrames:[item.boundaryFrames[0],item.boundaryFrames[0]]};
  assert.ok(validateBoundaryFrames(wrong,[1,5],{width:1000,height:700},sourceIds).length);
  wrong={...item,boundaryFrames:[{...item.boundaryFrames[0],confidence:'confirmed'}]};
  assert.throws(()=>parseStory({...draft(),features:[wrong]}),/источник/);
  wrong={...item,boundaryFrames:[{...item.boundaryFrames[0],points:[[100,100],[350,350],[100,350],[350,100]]}]};
  assert.throws(()=>parseStory({...draft(),features:[wrong]}),/Ключевая граница/);
  wrong={...item,boundaryFrames:Array.from({length:MAX_BORDER_FRAMES+1},(_,i)=>({
    time:1+i/10,points:polygonA,confidence:'hypothetical',sources:[]}))};
  assert.throws(()=>parseStory({...draft(),features:[wrong]}),/ключевые границы|слишком много/i);
});
test('all four author tracks are navigable chronological records of real entities',()=>{
  const story=draft();
  story.commands.push({id:'staff',name:'Штаб армии',side:'allied',commander:'',sources:[]});
  story.entities.push({id:'army-one',type:'army',name:'Кавалерия',x:100,y:100,from:1,confidence:'hypothetical',
    commandId:'staff',sources:[],current:'',description:'',
    motion:{mode:'hold',confidence:'hypothetical',frames:[{time:1,x:100,y:100},{time:4,x:300,y:100}]},
    orders:[{time:2,action:'hold',note:'',confidence:'hypothetical',sources:[]} ]});
  const lanes=storyTracks(story);
  assert.deepEqual(lanes.map(x=>x.id),['events','motion','frontiers','orders']);
  assert.equal(lanes[0].marks.length,5);
  assert.equal(lanes[1].marks.length,2);
  assert.equal(lanes[2].marks.length,2); // initial + changed
  assert.equal(lanes[3].marks.length,1);
  assert.deepEqual(lanes[2].marks.map(x=>x.time),[1,3]);
  assert.equal(lanes[2].marks[1].borderTime,3);
  assert.deepEqual(validateStory(parseStory(story)),[]);
});
test('legacy stories without temporal borders keep existing exact geometry',()=>{
  const phase=createPhaseDraft();
  const parsed=parseStory(phase);
  assert.equal(parsed.features.length,0);
  const copied=structuredClone(battle);
  for(const feature of copied.features)delete feature.boundaryFrames;
  assert.deepEqual(validateStory(copied),[]);
  assert.equal(compareSnapshots(copied,3,4).reshapes,0);
});
