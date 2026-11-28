import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareModulatedNote} from './recorded-modulated.mjs';
import {renderRecordedEnsemble} from './recorded-ensemble.mjs';
import {renderEnsembleRoom} from './ensemble-room.mjs';
test('tremolo pitch uses independent energetic windows and rejects wrong labels',()=>{
 const a=new Float32Array(144000);
 for(let i=480;i<a.length;i++){const t=(i-480)/48000,p=2*Math.PI*440*t;a[i]=.24*(.18+.82*Math.sin(Math.PI*7*t)**2)*(Math.sin(p)+.17*Math.sin(2*p));}
 const z=prepareModulatedNote(a,69);
 assert.ok(Math.abs(z.measuredMidi-69)<.12);assert.ok(z.pitchWindows>=5);assert.ok(z.pitchConsensus>=.7);
 assert.throws(()=>prepareModulatedNote(a,57),/disagrees/);
 assert.throws(()=>prepareModulatedNote(new Float32Array(144000),69),/Silent/);
});
function zones(){
 return [69,72].map((midi,i)=>{
  const samples=new Float32Array(96000),hz=440*2**((midi-69)/12);
  for(let j=0;j<samples.length;j++)samples[j]=.2*Math.sin(2*Math.PI*hz*j/48000)*Math.min(1,j/1200);
  return {id:'fixture-'+i,sourceSha256:(i+1).toString(16).padStart(64,'0'),instrument:'fixture',articulation:'arco',expectedMidi:midi,measuredMidi:midi,velocity:.6,variant:1,samples,rms:.14,peak:.2};
 });
}
test('independent overlapping tracks reconstruct the stereo mix and preserve identities',()=>{
 const a=zones(),notes=midi=>[{midi,start:0,duration:.8,articulation:'arco',pressure:.7}];
 const tracks=[{id:'a',instrument:'fixture',group:'strings',pan:-.8,gain:.5,notes:notes(69)},{id:'b',instrument:'fixture',group:'woodwind',pan:.8,gain:.5,notes:notes(72)}];
 const opts={zones:a,tracks,seconds:1},r=renderRecordedEnsemble(opts);
 assert.equal(r.frames,48000);assert.equal(r.mix.length,96000);
 assert.ok(r.mix.every((x,i)=>Number.isFinite(x)&&Math.abs(x)<=.751&&Math.abs(x-r.stems.strings[i]-r.stems.woodwind[i])<1e-7));
 assert.equal(r.choices.a[0].midi,69);assert.equal(r.choices.b[0].midi,72);
 assert.deepEqual(r.mix,renderRecordedEnsemble(opts).mix);
 assert.throws(()=>renderRecordedEnsemble({...opts,tracks:[tracks[0],tracks[0]]}),/Invalid ensemble track/);
 assert.throws(()=>renderRecordedEnsemble({...opts,tracks:[{...tracks[0],pan:2}]}),/Invalid ensemble track/);
});

test('opt-in individual stems preserve the approved dry mix and reconstruct shared groups',()=>{
 const a=zones(),notes=midi=>[{midi,start:0,duration:.8,articulation:'arco',pressure:.7}];
 const tracks=[{id:'a',instrument:'fixture',group:'strings',pan:-.8,gain:.5,notes:notes(69)},{id:'b',instrument:'fixture',group:'strings',pan:.8,gain:.5,notes:notes(72)},{id:'c',instrument:'fixture',group:'woodwind',pan:0,gain:.3,notes:notes(69)}];
 const opts={zones:a,tracks,seconds:1},dry=renderRecordedEnsemble(opts),r=renderRecordedEnsemble({...opts,includeTrackStems:true});
 assert.equal(dry.trackStems,undefined);assert.deepEqual(r.mix,dry.mix);assert.deepEqual(r.stems,dry.stems);assert.equal(r.master,dry.master);
 assert.deepEqual(Object.keys(r.trackStems),['a','b','c']);
 for(let i=0;i<r.mix.length;i++){
  const {a,b,c}=r.trackStems;
  assert.ok(Math.abs(a[i]+b[i]-r.stems.strings[i])<1e-6);
  assert.ok(Math.abs(c[i]-r.stems.woodwind[i])<1e-7); // signed zero is numerically identical
  assert.ok(Math.abs(a[i]+b[i]+c[i]-r.mix[i])<1e-6);
 }
 assert.throws(()=>renderRecordedEnsemble({...opts,includeTrackStems:1}),/Invalid recorded ensemble/);
});

