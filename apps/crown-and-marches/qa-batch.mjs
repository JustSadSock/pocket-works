import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
let kind=process.argv[2],shard=Number(process.argv[3]||0);
if(kind==='wealth-sinews'){if(!Number.isInteger(shard)||shard<0||shard>3)throw Error('Invalid wealth-sinews shard');kind=shard<2?'wealth':'sinews';shard%=2;}
const groups={wealth:[[0,1],[2,3]],sinews:[[0,1,2],[3,4]],balance:[[0,5],[1,6],[2,7],[3,8],[4],[9]]},entries={wealth:'wealth-experiment.mjs',sinews:'sinews-experiment.mjs',balance:'balance-experiment.mjs'};
if(!groups[kind]?.[shard])throw Error('Unknown QA group '+kind+' '+shard);
for(const group of groups[kind][shard]){console.log('QA batch '+kind+' / '+group);const child=spawnSync(process.execPath,[fileURLToPath(new URL(entries[kind],import.meta.url)),String(group)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

if(kind==='balance'&&shard<5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('balance-targeted.mjs',import.meta.url)),String(shard)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

if(kind==='balance'&&shard<5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('discovery-experiment.mjs',import.meta.url)),String(shard)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}
if(kind==='balance'&&shard===5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('political-pressure.mjs',import.meta.url))],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

if(kind==='balance'&&shard===5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('discovery-pairs.mjs',import.meta.url))],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

// Keep the complete society series within the app's existing five computation shards.
if(kind==='balance'&&shard<5){const child=spawnSync(process.execPath,[fileURLToPath(new URL('society-experiment.mjs',import.meta.url)),String(shard)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

// One natural-start causality role per existing balance shard; no old task removed.
if(kind==='balance'){const child=spawnSync(process.execPath,[fileURLToPath(new URL('grand-scenario-preflight.mjs',import.meta.url)),'360',String(shard)],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}

if(kind==='balance'&&(shard===0||shard===3)){const child=spawnSync(process.execPath,[fileURLToPath(new URL('grand-breaking-isolation.mjs',import.meta.url)),shard===0?'agrarian':'maritime'],{stdio:'inherit',env:process.env});if(child.status!==0)process.exit(child.status??1);}
