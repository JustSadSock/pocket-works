import test from 'node:test';
import assert from 'node:assert/strict';
import {Apartment,ITEMS,HOME} from '../apartment.mjs';
import {FRAGMENTS,RADIO_STATIONS,radioBroadcast,chapterJournal,chapterEnding} from '../story.mjs';

test('four family story records are authored and unlock only for physical collectibles',()=>{
 assert.equal(Object.keys(FRAGMENTS).length,4);
 assert.equal(RADIO_STATIONS.length,3);
 const empty=chapterJournal([],0,false);
 assert.equal(empty.entries.length,0);
 assert.match(empty.radio,/приёмник/);
 const partial=chapterJournal(['album','photo'],1,false);
 assert.equal(partial.entries.length,2);
 assert.match(partial.radio,/настроить/);
 const full=chapterJournal(ITEMS.map(x=>x.id),2,true);
 assert.equal(full.entries.length,4);
 assert.match(full.goal,/Осталось открыть/);
 assert.ok(full.entries.every(x=>x.body.length>=80));
});
test('an old radio needs an actual album to understand the familiar broadcast',()=>{
 assert.equal(radioBroadcast(0).station,0);
 assert.equal(radioBroadcast(1).station,1);
 assert.equal(radioBroadcast(2,false).heard,false);
 assert.equal(radioBroadcast(2,true).heard,true);
 assert.match(radioBroadcast(2,true).message,/Из приёмника/);
});
test('radio knob changes the physical world revision and discovered transmission persists',()=>{
 for(let seed=1;seed<=180;seed++){
  const w=new Apartment(seed);const rev=w.terrainRevision;
  assert.equal(w.radio.channel,0);assert.equal(w.radio.heard,false);
  const a=w.tuneRadio(false);assert.equal(a.station,1);assert.equal(a.newMemory,false);
  const b=w.tuneRadio(false);assert.equal(b.station,2);assert.equal(b.newMemory,false);
  w.tuneRadio(true);w.tuneRadio(true);
  const c=w.tuneRadio(true);assert.equal(c.station,2);
  assert.equal(c.heard,true);assert.equal(c.newMemory,true);
  assert.equal(w.tuneRadio(true).newMemory,false);
  assert.ok(w.terrainRevision>rev);
  const restored=new Apartment(seed,w.save());
  assert.deepEqual(restored.radio,w.radio);
  assert.equal(new Apartment(seed,{phases:[0,0,0,0]}).radio.heard,false,'legacy saves have no invented radio revelation');
 }
});
test('the radio is tangible and accessible from a safe side of the Soviet table',()=>{
 const offsets=[[0,1.25],[0,-1.25],[1.45,0],[-1.45,0],[0,1.65],[0,-1.65]];
 for(let seed=1;seed<=400;seed++){
  const w=new Apartment(seed),p=w.radioPosition();
  assert.ok(w.room('living'));
  assert.ok(offsets.some(([dx,dz])=>w.canStand(p.x+dx,p.z+dz)&&w.visible(p.x+dx,p.z+dz,p.x,p.z)),
   'radio unreachable in apartment '+seed)
 }
});
test('finishing the chapter has two meaningful endings with no false good ending',()=>{
 const ids=ITEMS.map(x=>x.id);
 const calm=chapterEnding({won:true,inventory:ids,recognized:2,heard:true,seconds:371.5});
 assert.match(calm.tag,/ТЁПЛОЕ УТРО/);
 assert.match(calm.text,/372 сек/);
 const ordinary=chapterEnding({won:true,inventory:ids,recognized:1,heard:true});
 assert.notEqual(ordinary.title,calm.title);
 assert.match(chapterEnding({won:true,inventory:ids,recognized:3,heard:false}).tag,/ГЛАВА I \/ УТРО/);
 const lost=chapterEnding({won:false,inventory:['album']});
 assert.match(lost.tag,/ПОТЕРЯННЫЙ ВЕЧЕР/);
});
test('remembering room layouts counts unique familiar rooms, not repeated grinding',()=>{
 for(let seed=1;seed<=80;seed++){
  const w=new Apartment(seed);
  for(let t=5;t<40;t+=.5)if(w.tick(HOME.x,HOME.z,0,t)){
   const type=w.lastChange.type;
   assert.ok(w.recognize(type).ok);
   assert.equal(w.recognize(type).ok,false);
  }
  assert.equal(w.recognizedCount(),w.rooms.filter(x=>x.recognizedPhase>0).length);
  assert.ok(w.recognizedCount()<=4);
  assert.equal(new Apartment(seed,w.save()).recognizedCount(),w.recognizedCount());
 }
});
