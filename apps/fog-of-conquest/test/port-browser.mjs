import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const site=spawn('python3',['-m','http.server','8765','--directory','.'],{stdio:'ignore'});
const base='http://127.0.0.1:8765/apps/fog-of-conquest/';
let browser;
try {
  for(let n=0;n<45;n++){
    try {const response=await fetch(base);if(response.ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  await mkdir('/tmp/fog-port-shots/',{recursive:true});
  browser=await chromium.launch({headless:true});
  for(const item of [
    {name:'mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
    {name:'desktop',viewport:{width:1365,height:900},isMobile:false,hasTouch:false}
  ]){
    const context=await browser.newContext({viewport:item.viewport,isMobile:item.isMobile,hasTouch:item.hasTouch,deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    const result=await page.goto(base,{waitUntil:'domcontentloaded'});
    assert.equal(result.status(),200);
    await page.locator('#newGameBtn').click();
    await page.locator('#twoBtn').click();
    await page.waitForFunction(()=>window.units?.length>=4&&window.map?.length>0);
    const shape=await page.evaluate(()=>{
      const c=document.getElementById('canvas');
      const rect=c.getBoundingClientRect();
      return {width:rect.width,height:rect.height,rows:window.map.length,units:window.units.length,
        viewport:document.getElementById('battleViewport').getBoundingClientRect().width,
        mapHeight:document.getElementById('battleViewport').getBoundingClientRect().height,
        autosave:!!localStorage.getItem('focSave_autosave')};
    });
    assert.equal(shape.rows,20);
    assert(shape.units>=4);
    assert(shape.width>=item.viewport.width*.8);
    assert(shape.mapHeight>200);
    assert(shape.autosave,'autosave missing');
    await page.screenshot({path:'/tmp/fog-port-shots/'+item.name+'.png',fullPage:true});
    assert.deepEqual(errors,[],'Browser errors: '+errors.join('; '));
    await context.close();
  }
}finally{
  await browser?.close();
  site.kill();
}
