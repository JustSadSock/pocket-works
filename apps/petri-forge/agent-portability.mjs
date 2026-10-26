// Portable personal agent package: one identity, all genuinely trained specialist brains.
import {DOMAINS,assertCareer,freshCareer,newCareerId,readBrain,readGridBrain,readCombatNeural,writeCareerBundle} from './agent-career.mjs';
import {QAgent} from './lab-core.mjs';
import {validateNeuralPolicy} from './neural-policy.mjs';
import {validatePpoPolicy} from './ppo.mjs';
import {validPolicy} from './combat-core.mjs';
import {validatePerekosPolicy} from './perekos-policy.mjs';
const MAX_JSON=20_000_000;
export function validBrain(domain,brain){
 if(brain==null)return true;
 if(domain==='grid'){try{new QAgent(1).load(brain);return true;}catch{return false;}}
 if(domain==='gridNeural')return validateNeuralPolicy(brain);
 if(domain==='gridPpo'||domain==='combatArcher'||domain==='combatSwordsman')return validatePpoPolicy(brain);
 if(domain==='combat')return validPolicy(brain);
 if(domain==='perekos')return validatePerekosPolicy(brain);
 if(domain==='race')return Array.isArray(brain)&&brain.length===9&&brain.every(n=>Number.isFinite(n)&&Math.abs(n)<=2);
 return false;
}
export async function packCareer(c){
 assertCareer(c);
 const brains={};
 for(const domain of DOMAINS){
  const snapshot=domain==='grid'?await readGridBrain(c,'qlearning'):await readBrain(c,domain);
  if(snapshot&&!validBrain(domain,snapshot))throw Error('Повреждённый мозг '+domain);
  brains[domain]=snapshot;
 }
 const neural=await readGridBrain(c,'neural');
 if(neural&&!validBrain('gridNeural',neural))throw Error('Повреждённая нейросеть');
 if(neural)brains.gridNeural=neural;
 const ppo=await readGridBrain(c,'ppo');
 if(ppo&&!validBrain('gridPpo',ppo))throw Error('Повреждённый PPO-мозг');
 if(ppo)brains.gridPpo=ppo;
 for(const role of ['archer','swordsman']){
  const model=await readCombatNeural(c,role);
  const key=role==='archer'?'combatArcher':'combatSwordsman';
  if(model&&!validBrain(key,model))throw Error('Повреждённая боевая нейросеть');
  if(model)brains[key]=model;
 }
 return {format:'petri-forge-career',version:1,profile:{name:c.name,createdAt:c.createdAt,
  algorithms:{grid:c.algorithms?.grid||'qlearning'},combatNeural:structuredClone(c.combatNeural||{}),branches:structuredClone(c.branches)},brains};
}
export function validatePackage(pkg){
 if(!pkg||pkg.format!=='petri-forge-career'||pkg.version!==1||!pkg.profile||!pkg.brains)throw Error('Это не файл агента PetriForge');
 const name=pkg.profile.name;
 if(typeof name!=='string'||!name.trim()||name.length>42)throw Error('Неверное имя агента');
 const algorithm=pkg.profile.algorithms?.grid||'qlearning';
 if(!['qlearning','neural','ppo'].includes(algorithm))throw Error('Неизвестный алгоритм профиля');
 if(pkg.brains.gridNeural!=null&&!validBrain('gridNeural',pkg.brains.gridNeural))throw Error('Несовместимая нейросеть');
 if(algorithm==='neural'&&!pkg.brains.gridNeural)throw Error('Профиль с нейросетью без сохранённого мозга');
 if(pkg.brains.gridPpo!=null&&!validBrain('gridPpo',pkg.brains.gridPpo))throw Error('Несовместимый PPO-мозг');
 if(algorithm==='ppo'&&!pkg.brains.gridPpo)throw Error('Профиль PPO без сохранённого мозга');
 for(const key of ['combatArcher','combatSwordsman'])
  if(pkg.brains[key]!=null&&!validBrain(key,pkg.brains[key]))throw Error('Несовместимый нейробоец: '+key);
 const stats=pkg.profile.combatNeural||{};
 for(const role of ['archer','swordsman']){
  const row=stats[role];
  if(!row)continue;
  if(!Number.isInteger(row.sessions)||row.sessions<0||row.sessions>1e6||
   !Number.isInteger(row.episodes)||row.episodes<0||row.episodes>1e7||
   !Array.isArray(row.history)||row.history.length>30)throw Error('Некорректная история нейробоя');
 }
 const branches=pkg.profile.branches;
 if(!branches||typeof branches!=='object')throw Error('Файл не содержит историю обучения');
 for(const domain of DOMAINS){
  const b=branches[domain],snapshot=pkg.brains[domain]??null;
  if(!b||!Number.isInteger(b.sessions)||b.sessions<0||b.sessions>1e6||
     !Number.isFinite(b.units)||b.units<0||b.units>1e10||
     !Array.isArray(b.history)||b.history.length>40||
     b.history.some(h=>!h||typeof h.label!=='string'||h.label.length>240||
         !Number.isFinite(h.at)||!Number.isFinite(h.units)||h.units<0))
   throw Error('Повреждённая история агента: '+domain);
  if(!validBrain(domain,snapshot))throw Error('Несовместимый мозг: '+domain);
 }
 return pkg;
}
export async function unpackCareer(pkg){
 validatePackage(pkg);
 // Validate before writing anything. The imported identity and its four brains
 // become visible together, or the transaction aborts without orphan profiles.
 const c=freshCareer(pkg.profile.name,newCareerId());
 c.algorithms={grid:pkg.profile.algorithms?.grid||'qlearning'};
 c.combatNeural=structuredClone(pkg.profile.combatNeural||{});
 const brains={};
 for(const domain of DOMAINS){
  const src=pkg.profile.branches[domain],b=c.branches[domain];
  b.sessions=src.sessions;b.units=src.units;b.imported=!!src.imported;
  b.trainedAt=Number.isFinite(src.trainedAt)?src.trainedAt:null;
  b.history=structuredClone(src.history);
  if(pkg.brains[domain]!=null)brains[domain]=pkg.brains[domain];
 }
 if(pkg.brains.gridNeural)brains.gridNeural=pkg.brains.gridNeural;
 if(pkg.brains.gridPpo)brains.gridPpo=pkg.brains.gridPpo;
 for(const key of ['combatArcher','combatSwordsman'])if(pkg.brains[key])brains[key]=pkg.brains[key];
 try{return await writeCareerBundle(c,brains);}
 catch(e){throw Error('Импорт отменён без частично сохранённого агента: '+e.message);}
}
export function savePackageFile(pkg){
 validatePackage(pkg);
 const encoded=JSON.stringify(pkg);
 if(encoded.length>MAX_JSON)throw Error('Файл больше 20 МБ, экспорт слишком велик');
 const url=URL.createObjectURL(new Blob([encoded],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='petriforge-'+pkg.profile.name.replace(/[^a-zа-яіїєґ0-9_-]/gi,'_').slice(0,36)+'.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
export async function readPackageFile(file){
 if(!file||file.size>MAX_JSON)throw Error('Файл агента слишком большой (максимум 20 МБ)');
 return validatePackage(JSON.parse(await file.text()));
}