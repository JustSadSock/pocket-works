import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createEnhancementLayers,renderEnhancedPCM} from '../audio-enhance.js';
import {prepareBuzzLayer,prepareTextureLayer} from '../artifact-repair.js';
const RATE=44100,N=8192;
function signal(freq,amp=.3){
 return Float32Array.from({length:N},(_,i)=>amp*Math.sin(i*2*Math.PI*freq/RATE));
}
const buildLayers=(base,vocals)=>{
 const layers=createEnhancementLayers(base,vocals);
 const clean=base.map((c,i)=>Float32Array.from(c,(x,j)=>x-vocals[i][j]));
 layers.artifact=prepareBuzzLayer(clean,vocals);
 const prepared=prepareTextureLayer(clean,vocals);
 layers.texture=prepared.channels;
 layers.textureCoverage=prepared.coverage;
 return layers;
};
const rms=x=>Math.sqrt(x.reduce((sum,s)=>sum+s*s,0)/x.length);
const scene=()=>{
 const voice=signal(900,.21),background=signal(220,.24);
 const base=[Float32Array.from(voice,(v,i)=>v+background[i]),Float32Array.from(voice,(v,i)=>v-background[i]*.7)];
 const vocals=[voice.slice(),voice.slice()];
 return {base,vocals};
};
test('all three DSP layers are precomputed once, independent and finite',()=>{
 const {base,vocals}=scene(),before=base.map(c=>c.slice()),progress=[];
 const layers=createEnhancementLayers(base,vocals,{progress:v=>progress.push(v)});
 for(const key of ['spectral','reconstruct','center']){
  assert.equal(layers[key].length,2);
  assert(layers[key].every(c=>c.length===N&&[...c].every(Number.isFinite)));
 }
 assert.equal(progress.at(-1),1);
 assert.deepEqual(base,before,'original input must remain untouched');
 assert(rms(layers.spectral[0])>.00001,'spectral layer actually changes audio');
 assert(rms(layers.reconstruct[0])>.00001,'reconstruction layer actually changes audio');
 assert(rms(layers.center[0])>.00001,'center layer actually changes audio');
});
test('every A/B switch changes ONLY its own cached correction, no new model call',()=>{
 const {base,vocals}=scene(),layers=buildLayers(base,vocals);
 const bare=renderEnhancedPCM(base,vocals,layers,{strength:1,spectral:false,reconstruct:false,center:false});
 for(let i=0;i<N;i+=409)assert(Math.abs(bare[0][i]-(base[0][i]-vocals[0][i]))<1e-7);
 for(const feature of ['spectral','reconstruct','center']){
  const result=renderEnhancedPCM(base,vocals,layers,{strength:1,spectral:false,reconstruct:false,center:false,[feature]:true,centerAmount:60});
  assert(rms(Float32Array.from(result[0],(x,i)=>x-bare[0][i]))>.00001,feature);
 }
 const original=renderEnhancedPCM(base,vocals,layers,{strength:0});
 assert.deepEqual(original,base);
});
test('up to 150% vocal subtraction is supported and >150 rejected',()=>{
 const {base,vocals}=scene(),layers=createEnhancementLayers(base,vocals);
 const increased=renderEnhancedPCM(base,vocals,layers,{strength:1.5,spectral:false,reconstruct:false,center:false});
 const normal=renderEnhancedPCM(base,vocals,layers,{strength:1,spectral:false,reconstruct:false,center:false});
 assert(rms(Float32Array.from(increased[0],(v,i)=>v-normal[0][i]))>.03);
 assert.throws(()=>renderEnhancedPCM(base,vocals,layers,{strength:1.55}),/интенсивность/);
 assert.throws(()=>renderEnhancedPCM(base,vocals,layers,{centerAmount:-1}),/интенсивность/);
});
test('mono suppresses adaptive center and faulty masks do not silently pass',()=>{
 const {base,vocals}=scene(),mono=[base[0]],vmono=[vocals[0]],layers=buildLayers(mono,vmono);
 assert(layers.center[0].every(x=>x===0));
 assert.throws(()=>renderEnhancedPCM(mono,vmono,{}),/не подготовлена/);
 assert.throws(()=>createEnhancementLayers([new Float32Array(0)],vmono),/дорожки/);
});
test('experiment UI exposes genuine switches and cached DSP, not fake Wiener setting',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="repair-noise"[^>]*checked/);
 assert.match(html,/id="repair-texture"[^>]*checked/);
 assert.match(html,/<details class="legacy-filters"/);
 assert.doesNotMatch(html,/id="enhance-spectral"[^>]*checked/);
 assert.match(html,/id="enhance-center"[^>]*disabled/);
 assert.match(html,/id="enhance-reconstruct"[^>]*disabled/);
 assert.match(html,/max="150"/);
 assert.match(app,/renderEnhancedPCM\(item\.meta\.base,item\.meta\.vocals,item\.meta\.layers,item\.meta\.effects\)/);
 assert.match(app,/new Worker\('\.\/enhance-worker\.js'/);
});

