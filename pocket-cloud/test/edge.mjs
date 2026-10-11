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
result=await call(a,'folio','list');assert.equal(result.body.items[0].deleted,true);
assert.equal(result.body.items[0].revision,3);
result=await call(a,'folio','item','page_1','POST',packed);assert.equal(result.status,409,'Tombstone must prevent stale resurrection');
result=await call(a,'folio','item','page_1','POST',{...packed,baseRevision:3});
assert.equal(result.status,200,'Explicit new version can restore a deleted document');
result=await call(a,'folio','item','bad/path','POST',packed);assert.equal(result.status,400);
result=await call(a,'folio','item','page_2','POST',packed,{'origin':'https://evil.invalid'});assert.equal(result.status,403);
console.log('PASS: Pocket Cloud isolated users, two app namespaces, revisions, safe deletes, tombstones, spoofing, same-origin');
