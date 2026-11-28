// Isolated process per configuration: peak RSS is the OS process high-water,
// not merely the bytes of surviving typed arrays.
import {newGame,restore,serialize,generate,activateWorld,W,H} from './world.mjs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [approach,detail0,revision]=process.argv.slice(2),detail=Number(detail0),seed='atlas-mountain-173',options={states:6,mapShape:'continents',experimentalGeography:{approach,detail,revision}};
const digest=m=>Object.fromEntries(Object.entries(m).filter(([k,v])=>ArrayBuffer.isView(v)).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
const start=performance.now(),s=newGame(seed,options),generationMs=performance.now()-start,peakGenerationRSSKiB=process.resourceUsage().maxRSS,coarse=digest(s.map),fine=digest(s.map.geography),saved=serialize(s),t=performance.now(),r=restore(saved),restoreMs=performance.now()-t;
assert.deepEqual(digest(r.map),coarse);assert.deepEqual(digest(r.map.geography),fine);assert.deepEqual(s.geographyV3,r.geographyV3);
console.log(JSON.stringify({approach,detail,revision,generationMs,restoreMs,peakGenerationRSSKiB,peakProcessRSSKiB:process.resourceUsage().maxRSS,saveBytes:Buffer.byteLength(saved),coarse,fine,hydrology:s.map.geography.hydrologyAudit||null}));
