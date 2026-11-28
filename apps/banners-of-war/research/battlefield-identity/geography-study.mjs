// Offline artistic production study, deliberately NOT imported by the game.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=resolve(process.env.BOW_ART_OUTPUT),base='/apps/banners-of-war/research/battlefield-identity/';
const server=createServer(async(req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(p==='/study'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><canvas width="1200" height="800"></canvas></body></html>');return}
  const art=p.startsWith('/art/'),dir=art?out:root,file=resolve(dir,'.'+(art?p.slice(4):p));
  if(!file.startsWith(dir+sep))throw Error('path');
  res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1200,height:800},deviceScaleFactor:1});await page.goto('http://127.0.0.1:'+server.address().port+'/study');
 const result=await page.evaluate(async base=>{
  const {E}=await import(base+'../../engine.js'),{TerrainTiles,renderHeight,prepareSurfaceFields,sampleSurfaceField,shorelineField}=await import(base+'terrain-tiles.js');
  const s=E.create('reference valley 71',['spear','sword','archer','knight','lightHorse'],['spear'],'adaptive','valley'),F=E.forState(s),t=s.terrain,before=JSON.stringify(t);
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,f)=>a+(b-a)*f,sm=(a,b,v)=>{let f=clamp((v-a)/(b-a));return f*f*(3-2*f)};
  const hash=(x,y,salt=0)=>{let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(salt,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
  function noise(x,y,scale,salt){let u=x/scale,v=y/scale,i=Math.floor(u),j=Math.floor(v),a=sm(0,1,u-i),b=sm(0,1,v-j);return mix(mix(hash(i,j,salt),hash(i+1,j,salt),a),mix(hash(i,j+1,salt),hash(i+1,j+1,salt),a),b)}
  const image=async name=>{let im=new Image();im.src='/art/'+name+'.png';await im.decode();return im};
  const textures={},trees={};
  for(const name of ['grass','sparse','road','stone']){const im=await image(name),c=document.createElement('canvas');textures[name]=[];for(const n of [2,4,8,16,32,64,128,256,512]){c.width=c.height=n;let g=c.getContext('2d');g.drawImage(im,0,0,n,n);textures[name].push({n,a:g.getImageData(0,0,n,n).data})}}
  for(const name of ['tree1','tree2','tree3','bush']){trees[name]={im:await image(name),meta:await fetch('/art/'+name+'.json').then(r=>{if(!r.ok)throw Error(name);return r.json()})}}
  const tiles=new TerrainTiles(F,t,textures,trees);tiles.fields=await prepareSurfaceFields(F,t);
  const c=document.querySelector('canvas'),g=c.getContext('2d',{alpha:false}),W=c.width,H=c.height,k=3.2,S=Math.sin(Math.PI/3),T=.5;
  // Select an actual section with river, forest edge, open ground, road, relief.
  // Selection happens once, before choosing any style.
  let best=null;
  for(let y=210;y<F.H-210;y+=25){let x=F.riverX(t,y),wood=0,open=0,road=0,lo=Infinity,hi=-Infinity;
   for(let dx=-110;dx<=110;dx+=10)for(let dy=-165;dy<=165;dy+=15){let q=F.sample(t,x+dx,y+dy);wood+=+q.wood;open+=+(!q.wood&&!q.water);road+=+q.road;lo=Math.min(lo,q.h);hi=Math.max(hi,q.h)}
   let score=Math.min(wood,open)*.7+Math.min(road,25)*2+(hi-lo)*2.5;
   if(!best||score>best.score)best={x,y,score,wood,open,road,relief:hi-lo}
  }
  const center=tiles.point(best.x,best.y),origin={u:center.u-W/(2*k),v:center.v-H/(2*k)};
  const project=(x,y)=>({x:(-y-origin.u)*k,y:(x*S-renderHeight(F,t,x,y)*T-origin.v)*k});
  function world(px,py){let y=-(origin.u+px/k),v=origin.v+py/k,x=v/S;for(let i=0;i<5;i++)x=(v+renderHeight(F,t,x,y)*T)/S;return {x,y}}
  // Shared sampled world geometry: no style can move the shore, road or hills.
  let geometry=new Float32Array(W*H*5),basePixels=new Uint8ClampedArray(W*H*4);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){let p=world(i+.5,j+.5),q=F.sample(t,p.x,p.y),z=(j*W+i)*5,v=(j*W+i)*4,col=tiles.pixel(origin.u+(i+.5)/k,origin.v+(j+.5)/k,k);
   geometry.set([p.x,p.y,q.h,q.canopy||0,q.wet||0],z);basePixels.set([...col,255],v)}
  const modes={
   A:{name:'Natural river valley',shadow:[.55,.24],density:1,step:2.5},
   B:{name:'Relief-led historic landscape',shadow:[.92,.40],density:.78,step:3.2},
   C:{name:'Hand-detailed miniature diorama',shadow:[.28,.22],density:1.2,step:1.65}
  },reports=[],images={};
  function mark(x,y,kind,scale,seed){return {x,y,kind,scale,seed,p:project(x,y)}}
  function ellipse(x,y,rx,ry,col){g.fillStyle=col;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill()}
  function render(mode){
   const config=modes[mode],im=g.createImageData(W,H);let wet=0,rock=0,tracks=0;
   for(let j=0;j<H;j++)for(let i=0;i<W;i++){let z=(j*W+i)*5,v=(j*W+i)*4,x=geometry[z],y=geometry[z+1],h=geometry[z+2],can=geometry[z+3],mo=geometry[z+4],shore=shorelineField(F,t,x,y),road=tiles.roadDist(x,y),nx=sampleSurfaceField(tiles.fields,x,y,0),ny=sampleSurfaceField(tiles.fields,x,y,1),slope=Math.hypot(nx,ny),c=[basePixels[v],basePixels[v+1],basePixels[v+2]];
    let broad=noise(x,y,32,10),fine=noise(x,y,2.5,20),bank=1-sm(2,14,Math.abs(shore));
    const blend=(target,f)=>c=c.map((n,l)=>mix(n,target[l],clamp(f)));
    if(shore<0){wet++;let shallow=sm(-7,0,shore),ripple=Math.sin(y*.42+x*.11+noise(x,y,8,5)*3);
     if(mode==='A'){blend([46,66,61],.45*(1-shallow));blend([123,137,105],shallow*.36);c=c.map(n=>n+ripple*2)}
     if(mode==='B'){blend([38,56,62],.32);blend([141,134,101],shallow*.4)}
     if(mode==='C'){blend([38,80,88],.43);c=c.map(n=>n+ripple*3.2);blend([159,145,110],shallow*.48)}
    }else{
     if(mode==='A'){let meadow=sm(.30,.74,broad)*(1-can);blend([112,133,69],meadow*.30);blend([92,102,65],bank*mo*.44);blend([82,96,53],sm(.45,.8,can)*.27)}
     if(mode==='B'){let strata=noise(-ny*x+nx*y,h*4,13,50),exposed=sm(.09,.32,slope)*(.42+.5*strata)*(1-can);rock+=+(exposed>.15);blend(tiles.tex('stone',x+h*.7,y-h*.3,k),exposed*.75);let light=clamp((-nx*.86+ny*.39)*2,-.38,.40);c=c.map((n,l)=>n*(1+light)+[8,5,0][l]*Math.max(0,light));blend([159,147,103],sm(.55,.85,broad)*(1-can)*.19)}
     if(mode==='C'){let tuft=sm(.35,.78,noise(x,y,4.4,3))*(1-can);blend([121,141,79],tuft*.35);blend([177,160,112],sm(.7,.98,fine)*.26);let ao=sm(.5,.85,can);c=c.map(n=>n*(1-.12*ao))}
     if(road<5){tracks++;let wheel=(1-sm(.22,.82,Math.abs(road-1.75))),verge=1-sm(3.1,4.8,road);blend([142,116,82],wheel*(mode==='A'?.65:.78));blend([176,158,121],verge*.15)}
    }
    im.data.set(c.map(n=>clamp(n,0,255)).concat(255),v)
   }
   g.putImageData(im,0,0);
   let objects=[],details=[],rangeX=155,rangeY=205,step=config.step;
   for(let ix=Math.floor((best.x-rangeX)/step);ix<=(best.x+rangeX)/step;ix++)for(let iy=Math.floor((best.y-rangeY)/step);iy<=(best.y+rangeY)/step;iy++){
    let x=(ix+hash(ix,iy,1))*step,y=(iy+hash(ix,iy,2))*step;if(x<0||x>F.W||y<0||y>F.H)continue;
    let q=F.sample(t,x,y),shore=shorelineField(F,t,x,y),road=tiles.roadDist(x,y),n=hash(ix,iy,3),can=q.canopy||0,patch=noise(x,y,14,100),slope=Math.hypot(sampleSurfaceField(tiles.fields,x,y,0),sampleSurfaceField(tiles.fields,x,y,1));
    if(shore<0)continue;
    if(road<4.3){if(mode==='C'&&n<.13)details.push(mark(x,y,'gravel',.16+n*.3,n));continue}
    let woodland=q.wood&&n<(.025+.11*sm(.61,.86,can))*step*step/9*config.density;
    if(woodland&&shore>5){objects.push(mark(x,y,'tree'+(1+Math.floor(hash(ix,iy,4)*3)),.75+hash(ix,iy,5)*.56,n));continue}
    if(mode==='A'){
     if(shore<5&&n<.35&&patch>.3)details.push(mark(x,y,'reed',.45+patch*.5,n));
     else if(q.wood&&n<.20)objects.push(mark(x,y,'bush',.42+patch*.45,n));
     else if(!q.wood&&n<.16&&patch>.45)details.push(mark(x,y,'meadow',.35+patch*.5,n));
    }else if(mode==='B'){
     if(!q.wood&&slope>.10&&n<.18)details.push(mark(x,y,'scree',.36+slope*1.6,n));
     else if(q.wood&&n<.10)objects.push(mark(x,y,'bush',.55+patch*.4,n));
     else if(!q.wood&&n<.07)details.push(mark(x,y,'dry',.4+patch*.4,n));
    }else{
     if(shore<4&&n<.19)details.push(mark(x,y,'reed',.45+patch*.4,n));
     else if(n<.23&&patch>.35)details.push(mark(x,y,patch>.65?'flower':'meadow',.35+patch*.5,n));
     else if(n<.07)details.push(mark(x,y,'scree',.2+patch*.5,n));
     if(q.wood&&n>.80)objects.push(mark(x,y,'bush',.45+patch*.35,n));
    }
   }
   // World-anchored object shadows, small plant silhouettes and original
   // Forge-produced tree sprites, not abstract dots or new impassable features.
   for(let o of objects){let {p,scale}=o,m=trees[o.kind].meta,span=m.height*k*scale,dx=span*config.shadow[0],dy=span*config.shadow[1];
    g.fillStyle=mode==='B'?'#252e1f58':'#26342539';g.beginPath();g.ellipse(p.x+dx*.55,p.y+dy*.55,span*.44,span*.14,Math.atan2(dy,dx),0,Math.PI*2);g.fill();
   }
   for(let o of details){let {p,scale,kind,seed}=o,r=scale*k;
    if(kind==='scree'||kind==='gravel'){ellipse(p.x+r*.35,p.y+r*.18,r*.95,r*.45,'#36342655');g.fillStyle=mode==='B'?'#b0a58d':'#b2a28a';g.beginPath();g.moveTo(p.x-r,p.y);g.lineTo(p.x-r*.3,p.y-r*.8);g.lineTo(p.x+r*.8,p.y-r*.4);g.lineTo(p.x+r,p.y+r*.12);g.closePath();g.fill();continue}
    let n=kind==='reed'?7:5;g.lineWidth=Math.max(.65,k*.18);g.strokeStyle=kind==='dry'?'#8d793e':kind==='reed'?'#536537':'#536e37';
    for(let l=0;l<n;l++){let dx=(l-(n-1)/2)*r*.44,dy=r*(.5+hash(l,Math.floor(seed*1e5),8)*1.4)*(kind==='reed'?1.7:1);g.beginPath();g.moveTo(p.x+dx*.35,p.y);g.quadraticCurveTo(p.x+dx*.25,p.y-dy*.65,p.x+dx,p.y-dy);g.stroke();if(kind==='flower'&&l%2===0)ellipse(p.x+dx,p.y-dy,.55,.55,'#eee0ab')}
   }
   objects.sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
   for(let o of objects){let {im,meta}=trees[o.kind],scale=k*o.scale/meta.ppm;g.drawImage(im,o.p.x-meta.anchor[0]*scale,o.p.y-meta.anchor[1]*scale,im.width*scale,im.height*scale)}
   reports.push({mode,name:config.name,waterPixels:wet,rockPixels:rock,roadPixels:tracks,trees:objects.filter(o=>o.kind!=='bush').length,bushes:objects.filter(o=>o.kind==='bush').length,details:details.reduce((a,o)=>(a[o.kind]=(a[o.kind]||0)+1,a),{})});
   images[mode]=c.toDataURL('image/png').split(',')[1]
  }
  // Baseline is the exact existing terrain sampler at the same camera, plus
  // original vegetation placement at its calibrated scale.
  let old=g.createImageData(W,H);old.data.set(basePixels);g.putImageData(old,0,0);
  const oldTrees=tiles.vegetation({x:best.x,y:best.y,k,axis:'tactical'},W,H).map(o=>({...o,p:project(o.x,o.y)})).sort((a,b)=>a.p.y-b.p.y);
  for(let o of oldTrees){let {im,meta}=trees[o.kind],scale=k*o.scale/meta.ppm;g.drawImage(im,o.p.x-meta.anchor[0]*scale,o.p.y-meta.anchor[1]*scale,im.width*scale,im.height*scale)}
  images.baseline=c.toDataURL('image/png').split(',')[1];
  for(let mode of ['A','B','C'])render(mode);
  if(JSON.stringify(t)!==before)throw Error('Physical geography mutated');
  if(new Set(reports.map(r=>r.waterPixels)).size!==1)throw Error('Shore mismatch');
  return {images,reports,patch:best,camera:{origin,k,width:W,height:H,projection:'tactical 60deg'},terrain:before,immutable:true}
 },base);
 const hashes={};
 for(const [name,b64] of Object.entries(result.images)){let bytes=Buffer.from(b64,'base64');await writeFile(out+'/geography-'+name+'.png',bytes);hashes[name]=createHash('sha256').update(bytes).digest('hex')}
 if(new Set(Object.values(hashes)).size!==4)throw Error('Candidates must be distinct');
 delete result.images;result.physicalTerrainSHA256=createHash('sha256').update(result.terrain).digest('hex');delete result.terrain;result.imageSHA256=hashes;
 result.references=['https://www.countrylife.co.uk/nature/the-wye-valley-aonb-if-you-have-never-navigated-the-wye-you-have-seen-nothing-215324','https://www.contours.co.uk/wye-valley-walk','https://www.parksandgardens.org/places/moccas-court','https://commons.wikimedia.org/wiki/File:Woolavington_Down_-_geograph.org.uk_-_231299.jpg'];
 await writeFile(out+'/geography-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close()}
