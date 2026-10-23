import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSubmission,validPending,canRetry,isSafeReceipt,outgoingPacket} from '../submission-guard.js';
test('durable pending intent retains original request ID across retries',()=>{
 const p=makeSubmission({round:8,sheetId:'sheet-1',answer:'Панда забула свій капелюх під столом',
  tailIndexes:[0,1,4],gender:'unspecified',heroAnchor:'Панда',requestId:'retry_abcdefgh1234',draftStorageKey:'draft:room:8:sheet-1'});
 assert.equal(validPending(p),true);
 const packet=outgoingPacket(p);
 assert.equal(packet.requestId,p.requestId);
 assert.equal('draftStorageKey' in packet,false);
 assert.equal(canRetry(p,{phase:'writing',waiting:false,round:8,sheet:{id:'sheet-1'}}),true);
 assert.equal(canRetry(p,{phase:'writing',waiting:true,round:8,sheet:{id:'sheet-1'}}),false);
 assert.equal(canRetry(p,{phase:'writing',waiting:false,round:9,sheet:{id:'sheet-1'}}),false);
 assert.equal(canRetry(p,{phase:'finished',waiting:false,round:8,sheet:{id:'sheet-1'}}),false);
 assert.equal(isSafeReceipt({requestId:p.requestId,accepted:true},p),true);
 assert.equal(isSafeReceipt({requestId:'other',accepted:true},p),false);
 assert.equal(isSafeReceipt({requestId:p.requestId,accepted:false},p),false);
 assert.deepEqual(p.tailIndexes,[0,1,4]);
});
test('invalid/malformed pending records can never trigger automatic resend',()=>{
 assert.equal(validPending({type:'submit',requestId:'invalid',round:0,sheetId:'a',answer:'ok',tailIndexes:[],draftStorageKey:'x'}),false);
 assert.equal(validPending(null),false);
});
