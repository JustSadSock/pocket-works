import test from 'node:test';
import assert from 'node:assert/strict';
import {AdmissionLimiter} from '../admission-limits.mjs';

test('session admission limits a single IP for 60 seconds with retry-after',()=>{
  const sessions=new AdmissionLimiter({limit:20,windowMs:60_000,maxKeys:10});
  for(let i=0;i<20;i++)assert.equal(sessions.check('203.0.113.10',1000).allowed,true);
  const denied=sessions.check('203.0.113.10',1000);
  assert.deepEqual(denied,{allowed:false,retryAfter:60,reason:'rate'});
  assert.equal(sessions.check('203.0.113.10',31_000).retryAfter,30);
  assert.equal(sessions.check('203.0.113.11',31_000).allowed,true,'independent IP remains accessible');
  assert.equal(sessions.check('203.0.113.10',61_000).allowed,true,'window rolls forward without manual reset');
});

test('WebSocket reconnects use a separate generous budget from session creation',()=>{
  const sessions=new AdmissionLimiter({limit:20});
  const sockets=new AdmissionLimiter({limit:120});
  for(let i=0;i<20;i++)sessions.check('192.0.2.3',100);
  assert.equal(sessions.check('192.0.2.3',100).allowed,false);
  for(let i=0;i<120;i++)assert.equal(sockets.check('192.0.2.3',100).allowed,true);
  assert.equal(sockets.check('192.0.2.3',100).allowed,false);
});

test('IP-churn cannot grow an unbounded table or evade active buckets',()=>{
  const gate=new AdmissionLimiter({limit:2,windowMs:1000,maxKeys:2});
  assert.equal(gate.check('198.51.100.1',0).allowed,true);
  assert.equal(gate.check('198.51.100.2',0).allowed,true);
  assert.equal(gate.check('198.51.100.3',0).allowed,false);
  assert.equal(gate.snapshot().activeBuckets,2);
  assert.equal(gate.check('198.51.100.1',0).allowed,true);
  assert.equal(gate.check('198.51.100.1',0).allowed,false);
  assert.equal(gate.check('198.51.100.3',999).allowed,false);
  assert.equal(gate.check('198.51.100.3',1000).allowed,true,'expired buckets are reclaimed at capacity');
  assert.equal(gate.snapshot().activeBuckets,1);
  assert.equal(gate.snapshot().rejections,3);
  assert.equal(JSON.stringify(gate.snapshot()).includes('198.51.100'),false,'health contains no IPs');
});

test('sweep discards expired counters and tolerates clock rollback',()=>{
  const gate=new AdmissionLimiter({limit:1,windowMs:1000,maxKeys:2});
  gate.check('alpha',2000);
  gate.check('beta',2500);
  assert.equal(gate.sweep(2600),2);
  assert.equal(gate.sweep(3000),1);
  assert.equal(gate.check('beta',1900).allowed,true,'clock rollback starts a fresh window');
  assert.equal(gate.sweep(3000),0);
});

test('missing or oversized IP input shares a bounded conservative bucket',()=>{
  const gate=new AdmissionLimiter({limit:1,maxKeys:2});
  assert.equal(gate.check(null,100).allowed,true);
  assert.equal(gate.check('x'.repeat(100),100).allowed,false);
  assert.equal(gate.snapshot().activeBuckets,1);
});

test('invalid limiter configuration is rejected',()=>{
  for(const options of [{limit:0},{limit:20,maxKeys:0},{limit:2,windowMs:0},{}])
    assert.throws(()=>new AdmissionLimiter(options),TypeError);
});
