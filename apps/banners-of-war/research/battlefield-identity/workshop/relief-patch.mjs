// Export a fixed section of the actual engine map, once. No terrain mutation.
import {E} from '../../../engine.js';
import {shorelineField} from '../terrain-tiles.js';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out=process.env.BOW_ART_OUTPUT,s=E.create('reference valley 71',['sword'],['sword'],'adaptive','valley'),F=E.forState(s),t=s.terrain,before=JSON.stringify(t);
const hash=(a,b,k=0)=>{let n=Math.imul(a|0,374761393)^Math.imul(b|0,668265263)^Math.imul(k,1442695041);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
let best=null;
for(let y=180;y<F.H-180;y+=20){let x=F.riverX(t,y),wood=0,open=0,road=0,lo=Infinity,hi=-Infinity;
 for(let dx=-100;dx<=100;dx+=10)for(let dy=-140;dy<=140;dy+=10){let q=F.sample(t,x+dx,y+dy);wood+=+q.wood;open+=+(!q.wood&&!q.water);road+=+q.road;lo=Math.min(lo,q.h);hi=Math.max(hi,q.h)}
 let score=Math.min(wood,open)*.85+Math.min(road,35)*2+(hi-lo)*3;
 if(!best||score>best.score)best={x,y,score,wood,open,road,relief:hi-lo}
}
if(!best.wood||!best.open||!best.road)throw Error('No real patch contains the required landscape features');
const step=2,halfX=140,halfY=170,cols=halfX*2/step+1,rows=halfY*2/step+1,points=[],trees=[],water=[];
function roadDist(x,y){let d=Infinity;for(let i=1;i<(t.road||[]).length;i++){let a=t.road[i-1],b=t.road[i],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(l>1600||!l)continue;let f=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l));d=Math.min(d,Math.hypot(x-a.x-f*dx,y-a.y-f*dy))}return d}
for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){let x=best.x-halfX+i*step,y=best.y-halfY+j*step,q=F.sample(t,x,y);points.push([x-best.x,y-best.y,q.h,q.canopy||0,q.wet||0,Math.min(20,roadDist(x,y)),shorelineField(F,t,x,y)])}
for(let j=0;j<rows;j++){let y=best.y-halfY+j*step,x=F.riverX(t,y),left=F.sample(t,x-11,y).h,right=F.sample(t,x+11,y).h,z=Math.min(left,right)-.035;water.push([x-best.x,y-best.y,z])}
for(let i=-19;i<=19;i++)for(let j=-23;j<=23;j++){let x=best.x+(i+hash(i,j,1))*7,y=best.y+(j+hash(i,j,2))*7,q=F.sample(t,x,y),road=roadDist(x,y),shore=shorelineField(F,t,x,y),n=hash(i,j,3);
 if(shore<4||road<5||!q.wood)continue;
 if(n<.25+.45*Math.max(0,Math.min(1,((q.canopy||0)-.61)/.35)))trees.push({x:x-best.x,y:y-best.y,z:q.h,kind:1+Math.floor(hash(i,j,4)*3),height:7+hash(i,j,5)*5,angle:hash(i,j,6)*Math.PI*2});
}
if(JSON.stringify(t)!==before)throw Error('Authority mutated');
writeFileSync(out+'/relief-patch.json',JSON.stringify({seed:s.seed,physicalHash:createHash('sha256').update(before).digest('hex'),best,step,cols,rows,points,water,trees,camera:{scale:300,target:[0,0,points[Math.floor(points.length/2)][2]],offset:[-185,-220,240]}}));
console.log(JSON.stringify({best,vertices:points.length,trees:trees.length}));
