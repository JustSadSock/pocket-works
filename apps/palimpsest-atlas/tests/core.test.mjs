import test from 'node:test';
import assert from 'node:assert/strict';
import {stories} from '../stories.js';
import {clamp,formatYear,displayYear,era,fraction,
  snapshotAt,previousEvent,nextEvent,eventBefore,
  playbackStep,zoomWindow,panWindow,smartTicks,validateStory} from '../core.js';

test('both unrelated historical scenarios are valid and independently loaded',()=>{
  assert.equal(stories.length,2);
  for(const s of stories)assert.deepEqual(validateStory(s),[],s.id);
  assert.notEqual(stories[0].type,stories[1].type);
});

test('BCE years keep correct labels and have no year zero',()=>{
  assert.equal(formatYear(-753),'753 до н. э.');
  assert.equal(displayYear(-509),'509');
  assert.equal(era(-1),'ДО Н. Э.');
  assert.equal(formatYear(1631),'1631 г.');
  assert.equal(formatYear(0),'граница эр');
  assert.equal(smartTicks([-5,5],8).includes(0),false);
});

test('scene snapshots are deterministic and reversible',()=>{
  const story=stories[0];
  const first=snapshotAt(story,-850);
  const future=snapshotAt(story,-520);
  const rewind=snapshotAt(story,-850);
  assert.deepEqual(first,rewind);
  assert.equal(first.entities.some(e=>e.id==='forum'),false);
  assert.equal(future.entities.some(e=>e.id==='forum'),true);
  assert.equal(first.entities.some(e=>e.id==='romulus'),false);
  assert.equal(future.entities.some(e=>e.id==='romulus'),true);
});

test('events support backwards and forwards navigation',()=>{
  const s=stories[0];
  assert.equal(eventBefore(s,-750).id,'romulus');
  assert.equal(previousEvent(s,-750).id,'romulus');
  assert.equal(nextEvent(s,-750).id,'hill-links');
  assert.equal(previousEvent(s,s.range[0]).id,s.events[0].id);
  assert.equal(nextEvent(s,s.range[1]),null);
});

test('time zoom stays in bounds and respects the focal time',()=>{
  const full=[-1000,-500];
  const win=zoomWindow(full,full,-753,.2);
  assert.ok(win[0]<=-753&&win[1]>=-753);
  assert.equal(Math.round(win[1]-win[0]),100);
  assert.deepEqual(zoomWindow(full,full,-753,100),full);
  const shifted=panWindow(full,win,2000);
  assert.equal(shifted[1],-500);
  assert.ok(shifted[0]>=-1000);
});

test('playback slows around dense important events',()=>{
  const s=stories[1];
  const quiet=playbackStep(s,1627,s.range,1);
  const busy=playbackStep(s,1631.71,s.range,1);
  assert.ok(busy<quiet);
  assert.ok(playbackStep(s,1631,s.range,-1)===0);
});

test('snapshots are stable at both endpoints',()=>{
  for(const s of stories){
    const start=snapshotAt(s,s.range[0]);
    const end=snapshotAt(s,s.range[1]);
    assert.equal(start.time,s.range[0]);
    assert.equal(end.time,s.range[1]);
    assert.equal(end.currentEvent.id,s.events.at(-1).id);
    assert.ok(end.features.length>=start.features.length);
  }
});

test('all source references are resolvable and valid HTTPS urls',()=>{
  for(const s of stories){
    const sources=new Map(s.sources.map(x=>[x.id,x]));
    for(const e of [...s.entities,...s.events]){
      for(const id of e.sources||[]){
        assert.ok(sources.has(id),id);
        assert.match(sources.get(id).url,/^https:\/\//);
      }
    }
  }
});

test('bad stories cannot be loaded silently',()=>{
  const invalid={...stories[0], events:[{id:'bad',time:0,sources:['missing']}]};
  assert.ok(validateStory(invalid).length>=2);
});
