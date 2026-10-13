import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {insideDamage} from '../artworks.js';
import {pointOnDamageEdge} from '../editor.js';
import {paintPackets,sendPaintingPaced} from '../draft-transfer.js';

// An edge hit may be a fraction of a pixel outside the polygon (retina AA).
// Snap it just inward instead of leaving an unpaintable hairline on the cutout.
const zone={x:10,y:10,w:80,h:80,points:[[10,10],[90,10],[90,90],[10,90]]};
const near=pointOnDamageEdge(zone,[90.9,50],4);
assert.ok(near&&insideDamage(zone,near),'nib just outside may cover the right border');
assert.ok(near[0]<90&&near[0]>88,'nib stays close to the original edge');
assert.deepEqual(pointOnDamageEdge(zone,[20,25],4),[20,25],'interior painting untouched');
assert.equal(pointOnDamageEdge(zone,[108,50],4),null,'outside canvas does not affect artwork');
assert.equal(pointOnDamageEdge(zone,[94,50],0),null,'no arbitrary snapping when disabled');
const diagonal={x:0,y:0,w:50,h:40,points:[[5,5],[50,15],[40,40],[0,25]]};
assert.ok(insideDamage(diagonal,pointOnDamageEdge(diagonal,[50.8,17],4)),'non-axis-aligned torn border also reachable');

// 320 strokes become 40+ packets: old synchronous send hit PocketNet's
// 30/s socket limit in a burst and repeated forever. One scheduled upload
// must not exceed that window, nor silently omit any chunks.
const strokes=Array.from({length:320},(_,i)=>({c:'#324a43',s:12,t:'brush',p:[[i%100,Math.floor(i/100)*10],[i%100+1,Math.floor(i/100)*10+1]]}));
const data={type:'submit_chunk',round:1,art:3,variation:42,strokes};
const expected=paintPackets(data);
assert.ok(expected.length>30,'regression sends more than the old socket rate limit');
const sent=[];
const transfer=sendPaintingPaced(packet=>sent.push({packet,at:performance.now()}),data,{intervalMs:80});
assert.equal(sent.length,1,'first packet sends immediately, not as a synchronous burst');
await transfer.completion;
assert.equal(sent.length,expected.length);
assert.equal(new Set(sent.map(s=>s.packet.revision)).size,1,'all chunks share one revision');
assert.deepEqual(sent.map(s=>s.packet.index),Array.from({length:sent.length},(_,i)=>i),'parts remain in order');
for(let i=0;i<sent.length;i++){
 const windowEnd=sent[i].at+1000;
 assert.ok(sent.filter(s=>s.at>=sent[i].at&&s.at<windowEnd).length<25,'reserve rate budget for sync/presence and game traffic');
}
// Cancellation must stop stale backup chunks before a new final upload begins.
const cancel=new AbortController(),cancelled=[];
const abandoned=sendPaintingPaced(packet=>{
 cancelled.push(packet);if(cancelled.length===2)cancel.abort();
},data,{intervalMs:80,signal:cancel.signal});
await assert.rejects(abandoned.completion,/paint_transfer_cancelled/);
assert.equal(cancelled.length,2);
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(app,/activeSubmitTransfer\|\|Date\.now\(\)<submissionBackoffUntil/,'retries do not collide');
assert.match(app,/activeDraftTransfer\?\.abort\(\)/,'final submission cancels background backup');
assert.match(app,/code==='rate_limited'/,'rate-limit response pauses the uploader');
console.log('ZAMAZKA: edge nib snapping and throttled 320-stroke resumable upload OK');
