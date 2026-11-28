import {test,expect} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
async function snap(page:any,info:any,n:string){await page.waitForTimeout(100);return page.screenshot({path:info.outputPath(n+'.png')})}
test('isolated reference scenes: actual engine states, matched comparison, independent art review',async({page},info)=>{
 test.skip(info.project.name!=='desktop-chromium','Dedicated reference scene capture at 1440 × 900');
 test.setTimeout(180000);await page.setViewportSize({width:1440,height:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/banners-of-war/research/art-direction-reset/standalone.html');
 await page.waitForFunction(()=>!!(window as any).referenceQA&&(window as any).referenceQA.stats().sprites>0,{},{timeout:90000});
 await page.evaluate(()=>document.body.classList.add('clean'));let records:any[]=[],captures:{name:string,png:string}[]=[];
 for(const id of ['infantry','charge','ford','zama']){
  let m=await page.evaluate(id=>(window as any).referenceQA.load(id),id);expect(m.measure.peakContact).toBeGreaterThan(0);if(id==='zama')expect(m.measure.count).toBe(158);
  let settings=[];for(const close of [false,true]){
   let a=await page.evaluate(close=>(window as any).referenceQA.view('C',close),close);expect(a.sprites).toBeGreaterThan(0);let name='reference-'+id+'-'+(close?'close':'tactical');captures.push({name,png:(await snap(page,info,name)).toString('base64')});
   let b=await page.evaluate(()=>(window as any).referenceQA.compare(true));await snap(page,info,name+'-dd90cbf');await page.evaluate(()=>(window as any).referenceQA.compare(false));settings.push({close,current:a,baseline:b})
  }
  await page.evaluate(()=> (window as any).referenceQA.view('C',false));
  let motion=await page.evaluate(async best=>{let qa=(window as any).referenceQA,out=[];for(let i=Math.max(0,best-12);i<=Math.min(qa.frames()-1,best+24);i++){await new Promise(r=>requestAnimationFrame(r));out.push(qa.show(i))}return out},m.best);expect(motion.length).toBeGreaterThan(2);records.push({...m,settings,motion});
 }
 const sheet=await page.evaluate(async captures=>{
  const canvas=document.createElement('canvas'),w=720,h=450,label=34;canvas.width=w*2;canvas.height=(h+label)*4;
  const g=canvas.getContext('2d')!;g.fillStyle='#181818';g.fillRect(0,0,canvas.width,canvas.height);g.font='20px sans-serif';
  for(let i=0;i<captures.length;i++){const item=captures[i],im=new Image();im.src='data:image/png;base64,'+item.png;await im.decode();const x=i%2*w,y=Math.floor(i/2)*(h+label);g.fillStyle='#ffffff';g.fillText(item.name,x+12,y+24);g.drawImage(im,x,y+label,w,h)}
  return canvas.toDataURL('image/png').split(',')[1];
 },captures);
 expect(captures.length).toBe(8);await writeFile(info.outputPath('reference-contact-sheet.png'),Buffer.from(sheet,'base64'));
 await writeFile(info.outputPath('art-direction-reset-measurements.json'),JSON.stringify(records,null,2));await writeFile(info.outputPath('art-direction-reset.html'),await readFile(resolve('apps/banners-of-war/research/art-direction-reset/standalone.html')));expect(errors).toEqual([]);
});
