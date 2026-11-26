import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCrown,projectBanners} from './full-simulation-repeatability.mjs';
const crown=['coercive-subjugation','independence'].map(name=>({name,seed:'balance-20-2',days:1800,ms:10,samples:Array.from({length:5},(_,i)=>({day:(i+1)*360,ms:i,power:2})),wars:[]}));
const row={version:'chronicles-completion-v1',kind:'historical',result:{plannerMs:10,physicsMs:20,final:{time:120},trajectory:[{time:120}]}};
const summary={version:row.version,shard:0,count:8,expected:1,completed:1,groups:{original:0,independent:0,historical:1,antiquity:0,'final-integration':0,'numerical-superiority':0,performance:0}};
test('Crown removes only audited metrics and preserves nested gameplay and coverage',()=>{
 const x=projectCrown('balance-targeted-3.json',crown);assert.equal(x.count,2);assert.equal(x.metrics.length,2);assert.equal(x.semantic[0].samples[0].ms,0);assert.equal('ms' in x.semantic[0],false);
 assert.throws(()=>projectCrown('balance-targeted-3.json',crown.slice(1)),/coverage/);
 assert.throws(()=>projectCrown('balance-targeted-3.json',[{...crown[0],name:'other'},crown[1]]),/targeted/);
});
test('Banners validates complete ordered matrix and keeps gameplay values',()=>{
 const p=projectBanners([row],summary,['historical']);assert.equal(p.semantic[0].result.final.time,120);assert.equal(p.metrics.length,2);
 assert.throws(()=>projectBanners([row],summary,['original']),/group coverage/);
 assert.throws(()=>projectBanners([],summary,['historical']),/Incomplete/);
 assert.throws(()=>projectBanners([{...row,result:{...row.result,physicsMs:null}}],summary,['historical']),/Invalid runtime/);
});
