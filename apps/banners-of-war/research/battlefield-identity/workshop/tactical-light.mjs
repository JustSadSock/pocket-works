// Independent one-frame artistic composition test. Never commit modified renderer.
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=process.cwd(),dir=resolve(root,'apps/banners-of-war/research/battlefield-identity'),original=await readFile(dir+'/capture.mjs','utf8'),cut=original.lastIndexOf('\nlet browser;'),art=dir+'/battle-art.js',source=await readFile(art,'utf8'),tmp=dir+'/.tactical-light.mjs';
if(cut<0)throw Error('Capture changed');
let candidate=source.replace('if(k>=8){g.fillStyle=','#INVALID#');
// Replace only shadow presentation. Keep every actual sprite, its scale,
// position, heading, pose and painter order. No arrows or contact overlays.
candidate=source.replace("if(k>=8){g.fillStyle='#292c202f';g.beginPath();for(let it of items)if(it.o){let p=it.o;g.moveTo(p.x+k*.50,p.y+k*.17);g.ellipse(p.x+k*.24,p.y+k*.17,k*.30,k*.105,.25,0,Math.PI*2)}g.fill()}",
 "if(cam.mode!=='A'&&k>=1){g.fillStyle='#282b2048';g.beginPath();for(let it of items)if(it.o){let p=it.o,horse=/^(knight|lightHorse):/.test(p.key),rx=k*(horse?.67:.31),ry=k*(horse?.20:.13),dx=k*(horse?.54:.28),dy=k*.15;g.moveTo(p.x+dx+rx,p.y+dy);g.ellipse(p.x+dx,p.y+dy,rx,ry,.34,0,Math.PI*2)}g.fill();g.fillStyle='#282b2033';g.beginPath();for(let it of items)if(it.o){let p=it.o;g.moveTo(p.x+k*.24,p.y);g.ellipse(p.x,p.y,k*.24,k*.12,0,0,Math.PI*2)}g.fill()}");
const old="c.getContext('2d').drawImage(atlas.pages[e.page],...r,0,0,r[2],r[3]);e.sprite=c";
const lighting="let cc=c.getContext('2d');cc.drawImage(atlas.pages[e.page],...r,0,0,r[2],r[3]);let im=cc.getImageData(0,0,c.width,c.height),v=im.data;for(let i=0;i<v.length;i+=4){if(!v[i+3])continue;let lum=(v[i]*.30+v[i+1]*.55+v[i+2]*.15),light=(lum-112)*.19,metal=Math.max(0,1-(Math.max(v[i],v[i+1],v[i+2])-Math.min(v[i],v[i+1],v[i+2]))/38)*Math.max(0,(lum-95)/160);v[i]+=light+metal*12;v[i+1]+=light+metal*10;v[i+2]+=light+metal*4}cc.putImageData(im,0,0);e.sprite=c";
candidate=candidate.replace(old,lighting);
if(candidate===source||!candidate.includes('metal*12')||!candidate.includes("cam.mode!=='A'&&k>=1"))throw Error('Candidate instrumentation failed');
const tail=`
let browser;const art=${JSON.stringify(art)},src=${JSON.stringify(source)},candidate=${JSON.stringify(candidate)};
try{
 const frames=benchmarkStates(60),F=E.forState(frames[0]),score=s=>s.units.filter(u=>F.alive(u)&&u.contact>0).length;
 let frame=frames.reduce((a,b)=>score(b)>score(a)?b:a,frames[0]);if(!score(frame))throw Error('Missing real contact');
 let u=frame.units.find(u=>u.contact>0&&!F.spec(u).horse),enemy=frame.units.filter(v=>v.side!==u.side&&v.contact>0).sort((a,b)=>F.dist(a,u)-F.dist(b,u))[0];let ids=[u.id,enemy.id],results=[];
 for(const [name,renderer] of [['baseline',src],['candidate',candidate]]){
  await writeFile(art,renderer);browser=await chromium.launch();let {ctx,p,errors}=await launch(browser,{viewport:{width:1440,height:900},deviceScaleFactor:1});
  try{
   await p.evaluate(s=>window.sliceQA.evidence(s,'Tactical light'),frame);await p.evaluate(ids=>window.sliceQA.focusUnits(ids,38),ids);
   await p.evaluate(()=>window.sliceQA.policy('direct'));await p.evaluate(()=>window.sliceQA.prepare());await p.evaluate(()=>window.sliceQA.drawNow());
   let data=await p.evaluate(()=>{let q=window.sliceQA,s=q.state(),c=document.getElementById('field');return {image:c.toDataURL(),stats:s.stats,camera:q.camera(),physical:q.physical()}});
   await writeFile(out+'/tactical-light-'+name+'.png',Buffer.from(data.image.split(',')[1],'base64'));delete data.image;
   results.push(data);if(errors.length)throw Error(errors.join(';'));
  }finally{await ctx.close();await browser.close();browser=null}
 }
 let [a,b]=results;
 if(JSON.stringify(a.physical)!==JSON.stringify(b.physical)||JSON.stringify(a.camera)!==JSON.stringify(b.camera)||a.stats.sprites!==b.stats.sprites||a.stats.represented!==b.stats.represented)throw Error('Tactical comparison changed physical representation');
 await save('tactical-light-comparison.json',{ids,time:frame.time,baseline:a.stats,candidate:b.stats,camera:a.camera,physicalIdentical:true,overlay:false,originalSpritePositionsAndAlpha:true});
}finally{await writeFile(art,src);if(browser)await browser.close();server.close()}
`;
await writeFile(tmp,original.slice(0,cut)+tail);
try{await import(pathToFileURL(tmp).href)}finally{await writeFile(art,source);await unlink(tmp)}
