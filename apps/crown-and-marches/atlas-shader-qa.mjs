// Real WebGL preflight: compile/link production terrain AND water programs,
// execute the actual draw path with micro materials enabled before any DEM work.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration';
mkdirSync(output,{recursive:true});
const results=[],save=()=>writeFileSync(join(output,'atlas-shaders.json'),JSON.stringify(results,null,2));
const url='http://127.0.0.1:4209/apps/crown-and-marches/',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4209',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'shader preflight site unavailable');
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  let browser,page;const errors=[],logs=[],start=Date.now();
  try{
   browser=await type.launch(engine==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
   page=await browser.newPage({viewport:{width:320,height:240},serviceWorkers:'block'});
   page.on('pageerror',e=>errors.push(String(e.stack||e)));page.on('console',m=>logs.push({type:m.type(),text:m.text()}));
   await page.route(url+'shader-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><canvas width="256" height="192" id="fixture"></canvas>'}));
   await page.goto(url+'shader-fixture');
   const result=await page.evaluate(async()=>{
    const {BakedTerrainGL}=await import('./world-rendering-baked.mjs'),canvas=document.querySelector('#fixture'),pixels=new Uint8Array(16),mask=new Uint8Array(16);
    for(let i=0;i<4;i++){pixels.set([114,135,86,255],i*4);mask.set([230,90,140,255],i*4);}
    const terrain={bounds:[0,0,2,2],center:0,width:2,height:2,detail:1,pixels,detailMask:mask,lods:[{cols:2,rows:2,vertices:Float32Array.from([0,0,0,2,0,0,0,2,0,2,2,0]),indices:Uint32Array.from([0,1,3,0,3,2])}],contours:{chunks:[{x0:0,y0:0,x1:.65,y1:.65,zmin:.08,zmax:.08,vertices:Float32Array.from([0,0,.08,.2,.3,.4,.65,0,.08,.2,.3,.4,0,.65,.08,.2,.3,.4])}]}};
    const cam={x:1,y:1,s:70,datum:0,campaign:true},frames=[];let previous=null,reused=false;
    for(const micro of [false,true]){
     const renderer=new BakedTerrainGL(canvas,{...terrain,detailMask:micro?mask:undefined},{chunked:true,adaptive:true,sharedPrograms:true}),gl=renderer.gl;if(previous){reused=renderer.programReuse&&renderer.program===previous.program&&renderer.water.program===previous.water.program;previous.dispose();}previous=renderer;
     try{
      const terrainLinked=gl.getProgramParameter(renderer.program,gl.LINK_STATUS),waterLinked=gl.getProgramParameter(renderer.water.program,gl.LINK_STATUS);
      const drawMs=renderer.draw(cam,{tilt:.28,finish:true}),rgba=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      const error=gl.getError();frames.push({micro,terrainLinked,waterLinked,error,drawMs,draw:{...renderer.lastDraw},device:renderer.device,rgba});
     }finally{}
    }
    previous?.dispose();const [a,b]=frames;let changed=0;for(let i=0;i<a.rgba.length;i+=4)if(a.rgba[i]!==b.rgba[i]||a.rgba[i+1]!==b.rgba[i+1]||a.rgba[i+2]!==b.rgba[i+2])changed++;
    return {frames:frames.map(({rgba,...rest})=>rest),changedPixels:changed,reused};
   });
   for(const f of result.frames){assert.ok(f.terrainLinked&&f.waterLinked,'actual programs must link');assert.equal(f.error,0,'WebGL error');assert.equal(f.draw.triangles,2);assert.equal(f.draw.waterTriangles,1);}
   assert.ok(result.reused,'resident shader programs reused');assert.ok(result.changedPixels>100,'material must visibly execute, not silently disabled');assert.deepEqual(errors,[]);
   await page.locator('#fixture').screenshot({path:join(output,engine+'-shader-fixture.png')});
   results.push({engine,passed:true,ms:Date.now()-start,...result});
  }catch(e){await page?.screenshot({path:join(output,engine+'-shader-failure.png')}).catch(()=>{});results.push({engine,passed:false,ms:Date.now()-start,error:String(e.stack||e),errors,logs});}
  finally{await browser?.close();save();}
 }
 assert.ok(results.length===2&&results.every(x=>x.passed),'WebGL preflight failed; DEM and art QA not started');
}finally{server.kill('SIGTERM');save();}
