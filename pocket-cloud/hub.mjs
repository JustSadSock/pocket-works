// Pocket Cloud stage B: per-account SQLite Durable Object, no external storage setup.
// Each account gets an isolated object; the Worker edge authenticates the cookie.
const MAX_ITEM_BYTES=1_000_000;
const MAX_USER_BYTES=16_000_000;
const MAX_ROWS=160;
const allowedApps=new Set(['folio','zamazka','rose-ranking-15']);
const encoder=new TextEncoder();
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s);
export class PocketCloud {
 constructor(ctx,env){
  this.ctx=ctx;
  this.sql=ctx.storage.sql;
  this.sql.exec(`CREATE TABLE IF NOT EXISTS items (
    app TEXT NOT NULL,
    id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    encoding TEXT NOT NULL DEFAULT 'json',
    payload TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(app,id)
  )`);
  this.sql.exec('CREATE INDEX IF NOT EXISTS cloud_listing ON items(app,modified_at)');
 }
 one(q,...a){return this.sql.exec(q,...a).toArray()[0]||null}
 meta(row){return {id:row.id,app:row.app,title:row.title,revision:row.revision,updatedAt:row.updated_at,
   modifiedAt:row.modified_at,deleted:Boolean(row.deleted),bytes:row.bytes};}
 async fetch(request){
  const url=new URL(request.url);
  if(!request.headers.get('x-pw-account-id'))return json({error:'unauthorized'},401);
  const path=url.pathname;
  if(!['GET','POST','DELETE'].includes(request.method))return json({error:'method_not_allowed'},405);
  if(request.method!=='GET'){
   if(request.headers.get('origin')!==url.origin ||
      request.headers.get('content-type')?.split(';')[0]!=='application/json')
     return json({error:'origin_or_content_type_denied'},403);
  }
  // One authenticated summary across every app; no client-provided account ID is trusted.
  // Fetch only metadata, never the saved document payloads.
  if(path==='/pocket-cloud/usage'){
   if(request.method!=='GET')return json({error:'method_not_allowed'},405);
   const rows=this.sql.exec('SELECT app,id,title,bytes FROM items WHERE deleted=0 ORDER BY bytes DESC,app,id').toArray();
   const usedBytes=rows.reduce((total,row)=>total+row.bytes,0);
   const byApp=[...allowedApps].map(app=>{
    const own=rows.filter(row=>row.app===app);
    return {app,usedBytes:own.reduce((total,row)=>total+row.bytes,0),items:own.length};
   });
   return json({
    usedBytes,freeBytes:Math.max(0,MAX_USER_BYTES-usedBytes),maxBytes:MAX_USER_BYTES,
    maxItemBytes:MAX_ITEM_BYTES,usedItems:rows.length,maxItems:MAX_ROWS,
    byApp,items:rows.map(({app,id,title,bytes})=>({app,id,title,bytes}))
   });
  }
  const app=url.searchParams.get('app'),id=url.searchParams.get('id');
  if(!allowedApps.has(app))return json({error:'unsupported_app'},400);
  if(path==='/pocket-cloud/list'&&request.method==='GET'){
   const rows=this.sql.exec('SELECT app,id,title,revision,updated_at,modified_at,deleted,bytes FROM items WHERE app=? ORDER BY modified_at DESC',app).toArray();
   const total=this.one('SELECT COALESCE(SUM(bytes),0) AS used FROM items WHERE deleted=0')?.used||0;
   return json({items:rows.map(r=>this.meta(r)),usedBytes:total,maxBytes:MAX_USER_BYTES,maxItemBytes:MAX_ITEM_BYTES});
  }
  if(path!=='/pocket-cloud/item'||!validId(id))return json({error:'invalid_item'},400);
  const old=this.one('SELECT * FROM items WHERE app=? AND id=?',app,id);
  if(request.method==='GET'){
   if(!old||old.deleted)return json({error:'not_found'},404);
   return json({item:this.meta(old),encoding:old.encoding,payload:old.payload});
  }
  const raw=await request.text();
  if(encoder.encode(raw).length>1_400_000)return json({error:'item_too_large'},413);
  let body;
  try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
  const expected=body?.baseRevision;
  if(!Number.isInteger(expected)||expected<0)return json({error:'invalid_revision'},400);
  if((old?.revision||0)!==expected)return json({error:'revision_conflict',item:old?this.meta(old):null},409);
  if(request.method==='DELETE'){
   if(!old)return json({ok:true,revision:0});
   this.sql.exec("UPDATE items SET deleted=1,payload='',bytes=0,revision=revision+1,modified_at=? WHERE app=? AND id=?",
     Date.now(),app,id);
   return json({ok:true,revision:old.revision+1});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const {payload,encoding,title,updatedAt}=body||{};
  if(typeof payload!=='string'|| !['gzip-base64','json-base64'].includes(encoding) ||
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(payload)||
    typeof title!=='string'||title.length>100||
    !Number.isFinite(updatedAt)||updatedAt<0||updatedAt>Date.now()+86400_000)
    return json({error:'invalid_payload'},400);
  const size=encoder.encode(payload).length;
  if(size>MAX_ITEM_BYTES)return json({error:'item_too_large',maxItemBytes:MAX_ITEM_BYTES},413);
  if((!old||old.deleted)&&this.one('SELECT COUNT(*) AS n FROM items WHERE deleted=0')?.n>=MAX_ROWS)
    return json({error:'item_limit',maxItems:MAX_ROWS},413);
  const used=this.one('SELECT COALESCE(SUM(bytes),0) AS used FROM items WHERE deleted=0')?.used||0;
  if(used-(old?.deleted?0:old?.bytes||0)+size>MAX_USER_BYTES)
    return json({error:'quota_exceeded',maxBytes:MAX_USER_BYTES},413);
  const now=Date.now();
  this.sql.exec(`INSERT INTO items(app,id,title,revision,updated_at,modified_at,deleted,bytes,encoding,payload)
    VALUES(?,?,?,?,?,?,0,?,?,?)
    ON CONFLICT(app,id) DO UPDATE SET title=excluded.title,revision=excluded.revision,
    updated_at=excluded.updated_at,modified_at=excluded.modified_at,deleted=0,
    bytes=excluded.bytes,encoding=excluded.encoding,payload=excluded.payload`,
    app,id,title,(old?.revision||0)+1,updatedAt,now,size,encoding,payload);
  return json({ok:true,item:this.meta(this.one('SELECT * FROM items WHERE app=? AND id=?',app,id))});
 }
}
