import test from 'node:test';
import assert from 'node:assert/strict';
import {measureRun,aggregate,collect} from './live-observatory.mjs';
const repo='JustSadSock/pocket-works',at=n=>new Date(1800000000000+n*1000).toISOString();
const run={id:1,run_attempt:2,status:'completed',repository:{full_name:repo},path:'.github/workflows/universal-qa.yml',head_branch:'app/banners-of-war',conclusion:'success',created_at:at(0),run_started_at:at(3),updated_at:at(30)};
const job=(id,over={})=>({id,run_id:1,run_attempt:2,status:'completed',conclusion:'success',name:'candidate / cpu (cpu-plain-001)',started_at:at(5),completed_at:at(25),...over});
test('parallel runner time, queue proxy and invalid skipped timestamps are separate',()=>{
 const r=measureRun(run,[job(1),job(2),job(3,{conclusion:'skipped',started_at:at(5),completed_at:at(4)})],'universal-qa.yml');
 assert.equal(r.wallMs,27000);assert.equal(r.initialQueueMs,3000);assert.equal(r.runnerMs,40000);assert.equal(r.skippedJobs,1);assert.equal(r.cpuShard.count,2);
 const x=measureRun({...run,conclusion:'cancelled'},[job(1,{conclusion:'cancelled',completed_at:null})],'universal-qa.yml');
 assert.equal(x.runnerMs,null);assert.equal(x.unmeasuredJobs,1);assert.equal(aggregate([r,x]).length,2);
});
test('invalid, duplicate, wrong attempt or wrong workflow metadata reject',()=>{
 assert.throws(()=>measureRun(run,[job(1),job(1)],'universal-qa.yml'),/Incomplete/);
 assert.throws(()=>measureRun(run,[job(1,{run_attempt:1})],'universal-qa.yml'),/identity/);
 assert.throws(()=>measureRun(run,[job(1)],'validate.yml'),/unexpected/);
});
test('collect paginates job attempts, reports unavailable records and bounds sample',()=>{
 const calls=[];
 const fetch=(path,paginate)=>{calls.push([path,paginate]);if(path.includes('/jobs?'))return [{total_count:2,jobs:[job(1)]},{total_count:2,jobs:[job(2)]}];return {workflow_runs:path.includes('universal-qa.yml')?[run]:[]};};
 const r=collect({now:1800000030000,limit:1,fetch});
 assert.equal(r.runs.length,1);assert.equal(r.runs[0].runnerMs,40000);assert.equal(r.samples[0].possiblyTruncated,true);
 assert.ok(calls.some(([p,b])=>p.includes('/attempts/2/jobs')&&b===true));
 const bad=collect({now:1800000030000,fetch:(p,b)=>b?[{total_count:3,jobs:[job(1)]}]:fetch(p,b)});
 assert.equal(bad.runs.length,0);assert.equal(bad.errors.length,1);
});
