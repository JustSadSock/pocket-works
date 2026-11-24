import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {normalizeAppConfig} from './app-config.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const slugs=["tihiy-kadr","bzyn","print-forge","not-dead-yet","living-history","cavitation-lab","bozhe-ne-tak","venets","blockies","mezha","otves","shest-hodov","cantica-glass","zamazka","shock-lab","billiard-lab","natyazhenie","crossline-5x5","black-bazaar","styk","oskolki","trace-mosaic","jam-tape","axis-pals","chyepukha","blind-pals","kromka-duel","palimpsest-atlas","tyaga-duel","meat-exe","ne-tem-golosom","chronatlas","rasklad","rivals-roulette","inkfall","linii-vetra","nulevoy-etazh","witness-of-era","scriptorium","kvarta","turniket","toy-lens","miniature-lab","forma","perigee","kalibr","shpilka"];
for(const slug of slugs)test(slug+' reports the real release metadata and supports managed activation',()=>{
 const dir=resolve(root,'apps',slug),c=normalizeAppConfig(JSON.parse(readFileSync(resolve(dir,'app.config.json'),'utf8')),slug),source=readFileSync(resolve(dir,'sw.js'),'utf8');
 const handlers=new Map();let activated=0;const scope='https://pocket.invalid/apps/'+slug+'/';
 const self={registration:{scope},location:new URL(scope),addEventListener(type,handler){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(handler)},skipWaiting(){activated++;return Promise.resolve()},clients:{claim(){return Promise.resolve()}}};
 vm.runInNewContext(source,{self,location:self.location,URL,URLSearchParams,Request,Response,Headers,console,caches:{},fetch(){throw Error('Unexpected network at worker initialization')}},{timeout:1000,filename:slug+'/sw.js'});
 const messages=handlers.get('message')??[];assert.ok(messages.length,'update message handler');let payload;
 for(const handler of messages)handler({data:{type:'GET_UPDATE_INFO'},ports:[{postMessage:value=>{payload=value}}]});
 assert.ok(payload,'worker returned metadata');assert.equal(payload.version,c.version);assert.equal(payload.releaseDate,c.releaseDate);assert.deepEqual(Array.from(payload.releaseNotes),c.changelog);
 for(const handler of messages)handler({data:{type:'SKIP_WAITING'},ports:[]});assert.equal(activated,1);
 if(source.includes('./workshop.js')){assert.ok(existsSync(resolve(dir,'workshop.js')),'offline workshop module exists');assert.ok(readFileSync(resolve(dir,'index.html'),'utf8').includes('./workshop.js'),'actual page imports workshop');}
});
