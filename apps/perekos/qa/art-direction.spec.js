import {test,expect} from '@playwright/test';

test('v0.11 art direction: six body rigs have different silhouettes across actual pose states',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const visual=await page.evaluate(async()=>{
  const {drawMage}=await import('/apps/perekos/mage-art.mjs');
  const {basePose,MageMotion,rigSignature}=await import('/apps/perekos/mage-motion.mjs');
  const {MAGES}=await import('/apps/perekos/mages.mjs');
  const atlas=document.createElement('canvas');atlas.id='rig-audit';
  atlas.width=720;atlas.height=520;
  atlas.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(97vw,720px);height:auto;image-rendering:pixelated;z-index:10000;background:#243b32;border:3px solid #e4bb83;';
  const a=atlas.getContext('2d');a.imageSmoothingEnabled=false;
  a.fillStyle='#20352c';a.fillRect(0,0,720,520);
  const colors=['#f2d8aa','#d6e2c9','#c8d5bb'];
  const values=[];
  const poseStates=[
   {id:'idle',pose:basePose(),cast:0,dash:0,shield:0,flash:0},
   {id:'walk',pose:{...basePose(),move:1,step:2.3,footSpread:5,cloth:5,bodyBob:-2,headTilt:.08},cast:0,dash:0,shield:0,flash:0},
   {id:'cast',pose:{...basePose(),attack:1,bodyBob:-3,lean:3,cloth:-5,headTilt:-.13},cast:.43,dash:0,shield:0,flash:0},
   {id:'guard',pose:{...basePose(),guard:1,footSpread:4,lean:-2},cast:0,dash:0,shield:40,flash:0},
   {id:'hit',pose:{...basePose(),impact:1,bodyBob:3,lean:-4,headTilt:.17},cast:0,dash:0,shield:0,flash:.15}
  ];
  function hash(image){let x=2166136261;for(let i=0;i<image.length;i+=4)x=Math.imul(x^(image[i]|(image[i+1]<<8)|(image[i+2]<<16)|(image[i+3]<<24)),16777619)>>>0;return x}
  for(let i=0;i<MAGES.length;i++){
   const m=MAGES[i],fingerprints=[];
   for(let j=0;j<poseStates.length;j++){
    const state=poseStates[j],tmp=document.createElement('canvas');tmp.width=120;tmp.height=104;
    const c=tmp.getContext('2d');c.imageSmoothingEnabled=false;
    drawMage(c,undefined,{x:58,y:69,scale:1.20,time:.33,face:0,mageId:m.id,
     pose:{...state.pose,style:rigSignature(m.id)},casting:state.cast,dashing:state.dash,
     shield:state.shield,flash:state.flash});
    const pixels=c.getImageData(0,0,120,104).data;
    const fingerprint=hash(pixels);fingerprints.push(fingerprint);
    a.drawImage(tmp,i*120,j*104);
    a.fillStyle='#d9ba8e';a.font='bold 11px monospace';
    a.fillText(m.id+(j===0?'':':'+state.id),i*120+4,j*104+11);
   }
   values.push({id:m.id,unique:new Set(fingerprints).size});
  }
  document.body.appendChild(atlas);
  return values;
 });
 expect(visual).toHaveLength(6);
 for(const v of visual)expect(v.unique).toBeGreaterThanOrEqual(4);
 await info.attach('body-rig-contact-sheet',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#rig-audit').evaluate(node=>node.remove());
 await page.locator('#primary-action').click();
 await expect(page.locator('#controls')).toBeVisible();
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('quarried-arena-mobile',{body:await page.screenshot(),contentType:'image/png'});
 const widths=await page.evaluate(()=>({client:innerWidth,document:document.documentElement.scrollWidth}));
 expect(widths.document).toBeLessThanOrEqual(widths.client+1);
 expect(errors).toEqual([]);
});
test('v0.11 no motion sensitivity regression in pose director and material canvas',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {MageMotion}=await import('/apps/perekos/mage-motion.mjs');
  const {createCourtBackdrop}=await import('/apps/perekos/court-art.mjs');
  const m=new MageMotion(),a={id:0,mageId:'slate',face:0,cast:0,shield:0,flash:0,dash:0};
  m.sample(a,{x:170,y:310},0,1,true);
  a.cast=.7;a.shield=30;
  const p=m.sample(a,{x:182,y:308},.016,1,true);
  const court=createCourtBackdrop([{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}]);
  return {still:p.move===0&&p.cloth===0&&p.bodyBob===0&&p.attack===0,braced:p.guard>0,
   size:[court.width,court.height],opaque:court.getContext('2d').getImageData(200,310,1,1).data[3]};
 });
 expect(result.still).toBe(true);
 expect(result.braced).toBe(true);
 expect(result.size).toEqual([400,620]);
 expect(result.opaque).toBe(255);
});
