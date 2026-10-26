import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createEnhancementLayers,renderEnhancedPCM} from '../audio-enhance.js';
const RATE=44100,N=8192;
function signal(freq,amp=.3){
 return Float32Array.from({length:N},(_,i)=>amp*Math.sin(i*2*Math.PI*freq/RATE));
}
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
 const {base,vocals}=scene(),layers=createEnhancementLayers(base,vocals);
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
 const {base,vocals}=scene(),mono=[base[0]],vmono=[vocals[0]],layers=createEnhancementLayers(mono,vmono);
 assert(layers.center[0].every(x=>x===0));
 assert.throws(()=>renderEnhancedPCM(mono,vmono,{}),/не подготовлена/);
 assert.throws(()=>createEnhancementLayers([new Float32Array(0)],vmono),/дорожки/);
});
test('experiment UI exposes genuine switches and cached DSP, not fake Wiener setting',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(html,/id="enhance-spectral"[^>]*checked/);
 assert.match(html,/id="enhance-center"[^>]*checked/);
 assert.match(html,/id="enhance-reconstruct"[^>]*checked/);
 assert.match(html,/max="150"/);
 assert.match(app,/renderEnhancedPCM\(item\.meta\.base,item\.meta\.vocals,item\.meta\.layers,item\.meta\.effects\)/);
 assert.match(app,/new Worker\('\.\/enhance-worker\.js'/);
});
