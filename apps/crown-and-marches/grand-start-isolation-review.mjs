// Initial geometry diagnosis only: no scenario state changes or privileged player policy.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {grandCampaign,neighbors,dist,charted,landSurveyFrontier,simulationHash} from './world.mjs';
import {seeds,observedFrontierOptions} from './grand-campaign-cases.mjs';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/grand-start-isolation',rows=[];
for(const cfg of seeds){const s=grandCampaign({...cfg,worldSize:'standard',states:6}),hash=simulationHash(s);
 for(const c of s.cities){const f=c.f,queue=[],seen=new Set(),boundaries={};for(let i=0;i<s.owner.length;i++)if(s.owner[i]===f&&s.adminAccess[i]&&s.map.land[i]){queue.push([i,0]);seen.add(i);}
 for(let k=0;k<queue.length;k++){const [i,d]=queue[k],owner=s.owner[i];if(owner>=0&&owner!==f&&boundaries[owner]==null)boundaries[owner]=d;for(const j of neighbors(i))if(s.map.land[j]&&!seen.has(j)){seen.add(j);queue.push([j,d+1]);}}
 const options=observedFrontierOptions(s,c);assert.equal(options[0]?.i,landSurveyFrontier(s,c));const best=options.slice().sort((a,b)=>b.unknownNeighbors-a.unknownNeighbors||a.steps-b.steps||a.i-b.i)[0],nearest=Math.min(...Object.values(boundaries)),radii=[7,16,24].map(radius=>{let cells=0,foreign=new Set();for(let i=0;i<s.owner.length;i++)if(dist(i,c.i)<=radius+.1){cells++;if(s.owner[i]>=0&&s.owner[i]!==f)foreign.add(s.owner[i]);}return {radius,cells,foreignTerritoriesInRadius:foreign.size};});
 rows.push({seed:cfg.seed,shape:cfg.mapShape,realm:s.states[f].name,contacts:s.discovery.contacts[f].filter(Boolean).length-1,chart:s.discovery.charts[f].filter(Boolean).length,nearestCapital:Math.min(...s.cities.filter(q=>q.f!==f).map(q=>dist(c.i,q.i))),nearestLandBoundary:Number.isFinite(nearest)?nearest:null,reachableForeignRealms:Object.keys(boundaries).length,localPotential:c.potential.slice(),initialTools:c.stock[12],frontierCount:options.length,defaultFrontier:options[0]??null,informationFrontier:best??null,radii});}
 assert.equal(simulationHash(s),hash);}
mkdirSync(output,{recursive:true});writeFileSync(join(output,'grand-start-isolation.json'),JSON.stringify({schema:1,reportOnly:true,rows},null,2));console.log('[grand-start-isolation] '+JSON.stringify(rows));
