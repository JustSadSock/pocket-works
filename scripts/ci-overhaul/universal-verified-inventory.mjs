// Inventory only: no task can opt itself into production reuse.
import {existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveTasks} from '../universal-qa/plan.mjs';
import {approvedTask} from './universal-cross-commit.mjs';
import {canonical} from './verified-results.mjs';
export function classifyTask(t){
 if(t.app==='banners-of-war'&&t.suite==='completion-lab'&&t.kind==='node'&&t.install===false&&Number.isInteger(t.seed)&&t.seed>=0&&t.seed<8&&t.key==='banners-of-war-completion-lab-'+t.seed)return 'existing-specialized-banners';
 if(!['node','node-test'].includes(t.kind))return 'fresh-browser-or-visual';
 if(t.install!==false)return 'fresh-install-dependent';
 try{if(canonical(t)===canonical(approvedTask(t.app)))return 'shadow-pilot';}catch{}
 return 'candidate-needs-audit';
}
export function inventory(root){
 const apps=readdirSync(join(root,'apps')).filter(a=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a)&&existsSync(join(root,'apps',a,'app.config.json'))).sort();
 const rows=[],errors=[],totals={};
 for(const app of apps){
  try{const tasks=resolveTasks(root,{apps:[app],suite:'all',profile:'deep',pullRequest:true});
   const list=tasks.map(t=>({...t,classification:classifyTask(t),productionAuthorization:false}));
   for(const t of list)totals[t.classification]=(totals[t.classification]??0)+1;
   rows.push({app,tasks:list});
  }catch(e){errors.push({app,reason:e.message});}
 }
 return {schema:1,apps:apps.length,plannedApps:rows.length,tasks:Object.values(totals).reduce((a,b)=>a+b,0),totals,errors,rows,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(inventory(process.cwd()),null,2));
