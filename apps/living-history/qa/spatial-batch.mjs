#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SEEDS=[413,7777,43821,9001,10061,202,29,101,505,12345,71331,51291,11,21773,303,404,606,7331,10009,9007,31415,27182,5150,8888];
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
const shard=Number(args.shard??0),root=path.resolve(args.output||'spatial-shard');
if(!Number.isInteger(shard)||shard<0||shard>11)throw Error('shard must be 0..11');
const script=fileURLToPath(new URL('./spatial-audit.mjs',import.meta.url));
fs.mkdirSync(root,{recursive:true});
for(const seed of SEEDS.slice(shard*2,shard*2+2)){
 const result=spawnSync(process.execPath,[script,'--seed='+seed,'--years=50','--output='+path.join(root,String(seed))],{stdio:'inherit',timeout:38*60*1000});
 if(result.error||result.status!==0)throw Error(`Spatial audit failed seed ${seed}: ${result.error?.message||result.status}`);
}
console.log('SPATIAL SHARD COMPLETE',shard,SEEDS.slice(shard*2,shard*2+2).join(','));
