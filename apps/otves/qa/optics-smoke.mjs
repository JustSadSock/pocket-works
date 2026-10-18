// Browser acceptance test for real optical rendering. Run after npm ci and
// npx playwright install chromium: node apps/otves/qa/optics-smoke.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const mime={
  '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'
};
const server=createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    let path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(path!==root&&!path.startsWith(root+sep)) {
      res.writeHead(403).end('forbidden');return;
    }
    if(url.pathname.endsWith('/')) path=join(path,'index.html');
    const data=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream',
      'cache-control':'no-store'});
    res.end(data);
  } catch(error) {
    res.writeHead(404).end('not found');
  }
});

async function verify(page,label,evidence) {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(evidence.base+'/apps/otves/',{waitUntil:'domcontentloaded'});
  await page.locator('#continueButton').click();
  await page.waitForTimeout(800);
  const status=await page.evaluate(()=>{
    const surface=document.querySelector('canvas.spatial-canvas');
    const gl=surface?.getContext('webgl2');
    return {
      profile:surface?.dataset.renderProfile,
      refraction:surface?.dataset.opticalRefraction,
      glError:gl?gl.getError():null,
      screenWidth:surface?.width||0,screenHeight:surface?.height||0,
      playTime:document.querySelector('#timeValue')?.textContent,
      visible:surface?getComputedStyle(surface).display!=='none':false
    };
  });
  assert.equal(errors.length,0,label+': page errors: '+errors.join(' | '));
  assert.ok(status.visible,label+': 3D canvas must be visible');
  assert.ok(status.screenWidth>0&&status.screenHeight>0,label+': actual GPU canvas');
  assert.equal(status.glError,0,label+': no GL error after draw');
  await mkdir(evidence.dir,{recursive:true});
  await page.screenshot({path:join(evidence.dir,'optics-'+label+'.png')});
  return status;
}

let browser;
try {
  await new Promise((resolveReady)=>server.listen(0,'127.0.0.1',resolveReady));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:[
    '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader'
  ]});
  const evidence={base,dir:join(here,'evidence')};
  const hi=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  await hi.addInitScript(()=>{
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8,configurable:true});
    Object.defineProperty(navigator,'deviceMemory',{get:()=>8,configurable:true});
  });
  const hiPage=await hi.newPage();
  const highStatus=await verify(hiPage,'high',evidence);
  assert.equal(highStatus.profile,'high');
  assert.equal(highStatus.refraction,'true');
  await hi.close();

  const low=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  await low.addInitScript(()=>{
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2,configurable:true});
    Object.defineProperty(navigator,'deviceMemory',{get:()=>2,configurable:true});
  });
  const lowPage=await low.newPage();
  const lowStatus=await verify(lowPage,'low',evidence);
  assert.equal(lowStatus.profile,'low');
  assert.equal(lowStatus.refraction,'false');
  await low.close();

  // A device without WebGL must still offer complete playable 2D input.
  const fallback=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  await fallback.addInitScript(()=>{
    const old=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(type==='webgl2') return null;
      return old.call(this,type,...args);
    };
  });
  const fallbackPage=await fallback.newPage();
  await fallbackPage.goto(base+'/apps/otves/',{waitUntil:'domcontentloaded'});
  await fallbackPage.locator('#continueButton').click();
  await fallbackPage.waitForTimeout(200);
  assert.equal(await fallbackPage.locator('canvas.spatial-canvas').count(),0);
  assert.equal(await fallbackPage.locator('#pauseButton').isEnabled(),true);
  await fallback.close();
  console.log('OTVES optical browser acceptance PASS',JSON.stringify({highStatus,lowStatus}));
} finally {
  await browser?.close();
  await new Promise((resolveDone)=>server.close(resolveDone));
}
