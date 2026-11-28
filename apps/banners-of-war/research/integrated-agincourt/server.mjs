import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const previewPath='/apps/banners-of-war/research/integrated-agincourt/';
export async function startPreview(assets,port=0){
 const root=process.cwd(),art=resolve(assets),base='/apps/banners-of-war/';
 const html=(await readFile(resolve(root,'apps/banners-of-war/index.html'),'utf8')).replace('<head>','<head><base href="'+base+'">').replace(/<script type="module" src="\.\.\/\.\.\/shared\/update-manager\.js"[^>]*><\/script>/,'').replace('src="./app.js"','src="./research/integrated-agincourt/entry.js"');
 if(html.includes('data-service-worker=')||!html.includes('integrated-agincourt/entry.js'))throw Error('Unsafe preview shell');
 const server=createServer(async(req,res)=>{try{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path===previewPath){res.setHeader('Content-Type','text/html');res.end(html);return}
  let evidence=path.startsWith('/art-evidence/'),folder=evidence?art:root,file=resolve(folder,'.'+(evidence?path.slice('/art-evidence'.length):path));
  if(!file.startsWith(folder+sep))throw Error('path');
  if(path.endsWith('/'))file=resolve(file,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file))
 }catch{res.statusCode=404;res.end()}});
 await new Promise(ok=>server.listen(port,'127.0.0.1',ok));return {server,url:'http://127.0.0.1:'+server.address().port+previewPath}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){let assets=process.env.BOW_ART_OUTPUT;if(!assets)throw Error('Set BOW_ART_OUTPUT to extracted candidate artifact directory');let {url}=await startPreview(assets,Number(process.env.PORT||4179));console.log(url)}
