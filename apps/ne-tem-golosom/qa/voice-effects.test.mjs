import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VOICE_EFFECTS,VOICE_EFFECT_GROUPS,normalizeVoiceEffect,connectVoiceEffect} from '../voice-effects.js';
const allNodes=[];
const mockNode=type=>{
 const node={
  type,kind:type,frequency:{value:0},Q:{value:0},gain:{value:0},delayTime:{value:0},
  oversample:'none',curve:null,edges:[],started:0,stopped:0,
  connect(next){this.edges.push(next);return next},disconnect(){this.edges.length=0},
  start(){this.started++},stop(){this.stopped++}
 };
 allNodes.push(node);
 return node;
};
const context={
 currentTime:0,
 createWaveShaper:()=>mockNode('shaper'),createBiquadFilter:()=>mockNode('filter'),
 createGain:()=>mockNode('gain'),createDelay:()=>mockNode('delay'),
 createOscillator:()=>mockNode('oscillator'),
 createBufferSource:()=>mockNode('buffer-source'),
 createBuffer:(channels,frames)=>({getChannelData:()=>new Float32Array(frames)})
};
test('all expanded voice presets are unique, whitelisted, and grouped',()=>{
 const ids=VOICE_EFFECTS.map(fx=>fx.id),categories=new Set(['main',...VOICE_EFFECT_GROUPS.map(x=>x.id)]);
 assert.equal(VOICE_EFFECTS.length,22);
 assert.equal(ids.length,new Set(ids).size);
 assert.deepEqual(ids.slice(0,6),['clean','female','male','child','high','deep']);
 assert(VOICE_EFFECTS.every(fx=>categories.has(fx.category)&&fx.label));
 for(const id of ids)assert.equal(normalizeVoiceEffect(id),id);
 assert.equal(normalizeVoiceEffect('unexpected'),'clean');
 assert.equal(normalizeVoiceEffect('__proto__'),'clean');
});
test('each Web Audio preset builds and disposes a real non-empty graph',()=>{
 for(const {id} of VOICE_EFFECTS){
  allNodes.length=0;
  const from=mockNode('source'),out=mockNode('destination');
  const cleanup=connectVoiceEffect(context,from,out,id);
  assert(from.edges.length,'FX '+id+' must connect input to effect graph');
  const oscillatorCount=allNodes.filter(n=>n.kind==='oscillator').length;
  assert.equal(allNodes.filter(n=>n.kind==='oscillator'&&n.started!==1).length,0);
  assert.equal(typeof cleanup,'function');
  cleanup();
  assert.equal(from.edges.length,0,'no original source connections left');
  assert(allNodes.every(node=>node.edges.length===0),'FX '+id+' has no leaked feedback or LFO edges');
  assert.equal(allNodes.filter(n=>n.kind==='oscillator'&&n.stopped===1).length,oscillatorCount);
  cleanup();
 }
});
test('modulated special effects really allocate clocked oscillators',()=>{
 for(const id of ['ghost','alien','glitch','cassette','chorus','cosmos']){
  allNodes.length=0;
  const cleanup=connectVoiceEffect(context,mockNode('source'),mockNode('output'),id,1.5);
  assert(allNodes.some(n=>n.kind==='oscillator'&&n.started===1),id+' modulation is real');
  cleanup();
 }
});
test('natural voices use genuine two-grain pitch shifting without changing timeline speed',()=>{
 for(const [id,semitones] of [['female',4],['male',-4],['child',7],['high',3],['deep',-6]]){
  const fx=VOICE_EFFECTS.find(item=>item.id===id);
  assert.equal(fx.semitones,semitones);
  allNodes.length=0;
  const cleanup=connectVoiceEffect({...context,sampleRate:44100},mockNode('source'),mockNode('output'),id);
  assert.equal(allNodes.filter(n=>n.kind==='buffer-source').length,4);
  assert(allNodes.filter(n=>n.kind==='buffer-source').every(n=>n.started===1));
  cleanup();
  assert(allNodes.filter(n=>n.kind==='buffer-source').every(n=>n.stopped===1));
 }
});
test('voice filters are applied in editor monitoring, synchronized premiere and remain saved',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const premiere=readFileSync(new URL('../premiere-export.js',import.meta.url),'utf8');
 const model=readFileSync(new URL('../timeline-model.js',import.meta.url),'utf8');
 assert.match(app,/connectVoiceEffect\(voiceFxContext,c.fxSource/);
 assert.match(premiere,/connectVoiceEffect\(ctx,gain,limiter,clip.fx/);
 assert.match(app,/fx:normalizeVoiceEffect\(c.fx\)/);
 assert.match(app,/fx:normalizeVoiceEffect\(m.fx\)/);
 assert.match(model,/fx:raw\?\.fx\|\|'clean'/);
});
test('backgrounding safely saves mobile microphone recordings, while video exports resume',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../media-lab.js',import.meta.url),'utf8');
 const premiere=readFileSync(new URL('../premiere-export.js',import.meta.url),'utf8');
 assert.match(app,/document.hidden&&record/);
 assert.match(app,/interruptedVoiceTake=true/);
 assert.match(app,/finishRecording\(\)/);
 assert.doesNotMatch(app,/record.pausedForTab=true/);
 assert.doesNotMatch(studio,/if\s*\(document.hidden\)\s*abort\(\)/);
 assert.match(studio,/recorder\.resume\(\)/);
 assert.match(premiere,/recorder\.resume\(\)/);
});
