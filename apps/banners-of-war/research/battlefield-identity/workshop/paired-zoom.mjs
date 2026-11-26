// Run the original benchmark implementation on either revision, with the
// same frozen atlas, same browser package, and explicit cold/warm protocols.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),src=resolve(root,'apps/banners-of-war/research/battlefield-identity/capture.mjs'),tmp=resolve(root,'apps/banners-of-war/research/battlefield-identity/.paired-zoom.mjs');
const original=await readFile(src,'utf8'),cut=original.lastIndexOf('\nlet browser;');if(cut<0)throw Error('Capture source changed');
let prefix=original.slice(0,cut);
prefix=prefix.replace("for(let motion of ['static','pan','zoom'])for(let mode of ['direct','batch','layer','scaled','world-row','world-row','layer','batch','direct','auto','auto'])","for(let motion of (process.env.BOW_BENCH_PROTOCOL==='cold'?['zoom']:['static','pan','zoom']))for(let mode of (process.env.BOW_BENCH_PROTOCOL==='cold'?['auto','auto']:['direct','batch','layer','scaled','world-row','world-row','layer','batch','direct','auto','auto']))").replace("let sameCounts=['static','pan','zoom'].every","let sameCounts=(process.env.BOW_BENCH_PROTOCOL==='cold'?['zoom']:['static','pan','zoom']).every").replace('results.push({motion,mode,fps:','results.push({motion,mode,intervals:timings,fps:');
if(!prefix.includes('intervals:timings')||!prefix.includes('BOW_BENCH_PROTOCOL'))throw Error('Benchmark instrumentation mismatch');
const tail=`
import {createHash} from 'node:crypto';
import os from 'node:os';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function cgroup(){let r={};for(let p of ['/sys/fs/cgroup/cpu.max','/sys/fs/cgroup/cpu.stat','/sys/fs/cgroup/cpuset.cpus.effective','/sys/fs/cgroup/memory.max','/proc/loadavg'])try{r[p]=await readFile(p,'utf8')}catch{}return r}
let browser;
try{
 const start=await cgroup(),protocol=process.env.BOW_BENCH_PROTOCOL;
 browser=await webkit.launch();let {ctx,p,errors}=await launch(browser,{...devices['iPhone 13']});
 try{
  let env=await p.evaluate(()=>{let c=document.getElementById('field');return {ua:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],canvas:[c.width,c.height],css:[c.clientWidth,c.clientHeight],audio:window.sliceQA.audioStatus(),visibility:document.visibilityState}});
  let warm=null;if(protocol==='warm')warm=await bench(p,20,'paired-warmup');
  let r=await bench(p,60,'paired'),after=await p.evaluate(()=>{let c=document.getElementById('field');return {canvas:[c.width,c.height],css:[c.clientWidth,c.clientHeight],dpr:devicePixelRatio,audio:window.sliceQA.audioStatus(),pending:window.sliceQA.state().pending,stats:window.sliceQA.state().stats}});
  let physical=benchmarkStates(60),meta=JSON.parse(await readFile(out+'/mixed-atlas.json','utf8')),assets={};
  for(let name of ['mixed-atlas.json',...Object.keys(meta.pages).map(k=>'page-'+k+'.png'),'grass.png','sparse.png','road.png','stone.png',...['tree1','tree2','tree3','bush'].flatMap(k=>[k+'.png',k+'.json'])])assets[name]=digest(await readFile(out+'/'+name));
  const expected=[5016,5011,5011,5011,5011,5003,5003,5001,5001,4993,4989,4989,4987,4980,4973,4972,4970,4959,4958,4955,4947,4945,4943,4938];
  const visible=[5016,5011,5011,5011,5011,5003,5003,5001,5001,4993,4989,4989,4987,4980,4973,4972,4970,4954,4930,4894,4813,4696,4596,4529];
  const zoom=r.results.filter(x=>x.motion==='zoom'&&x.mode==='auto'),violations=[];
  if(!r.sameCounts||r.changedPixels>.05||r.equivalence.some(e=>e.changedPixels>.05)||r.results.some(a=>JSON.stringify(a.represented)!==JSON.stringify(expected)||JSON.stringify(a.counts)!==JSON.stringify(a.motion==='zoom'?visible:expected)||a.tiles.some(t=>t.uncovered>0)))violations.push('Physical population, coverage or equivalence mismatch');
  if(zoom.length!==2||zoom.some(x=>x.fps<30))violations.push('WebKit zoom below 30 FPS');
  if(protocol==='warm')for(let m of ['static','pan'])if(r.results.filter(x=>x.motion===m&&x.mode==='auto').some(x=>x.fps<30))violations.push(m+' below 30 FPS');
  if(errors.length)violations.push(...errors);
  await save('paired-result.json',{protocol,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browser.version(),node:process.version,cpu:os.cpus().map(c=>({model:c.model,speed:c.speed})),parallelism:os.availableParallelism(),memory:os.totalmem(),start,end:await cgroup(),env,after,physicalSHA256:digest(JSON.stringify(physical)),assets,warmup:warm?.results.map(x=>({motion:x.motion,mode:x.mode,fps:x.fps})),r,violations});
  console.log(JSON.stringify({protocol,zoom:zoom.map(x=>x.fps),violations}));
 }finally{await ctx.close()}
}finally{if(browser)await browser.close();server.close()}
`;
await writeFile(tmp,prefix+tail);
try{await import(pathToFileURL(tmp).href)}finally{await unlink(tmp)}
