import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generate,activateWorld,newGame,serialize,restore,W,H} from './world.mjs';
import {diagnostics} from './genesis-review.mjs';
export function fingerprint(a){let x=2166136261,y=0x9e3779b9;for(const v of new Uint8Array(a.buffer,a.byteOffset,a.byteLength)){x=Math.imul(x^v,16777619);y=Math.imul(y+v,2246822519)^(y>>>13);}return (x>>>0).toString(16).padStart(8,'0')+(y>>>0).toString(16).padStart(8,'0');}
const hashes=m=>Object.fromEntries(Object.entries(m).filter(([k,v])=>ArrayBuffer.isView(v)).map(([k,v])=>[k,fingerprint(v)]));
export function runGenesisRegression(){
 const baseline=JSON.parse(readFileSync(new URL('./genesis-legacy-hashes.json',import.meta.url),'utf8'));
 for(const f of baseline.fixtures){activateWorld({worldSize:f.size});assert.deepEqual(hashes(generate(f.seed,f.version,f.shape)),f.hashes,JSON.stringify(f));}
 activateWorld({worldSize:'standard'});const seed='atlas-mountain-173',results=[];
 for(const detail of [2,4,8]){const start=performance.now(),m=generate(seed,3,'continents',{detail,approach:'structure'}),ms=performance.now()-start,d=diagnostics(m,W,H);assert.equal(d.up,0);assert.equal(d.fineUp,0);assert.equal(d.interiorTerminal,0);results.push({detail,ms,...d});}
 const t=performance.now(),s=newGame(seed,{states:6,mapShape:'continents',experimentalGeography:{detail:4,approach:'structure'}}),createMs=performance.now()-t,save=serialize(s),r0=performance.now(),r=restore(save),restoreMs=performance.now()-r0;assert.equal(s.mapVersion,3);assert.deepEqual(s.geographyV3,r.geographyV3);assert.deepEqual(hashes(s.map),hashes(r.map));assert.deepEqual(hashes(s.map.geography),hashes(r.map.geography));assert.equal(newGame(seed).mapVersion,2);assert.equal(s.cities.length,6);assert.ok(s.cities.every(c=>s.map.land[c.i]&&s.map.terrain[c.i]!==4));
 return {legacy:baseline.fixtures.length,resolutions:results,save:{bytes:save.length,createMs,restoreMs,cities:s.cities.map(c=>({name:c.name,terrain:s.map.terrain[c.i],fertility:s.map.fert[c.i],resource:s.map.resource[c.i]}))}};
}
