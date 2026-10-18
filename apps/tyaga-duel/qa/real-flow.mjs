import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root=resolve(fileURLToPath(new URL("../../../",import.meta.url)));
const types={".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".html":"text/html",".json":"application/json",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=createServer(async(request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  const file=resolve(root,"."+pathname,pathname.endsWith("/")?"index.html":"");
  if (!file.startsWith(root+sep)) {response.writeHead(403);response.end();return;}
  try {const bytes=await readFile(file);response.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream","cache-control":"no-store"});response.end(bytes);}
  catch {response.writeHead(404);response.end("Not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const browser=await chromium.launch({headless:true});
const output=process.env.PW_QA_OUTPUT_DIR||null;
if(output)await mkdir(output,{recursive:true});
let passed=0;
try {
  for (const size of [{width:390,height:844},{width:1366,height:768},{width:320,height:568}]) {
    const mobile=size.width<600;
    const context=await browser.newContext({viewport:size,isMobile:mobile,hasTouch:mobile,serviceWorkers:"block"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",err=>errors.push(err.message));
    await page.goto("http://127.0.0.1:"+server.address().port+"/apps/tyaga-duel/",{waitUntil:"domcontentloaded"});
    await page.locator("#aiButton").waitFor({timeout:10000});
    assert.equal(await page.locator("#menuScreen").isVisible(),true);
    const fit=await page.evaluate(()=>{
      const ids=["aiButton","localButton","arenaPrev","arenaNext","menuSound"];
      return {overflow:document.documentElement.scrollHeight-innerHeight,buttons:ids.map(id=>{
        const r=document.getElementById(id).getBoundingClientRect();
        return {id,top:r.top,bottom:r.bottom,left:r.left,right:r.right};
      })};
    });
    assert.ok(fit.overflow<4,"Unexpected document scrolling: "+JSON.stringify(fit));
    assert.ok(fit.buttons.every(b=>b.top>=0&&b.bottom<=size.height+2&&b.left>=0&&b.right<=size.width+2),"Menu clipped: "+JSON.stringify(fit));
    if(output)await page.screenshot({path:join(output,"tyaga-menu-"+size.width+".png")});
    await page.locator("#arenaNext").click();
    assert.equal(await page.locator("#arenaName").textContent(),"РИКОШЕТ");
    await page.locator("#arenaPrev").click();
    assert.equal(await page.locator("#arenaName").textContent(),"ПУСТОТА");
    await page.locator("#menuSound").click();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#aiButton").waitFor();
    assert.equal(await page.locator("#menuSound").textContent(),"ЗВУК: ВЫКЛ");
    await page.locator("#localButton").click();
    assert.equal(await page.locator("#menuScreen").isVisible(),false);
    assert.equal(await page.locator("#hud").isVisible(),true);
    await page.locator("#pauseButton").click();
    assert.equal(await page.locator("#pauseScreen").isVisible(),true);
    if(output)await page.screenshot({path:join(output,"tyaga-pause-"+size.width+".png")});
    await page.locator("#resumeButton").click();
    assert.equal(await page.locator("#pauseScreen").isVisible(),false);
    if(output)await page.screenshot({path:join(output,"tyaga-play-"+size.width+".png")});
    await page.keyboard.press("s");
    await page.waitForFunction(()=>document.getElementById("bottomScore").textContent==="1",null,{timeout:4500});
    await page.waitForFunction(()=>document.getElementById("pointBanner").hidden,null,{timeout:3500});
    for(let goal=1;goal<=5;goal++){
      await page.keyboard.press("w");
      await page.waitForFunction(value=>document.getElementById("topScore").textContent===String(value),goal,{timeout:4500});
      if(goal<5) await page.waitForFunction(()=>document.getElementById("pointBanner").hidden,null,{timeout:3500});
    }
    assert.equal(await page.locator("#resultScreen").isVisible(),true,"Match must reach result");
    assert.equal(await page.locator("#resultScore").textContent(),"5 : 1");
    if(output)await page.screenshot({path:join(output,"tyaga-result-"+size.width+".png")});
    await page.locator("#rematchButton").click();
    assert.equal(await page.locator("#topScore").textContent(),"0");
    assert.equal(await page.locator("#bottomScore").textContent(),"0");
    await page.locator("#pauseButton").click();
    await page.on("dialog",dialog=>dialog.accept());
    await page.locator("#pauseHome").click();
    await page.locator("#arenaNext").click();
    assert.equal(await page.locator("#arenaName").textContent(),"РИКОШЕТ");
    await page.locator("#aiButton").click();
    await page.locator("#field").click({position:{x:size.width<600?size.width*.5:190,y:size.height*.52}});
    await page.waitForTimeout(650);
    if(output)await page.screenshot({path:join(output,"tyaga-kinetic-"+size.width+".png")});
    assert.equal(await page.locator("#hud").isVisible(),true);
    assert.deepEqual(errors,[],"Unexpected page errors");
    await context.close();passed++;
  }
} finally {await browser.close();await new Promise(done=>server.close(done));}
console.log("TYAGA browser flow PASS across "+passed+" viewports");
