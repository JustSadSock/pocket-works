import {test,expect} from '@playwright/test';

test('v0.13: full-resolution cast, movement and damage contact sheet for six human-readable silhouettes',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {drawMage}=await import('/apps/perekos/mage-art.mjs');
  const {MAGES}=await import('/apps/perekos/mages.mjs');
  const {basePose}=await import('/apps/perekos/mage-motion.mjs');
  const {garbSignature}=await import('/apps/perekos/mage-regalia.mjs');
  const samples=[
   {name:'REST',cast:0,pose:basePose(),guard:0,hit:0},
   {name:'STRIDE',cast:0,pose:{...basePose(),move:1,step:2.1,footSpread:5,cloth:4,scarf:6},guard:0,hit:0},
   {name:'WINDUP',cast:.54,pose:{...basePose(),attack:1,windup:1,crouch:4,weaponRise:12,weaponTilt:-.5},guard:0,hit:0},
   {name:'STRIKE',cast:.27,pose:{...basePose(),attack:.7,release:1,weaponRise:-8,weaponTilt:.32,shoulderTurn:.13},guard:0,hit:0},
   {name:'RECOVER',cast:.08,pose:{...basePose(),attack:.2,recover:1,weaponTilt:.12,scarf:3},guard:0,hit:0},
   {name:'BLOCK',cast:0,pose:{...basePose(),guard:1,footSpread:4},guard:40,hit:0},
   {name:'HURT',cast:0,pose:{...basePose(),impact:1,headTilt:-.14,bodyBob:3},guard:0,hit:.16}
  ];
  const cellWidth=174,cellHeight=164;
  const atlas=document.createElement('canvas');
  atlas.width=cellWidth*MAGES.length;atlas.height=cellHeight*samples.length;
  const c=atlas.getContext('2d');c.imageSmoothingEnabled=false;
  c.fillStyle='#21342b';c.fillRect(0,0,atlas.width,atlas.height);
  const classes=[],stateHashes=[];
  for(let row=0;row<samples.length;row++){
   for(let col=0;col<MAGES.length;col++){
    const mage=MAGES[col],s=samples[row];
    const x=col*cellWidth,y=row*cellHeight;
    c.fillStyle=(row+col)%2?'#2f4337':'#2a3d34';
    c.fillRect(x+1,y+1,cellWidth-2,cellHeight-2);
    c.fillStyle='#e0c99e';c.font='bold 12px monospace';
    c.fillText(mage.name+' / '+s.name,x+9,y+17);
    const mini=document.createElement('canvas');
    mini.width=160;mini.height=138;
    const brush=mini.getContext('2d');brush.imageSmoothingEnabled=false;
    drawMage(brush,undefined,{x:80,y:95,scale:1.35,time:.28,
      mageId:mage.id,pose:s.pose,casting:s.cast,shield:s.guard,flash:s.hit,face:0});
    c.drawImage(mini,x+6,y+24);
    const bytes=brush.getImageData(0,0,160,138).data;
    let hash=2166136261;
    for(let i=0;i<bytes.length;i+=4)
     hash=Math.imul(hash^(bytes[i])^(bytes[i+1]<<8)^(bytes[i+2]<<16)^(bytes[i+3]<<24),16777619)>>>0;
    stateHashes.push({class:mage.id,state:s.name,hash});
   }
   c.fillStyle='#ad9872';c.fillRect(0,row*cellHeight,atlas.width,1);
  }
  return {png:atlas.toDataURL('image/png'),signatures:MAGES.map(m=>garbSignature(m.id)),hashes:stateHashes};
 });
 expect(new Set(result.signatures).size).toBe(6);
 for(const mage of ['kindle','cinder','wire','coil','pebble','slate']){
  const variants=result.hashes.filter(x=>x.class===mage).map(x=>x.hash);
  expect(new Set(variants).size).toBeGreaterThanOrEqual(6);
 }
 await info.attach('v013-six-class-character-sheet',{body:Buffer.from(result.png.split(',')[1],'base64'),contentType:'image/png'});
 await page.locator('#choose-mage').click();
 await expect(page.locator('#mage-options .mage-option')).toHaveCount(6);
 await info.attach('v013-class-selection-desktop',{body:await page.screenshot(),contentType:'image/png'});
 expect(errors).toEqual([]);
});
test('v0.13: enlarged characters play a complete combat action without breaking small mobile screen',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 const metrics=await page.evaluate(async()=>{
  const s=window.__perekosTest.state;
  s.actors[0].x=170;s.actors[0].y=310;
  s.actors[1].x=250;s.actors[1].y=310;
  const {STEP,tick}=await import('/apps/perekos/core.mjs');
  for(let i=0;i<9&&s.phase==='fight';i++)
   tick(s,{x:0,y:0,attack:true,aim:{x:250,y:310}},STEP,{x:0,y:0,attack:false});
  return {shots:s.shots.filter(q=>q.owner===0).length,phase:s.phase,
   width:document.documentElement.scrollWidth,viewport:innerWidth};
 });
 expect(metrics.shots).toBeGreaterThan(0);
 expect(metrics.width).toBeLessThanOrEqual(metrics.viewport+1);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('v013-enlarged-character-combat-mobile',{body:await page.screenshot(),contentType:'image/png'});
 expect(errors).toEqual([]);
});
