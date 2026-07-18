import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';
const root=process.cwd(),output=path.join(root,'dist-site'),errors=[];
async function exists(target){try{await access(target);return true}catch{return false}}
for(const file of ['index.html','styles.css','launcher-performance.css','launcher-sync.css','app.js','launcher-update-all-v3.js','launcher-release-links.js','launcher-sync.js','manifest.webmanifest','sw.js','apps.json'])if(!(await exists(path.join(output,file))))errors.push(`dist-site is missing ${file}`);
for(const forbidden of ['node_modules','scripts','docs','package.json','wrangler.jsonc'])if(await exists(path.join(output,forbidden)))errors.push(`dist-site must not publish ${forbidden}`);
const configs=await collectAppConfigs(root);
for(const config of configs){
  const directory=path.join(output,'apps',config.slug);
  for(const file of ['index.html','styles.css','app.js','app.config.json','release.json','manifest.webmanifest','sw.js','icons'])if(!(await exists(path.join(directory,file))))errors.push(`dist-site/apps/${config.slug} is missing ${file}`);
  for(const forbidden of ['source','public','.dist','package.json','vite.config.ts','tsconfig.json'])if(await exists(path.join(directory,forbidden)))errors.push(`dist-site/apps/${config.slug} must not publish ${forbidden}`);
  if(await exists(path.join(directory,'index.html'))){
    const html=await readFile(path.join(directory,'index.html'),'utf8');
    if(!html.includes(`name="pocket-works-release" content="${config.version}"`))errors.push(`dist-site/apps/${config.slug}/index.html is not stamped ${config.version}`);
    if(!html.includes(`data-pw-release="${config.version}"`))errors.push(`dist-site/apps/${config.slug}/index.html is missing the release guard`);
  }
  if(await exists(path.join(directory,'release.json'))){
    try{const release=JSON.parse(await readFile(path.join(directory,'release.json'),'utf8'));if(release.version!==config.version)errors.push(`dist-site/apps/${config.slug}/release.json version mismatch`);if(!Array.isArray(release.files)||!release.files.includes('index.html'))errors.push(`dist-site/apps/${config.slug}/release.json has no file inventory`)}catch(error){errors.push(`dist-site/apps/${config.slug}/release.json is invalid: ${error.message}`)}
  }
}
if(await exists(path.join(output,'apps'))){const deployed=(await readdir(path.join(output,'apps'),{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name),expected=new Set(configs.map(config=>config.slug));for(const directory of deployed)if(!expected.has(directory))errors.push(`dist-site includes unregistered app directory ${directory}`)}
if(errors.length){console.error(`Production output validation failed with ${errors.length} issue(s):`);errors.forEach(error=>console.error(`- ${error}`));process.exit(1)}
console.log(`Production output contains ${configs.length} coherent stamped releases.`);
