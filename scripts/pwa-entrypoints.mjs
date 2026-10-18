import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
export function localScripts(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']((?:\.\/)?[^"':]+\.m?js(?:\?[^"']*)?)["']/gi)]
    .map(m=>'./'+m[1].replace(/^\.\//,'').split('?')[0]);
}
export function appOwnedScripts(html) {
  return localScripts(html).filter(script => !script.slice(2).startsWith('../'));
}
export function hasWorkerRegistration(source, html) {
  return /serviceWorker\.register\(\s*['"`]\.\/sw\.js(?:\?[^'"`]*)?['"`]\s*[,)]/.test(source+'\n'+html) ||
    /registerManagedServiceWorker\(\s*\{[^}]*path\s*:\s*['"]\.\/sw\.js['"]/.test(source) ||
    (html.includes('data-update-manager') && /data-service-worker=["']\.\/sw\.js(?:\?[^"']*)?["']/.test(html));
}
export async function entrySources(root, html) {
  const pending=localScripts(html).map(s=>path.resolve(root,s));const visited=new Set();const parts=[];
  while(pending.length) {
    const file=pending.pop();if(visited.has(file)||!file.startsWith(root+path.sep))continue;visited.add(file);
    const source=await readFile(file,'utf8');parts.push(source);
    for(const match of source.matchAll(/['"`]((?:\.\/|\.\.\/)[^'"`?]+\.m?js)(?:\?[^'"`]*)?['"`]/g)) {
      const next=path.resolve(path.dirname(file),match[1]);
      if(!next.startsWith(root+path.sep))continue;
      try {await access(next);pending.push(next);}catch{}
    }
  }
  return parts.join('\n');
}
