import {test,expect} from '@playwright/test';

const DIR=['E','SE','S','SW','W','NW','N','NE'];
test('v0.14: screenshot 48 directional outfits and verify back/side/front faces',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {drawMage}=await import('/apps/perekos/mage-art.mjs');
  const {MAGES}=await import('/apps/perekos/mages.mjs');
  const {faceView}=await import('/apps/perekos/mage-facing.mjs');
  const labels=['E','SE','S','SW','W','NW','N','NE'];
  const w=155,h=150,canvas=document.createElement('canvas');
  canvas.width=MAGES.length*w;canvas.height=labels.length*h;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  const views=[];
  for(let row=0;row<labels.length;row++){
   for(let col=0;col<MAGES.length;col++){
    const mage=MAGES[col],bearing=row*Math.PI/4;
    c.fillStyle=(row+col)%2?'#304637':'#273c35';
    c.fillRect(col*w,row*h,w,h);
    c.strokeStyle='#8a927453';c.strokeRect(col*w+.5,row*h+.5,w-1,h-1);
    const temp=document.createElement('canvas');temp.width=145;temp.height=125;
    const t=temp.getContext('2d');t.imageSmoothingEnabled=false;
    drawMage(t,undefined,{x:72,y:85,scale:1.33,time:.25,mageId:mage.id,
      face:bearing,pose:{still:true}});
    const d=t.getImageData(0,0,temp.width,temp.height).data;
    let hash=2166136261,opaque=0;
    for(let j=0;j<d.length;j+=4){
     hash=Math.imul(hash^(d[j])^(d[j+1]<<8)^(d[j+2]<<16)^(d[j+3]<<24),16777619)>>>0;
     if(d[j+3]>0)opaque++;
    }
    c.drawImage(temp,col*w+5,row*h+23);
    c.fillStyle='#ebdfb8';c.font='bold 12px monospace';
    c.fillText(mage.id.toUpperCase()+' / '+labels[row],col*w+8,row*h+16);
    views.push({mage:mage.id,direction:labels[row],hash,opaque,
      view:faceView(bearing).label});
   }
  }
  return {png:canvas.toDataURL('image/png'),views};
 });
 expect(result.views).toHaveLength(48);
 for(const m of ['kindle','cinder','wire','coil','pebble','slate']){
  const a=result.views.filter(v=>v.mage===m);
  expect(a).toHaveLength(8);
  expect(new Set(a.map(x=>x.hash)).size).toBe(8);
  expect(a.every(x=>x.opaque>250)).toBe(true);
 }
 expect(result.views.every(x=>x.direction===x.view)).toBe(true);
 await testInfo.attach('eight-direction-six-class-character-atlas',
   {body:Buffer.from(result.png.split(',')[1],'base64'),contentType:'image/png'});
 await page.locator('#choose-mage').click();
 await expect(page.locator('#mage-options .mage-option')).toHaveCount(6);
 await testInfo.attach('directional-classes-desktop',{body:await page.screenshot(),contentType:'image/png'});
 expect(errors).toEqual([]);
});

test('v0.14: physical projectile rays remain accurate after sprite direction changes',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await expect(page.locator('#controls')).toBeVisible();
 const results=await page.evaluate(async()=>{
  const {MAGES}=await import('/apps/perekos/mages.mjs');
  const {makeMatch,tick,STEP}=await import('/apps/perekos/core.mjs');
  const {weaponRotation,faceView,signedTurn}=await import('/apps/perekos/mage-facing.mjs');
  const empty={x:0,y:0,attack:false,shield:false,dash:false};
  const rows=[];
  for(const mage of MAGES)for(let i=0;i<8;i++){
   const theta=i*Math.PI/4,s=makeMatch(157,mage.id,'pebble');
   s.actors[0].x=200;s.actors[0].y=310;
   s.actors[0].face=theta;
   const aim={x:200+Math.cos(theta)*122,y:310+Math.sin(theta)*122};
   tick(s,{x:0,y:0,attack:true,aim},STEP,empty);
   const shot=s.shots.find(q=>q.owner===0);
   const heading=Math.atan2(shot.vy,shot.vx);
   const view=faceView(theta),r=weaponRotation(theta,view.shoulderScale,.15);
   const mirror=Math.cos(theta)<-.12?-1:1;
   const artAngle=Math.atan2(-Math.cos(r+.15),
      mirror*view.shoulderScale*Math.sin(r+.15));
   rows.push({mage:mage.id,direction:i,
    realError:signedTurn(heading,theta),artError:signedTurn(artAngle,theta)});
  }
  return {rows,width:document.documentElement.scrollWidth,viewport:innerWidth};
 });
 expect(results.rows).toHaveLength(48);
 for(const item of results.rows){
  expect(Math.abs(item.realError)).toBeLessThan(1e-7);
  expect(Math.abs(item.artError)).toBeLessThan(1e-7);
 }
 expect(results.width).toBeLessThanOrEqual(results.viewport+1);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('eight-way-combat-mobile',{body:await page.screenshot(),contentType:'image/png'});
});

test('v0.14: accessibility setting does not drift or tilt behind the aim',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const output=await page.evaluate(async()=>{
  const {MageMotion}=await import('/apps/perekos/mage-motion.mjs');
  const {signedTurn}=await import('/apps/perekos/mage-facing.mjs');
  const actor={id:0,mageId:'slate',face:0,cast:0,dash:0,flash:0,shield:0},motion=new MageMotion();
  motion.sample(actor,{x:180,y:310},0,1,true);
  actor.face=-Math.PI/2;actor.cast=.45;
  const pose=motion.sample(actor,{x:180,y:310},.016,1,true);
  return {error:signedTurn(pose.look,actor.face),motion:pose.move,
   weaponTilt:pose.weaponTilt,bodyBob:pose.bodyBob};
 });
 expect(Math.abs(output.error)).toBeLessThan(1e-9);
 expect(output.motion).toBe(0);expect(output.weaponTilt).toBe(0);expect(output.bodyBob).toBe(0);
});
