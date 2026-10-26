// PetriForge Agent Studio: one persistent identity, one evolving brain per environment.
import {listModels,loadModel,saveModel,commitModels} from './model-store.mjs';
export const DOMAINS=Object.freeze(['grid','combat','race','perekos']);
export const KINDS=Object.freeze({grid:'qlearning',combat:'combat-policy',race:'shpilka-evo',perekos:'perekos-policy'});
export const TITLES=Object.freeze({grid:'Миры',combat:'Боевая арена',race:'Шпилька',perekos:'Перекос'});
const PROFILE='agent-profile';
const validId=id=>typeof id==='string'&&/^[a-z0-9-]{3,56}$/.test(id);
const goodName=s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=42;
export const brainId=(id,mode)=>'career-v1:'+id+':'+mode;
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
 return {version:1,id,name:name.trim(),createdAt:Date.now(),updatedAt:Date.now(),
  branches:Object.fromEntries(DOMAINS.map(domain=>[domain,{sessions:0,units:0,history:[],trainedAt:null}]))};
}
export function assertCareer(c){
 if(!c||c.version!==1||!validId(c.id)||!goodName(c.name)||!c.branches)throw Error('Повреждённый профиль агента');
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
 if(!DOMAINS.includes(domain)||snapshot==null)throw Error('Некорректная модель');
 return {id:brainId(c.id,domain),name:c.name+' · '+TITLES[domain],kind:KINDS[domain],
  snapshot,states:domain==='grid'?snapshot.q?.length||0:domain==='combat'||domain==='perekos'?snapshot.weights?.length||0:9};
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
 for(const domain of DOMAINS)if(brains[domain]!=null)puts.push(brainRecord(c,domain,brains[domain]));
 await commitModels({puts});
 return c;
}
export async function readBrain(c,domain){
 if(!DOMAINS.includes(domain))throw Error('Неизвестная среда');
 const row=await loadModel(brainId(c.id,domain));
 if(!row)return null;
 if(row.kind!==KINDS[domain]||!row.snapshot)throw Error('Повреждённый мозг '+TITLES[domain]);
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
 await writeCareerBundle(next,brains);
 return next;
}
export async function eraseCareer(c){
 assertCareer(c);
 await commitModels({deletes:[...DOMAINS.map(domain=>brainId(c.id,domain)),'career:'+c.id]});
}