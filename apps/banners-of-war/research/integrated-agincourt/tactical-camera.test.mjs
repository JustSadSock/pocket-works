import test from 'node:test';
import assert from 'node:assert/strict';
import {E} from '../../engine.js';
import {createHistorical} from '../../chronicles.js';
import {extent,project,unproject} from './tactical-camera.js';
for(const side of [0,1])test('Agincourt 60 degree world/screen round trip '+side,()=>{
 let s=createHistorical(E,'agincourt',{side}),F=E.forState(s),original=JSON.stringify(s),e=extent(s);
 assert(e.w===F.H&&e.h>0);
 for(const k of [.25,1,6.4,12])for(const o of [{x:30,y:42},{x:-300,y:500}])for(let x=0;x<=F.W;x+=35)for(let y=0;y<=F.H;y+=35){
   let q={x,y},p=project(s,q,o,k),r=unproject(s,p,o,k);
   assert(Math.hypot(q.x-r.x,q.y-r.y)<1e-5);
   assert(p.y>=o.y+e.top*k-1e-8&&p.y<=o.y+(e.top+e.h)*k+1e-8);
 }
 assert.equal(JSON.stringify(s),original);
});
