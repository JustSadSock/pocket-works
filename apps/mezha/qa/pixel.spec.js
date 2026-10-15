import {test,expect} from '@playwright/test';

test('pixel battlefield, commands, camera and responsive overlays',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/mezha/?pw-qa-pixel=1');
 await expect(page.locator('#startBtn')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('01-menu.png')});
 await page.locator('#startBtn').click();
 await expect(page.locator('#startScreen')).toBeHidden();
 await expect(page.locator('#field')).toBeVisible();
 await expect(page.locator('#clock')).toHaveText('00:00');
 await page.waitForTimeout(500);
 const sample=()=>page.locator('#field').evaluate(canvas=>{
  const ctx=canvas.getContext('2d'),{width:w,height:h}=canvas;
  const data=ctx.getImageData(0,0,w,h).data,colors=new Set();
  for(let y=0;y<h;y+=17)for(let x=0;x<w;x+=17){
   const i=(y*w+x)*4;colors.add([data[i],data[i+1],data[i+2]].join(','));
  }
  return{w,h,unique:colors.size};
 });
 const before=await sample();
 expect(before.w).toBeGreaterThan(160);
 expect(before.h).toBeGreaterThan(160);
 expect(before.unique).toBeGreaterThan(18); // real terrain tiles and buildings, not an empty canvas
 await page.screenshot({path:testInfo.outputPath('02-battle.png')});
 await page.locator('#cap1').click();
 await expect(page.locator('#cap1')).toHaveAttribute('aria-pressed','true');
 await page.locator('#defend').click();
 await expect(page.locator('#defend')).toHaveClass(/active/);
 const bounds=await page.locator('#field').boundingBox();
 expect(bounds).toBeTruthy();
 await page.mouse.click(bounds.x+bounds.width*.46,bounds.y+bounds.height*.45);
 await expect(page.locator('#toast')).toContainText('Приказ отдан');
 await page.locator('#recruitBtn').click();
 await expect(page.locator('#recruitPanel')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('03-recruit.png')});
 await page.locator('[data-recruit="levy"]').click();
 await expect(page.locator('#troopCount')).toContainText('5 / 12');
 await page.locator('#zoomPlus').click();
 await page.locator('#minimap').click({position:{x:90,y:46}});
 await page.waitForTimeout(260);
 await page.screenshot({path:testInfo.outputPath('04-camera.png')});
 const after=await sample();
 expect(after.unique).toBeGreaterThan(18);
 const overflow=await page.evaluate(()=>({
  x:document.documentElement.scrollWidth-innerWidth,
  y:document.documentElement.scrollHeight-innerHeight
 }));
 expect(overflow.x).toBeLessThanOrEqual(2);
 expect(overflow.y).toBeLessThanOrEqual(2);
 await page.locator('#pauseBtn').click();
 await expect(page.locator('#pauseScreen')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('05-pause.png')});
 await page.locator('#resumeBtn').click();
 await expect(page.locator('#pauseScreen')).toBeHidden();
 expect(errors).toEqual([]);
});

test('autosave continues after reload and orders remain functional',async({page})=>{
 await page.goto('/apps/mezha/?pw-qa-persist=1');
 await page.locator('#startBtn').click();
 await page.locator('#cap0').click();
 const b=await page.locator('#field').boundingBox();
 await page.mouse.click(b.x+b.width*.35,b.y+b.height*.42);
 await page.reload();
 await expect(page.locator('#continueBtn')).toBeVisible();
 await page.locator('#continueBtn').click();
 await expect(page.locator('#startScreen')).toBeHidden();
 await expect(page.locator('#troopCount')).toContainText('4 / 12');
});