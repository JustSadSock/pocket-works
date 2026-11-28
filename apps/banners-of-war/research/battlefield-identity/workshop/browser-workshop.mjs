// Reuse the exact existing fixture and browser setup, without running the full
// campaign or regenerating a single asset. This generated module is temporary.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const src=new URL('../capture.mjs',import.meta.url),tmp=new URL('../.focused-workshop-generated.mjs',import.meta.url);
const original=await readFile(src,'utf8'),cut=original.lastIndexOf('\nlet browser;');
if(cut<0)throw Error('Original benchmark entry point changed');
let prefix=original.slice(0,cut);
// Keep the existing 24-frame exact camera path and all representative and
// equivalence checks, but run only the reported zoom regression four times.
prefix=prefix.replace("for(let motion of ['static','pan','zoom'])for(let mode of ['direct','batch','layer','scaled','world-row','world-row','layer','batch','direct','auto','auto'])","for(let motion of ['zoom'])for(let mode of ['auto','auto','auto','auto'])")
.replace("let sameCounts=['static','pan','zoom'].every","let sameCounts=['zoom'].every");
if(!prefix.includes("['auto','auto','auto','auto']"))throw Error('Benchmark path changed');
const tail=`
let browser;
try{
 browser=await webkit.launch();
 let {ctx,p,errors}=await launch(browser,{...devices['iPhone 13']});
 try{
  let r=await bench(p,60,'webkit-focused');await save('focused-zoom.json',r);
  const expected=[5016,5011,5011,5011,5011,5003,5003,5001,5001,4993,4989,4989,4987,4980,4973,4972,4970,4959,4958,4955,4947,4945,4943,4938];
  const visible=[5016,5011,5011,5011,5011,5003,5003,5001,5001,4993,4989,4989,4987,4980,4973,4972,4970,4954,4930,4894,4813,4696,4596,4529];
  if(!r.sameCounts||r.results.length!==4||r.results.some(a=>JSON.stringify(a.represented)!==JSON.stringify(expected)||JSON.stringify(a.counts)!==JSON.stringify(visible)||a.tiles.some(t=>t.uncovered>0))||r.changedPixels>.05||r.equivalence.some(e=>e.changedPixels>.05))failures.push('Population or visual equivalence regression');
  if(r.results.some(a=>a.fps<30))failures.push('WebKit 60 zoom below 30 FPS: '+r.results.map(a=>a.fps.toFixed(2)).join(', '));
  if(errors.length)failures.push(...errors);
 }finally{await ctx.close();await browser.close();browser=null}
 if(process.env.BOW_TACTICAL==='1'){
  browser=await chromium.launch();let {ctx,p,errors}=await launch(browser,{viewport:{width:1440,height:900},deviceScaleFactor:1});
  try{
   const frames=benchmarkStates(60),F=E.forState(frames[0]),score=s=>s.units.filter(u=>F.alive(u)&&u.contact>0).length;
   const frame=frames.reduce((a,b)=>score(b)>score(a)?b:a,frames[0]);if(!score(frame))throw Error('No genuine contact');
   const u=frame.units.find(u=>u.contact>0&&!F.spec(u).horse),enemy=frame.units.filter(v=>v.side!==u.side&&v.contact>0).sort((a,b)=>F.dist(a,u)-F.dist(b,u))[0];if(!enemy)throw Error('No opponent');
   let ids=[u.id,enemy.id];
   await p.evaluate(s=>window.sliceQA.evidence(s,'Focused tactical evidence'),frame);await p.evaluate(ids=>window.sliceQA.focusUnits(ids,38),ids);await p.evaluate(()=>window.sliceQA.prepare());await p.evaluate(()=>window.sliceQA.drawNow());
   const stats=await p.evaluate(()=>window.sliceQA.state().stats),data=await p.evaluate(async({frame,ids})=>{
    const {E}=await import('/apps/banners-of-war/engine.js'),F=E.forState(frame),q=window.sliceQA,src=document.getElementById('field'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');g.drawImage(src,0,0);
    const baseline=c.toDataURL(),d=src.width/src.clientWidth;g.scale(d,d);const physical=q.physical(),marks=[];
    // An optional tactical overlay on a copied screenshot, not a gameplay or
    // geometry change. Show only real contact intervals and real movement.
    for(const u of frame.units.filter(u=>ids.includes(u.id))){
     const ca=Math.cos(u.a),sa=Math.sin(u.a),bodies=F.bodies(u),sectors=F.sectors(u),color=u.side?'#d9a38a':'#b5d9ee';
     for(let i=0;i<bodies.length;i++){let b=bodies[i],v=sectors[i],c=Math.cos(b.a),s=Math.sin(b.a),w=b.geometry.w*.5,f=b.geometry.d*.5;
      let left=q.project({x:b.x+f*c-w*s,y:b.y+f*s+w*c}),right=q.project({x:b.x+f*c+w*s,y:b.y+f*s-w*c});
      if(v.contact>0){g.strokeStyle=color;g.globalAlpha=.75;g.lineWidth=1.5;g.setLineDash(v.cohesion<55?[3,4]:[]);g.beginPath();g.moveTo(left.x,left.y);g.lineTo(right.x,right.y);g.stroke();g.setLineDash([]);marks.push({id:u.id,sector:i,contact:v.contact,cohesion:v.cohesion})}
     }
     if(Math.abs(u.v)>.18){let p=q.project({x:u.x,y:u.y}),e=q.project({x:u.x+ca*(5+Math.abs(u.v)*2),y:u.y+sa*(5+Math.abs(u.v)*2)}),a=Math.atan2(e.y-p.y,e.x-p.x);g.globalAlpha=.85;g.strokeStyle=color;g.lineWidth=1.5;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(e.x,e.y);g.lineTo(e.x-6*Math.cos(a-.6),e.y-6*Math.sin(a-.6));g.moveTo(e.x,e.y);g.lineTo(e.x-6*Math.cos(a+.6),e.y-6*Math.sin(a+.6));g.stroke()}
    }
    g.globalAlpha=1;if(JSON.stringify(q.physical())!==JSON.stringify(physical))throw Error('Physical state changed');
    return {baseline,candidate:c.toDataURL(),marks,physicalUnchanged:true}
   },{frame,ids});
   for(let n of ['baseline','candidate']){await writeFile(out+'/tactical-'+n+'.png',Buffer.from(data[n].split(',')[1],'base64'));delete data[n]}
   await save('tactical-comparison.json',{...data,ids,time:frame.time,stats,physicalRepresentatives:frame.units.reduce((n,u)=>n+Math.max(0,u.n),0),camera:await p.evaluate(()=>window.sliceQA.camera()),overlayOnly:true});
   if(errors.length)failures.push(...errors)
  }finally{await ctx.close();await browser.close();browser=null}
 }
 await save('focused-browser-gate.json',{failures});if(failures.length)throw Error(failures.join('\\n'))
}finally{if(browser)await browser.close();server.close()}
`;
await writeFile(tmp,prefix+tail);
try{await import(pathToFileURL(fileURLToPath(tmp)).href)}finally{await unlink(tmp)}
