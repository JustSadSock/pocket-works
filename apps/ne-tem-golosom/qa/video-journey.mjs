#!/usr/bin/env node
// End-to-end local scene export: a playable video goes through the real upload,
 // trim, browser encoder, encoded preview, acceptance and room creation route.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const out=process.env.PW_QA_OUTPUT_DIR||join(tmpdir(),'ntg-video-journey');
mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let path=resolve(root,'.'+pathname);
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
    if(statSync(path).isDirectory())path=join(path,'index.html');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(readFileSync(path));
  }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
  for(const viewport of [{name:'mobile',width:390,height:844,mobile:true},{name:'desktop',width:1366,height:768,mobile:false}]){
    const ctx=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.mobile,hasTouch:viewport.mobile});
    const page=await ctx.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/apps/ne-tem-golosom/?debug=play&screen=room',{waitUntil:'domcontentloaded'});
    await page.locator('#room-change-scene:not(.hidden)').click();
    await page.waitForSelector('#screen-library:not(.hidden)');
    // Generate a short real WebM on this device. Unlike a mocked File object,
    // this verifies that the imported clip is decoded and can actually be transcoded.
    await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');
      canvas.width=320;canvas.height=180;
      const g=canvas.getContext('2d');
      const stream=canvas.captureStream(15);
      const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:320000});
      const chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      let n=0;
      const paint=()=>{
        n+=1;g.fillStyle=n%2?'#b66c4b':'#465a59';g.fillRect(0,0,320,180);
        g.fillStyle='#f7e9c9';g.font='bold 64px sans-serif';g.fillText(String(n%100),85,114);
      };
      paint();
      recorder.start(500);
      const tick=setInterval(paint,80);
      await new Promise(resolve=>setTimeout(resolve,11500));
      clearInterval(tick);
      const finished=new Promise(resolve=>recorder.onstop=resolve);
      recorder.stop();
      await finished;
      stream.getTracks().forEach(track=>track.stop());
      const file=new File([new Blob(chunks,{type:'video/webm'})],'local-test.webm',{type:'video/webm'});
      const input=document.getElementById('video-file');
      const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForSelector('#screen-trim:not(.hidden)',{timeout:20000});
    assert(await page.locator('#media-workbench').isVisible(),'video controls not displayed');
    assert.match(await page.locator('#media-fast-status').innerText(),/без сжатия/i,'small import should take the fast path');
    assert.equal(await page.locator('#media-keep-audio').isChecked(),false,'soundtrack processing off by default');
    assert.equal(await page.locator('input[name="film-clean-mode"]:checked').inputValue(),'umx','Open-Unmix must be the default model');
    await page.locator('#film-skip').check(); // Fixture has no audio; skip AI here, covered by separate neural test.
    if(viewport.name==='desktop'){
      const layout=await page.evaluate(()=>{
        const footer=document.querySelector('#confirm-scene').getBoundingClientRect();
        const stage=document.querySelector('#trim-preview').getBoundingClientRect();
        const range=document.querySelector('#trim-range-root').getBoundingClientRect();
        return {
          scrollHeight:document.scrollingElement.scrollHeight,viewport:innerHeight,
          footerVisible:footer.bottom<=innerHeight-2&&footer.top>=0,
          rangeVisible:range.bottom<=innerHeight-2&&range.top>=stage.bottom
        };
      });
      assert(layout.scrollHeight<=layout.viewport+3,'preparation page must fit desktop viewport');
      assert(layout.footerVisible&&layout.rangeVisible,'trim controls must not be clipped on desktop');
    }
    await page.locator('#trim-range-handle-end').focus();
    await page.locator('#trim-range-handle-end').press('Home');
    assert.equal(await page.locator('#trim-length').inputValue(),'10','visual trim handle updates scene duration');
    await page.locator('#media-quality').evaluate(input=>{input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}))});
    await page.screenshot({path:join(out,viewport.name+'-source.png'),fullPage:true});
    await page.locator('#media-render').click();
    await page.waitForSelector('#media-result:not(.hidden)',{timeout:60000});
    assert(await page.locator('#media-output-preview').evaluate(v=>Boolean(v.currentSrc)),'no output preview');
    // Running the same settings again must be immediate: a cached Blob should
    // replace the previously expensive live encoding stage.
    const initialResult=await page.locator('#media-output-size').innerText();
    await page.locator('#media-discard').click();
    const cacheStart=Date.now();
    await page.locator('#media-render').click();
    await page.waitForSelector('#media-result:not(.hidden)',{timeout:3000});
    assert(Date.now()-cacheStart<3000,'cached encoding should be available immediately');
    assert.equal(await page.locator('#media-output-size').innerText(),initialResult);
    assert.match(await page.locator('#media-note').innerText(),/из памяти/);
    await page.waitForFunction(()=>{
      const v=document.getElementById('media-output-preview');
      return v.readyState>=2&&v.videoWidth>0;
    },null,{timeout:16000});
    const playback=await page.locator('#media-output-preview').evaluate(async video=>{
      await video.play();
      await new Promise(resolve=>setTimeout(resolve,500));
      const time=video.currentTime,frames=video.videoWidth;
      video.pause();return {time,frames};
    });
    assert(playback.frames>0&&playback.time>0,'encoded video must be actually playable');
    const resultSize=await page.locator('#media-output-size').innerText();
    assert(resultSize.includes('МиБ')||resultSize.includes('КиБ'),'output size missing');
    await page.screenshot({path:join(out,viewport.name+'-review.png'),fullPage:true});
    assert.match(await page.locator('#confirm-scene').innerText(),/Использовать и продолжить/);
    await page.locator('#preview-original').click();
    assert(await page.locator('#trim-video').isVisible(),'can compare original');
    await page.locator('#preview-result').click();
    assert(await page.locator('#media-output-preview').isVisible(),'can compare result');
    await page.locator('#confirm-scene').click();
    assert.equal(await page.locator('#trim-start').inputValue(),'0');
    await page.waitForSelector('#screen-room:not(.hidden)',{timeout:10000});
    await page.waitForSelector('#room-start:not(:disabled)',{timeout:12000});
    assert.match(await page.locator('#room-scene-title').innerText(),/local-test/i);
    assert.equal(await page.locator('#room-code').innerText(),'D3B6A1F2');
    await page.screenshot({path:join(out,viewport.name+'-room.png'),fullPage:true});
    assert.deepEqual(errors,[],viewport.name+' browser errors');
    console.log(viewport.name,resultSize,'validated');
    await ctx.close();
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
