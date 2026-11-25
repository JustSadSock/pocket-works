// Deterministic standalone export from the actual app modules. No runtime network or eval.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const deps=['battle-events.js','battle-plans.js','chronicles.js','commander.js','engine.js','historical-command.js','historical-profiles.js'];
const local=['slice-core.js','slice-renderer.js','slice.js'];
function wrap(source,name){
 const ex=[];
 const body=source.replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"](.+?)['"];?/gm,(_,b,d)=>'const {'+b.replace(/\s+as\s+/g,':')+'}=__load('+JSON.stringify(d.split('/').at(-1))+');').replace(/\bexport\s+(const|let|var|function|class)\s+(\w+)/g,(_,k,id)=>{ex.push(id);return k+' '+id});
 return JSON.stringify(name)+':function(__load){\n'+body+'\nreturn {'+ex.join(',')+'};\n}';
}
export async function standalone(){
 const entries=await Promise.all([...deps.map(n=>[root,n]),...local.map(n=>[here,n])].map(async([d,n])=>wrap(await readFile(resolve(d,n),'utf8'),n)));
 const code='const __modules={'+entries.join(',\n')+'};const __cache=Object.create(null);function __load(n){if(!__cache[n])__cache[n]=__modules[n](__load);return __cache[n]}__load("slice.js");';
 const html=await readFile(resolve(here,'index.html'),'utf8'),css=await readFile(resolve(here,'slice.css'),'utf8');
 return html.replace('<link rel="stylesheet" href="./slice.css">','<style>'+css+'</style>').replace('<script type="module" src="./slice.js"></script>','<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await writeFile(resolve(process.argv[2]||resolve(here,'standalone.html')),await standalone());
