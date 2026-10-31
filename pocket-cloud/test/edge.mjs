import assert from 'node:assert/strict';
const base=process.env.POCKET_CLOUD_TEST_URL||'http://127.0.0.1:8787';
async function create(name){
 const reply=await fetch(base+'/pocket-id/register',{method:'POST',headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({nickname:name,avatar:'ink'})});
 if(reply.status!==201)throw Error(await reply.text());
 return reply.headers.get('set-cookie').split(';')[0];
}
async function call(cookie,app,path,id=null,method='GET',body=null,headers={}){
 const u=new URL(base+'/pocket-cloud/'+path);u.searchParams.set('app',app);
 if(id)u.searchParams.set('id',id);
 const r=await fetch(u,{method,headers:{origin:base,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},
  ...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json()};
}
const nick=Date.now().toString(36);
const [a,b]=await Promise.all([create('CloudA'+nick),create('CloudB'+nick)]);
const doc={id:'page_1',title:'Lake',updatedAt:123,strokes:[[1,2,3]]};
const packed={baseRevision:0,updatedAt:123,title:'Lake',encoding:'json-base64',payload:Buffer.from(JSON.stringify(doc)).toString('base64')};
let result=await call(null,'folio','list');assert.equal(result.status,401);
result=await call(null,'folio','list',null,'GET',null,{'x-pw-account-id':'forged'});assert.equal(result.status,401);
result=await call(a,'vitrum','list');assert.equal(result.status,400);
result=await call(a,'folio','list');assert.equal(result.status,200);assert.equal(result.body.items.length,0);
result=await call(a,'folio','item','page_1','POST',packed);assert.equal(result.status,200,JSON.stringify(result.body));
assert.equal(result.body.item.revision,1);
const initialSize=Buffer.byteLength(packed.payload);
result=await call(null,'folio','usage');assert.equal(result.status,401,'Usage requires sign-in');
result=await call(a,'folio','usage');
assert.equal(result.status,200);
assert.equal(result.body.usedBytes,initialSize);
assert.equal(result.body.freeBytes,16_000_000-initialSize);
assert.equal(result.body.maxBytes,16_000_000);
assert.equal(result.body.maxItemBytes,1_000_000);
assert.equal(result.body.maxItems,160);
assert.equal(result.body.usedItems,1);
assert.equal(result.body.byApp.find(x=>x.app==='folio').usedBytes,initialSize);
assert.equal(result.body.byApp.find(x=>x.app==='zamazka').usedBytes,0);
assert.equal(result.body.items[0].title,'Lake');
assert.equal('payload' in result.body.items[0],false,'Usage only provides metadata');
result=await call(b,'folio','usage');
assert.equal(result.body.usedItems,0,'Usage must be isolated between accounts');
result=await call(a,'folio','usage',null,'POST',{});
assert.equal(result.status,405,'Usage is read-only');
result=await call(b,'folio','list');assert.equal(result.body.items.length,0,'Different Google user must be isolated');
result=await call(b,'folio','list',null,'GET',null,{'x-pw-expected-account':'11111111-1111-4111-8111-111111111111'});
assert.equal(result.status,409);assert.equal(result.body.error,'account_changed');
result=await call(a,'zamazka','list');assert.equal(result.body.items.length,0,'App namespaces are independent');
result=await call(a,'folio','item','page_1');assert.equal(result.status,200);
assert.deepEqual(JSON.parse(Buffer.from(result.body.payload,'base64').toString('utf8')),doc);
result=await call(a,'folio','item','page_1','POST',packed);assert.equal(result.status,409,'Stale writes must not overwrite');
const revised={...packed,baseRevision:1,title:'Lake 2'};
result=await call(a,'folio','item','page_1','POST',revised);
assert.equal(result.status,200);assert.equal(result.body.item.revision,2);
result=await call(a,'folio','item','page_1','DELETE',{baseRevision:1});
assert.equal(result.status,409);
result=await call(a,'folio','item','page_1','DELETE',{baseRevision:2});
assert.equal(result.status,200);assert.equal(result.body.revision,3);
result=await call(a,'folio','item','page_1');assert.equal(result.status,404);
result=await call(a,'folio','usage');assert.equal(result.body.usedBytes,0,'Tombstones do not use upload quota');
assert.equal(result.body.usedItems,0);
result=await call(a,'folio','list');assert.equal(result.body.items[0].deleted,true);
assert.equal(result.body.items[0].revision,3);
result=await call(a,'folio','item','page_1','POST',packed);assert.equal(result.status,409,'Tombstone must prevent stale resurrection');
result=await call(a,'folio','item','page_1','POST',{...packed,baseRevision:3});
assert.equal(result.status,200,'Explicit new version can restore a deleted document');
result=await call(a,'zamazka','item','emblem','POST',{...packed,title:'Личный знак'});
assert.equal(result.status,200);
result=await call(a,'folio','usage');
assert.equal(result.body.usedItems,2);
assert.equal(result.body.usedBytes,initialSize*2);
assert.equal(result.body.byApp.find(x=>x.app==='zamazka').items,1);
assert.equal(result.body.byApp.find(x=>x.app==='folio').items,1);
result=await call(a,'folio','item','bad/path','POST',packed);assert.equal(result.status,400);
result=await call(a,'folio','item','page_2','POST',packed,{'origin':'https://evil.invalid'});assert.equal(result.status,403);

const rating=(episode,tier,updatedAt)=>({
 type:'episode',number:episode,
 data:{rows:{S:tier==='S'?['hornyak']:[],A:tier==='A'?['hornyak']:[],B:[],C:[],D:[],F:[],'?':[]},notes:{hornyak:'Понравилась'},edited:updatedAt}
});
const encodeDoc=(document,baseRevision=0)=>({
 baseRevision,updatedAt:Date.now(),title:'Рейтинг серии '+document.number,
 encoding:'json-base64',payload:Buffer.from(JSON.stringify(document)).toString('base64')
});
const ep2=rating(2,'S',Date.now());
const ep3=rating(3,'A',Date.now());
result=await call(a,'rose-ranking-15','list');assert.equal(result.status,200);
assert.equal(result.body.items.length,0);
result=await call(a,'rose-ranking-15','item','episode-2','POST',encodeDoc(ep2));
assert.equal(result.status,200);
result=await call(a,'rose-ranking-15','item','episode-3','POST',encodeDoc(ep3));
assert.equal(result.status,200);
result=await call(b,'rose-ranking-15','list');
assert.equal(result.body.items.length,0,'Another Pocket ID cannot read account-owned rankings');
result=await call(a,'folio','list');
assert.equal(result.body.items.filter(x=>x.id.startsWith('episode-')).length,0,'Rankings must never appear in Folio');
const changed2=rating(2,'A',Date.now());
result=await call(a,'rose-ranking-15','item','episode-2','POST',encodeDoc(changed2,1));
assert.equal(result.status,200);assert.equal(result.body.item.revision,2);
result=await call(a,'rose-ranking-15','item','episode-3');
assert.equal(result.status,200);
assert.deepEqual(JSON.parse(Buffer.from(result.body.payload,'base64').toString('utf8')),ep3,
 'Updating episode 2 must never change episode 3');
result=await call(a,'rose-ranking-15','item','episode-2','POST',encodeDoc(ep2,1));
assert.equal(result.status,409,'Stale device write must be rejected');
result=await call(a,'rose-ranking-15','usage');
assert.equal(result.status,200);
assert.equal(result.body.byApp.find(x=>x.app==='rose-ranking-15').items,2);

console.log('PASS: Pocket Cloud isolated users, three app namespaces and separate episodes, revisions, safe deletes, tombstones, spoofing, same-origin');
