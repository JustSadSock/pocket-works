import {test,expect,chromium,webkit} from '@playwright/test';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {DEV_SCENES} from '../dev-gallery.js';

test('all 45 QA screens: stable screenshots, interactive layout, real DOM and no runtime errors on phone and PC',async({browser},info)=>{
 test.skip(info.project.name!=='desktop-chromium','Dedicated cross-viewport suite handles phone and PC without multiplying browser projects');
 test.setTimeout(420_000);
 expect(DEV_SCENES).toHaveLength(45);
 const report={version:1,scenes:DEV_SCENES.length,results:[],errors:[]};
 const targets=[{name:'phone',width:390,height:844},{name:'desktop',width:1280,height:800}];
 const staticScene=id=>!(/^(anim-|fx-)/.test(id)||['replay-playing','sounds','lobby-connect','toast'].includes(id));
 for(const target of targets){
  const context=await browser.newContext({
   viewport:{width:Math.max(420,target.width),height:Math.max(850,target.height)},
   reducedMotion:'reduce',serviceWorkers:'block',deviceScaleFactor:1
  });
  const page=await context.newPage();
  const issues=[];
  page.on('pageerror',e=>issues.push('error: '+e.message));
  try{
   await page.goto('/apps/crossline-5x5/',{waitUntil:'domcontentloaded'});
   await expect(page.locator('#solo')).toBeVisible();
   await page.locator('header [data-workshop-trigger]').click();
   await expect(page.locator('#arenaDevGallery')).toBeVisible();
   // The gallery hosts actual same-origin app instances, not screenshot mocks.
   if(target.name!=='phone')await page.locator('[data-arena-device="'+target.name+'"]').click();
   const frame=page.frameLocator('.arena-dev__frame');
   for(const scene of DEV_SCENES){
    issues.length=0;
    await page.evaluate(id=>{const button=document.querySelector('[data-arena-scene="'+id+'"]');if(!button)throw Error('Missing dev scene '+id);button.click()},scene.id);
    await expect(frame.locator('main.shell')).toBeVisible({timeout:12000});
    await expect.poll(async()=>frame.locator('body').evaluate(el=>
      el.ownerDocument.defaultView.location.search.includes('__arena_dev='+scene.id)
    )).toBe(true);
    await frame.locator('body').evaluate(el=>{
     el.ownerDocument.documentElement.dataset.motion='off';
     el.ownerDocument.documentElement.classList.add('qa-snapshot');
    });
    // Allow one browser paint after scripted scene initialization.
    await frame.locator('main.shell').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const metrics=await frame.locator('body').evaluate(el=>{
     const d=el.ownerDocument,view=d.defaultView,html=d.documentElement;
     const shown=[...d.querySelectorAll('#menu,#difficultyView,#lobby,#play,#replay,#archive')]
      .filter(node=>!node.classList.contains('hidden')&&!node.hidden).map(node=>node.id);
     const modals=[...d.querySelectorAll('#modal,#arenaSettings')]
      .filter(node=>!node.classList.contains('hidden')&&!node.hidden).map(node=>node.id);
     return {width:view.innerWidth,height:view.innerHeight,
      scrollW:html.scrollWidth,scrollH:html.scrollHeight,
      boardCells:d.querySelectorAll('#board>.cell').length,
      shown,modals,text:d.body.innerText.slice(0,300).trim()};
    });
    expect(metrics.width).toBe(target.width);
    expect(metrics.height).toBe(target.height);
    expect(metrics.scrollW,'horizontal overflow '+scene.id+' '+target.name).toBeLessThanOrEqual(target.width+3);
    expect(metrics.scrollH,'vertical overflow '+scene.id+' '+target.name).toBeLessThanOrEqual(target.height+3);
    expect(metrics.shown.length,'missing scene '+scene.id).toBeGreaterThan(0);
    if(metrics.shown.includes('play'))expect(metrics.boardCells).toBe(25);
    expect(metrics.text.length,'empty screen '+scene.id).toBeGreaterThan(8);
    const image=await frame.locator('body').screenshot({
     path:info.outputPath('arena-'+target.name+'-'+scene.id+'.png'),
     animations:'disabled',timeout:12000
    });
    expect(image.length).toBeGreaterThan(2200);
    let stable=null;
    if(staticScene(scene.id)){
     const repeat=await frame.locator('body').screenshot({animations:'disabled',timeout:12000});
     stable=image.equals(repeat);
     expect(stable,'visual instability in '+target.name+'/'+scene.id).toBe(true);
    }
    const hash=createHash('sha256').update(image).digest('hex').slice(0,20);
    report.results.push({viewport:target.name,id:scene.id,hash,bytes:image.length,stable,metrics});
    expect(issues,'console/runtime errors in '+scene.id).toEqual([]);
   }
  }finally{report.errors.push(...issues);await context.close();}
 }
 await writeFile(info.outputPath('visual-regression-index.json'),JSON.stringify(report,null,2));
 expect(report.results).toHaveLength(90);
});

test('phone landscape and desktop large: all command controls stay inside viewport',async({page},info)=>{
 const devices=[{label:'landscape',width:844,height:390},{label:'small-phone',width:360,height:740},
 {label:'desktop',width:1280,height:800}];
 for(const shape of devices){
  await page.setViewportSize(shape);
  await page.goto('/apps/crossline-5x5/',{waitUntil:'domcontentloaded'});
  await page.locator('#solo').click();
  await page.locator('[data-difficulty-choice="easy"]').click();
  await page.locator('[data-dir="right"]').click();
  await page.locator('[data-slot="0"]').click();
  const actual=await page.evaluate(()=>{
   const ids=['board','slots','editBar','controls','submit'],bounds=[];
   for(const id of ids){const e=document.getElementById(id),r=e.getBoundingClientRect();
    bounds.push({id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
   }
   return {bounds,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};
  });
  expect(actual.scrollWidth).toBeLessThanOrEqual(shape.width+3);
  expect(actual.scrollHeight).toBeLessThanOrEqual(shape.height+3);
  for(const b of actual.bounds){
   expect(b.width,b.id).toBeGreaterThan(0);
   expect(b.height,b.id).toBeGreaterThan(0);
   expect(b.right,b.id).toBeLessThanOrEqual(shape.width+3);
   expect(b.bottom,b.id).toBeLessThanOrEqual(shape.height+3);
  }
  await page.screenshot({path:info.outputPath('arena-control-layout-'+shape.label+'.png')});
 }
});
