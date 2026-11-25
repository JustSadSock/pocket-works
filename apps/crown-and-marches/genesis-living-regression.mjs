// Synthetic, offline regression; actual licensed DEM review is a separate gate.
import assert from 'node:assert/strict';
import {packExemplars,packedChecksum} from './genesis-natural.mjs';
import {generateGenesis,genesisOptions} from './world-genesis.mjs';
assert.equal(packedChecksum(btoa('123456789')),'cbf43926');
const ids=['alpine','carpathian','gorge','foothills','low-ridge','rolling','coastal'];
const exemplars=packExemplars(ids.map((id,k)=>({id,size:385,metadata:{sampleSha256:'synthetic',attribution:'synthetic'},metres:Float32Array.from({length:385*385},(_,i)=>1000+500*Math.sin(i%385/16+k)*Math.cos(Math.floor(i/385)/24+k)+200*Math.sin((i%385+Math.floor(i/385))/5+k))})));
const options={revision:'genesis-3.3.0',approach:'field',detail:4,exemplars};
assert.throws(()=>genesisOptions({...options,exemplars:exemplars.map(({packedCrc32,...x})=>x)}),/checksum/);
assert.throws(()=>genesisOptions({...options,exemplars:exemplars.map((x,i)=>i?x:{...x,data:(x.data[0]==='A'?'B':'A')+x.data.slice(1)})}),/Corrupt/);
assert.throws(()=>genesisOptions({...options,approach:'natural'}),/Unsupported/);
const W=48,H=40,continental={land:Uint8Array.from({length:W*H},(_,i)=>+((i%W)>2&&(i%W)<W-3&&(i/W|0)>2&&(i/W|0)<H-3))};
const a=generateGenesis('fixture',W,H,continental,{...options,revision:'genesis-3.2.0'}),b=generateGenesis('fixture',W,H,continental,options),c=generateGenesis('fixture',W,H,continental,options);
assert.deepEqual(b,c);assert.ok(b.geography.bed.some((v,i)=>v!==a.geography.bed[i]));assert.ok(b.geography.bed.every(Number.isFinite));assert.equal(b.geography.hydrologyAudit.unresolved,0);
console.log('Genesis 3.3 synthetic integrity and determinism passed');
