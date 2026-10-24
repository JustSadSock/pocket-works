// Small read-only static server for the real Chyepukha browser QA.
// Serves source files from the repository; no live PocketNet or account access.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const port=Number(process.env.CHYEPUKHA_QA_PORT||4174);
const mime={
 '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.svg':'image/svg+xml',
 '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
 '.woff2':'font/woff2','.webmanifest':'application/manifest+json',
 '.ico':'image/x-icon','.mp3':'audio/mpeg','.ogg':'audio/ogg',
 '.wav':'audio/wav'
};
createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
  const url=new URL(req.url||'/', 'http://127.0.0.1');
  let pathname=decodeURIComponent(url.pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  const info=await stat(file);
  if(!info.isFile()){res.writeHead(404).end();return}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  if(req.method==='HEAD'){res.end();return}
  createReadStream(file).pipe(res);
 }catch{res.writeHead(404,{'content-type':'text/plain'}).end('Not found')}
}).listen(port,'127.0.0.1',()=>console.log('Chyepukha QA server on http://127.0.0.1:'+port));
