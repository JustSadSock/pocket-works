import {test,expect} from '@playwright/test';

test('combat v0.8: actual projectile and mine warnings render without changing simulation',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await expect(page.locator('#controls')).toBeVisible();
 const inspected=await page.evaluate(async()=>{
  const {combatCues,drawGroundCues,drawActorCues}=await import('/apps/perekos/combat-readability.mjs');
  const s=window.__perekosTest.state;
  s.actors[0].x=165;s.actors[0].y=320;s.actors[0].heat=94;
  s.actors[1].x=325;s.actors[1].y=320;
  s.barriers=[];s.shots=[{owner:1,x:85,y:320,vx:280,vy:0,r:5,element:'storm',style:'bolt',life:1,damage:10,bounces:0,depth:0}];
  s.mines=[{owner:1,x:190,y:360,r:21,life:2,damage:10,element:'fire'}];
  const before=JSON.stringify(s),cues=combatCues(s,0);
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;
  const c=canvas.getContext('2d');
  drawGroundCues(c,s,0,1.5,false);
  drawActorCues(c,s.actors[0],165,320,true,1.5,false);
  const data=c.getImageData(0,0,400,620).data;
  let painted=0;for(let i=3;i<data.length;i+=4)if(data[i])painted++;
  return {same:before===JSON.stringify(s),shots:cues.shots.length,mines:cues.mines.length,
   imminent:cues.shots[0]?.imminent,painted};
 });
 expect(inspected.same).toBe(true);
 expect(inspected.shots).toBe(1);
 expect(inspected.mines).toBe(1);
 expect(inspected.imminent).toBe(true);
 expect(inspected.painted).toBeGreaterThan(110);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('perekos-v08-tactical-danger',{body:await page.screenshot(),contentType:'image/png'});
 const doc=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 expect(doc.scroll).toBeLessThanOrEqual(doc.width+1);
 expect(errors).toEqual([]);
});

test('combat v0.8: reduced motion visual cues remain visible without pulsing camera',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const cues=await page.evaluate(async()=>{
  const {combatCues,drawGroundCues,drawActorCues}=await import('/apps/perekos/combat-readability.mjs');
  const s={phase:'fight',actors:[{x:135,y:310,heat:96},{x:300,y:310,heat:20}],
   shots:[{owner:1,x:65,y:310,vx:270,vy:0,r:4,life:.9}],mines:[],barriers:[]};
  const cv=document.createElement('canvas');cv.width=400;cv.height=620;
  const c=cv.getContext('2d');
  drawGroundCues(c,s,0,0,true);drawActorCues(c,s.actors[0],135,310,true,0,true);
  const before=c.getImageData(0,0,400,620).data.slice();
  c.clearRect(0,0,400,620);
  drawGroundCues(c,s,0,12,true);drawActorCues(c,s.actors[0],135,310,true,12,true);
  const after=c.getImageData(0,0,400,620).data;
  return {danger:combatCues(s).shots[0].imminent,same:before.every((v,i)=>v===after[i])};
 });
 expect(cues.danger).toBe(true);
 expect(cues.same).toBe(true);
});
