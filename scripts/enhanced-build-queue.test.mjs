import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildInBatches} from './enhanced-build-queue.mjs';

test('parallel batches run at most requested number and cover every app once',async()=>{
 const items=Array.from({length:9},(_,i)=>({slug:'app-'+i}));
 let active=0,peak=0;const visited=[];
 await buildInBatches(items,2,async item=>{
  active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setImmediate(resolve));
  visited.push(item.slug);active--;
 });
 assert.equal(peak,2);
 assert.deepEqual(visited.sort(),items.map(x=>x.slug).sort());
});
test('serial override never overlaps app builds',async()=>{
 let active=0,peak=0;
 await buildInBatches([{slug:'a'},{slug:'b'},{slug:'c'}],1,async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;});
 assert.equal(peak,1);
});
test('one failed build prevents publication and later app starts',async()=>{
 const visited=[];
 await assert.rejects(buildInBatches([{slug:'a'},{slug:'b'},{slug:'c'}],2,async app=>{
  visited.push(app.slug);
  if(app.slug==='b')throw Error('synthetic vite failure');
 }),/Enhanced build failed for b/);
 assert.deepEqual(visited,['a','b']);
});
test('unsafe concurrency values are rejected before doing any work',async()=>{
 for(const n of [0,-1,1.5,8,NaN])await assert.rejects(buildInBatches([],n,async()=>{}),/integer from 1 to 4/);
});
