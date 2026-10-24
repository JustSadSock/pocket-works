import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paintVoteSurfaces,voteCanvasSelector} from '../vote-surfaces.js';

const ids=[12,14,21,27,31];
const edit={art:21,variation:999,strokes:[{c:'#112233',s:4,t:'brush',p:[[10,15],[20,25]]}]};
const make=()=>{
 const canvases=ids.map(()=>({isConnected:true,classList:{
  values:new Set(),add(k){this.values.add(k)},remove(k){this.values.delete(k)},contains(k){return this.values.has(k)}
 }}));
 return {canvases,root:{
  contains(el){return canvases.includes(el)&&el.isConnected},
  querySelector(selector){return canvases.find((c,i)=>selector===voteCanvasSelector(i))||null}
 }};
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const a=make(),calls=[],unresolved=[];
const promise=paintVoteSurfaces(a.root,ids,edit,{render:(canvas,id,variation,strokes,damaged)=>{
 calls.push({canvas,id,variation,strokes,damaged});
 return new Promise(resolve=>unresolved.push(resolve));
}});
assert.equal(calls.length,2,'at most two canvas renders simultaneously');
assert(a.canvases.every(c=>!c.classList.contains('is-ready')));
unresolved[0](true);await tick();
assert.equal(calls.length,3);
assert(a.canvases.every(c=>!c.classList.contains('is-ready')),'no painted slot revealed early');
unresolved[1](true);await tick();
unresolved[2](true);await tick();
for(const done of unresolved.slice(3))done(true);
const good=await promise;
assert.deepEqual(good,{ready:true,painted:5,total:5});
assert.equal(calls.length,5);
assert(calls.every(x=>x.canvas===a.canvases[ids.indexOf(x.id)]));
assert.equal(calls.filter(x=>x.damaged).length,1);
const correct=calls.find(x=>x.damaged);
assert.equal(correct.id,edit.art);
assert.equal(correct.variation,edit.variation);
assert.equal(correct.strokes,edit.strokes);
assert(calls.filter(x=>!x.damaged).every(x=>x.variation===0&&x.strokes===null));
assert(a.canvases.every(c=>c.classList.contains('is-ready')));

const b=make();
const broken=await paintVoteSurfaces(b.root,ids,edit,{render:async(canvas,id)=>id!==27});
assert.equal(broken.ready,false);
assert.equal(broken.painted,4);
assert(b.canvases.every(c=>!c.classList.contains('is-ready')),'one failed render does not reveal correct slot');
const fixed=await paintVoteSurfaces(b.root,ids,edit,{render:async()=>true});
assert.equal(fixed.ready,true,'retry paints all five surfaces');
assert(b.canvases.every(c=>c.classList.contains('is-ready')));
const c=make();c.canvases[0].isConnected=false;
assert.equal((await paintVoteSurfaces(c.root,ids,edit,{render:async()=>true})).ready,false);

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(app,/paintVoteSurfaces\(ballotScreen,v\.selected,examined,\{render:renderArtwork\}\)/);
assert.match(app,/data-vote-canvas=/);
assert.doesNotMatch(app,/examinedCanvas/,'no forged-only DOM node');
assert.doesNotMatch(app,/canvas\.classList\.add\('is-ready'\)/,'readiness must be atomic');
assert.match(app,/retry-vote-paintings/,'failed gallery can be retried');
console.log('ZAMAZKA: five uniform canvases, one restoration, atomic reveal, retry and stale-screen guard OK');
