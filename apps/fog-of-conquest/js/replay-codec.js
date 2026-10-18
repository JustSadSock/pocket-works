/* Compact, deterministic offline replay archive: periodic keyframes and entity deltas.
   A replay is always reconstructed before entering the original renderer.
   PocketNet projections are never accepted as local save data. */
(function(root){
 'use strict';
 const VERSION=1,INTERVAL=20,LIMIT=1200;
 const copy=o=>JSON.parse(JSON.stringify(o));
 const fail=msg=>{throw new Error('Повреждённый повтор: '+msg);};
 const isObj=o=>o&&typeof o==='object'&&!Array.isArray(o);
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function validateFrame(s){
   if(!isObj(s)||!Array.isArray(s.units)||!Array.isArray(s.buildings)||!isObj(s.state)
     ||s.units.length>5000||s.buildings.length>3000)fail('неверный снимок');
   if(!Number.isInteger(s.state.turn)||![1,2].includes(s.state.currentPlayer)
     ||!isObj(s.state.gold))fail('неверный ход');
   const ids=new Set();
   for(const u of s.units){
     if(!isObj(u)||!Number.isInteger(u.id)||u.id<0||ids.has(u.id))fail('неверные ID войск');
     ids.add(u.id);
   }
   return s;
 }
 function difference(prev,next){
   const d={};
   if(!eq(prev.state,next.state))d.s=copy(next.state);
   if(!eq(prev.units,next.units)){
     const old=new Map(prev.units.map(u=>[u.id,u]));
     const current=new Set(next.units.map(u=>u.id));
     const changes=next.units.filter(u=>!old.has(u.id)||!eq(old.get(u.id),u)).map(copy);
     const removals=prev.units.filter(u=>!current.has(u.id)).map(u=>u.id);
     const order=next.units.map(u=>u.id);
     const oldOrder=prev.units.map(u=>u.id);
     d.u={c:changes,r:removals};
     if(!eq(order,oldOrder))d.u.o=order;
   }
   if(!eq(prev.buildings,next.buildings)){
     const changes=[];
     for(let i=0;i<next.buildings.length;i++)
       if(i>=prev.buildings.length||!eq(prev.buildings[i],next.buildings[i]))
         changes.push([i,copy(next.buildings[i])]);
     d.b={n:next.buildings.length,c:changes};
   }
   return d;
 }
 function patch(prev,d){
   if(!isObj(d))fail('неверная разница');
   const result=copy(prev);
   if(d.s!==undefined){
     if(!isObj(d.s))fail('повреждено состояние хода');
     result.state=copy(d.s);
   }
   if(d.u!==undefined){
     if(!isObj(d.u)||!Array.isArray(d.u.c)||!Array.isArray(d.u.r)
       ||d.u.c.length>5000||d.u.r.length>5000)fail('повреждены войска');
     const units=new Map(result.units.map(u=>[u.id,u]));
     for(const id of d.u.r){
       if(!Number.isInteger(id)||!units.has(id))fail('неизвестный удалённый отряд');
       units.delete(id);
     }
     for(const u of d.u.c){
       if(!isObj(u)||!Number.isInteger(u.id)||u.id<0)fail('неверное изменение отряда');
       units.set(u.id,copy(u));
     }
     if(d.u.o!==undefined){
       if(!Array.isArray(d.u.o)||d.u.o.length!==units.size
         ||new Set(d.u.o).size!==units.size||!d.u.o.every(id=>units.has(id)))
         fail('неверный порядок войск');
       result.units=d.u.o.map(id=>units.get(id));
     }else result.units=[...units.values()];
   }
   if(d.b!==undefined){
     if(!isObj(d.b)||!Number.isInteger(d.b.n)||d.b.n<0||d.b.n>3000||
       !Array.isArray(d.b.c)||d.b.c.length>3000)fail('повреждены строения');
     result.buildings.length=d.b.n;
     for(const change of d.b.c){
       if(!Array.isArray(change)||change.length!==2||
         !Number.isInteger(change[0])||change[0]<0||change[0]>=d.b.n||
         !isObj(change[1]))fail('неверное изменение строения');
       result.buildings[change[0]]=copy(change[1]);
     }
     if(result.buildings.some(b=>!isObj(b)))fail('пропущенное строение');
   }
   return validateFrame(result);
 }
 function pack(events){
   if(!Array.isArray(events))fail('отсутствует список событий');
   const list=events.slice(-LIMIT);
   const records=[];
   let previous=null;
   for(let i=0;i<list.length;i++){
     const ev=list[i];
     if(!isObj(ev))fail('неверная запись');
     const {snapshot,...meta}=ev;
     const record={m:copy(meta)};
     if(snapshot!==undefined){
       const current=validateFrame(copy(snapshot));
       if(!previous||i%INTERVAL===0)record.k=current;
       else record.d=difference(previous,current);
       previous=current;
     }
     records.push(record);
   }
   return {version:VERSION,interval:INTERVAL,records};
 }
 function expand(archive){
   if(!isObj(archive)||archive.version!==VERSION||!Array.isArray(archive.records)
     ||archive.records.length>LIMIT)fail('неподдерживаемый формат или размер');
   const events=[];let previous=null;
   for(let i=0;i<archive.records.length;i++){
     const rec=archive.records[i];
     if(!isObj(rec)||!isObj(rec.m))fail('повреждённое событие');
     if(rec.k!==undefined&&rec.d!==undefined)fail('одновременный ключевой кадр и изменение');
     const meta=copy(rec.m);
     if(Object.hasOwn(meta,'snapshot'))fail('неверный формат события');
     if(rec.k!==undefined)previous=validateFrame(copy(rec.k));
     else if(rec.d!==undefined){
       if(!previous)fail('отсутствует ключевой кадр');
       previous=patch(previous,rec.d);
     }
     if(previous)meta.snapshot=copy(previous);
     events.push(meta);
   }
   return events;
 }
 function packSave(normalized){
   if(!isObj(normalized)||normalized.origin==='pocketnet'||normalized.onlineGame===true)
     fail('серверный снимок нельзя сохранить офлайн');
   const out={...normalized,replayArchive:pack(normalized.replayEvents)};
   delete out.replayEvents;
   return out;
 }
 const api=Object.freeze({VERSION,INTERVAL,LIMIT,pack,expand,packSave});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.FogReplayCodec=api;
})(typeof window!=='undefined'?window:globalThis);
