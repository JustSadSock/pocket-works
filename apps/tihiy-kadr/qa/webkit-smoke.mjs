// WebKit (mobile viewport) end-to-end MRX test. Linux WebKit is not iOS,
// but it catches WebKit WASM path failures that Chromium does not expose.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdtempSync,rmSync} from 'node:fs';
import {extname,resolve,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {handleMrxAsset} from '../../../pocketnet/mrx-assets.mjs';
import {webkit} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const temp=mkdtempSync(join(tmpdir(),'tihiy-mrx-'));
const file=join(temp,'tone.mp4');
const command=spawnSync('ffmpeg',[
 '-hide_banner','-loglevel','error',
 '-f','lavfi','-i','color=c=blue:s=320x180:r=15:d=2.5',
 '-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=2.5',
 '-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',
 '-b:a','128k','-movflags','+faststart','-y',file
 ],{encoding:'utf8'});
if(command.status!==0)throw Error('ffmpeg test fixture unavailable: '+command.stderr);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname.startsWith('/ai-assets/')){
   const upstream=await handleMrxAsset(new Request(u.href));
   res.writeHead(upstream.status,Object.fromEntries(upstream.headers));
   if(upstream.body)for await(const chunk of upstream.body)res.write(Buffer.from(chunk));
   return res.end();
  }
  const target=resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!target.startsWith(root+sep)){res.writeHead(403);return res.end()}
  const local=statSync(target).isDirectory()?join(target,'index.html'):target;
  res.writeHead(200,{'Content-Type':mime[extname(local)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(local));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await webkit.launch({headless:true});
const page=await browser.newPage({
 viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true,
 userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')console.error('[WebKit]',m.text().slice(0,500))});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/apps/tihiy-kadr/',{waitUntil:'load'});
 assert.equal(await page.locator('#chunk-size').inputValue(),'5','mobile defaults to memory-safe chunks');
 await page.locator('#file-input').setInputFiles(file);
 await page.waitForFunction(()=>!document.querySelector('#process-btn').disabled,null,{timeout:16000});
 await page.locator('#duration-seconds').fill('1');
 await page.locator('#process-btn').click();
 const outcome=await Promise.race([
  page.waitForSelector('#result-details:not(.hidden)',{timeout:180000}).then(()=>true),
  page.waitForSelector('#error:not(.hidden)',{timeout:180000}).then(()=>false)
 ]);
 if(!outcome)throw Error('MRX WebKit failure: '+await page.locator('#error').innerText()+'; errors='+JSON.stringify(errors));
 const download=page.waitForEvent('download',{timeout:20000});
 await page.locator('#wav-btn').click();
 assert.match((await download).suggestedFilename(),/no-dialogue\.wav$/);
 assert.deepEqual(errors,[]);
 console.log('WebKit mobile MRX passed · '+await page.locator('#inference-time').innerText());
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
 rmSync(temp,{recursive:true,force:true});
}
