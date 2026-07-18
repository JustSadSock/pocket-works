import { readFile } from 'node:fs/promises';
const files={
  index:await readFile('index.html','utf8'),
  updater:await readFile('launcher-update-all-v3.js','utf8'),
  links:await readFile('launcher-release-links.js','utf8'),
  guard:await readFile('shared/release-guard.js','utf8'),
  prepare:await readFile('scripts/prepare-site.mjs','utf8'),
  blazonEngine:await readFile('apps/blazon/engine.js','utf8'),
  blazonBootstrap:await readFile('apps/blazon/bootstrap.js','utf8')
};
const errors=[];
const requireToken=(file,token,label)=>{if(!files[file].includes(token))errors.push(`${label} missing ${token}`)};
requireToken('index','launcher-update-all-v3.js','launcher entry');
requireToken('index','launcher-release-links.js','launcher entry');
requireToken('updater','verifyServerRelease','verified updater');
requireToken('updater','release.json','verified updater');
requireToken('links','pw_release','versioned launch links');
requireToken('guard','probeLiveVersion','release guard');
requireToken('guard','pocket-works-release','release guard');
requireToken('prepare','stampRelease','production stamping');
requireToken('prepare','stampJavaScript','module graph stamping');
requireToken('prepare','release.json','release manifest generation');
requireToken('blazonBootstrap','startup timeout','Blazon startup boundary');
if(files.blazonEngine.includes('menu-input-hotfix.js'))errors.push('Blazon engine must not load optional UI modules');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Release coherence contract passed.');
