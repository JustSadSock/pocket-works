import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const out='petlya-creative-evidence';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const [name,viewport,mobile] of [['desktop',{width:1280,height:720},false],['mobile-landscape',{width:844,height:390},true]]){
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:mobile?'reduce':'no-preference'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const states=[];
  async function capture(label){
   const png=await page.screenshot({path:out+'/'+name+'-'+label+'.png',timeout:60000});
   const geometry=await page.evaluate(()=>{
    const rect=document.querySelector('#renderCanvas').getBoundingClientRect();
    const cue=document.querySelector('#cornerCue').getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,canvas:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},cueRight:cue.right,scrollWidth:document.documentElement.scrollWidth,bootError:document.documentElement.dataset.bootError??null};
   });
   const pixels=await page.evaluate(async data=>{
    const bytes=Uint8Array.from(atob(data),v=>v.charCodeAt(0));
    const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=18;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,32,18);
    const d=ctx.getImageData(0,0,32,18).data,colors=new Set();let min=255,max=0;
    for(let i=0;i<d.length;i+=4){colors.add([d[i]>>4,d[i+1]>>4,d[i+2]>>4].join(','));const lum=(d[i]+d[i+1]+d[i+2])/3;min=Math.min(min,lum);max=Math.max(max,lum);}
    image.close();return {colors:colors.size,range:max-min};
   },png.toString('base64'));
   assert.equal(geometry.bootError,null);assert.ok(geometry.canvas.width>=viewport.width-1&&geometry.canvas.height>=viewport.height-1,'Canvas must fill landscape');
   assert.ok(geometry.cueRight<=viewport.width+1,'Turn cue extends outside viewport');
   assert.ok(geometry.scrollWidth<=viewport.width+1,'Horizontal overflow');
   assert.ok(pixels.colors>=12&&pixels.range>=35,'Screenshot lacks rendered variation');
   states.push({label,sha256:createHash('sha256').update(png).digest('hex'),geometry,pixels});
  }
  try{
   const res=await page.goto('http://127.0.0.1:4173/apps/petlya-17/',{waitUntil:'domcontentloaded',timeout:120000});
   assert.equal(res.status(),200);
   await page.locator('#menu').waitFor({state:'visible',timeout:120000});
   await capture('initial');
   await page.locator('#practice').click({timeout:30000});
   await page.locator('#controls').waitFor({state:'visible',timeout:30000});
   await page.locator('#minimap').waitFor({state:'visible',timeout:30000});
   await page.locator('#steerPad').waitFor({state:'visible',timeout:30000});
   await capture('action');
   const gas=await page.locator('#gas').boundingBox();assert.ok(gas);
   await page.mouse.move(gas.x+gas.width/2,gas.y+gas.height/2);await page.mouse.down();
   try{await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>10,{},{timeout:60000});}finally{await page.mouse.up();}
   await capture('settled');
   await page.locator('#pauseButton').click({timeout:30000});
   await page.locator('#pause').waitFor({state:'visible',timeout:30000});
   await page.locator('#controls').waitFor({state:'hidden',timeout:30000});
   await capture('paused');
   await page.locator('#resume').click({timeout:30000});
   await page.locator('#controls').waitFor({state:'visible',timeout:30000});
   assert.equal(new Set(states.map(s=>s.sha256)).size,states.length,'Screenshots must reflect actual state changes');
   assert.deepEqual(errors,[]);reports.push({name,states,success:true});
  }finally{await context.close();}
 }
}finally{await browser.close();writeFileSync(out+'/report.json',JSON.stringify({reports,success:reports.length===2&&reports.every(r=>r.success),scope:'Automated visual-state, interaction and bounds checks; not a human art-quality review'},null,2));}
console.log('Petlya 17 visual evidence: '+reports.length+'/2 landscape configurations');
