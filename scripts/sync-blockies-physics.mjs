import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const physicsPath=path.join(root,'apps/blockies/physics-core.js');
const serverPath=path.join(root,'apps/blockies/server/module.ts');
const START='// BEGIN GENERATED BLOCKIES PHYSICS CORE (apps/blockies/physics-core.js)\n';
const END='// END GENERATED BLOCKIES PHYSICS CORE\n';
const check=process.argv.includes('--check');
const physics=await readFile(physicsPath,'utf8');
const source=await readFile(serverPath,'utf8');
const start=source.indexOf(START);
const end=source.indexOf(END,start+START.length);
if(start<0||end<0||source.indexOf(START,start+START.length)>=0)throw Error('Blockies physics markers are missing or ambiguous');
const generated=physics.replace(/^export /gm,'');
const actual=source.slice(start+START.length,end);
if(check){
 if(actual!==generated)throw Error('Blockies physics differs from shared source. Run node scripts/sync-blockies-physics.mjs, then pin a NEW PocketNet module version.');
 console.log('Blockies physics embedded module matches apps/blockies/physics-core.js');
}else{
 const next=source.slice(0,start+START.length)+generated+source.slice(end);
 if(next!==source)await writeFile(serverPath,next);
 console.log('Synced standalone Blockies server physics; remember to pin a new PocketNet snapshot.');
}
