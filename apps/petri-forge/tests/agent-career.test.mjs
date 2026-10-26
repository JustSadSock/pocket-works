import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMAINS,freshCareer,assertCareer,brainId,createCareer,listCareers,writeBrain,readBrain,recordTraining,renameCareer,eraseCareer,cloneCareer,setCareerArchived,setCareerGridAlgorithm,readGridBrain,recordCombatNeural,readCombatNeural,recordCombatCoevolution} from '../agent-career.mjs';
import {NeuralActorCritic} from '../neural-policy.mjs';
import {PpoPolicy} from '../ppo.mjs';
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

test('PPO is independent from Q and previous actor-critic across clone, delete and JSON roundtrip',async()=>{
 const original=await createCareer('Три мозга','a-ppo-triple');
 const q={type:'qlearning',version:1,q:[['origin',[3,1,0,0,0]]]};
 await writeBrain(original,'grid',q);
 const n=await setCareerGridAlgorithm(original,'neural');
 const actor=new NeuralActorCritic(13).serialize();
 await recordTraining(n,'grid',actor,{units:3,label:'actor'});
 const p=await setCareerGridAlgorithm(n,'ppo');
 const ppo=new PpoPolicy(31);
 const obs={tiles:Array.from({length:7},()=>Array(7).fill(0)),pos:[2,2],goalVec:[3,3]};
 const action=ppo.sample(obs);
 const trainer=new (await import('../ppo.mjs')).PpoTrainer(ppo,{rolloutSteps:1,epochs:1,minibatchSize:1});
 trainer.add(obs,{reward:1,done:true},action.actionIndex,action.logProb,action.value);
 trainer.optimize();
 const trained=await recordTraining(p,'grid',ppo.serialize(),{units:5,label:'PPO'});
 assert.equal(trained.algorithms.grid,'ppo');
 assert.deepEqual(await readBrain(trained,'grid'),ppo.serialize());
 assert.deepEqual(await readGridBrain(trained,'qlearning'),q);
 assert.deepEqual(await readGridBrain(trained,'neural'),actor);
 const clone=await cloneCareer(trained);
 assert.equal(clone.algorithms.grid,'ppo');
 assert.deepEqual(await readGridBrain(clone,'ppo'),ppo.serialize());
 const packaged=await packCareer(trained);
 assert.deepEqual(packaged.brains.gridPpo,ppo.serialize());
 const reimported=await unpackCareer(packaged);
 assert.equal(reimported.algorithms.grid,'ppo');
 assert.deepEqual(await readBrain(reimported,'grid'),ppo.serialize());
 assert.deepEqual(await readGridBrain(reimported,'qlearning'),q);
 assert.deepEqual(await readGridBrain(reimported,'neural'),actor);
 await eraseCareer(clone);
 assert.deepEqual(await readBrain(trained,'grid'),ppo.serialize());
 const back=await setCareerGridAlgorithm(trained,'qlearning');
 assert.equal((await readBrain(back,'grid')).type,'qlearning');
 const restored=await setCareerGridAlgorithm(back,'ppo');
 assert.equal((await readBrain(restored,'grid')).type,'neural-ppo');
});

test('combat neural classes are independent, transactional and portable with old tactical brain',async()=>{
 const original=await createCareer('Нейробоец','a-combat-neural-test');
 const archer=new (await import('../ppo.mjs')).PpoPolicy(6).serialize();
 const swordsman=new (await import('../ppo.mjs')).PpoPolicy(7).serialize();
 const oldCombat={type:'combat-policy',version:1,name:'balanced',weights:Array(8).fill(.5)};
 await writeBrain(original,'combat',oldCombat);
 const afterA=await recordCombatNeural(original,'archer',archer,{episodes:6,winRate:.5});
 const afterS=await recordCombatNeural(afterA,'swordsman',swordsman,{episodes:12,winRate:.75});
 assert.deepEqual(await readCombatNeural(afterS,'archer'),archer);
 assert.deepEqual(await readCombatNeural(afterS,'swordsman'),swordsman);
 assert.deepEqual(await readBrain(afterS,'combat'),oldCombat);
 assert.equal(afterS.combatNeural.archer.episodes,6);
 assert.equal(afterS.combatNeural.swordsman.episodes,12);
 const clone=await cloneCareer(afterS);
 assert.deepEqual(await readCombatNeural(clone,'archer'),archer);
 assert.deepEqual(await readCombatNeural(clone,'swordsman'),swordsman);
 const pkg=await packCareer(afterS);
 assert.deepEqual(pkg.brains.combatArcher,archer);
 assert.deepEqual(pkg.brains.combatSwordsman,swordsman);
 const imported=await unpackCareer(pkg);
 assert.deepEqual(await readCombatNeural(imported,'archer'),archer);
 assert.deepEqual(await readCombatNeural(imported,'swordsman'),swordsman);
 assert.equal(imported.combatNeural.archer.sessions,1);
 await eraseCareer(clone);
 assert.deepEqual(await readCombatNeural(afterS,'archer'),archer);
 const before=(await listCareers()).length;
 failKind='neural-ppo';
 try{await assert.rejects(recordCombatNeural(afterS,'archer',archer,{episodes:4,winRate:1}));}
 finally{failKind=null;}
 assert.equal((await listCareers()).length,before);
 assert.equal((await listCareers()).find(x=>x.id===afterS.id).combatNeural.archer.episodes,6);
});

