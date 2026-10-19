import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMAINS,freshCareer,assertCareer,brainId,createCareer,listCareers,writeBrain,readBrain,recordTraining,renameCareer,eraseCareer} from '../agent-career.mjs';

// Minimal asynchronous IndexedDB contract: tests the same repository methods without
// requiring a browser or an external fake-indexeddb dependency.
const memory=new Map();let opened=false;
globalThis.indexedDB={
 open(){
  const request={result:null};
  queueMicrotask(()=>{
   request.result={
    createObjectStore(){opened=true;},
    close(){},
    transaction(){
     const tx={error:null};
     const call=fn=>{
      const req={result:undefined};
      queueMicrotask(()=>{
       try{req.result=fn();req.onsuccess?.();tx.oncomplete?.();}
       catch(e){tx.error=e;tx.onerror?.();}
      });
      return req;
     };
     tx.objectStore=()=>({
      get:key=>call(()=>memory.get(key)),
      getAll:()=>call(()=>[...memory.values()]),
      put:record=>call(()=>{memory.set(record.id,structuredClone(record));return record.id;}),
      delete:key=>call(()=>{memory.delete(key);return undefined;})
     });
     return tx;
    }
   };
   if(!opened)request.onupgradeneeded?.();
   request.onsuccess?.();
  });
  return request;
 }
};
test('new profiles have four distinct disciplines with strict validation',()=>{
 const a=freshCareer('Искра','a-iska');
 assert.deepEqual(Object.keys(a.branches),DOMAINS);
 assert.deepEqual(DOMAINS.map(x=>a.branches[x].sessions),[0,0,0,0]);
 assert.equal(brainId(a.id,'grid'),'career-v1:a-iska:grid');
 assert.equal(assertCareer(a),a);
 assert.throws(()=>freshCareer('','a-iska'));
 assert.throws(()=>freshCareer('Искра','../../x'));
});
test('two agents retain independent brains, history, rename and deletion',async()=>{
 const a=await createCareer('Альфа','a-alpha'),b=await createCareer('Бета','a-beta');
 const grid={type:'qlearning',version:1,q:[['start',[1,0,0,0,0]]]};
 const grown=await recordTraining(a,'grid',grid,{units:100,before:.2,after:.6,label:'60% успеха'});
 assert.equal(grown.branches.grid.sessions,1);
 assert.equal(grown.branches.grid.units,100);
 assert.equal(grown.branches.grid.history[0].after,.6);
 assert.deepEqual(await readBrain(grown,'grid'),grid);
 assert.equal(await readBrain(b,'grid'),null);
 assert.equal((await listCareers()).length,2);
 const newName=await renameCareer(grown,'Альфа 2');
 assert.equal(newName.name,'Альфа 2');
 assert.deepEqual(await readBrain(newName,'grid'),grid);
 await writeBrain(newName,'combat',{type:'combat-policy',version:1,weights:Array(8).fill(.5)});
 assert.equal((await readBrain(newName,'combat')).weights.length,8);
 await eraseCareer(newName);
 assert.equal((await listCareers()).length,1);
 assert.equal((await listCareers())[0].id,b.id);
 assert.equal(await readBrain(b,'grid'),null);
});
test('repeated training updates a stable model slot, not detached models',async()=>{
 const a=await createCareer('Повтор','a-repeat');
 for(let n=0;n<3;n++){
  const record=await recordTraining(n?await listCareers().then(all=>all.find(x=>x.id===a.id)):a,'grid',
   {type:'qlearning',version:1,q:[['state',[n,0,0,0,0]]]},{units:400,before:.2,after:.3+n*.1,label:'Занятие '+(n+1)});
  assert.equal(record.branches.grid.sessions,n+1);
 }
 const stored=await readBrain(a,'grid');
 assert.equal(stored.q[0][1][0],2);
 assert.equal(memory.has('career-v1:a-repeat:grid'),true);
 assert.equal(memory.size,[...memory.keys()].length);
 assert.equal((await listCareers()).find(x=>x.id===a.id).branches.grid.units,1200);
});