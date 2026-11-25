// Living Geography review materials and fine water contours. No campaign writes.
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],C(t)));
function hash(x,y){let n=Math.imul(x+631,374761393)^Math.imul(y+289,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
export function livingMaterial({x,y,H,wet,fert,forest,slope,nx,ny,curvature,river}){
 const broad=noise(x*.24,y*.24),medium=noise(x*2.2+17,y*2.2-7),grain=noise(x*10.3,y*10.3);
 const moist=C(wet*.75+fert*.15+(broad-.5)*.22),alpine=S((H-.38)/.23),steep=S((slope-.055)/.32),face=S((slope-.16)/.5),valley=(1-S((H-.2)/.23))*S((wet-.34)/.4);
 const soil=mix([164,128,91],[101,76,54],moist),grass=mix([175,152,91],[76,132,84],moist);
 let base=mix(soil,grass,C(.45+fert*.46+(medium-.5)*.35));base=mix(base,[67,113,85],valley*.7);
 base=mix(base,mix([43,78,62],[75,109,67],medium),forest*(1-alpine)*.87);
 const strike=-ny*x+nx*y,layer=noise(strike*3.8+H*9,H*72+noise(x*.9,y*.9)*1.1);
 const scree=mix([124,112,101],[191,174,146],medium),cliff=mix([105,106,108],[209,199,181],C(.2+layer*.65+(-nx-ny)*.13));
 base=mix(base,scree,alpine*steep*(1-face*.65)*.9);base=mix(base,cliff,face*(.62+.38*alpine));
 base=mix(base,[226,229,225],S((H-.64)/.13)*(1-face*.88));
 const micro=(grain-.5)*(face*28+5)+(layer-.5)*face*13+(medium-.5)*7;
 return base.map(v=>C(v+micro+(curvature<0?1:-1)*face*2,0,255));
}
export function riverDistances(g,bounds,detail){
 const [x0,y0,x1,y1]=bounds,w=(x1-x0)*detail+1,h=(y1-y0)*detail+1,out=new Float32Array(w*h).fill(1),r=g.detail,gw=g.width;
 const pad=2,ax=Math.max(0,Math.floor((x0-pad)*r)),ay=Math.max(0,Math.floor((y0-pad)*r)),bx=Math.min(gw-1,Math.ceil((x1+pad)*r)),by=Math.min(g.height-1,Math.ceil((y1+pad)*r));
 for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++){const i=y*gw+x,j=g.down[i],q=g.flow[i]/(r*r);if(j<0||!g.land[i]||g.lakeWater?.[i]||q<25)continue;
 const X=x/r,Y=y/r,TX=(j%gw)/r,TY=Math.floor(j/gw)/r,dx=TX-X,dy=TY-Y,den=dx*dx+dy*dy;if(!den)continue;
 const width=C(.035+.027*Math.log2(q/25),.035,.29),nextWidth=C(.035+.027*Math.log2(Math.max(q,g.flow[j]/(r*r))/25),.035,.29),extent=Math.max(width,nextWidth)+.20;
 const sx=Math.max(0,Math.floor((Math.min(X,TX)-extent-x0)*detail)),ex=Math.min(w-1,Math.ceil((Math.max(X,TX)+extent-x0)*detail)),sy=Math.max(0,Math.floor((Math.min(Y,TY)-extent-y0)*detail)),ey=Math.min(h-1,Math.ceil((Math.max(Y,TY)+extent-y0)*detail));
 for(let py=sy;py<=ey;py++)for(let px=sx;px<=ex;px++){const wx=x0+px/detail,wy=y0+py/detail,t=C(((wx-X)*dx+(wy-Y)*dy)/den),d=Math.hypot(wx-X-t*dx,wy-Y-t*dy)-L(width,nextWidth,t),k=py*w+px;if(d<out[k])out[k]=d;}
 }return out;
}
export async function genesisLivingSource(s,cam,{bounds,detail=8,vertical,yieldRow=async()=>{}}={}){
 if(s.mapVersion!==3||!s.autonomous||typeof vertical!=='function'||![4,8].includes(detail))throw Error('Living Geography review requires revealed v3 fixture');
 const g=s.map.geography,m=s.map,r=g.detail,W=(g.width-1)/r,H=(g.height-1)/r,[x0,y0,x1,y1]=bounds,cols=(x1-x0)*detail+1,rows=(y1-y0)*detail+1,n=cols*rows,vertices=new Float32Array(n*9),elevations=new Float32Array(n),channels=riverDistances(g,bounds,detail);
 const clock=()=>globalThis.performance?.now?.()??Date.now(),begin=clock();let minH=Infinity,maxH=-Infinity,last=begin,maxSlice=0;
 const at=(x,y)=>C(y,0,g.height-1)*g.width+C(x,0,g.width-1);
 const interpolate=(X,Y,get)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y;return L(L(get(at(x,y)),get(at(x+1,y)),u),L(get(at(x,y+1)),get(at(x+1,y+1)),u),v);};
 const sample=(a,X,Y)=>interpolate(X,Y,i=>a[i]);
 for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){const X=x0+x/detail,Y=y0+y/detail,fx=X*r,fy=Y*r,k=C(Math.floor(Y),0,H-1)*W+C(Math.floor(X),0,W-1),i=y*cols+x,bed=sample(g.bed,fx,fy),wet=sample(g.rain,fx,fy),water=interpolate(fx,fy,j=>!g.land[j]||g.lakeWater?.[j]?1:0),lake=interpolate(fx,fy,j=>g.lakeWater?.[j]?1:0);
 const depth=sample(g.lake,fx,fy),shore=water-.5,land=shore<0,cover=land?C(.5+Math.min(-shore*1.5,Math.max(.001,(bed-.12)*9)),.501,1):C(.5-Math.max(.001,shore*.5+(lake>.25?depth:Math.max(0,.12-bed))*5),0,.499);
 const h=land?bed:lake>.25?sample(g.surface,fx,fy):.12;
 // Interpolate the actual water/bed interface; no world topology edits.
 const elevation=interpolate(fx,fy,j=>!g.land[j]?-.035:g.lakeWater?.[j]?vertical(g.surface[j]):vertical(g.bed[j]));
 const forest=S((wet-.45)/.24)*(1-S((bed-.46)/.24));
 vertices.set([X,Y,elevation,h,wet,m.fert[k],forest,cover,land?channels[i]:1],i*9);elevations[i]=elevation;if(land){minH=Math.min(minH,h);maxH=Math.max(maxH,h);}
 }const t=clock();if(t-last>=6){maxSlice=Math.max(maxSlice,t-last);await yieldRow();last=clock();}}
 return {vertices,elevations,indices:new Uint32Array(0),cols,rows,detail,bounds,center:0,stats:{ms:clock()-begin,maxSlice:Math.max(maxSlice,clock()-last),minH,maxH,anchorError:0,bytes:vertices.byteLength+elevations.byteLength+channels.byteLength}};
}