test('self-play generation measurements survive cloning, package export, import and are validated before write',async()=>{
 const profile=await createCareer('Лига','a-combat-league-test');
 const model=new PpoPolicy(72).serialize();
 const report={episodes:12,winRate:.5,league:{seed:481,role:'archer',generations:[
  {generation:0,episodes:0,updates:0,validation:{winRate:0}},
  {generation:1,episodes:6,updates:3,validation:{winRate:.33}},
  {generation:2,episodes:12,updates:7,validation:{winRate:.5}}
 ]}};
 const saved=await recordCombatNeural(profile,'archer',model,report);
 const history=saved.combatNeural.archer.history.at(-1);
 assert.deepEqual(history.league,report.league);
 const copied=await cloneCareer(saved);
 assert.deepEqual(copied.combatNeural.archer.history.at(-1).league,report.league);
 const pkg=await packCareer(saved),imported=await unpackCareer(pkg);
 assert.deepEqual(imported.combatNeural.archer.history.at(-1).league,report.league);
 assert.deepEqual(await readCombatNeural(imported,'archer'),model);
 const old=(await listCareers()).find(x=>x.id===saved.id);
 await assert.rejects(recordCombatNeural(saved,'archer',model,{...report,league:{seed:1,generations:[{
  generation:1,episodes:12,updates:0,validation:{winRate:Infinity}
 }]}}),/история/);
 assert.deepEqual((await listCareers()).find(x=>x.id===saved.id),old);
});

test('two coevolving brains and both histories commit atomically, clone, export and rollback',async()=>{
 const original=await createCareer('Совместные бойцы','a-two-brains-test');
 const a=new PpoPolicy(101).serialize(),b=new PpoPolicy(202).serialize();
 const gen=[
  {generation:0,episodes:0,updatesA:0,updatesB:0,evaluation:{fixed:{archer:{winRate:0},swordsman:{winRate:0}}}},
  {generation:1,episodes:6,updatesA:5,updatesB:6,evaluation:{fixed:{archer:{winRate:.33},swordsman:{winRate:.67}}}}
 ];
 const props={episodes:6,report:{seed:781,generations:gen}};
 const saved=await recordCombatCoevolution(original,'archer',a,'swordsman',b,props);
 assert.deepEqual(await readCombatNeural(saved,'archer'),a);
 assert.deepEqual(await readCombatNeural(saved,'swordsman'),b);
 assert.equal(saved.combatNeural.archer.episodes,6);
 assert.equal(saved.combatNeural.swordsman.episodes,6);
 assert.deepEqual(saved.combatNeural.archer.history.at(-1).coevolution.generations,gen);
 const clone=await cloneCareer(saved);
 assert.deepEqual(clone.combatNeural.archer.history.at(-1).coevolution.generations,gen);
 assert.deepEqual(await readCombatNeural(clone,'swordsman'),b);
 const imported=await unpackCareer(await packCareer(saved));
 assert.equal(imported.combatNeural.swordsman.episodes,6);
 assert.deepEqual(await readCombatNeural(imported,'archer'),a);
 const before=(await listCareers()).find(x=>x.id===saved.id);
 failId='career-v1:'+saved.id+':combat-ppo-swordsman';
 try{await assert.rejects(recordCombatCoevolution(saved,'archer',a,'swordsman',b,props));}
 finally{failId=null;}
 assert.deepEqual((await listCareers()).find(x=>x.id===saved.id),before);
 assert.deepEqual(await readCombatNeural(saved,'archer'),a);
 assert.deepEqual(await readCombatNeural(saved,'swordsman'),b);
 await assert.rejects(recordCombatCoevolution(saved,'archer',a,'archer',b,props),/два разных/);
});
