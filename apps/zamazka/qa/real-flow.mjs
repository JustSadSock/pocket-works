#!/usr/bin/env node
// Real UI interaction, not injected HTML. Run: node apps/zamazka/qa/real-flow.mjs
// Wikimedia is replaced by a known tiny PNG; game code and controls stay real.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOsS3BjYGBgYmBgYGBgAAAOEgEomIcOWQAAAABJRU5ErkJggg==','base64');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const raw=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+raw,raw.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const body=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}
 catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
const port=web.address().port;
const browser=await chromium.launch({headless:true});
const screenshotDir=process.env.ZAMAZKA_QA_ARTIFACT_DIR;
let cases=0;
try{
 for(const viewport of [{width:1755,height:864},{width:390,height:844}]){
  const mobile=viewport.width<700;
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/upload\.wikimedia\.org|\.wikimedia\.org\//,route=>route.fulfill({
   status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:png
  }));

  // Real app UI, deterministic PocketNet transport: no fake markup or stub canvas.
  await page.route('**/pocketnet/health',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,modules:['zamazka']})}));
  await page.route('**/pocketnet/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'qa-token'})}));
  await page.addInitScript(()=>{
    const players=[{id:'qa-owner',name:'Реставратор',verified:false},{id:'qa-b',name:'Другой участник',verified:false},{id:'qa-c',name:'Третий художник',verified:false}];
    class PlaywrightPocketSocket {
      static OPEN=1;
      constructor(){this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.onopen?.()})}
      dispatch(message){queueMicrotask(()=>{if(this.readyState===1)this.onmessage?.({data:JSON.stringify(message)})})}
      send(data){
        const p=JSON.parse(data);
        if(p.type==='auth')this.dispatch({type:'authenticated',player:players[0]});
        if(p.type==='create_room')this.dispatch({type:'room_joined',roomId:'a3f92c10-1234-4567-890a-bcdef0123456',version:'v17',gameId:'zamazka',state:{phase:'lobby'}});
        if(p.type==='game_message'&&p.payload?.type==='sync')this.dispatch({type:'game_event',event:{type:'state',payload:{phase:'lobby',round:0,turn:0,host:'qa-owner',participants:players,board:{revision:0,segments:[]},done:[],voted:[]}}});
      }
      close(){this.readyState=3;this.onclose?.({})}
    }
    window.WebSocket=PlaywrightPocketSocket;
  });
  await page.goto('http://127.0.0.1:'+port+'/apps/zamazka/',{waitUntil:'domcontentloaded'});
  await page.locator('.museum-home').waitFor({timeout:16000});
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'classic','Classic beige theme must be default');
  assert.equal(await page.locator('#zamazka-experimental-style').getAttribute('media'),'not all');
  assert.equal(await page.locator('#zamazka-afterhours-home').getAttribute('media'),'not all','Classic mode must not load the new home CSS');
  assert.equal(await page.locator('.set-furniture').count(),0,'Classic style must not mount decorative scenery');
  assert.equal(await page.locator('.museum-console-structure').count(),0,'Cabinet is not part of either screen');
  assert.equal(await page.locator('.museum-luminaire').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.locator('.museum-frame-facet').first().evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.locator('.museum-plinth').count(),0,'Classic style must not mount museum plinth');
  assert.equal(await page.locator('.museum-architecture').count(),0,'Classic mode must restore original DOM architecture');
  const shellTheme=await page.locator('.museum-home').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert(shellTheme.includes('gradient'),'Stage world must paint without external image downloads');
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-atrium-'+viewport.width+'.png'),fullPage:false});
  // Real settings: volume persists, and the slider value is reflected without reloading.
  await page.locator('#settingsBtn').click();
  await page.locator('#settingVolume').waitFor();
  await page.locator('#settingVolume').evaluate(el=>{el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.locator('#modalActions .btn.primary').click();
  const storedVolume=await page.evaluate(()=>localStorage.getItem('pocket-works:zamazka:sound-volume'));
  assert.equal(storedVolume,'35','Sound level was not persisted');
  await page.locator('#settingsBtn').click();
  assert.equal(await page.locator('#settingVolume').inputValue(),'35');
  const nextSwitch=page.locator('#settingNewAppearance');
  assert.equal(await nextSwitch.isChecked(),false,'New style must start disabled');
  await nextSwitch.check();
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'new','Toggle must preview new look immediately');
  // Switching the opt-in CSS media may load the stylesheet asynchronously.
  // Verify the *computed* visual change, but allow the browser to finish CSS loading.
  await page.waitForFunction(original => {
    const el=document.querySelector('.museum-home');
    return el && getComputedStyle(el).backgroundImage!==original;
  },shellTheme,{timeout:5000});
  const previewBackground=await page.locator('.museum-home').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.notEqual(previewBackground,shellTheme,'Appearance switch must visibly change actual surface styling');
  assert.equal(await page.locator('.museum-home .museum-plinth').count(),1,'New style must add its physical picture ledge');
  await page.locator('#modalActions .btn.ghost').click();
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'classic','Cancel must revert theme');
  assert.equal(await page.locator('.museum-plinth').count(),0,'Reverted classic must clean up scene objects');
  await page.locator('#settingsBtn').click();
  await page.locator('#settingNewAppearance').check();
  await page.locator('#modalActions .btn.primary').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('pocket-works:zamazka:appearance')),'new');
  assert.equal(await page.locator('#zamazka-experimental-style').getAttribute('media'),'all','New look stylesheet must be enabled');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.museum-home').waitFor({timeout:17000});
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'new','New look must survive reload');
  assert.equal(await page.locator('.museum-home .museum-plinth').count(),1);
  assert.equal(await page.locator('#zamazka-afterhours-home').getAttribute('media'),'all','After-hours art direction must only load in the opt-in theme');
  const constructed=await page.locator('.museum-home').evaluate(el=>{
    const lamp=el.querySelector('.museum-luminaire');
    const facets=[...el.querySelectorAll('.museum-slide[data-slot="0"] .museum-frame-facet')];
    return {cabinet:el.querySelectorAll('.museum-console-structure').length,
     lamp:getComputedStyle(lamp).display,
     facets:facets.filter(f=>getComputedStyle(f).display!=='none').length};
  });
  assert.equal(constructed.cabinet,0,'Do not restore fake wood cabinet');
  assert.equal(constructed.lamp,'none','Picture fixture must not visually clip composition');
  assert.equal(constructed.facets,4,'Keep physical frame cross-sections');
  const homeGeometry=await page.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    return {mode:getComputedStyle(document.querySelector('.museum-home')).display,
      heading:rect('.museum-headline'),display:rect('.museum-display'),
      control:rect('.museum-control'),play:rect('#primary-action'),
      screen:rect('#screen'),center:rect('.museum-slide[data-slot="0"]'),
      footer:rect('.museum-footer'),
      bodyOverflow:document.documentElement.scrollWidth>window.innerWidth+2};
  });
  if(mobile){
    assert.equal(homeGeometry.mode,'flex','Phone appearance needs its own stacked composition');
    assert(homeGeometry.heading.bottom<=homeGeometry.display.y+6,'Painting must follow title on phone');
    assert(homeGeometry.display.bottom<=homeGeometry.control.y+6,'Game actions must follow painting on phone');
    assert(homeGeometry.play.bottom<=homeGeometry.screen.bottom+4,'Play button is clipped on phone');
    assert(homeGeometry.footer.bottom<=homeGeometry.screen.bottom+5,'Home footer should fit without required scrolling');
  }else{
    assert.equal(homeGeometry.mode,'grid','Desktop appearance must use a two-column composition');
    assert(homeGeometry.display.x>=homeGeometry.heading.right+10,'Museum display must stand to the right of heading');
    assert(homeGeometry.display.x>=homeGeometry.control.right+10,'Art must not overlap navigation column');
    assert(homeGeometry.display.height>350,'Desktop artwork space is not large enough');
    const sideContainment=await page.evaluate(()=>{
      const stage=document.querySelector('.museum-stage').getBoundingClientRect();
      const left=document.querySelector('.museum-slide[data-slot="-1"]').getBoundingClientRect();
      const right=document.querySelector('.museum-slide[data-slot="1"]').getBoundingClientRect();
      return {leftVisible:left.left-stage.left,rightVisible:stage.right-right.right};
    });
    assert(sideContainment.leftVisible>=-12&&sideContainment.rightVisible>=-12,
      'Side canvases must remain whole, not cut by the home gallery rail');
  }
  assert(homeGeometry.center.width>80&&homeGeometry.center.height>80,'Real center artwork needs usable geometry');
  assert(!homeGeometry.bodyOverflow,'Home must not overflow horizontally');
  const captionClearance=await page.evaluate(()=>{
    const caption=document.querySelector('.museum-stage-caption').getBoundingClientRect();
    const arrows=document.querySelector('.museum-wheel').getBoundingClientRect();
    return arrows.top-caption.bottom;
  });
  assert(captionClearance>=3,'Painting title overlaps carousel arrows');
  if(mobile){
    const returnFont=await page.locator('.top .return').evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize));
    assert(returnFont>=16,'Pocket Works mobile back arrow is not visible');
  }
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-afterhours-home-'+viewport.width+'.png'),fullPage:false});
  const startingUrl=page.url();
  await page.locator('#profileBtn').click();
  await page.locator('.pws-dialog[open]').waitFor({timeout:5000});
  assert.equal(page.url(),startingUrl,'Pocket ID opening must not navigate outside the game');
  await page.locator('.pws-dialog .pws-close').click();
  await page.locator('.pws-dialog[open]').waitFor({state:'hidden',timeout:3000});
  // Explicit portrait coverage: close must always be visible without scrolling.
  await page.locator('.museum-slide[data-slot="0"]').click();
  await page.locator('.inspection-stage.is-ready').waitFor({timeout:17000});
  const portraitGeometry=await page.evaluate(()=>{
    const img=document.querySelector('.inspection-stage .art-inspection'),box=document.querySelector('.dialog-box'),
      close=document.querySelector('#modalActions .btn.primary').getBoundingClientRect();
    return {ratio:img.naturalWidth/img.naturalHeight,scroll:box.scrollHeight-box.clientHeight,
      closeBottom:close.bottom,viewport:innerHeight};
  });
  assert(portraitGeometry.ratio<.94,'Portrait reference must have a vertical image ratio');
  assert(portraitGeometry.scroll<=3&&portraitGeometry.closeBottom<portraitGeometry.viewport,
    'Vertical work should never require scrolling to close its inspection');
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-portrait-inspect-'+viewport.width+'.png'),fullPage:false});
  await page.locator('#modalActions .btn.primary').click();
  // One burst must settle on the last requested painting, without autoplay.
  const expectedAfter=await page.evaluate(()=>{
    const current=document.querySelector('.museum-exhibit-number').textContent;
    const index=Number(current.split('/')[0].trim())-1;
    document.querySelectorAll('[data-action="museum-next"]').forEach(button=>{for(let i=0;i<5;i++)button.click()});
    return (index+5)%71;
  });
  await page.waitForFunction(()=>!document.querySelector('#museumStage')?.dataset.galleryAnimating,null,{timeout:4000});
  const settled=await page.evaluate(()=>Number(document.querySelector('.museum-exhibit-number').textContent.split('/')[0].trim())-1);
  assert.equal(settled,expectedAfter,'Rapid inputs should land on the last requested picture');
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(()=>Number(document.querySelector('.museum-exhibit-number').textContent.split('/')[0].trim())-1),settled,
    'Carousel must not continue turning on its own');
  const traveling=await page.locator('.museum-slide[data-slot="0"]').evaluate(el=>{
    const plaque=el.querySelector('.museum-slide-label');
    const r=el.getBoundingClientRect(),t=plaque?.getBoundingClientRect();
    return {exists:Boolean(plaque),name:plaque?.querySelector('strong')?.textContent,
      offset:t?t.top-r.bottom:0,legacy:getComputedStyle(document.querySelector('#museumCaption')).display};
  });
  assert(traveling.exists&&traveling.name.length>3&&traveling.offset>=-2&&traveling.offset<35,
    'Painting attribution must physically travel immediately below its frame');
  const labelBounds=await page.locator('.museum-slide[data-slot="0"] .museum-slide-label').evaluate(el=>{
    const r=el.getBoundingClientRect(),stage=document.querySelector('.museum-stage').getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,stageTop:stage.top,stageBottom:stage.bottom};
  });
  assert(labelBounds.top>=labelBounds.stageTop-3&&labelBounds.bottom<=labelBounds.stageBottom+3,
    'Attached museum plaque must be wholly visible inside gallery: '+JSON.stringify(labelBounds));
  assert.equal(traveling.legacy,'none','Stationary caption must not remain in new appearance');


  await page.locator('#settingsBtn').click();
  await page.locator('#settingNewAppearance').uncheck();
  await page.locator('#modalActions .btn.primary').click();
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'classic','Classic must be restored in-place');
  assert.equal(await page.locator('.museum-plinth').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('pocket-works:zamazka:appearance')),'classic');
  await page.locator('#settingsBtn').click();
  await page.locator('#settingNewAppearance').check();
  await page.locator('#modalActions .btn.primary').click();
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'new');
  const centerFrame=page.locator('.museum-slide[data-slot="0"]');
  await centerFrame.waitFor();
  assert.equal(await centerFrame.getAttribute('role'),'button','Paintings should be keyboard accessible');
  await centerFrame.click();
  await page.locator('.dialog:not(.hidden) .art-inspection').waitFor({timeout:6000});
  await page.locator('.inspection-stage.is-ready').waitFor({timeout:17000});
  assert.equal(await page.locator('.inspection-loading').isVisible(),false,'Only decoded artwork should be revealed');
  const inspection=await page.evaluate(()=>{
    const dlg=document.querySelector('.dialog-box'),close=document.querySelector('#modalActions .btn.primary');
    const box=dlg.getBoundingClientRect(),r=close.getBoundingClientRect();
    return {closeBottom:r.bottom,screenHeight:innerHeight,overflow:dlg.scrollHeight-dlg.clientHeight,top:box.top};
  });
  assert(inspection.closeBottom<inspection.screenHeight&&inspection.overflow<=3&&inspection.top>=0,
    'Tall painting inspection must fit viewport and keep close visible');
  await page.waitForFunction(()=>!document.querySelector('#toast')?.classList.contains('show'),null,{timeout:6500});
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-inspect-'+viewport.width+'.png'),fullPage:false});

  await page.locator('#modalActions .btn.primary').click();
  const primary=page.locator('#primary-action');
  assert.equal(await primary.getAttribute('data-action'),'create','cooperative mode must be primary');
  assert.equal(await page.locator('#profileBtn').evaluate(el=>el.tagName),'BUTTON','Pocket ID stays in the app');
  assert.equal(await page.locator('.museum-home .personal-seal').count(),0,'No personal sign in menu');
  await primary.click();
  await page.locator('.lobby-entry .entry-profile').waitFor({timeout:6000});
  assert.equal(await page.locator('.lobby-entry [data-action="emblem"]').count(),0,'No custom seal in setup');
  assert.equal(await page.locator('.lobby-entry #who').count(),1,'Player name remains editable for guests');
  await page.waitForFunction(()=>!document.querySelector('#toast')?.classList.contains('show'),null,{timeout:6000});
  await page.waitForTimeout(360); // Capture the settled scene, not its 275ms entrance opacity.
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-create-room-'+viewport.width+'.png'),fullPage:false});
  await page.locator('.lobby-entry [data-action="connect"]').click();
  await page.locator('.exhibition-lobby #commonsCanvas').waitFor({timeout:12000});
  assert.equal(await page.locator('.exhibition-lobby .player').count(),3,'Room roster must render from authoritative state');
  assert.equal(await page.locator('.exhibition-lobby [data-action="start"]').count(),1,'Host must have start action');
  assert.equal(await page.locator('.exhibition-lobby [data-action="emblem"]').count(),0,'Custom sign must be gone from waiting room');
  const boardBox=await page.locator('#commonsCanvas').boundingBox();
  assert(boardBox&&boardBox.width>100&&boardBox.height>60,'Interactive shared canvas must occupy meaningful space');
  assert(boardBox.x>=0&&boardBox.x+boardBox.width<=viewport.width+2,'Shared canvas overflow');
  await page.waitForTimeout(380);
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-lobby-'+viewport.width+'.png'),fullPage:false});
  await page.mouse.move(boardBox.x+boardBox.width*.3,boardBox.y+boardBox.height*.4);await page.mouse.down();
  await page.mouse.move(boardBox.x+boardBox.width*.5,boardBox.y+boardBox.height*.6,{steps:5});await page.mouse.up();
  const boardInk=await page.locator('#commonsCanvas').evaluate(el=>{
    const data=el.getContext('2d').getImageData(0,0,960,600).data;
    for(let i=3;i<data.length;i+=4)if(data[i]>0)return true;
    return false;
  });
  assert(boardInk,'Waiting room canvas must truly accept brush strokes');
  await page.locator('.lobby-mast .lobby-exit').click();
  await page.locator('#modalActions .btn.primary').click();
  await page.locator('.museum-home').waitFor();
  await page.locator('[data-action="practice"]').click();
  await page.locator('#soloDrawingSeconds').selectOption('0');
  await page.locator('#modalActions .btn.primary').click();
  await page.locator('.mobile-preview .gallery .picture').first().waitFor({timeout:17000});
  assert.equal(await page.locator('.mobile-preview .gallery .picture').count(),5);
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'new');
  if(mobile){
    const frame=await page.locator('.mobile-preview .gallery .picture .picture-image').first().evaluate(el=>({
      outerBorder:parseFloat(getComputedStyle(el).borderTopWidth),
      artworkBorder:parseFloat(getComputedStyle(el.querySelector('.picture-mat')).borderTopWidth),
      bezelHeight:el.querySelector('.picture-bevel-top').getBoundingClientRect().height
    }));
    assert(frame.outerBorder===0&&frame.artworkBorder>=1&&frame.bezelHeight>=5,
      'Art frame must wrap only the decoded image, with four real bevel faces');
  }
  await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-preview .picture-mat')].every(el=>el.dataset.ratioReady==='true'),null,{timeout:13000});
  const previewRatios=await page.locator('.mobile-preview .picture-mat').evaluateAll(items=>items.map(mat=>{
    const pic=mat.querySelector('img'),image=mat.closest('.picture-image');
    const outer=mat.getBoundingClientRect(),inner=pic.getBoundingClientRect(),host=image.getBoundingClientRect();
    return {real:pic.naturalWidth/pic.naturalHeight,shown:inner.width/inner.height,
      clipped:outer.width>host.width+2||outer.height>host.height+2,
      frameX:Math.abs(inner.left-outer.left-parseFloat(getComputedStyle(mat).paddingLeft)),
      frameY:Math.abs(inner.top-outer.top-parseFloat(getComputedStyle(mat).paddingTop))};
  }));
  assert(previewRatios.length===5&&previewRatios.every(x=>!x.clipped&&x.frameX<3&&x.frameY<3&&Math.abs(x.real-x.shown)<.012),
    'All five picture frames must fit real bitmap ratios without cropping: '+JSON.stringify(previewRatios));
  await page.waitForTimeout(2900); // Let the real transient settings toast finish before evidence capture.
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-gallery-'+viewport.width+'.png'),fullPage:false});
  // Exercise three extreme image ratios without replacing the real preview DOM.
  const synthetic=await page.locator('.mobile-preview .picture-mat img').evaluateAll(async images=>{
    const shapes=[[180,350],[480,180],[300,300]];
    for(let i=0;i<3;i++){
      const [w,h]=shapes[i];
      images[i].src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="#856747"/></svg>');
    }
    await Promise.all(images.slice(0,3).map(img=>img.decode()));
    return true;
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-preview .picture-mat')].slice(0,3).every(mat=>{
    const img=mat.querySelector('img'),r=img.getBoundingClientRect(),frame=mat.getBoundingClientRect(),host=mat.closest('.picture-image').getBoundingClientRect();
    return Math.abs(r.width/r.height-img.naturalWidth/img.naturalHeight)<.012&&
      frame.width<=host.width+2&&frame.height<=host.height+2&&r.width>25&&r.height>25;
  }),null,{timeout:6000});
    await page.locator('[data-action="skip"]').click();
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'new');
  assert.equal(await page.locator('.museum-passage').count(),0,'No full-screen sliding doors');
  assert.equal(await page.locator('.restore .set-furniture').count(),1,'Opt-in atelier must have restrained scene dressing');
  assert.equal(await page.locator('.exhibition-exit-layer [data-action]').count(),0,'Outgoing room must not have active controls');
  const brush=page.locator('[data-tool="brush"]');
  await brush.waitFor();
  await page.locator('.exhibition-exit-layer').waitFor({state:'detached',timeout:3000});
  const handVisible=await page.locator('[data-tool="hand"]').evaluate(button=>{
    const r=button.getBoundingClientRect();
    const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return Boolean(target?.closest?.('[data-tool="hand"]'));
  });
  assert(handVisible,'Panorama button is covered by the zoom overlay or set dressing');
  await page.locator('[data-tool="hand"]').click();
  assert.equal(await page.locator('.restore').getAttribute('data-active-tool'),'hand');
  await brush.click();
  assert.equal(await page.locator('.restore').getAttribute('data-active-tool'),'brush');
  await page.locator('#brushSize').evaluate(el=>{el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}))});
  const sample=await page.locator('#sizeSample').boundingBox();
  assert(sample?.width>=26,'Brush preview container was hidden');
  const inkWidth=await page.locator('#sizeSample').evaluate(el=>getComputedStyle(el).getPropertyValue('--nib').trim());
  assert.equal(inkWidth,'20px','Brush preview did not react to slider input');
  const board=page.locator('#paintCanvas');
  await board.waitFor({timeout:10000});
  await page.waitForTimeout(720);
  const viewportRect=await page.locator('.restore .viewport').boundingBox();
  assert(viewportRect?.width>100&&viewportRect?.height>100,'working canvas visible');
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-workstation-'+viewport.width+'.png'),fullPage:false});
  // Drag on the center of the damage-centered viewport. The gesture must
  // affect a real Editor instance rather than a decorative preview.
  const cx=viewportRect.x+viewportRect.width/2,cy=viewportRect.y+viewportRect.height/2;
  await page.mouse.move(cx-14,cy-12);await page.mouse.down();
  await page.mouse.move(cx+18,cy+13,{steps:10});await page.mouse.up();
  await page.waitForTimeout(150);
  const indicator=await page.locator('#strokeCount').textContent();
  assert(/Мазков: [1-9]/.test(indicator), 'editor failed to record real pointer stroke: '+indicator);
  await board.evaluate(el=>el.dataset.themeContinuity='intact');
  await page.locator('#settingsBtn').click();
  await page.locator('#settingNewAppearance').uncheck();
  await page.locator('#modalActions .btn.primary').click();
  assert.equal(await page.locator('#paintCanvas').getAttribute('data-theme-continuity'),'intact','Switching off must preserve mounted drawing canvas');
  assert.equal(await page.locator('#strokeCount').textContent(),indicator,'Switching off must retain brush strokes');
  await page.locator('#settingsBtn').click();
  await page.locator('#settingNewAppearance').check();
  await page.locator('#modalActions .btn.primary').click();
  assert.equal(await page.locator('#paintCanvas').getAttribute('data-theme-continuity'),'intact','Switching on must preserve mounted drawing canvas');
  assert.equal(await page.locator('#strokeCount').textContent(),indicator,'Switching on must retain brush strokes');
  await page.locator('[data-action="submit"]').click();
  await page.locator('.reveal-phase').waitFor({timeout:11000});
  await page.locator('.reveal-phase.is-composed').waitFor({timeout:12000});
  await page.waitForTimeout(720);
  assert.equal(await page.locator('.museum-passage').count(),0,'Obsolete transition returned');
  assert.equal(await page.locator('.museum-art-flight').count(),0,'Obsolete image transition was not removed');
  assert.equal(await page.locator('.exhibition-exit-layer').count(),0,'Old phase was not cleaned up');
  const contrast=await page.locator('.reveal-main > h3').evaluate(el=>getComputedStyle(el).color);
  assert.equal(contrast,'rgb(73, 56, 43)','Restoration title must contrast with archival paper');
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-reveal-'+viewport.width+'.png'),fullPage:false});
  await page.locator('[data-action="menu"]').first().click();
  await page.locator('[data-action="collection"]').click();
  await page.locator('.archive-work').first().waitFor({timeout:7500});
  assert.equal(await page.evaluate(()=>window.ZamazkaAppearance.get()),'new');
  assert.equal(await page.locator('.collection-page .set-furniture').count(),1,'Opt-in theme must persist through archive');
  await page.locator('.exhibition-exit-layer').waitFor({state:'detached',timeout:4000});
  await page.waitForTimeout(360);
  if(screenshotDir)await page.screenshot({path:join(screenshotDir,'zamazka-archive-'+viewport.width+'.png'),fullPage:false});
  const dl=page.waitForEvent('download',{timeout:8000});
  await page.locator('[data-action="export-archive"]').click();
  const file=await dl;
  assert(/zamazka-archive-\d{4}-\d\d-\d\d\.json$/.test(file.suggestedFilename()));
  // Changing the visual system in an active archive must not discard entries.
  const countBefore=await page.locator('.archive-work').count();
  await page.locator('#settingsBtn').click();
  await page.locator('#settingNewAppearance').uncheck();
  await page.locator('#modalActions .btn.primary').click();
  assert.equal(await page.locator('.archive-work').count(),countBefore,'Appearance switch must not remount archive');
  assert.equal(await page.locator('.collection-page .set-furniture').count(),0,'Classic archive must remove experimental scenery');
  assert.equal(await page.locator('#zamazka-experimental-style').getAttribute('media'),'not all');
  assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
  cases++;
  console.log('OK live UI '+viewport.width+'x'+viewport.height+': solo preview → stroke → reveal → archive export');
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>web.close(resolve))}
assert.equal(cases,2);
