// app.config.json owns duplicated install/release metadata. No gameplay edits.
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { collectAppConfigs } from './app-config.mjs';
export function canonicalManifest(manifest, config) {
  return {...manifest,id:`/apps/${config.slug}/`,name:config.name,short_name:config.shortName,
    description:config.description,orientation:config.orientation,
    background_color:config.backgroundColor,theme_color:config.themeColor,start_url:'./',scope:'./'};
}
export function canonicalWorker(source, config) {
  // Older authored workers use CACHE instead of CACHE_NAME. Preserve their code.
  const prefixMatch=source.match(/\bconst\s+CACHE_PREFIX\s*=\s*['"]([^'"]+)['"]/);
  if(prefixMatch && [config.slug+'-', 'pocket-works-'+config.slug+'-'].includes(prefixMatch[1])) {
    source=source.replace(prefixMatch[0], prefixMatch[0].replace(prefixMatch[1],config.slug+'-'));
    source=source.replace(/(\b(?:const|let)\s+CACHE_NAME\s*=\s*)`\$\{CACHE_PREFIX\}[^`]+`/,(_,prefix)=>prefix+JSON.stringify(config.cacheName));
  }
  const match=source.match(/\b(?:const|let)\s+(CACHE_NAME|CACHE)\s*=\s*(['"`])([^'"`]+)\2/)
    || source.match(/,\s*(CACHE_NAME|CACHE)\s*=\s*(['"`])([^'"`]+)\2/);
  if(!match) {
    if(config.runtime !== 'enhanced' || !source.includes('setCacheNameDetails') || !source.includes(config.slug)) throw Error(`${config.slug}: no static owned cache declaration`);
    return source.replace(/(\b(?:const|let)\s+APP_VERSION\s*=\s*)(['"`])[^'"`]+\2/, (_, prefix) => prefix+JSON.stringify(config.version));
  }
  if(!match[3].startsWith(config.slug+'-')) throw Error(`${config.slug}: cache belongs to another app`);
  let result=source.replace(match[0],match[0].replace(match[2]+match[3]+match[2],match[2]+config.cacheName+match[2]));
  if(match[1]==='CACHE') result=result.replace(/\bCACHE\b/g,'CACHE_NAME');
  // Both prefixes are app-isolated; use the documented slug- form consistently.
  result=result.replace(new RegExp(`(['"])${config.slug}-v\\1`,'g'),JSON.stringify(config.slug+'-'));
  return result;
}
export async function syncMetadata(root=process.cwd()) {
  let changed=0;
  for(const config of await collectAppConfigs(root)) {
    if(config.runtime==='godot') continue; // Generated exports belong to Godot workflow.
    const dir=path.join(root,'apps',config.slug);
    const manifestPath=path.join(dir,'manifest.webmanifest');
    try { await access(manifestPath); const old=await readFile(manifestPath,'utf8');
      const parsed=JSON.parse(old); const next=canonicalManifest(parsed,config);
      if(JSON.stringify(next)!==JSON.stringify(parsed)){await writeFile(manifestPath,JSON.stringify(next,null,2)+'\n');changed++;}
    } catch(e){if(e.code!=='ENOENT')throw e;if(config.runtime!=='enhanced')throw e;}
    const workerPath=path.join(dir,config.runtime==='enhanced'?'source/sw.ts':'sw.js');
    const old=await readFile(workerPath,'utf8');const next=canonicalWorker(old,config);
    if(old!==next){await writeFile(workerPath,next);changed++;}
  }
  return changed;
}
if(process.argv[1] && import.meta.url===new URL(`file://${path.resolve(process.argv[1])}`).href)
  console.log(`Synchronized ${await syncMetadata()} app-owned metadata files from app.config.json.`);
