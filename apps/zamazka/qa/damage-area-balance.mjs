import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {ARTS,zoneFor,freshZoneVariation,BALANCED_ZONE_OFFSET,W,H} from '../artworks.js';

const signedArea=points=>Math.abs(points.reduce((sum,[x,y],i)=>{
 const [nx,ny]=points[(i+1)%points.length];return sum+x*ny-nx*y;
},0))*.5;

// These are actual contours of the v1.40.13 generator: an old multiplayer
// assignment or archived drawing must never be reinterpreted after an update.
const oldMasks=[
 [0,0,'star',[[297.4,143.4],[339.1,127.8],[345.8,87.9]]],
 [1,42,'diamond',[[414.5,157.2],[482.3,114.2],[532,172.9]]],
 [8,123456789,'torn',[[465.2,243],[451.5,252.2],[437,262.2]]],
 [36,987654321,'torn',[[411,351],[394.9,345.2],[383.2,333.9]]],
 [80,0xffffffff,'oval',[[117.5,176.2],[109.7,168.7],[102,160.5]]],
 [135,20261231,'round',[[314,209.8],[317,221.4],[318,233.3]]]
];
for(const [id,seed,kind,first] of oldMasks){
 const z=zoneFor(id,seed);
 assert.equal(z.kind,kind,'legacy shape family changed');
 assert.deepEqual(z.points.slice(0,3),first,'legacy contour changed');
}
const shapes=new Set(),count=ARTS.length*300;
let min=Infinity,max=-Infinity;
for(let id=0;id<ARTS.length;id++){
 for(let j=0;j<300;j++){
  const seed=(Math.imul(j,104729)+Math.imul(id,1337))>>>0;
  const variation=BALANCED_ZONE_OFFSET+seed;
  const zone=zoneFor(id,variation),fraction=signedArea(zone.points)/(W*H);
  min=Math.min(min,fraction);max=Math.max(max,fraction);
  assert(Math.abs(fraction-.03)<.0001,`damaged fraction ${fraction} on art ${id} seed ${seed}`);
  assert(zone.points.every(([x,y])=>x>=2&&x<=W-2&&y>=2&&y<=H-2),'normalized contour leaves painting');
  shapes.add(zone.kind);
  if(j===0)assert.deepEqual(zone,zoneFor(id,variation),'seed reconstruction is not deterministic');
 }
}
assert.equal(count,ARTS.length*300);
assert.deepEqual([...shapes].sort(),['burst','diamond','oval','round','star','torn']);
for(let i=0;i<32;i++){
 const v=freshZoneVariation();
 assert(Number.isSafeInteger(v)&&v>=BALANCED_ZONE_OFFSET&&v<BALANCED_ZONE_OFFSET*2);
}
console.log('ZAMAZKA damage balance: '+count+' new masks at '+(min*100).toFixed(4)+'–'+(max*100).toFixed(4)+'%, six contour families, zero clipping, legacy contours preserved');

// The server must not silently change CURRENT rooms after hot deployment.
// All rooms created by v1.40.14 opt in; old persisted state lacks the flag,
// and retains 32-bit seeds even in later rounds.
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};runInNewContext(compiled,{exports,Math,Array,Number,Object,JSON,Map,Set,Error,Date,console});
const server=exports.default;
const players=[{id:'host',name:'H'},{id:'guest',name:'G'}];
function startRoom(legacy=false){
 const state=server.createRoom({player:players[0]}).state;
 assert.equal(state.balancedDamage,true,'new room must opt in');
 if(legacy)delete state.balancedDamage;
 server.onJoin({state,player:players[1],players});
 server.onMessage({state,player:players[0],players,payload:{type:'start',rounds:1,drawingSeconds:160}});
 assert.equal(state.phase,'preview');
 for(const p of players){
  const variation=state.assignments[p.id].variation;
  assert(Number.isSafeInteger(variation));
  if(legacy)assert(variation<BALANCED_ZONE_OFFSET,'existing room changed mask after update');
  else assert(variation>=BALANCED_ZONE_OFFSET,'new room still uses unfair mask');
 }
}
startRoom(false);startRoom(true);
console.log('ZAMAZKA multiplayer: new rooms normalized, old persistent rooms unchanged; new solo seeds normalized');
