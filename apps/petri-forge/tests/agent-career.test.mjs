import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMAINS,freshCareer,assertCareer,brainId,createCareer,listCareers,writeBrain,readBrain,recordTraining,renameCareer,eraseCareer,cloneCareer,setCareerArchived,setCareerGridAlgorithm,readGridBrain} from '../agent-career.mjs';
import {NeuralActorCritic} from '../neural-policy.mjs';
import {packCareer,unpackCareer,validatePackage} from '../agent-portability.mjs';

// Minimal asynchronous IndexedDB contract: tests the same repository methods without
// requiring a browser or an external fake-indexeddb dependency.
const memory=new Map();let opened=false,failId=null,failKind=null;
globalThis.indexedDB={
 open(){
  const request={result:null};
  queueMicrotask(()=>{
   request.result={
    createObjectStore(){opened=true;},
    close(){},
    transaction(_store,mode){
     const staged=new Map([...memory].map(([k,v])=>[k,structuredClone(v)]));
     let pending=0,aborted=false,completeScheduled=false;
     const tx={
      error:null,
      abort(){if(aborted)return;aborted=true;queueMicrotask(()=>tx.onabort?.());},
      objectStore:()=>({
       get:key=>call(()=>structuredClone(staged.get(key))),
       getAll:()=>call(()=>[...staged.values()].map(x=>structuredClone(x))),
       put:record=>call(()=>{
        if(record.id===failId||record.kind===failKind)throw Error('Injected disk failure');
        staged.set(record.id,structuredClone(record));return record.id;
       }),
       delete:key=>call(()=>{staged.delete(key);})
      })
     };
     const settle=()=>{
      if(pending||aborted||completeScheduled)return;
      completeScheduled=true;
      queueMicrotask(()=>{
       if(pending||aborted)return;
       if(mode==='readwrite'){memory.clear();for(const [k,v] of staged)memory.set(k,v);}
       tx.oncomplete?.();
      });
     };
     const call=fn=>{
      const req={result:undefined};pending++;
      queueMicrotask(()=>{
       if(aborted)return;
       try{req.result=fn();req.onsuccess?.();}
       catch(e){tx.error=e;aborted=true;tx.onabort?.();return;}
       pending--;settle();
      });
      return req;
     };
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
test('profile and brain changes are atomic if IndexedDB aborts a write',async()=>{
 const c=await createCareer('Транзакция','a-atomic');
 const before={type:'qlearning',version:1,q:[['start',[1,0,0,0,0]]]};
 await writeBrain(c,'grid',before);
 failId='career:'+c.id;
 try{
  await assert.rejects(recordTraining(c,'grid',{type:'qlearning',version:1,q:[['start',[9,0,0,0,0]]]},{units:99}));
 }finally{failId=null;}
 assert.deepEqual(await readBrain(c,'grid'),before,'failed profile write must roll back brain update');
 const stored=(await listCareers()).find(x=>x.id===c.id);
 assert.equal(stored.branches.grid.sessions,0,'failed transaction must not increment history');
 assert.equal(stored.branches.grid.units,0);
});

test('career import is all-or-nothing and never creates an orphan profile',async()=>{
 const source=await createCareer('Экспорт','a-export');
 const trained=await recordTraining(source,'grid',{type:'qlearning',version:1,q:[['start',[1,0,0,0,0]]]},{units:10});
 const pkg=await packCareer(trained);
 const count=(await listCareers()).length;
 failKind='qlearning';
 try{await assert.rejects(unpackCareer(pkg),/Импорт отменён/);}
 finally{failKind=null;}
 assert.equal((await listCareers()).length,count,'failed import must not leave a profile behind');
 const restored=await unpackCareer(pkg);
 assert.notEqual(restored.id,source.id);
 assert.equal(restored.branches.grid.sessions,1);
 assert.deepEqual(await readBrain(restored,'grid'),pkg.brains.grid);
 assert.equal((await listCareers()).length,count+1);
 assert.throws(()=>validatePackage({...pkg,brains:{...pkg.brains,grid:{type:'unknown'}}}),/Несовместимый мозг/);
});

test('renaming and deleting profiles do not lose other agent brains',async()=>{
 const a=await createCareer('Три','a-safe-rename'),b=await createCareer('Четыре','a-safe-peer');
 await writeBrain(a,'grid',{type:'qlearning',version:1,q:[['s',[2,0,0,0,0]]]});
 await writeBrain(b,'grid',{type:'qlearning',version:1,q:[['p',[3,0,0,0,0]]]});
 const renamed=await renameCareer(a,'Переименован');
 assert.equal(renamed.name,'Переименован');
 assert.equal((await readBrain(renamed,'grid')).q[0][1][0],2);
 await eraseCareer(renamed);
 assert.equal((await readBrain(b,'grid')).q[0][1][0],3);
});

test('cloning a trained agent produces independent weights and history across reload',async()=>{
 const parent=await createCareer('Предок','a-specimen-parent');
 const original=await recordTraining(parent,'grid',
  {type:'qlearning',version:1,q:[['start',[4,0,0,0,0]]]},{units:100,label:'Выучил маршрут'});
 const combat={type:'combat-policy',version:1,weights:Array(8).fill(.12)};
 await writeBrain(original,'combat',combat);
 const child=await cloneCareer(original);
 assert.notEqual(child.id,parent.id);
 assert.equal(child.parentId,parent.id);
 assert.equal(child.archived,false);
 assert.equal(child.branches.grid.sessions,1);
 assert.deepEqual(await readBrain(child,'grid'),await readBrain(original,'grid'));
 assert.deepEqual(await readBrain(child,'combat'),combat);
 await writeBrain(child,'grid',{type:'qlearning',version:1,q:[['start',[8,0,0,0,0]]]});
 assert.equal((await readBrain(original,'grid')).q[0][1][0],4,'parent weights cannot change when child trains');
 const stored=(await listCareers()).find(c=>c.id===child.id);
 assert.equal(stored.branches.grid.units,100);
 assert.equal(stored.parentId,parent.id);
});

test('archive can be restored without changing any learned brain',async()=>{
 const c=await createCareer('Архивный','a-archive');
 await writeBrain(c,'grid',{type:'qlearning',version:1,q:[['s',[7,0,0,0,0]]]});
 const archived=await setCareerArchived(c,true);
 assert.equal(archived.archived,true);
 assert.equal((await listCareers()).find(x=>x.id===c.id).archived,true);
 assert.equal((await readBrain(archived,'grid')).q[0][1][0],7);
 const returned=await setCareerArchived(archived,false);
 assert.equal(returned.archived,false);
 assert.equal((await readBrain(returned,'grid')).q[0][1][0],7);
});

test('cloning fails atomically if any model write fails',async()=>{
 const c=await createCareer('Родитель','a-clone-error');
 await writeBrain(c,'grid',{type:'qlearning',version:1,q:[['s',[1,0,0,0,0]]]});
 const count=(await listCareers()).length;
 failKind='qlearning';
 try{await assert.rejects(cloneCareer(c));}finally{failKind=null;}
 assert.equal((await listCareers()).length,count,'failed clone must not leave a partial career');
});

test('neural and Q brains survive independent selection, cloning and JSON portability',async()=>{
 const q={type:'qlearning',version:1,q:[['s',[4,0,0,0,0]]]};
 const origin=await createCareer('Два алгоритма','a-neural-origin');
 await writeBrain(origin,'grid',q);
 const neuralProfile=await setCareerGridAlgorithm(origin,'neural');
 const neural=new NeuralActorCritic(8);
 const o={tiles:Array.from({length:7},()=>Array(7).fill(0)),pos:[3,3],goalVec:[5,5]};
 neural.learn(o,neural.act(o,true),1,o,false);
 const trained=await recordTraining(neuralProfile,'grid',neural.serialize(),{units:100,label:'Нейросеть учится'});
 assert.equal(trained.algorithms.grid,'neural');
 assert.equal((await readBrain(trained,'grid')).type,'neural-actor-critic');
 assert.deepEqual(await readGridBrain(trained,'qlearning'),q);
 const copy=await cloneCareer(trained);
 assert.equal(copy.algorithms.grid,'neural');
 assert.deepEqual(await readGridBrain(copy,'neural'),await readBrain(trained,'grid'));
 assert.deepEqual(await readGridBrain(copy,'qlearning'),q);
 const packed=await packCareer(trained);
 assert.equal(packed.brains.grid.type,'qlearning');
 assert.equal(packed.brains.gridNeural.type,'neural-actor-critic');
 assert.equal(validatePackage(packed),packed);
 const restored=await unpackCareer(packed);
 assert.equal(restored.algorithms.grid,'neural');
 assert.deepEqual(await readBrain(restored,'grid'),packed.brains.gridNeural);
 assert.deepEqual(await readGridBrain(restored,'qlearning'),q);
 const qProfile=await setCareerGridAlgorithm(restored,'qlearning');
 assert.equal((await readBrain(qProfile,'grid')).type,'qlearning');
 const qAgain=await setCareerGridAlgorithm(qProfile,'neural');
 assert.equal((await readBrain(qAgain,'grid')).updates,1);
});
