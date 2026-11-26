import {openLibrary} from './persistent-library.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const [root,action,...args]=process.argv.slice(2);
if(!root||!['import','search','resolve','export'].includes(action))throw new Error('Usage: node library-cli.mjs <vault> import <manifest> | search [terms] | resolve <id> | export <manifest>');
const lib=openLibrary(root);
try{
  if(action==='import'){
    const manifest=path.resolve(args[0]);const data=JSON.parse(readFileSync(manifest,'utf8'));
    if(!Array.isArray(data.samples))throw new Error('Expected samples');
    for(const e of data.samples)console.log(JSON.stringify(lib.insert(e,path.dirname(manifest))));
  }else if(action==='search')console.log(JSON.stringify(lib.list(args.join(' ')),null,2));
  else if(action==='resolve')console.log(JSON.stringify(lib.resolve(args[0]),null,2));
  else{
    const output=path.resolve(args[0]);
    if(path.dirname(output)!==path.resolve(root))throw new Error('Export manifest inside vault root');
    writeFileSync(output,JSON.stringify({version:2,samples:lib.list(),jobs:[]},null,2)+'\n',{flag:'wx'});
  }
}finally{lib.close()}
