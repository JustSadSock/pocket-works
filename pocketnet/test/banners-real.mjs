import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {writeFileSync,readFileSync} from 'node:fs';
const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787',prefix='/pocketnet/banners/';
async function request(cookie,path,p,extra={}){let r=await fetch(base+prefix+path,{method:p===undefined?'GET':'POST',headers:{origin:base,...(cookie?{cookie}:{}),...(p!==undefined?{'content-type':'application/json'}:{}),...extra},...(p!==undefined?{body:JSON.stringify(p)}:{})});return {status:r.status,data:await r.json()}}
async function ok(cookie,path,p){let r=await request(cookie,path,p);assert.ok(r.status===200||r.status===201,JSON.stringify(r));return r.data}
async function register(name){let r=await fetch(base+'/pocket-id/register',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({nickname:name,avatar:'moss'})});assert.equal(r.status,201,await r.clone().text());return r.headers.get('set-cookie').split(';')[0]}
async function wait(cookie,id,phase,timeout=60000){let until=Date.now()+timeout;while(Date.now()<until){let r=await ok(cookie,id+'/view');if(phase.includes(r.phase))return r;await sleep(250)}throw Error('wait timeout: '+phase)}
async function act(cookie,id,type,p={}){let v=await ok(cookie,id+'/view');return ok(cookie,id+'/action',{type,seq:v.nextSeq,...p})}
async function start(a,b,opts){let v=await ok(a,'rooms',opts),id=v.id;await ok(b,id+'/join',{});await Promise.all([act(a,id,'accept',{checksum:v.checksum}),act(b,id,'accept',{checksum:v.checksum})]);return id}
async function finishRound(a,b,id,round){await Promise.all([act(a,id,'ready',{round,orders:{}}),act(b,id,'ready',{round,orders:{}})]);let v=await wait(a,id,['replay','finished']);if(v.phase==='replay'){await Promise.all([act(a,id,'replay_done',{round}),act(b,id,'replay_done',{round})]);return wait(a,id,['planning'])}return v}
for(let n=0;n<100;n++){try{let r=await fetch(base+'/pocket-id/config');if(r.ok)break}catch{}if(n===99)throw Error('worker unavailable');await sleep(300)}
if(process.argv.includes('--resume')){
 let {a,b,id,lockedId}=JSON.parse(readFileSync('/tmp/banners-resume.json','utf8')),v=await ok(a,id+'/view');
 assert.equal(v.round,2);assert.equal(v.phase,'planning');assert.equal((await finishRound(a,b,id,2)).round,3);assert.equal((await finishRound(a,b,id,3)).phase,'finished');
 const restored=await wait(a,lockedId,['replay','finished']);
 assert.equal(restored.completed,1);
 assert.equal(restored.phase,'replay');
 const replay=await ok(a,lockedId+'/round?n=1');
 assert.deepEqual(Object.keys(replay).sort(),['frames','number']);
 await Promise.all([act(a,lockedId,'replay_done',{round:1}),act(b,lockedId,'replay_done',{round:1})]);
 assert.equal((await wait(a,lockedId,['planning'])).round,2);
 assert.equal((await finishRound(a,b,lockedId,2)).round,3);
 assert.equal((await finishRound(a,b,lockedId,3)).phase,'finished');
 const full=await ok(a,lockedId+'/round?n=1');
 console.log('Banners restart after ready: exact completed round; local compute ms',full.computeMs,'full replay bytes',Buffer.byteLength(JSON.stringify(full)),'frames',full.frames.length);
 console.log('Banners restored after Wrangler restart');process.exit(0)
}
let suffix=Date.now().toString(36),a=await register('WarA'+suffix),b=await register('WarB'+suffix),c=await register('WarC'+suffix);
assert.equal((await request(null,'rooms',undefined,{'x-pw-account-id':'ffffffff-ffff-ffff-ffff-ffffffffffff'})).status,401);
let id=await start(a,b,{seconds:90,planSeconds:0,landscape:'flat',fog:true}),A=await ok(a,id+'/view');assert.equal((await request(c,id+'/view')).status,403);assert.equal((await request(c,id+'/join',{})).status,400);assert.equal((await request(a,id+'/action',{type:'draft',seq:A.nextSeq,round:1,orders:{100:{kind:'move',path:[]}}})).status,400);
let p={type:'draft',seq:A.nextSeq,round:1,orders:{0:{kind:'advance',path:[{x:711.123,y:412.456}]}}};await ok(a,id+'/action',p);await ok(a,id+'/action',p);let own=await ok(a,id+'/view'),enemy=await ok(b,id+'/view');assert.equal(own.nextSeq,A.nextSeq+1);assert.ok(!JSON.stringify(enemy).includes('711.123'));assert.deepEqual(enemy.draft,{});await Promise.all([act(a,id,'ready',{round:1,orders:own.draft}),act(b,id,'ready',{round:1,orders:{}})]);assert.equal((await wait(b,id,['replay'])).completed,1);assert.deepEqual(Object.keys(await ok(b,id+'/round?n=1')).sort(),['frames','number']);await Promise.all([act(a,id,'replay_done',{round:1}),act(b,id,'replay_done',{round:1})]);await wait(a,id,['planning']);assert.equal((await ok(a,id+'/join',{})).round,2);assert.ok((await ok(a,'rooms')).rooms.some(r=>r.id===id));assert.equal((await finishRound(a,b,id,2)).round,3);assert.equal((await finishRound(a,b,id,3)).phase,'finished');assert.ok((await ok(b,id+'/round?n=1')).orders);
let timed=await start(a,b,{seconds:30,planSeconds:30,landscape:'flat',fallback:'hold',fog:true});assert.equal((await wait(a,timed,['finished'],75000)).completed,1);console.log('Banners server deadline completed unattended match');
let pending=await start(a,b,{seconds:90,mode:'correspondence',planSeconds:0,landscape:'flat',fog:true});assert.equal((await finishRound(a,b,pending,1)).round,2);
let lockedId=await start(a,b,{seconds:90,mode:'correspondence',planSeconds:0,landscape:'flat',fog:true}),first=await ok(a,lockedId+'/view');
let ready={type:'ready',seq:first.nextSeq,round:1,orders:{}};
let settled=await Promise.all([ok(a,lockedId+'/action',ready),ok(a,lockedId+'/action',ready),act(b,lockedId,'ready',{round:1,orders:{}})]);
assert.ok(settled.some(v=>v.phase==='locked'||v.phase==='replay'));
writeFileSync('/tmp/banners-resume.json',JSON.stringify({a,b,id:pending,lockedId}),{mode:0o600});
console.log('Banners full live match, unauthorized requests, private frames, timeout, duplicate ready and restart fixtures passed');
