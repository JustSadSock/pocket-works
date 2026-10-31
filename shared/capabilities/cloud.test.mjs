import assert from 'node:assert/strict';
import {packCloudData,unpackCloudData,PocketCloudClient} from './cloud.js';
const doc={id:'folio-test',title:'Посреди моря',layers:[
 {id:'layer',strokes:[{tool:'fill',color:'#ffffff',runs:Array.from({length:250},(_,i)=>[i,0,100])}]}
],thumb:'data:image/png;base64,abcd'};
const compressed=await packCloudData(doc);
assert.ok(['gzip-base64','json-base64'].includes(compressed.encoding));
assert.equal(typeof compressed.payload,'string');
assert.deepEqual(await unpackCloudData(compressed),doc);
const raw=new TextEncoder().encode(JSON.stringify(doc));
assert.ok(compressed.payload.length<raw.length*1.5,'Compression unexpectedly larger than input');
assert.throws(()=>new PocketCloudClient('wrong'),/Invalid cloud app/);
assert.equal(new PocketCloudClient('folio').app,'folio');
assert.equal(new PocketCloudClient('rose-ranking-15').app,'rose-ranking-15');
console.log('PASS: FOLIO document gzip encoding/decoding, typed cloud clients');
