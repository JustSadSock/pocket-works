import assert from 'node:assert/strict';
import {analyzeHydrographyBed,generateGenesis} from './world-genesis.mjs';
import {classifyLakes,lakeNetwork,refineCoast} from './genesis-hydrography.mjs';
import {packExemplars} from './genesis-natural.mjs';
import {auditMajorExits} from './genesis-hydrology.mjs';
import {contourField} from './genesis-contours.mjs';
// Two erosion basins in a sloping valley, without an authored water mask.
// All water, spill levels and links are inferred by the production priority flood.
const r=4,W=24,H=14,w=W*r+1,h=H*r+1,N=w*h,land=new Uint8Array(N),bed=new Float32Array(N),rain=new Float32Array(N).fill(.6);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,X=x/r,Y=y/r;land[i]=+(x>0&&x<w-1&&y>0&&y<h-1);const valley=.38-X*.008+Math.min(.22,Math.abs(Y-7)*.055),pit=(cx,cy,rx,ry,amp)=>amp*Math.exp(-(((X-cx)/rx)**2+((Y-cy)/ry)**2));bed[i]=land[i]?valley-pit(7,7,2.5,1.8,.17)-pit(16,7,3,2,.18):.1;}
const d=analyzeHydrographyBed(bed,land,w,h,rain),g={detail:r,width:w,height:h,land,bed,surface:d.filled,down:d.down,lake:d.lake,flow:d.flow},p=classifyLakes(g,W,H);
Object.assign(g,{lakeId:p.lakeId,lakeLevels:p.lakeLevels,lakeWater:p.lakeWater,lakeCoverage:p.wetCount});const links=lakeNetwork(g);assert.equal(p.records.length,2);assert.equal(links.links.length,1);assert.equal(links.links[0].from,1);assert.equal(links.links[0].to,2);assert.ok(p.lakeLevels[1]>p.lakeLevels[2]);
const m={geography:g,land:Uint8Array.from(p.coverage,x=>1-x)},f=contourField(m);let wetOutside=0;for(let i=0;i<N;i++){if(!p.lakeId[i])continue;assert.ok(g.bed[i]<p.lakeLevels[p.lakeId[i]]);assert.ok(f.sample(i%w/r,Math.floor(i/w)/r).lake>0);const x=Math.min(W-1,Math.floor(i%w/r)),y=Math.min(H-1,Math.floor(Math.floor(i/w)/r));wetOutside+=m.land[y*W+x];}assert.ok(wetOutside>0,'physical shore independent of coarse cells');
const ids=['alpine','carpathian','gorge','foothills','low-ridge','rolling','coastal'],exemplars=packExemplars(ids.map((id,k)=>({id,size:385,metadata:{sampleSha256:'synthetic',attribution:'synthetic'},metres:Float32Array.from({length:385*385},(_,i)=>1000+500*Math.sin(i%385/16+k)*Math.cos(Math.floor(i/385)/24+k)+200*Math.sin((i%385+Math.floor(i/385))/5+k))})));
const CW=48,CH=40,continental={land:Uint8Array.from({length:CW*CH},(_,i)=>+((i%CW)>2&&(i%CW)<CW-3&&(i/CW|0)>2&&(i/CW|0)<CH-3))},options={revision:'genesis-3.4.0',detail:4,approach:'field',exemplars};
const a=generateGenesis('fixture',CW,CH,continental,options),b=generateGenesis('fixture',CW,CH,continental,options),old=generateGenesis('fixture',CW,CH,continental,{...options,revision:'genesis-3.3.0'});assert.deepEqual(a,b);assert.equal(a.geography.hydrologyAudit.unresolved,0);assert.equal(a.geography.hydrologyAudit.repair.visited,CW*CH);assert.ok(a.geography.hydrologyAudit.repair.error<1e-7);assert.equal(auditMajorExits(a,CW,CH).total,0);assert.ok(a.geography.coastRefinement.changed>0);assert.ok(a.geography.lakeNetwork.links.length>0);
for(let y=8*r;y<(CH-8)*r;y++)for(let x=8*r;x<(CW-8)*r;x++){const i=y*a.geography.width+x;assert.equal(a.geography.bed[i],old.geography.bed[i]);}
for(let i=0;i<a.land.length;i++){const j=a.down[i];if(a.land[i]&&j>=0)assert.ok(a.routingHeight[i]>a.routingHeight[j]);}
