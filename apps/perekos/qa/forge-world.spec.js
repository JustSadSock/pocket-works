import {test,expect} from '@playwright/test';
test('Forge arena and spells are real online/offline-owned pixel assets',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const data=await page.evaluate(async()=>{
  const {forgeCourtReady,forgeCourtStatus}=await import('/apps/perekos/forge-court.mjs');
  const {forgeSpellsReady,forgeSpellsStatus}=await import('/apps/perekos/forge-spells.mjs');
  const both=await Promise.all([forgeCourtReady(),forgeSpellsReady()]);
  const loaded=await Promise.all(['court-tiles.png','court-tiles.json','spell-frames.png','spell-frames.json','forge-index.json']
   .map(async f=>{const r=await fetch('/apps/perekos/assets/'+f);return[f,r.status]}));
  const c=document.createElement('canvas');c.width=400;c.height=620;
  const {createCourtBackdrop}=await import('/apps/perekos/court-art.mjs');
  const b=createCourtBackdrop([{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}]);
  const paint=b.getContext('2d');
  const opaque=(x,y)=>Array.from(paint.getImageData(x,y,1,1).data);
  const colors=new Set();
  for(let y=36;y<590;y+=11)for(let x=36;x<366;x+=11)
   colors.add(opaque(x,y).join(','));
  return {both,loaded,court:forgeCourtStatus(),spells:forgeSpellsStatus(),
   size:[b.width,b.height],center:opaque(200,310),edge:opaque(4,310),
   paver:opaque(76,330),wall:opaque(125,200),colors:colors.size};
 });
 expect(data.both).toEqual([true,true]);
 expect(data.court).toBe('ready');expect(data.spells).toBe('ready');
 expect(data.loaded.every(([_,s])=>s===200)).toBe(true);
 expect(data.size).toEqual([400,620]);
 expect(data.center[3]).toBe(255);
 expect(data.edge[3]).toBe(255);
 expect(data.colors).toBeGreaterThanOrEqual(11);
 expect(data.wall).not.toEqual(data.paver);
 await page.locator('#primary-action').click();
 await expect(page.locator('#controls')).toBeVisible();
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('v017-forged-pixel-arena',{body:await page.screenshot(),contentType:'image/png'});
 expect(errors).toEqual([]);
});
test('all seven pixel spells distinguish direction and element and do not alter authoritative shots',async({page},info)=>{
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {forgeSpellsReady}=await import('/apps/perekos/forge-spells.mjs');
  const {drawKineticProjectiles,ContactTheater}=await import('/apps/perekos/spell-kinetics.mjs');
  await forgeSpellsReady();
  const styles=['orb','flame','bolt','arc','rock','wave','echo'],colors=['fire','storm','stone'];
  const canvas=document.createElement('canvas');canvas.id='forge-spell-audit';
  canvas.width=640;canvas.height=400;
  canvas.style.cssText='position:fixed;inset:10% auto auto 10%;width:70vw;max-width:640px;height:auto;z-index:9000;image-rendering:pixelated;background:#263b30;';
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const sample=(style,el,theta=0,reduced=false,time=0)=>{
   const c=document.createElement('canvas');c.width=92;c.height=92;
   const p=c.getContext('2d');p.imageSmoothingEnabled=false;
   const s={phase:'fight',shots:[{owner:0,style,element:el,x:46,y:46,vx:230*Math.cos(theta),vy:230*Math.sin(theta),r:5,life:1}]};
   const before=JSON.stringify(s);
   const count=drawKineticProjectiles(p,s,time,{reduced});
   const same=before===JSON.stringify(s);
   const pix=p.getImageData(0,0,92,92).data;
   let hash=2166136261,coverage=0;
   for(let i=0;i<pix.length;i+=4){if(pix[i+3])coverage++;hash=Math.imul(hash^pix[i]^(pix[i+1]<<8)^(pix[i+2]<<16)^pix[i+3],16777619)>>>0}
   return {hash,coverage,count,same,source:c};
  };
  const families=[],rays=[],elements=[];
  for(let i=0;i<styles.length;i++){
   const shot=sample(styles[i],colors[Math.floor(i/2)%3],0,true);
   families.push(shot.hash);ctx.drawImage(shot.source,4+i*90,30);
   ctx.fillStyle='#e4d1ac';ctx.font='12px monospace';ctx.fillText(styles[i],4+i*90,22);
  }
  for(let d=0;d<8;d++)rays.push(sample('bolt','storm',d*Math.PI/4,true).hash);
  for(const e of colors)elements.push(sample('rock',e,0,true).hash);
  const staticA=sample('arc','storm',.4,true,0).hash;
  const staticB=sample('arc','storm',.4,true,45).hash;
  const impacts=[];
  for(const kind of styles){
   const c=document.createElement('canvas');c.width=60;c.height=60;const p=c.getContext('2d');
   const theater=new ContactTheater();theater.ingest({phase:'fight',round:1,ticks:1,serial:1,fx:[{id:1,x:30,y:30,k:'impact_'+kind}]});
   theater.draw(p);
   impacts.push(c.toDataURL());
  }
  const maxState={phase:'fight',shots:Array.from({length:100},(_,i)=>({style:'bolt',element:'storm',owner:0,x:20+i*2,y:35,vx:300,vy:10,r:3}))};
  const count=drawKineticProjectiles(ctx,maxState,0,{reduced:true});
  document.body.append(canvas);
  return {families,rays,elements,staticA,staticB,impacts,count,
   sampleValid:sample('wave','stone').same,nonempty:sample('flame','fire').coverage};
 });
 expect(new Set(result.families).size).toBe(7);
 expect(new Set(result.rays).size).toBe(8);
 expect(new Set(result.elements).size).toBe(3);
 expect(result.staticA).toBe(result.staticB);
 expect(new Set(result.impacts).size).toBe(7);
 expect(result.count).toBe(24);
 expect(result.sampleValid).toBe(true);
 expect(result.nonempty).toBeGreaterThan(20);
 await info.attach('v017-forged-spell-catalog',{body:await page.screenshot(),contentType:'image/png'});
});
