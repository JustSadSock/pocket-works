import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shouldCaptureCover,scoreCoverMetrics,chooseCover,parseVisionDecision,safeRevision} from './cover-intelligence.mjs';

const old='b'.repeat(40),fresh='a'.repeat(40);
test('revision changes and missing assets recapture; current images do not',()=>{
  assert.equal(shouldCaptureCover({exists:true,revision:old,record:{revision:old}}),false);
  assert.equal(shouldCaptureCover({exists:true,revision:fresh,record:{revision:old}}),true);
  assert.equal(shouldCaptureCover({exists:false,revision:old,record:{revision:old}}),true);
  assert.equal(shouldCaptureCover({exists:true,revision:old,record:{revision:old,pinned:true}}),false);
  assert.equal(shouldCaptureCover({exists:true,revision:old,record:{revision:old,pinned:true},forced:true}),true);
});
test('failed captures pause briefly then retry',()=>{
 const now=Date.parse('2026-10-13T12:00:00Z');
 const record={revision:old,status:'rejected',lastAttemptRevision:fresh,lastAttemptAt:'2026-10-13T11:00:00Z'};
 assert.equal(shouldCaptureCover({exists:true,revision:fresh,record,now}),false);
 assert.equal(shouldCaptureCover({exists:true,revision:fresh,record,now:now+49*60*60*1000}),true);
});
test('reject blank and washed-out images',()=>{
 const empty=scoreCoverMetrics({variance:0,entropy:0,meanLight:0,bytes:12000});
 assert.equal(empty.pass,false);
 const detailed=scoreCoverMetrics({variance:43,entropy:5.2,edgeDensity:.09,colorfulness:42,centerDetail:48,meanLight:130,bytes:35000});
 assert.equal(detailed.pass,true);
 assert.ok(detailed.score>empty.score);
});
test('protect existing cover and reject a bad new candidate',()=>{
 const good={quality:{pass:true,score:84}};
 const poor={quality:{pass:true,score:30}};
 assert.equal(chooseCover([poor,good]).chosen,good);
 assert.equal(chooseCover([poor],{previousScore:85}).chosen,null);
 assert.equal(chooseCover([{quality:{pass:false,score:90}}]).chosen,null);
});
test('strict AI response parsing and valid frame indexes',()=>{
 assert.deepEqual(parseVisionDecision('{"best":1,"scores":[70,91],"reject":[0]}',2),{best:1,scores:[70,91],rejected:[0]});
 assert.equal(parseVisionDecision('{"best":8,"scores":[70,91]}',2),null);
 assert.equal(safeRevision('a'.repeat(40)),'a'.repeat(40));
 assert.equal(safeRevision('../../abc'),null);
});