test('new buzz filter attenuates model-correlated narrow speech harmonics independently',()=>{
 const length=44100,rate=44100;
 const voice=Float32Array.from({length},(_,i)=>.16*Math.sin(2*Math.PI*940*i/rate));
 const diffuse=Float32Array.from({length},(_,i)=>.07*Math.sin(2*Math.PI*337*i/rate));
 const clean=[Float32Array.from(voice,(x,i)=>x*.35+diffuse[i])],vocal=[voice];
 const buzz=prepareBuzzLayer(clean,vocal);
 const input=rms(clean[0]),repaired=rms(Float32Array.from(clean[0],(x,i)=>x+buzz[0][i]));
 assert(repaired<input*.92,'buzz layer should change a correlated harmonic by audible amplitude');
 assert(voice.every(Number.isFinite));
});
test('texture fill selects local low-vocal donors, not silence or random noise',()=>{
 const rate=44100,length=rate*2;
 const ambient=Float32Array.from({length},(_,i)=>.085*Math.sin(2*Math.PI*351*i/rate));
 const voice=Float32Array.from({length},(_,i)=>i>rate*.65&&i<rate*1.3?.17*Math.sin(2*Math.PI*890*i/rate):0);
 const clean=[Float32Array.from(ambient,(x,i)=>x+voice[i]*.41)];
 const result=prepareTextureLayer(clean,[voice],rate);
 assert(result.coverage>0,'must detect usable nearby low-vocal background');
 assert(rms(result.channels[0])>.001,'texture must provide real audible correction');
 assert(result.channels[0].every(Number.isFinite));
 const allVoice=Float32Array.from({length},(_,i)=>.14*Math.sin(2*Math.PI*790*i/rate));
 const noDonor=prepareTextureLayer([allVoice],[allVoice],rate);
 assert.equal(noDonor.coverage,0,'never use speech-contaminated frames as ambience donors');
 assert(noDonor.channels[0].every(x=>x===0));
});
test('new controls A/B only use cached layers and preserve the source',()=>{
 const {base,vocals}=scene(),layers=buildLayers(base,vocals);
 const bare=renderEnhancedPCM(base,vocals,layers,{strength:1,artifact:false,texture:false});
 const buzz=renderEnhancedPCM(base,vocals,layers,{strength:1,artifact:true,texture:false});
 assert(rms(Float32Array.from(buzz[0],(v,i)=>v-bare[0][i]))>.00001);
 const turnedOff=renderEnhancedPCM(base,vocals,layers,{strength:0,artifact:true,texture:true});
 assert.deepEqual(turnedOff,base);
 assert.throws(()=>renderEnhancedPCM(base,vocals,layers,{textureAmount:110}),/интенсивность/);
 assert.throws(()=>renderEnhancedPCM(base,vocals,layers,{artifactAmount:-1}),/интенсивность/);
});
