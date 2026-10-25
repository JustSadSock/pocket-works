import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VOICE_EFFECTS,normalizeVoiceEffect,connectVoiceEffect} from '../voice-effects.js';
const mockNode=type=>({
 type,frequency:{value:0},Q:{value:0},gain:{value:0},delayTime:{value:0},
 oversample:'none',curve:null,
 edges:[],connect(next){this.edges.push(next);return next},disconnect(){this.edges.length=0}
});
const context={
 createWaveShaper:()=>mockNode('shaper'),createBiquadFilter:()=>mockNode('filter'),
 createGain:()=>mockNode('gain'),createDelay:()=>mockNode('delay')
};
test('voice presets use a bounded built-in whitelist',()=>{
 assert.deepEqual(VOICE_EFFECTS.map(x=>x.id),['clean','radio','robot','echo','monster']);
 assert.equal(normalizeVoiceEffect('unexpected'),'clean');
 assert.equal(normalizeVoiceEffect('__proto__'),'clean');
 assert.equal(normalizeVoiceEffect('echo'),'echo');
});
test('each preset builds a disposable WebAudio graph',()=>{
 for(const {id} of VOICE_EFFECTS){
  const from=mockNode('source'),out=mockNode('destination');
  const cleanup=connectVoiceEffect(context,from,out,id);
  assert(from.edges.length,'FX '+id+' connects source to audio sink');
  assert.equal(typeof cleanup,'function');
  cleanup();
  assert.equal(from.edges.length,0);
 }
});
test('voice filters are wired in editor monitoring and in export render graph',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const exportJS=readFileSync(new URL('../premiere-export.js',import.meta.url),'utf8');
 assert.match(app,/connectVoiceEffect\(voiceFxContext,c.fxSource/);
 assert.match(exportJS,/connectVoiceEffect\(ctx,gain,limiter,clip.fx/);
 assert.match(app,/fx:normalizeVoiceEffect\(c.fx\)/);
 assert.match(app,/fx:normalizeVoiceEffect\(m.fx\)/);
});
test('tab visibility never cancels in-flight voice recorder or transcodes',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../media-lab.js',import.meta.url),'utf8');
 const premiere=readFileSync(new URL('../premiere-export.js',import.meta.url),'utf8');
 assert.match(app,/record.pausedForTab=true/);
 assert.match(app,/current.rec.resume\(\)/);
 assert.doesNotMatch(studio,/if\s*\(document.hidden\)\s*abort\(\)/);
 assert.match(studio,/recorder\.resume\(\)/);
 assert.match(premiere,/recorder\.resume\(\)/);
});