test('six recorded musicians retain independent stage positions in both room presets',()=>{
 const ids=['bass','melody','counterline','highline','harmony','signal'];
 const stage={
  bass:{x:-3.6,y:8.2,z:1.2,gain:1,width:.68},
  melody:{x:-2.2,y:5.5,z:1.3,gain:1,width:.68},
  counterline:{x:-.6,y:8.1,z:1.5,gain:1,width:.42},
  highline:{x:2.5,y:7,z:1.6,gain:1,width:.46},
  harmony:{x:-2,y:11.8,z:1.6,gain:1,width:.64},
  signal:{x:2,y:12.4,z:1.6,gain:1,width:.58}
 };
 const stems=Object.fromEntries(ids.map((id,k)=>{
  const a=new Float32Array(96000),f=180+k*73;
  for(let i=0;i<48000;i++){const x=.08*Math.sin(2*Math.PI*f*i/48000);a[i*2]=x;a[i*2+1]=x*.82;}
  return [id,a];
 }));
 for(const preset of ['chamber','hall']){
  const r=renderEnsembleRoom({stems,stage,preset,tailSeconds:.5});
  assert.deepEqual(Object.keys(r.layout).sort(),ids.slice().sort());
  assert.ok(r.wetRms>0);assert.equal(r.frames,72000);
  assert.notEqual(r.layout.bass.pan,r.layout.signal.pan);
  assert.ok(r.mix.every(Number.isFinite));
 }
});


test('one shared phrase gesture coordinates bow and breath reattacks across musicians',()=>{
 const base=zones();
 const violin=base.map((z,i)=>({...z,id:'violin-'+i,sourceSha256:(i+11).toString(16).padStart(64,'0'),instrument:'violin',articulation:'arco'}));
 const flute=base.map((z,i)=>({...z,id:'flute-'+i,sourceSha256:(i+21).toString(16).padStart(64,'0'),instrument:'flute',articulation:'non-vibrato'}));
 const line=(articulation,reattack)=>[
  {midi:69,start:0,duration:.6,articulation,pressure:.7,phraseId:'shared-line'},
  {midi:69,start:.6,duration:.6,articulation,pressure:.7,connected:true,phraseId:'shared-line',reattack:{kind:reattack,strength:.3,durationSeconds:.08}},
  {midi:72,start:1.2,duration:.6,articulation,pressure:.7,connected:true,phraseId:'shared-line'}
 ];
 const gestures=[{id:'shared-line',start:0,end:1.8,curve:[{at:0,value:.82},{at:.45,value:1.18},{at:1,value:.76}]}];
 const tracks=[
  {id:'strings',instrument:'violin',group:'strings',pan:-.35,gain:.4,phrasingTechnique:'bowed',notes:line('arco','bow-change')},
  {id:'winds',instrument:'flute',group:'woodwind',pan:.35,gain:.4,phrasingTechnique:'breath',notes:line('non-vibrato','breath')}
 ];
 const opts={zones:[...violin,...flute],tracks,seconds:2,includeTrackStems:true};
 const expressive=renderRecordedEnsemble({...opts,gestures});
 const dry=renderRecordedEnsemble({...opts,tracks:tracks.map(t=>({...t,phrasingTechnique:undefined,notes:t.notes.map(({phraseId,reattack,...n})=>n)}))});
 assert.notDeepEqual(expressive.mix,dry.mix);
 assert.deepEqual(expressive.mix,renderRecordedEnsemble({...opts,gestures}).mix);
 assert.deepEqual(Object.keys(expressive.trackStems),['strings','winds']);
 assert.equal(expressive.gestureReceipts.length,1);
 assert.equal(expressive.gestureReceipts[0].participants.length,2);
 assert.deepEqual(expressive.gestureReceipts[0].participants.map(x=>x.technique),['bowed','breath']);
 assert.equal(expressive.choices.strings[1].reattack.kind,'bow-change');
 assert.equal(expressive.choices.winds[1].reattack.kind,'breath');
 assert.equal(expressive.choices.strings[1].sourceOffsetFrames,0);
 assert.equal(expressive.choices.winds[1].sourceOffsetFrames,0);
 for(let i=0;i<expressive.mix.length;i++){
  const {strings,winds}=expressive.trackStems;
  assert.ok(Math.abs(strings[i]+winds[i]-expressive.mix[i])<1e-6);
 }
});

test('shared ensemble gestures require multiple correctly typed participants',()=>{
 const base=zones(),notes=[
  {midi:69,start:0,duration:.6,articulation:'arco',pressure:.7,phraseId:'line'},
  {midi:72,start:.6,duration:.6,articulation:'arco',pressure:.7,connected:true,phraseId:'line'}
 ];
 const gestures=[{id:'line',start:0,end:1.2,curve:[{at:0,value:.8},{at:1,value:1.1}]}];
 const track={id:'one',instrument:'fixture',group:'strings',pan:0,gain:.5,phrasingTechnique:'bowed',notes};
 const opts={zones:base,tracks:[track],seconds:1.4,gestures};
 assert.throws(()=>renderRecordedEnsemble(opts),/at least two musicians/);
 assert.throws(()=>renderRecordedEnsemble({...opts,tracks:[{...track,phrasingTechnique:'breath'},{...track,id:'two'}]}),/Invalid ensemble phrasing/);
 assert.throws(()=>renderRecordedEnsemble({...opts,gestures:[{...gestures[0],id:'missing'}]}),/Unknown ensemble gesture/);
});
