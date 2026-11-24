import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const kind=process.argv[2],shard=Number(process.argv[3]||0);
const groups={wealth:[[0,1],[2,3]],sinews:[[0,1,2],[3,4]],balance:[[0,5],[1,6],[2,7],[3,8],[4],[9]]},entries={wealth:'wealth-experiment.mjs',sinews:'sinews-experiment.mjs',balance:'balance-experiment.mjs'};
if(!groups[kind]?.[shard])throw Error('Unknown QA group '+kind+' '+shard);
for(const group of groups[kind][shard]){console.log('QA batch '+kind+' / '+group);const child=spawnSync(process.execPath,[fileURLToPath(new URL(entries[kind],import.meta.url)),String(group)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

if(kind==='balance'&&shard<5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('balance-targeted.mjs',import.meta.url)),String(shard)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

if(kind==='balance'&&shard<5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('discovery-experiment.mjs',import.meta.url)),String(shard)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}
if(kind==='balance'&&shard===5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('political-pressure.mjs',import.meta.url))],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}
