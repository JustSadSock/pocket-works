import {createMatch,joinMatch,mutateMatch,tickMatch,resolveLocked,viewMatch,viewRound,roomSummary,MAX_BODY,ENGINE} from './banners-match.mjs';
const CODE=/^[0-9a-f]{16}$/i,ACCOUNT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const failure=e=>json({error:String(e?.message||e).slice(0,180)},String(e?.message).includes("not_member")?403:400);
async function body(req){let length=Number(req.headers.get("content-length")||0);if(length>MAX_BODY)throw Error("body_too_large");let reader=req.body?.getReader();if(!reader)return {};let parts=[],size=0;while(true){let {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw Error("body_too_large")}parts.push(value)}let bytes=new Uint8Array(size),at=0;for(let p of parts){bytes.set(p,at);at+=p.byteLength}try{return JSON.parse(new TextDecoder().decode(bytes)||"{}")}catch{throw Error("invalid_json")}}
const userFrom=r=>({id:r.headers.get("x-pw-account-id"),name:r.headers.get("x-pw-account-name")||"Командир"});
const DAY=86400000,MAX_ROOMS=24,MAX_ROW=1900000;
const encode=v=>{let s=JSON.stringify(v);if(new TextEncoder().encode(s).byteLength>MAX_ROW)throw Error("state_budget_exceeded");return s};
export class BannersMatchRoom{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.tail=Promise.resolve();let sql=ctx.storage.sql;sql.exec("CREATE TABLE IF NOT EXISTS battle_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)");sql.exec("CREATE TABLE IF NOT EXISTS battle_rounds (number INTEGER PRIMARY KEY,value TEXT NOT NULL)");sql.exec("CREATE TABLE IF NOT EXISTS battle_index (id TEXT PRIMARY KEY,created INTEGER NOT NULL)")}
 run(fn){let result=this.tail.then(fn,fn);this.tail=result.catch(()=>{});return result}
 read(){let r=this.ctx.storage.sql.exec("SELECT value FROM battle_meta WHERE key='match'").toArray()[0];return r?JSON.parse(r.value):null}
 write(m,row=null){let data=encode(m),history=row?encode(row):null;this.ctx.storage.transactionSync(()=>{this.ctx.storage.sql.exec("INSERT OR REPLACE INTO battle_meta(key,value) VALUES ('match',?)",data);if(row)this.ctx.storage.sql.exec("INSERT INTO battle_rounds(number,value) VALUES (?,?)",row.number,history)})}
 async schedule(m){if(m.phase==="locked")await this.ctx.storage.setAlarm(Date.now()+10);else if(m.deadline!==null)await this.ctx.storage.setAlarm(Math.max(Date.now()+10,m.deadline));else await this.ctx.storage.deleteAlarm()}
 async commit(m,row=null){await this.schedule(m);this.write(m,row)}
 async advance(m,now){if(m.engine!==ENGINE)return false;if(tickMatch(m,now)){await this.commit(m);return true}return false}
 async alarm(){return this.run(async()=>{let m=this.read();if(!m)return;let now=Date.now();if(m.engine!==ENGINE)return;if(m.phase==="locked"){let row=resolveLocked(m,now);await this.commit(m,row);return}if(tickMatch(m,now)){await this.commit(m);return}await this.schedule(m)})}
 async fetch(req){return this.run(async()=>{try{let u=userFrom(req),url=new URL(req.url),action=url.pathname.split("/").at(-1);if(!ACCOUNT.test(u.id||""))return json({error:"sign_in_required"},401);let now=Date.now();
  if(action==="index"){if(req.method==="GET")return json({rooms:this.ctx.storage.sql.exec("SELECT id FROM battle_index ORDER BY created DESC").toArray().map(r=>r.id)});if(req.method!=="POST")return json({error:"method"},405);let p=await body(req);if(!CODE.test(p.id||""))throw Error("invalid_room");let list=this.ctx.storage.sql.exec("SELECT id FROM battle_index").toArray();if(p.remove){this.ctx.storage.sql.exec("DELETE FROM battle_index WHERE id=?",p.id);return json({ok:true})}if(!list.some(r=>r.id===p.id)&&list.length>=MAX_ROOMS)throw Error("room_index_full");this.ctx.storage.sql.exec("INSERT OR REPLACE INTO battle_index(id,created) VALUES (?,?)",p.id,now);return json({ok:true})}
  let m=this.read(),id=req.headers.get("x-pw-banners-room");if(!CODE.test(id||""))throw Error("invalid_room");
  if(action==="create"&&req.method==="POST"){if(m)throw Error("room_exists");let p=await body(req);m=await createMatch(u,p,now,id);await this.commit(m);return json(viewMatch(m,u,now,{terrain:true}),201)}
  if(!m)return json({error:"room_not_found"},404);
  if(action==="join"&&req.method==="POST"){joinMatch(m,u,now);await this.commit(m);return json(viewMatch(m,u,now,{terrain:true}))}
  if(!m.players.some(p=>p?.id===u.id))return json({error:"not_member"},403);
  if(action==="summary"&&req.method==="GET")return json(roomSummary(m,u));
  if(action==="round"&&req.method==="GET"){let n=Number(url.searchParams.get("n"));if(!Number.isInteger(n)||n<1||n>m.completed)throw Error("round_unavailable");let row=this.ctx.storage.sql.exec("SELECT value FROM battle_rounds WHERE number=?",n).toArray()[0];if(!row)throw Error("round_unavailable");return json(viewRound(m,u,JSON.parse(row.value)))}
  if(action==="view"&&req.method==="GET"){await this.advance(m,now);return json(viewMatch(m,u,now,{terrain:url.searchParams.get("terrain")==="1"}))}
  if(action==="action"&&req.method==="POST"){let p=await body(req);await this.advance(m,now);let changed=mutateMatch(m,u,p,now);if(changed)await this.commit(m);return json(viewMatch(m,u,now))}
  return json({error:"not_found"},404)
 }catch(e){return failure(e)}})}
}
function newCode(){let a=crypto.getRandomValues(new Uint8Array(8));return [...a].map(v=>v.toString(16).padStart(2,"0")).join("")}
export async function handleBanners(request,env){const url=new URL(request.url);if(request.method!=="GET"&&request.method!=="POST")return json({error:"method"},405);if(request.method==="POST"&&(request.headers.get("origin")!==url.origin||!request.headers.get("content-type")?.startsWith("application/json")))return json({error:"origin_or_content_type_denied"},403);
 let user;try{let service=env.POCKET_ID.get(env.POCKET_ID.idFromName("pocket-id-global-v1")),r=await service.fetch(new Request(new URL("/pocket-id/me",url),{headers:{cookie:request.headers.get("cookie")||""}}));if(!r.ok)return json({error:"identity_unavailable"},503);user=(await r.json()).user}catch{return json({error:"identity_unavailable"},503)}
 if(!user?.complete||!ACCOUNT.test(user.id||""))return json({error:"sign_in_required"},401);
 const headers=new Headers({"x-pw-account-id":user.id,"x-pw-account-name":String(user.nickname||"Командир"),"content-type":"application/json"});
 const ns=env.BANNERS_MATCHES;if(!ns)return json({error:"network_preview_unavailable"},503);
 const index=ns.get(ns.idFromName("account:"+user.id)),callIndex=(method,p)=>index.fetch(new Request("https://banners.internal/index",{method,headers,...(p?{body:JSON.stringify(p)}:{})}));
 const roomCall=(id,action,method,p,query="")=>{let h=new Headers(headers);h.set("x-pw-banners-room",id);return ns.get(ns.idFromName("room:"+id)).fetch(new Request("https://banners.internal/"+action+query,{method,headers:h,...(p!==undefined?{body:JSON.stringify(p)}:{})}))};
 try{let parts=url.pathname.slice("/pocketnet/banners/".length).split("/");
  if(parts[0]==="rooms"&&parts.length===1&&request.method==="GET"){let r=await callIndex("GET");if(!r.ok)return r;let {rooms}=await r.json();let list=await Promise.all(rooms.map(async id=>{try{let r=await roomCall(id,"summary","GET");return r.ok?await r.json():{id,unavailable:true}}catch{return {id,unavailable:true}}}));return json({rooms:list,engine:ENGINE})}
  if(parts[0]==="rooms"&&parts.length===1&&request.method==="POST"){let p=await body(request),id=newCode(),reserved=await callIndex("POST",{id});if(!reserved.ok)return reserved;try{let r=await roomCall(id,"create","POST",p);if(!r.ok)await callIndex("POST",{id,remove:true});return r}catch(e){await callIndex("POST",{id,remove:true});throw e}}
  let id=parts[0].toLowerCase(),action=parts[1]||"view";if(!CODE.test(id)||parts.length>2)return json({error:"invalid_room"},400);
  if(action==="join"&&request.method==="POST"){let reserved=await callIndex("POST",{id});if(!reserved.ok)return reserved;let r=await roomCall(id,"join","POST",{});if(!r.ok)await callIndex("POST",{id,remove:true});return r}
  if(action==="archive"&&request.method==="POST")return callIndex("POST",{id,remove:true});
  if(!["view","round","action"].includes(action))return json({error:"not_found"},404);
  return roomCall(id,action,request.method,request.method==="POST"?await body(request):undefined,url.search)
 }catch(e){return failure(e)}
}
