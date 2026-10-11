import assert from 'node:assert/strict';
import {createFolioCloudSync} from './cloud-sync.js';

const identity={id:'11111111-1111-4111-8111-111111111111',nickname:'Creator',avatar:'moss',complete:true,updatedAt:1};
const cloud=new Map();
let storage=new Map();
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function localStorageOf(map){
 return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
Object.defineProperties(globalThis,{
 location:{value:{origin:'http://127.0.0.1:8787',assign(){}},configurable:true},
 navigator:{value:{onLine:true},configurable:true},
 window:{value:{addEventListener(){}},configurable:true},
 document:{value:{querySelector(q){return q==='#folio-cloud-status'?status:button}},configurable:true},
 confirm:{value:()=>true,configurable:true},
 localStorage:{get(){return localStorageOf(storage)},configurable:true}
});
const status={textContent:'',dataset:{}},button={disabled:false,textContent:'',addEventListener(){}};
globalThis.fetch=async(input,options={})=>{
 const url=new URL(String(input),location.origin);
 if(url.pathname==='/pocket-id/me')return response({user:identity});
 assert.equal(options.headers['x-pw-expected-account'],identity.id);
 const app=url.searchParams.get('app'),id=url.searchParams.get('id');
 assert.equal(app,'folio');
 if(url.pathname.endsWith('/list')){
  return response({items:[...cloud.values()].map(x=>x.item)});
 }
 const old=cloud.get(id),method=options.method||'GET';
 if(method==='GET'){
  if(!old||old.item.deleted)return response({error:'not_found'},404);
  return response({...old});
 }
 const body=JSON.parse(options.body);
 if(body.baseRevision!==(old?.item.revision||0))return response({error:'revision_conflict'},409);
 if(method==='DELETE'){
  const item={...old.item,revision:old.item.revision+1,deleted:true,bytes:0};
  cloud.set(id,{item});return response({ok:true,revision:item.revision});
 }
 const item={id,app:'folio',title:body.title,revision:(old?.item.revision||0)+1,
  updatedAt:body.updatedAt,deleted:false};
 cloud.set(id,{item,encoding:body.encoding,payload:body.payload});
 return response({ok:true,item});
};
function makeDevice(){
 const docs=new Map(),store=new Map();let refresh=0;
 return {
  docs,store,
  async sync(){
   storage=store;
   const sync=this.controller||(this.controller=createFolioCloudSync({
    loadWorks:async()=>[...docs.values()],
    putWork:async doc=>{docs.set(doc.id,structuredClone(doc))},
    removeWork:async id=>{docs.delete(id)},
    getOpenId:()=>null,
    onUpdate:async()=>{refresh++},
    notify:msg=>{throw Error('Unexpected notification '+msg)}
   }));
   await sync.sync();
  },
  get refresh(){return refresh}
 };
}
const doc=(id,title,time)=>({id,title,updatedAt:time,width:100,height:100,layers:[{id:'layer',strokes:[]}],thumb:''});
const a=makeDevice(),b=makeDevice();
a.docs.set('draw_1',doc('draw_1','Первый рисунок',1000));
await a.sync();
assert.equal(cloud.get('draw_1').item.revision,1);
await b.sync();
assert.equal(b.docs.get('draw_1').title,'Первый рисунок');
a.docs.set('draw_1',doc('draw_1','Обновлено A',3000));await a.sync();
assert.equal(cloud.get('draw_1').item.revision,2);
b.docs.set('draw_1',doc('draw_1','Одновременный рисунок B',4000));await b.sync();
assert.equal(b.docs.size,2,'Keep a fork of the independently edited B document');
assert.equal(b.docs.get('draw_1').title,'Обновлено A');
assert.ok([...b.docs.values()].some(d=>d.title.includes('локальная версия')));
assert.equal(cloud.size,2);
b.docs.delete('draw_1');await b.sync();
assert.equal(cloud.get('draw_1').item.deleted,true);
await a.sync();
assert.equal(a.docs.has('draw_1'),false,'A sees deletion and keeps separate conflict fork');
assert.equal(a.docs.size,1);
console.log('PASS: FOLIO two devices upload/download, concurrent fork, deletion tombstone, second-device restore');
