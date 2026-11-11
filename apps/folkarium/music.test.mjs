import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSong,validSong,regenerate,buildEvents,durationSeconds,renderMidi,degreeToMidi,pitches,SECTIONS} from './music.js';

test('new song builds four editable section patterns for every instrument',()=>{
  const song=makeSong({seed:42});
  assert.equal(validSong(song),true);
  assert.equal(song.tracks.length,6);
  assert.equal(song.tracks[0].patterns.length,4);
  assert.equal(song.tracks[0].patterns[1].length,16);
  assert.ok(durationSeconds(song)>40);
});
test('regeneration changes only requested part and retains valid score',()=>{
  const song=makeSong({seed:84});
  const next=regenerate(song,'vielle',1);
  assert.equal(validSong(next),true);
  assert.deepEqual(next.tracks[1],song.tracks[1]);
  assert.deepEqual(next.tracks[0].patterns[0],song.tracks[0].patterns[0]);
  assert.notDeepEqual(next.tracks[0].patterns[1],song.tracks[0].patterns[1]);
});
test('events are chronological, bounded by song length and obey enabled tracks',()=>{
  const song=makeSong({seed:7});
  const events=buildEvents(song);
  assert.ok(events.length>40);
  assert.ok(events.every((e,i)=>e.at>=0&&e.len>0&&(i===0||e.at>=events[i-1].at)));
  assert.ok(events.every(e=>e.at+e.len<=SECTIONS.reduce((a,s)=>a+s.bars*8,0)));
  song.tracks.forEach(t=>t.on=false);
  assert.deepEqual(buildEvents(song),[]);
});
test('mode is diatonic and MIDI header supports six tracks',async()=>{
  assert.equal(pitches('dorian').length,15);
  assert.equal(degreeToMidi(7,'dorian')-degreeToMidi(0,'dorian'),12);
  const data=new Uint8Array(await renderMidi(makeSong({seed:12})).arrayBuffer());
  assert.equal(String.fromCharCode(...data.slice(0,4)),'MThd');
  assert.equal(data[11],7);
  assert.equal(String.fromCharCode(...data.slice(14,18)),'MTrk');
});
test('stored malformed score rejected',()=>{
  const s=makeSong();
  s.tracks[0].patterns[0][0]={d:99,len:1,v:1};
  assert.equal(validSong(s),false);
});
