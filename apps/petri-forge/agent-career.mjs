// PetriForge Agent Studio: one persistent identity, one evolving brain per environment.
import {listModels,loadModel,saveModel,commitModels} from './model-store.mjs';
export const DOMAINS=Object.freeze(['grid','combat','race','perekos']);
export const KINDS=Object.freeze({grid:'qlearning',combat:'combat-policy',race:'shpilka-evo',perekos:'perekos-policy'});
export const TITLES=Object.freeze({grid:'Миры',combat:'Боевая арена',race:'Шпилька',perekos:'Перекос'});
const PROFILE='agent-profile';
const validId=id=>typeof id==='string'&&/^[a-z0-9-]{3,56}$/.test(id);
const goodName=s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=42;
export const brainId=(id,mode)=>'career-v1:'+id+':'+mode;
export const neuralBrainId=id=>brainId(id,'grid-neural');
export const selectedBrainId=(c,domain)=>domain==='grid'&&c.algorithms?.grid==='neural'?neuralBrainId(c.id):brainId(c.id,domain);
export const newCareerId=()=> 'a-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
function historyEntry(report){
 const data=report&&typeof report==='object'?report:{};
 return {at:Date.now(),outcome:String(data.outcome||'completed').slice(0,45),
  units:Math.max(0,Math.min(100000,Number(data.units)||0)),
  before:Number.isFinite(data.before)?data.before:null,
  after:Number.isFinite(data.after)?data.after:null,
  label:String(data.label||'Тренировка завершена').slice(0,240)};
}
export function freshCareer(name,id){
 if(!validId(id)||!goodName(name))throw Error('Укажите имя агента (до 42 символов)');
 return {version:1,id,name:name.trim(),archived:false,algorithms:{grid:'qlearning'},createdAt:Date.now(),updatedAt:Date.now(),
  branches:Object.fromEntries(DOMAINS.map(domain=>[domain,{sessions:0,units:0,history:[],trainedAt:null}]))};
}
export function assertCareer(c){
 if(!c||c.version!==1||!validId(c.id)||!goodName(c.name)||!c.branches||
 (c.archived!==undefined&&typeof c.archived!=='boolean')||
 (c.parentId!==undefined&&!validId(c.parentId))||
 (c.algorithms?.grid!==undefined&&!['qlearning','neural'].includes(c.algorithms.grid)))throw Error('Повреждённый профиль агента');
 for(const domain of DOMAINS)if(!c.branches[domain]||!Array.isArray(c.branches[domain].history))throw Error('Некорректная история '+domain);
 return c;
}
export async function listCareers(){
 const records=await listModels(),out=[];
 for(const r of records.filter(x=>x.kind===PROFILE)){
  const row=await loadModel(r.id);
  try{out.push(assertCareer(row.snapshot));}catch{/* Invalid profiles are ignored, never deleted. */}
 }
 return out.sort((a,b)=>b.updatedAt-a.updatedAt);
}
export async function createCareer(name,id=newCareerId()){
 const career=freshCareer(name,id);await writeCareer(career);return career;
}
function careerRecord(c){
 assertCareer(c);
 return {id:'career:'+c.id,name:c.name,kind:PROFILE,snapshot:c,states:c.branches.grid?.sessions||0};
}
function brainRecord(c,domain,snapshot){
 if(![...DOMAINS,'gridNeural'].includes(domain)||snapshot==null)throw Error('Некорректная модель');
 const isNeural=domain==='gridNeural'||(domain==='grid'&&snapshot.type==='neural-actor-critic');
 if(domain==='gridNeural'&&snapshot.type!=='neural-actor-critic')throw Error('Неверная нейросеть');
 if(domain==='grid'&&!isNeural&&snapshot.type!=='qlearning')throw Error('Неверная Q-таблица');
 return {id:isNeural?neuralBrainId(c.id):brainId(c.id,domain),
  name:c.name+' · '+(isNeural?'Нейросеть':TITLES[domain]),
  kind:isNeural?'neural-actor-critic':KINDS[domain],
  snapshot,states:domain==='grid'&&!isNeural?snapshot.q?.length||0:isNeural?snapshot.weights?.reduce((n,layer)=>n+layer.reduce((t,row)=>t+row.length,0),0)||0:domain==='combat'||domain==='perekos'?snapshot.weights?.length||0:9};
}
export async function writeCareer(c){
 assertCareer(c);c.updatedAt=Date.now();
 await saveModel(careerRecord(c));
 return c;
}
// Atomic import/training/rename: profile and all supplied brains commit together.
export async function writeCareerBundle(c,brains={}){
 assertCareer(c);
 c.updatedAt=Date.now();
 const puts=[careerRecord(c)];
 for(const domain of [...DOMAINS,'gridNeural'])if(brains[domain]!=null)puts.push(brainRecord(c,domain,brains[domain]));
 await commitModels({puts});
 return c;
}
export async function readBrain(c,domain){
 if(!DOMAINS.includes(domain))throw Error('Неизвестная среда');
 const row=await loadModel(selectedBrainId(c,domain));
 if(!row)return null;
 if(row.kind!==(domain==='grid'&&c.algorithms?.grid==='neural'?'neural-actor-critic':KINDS[domain])||!row.snapshot)throw Error('Повреждённый мозг '+TITLES[domain]);
 return row.snapshot;
}
export async function writeBrain(c,domain,snapshot){await saveModel(brainRecord(c,domain,snapshot));}
export async function recordTraining(c,domain,snapshot,report){
 if(!DOMAINS.includes(domain))throw Error('Неизвестная среда');
 const next=structuredClone(c),branch=next.branches[domain],entry=historyEntry(report);
 branch.sessions++;branch.units+=entry.units;branch.trainedAt=entry.at;
 branch.history.push(entry);branch.history=branch.history.slice(-40);
 // Save the checkpoint and the corresponding training history in one transaction.
 await writeCareerBundle(next,{[domain]:snapshot});return next;
}
export async function renameCareer(c,name){
 if(!goodName(name))throw Error('Имя должно содержать от 1 до 42 символов');
 const next=structuredClone(c);next.name=name.trim();
 const brains={};
 for(const domain of DOMAINS){const old=await loadModel(brainId(next.id,domain));if(old)brains[domain]=old.snapshot;}
 const neural=await loadModel(neuralBrainId(next.id));if(neural)brains.gridNeural=neural.snapshot;
 await writeCareerBundle(next,brains);
 return next;
}
export async function eraseCareer(c){
 assertCareer(c);
 await commitModels({deletes:[...DOMAINS.map(domain=>brainId(c.id,domain)),neuralBrainId(c.id),'career:'+c.id]});
}
// Archive is reversible and does not delete the learned brains.
// Old v1 profiles lacking 'archived' remain active.
export async function setCareerArchived(c,archived){
 assertCareer(c);
 const next=structuredClone(c);next.archived=!!archived;
 return writeCareer(next);
}
// Clone all four specialist models and their actual learning records in one
// transaction. The new career has its own model slots and can diverge freely.
export async function cloneCareer(c,name){
 assertCareer(c);
 const next=freshCareer(name||('Копия '+c.name).slice(0,42),newCareerId());
 next.parentId=c.id;
 next.branches=structuredClone(c.branches);
 next.algorithms=structuredClone(c.algorithms||{grid:'qlearning'});
 const brains={};
 for(const domain of DOMAINS){
  const row=await loadModel(brainId(c.id,domain));
  if(row?.snapshot)brains[domain]=structuredClone(row.snapshot);
 }
 const neural=await loadModel(neuralBrainId(c.id));
 if(neural?.snapshot)brains.gridNeural=structuredClone(neural.snapshot);
 return writeCareerBundle(next,brains);
}

export async function setCareerGridAlgorithm(c,algorithm){
 assertCareer(c);
 if(!['qlearning','neural'].includes(algorithm))throw Error('Неизвестный алгоритм');
 const next=structuredClone(c);
 next.algorithms={...(next.algorithms||{}),grid:algorithm};
 return writeCareer(next);
}
export async function readGridBrain(c,algorithm){
 assertCareer(c);
 if(!['qlearning','neural'].includes(algorithm))throw Error('Неизвестный алгоритм');
 const id=algorithm==='neural'?neuralBrainId(c.id):brainId(c.id,'grid');
 const row=await loadModel(id);
 if(!row)return null;
 const kind=algorithm==='neural'?'neural-actor-critic':'qlearning';
 if(row.kind!==kind||!row.snapshot)throw Error('Повреждённое сохранение '+algorithm);
 return row.snapshot;
}
