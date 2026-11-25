import {W,H,N,xx,yy,idx,PALETTE,COLORS,clamp,strength,hash,cityType,neighbors,charted,adoption,KNOWLEDGE,observedOwner,observedCities,freshIntel} from './world.mjs';
import {BW,BH} from './battle.mjs';
import {drawGeographyReview} from './geography-review.mjs';
const RGB=PALETTE.map(x=>[parseInt(x.slice(1,3),16),parseInt(x.slice(3,5),16),parseInt(x.slice(5,7),16)]);
const mix=(a,b,t)=>a.map((v,k)=>v*(1-t)+b[k]*t);

const grainAt=(x,y)=>{let n=Math.imul(x+41,374761393)^Math.imul(y+73,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const fade=(x,a,b)=>clamp((x-a)/(b-a),0,1);
// Join the actual frontier edges at their shared vertices; round only the drawn corner.
function frontier(s,owner,visible){
 const nodes=new Map(),edges=[],id=(x,y)=>y*(W+1)+x;
 const add=(x,y,u,v)=>{const a=id(x,y),b=id(u,v),k=edges.length;edges.push([a,b]);for(const z of [a,b]){if(!nodes.has(z))nodes.set(z,[]);nodes.get(z).push(k)}};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=idx(x,y);if(!visible(i)||!s.map.land[i])continue;const f=owner(i);if(f<0)continue;
 if(x===0||!visible(i-1)||owner(i-1)!==f)add(x,y,x,y+1);
 if(y===0||!visible(i-W)||owner(i-W)!==f)add(x,y,x+1,y);
 if(x===W-1||!visible(i+1)||owner(i+1)<0)add(x+1,y,x+1,y+1);
 if(y===H-1||!visible(i+W)||owner(i+W)<0)add(x,y+1,x+1,y+1);}
 const path=new Path2D(),seen=new Set(),point=n=>[n%(W+1),Math.floor(n/(W+1))];
 for(let k=0;k<edges.length;k++){if(seen.has(k))continue;let [start,end]=edges[k];if(nodes.get(end).length!==2&&nodes.get(start).length===2)[start,end]=[end,start];const chain=[start,end];seen.add(k);
 while(nodes.get(end).length===2){const next=nodes.get(end).find(n=>!seen.has(n));if(next===undefined)break;seen.add(next);const edge=edges[next];end=edge[0]===end?edge[1]:edge[0];chain.push(end);}
 const pts=chain.map(point);path.moveTo(...pts[0]);for(let j=1;j<pts.length-1;j++){const [x,y]=pts[j],p=pts[j-1],n=pts[j+1];path.quadraticCurveTo(x,y,(x+n[0])*.5,(y+n[1])*.5);}path.lineTo(...pts.at(-1));}
 return path;
}
function realmNames(s,owner,visible){const groups=new Map();for(let i=0;i<N;i++){if(!visible(i)||!s.map.land[i])continue;const f=owner(i);if(f<0||!s.states[f])continue;let g=groups.get(f);if(!g)groups.set(f,g={cells:[],x:0,y:0});g.cells.push(i);g.x+=xx(i);g.y+=yy(i);}
 const labels=[];for(const [f,g] of groups){const n=g.cells.length;if(n<8)continue;let best=g.cells[0],score=Infinity;for(const i of g.cells){const inner=neighbors(i).filter(j=>visible(j)&&owner(j)===f).length,v=Math.hypot(xx(i)-g.x/n,yy(i)-g.y/n)-inner*.85;if(v<score){score=v;best=i;}}labels.push({name:s.states[f].name,i:best,n});}return labels.sort((a,b)=>b.n-a.n);
}
// Original axonometric boroughs. Cache a complete miniature by actual settlement
// class, development, heraldry and architectural variant, not by city identity.
const boroughs=new Map();
function borough(city){
 const count=city.pop>4200?20:city.pop>1600?12:city.pop>900?7:3,fort=city.fort||0,port=city.port||0,variant=hash(String(city.name))%3,ink=PALETTE[city.occupation>=0?city.occupation:city.f]||'#8d6040',key=[count,fort,port,variant,ink,!!city.capital].join('|');if(boroughs.has(key))return boroughs.get(key);
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=160;const c=canvas.getContext('2d');c.translate(96,99);
 const poly=(p,color,stroke)=>{c.beginPath();c.moveTo(...p[0]);for(const v of p.slice(1))c.lineTo(...v);c.closePath();c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.8;c.stroke();}};
 const house=(x,y,w,h,roof,tower=false)=>{const d=w*.36;poly([[x-w/2+3,y+4],[x+w/2+5,y+4],[x+w/2+d+5,y-d*.55+4],[x-w/2+d+3,y-d*.55+4]],'#433a2f66');poly([[x-w/2,y],[x+w/2,y],[x+w/2,y-h],[x-w/2,y-h]],'#e7d2aa','#77664b');poly([[x+w/2,y],[x+w/2+d,y-d*.6],[x+w/2+d,y-h-d*.6],[x+w/2,y-h]],'#a48a64','#77664b');poly([[x-w/2-1,y-h],[x,y-h-w*.52],[x+d,y-h-w*.52-d*.6],[x-w/2+d,y-h-d*.6]],roof,'#65513b');poly([[x,y-h-w*.52],[x+w/2+1,y-h],[x+w/2+d,y-h-d*.6],[x+d,y-h-w*.52-d*.6]],'#6e4837','#65513b');c.fillStyle='#69523b';c.fillRect(x-1.4,y-5,2.8,5);if(tower){c.fillRect(x-3,y-h+4,2,4);c.fillRect(x+2,y-h+4,2,4);}};
 const radius=count>12?58:count>7?44:count>3?33:21;
 if(fort||city.capital){c.strokeStyle='#695941';c.lineWidth=9;c.beginPath();c.ellipse(0,0,radius+4,radius*.6+4,0,0,Math.PI*2);c.stroke();c.strokeStyle='#d5c09a';c.lineWidth=5;c.stroke();}
 const points=[];for(let i=0;i<count;i++){const ang=i*2.399963+variant*.72,dist=i===0?0:radius*.85*Math.sqrt(i/count);points.push([Math.cos(ang)*dist,Math.sin(ang)*dist*.64,i]);}
 points.sort((a,b)=>a[1]-b[1]);for(const [x,y,i] of points){const big=i===0&&(city.capital||count>=12),roof=big?ink:['#97583b','#ae774d','#74634c'][((i+variant)%3)];house(x,y,big?22:13+(i%3)*2,big?28:9+(i%4)*2,roof,big);}
 if(fort||city.capital){for(const angle of [.2,1.65,2.9])house(Math.cos(angle)*(radius+3),Math.sin(angle)*(radius*.6+3),13,17,'#887b60',true);}
 if(port){c.fillStyle='#876b48';for(let i=0;i<Math.min(3,port);i++){const x=radius*.7+i*10;c.fillRect(x,10,5,25);poly([[x-4,30],[x+4,30],[x+4,42],[x,47],[x-4,42]],'#594533');poly([[x,31],[x+9,40],[x,42]],'#e4d5ae');}}
 if(city.capital){c.strokeStyle='#453a2b';c.lineWidth=1.7;c.beginPath();c.moveTo(0,-34);c.lineTo(0,-62);c.stroke();poly([[0,-62],[19,-59],[0,-51]],ink,'#493a27');}
 if(boroughs.size>=256)boroughs.delete(boroughs.keys().next().value);boroughs.set(key,canvas);return canvas;
}
function settlementMark(c,city,r,scale){
 if(scale<1.5){c.fillStyle=PALETTE[city.f]||'#8d6040';c.strokeStyle='#f5dfaf';c.lineWidth=1.3;c.beginPath();c.arc(0,0,city.capital?5:3.5,0,Math.PI*2);c.fill();c.stroke();return;}
 const size=clamp(scale*6.4,42,city.pop>1600||city.capital?116:76),img=borough(city);c.drawImage(img,-size/2,-size*99/192,size,size*160/192);
}

function fieldSurface(canvas,b){
 const c=canvas.getContext('2d'),cols=50,rows=32,im=c.createImageData(BW,BH),d=im.data;
 const tile=(x,y)=>b.terrain[clamp(y,0,rows-1)*cols+clamp(x,0,cols-1)];
 const smooth=(x,y,key)=>{let u=x/20-.5,v=y/20-.5,i=Math.floor(u),j=Math.floor(v),p=u-i,q=v-j;p=p*p*(3-2*p);q=q*q*(3-2*q);const f=(x,y)=>+tile(x,y)[key]||0;return (f(i,j)*(1-p)+f(i+1,j)*p)*(1-q)+(f(i,j+1)*(1-p)+f(i+1,j+1)*p)*q;};
 const noise=(x,y,size)=>{const u=x/size,v=y/size,i=Math.floor(u),j=Math.floor(v),p=u-i,q=v-j;return (grainAt(i,j)*(1-p)+grainAt(i+1,j)*p)*(1-q)+(grainAt(i,j+1)*(1-p)+grainAt(i+1,j+1)*p)*q;};
 for(let y=0;y<BH;y++)for(let x=0;x<BW;x++){const t=tile(Math.floor(x/20),Math.floor(y/20)),h=smooth(x,y,'h'),shade=(smooth(x-15,y-15,'h')-h)*310,n=noise(x,y,79),m=noise(x+210,y+90,21),g=(grainAt(x,y)-.5)*12,forest=smooth(x,y,'forest'),water=smooth(x,y,'water'),road=smooth(x,y,'road'),field=smooth(x,y,'field');let rgb=[126+29*n,139+24*n,78+20*m];
 if(forest>.15)rgb=mix(rgb,[76,103,58],forest*.8);
 if(field>.35)rgb=mix(rgb,[172,152,86],field*.7);
 if(road>.43)rgb=mix(rgb,[171,145,105],road*.9);
 if(water>.48&&!t.bridge)rgb=mix([70,116,122],[103,145,143],clamp((1-water)*1.6,0,1));
 const j=(y*BW+x)*4;for(let k=0;k<3;k++)d[j+k]=rgb[k]+shade+g+(m-.5)*14 +h*65;d[j+3]=255;}
 c.putImageData(im,0,0);
 // Small irregular vegetation clusters, not one symbol per simulation cell.
 for(let i=0;i<b.terrain.length;i++){const t=b.terrain[i],x=i%50*20,y=Math.floor(i/50)*20;
 if(t.forest){for(let k=0;k<5;k++){let px=x+grainAt(i,k)*20,py=y+grainAt(k,i+1)*20,r=2+grainAt(i+19,k)*4;c.fillStyle='#263c2880';c.beginPath();c.ellipse(px+2,py+3,r*1.25,r*.8,0,0,Math.PI*2);c.fill();const g=c.createRadialGradient(px-r*.3,py-r*.35,.1,px,py,r);g.addColorStop(0,'#859251');g.addColorStop(.6,'#52683b');g.addColorStop(1,'#344b30');c.fillStyle=g;c.beginPath();c.arc(px,py,r,0,Math.PI*2);c.fill();}}
 else if(!t.water&&!t.road&&!t.building){for(let k=0;k<6;k++){let px=x+grainAt(i,k)*20,py=y+grainAt(k,i)*20;c.strokeStyle=k%3?'#52633a55':'#d3c88b80';c.lineWidth=.65;c.beginPath();c.moveTo(px,py);c.lineTo(px+1,py-2-grainAt(i+3,k)*3);c.stroke();}}
 if(t.field){c.strokeStyle='#77673b70';c.lineWidth=.7;for(let k=3;k<20;k+=5){c.beginPath();c.moveTo(x+k,y);c.lineTo(x+k,y+20);c.stroke();}}
 if(t.bridge){c.fillStyle='#9b8055';c.fillRect(x,y+3,20,14);c.strokeStyle='#5c4b32';for(let k=2;k<20;k+=4){c.beginPath();c.moveTo(x+k,y+3);c.lineTo(x+k,y+17);c.stroke();}}
 if(t.building){c.fillStyle='#30322655';c.fillRect(x+5,y+6,16,15);c.fillStyle=t.fort?'#b5ac90':'#d6bc8f';c.fillRect(x+2,y+2,15,15);c.fillStyle=t.fort?'#807863':'#8c5941';c.beginPath();c.moveTo(x+1,y+9);c.lineTo(x+9,y);c.lineTo(x+18,y+9);c.lineTo(x+9,y+15);c.closePath();c.fill();c.fillStyle='#493d30';c.fillRect(x+8,y+13,3,4);}}
}
function figure(q,p,g,face,pose,phase){
 const horse=p.type===6||p.type===7,ink=PALETTE[g.f]||'#b6a17e',stride=pose==='walk'?Math.sin(phase*Math.PI/2):0,attack=pose==='fight'?Math.sin(phase*Math.PI/2)*1.7:0;
 const oval=(x,y,rx,ry,color)=>{q.fillStyle=color;q.beginPath();q.ellipse(x,y,rx,ry,0,0,Math.PI*2);q.fill();};
 const line=(x,y,u,v,color,width)=>{q.strokeStyle=color;q.lineWidth=width;q.lineCap='round';q.beginPath();q.moveTo(x,y);q.lineTo(u,v);q.stroke();};
 q.rotate(face*Math.PI/8);
 if(pose==='down'){oval(0,1,3.4,1.9,'#342b2466');oval(-.7,0,2.7,1.5,ink);oval(2.5,0,1,1,'#bba388');return;}
 oval(-.3,1.8,horse?7:3.3,horse?3.8:2.5,'#24291d70');
 if(horse){for(const side of [-1,1]){line(-3,side*1.5,-5+stride*side,side*3.4,'#44342b',1);line(2,side*1.5,3-stride*side,side*3.4,'#44342b',1);}oval(-1,0,5.6,2.4,'#574333');oval(-1.4,-.6,4.8,1.5,p.type===7?'#857965':'#ae8458');oval(4,0,2.6,1.3,'#73543c');line(5,-.9,6.2,-1.5,'#302b23',.6);line(-5,0,-7,-.8,'#332b25',1);oval(-.8,0,2.7,2.1,'#b2a27a');}
 else{for(const side of [-1,1]){line(-1,side*.85,-2.8+stride*side,side*1.5,'#443d30',1.1);line(-2.8+stride*side,side*1.5,-3.3+stride*side,side*1.6,'#272921',.8);}}
 oval(-.5,0,2.5,2.05,'#34332b');oval(-.65,-.22,2.1,1.75,pose==='hit'?'#dfb68b':ink);
 if([1,2,3,7].includes(p.type)){oval(-.5,-.35,1.55,1.15,'#b1afa0');line(-1.9,-.85,.8,-.85,'#e0daca',.55);}
 for(const side of [-1,1]){line(-.4,side*1.4,1.05+attack,side*2.1,'#4b4537',1.1);oval(1.1+attack,side*2.05,.6,.55,'#d4aa80');}
 oval(1.1,0,1.35,1.25,'#453d2c');oval(1.35,-.2,1.05,.96,[0,4,6].includes(p.type)?'#ac946b':'#c4c2b4');oval(2,.03,.6,.65,'#e5bf91');
 if([0,1,2,7].includes(p.type)){oval(pose==='block'?2:.3,-2.25,1.6,1.05,'#504535');oval(pose==='block'?2:.3,-2.4,1.35,.82,'#bfa46f');oval(.3,-2.4,.4,.4,'#e0d6ba');}
 if(p.type===8){oval(-1,-2,1.5,1.5,'#514331');oval(-1,2,1.5,1.5,'#514331');line(-2,0,4,0,'#343632',2.2);}
 else if(p.type===9){line(-1,1,5,1,'#674c35',1.2);line(1,1,6,1,'#a4a69e',.8);if(pose==='shoot')oval(6.2,1,1.2,.7,'#edc477');}else if(p.type===5){line(-1,0,5,0,'#674c35',1.2);q.strokeStyle='#b6b1a2';q.lineWidth=.75;q.beginPath();q.moveTo(2,-2.4);q.quadraticCurveTo(4,0,2,2.4);q.stroke();line(2,-2.4,2,2.4,'#e1d5b8',.35);}else if(p.type===4){q.strokeStyle='#9b7747';q.lineWidth=.8;q.beginPath();q.moveTo(2,-2.5);q.quadraticCurveTo(5,0,2,2.5);q.stroke();line(2,-2.5,2,2.5,'#e3d7b8',.35);if(pose==='shoot')line(2,0,6,0,'#e0d7ae',.5);}
 else{const reach=[3.5,4,7,10,4,4,6,8,3,4][p.type];line(0,2,reach+attack,1.6,'#5d4934',.65);line(reach+attack-1.3,1.6,reach+attack+.8,1.6,'#d5d6c4',.7);}
}


/* Review-only Living Atlas slice. Real geography sampled as a continuous field;
   all knowledge checks precede access to underlying terrain. */
function regionSurface(atlas,s,cam,mode,visible){
 const c=atlas.ctx,scale=cam.s,x0=clamp(Math.floor(-cam.ox/scale)-1,0,W-1),y0=clamp(Math.floor(-cam.oy/scale)-1,0,H-1),x1=clamp(Math.ceil((atlas.width-cam.ox)/scale)+1,x0+1,W),y1=clamp(Math.ceil((atlas.height-cam.oy)/scale)+1,y0+1,H);
 const res=clamp(Math.ceil(scale*1.15),4,16),key=[atlas.cache,x0,y0,x1,y1,res].join('|');
 if(atlas.regionKey!==key||atlas.regionState!==s){atlas.regionState=s;atlas.regionKey=key;const canvas=atlas.regionCanvas??=document.createElement('canvas');canvas.width=(x1-x0)*res;canvas.height=(y1-y0)*res;const ctx=canvas.getContext('2d'),im=ctx.createImageData(canvas.width,canvas.height),out=im.data,m=s.map,field=(x,y,k)=>{const i=idx(clamp(x,0,W-1),clamp(y,0,H-1));return !visible(i)?null:k==='forest'?+(m.terrain[i]===2):k==='rock'?+([3,4].includes(m.terrain[i])):m[k][i];};
 const sample=(x,y,k)=>{const u=x-.5,v=y-.5,ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy,weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],p=[[ix,iy],[ix+1,iy],[ix,iy+1],[ix+1,iy+1]];let a=0,b=0;for(let j=0;j<4;j++){const z=field(p[j][0],p[j][1],k);if(z!==null){a+=z*weights[j];b+=weights[j];}}return b?a/b:null;};
 const noise=(x,y,frequency)=>{const a=x*frequency,b=y*frequency,i=Math.floor(a),j=Math.floor(b),u=a-i,v=b-j;return (grainAt(i,j)*(1-u)+grainAt(i+1,j)*u)*(1-v)+(grainAt(i,j+1)*(1-u)+grainAt(i+1,j+1)*u)*v;};
 for(let py=0;py<canvas.height;py++)for(let px=0;px<canvas.width;px++){const x=x0+(px+.5)/res,y=y0+(py+.5)/res,i=idx(Math.floor(x),Math.floor(y)),j=(py*canvas.width+px)*4;let rgb=[220,205,168];const n=noise(x,y,1.8),fine=noise(x+27,y+29,12),paper=(fine-.5)*7;
 if(visible(i)){const h=sample(x,y,'height')??0,land=sample(x,y,'land')??0,moist=sample(x,y,'moisture')??.5,fert=sample(x,y,'fert')??.5,light=clamp(((sample(x-.35,y-.35,'height')??h)-h)*570,-45,45);
 const forest=sample(x,y,'forest')??0,rock=sample(x,y,'rock')??0;let earth=mix([151,157,101],[201,189,130],clamp(fert*.5+n*.35+(1-moist)*.15,0,1));earth=mix(earth,mix([79,104,65],[125,145,91],n),clamp(forest+(n-.5)*.12,0,1));earth=mix(earth,mix([139,129,103],[199,184,151],n),rock);if(mode==='political'){const owner=s.discovery&&!s.discovery.fullMap&&!s.autonomous?observedOwner(s,s.playerFaction??0,i):s.owner[i];if(owner>=0)earth=mix(earth,RGB[owner],.12);}earth=earth.map(v=>v+light+(fine-.5)*9);const water=mix([53,89,108],[114,151,149],clamp(land*1.65+n*.13,0,1));rgb=mix(water,earth,fade(land,.37,.64));
 // A narrow shore follows interpolated land coverage, never a decorative ridge.
 if(land>.43&&land<.56)rgb=mix(rgb,[205,189,140],.25);
 }
 out[j]=rgb[0]+paper;out[j+1]=rgb[1]+paper;out[j+2]=rgb[2]+paper;out[j+3]=255;}
 ctx.putImageData(im,0,0);}
 c.drawImage(atlas.regionCanvas,x0,y0,x1-x0,y1-y0);
}
const canopySprites=[];
function canopy(variant){
 if(canopySprites[variant])return canopySprites[variant];const a=document.createElement('canvas');a.width=a.height=48;const c=a.getContext('2d');c.translate(24,26);c.fillStyle='#233b2855';c.beginPath();c.ellipse(5,6,17,9,-.2,0,Math.PI*2);c.fill();
 for(let k=0;k<7;k++){const z=grainAt(k,variant+8),x=(z-.5)*20,y=(grainAt(variant,k+13)-.5)*16,r=7+z*4,g=c.createRadialGradient(x-r*.35,y-r*.45,1,x,y,r);g.addColorStop(0,variant%2?'#a0a96a':'#849d61');g.addColorStop(.55,variant%2?'#647c43':'#527441');g.addColorStop(1,'#304d30');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}return canopySprites[variant]=a;
}
function forestStands(c,s,visible,scale,minX,maxX,minY,maxY){
 if(scale<2.5)return;c.save();c.globalAlpha=fade(scale,2.5,5);const step=.39;
 // Candidate points belong to a separate, staggered spatial lattice, then
 // jittered and filtered by the actual surveyed forest mask and moisture.
 for(let gy=Math.floor(minY/step);gy<=Math.ceil((maxY+1)/step);gy++)for(let gx=Math.floor(minX/step);gx<=Math.ceil((maxX+1)/step);gx++){const n=grainAt(gx,gy),x=(gx+.5+(n-.5)*.94)*step,y=(gy+.5+(grainAt(gx+53,gy-11)-.5)*.94)*step;if(x<0||y<0||x>=W||y>=H)continue;const i=idx(Math.floor(x),Math.floor(y));if(!visible(i)||s.map.terrain[i]!==2||!s.map.land[i])continue;const patch=.5+.25*Math.sin(x*.91+y*.73)+.22*Math.cos(x*1.41-y*.65);if(n>patch*.85+.15)continue;const size=.19+grainAt(gx-13,gy+21)*.29;const a=canopy(Math.floor(n*4));c.drawImage(a,x-size/2,y-size*.67,size,size);}
 c.restore();
}
const sliceBuildings=new Map(),sliceTowns=new Map();
function buildingAsset(type,variant){
 const key=type+':'+variant;if(sliceBuildings.has(key))return sliceBuildings.get(key);
 const a=document.createElement('canvas');a.width=112;a.height=120;const c=a.getContext('2d');c.translate(56,87);
 const poly=(p,fill,stroke='#66533f')=>{c.beginPath();c.moveTo(...p[0]);for(const x of p.slice(1))c.lineTo(...x);c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.65;c.stroke();}};
 const project=(x,y,z)=>[(x-y)*.86,(x+y)*.42-z];
 const shape=(p,fill,edge)=>poly(p.map(v=>project(...v)),fill,edge);
 const box=(x,y,w,d,h,roof,stone=false)=>{const light=stone?'#cbbda1':'#e9d0a1',shadow=stone?'#9b8c74':'#af8a5e';
 shape([[x+4,y+3,0],[x+w+6,y+3,0],[x+w+6,y+d+6,0],[x+4,y+d+6,0]],'#453d2e46',null);
 shape([[x,y+d,0],[x+w,y+d,0],[x+w,y+d,h],[x,y+d,h]],light);
 shape([[x+w,y,0],[x+w,y+d,0],[x+w,y+d,h],[x+w,y,h]],shadow);
 if(roof){const ridge=h+Math.min(w,d)*.47;shape([[x-1,y-1,h],[x+w*.5,y-1,ridge],[x+w*.5,y+d+1,ridge],[x-1,y+d+1,h]],roof);shape([[x+w*.5,y-1,ridge],[x+w+1,y-1,h],[x+w+1,y+d+1,h],[x+w*.5,y+d+1,ridge]],'#794f3a');shape([[x-1,y+d+1,h],[x+w+1,y+d+1,h],[x+w*.5,y+d+1,ridge]],light);}
 else shape([[x,y,h],[x+w,y,h],[x+w,y+d,h],[x,y+d,h]],'#c3b090');
 for(let k=3;k<w-2;k+=6){shape([[x+k,y+d+.1,h*.52],[x+k+2.2,y+d+.1,h*.52],[x+k+2.2,y+d+.1,h*.73],[x+k,y+d+.1,h*.73]],'#5b5141',null);}
 shape([[x+w*.44,y+d+.1,0],[x+w*.62,y+d+.1,0],[x+w*.62,y+d+.1,Math.min(7,h*.5)],[x+w*.44,y+d+.1,Math.min(7,h*.5)]],'#594333',null);
 if(stone&&h>16){for(let k=1;k<w;k+=5)shape([[x+k,y+d,h],[x+k+2.5,y+d,h],[x+k+2.5,y+d,h+3],[x+k,y+d,h+3]],light);}
 };
 const roof=['#aa6b43','#97604a','#80634a'][variant%3];
 if(type==='house')box(-9,-8,18,16,12+variant*2,roof);
 else if(type==='workshop'){box(-14,-8,27,18,11,roof);box(6,-5,4,5,25,null,true);}
 else if(type==='warehouse')box(-15,-10,30,20,15,'#89714e');
 else if(type==='church'){box(-9,-15,18,29,18,'#8a7657',true);box(-5,6,10,10,36,'#726d58',true);}
 else if(type==='keep'){box(-16,-12,30,25,26,null,true);box(-18,9,9,9,33,null,true);box(8,9,9,9,33,null,true);}
 else if(type==='tower')box(-7,-7,14,14,27,null,true);
 else if(type==='wall')box(-13,-3,26,6,12,null,true);
 else if(type==='gate'){box(-14,-4,8,9,23,null,true);box(6,-4,8,9,23,null,true);box(-6,-3,12,8,17,null,true);}
 else if(type==='market'){for(let n=0;n<3;n++){const x=-14+n*10;box(x,-6,8,7,5,n%2?'#a77a46':'#8c5440');}}
 else if(type==='pier'){shape([[-9,-14,0],[8,-14,0],[8,22,0],[-9,22,0]],'#a38253');for(let n=-10;n<22;n+=4)shape([[-9,n,0],[8,n,0],[8,n+1,0],[-9,n+1,0]],'#655139',null);}
 sliceBuildings.set(key,a);return a;
}
function sliceSettlement(c,city,r,scale){
 if(scale<2.4){settlementMark(c,city,r,scale);return;}
 const level=city.pop>4200?4:city.pop>1600?3:city.pop>900?2:1,fort=city.fort||0,port=city.port||0,variant=hash(String(city.name))%3,industry=(city.build||[]).slice(2).reduce((a,b)=>a+b,0),key=[level,fort,port,variant,Math.min(4,industry),!!city.capital].join('|');
 let image=sliceTowns.get(key);if(!image){image=document.createElement('canvas');image.width=400;image.height=320;const q=image.getContext('2d');q.translate(200,178);
 const positions=[],push=(type,x,y,k=0)=>positions.push({type,x,y,k});
 const size=level===4?5:level===3?4:level===2?3:2;
 // Streets through rectangular and oblique quarters, no circular pedestal.
 q.strokeStyle='#b6a17b9c';q.lineWidth=7;q.lineCap='round';q.beginPath();q.moveTo(-size*22,14);q.quadraticCurveTo(-12,-5,size*22,-12);q.moveTo(-5,-size*13);q.lineTo(8,size*14);q.stroke();
 for(let row=-size;row<=size;row++)for(let col=-size;col<=size;col++){if(Math.abs(row)+Math.abs(col)>size+1||Math.abs(col)<1&&Math.abs(row)<2||row===0||col===0)continue;const z=grainAt(row+variant*11,col+4);if(z<.13)continue;push(industry&&z>.82?'workshop':z>.72?'warehouse':'house',col*23+row*6+(z-.5)*9,row*13+(grainAt(col,row)-.5)*6,Math.floor(z*3));}
 push('market',-12,7,variant);if(city.capital||level>=3)push('church',-26,-22,variant);if(city.capital||fort)push('keep',30,-28,variant);
 if(fort>=2||city.capital&&level>=3){const x=size*20,y=size*12;for(let k=-size;k<=size;k++){if(k!==0)push('wall',k*20,y,variant);push('wall',k*20,-y,variant);}push('gate',0,y,variant);for(const u of [-1,1])for(const v of [-1,1])push('tower',x*u,y*v,variant);}
 if(port){push('warehouse',size*21,12,variant);for(let k=0;k<Math.min(3,port);k++)push('pier',size*21+k*9,28+k*9,variant);}
 positions.sort((a,b)=>a.y-b.y);for(const z of positions){const asset=buildingAsset(z.type,z.k%3);q.drawImage(asset,z.x-34,z.y-53,68,73);}
 if(sliceTowns.size>=96)sliceTowns.delete(sliceTowns.keys().next().value);sliceTowns.set(key,image);}
 const size=clamp(scale*14,54,level>=3||city.capital?320:125);c.drawImage(image,-size/2,-size*178/400,size,size*320/400);
}

function sliceRivers(c,s,visible,scale){
 const incoming=new Map();for(const i of visible){const d=s.map.down[i];if(d<0||!s.map.river[i])continue;const old=incoming.get(d);if(old===undefined||(s.map.flow?.[i]||0)>(s.map.flow?.[old]||0))incoming.set(d,i);}
 const known=new Set(visible),center=i=>[xx(i)+.5,yy(i)+.5];
 for(const i of visible){const j=s.map.down[i];if(j<0||!known.has(j)||!s.map.river[i])continue;const [ax,ay]=center(i),[bx,by]=center(j),pre=incoming.get(i),post=s.map.down[j],p=pre!==undefined&&known.has(pre)?center(pre):[ax-(bx-ax),ay-(by-ay)],n=post>=0&&known.has(post)?center(post):[bx+(bx-ax),by+(by-ay)];const width=clamp(Math.sqrt(s.map.flow?.[i]||15)*.008,.045,.23);
 const draw=(color,stroke)=>{c.strokeStyle=color;c.lineWidth=stroke;c.beginPath();c.moveTo(ax,ay);c.bezierCurveTo(ax+(bx-p[0])*.18,ay+(by-p[1])*.18,bx-(n[0]-ax)*.18,by-(n[1]-ay)*.18,bx,by);c.stroke();};
 draw('#a5a68c',width+.075);draw('#467f89',width);if(scale>12)draw('#80b0b0',width*.35);
 }
}
function sliceDistrict(c,x,y,d,dev,i){
 if(d===2&&dev>.15){c.save();c.translate(x+.5,y+.5);c.rotate((grainAt(i,81)-.5)*.65);c.fillStyle='#bcb273b8';c.beginPath();c.moveTo(-.35,-.32);c.lineTo(.34,-.25);c.lineTo(.28,.32);c.lineTo(-.35,.26);c.closePath();c.fill();c.strokeStyle='#777441';c.lineWidth=.025;for(let n=-.25;n<.28;n+=.09){c.beginPath();c.moveTo(n,-.25);c.lineTo(n+.03,.24);c.stroke();}c.restore();}
 else if(d===4&&dev>.15){c.fillStyle='#8e8271';c.beginPath();c.ellipse(x+.5,y+.5,.32,.25,.3,0,Math.PI*2);c.fill();c.fillStyle='#5d5548';c.beginPath();c.ellipse(x+.53,y+.46,.19,.13,.3,0,Math.PI*2);c.fill();const a=buildingAsset('workshop',i%3);c.drawImage(a,x+.04,y+.02,.5,.54);}
 else if([5,6,7,9].includes(d)&&dev>.15){const a=buildingAsset(d===5?'workshop':d===7?'warehouse':'house',i%3);c.drawImage(a,x+.09,y+.03,.78,.84);}
}

export class Camera{
 constructor(w,h){this.w=w;this.h=h;this.x=w/2;this.y=h/2;this.zoom=1;this.s=1;this.ox=0;this.oy=0}
 layout(w,h){const {left=0,right=0,top=0,bottom=0}=this.insets||{},vw=Math.max(100,w-left-right),vh=Math.max(100,h-top-bottom);this.s=(this.cover?Math.max(vw/this.w,vh/this.h):Math.min(vw/this.w,vh/this.h))*this.zoom;this.ox=left+vw/2-this.x*this.s;this.oy=top+vh/2-this.y*this.s}
 screen(x,y){return [(x-this.ox)/this.s,(y-this.oy)/this.s]}
 pan(dx,dy){this.x=clamp(this.x-dx/this.s,0,this.w);this.y=clamp(this.y-dy/this.s,0,this.h)}
 zoomAt(f,x,y,w,h){let [a,b]=this.screen(x,y);this.zoom=clamp(this.zoom*f,this.cover?.28:.75,24);this.layout(w,h);let [c,d]=this.screen(x,y);this.x=clamp(this.x+a-c,0,this.w);this.y=clamp(this.y+b-d,0,this.h)}
}
export class Atlas{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.land=document.createElement('canvas');this.land.width=W;this.land.height=H;this.relief=document.createElement('canvas');this.relief.width=W*3;this.relief.height=H*3;this.cache='';this.terrain=document.createElement('canvas');this.terrain.width=1000;this.terrain.height=640;this.lastBattle=null;this.baseMap=null;this.baseColors=null;this.fast=false;this.metrics={texture:0,map:0}}
 resize(quality){let rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,quality==='low'?1:2);let w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}this.width=rect.width;this.height=rect.height;this.ctx.setTransform(dpr,0,0,dpr,0,0)}
 fit(cam,battle){
 if(this.canvas.id!=='atlas'){cam.insets=null;cam.cover=false;return;}
 const rect=this.canvas.getBoundingClientRect(),hud=document.getElementById('hud'),panel=document.getElementById('panel'),dock=document.getElementById('dock'),layers=document.getElementById('layers');
 const portrait=this.height>this.width,top=Math.max(0,(hud?.getBoundingClientRect().bottom||rect.top)-rect.top+4);
 const inset={top,left:0,right:0,bottom:0};
 if(!battle&&layers&&getComputedStyle(layers).display!=='none'){const q=layers.getBoundingClientRect();if(portrait)inset.top=Math.max(top,q.bottom-rect.top+4);else inset.left=Math.max(0,q.right-rect.left+5);}
 if(!battle&&dock&&getComputedStyle(dock).display!=='none')inset.bottom=Math.max(0,rect.bottom-dock.getBoundingClientRect().top+4);
 if(panel?.querySelector('.panelhead,.battle-quick')&&getComputedStyle(panel).display!=='none'){const q=panel.getBoundingClientRect();if(portrait)inset.bottom=Math.max(inset.bottom,rect.bottom-q.top+6);else inset.right=Math.max(0,rect.right-q.left+6);}
 cam.insets=inset;cam.cover=!!battle&&portrait;
 }
 texture(s,mode,goods=9){const start=performance.now(),fast=this.fast;if(this.land.width!==W||this.land.height!==H){this.land.width=W;this.land.height=H;this.relief.width=W*3;this.relief.height=H*3;this.cache='';this.baseMap=null;}let key=(fast?'fast|':'detail|')+s.seed+'|'+(s.mapVersion||1)+'|'+mode+'|'+goods+'|'+Math.floor(s.day/4)+'|'+s.cities.length+'|'+s.news.length+'|'+(s.playerFaction??0)+'|'+(s.politics?.lastReview??0)+'|'+(s.politics?.next??0);if(key===this.cache&&this.cachedState===s)return;this.cache=key;this.cachedState=s;let ctx=this.land.getContext('2d'),im=ctx.createImageData(W,H),data=im.data,by=new Map(s.cities.map(c=>[c.id,c])),pf=s.playerFaction??0,pol=s.politics,claims=new Set(pol?.plans[pf]?.interests.filter(q=>q.cell!=null).map(q=>q.cell)||[]),active=pol?.contracts.filter(t=>t.status==='active'&&(t.end==null||t.end>s.day))||[],influence=new Map(),friends=new Set();for(const t of active)for(const q of t.clauses){if(['vassal','protectorate','dependent-alliance','tribute'].includes(q.kind))influence.set(q.from,q.to);if(['alliance','defense','guarantee'].includes(q.kind)&&(q.from===pf||q.to===pf))friends.add(q.from===pf?q.to:q.from);}if(this.baseMap!==s.map){this.baseMap=s.map;this.baseColors=new Uint8ClampedArray(N*3);for(let i=0;i<N;i++){const m=s.map,e=m.height[i],p=m.terrain[i],v=clamp(e+.12,0,.24),base=p===4?[175,166,146]:p===3?[164,148,111]:p===2?[107,132,90]:p===5?[137,153,109]:p===6?[191,174,121]:[174,177,126],hill=0,grain=(hash(s.seed+i)%9)-4;let rgb=m.land[i]?base.map(v=>v+hill+grain):[43+v*120,78+v*120,88+v*115];if(m.land[i]&&m.river[i])rgb=mix(rgb,[104,144,105],.23);this.baseColors.set(rgb,i*3);}}const fog=s.discovery&&!s.discovery.fullMap&&!s.autonomous,visible=i=>!fog||charted(s,pf,i),ownCenters=s.cities.filter(c=>c.f===pf);for(let i=0;i<N;i++){let m=s.map,j=i*4,c=[this.baseColors[i*3],this.baseColors[i*3+1],this.baseColors[i*3+2]];
if(!visible(i))c=[222,207,170];else if(m.land[i]){const e=m.height[i],left=xx(i)>0&&visible(i-1)?m.height[i-1]:e,up=yy(i)>0&&visible(i-W)?m.height[i-W]:e,shade=clamp((left-e)*310+(up-e)*260,-44,44);c=c.map(v=>v+shade);let owner=fog?observedOwner(s,pf,i):s.owner[i],fresh=!fog||freshIntel(s,pf,i),city=fresh?by.get(s.admin[i]):null;if(!fresh)c=mix(c,[120,115,91],.25);if(mode==='political'&&owner>=0)c=mix(c,RGB[owner],.34);if(mode==='diplomatic'&&owner>=0){const v=pol?.views[pf]?.[owner];c=mix(c,owner===pf?[219,192,122]:s.relations[pf][owner]==='war'?[165,64,49]:friends.has(owner)?[74,143,172]:v&&v.threat>.4?[196,137,63]:v&&v.trust>.55?[83,151,115]:[120,125,120],.78);}if(mode==='interests'&&owner>=0){const q=pol?.plans[pf]?.interests.find(q=>q.target===owner);c=mix(c,owner===pf?[219,192,122]:q?[191,126,58]:[123,126,117],q?.weight?Math.min(.9,.35+q.weight):.38);if(claims.has(i))c=[243,198,87];}if(mode==='influence'&&owner>=0)c=mix(c,RGB[influence.get(owner)??owner],.78);if(mode==='resource')c=mix(c,COLORS[m.resource[i]]?.match(/\w\w/g)?.map(x=>parseInt(x,16))||[150,150,150],.75);if(mode==='admin'&&city)c=mix(c,[75+hash(city.id)%150,85+hash(city.id+'g')%140,85+hash(city.id+'b')%140],.75);if(fresh&&mode==='property'){const t=s.society?.architecture?.titles['land:'+i];if(t){const h=hash(t.owner);c=mix(c,[60+h%160,65+(h>>>8)%155,70+(h>>>16)%150],.8);}}if(fresh&&mode==='authority'&&city?.society){const autonomy=city.society.autonomy;c=mix(c,[Math.round(70+130*autonomy),Math.round(155-70*autonomy),Math.round(190-90*autonomy)],.8);}if(fresh&&['culture','religion'].includes(mode)&&city?.communities){const field=mode==='culture'?'culture':'faith',row=city.communities.reduce((best,q)=>!best||q.pop>best.pop?q:best,null),h=hash(row?.[field]||'');c=mix(c,[70+h%150,70+(h>>>8)%150,70+(h>>>16)%150],.75);}if(mode==='economy'&&city)c=mix(c,[206,155,65],Math.min(.9,city.wealth/100)*(s.development?.[i]||0));if(mode==='population'&&city)c=mix(c,[175,66,46],clamp(city.pop/4000,.15,.95));if(mode==='supply'){let near=ownCenters.some(c=>Math.hypot(xx(c.i)-xx(i),yy(c.i)-yy(i))<9);c=mix(c,near?[120,200,133]:[116,100,91],.65)}if(mode==='goods'){const raw=goods<9&&m.resource[i]===goods,amount=raw?(s.development?.[i]||0):city?Math.min(1,city.output[goods]/5):0;c=mix(c,raw?[218,188,90]:[128,169,106],amount*.9);if(city&&city.demand[goods]>city.output[goods]&&city.stock[goods]<city.demand[goods]*4)c=mix(c,[165,71,42],.35);}if(mode==='knowledge'&&city){const known=city.knowledge?.use?.[goods%KNOWLEDGE.length]||0;c=mix(c,[217,177,83],known*.85);}if(mode==='charts'&&s.discovery)c=mix(c,[215,205,155],Math.max(.12,.65-Math.max(0,s.day-(s.discovery.charts[pf][i]||0))/1440));if(mode==='development')c=mix(c,[229,191,101],(s.development?.[i]||0)*.9);if(mode==='admin'&&city&&!s.adminAccess?.[i])c=mix(c,[39,39,36],.65);if(fresh&&mode==='war'&&s.occ[i]>=0)c=mix(c,RGB[s.occ[i]],.8);if(fresh&&mode==='war'&&s.occ[i]<0&&s.pressure?.[i]>.05)c=mix(c,[171,72,43],s.pressure[i]*.7);if(fresh&&s.devastation?.[i]>.1)c=mix(c,[81,68,57],s.devastation[i]*.65);if(fresh&&s.occ[i]>=0&&((xx(i)+yy(i))%4<2))c=mix(c,[45,35,31],.5);}
data[j]=c[0];data[j+1]=c[1];data[j+2]=c[2];data[j+3]=255}ctx.putImageData(im,0,0);
 if(mode!=='grid'&&!fast){const rc=this.relief.getContext('2d'),rw=this.relief.width,rh=this.relief.height,hi=rc.createImageData(rw,rh),out=hi.data,land=s.map.land;
 for(let py=0;py<rh;py++)for(let px=0;px<rw;px++){const x=px/3-.333,y=py/3-.333,x0=clamp(Math.floor(x),0,W-1),y0=clamp(Math.floor(y),0,H-1),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),u=clamp(x-x0,0,1),v=clamp(y-y0,0,1),ids=[idx(x0,y0),idx(x1,y0),idx(x0,y1),idx(x1,y1)],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];let lf=0,known=0;for(let k=0;k<4;k++){if(visible(ids[k])){lf+=weights[k]*land[ids[k]];known+=weights[k];}}lf=known?lf/known:0;let noise=(Math.imul(px+19,374761393)^Math.imul(py+23,668265263))>>>0,grain=((noise>>>12)%11-5)*.68,surface=lf+(grain*.012)>=.5?1:0,sum=0,r=0,g=0,b=0;for(let k=0;k<4;k++){if(!visible(ids[k])||land[ids[k]]!==surface)continue;let weight=weights[k],i=ids[k]*4;sum+=weight;r+=data[i]*weight;g+=data[i+1]*weight;b+=data[i+2]*weight;}let j=(py*rw+px)*4;if(sum<.001){r=222;g=207;b=170;sum=1;}const mask=clamp((known-.28)/.6,0,1);out[j]=(r/sum)*mask+222*(1-mask)+grain;out[j+1]=(g/sum)*mask+207*(1-mask)+grain;out[j+2]=(b/sum)*mask+170*(1-mask)+grain;out[j+3]=255;}rc.putImageData(hi,0,0);}this.metrics.texture=performance.now()-start;
 }
 map(s,cam,mode,selection,quality,goods=9){if(['relief','engraved','living'].includes(this.artCandidate)&&['geography','political'].includes(mode)){drawGeographyReview(this,s,cam,mode,selection,quality,this.artCandidate);return;}const started=performance.now(),pf=s.playerFaction??0,fog=s.discovery&&!s.discovery.fullMap&&!s.autonomous,visibleCell=i=>!fog||charted(s,pf,i),fresh=i=>!fog||freshIntel(s,pf,i),owner=i=>fog?observedOwner(s,pf,i):s.owner[i];this.resize(quality);let c=this.ctx,w=this.width,h=this.height;this.fit(cam,false);cam.layout(w,h);this.texture(s,mode,goods);c.fillStyle=fog?'#decfaa':'#20353a';c.fillRect(0,0,w,h);c.save();c.translate(cam.ox,cam.oy);c.scale(cam.s,cam.s);c.imageSmoothingEnabled=mode!=='grid';c.drawImage(mode==='grid'||this.fast?this.land:this.relief,0,0,W,H);let scale=cam.s;if(this.artCandidate&&!this.fast&&['political','geography'].includes(mode))regionSurface(this,s,cam,mode,visibleCell);
if(this.frontierKey!==this.cache||this.frontierState!==s){this.frontierKey=this.cache;this.frontierState=s;this.frontierPath=frontier(s,owner,visibleCell);this.realmLabels=realmNames(s,owner,visibleCell);}
if(mode!=='geography'&&mode!=='grid'){c.lineJoin='round';c.lineCap='round';if(this.artCandidate){c.lineWidth=.85/scale;c.strokeStyle='#665438aa';c.stroke(this.frontierPath);}else{c.lineWidth=2.4/scale;c.strokeStyle='#443929a0';c.stroke(this.frontierPath);c.lineWidth=1.05/scale;c.strokeStyle='#eed8a9';c.stroke(this.frontierPath);}}

// Cartographic paths remain continuous; only the explicit survey layer shows the cell grid.
const minX=clamp(Math.floor(-cam.ox/scale)-1,0,W-1),maxX=clamp(Math.ceil((w-cam.ox)/scale)+1,0,W-1),minY=clamp(Math.floor(-cam.oy/scale)-1,0,H-1),maxY=clamp(Math.ceil((h-cam.oy)/scale)+1,0,H-1);
const visible=[];for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=idx(x,y);if(visibleCell(i)&&fresh(i))visible.push(i);}
// Sparse engraved relief marks; their screen density fades with zoom.
// Draw forest stands as overlapping canopy patches, and connected ridge strokes
// only between surveyed highland samples. No decorative terrain beyond the chart.
if(!this.artCandidate&&mode!=='grid'&&scale>1.4){c.save();c.globalAlpha=fade(scale,1.4,3.5)*.85;
for(const i of visible){const x=xx(i)+.5,y=yy(i)+.5,p=s.map.terrain[i],n=grainAt(xx(i),yy(i));if(!s.map.land[i])continue;
 if(p===3||p===4){const high=neighbors(i).filter(j=>visibleCell(j)&&s.map.land[j]&&(s.map.terrain[j]===3||s.map.terrain[j]===4));for(const j of high){if(j<=i)continue;const dx=xx(j)-xx(i),dy=yy(j)-yy(i),bend=(n-.5)*.22;c.lineCap='round';c.strokeStyle='#766e57a0';c.lineWidth=.18;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+dx*.5-dy*bend,y+dy*.5+dx*bend,x+dx,y+dy);c.stroke();c.strokeStyle='#ead8ad9c';c.lineWidth=.07;c.beginPath();c.moveTo(x-.10,y-.10);c.quadraticCurveTo(x+dx*.5-dy*bend-.10,y+dy*.5+dx*bend-.10,x+dx-.10,y+dy-.10);c.stroke();}if(n<.45){c.strokeStyle='#675f4b80';c.lineWidth=.045;for(let k=0;k<3;k++){c.beginPath();c.moveTo(x-.22+k*.18,y+.1);c.lineTo(x-.06+k*.18,y+.34);c.stroke();}}}
 else if(p===2&&cam.zoom<=4){const density=neighbors(i).filter(j=>visibleCell(j)&&s.map.terrain[j]===2).length;for(let k=0;k<Math.min(5,1+density);k++){const z=grainAt(i,k),dx=(z-.5)*.8,dy=(grainAt(k,i)-.5)*.65,rad=.16+z*.23;c.fillStyle='#38533a65';c.beginPath();c.ellipse(x+dx+.05,y+dy+.08,rad*1.2,rad*.85,0,0,Math.PI*2);c.fill();c.fillStyle=k%3?'#466942a8':'#789052a8';c.beginPath();c.ellipse(x+dx,y+dy,rad,rad*.8,0,0,Math.PI*2);c.fill();}}}
c.restore();}
if(this.artCandidate&&mode!=='grid')forestStands(c,s,visibleCell,scale,minX,maxX,minY,maxY);
c.lineCap='round';if(this.artCandidate&&mode!=='grid')sliceRivers(c,s,visible,scale);else for(const wide of [false,true]){c.strokeStyle=wide?'#488b99':'#679eaa';c.lineWidth=Math.max((wide?1.25:.65)/scale,wide?.17:.08);c.beginPath();for(const i of visible){let d=s.map.down[i];if(!s.map.river[i]||d<0||!visibleCell(d)||((s.map.flow?.[i]||50)>190)!==wide)continue;let ax=xx(i)+.5,ay=yy(i)+.5,dx=xx(d)-xx(i),dy=yy(d)-yy(i),fraction=s.map.land[d]?1:.5,z=(hash(s.seed+'stream'+i)%17-8)/100;c.moveTo(ax,ay);c.quadraticCurveTo(ax+dx*fraction*.5-dy*z,ay+dy*fraction*.5+dx*z,ax+dx*fraction,ay+dy*fraction);}c.stroke();}
if(cam.zoom>1.7){
 c.lineWidth=Math.max(.10,1.15/scale);c.strokeStyle='#614b36b0';c.beginPath();
 for(const i of visible)if(s.road[i])for(const j of neighbors(i))if(j>i&&visibleCell(j)&&s.road[j]){c.moveTo(xx(i)+.5,yy(i)+.5);c.lineTo(xx(j)+.5,yy(j)+.5);}c.stroke();
 for(const i of visible)if(s.bridge?.[i]){const x=xx(i)+.5,y=yy(i)+.5;c.strokeStyle='#e4c59b';c.lineWidth=.17;c.beginPath();c.moveTo(x-.24,y);c.lineTo(x+.24,y);c.stroke();}
}
if(cam.zoom>4){
 for(const i of visible){if(!s.map.land[i])continue;let x=xx(i),y=yy(i),d=s.district?.[i]||0,dev=s.development?.[i]||0;
 if(this.artCandidate){sliceDistrict(c,x,y,d,dev,i);continue;}
 if(d===2&&dev>.15){c.fillStyle='#b6ad71';c.fillRect(x+.12,y+.14,.76,.72);c.strokeStyle='#716b3d';c.lineWidth=.025;for(let k=1;k<=5;k++){c.beginPath();c.moveTo(x+.12+k*.12,y+.15);c.lineTo(x+.12+k*.12,y+.85);c.stroke();}}
 else if(d===4&&dev>.15){c.fillStyle='#8b7969';c.fillRect(x+.2,y+.22,.6,.55);c.strokeStyle='#e0bca0';c.lineWidth=.055;c.beginPath();c.moveTo(x+.25,y+.65);c.lineTo(x+.7,y+.28);c.stroke();}
 else if([1,5,6,7,8,9].includes(d)){for(let k=0;k<Math.min(7,2+Math.floor(dev*6));k++){const dx=x+.12+(k%3)*.26,dy=y+.14+Math.floor(k/3)*.25;c.fillStyle='#d4c29b';c.fillRect(dx,dy+.08,.19,.17);c.fillStyle=d===5?'#8b6448':d===6?'#ae794d':d===9?'#7f7770':'#854c37';c.beginPath();c.moveTo(dx-.025,dy+.08);c.lineTo(dx+.095,dy-.025);c.lineTo(dx+.215,dy+.08);c.closePath();c.fill();}if(d===8){c.strokeStyle='#c1b59e';c.lineWidth=.09;c.strokeRect(x+.07,y+.07,.86,.86);}if(d===7){c.fillStyle='#c6a477';c.fillRect(x+.25,y+.6,.5,.13);}}
 else if(!this.artCandidate&&s.map.terrain[i]===2){for(let k=0;k<3;k++){const n=hash(s.seed+'tree'+i+':'+k),px=x+.14+(n%67)/100,py=y+.18+((n>>>8)%62)/100;c.fillStyle='#334f3d';c.beginPath();c.ellipse(px+.04,py+.05,.12,.1,0,0,Math.PI*2);c.fill();c.fillStyle='#456c46';c.beginPath();c.moveTo(px,py-.15);c.lineTo(px+.12,py+.1);c.lineTo(px-.12,py+.1);c.closePath();c.fill();}}
 }
}
if(mode==='grid'){c.lineWidth=.5/scale;c.strokeStyle='#ede5c955';c.beginPath();for(let x=minX;x<=maxX+1;x++){c.moveTo(x,minY);c.lineTo(x,maxY+1);}for(let y=minY;y<=maxY+1;y++){c.moveTo(minX,y);c.lineTo(maxX+1,y);}c.stroke();}
if(['diplomatic','influence','interests'].includes(mode)&&s.politics){const pf=s.playerFaction??0,pol=s.politics,cap=f=>{const cs=fog?observedCities(s,pf,f):s.cities.filter(q=>q.f===f);return cs.find(q=>q.capital)||cs[0]},draw=(a,b,color,dash)=>{const x=cap(a),y=cap(b);if(!x||!y||!visibleCell(x.i)||!visibleCell(y.i))return;c.strokeStyle=color;c.lineWidth=2/scale;c.setLineDash(dash?[5/scale,4/scale]:[]);c.beginPath();c.moveTo(xx(x.i)+.5,yy(x.i)+.5);c.lineTo(xx(y.i)+.5,yy(y.i)+.5);c.stroke();};if(mode==='interests'){for(const q of pol.plans[pf].interests){if(q.cell!=null){c.fillStyle='#f6d076';c.beginPath();c.arc(xx(q.cell)+.5,yy(q.cell)+.5,Math.max(.28,3/scale),0,Math.PI*2);c.fill();}else draw(pf,q.target,'#e5c36aaf',true);}}else{for(const t of pol.contracts.filter(t=>t.status==='active'&&(t.end==null||t.end>s.day))){const dep=t.clauses.some(q=>['vassal','protectorate','dependent-alliance','tribute'].includes(q.kind)),ally=t.clauses.some(q=>['alliance','defense','guarantee'].includes(q.kind));if(mode==='influence'&&dep)draw(t.a,t.b,'#f2d39e',false);if(mode==='diplomatic'&&ally)draw(t.a,t.b,'#8de0e0',true);}}c.setLineDash([]);}c.lineWidth=1/scale;for(const r of (fog?Object.values(s.discovery.intel[pf].routes).filter(q=>s.day-q.day<360):s.routes)){if(fog&&(!visibleCell(r.a)||!visibleCell(r.b)))continue;c.strokeStyle=r.sea?'#b7e4edb0':'#e0b85eaa';c.setLineDash([3/scale,3/scale]);c.beginPath();c.moveTo(xx(r.a)+.5,yy(r.a)+.5);for(const i of r.path||[])c.lineTo(xx(i)+.5,yy(i)+.5);c.lineTo(xx(r.b)+.5,yy(r.b)+.5);c.stroke()}c.setLineDash([]);
for(const sh of s.shipments||[]){if(!visibleCell(sh.i)||fog&&sh.fromFaction!==pf&&sh.toFaction!==pf&&!fresh(sh.i))continue;if(mode==='goods'&&!sh.goods[goods])continue;let x,y;if(sh.sea&&sh.path?.length){let t=clamp(sh.progress/sh.duration,0,1)*(sh.path.length-1),i=sh.path[Math.floor(t)],j=sh.path[Math.min(sh.path.length-1,Math.ceil(t))],u=t-Math.floor(t);x=xx(i)+.5+(xx(j)-xx(i))*u;y=yy(i)+.5+(yy(j)-yy(i))*u;}else if(sh.sea){let t=clamp(sh.progress/sh.duration,0,1);x=xx(sh.start)+.5+(xx(sh.end)-xx(sh.start))*t;y=yy(sh.start)+.5+(yy(sh.end)-yy(sh.start))*t;}else{let next=sh.path[sh.index]??sh.i,t=clamp(sh.progress,0,1);x=xx(sh.i)+.5+(xx(next)-xx(sh.i))*t;y=yy(sh.i)+.5+(yy(next)-yy(sh.i))*t;}if(cam.zoom>2){c.fillStyle=sh.wait?'#b55039':'#e6c68d';c.strokeStyle='#4d4635';c.lineWidth=.05;c.fillRect(x-.12,y-.08,.24,.16);c.strokeRect(x-.12,y-.08,.24,.16);if(cam.zoom>5){c.fillStyle='#403e32';for(const dx of [-.08,.08]){c.beginPath();c.arc(x+dx,y+.09,.04,0,Math.PI*2);c.fill();}}}}
for(const a of s.armies){if(a.fleet!=null||!a.path.length||fog&&a.f!==pf)continue;c.strokeStyle=PALETTE[a.f];c.lineWidth=1.6/scale;c.beginPath();c.moveTo(xx(a.i)+.5,yy(a.i)+.5);for(const i of a.path)c.lineTo(xx(i)+.5,yy(i)+.5);c.stroke()}
c.restore();
// Labels use only observed ownership and avoid covering a capital.
const labelQueue=[],labelsOccupied=[],screen=(i)=>[cam.ox+(xx(i)+.5)*scale,cam.oy+(yy(i)+.5)*scale];
const reserve=(x,y,width,height)=>labelsOccupied.push({x,y,width,height});
for(const city of (fog?observedCities(s,pf):s.cities)){if(visibleCell(city.i)){const [x,y]=screen(city.i);reserve(x,y-8,scale>=1.5?Math.min(116,Math.max(42,scale*6.4))*.72:20,scale>=1.5?Math.min(116,Math.max(42,scale*6.4))*.65:24);}}
for(const unit of s.armies){if(unit.fleet!=null||!visibleCell(unit.i)||fog&&unit.f!==pf&&!fresh(unit.i))continue;const [x,y]=screen(unit.i);reserve(x,y-12,30,20);}
if(mode==='political'||mode==='geography')for(const l of this.realmLabels||[]){if(Math.sqrt(l.n)*scale<55)continue;const [x,y]=screen(l.i);labelQueue.push({x,y:y-48,name:l.name.toUpperCase(),size:clamp(Math.sqrt(l.n)*scale*.17,11,23),priority:2,realm:true});}
for(const city of (fog?observedCities(s,pf):s.cities)){if(!visibleCell(city.i))continue;let x=cam.ox+(xx(city.i)+.5)*scale,y=cam.oy+(yy(city.i)+.5)*scale;if(x<-80||y<-30||x>w+80||y>h+30)continue;let r=city.capital?9:6;c.save();c.translate(x,y);if(fog&&city.f!==pf&&s.day-(city.day??s.day)>80)c.globalAlpha=.58;(this.artCandidate?sliceSettlement:settlementMark)(c,city,r,scale);if(city.knowledge?.use&&adoption(s,city,'masonry')>=.6){c.fillStyle='#ead6a5';c.fillRect(-r-2,-r-2,r*2+4,2);}if(city.port&&scale<1.5){c.fillStyle='#8dc0ce';c.fillRect(r+2,-r,3,r*2);}if(city.knowledge&&adoption(s,city,'bastions')>=.6){c.strokeStyle='#d6c392';c.beginPath();c.moveTo(-r-4,0);c.lineTo(0,-r-4);c.lineTo(r+4,0);c.lineTo(0,r+4);c.closePath();c.stroke();}if(city.knowledge&&adoption(s,city,'water-power')>=.6){c.fillStyle='#af8d57';c.beginPath();c.arc(-r-3,r,3,0,Math.PI*2);c.fill();}if((city.fort||city.capital)&&scale<1.5){c.fillStyle='#ead6a5';c.fillRect(-r,-r-3,3,4);c.fillRect(r-3,-r-3,3,4)}if(selection?.kind==='city'&&selection.id===city.id){c.strokeStyle='#fff3b5';c.lineWidth=2;c.beginPath();c.arc(0,0,r+6,0,Math.PI*2);c.stroke()}if(city.capital||cam.zoom>2.6||selection?.id===city.id&&selection.kind==='city'){labelQueue.push({x,y:y+r+18,name:city.name,size:city.capital?14:12,priority:selection?.kind==='city'&&selection.id===city.id?5:city.capital?4:1,realm:false})}c.restore()}
for(const v of s.fleets||[]){if(!visibleCell(v.i)||fog&&v.f!==pf&&!fresh(v.i))continue;let x=cam.ox+(xx(v.i)+.5)*scale,y=cam.oy+(yy(v.i)+.5)*scale;c.fillStyle=PALETTE[v.f];c.strokeStyle=selection?.kind==='fleet'&&selection.id===v.id?'#fff2a7':'#e4e9d9';c.lineWidth=1.5;c.beginPath();const size=v.type>=6?13:v.type===3?11:9;c.moveTo(x-size,y+5);c.lineTo(x+size,y+5);c.lineTo(x+5,y+10);c.lineTo(x-5,y+10);c.closePath();c.fill();c.stroke();if(v.type===3){for(let j=-8;j<=8;j+=4){c.beginPath();c.moveTo(x+j,y+5);c.lineTo(x+j-3,y+13);c.stroke();}}else{for(let j=0;j<(v.type>=6?3:v.type>=4?2:1);j++){const dx=j*6-(v.type>=6?6:0);c.beginPath();c.moveTo(x+dx,y-10);c.lineTo(x+dx,y+4);c.lineTo(x+dx+5,y+1);c.closePath();c.fill();c.stroke();}}}for(const v of s.convoys||[]){if(!visibleCell(v.i))continue;let x=cam.ox+(xx(v.i)+.5)*scale,y=cam.oy+(yy(v.i)+.5)*scale;c.fillStyle='#c5ac76';c.fillRect(x-3,y-3,6,6);}for(const a of s.armies){if(a.fleet!=null||!visibleCell(a.i)||fog&&a.f!==pf&&!fresh(a.i))continue;let x=cam.ox+(xx(a.i)+.5)*scale,y=cam.oy+(yy(a.i)+.5)*scale-12;c.fillStyle=PALETTE[a.f];c.strokeStyle=selection?.kind==='army'&&selection.id===a.id?'#fff2a7':'#f4d3a6';c.lineWidth=1.5;c.fillRect(x-13,y-8,26,16);c.strokeRect(x-13,y-8,26,16);c.fillStyle='#fff';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(strength(a),x,y+3)}
for(const e of s.discovery?.expeditions||[]){if(fog&&e.f!==pf)continue;const x=cam.ox+(xx(e.i)+.5)*scale,y=cam.oy+(yy(e.i)+.5)*scale;c.fillStyle='#f0d18b';c.strokeStyle='#3e5149';c.lineWidth=1.5;c.beginPath();c.moveTo(x,y-6);c.lineTo(x+5,y+5);c.lineTo(x-5,y+5);c.closePath();c.fill();c.stroke();}if(selection?.kind==='cell'){let i=selection.id,x=cam.ox+(xx(i)+.5)*scale,y=cam.oy+(yy(i)+.5)*scale;c.strokeStyle='#fff0a5';c.lineWidth=2;c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.stroke()}
c.save();c.textAlign='center';c.textBaseline='middle';const inset=cam.insets||{};for(const l of labelQueue.sort((a,b)=>b.priority-a.priority)){c.font=(l.priority>=4||l.realm?'600 ':'')+l.size+'px Georgia';const width=c.measureText(l.name).width+8,height=l.size+6;for(const dy of [0,18,-18,36,-36]){const x=l.x,y=l.y+dy;if(x-width/2<(inset.left||0)||x+width/2>w-(inset.right||0)||y-height/2<(inset.top||0)||y+height/2>h-(inset.bottom||0))continue;if(labelsOccupied.some(q=>Math.abs(q.x-x)<(q.width+width)/2&&Math.abs(q.y-y)<(q.height+height)/2))continue;reserve(x,y,width,height);c.lineWidth=3;c.strokeStyle=l.realm?'#eadcb9':'#323a2c';c.fillStyle=l.realm?'#463a2a':'#fff0ce';c.strokeText(l.name,x,y);c.fillText(l.name,x,y);break;}}c.restore();if(fog&&cam.zoom<4){const x=w-(inset.right||0)-32,y=h-(inset.bottom||0)-34;if(x>50&&y>100){c.save();c.translate(x,y);c.strokeStyle='#746548';c.fillStyle='#746548';c.lineWidth=1;c.beginPath();c.arc(0,0,17,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(0,-14);c.lineTo(-4,4);c.lineTo(0,1);c.lineTo(4,4);c.closePath();c.fill();c.font='10px Georgia';c.textAlign='center';c.fillText('N',0,-20);c.restore();}}this.metrics.map=performance.now()-started;}
 battle(b,cam,selected,quality){this.resize(quality);let c=this.ctx,w=this.width,h=this.height;this.fit(cam,true);cam.layout(w,h);if(this.lastBattle!==b){this.lastBattle=b;fieldSurface(this.terrain,b);this.terrainPixels=new Uint32Array(this.terrain.getContext('2d').getImageData(0,0,BW,BH).data.buffer);}
c.fillStyle='#273b31';c.fillRect(0,0,w,h);c.save();c.translate(cam.ox,cam.oy);c.scale(cam.s,cam.s);c.drawImage(this.terrain,0,0);
for(const g of b.units){if(!g.alive)continue;if(selected.includes(g.id)){c.strokeStyle='#ffeb9b';c.lineWidth=2/cam.s;c.setLineDash([5/cam.s,4/cam.s]);c.beginPath();c.ellipse(g.x,g.y,38,38,0,0,Math.PI*2);c.stroke();c.setLineDash([]);if(g.order!=='hold'&&g.order!=='defend'){const angle=Math.atan2(g.ty-g.y,g.tx-g.x),l=10/cam.s;c.beginPath();c.moveTo(g.x,g.y);c.lineTo(g.tx,g.ty);c.moveTo(g.tx-l*Math.cos(angle-.5),g.ty-l*Math.sin(angle-.5));c.lineTo(g.tx,g.ty);c.lineTo(g.tx-l*Math.cos(angle+.5),g.ty-l*Math.sin(angle+.5));c.stroke()}}}

// Single shared high-resolution sprite atlas; overview uses pre-rasterized
// miniature pixels, composed onto the opaque terrain once per simulation tick.
this.figures??=new Map();
const visible=b.soldiers.filter(p=>p.state!=='escaped'&&p.state!=='captured'&&!(p.hp<=0&&quality==='low')&&p.x*cam.s+cam.ox>=-30&&p.x*cam.s+cam.ox<=w+30&&p.y*cam.s+cam.oy>=-30&&p.y*cam.s+cam.oy<=h+30);
let detail=cam.s>=1.5&&quality!=='low'&&visible.length<900;const phase=Math.floor(b.time*7)%4;
if(!this.figureScratch){this.figureScratch=document.createElement('canvas');this.figureScratch.width=this.figureScratch.height=24;this.figureRead=this.figureScratch.getContext('2d',{willReadFrequently:true});}
const t0=performance.now();let builds=0,stamps=0;this.metrics.spriteBuild=0;this.metrics.spriteComposite=0;this.metrics.spriteUpload=0;this.metrics.spriteDraw=0;
this.overviewFigures??=new Map();
const poseOf=p=>p.hp<=0?'down':p.state==='shoot'?'shoot':p.hit>0?'hit':p.state==='block'?'block':p.state==='fight'?'fight':p.state==='move'||p.state==='flee'?'walk':'stand';
const overviewSprite=(p,g)=>{
 // Eight facing directions and two active phases are enough below the
 // individual-detail threshold. All stamps retain the actual type and faction.
 const face=((Math.round(p.angle/(Math.PI/4))+8)%8)*2,pose=poseOf(p),ph=pose==='walk'||pose==='fight'?(phase%2?1:3):0;
 const key=[p.type,g.f,face,pose,ph].join(':');let a=this.overviewFigures.get(key);if(a)return a;
 const started=performance.now(),q=this.figureRead;q.save();q.setTransform(1,0,0,1,0,0);q.clearRect(0,0,24,24);q.translate(12,12);figure(q,p,g,face,pose,ph);q.restore();
 const raw=q.getImageData(0,0,24,24).data,rows=[];for(let iy=0;iy<24;iy++){const row=[];for(let ix=0;ix<24;ix++){const i=(iy*24+ix)*4,A=raw[i+3];if(A<16)continue;row.push(ix,raw[i],raw[i+1],raw[i+2],A);}if(row.length)rows.push({dy:iy-12,pixels:new Uint8Array(row)});}
 a={rows};if(this.overviewFigures.size>=8192)this.overviewFigures.clear();this.overviewFigures.set(key,a);builds++;this.metrics.spriteBuild+=performance.now()-started;return a;
};
// Immutable individual textures: changing one animation frame must not
// invalidate a 2048px texture backing hundreds of other frames in WebKit.
const sprite=(p,g)=>{
 const face=(Math.round(p.angle/(Math.PI/8))+16)%16,pose=poseOf(p);
 const key=[p.type,g.f,face,pose,pose==='stand'||pose==='down'?0:phase].join(':');let a=this.figures.get(key);if(a)return a;
 if(builds>=6||(builds>0&&this.metrics.spriteBuild>=3))return null;
 const started=performance.now(),image=document.createElement('canvas');image.width=image.height=80;const q=image.getContext('2d');q.translate(40,40);q.scale(80/24,80/24);figure(q,p,g,face,pose,phase);
 if(this.figures.size>=1024)this.figures.delete(this.figures.keys().next().value);
 a={image};this.figures.set(key,a);builds++;this.metrics.spriteBuild+=performance.now()-started;return a;
};
this.detailPending=false;
let readySprites=[];
if(detail){for(const p of visible){const a=sprite(p,b.units[p.g]);if(!a){this.detailPending=true;detail=false;break;}readySprites.push([p,a]);}}
if(detail){const started=performance.now();for(const [p,a] of readySprites){c.drawImage(a.image,p.x-12,p.y-12,24,24);stamps++;}this.metrics.spriteDraw=performance.now()-started;}
else{
 if(!this.soldierLayer){this.soldierLayer=document.createElement('canvas');this.soldierLayer.width=BW;this.soldierLayer.height=BH;this.soldierContext=this.soldierLayer.getContext('2d',{alpha:false});this.soldierPixels=this.soldierContext.createImageData(BW,BH);}
 const key=b.time+'|'+quality;
 if(this.soldierBattle!==b||this.soldierKey!==key){this.soldierBattle=b;this.soldierKey=key;
 const pixels=new Uint32Array(this.soldierPixels.data.buffer);pixels.set(this.terrainPixels);
 const started=performance.now();for(const p of b.soldiers){if(p.state==='escaped'||p.state==='captured'||p.hp<=0&&quality==='low')continue;const a=overviewSprite(p,b.units[p.g]),x=Math.round(p.x)-12,y=Math.round(p.y);for(const row of a.rows){const yy=y+row.dy;if(yy<0||yy>=BH)continue;const offset=yy*BW+x,rr=row.pixels;for(let j=0;j<rr.length;j+=5){const xx=x+rr[j];if(xx<0||xx>=BW)continue;const i=offset+rr[j],alpha=rr[j+4],old=pixels[i];if(alpha>=250){pixels[i]=(0xff000000|(rr[j+3]<<16)|(rr[j+2]<<8)|rr[j+1])>>>0;}else{const inv=255-alpha,R=(rr[j+1]*alpha+(old&255)*inv+127)/255|0,G=(rr[j+2]*alpha+((old>>>8)&255)*inv+127)/255|0,B=(rr[j+3]*alpha+((old>>>16)&255)*inv+127)/255|0;pixels[i]=(0xff000000|(B<<16)|(G<<8)|R)>>>0;}}}stamps++;}
 this.metrics.spriteComposite=performance.now()-started-this.metrics.spriteBuild;const upload=performance.now();this.soldierContext.putImageData(this.soldierPixels,0,0);this.metrics.spriteUpload=performance.now()-upload;}
 const draw=performance.now();c.drawImage(this.soldierLayer,0,0);this.metrics.spriteDraw=performance.now()-draw;
}
this.metrics.spriteCount=stamps;this.metrics.spriteBuilds=builds;this.metrics.overviewCache=this.overviewFigures.size;this.metrics.spriteLOD=detail?'detail':this.detailPending?'warming':'overview';this.metrics.spriteTotal=performance.now()-t0;
// Commands remain visible above the opaque composite.
if(!detail)for(const g of b.units){if(!g.alive||!selected.includes(g.id))continue;c.strokeStyle='#ffeb9b';c.lineWidth=1.5/cam.s;c.setLineDash([5/cam.s,4/cam.s]);c.beginPath();c.ellipse(g.x,g.y,38,38,0,0,Math.PI*2);c.stroke();c.setLineDash([]);if(g.order!=='hold'&&g.order!=='defend'){c.beginPath();c.moveTo(g.x,g.y);c.lineTo(g.tx,g.ty);c.stroke();}}
if(b.previewLine){const [a,z]=b.previewLine;c.strokeStyle='#ffe6aa';c.lineWidth=2/cam.s;c.setLineDash([6/cam.s,4/cam.s]);c.beginPath();c.moveTo(...a);c.lineTo(...z);c.stroke();c.setLineDash([]);}c.lineWidth=.65;c.strokeStyle='#f4e0aa';c.beginPath();for(const p of b.projectiles||[]){c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.045,p.y-p.vy*.045);}c.stroke();
c.restore();for(const g of b.units){if(!g.alive)continue;let x=cam.ox+g.x*cam.s,y=cam.oy+g.y*cam.s-24*cam.s;if(x<-30||x>w+30||y<-30||y>h+30)continue;const chosen=selected.includes(g.id);c.strokeStyle='#40372a';c.lineWidth=1.5;c.beginPath();c.moveTo(x-7,y+10);c.lineTo(x-7,y-9);c.stroke();c.fillStyle=PALETTE[g.f];c.beginPath();c.moveTo(x-6,y-9);c.quadraticCurveTo(x+1,y-12,x+11,y-7);c.lineTo(x+7,y-1);c.quadraticCurveTo(x,y-4,x-6,y-2);c.closePath();c.fill();c.strokeStyle=chosen?'#fff0a5':'#d6c59a';c.lineWidth=chosen?1.5:.7;c.stroke();if(chosen||cam.s<.55){c.font='600 10px system-ui';c.textAlign='center';c.strokeStyle='#292b22';c.lineWidth=2.5;c.strokeText(g.alive,x,y+12);c.fillStyle='#f6e8c7';c.fillText(g.alive,x,y+12)}}
}
}

export function drawNavalScene(atlas,navalLab,navalSelected,quality){
 atlas.resize(quality);const c=atlas.ctx,w=atlas.width,h=atlas.height,cam=new Camera(1000,640);atlas.fit(cam,true);cam.layout(w,h);const scale=cam.s,ox=cam.ox,oy=cam.oy;
 c.fillStyle='#20373d';c.fillRect(0,0,w,h);c.save();c.translate(ox,oy);c.scale(scale,scale);c.beginPath();c.rect(0,0,1000,640);c.clip();const sea=c.createLinearGradient(0,0,1000,640);sea.addColorStop(0,'#547e83');sea.addColorStop(.5,'#365f69');sea.addColorStop(1,'#244851');c.fillStyle=sea;c.fillRect(0,0,1000,640);
 c.strokeStyle='#c9d7c43d';c.lineWidth=1;for(let i=0;i<360;i++){let x=(i*137)%1000,y=(i*73)%640;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+8,y-3,x+19,y);c.stroke();}
 for(const q of navalLab.ships){if(q.status!=='active')continue;const l=q.type>=6?32:q.type===3?27:22,beam=q.drive==='oar'?6:9,ink=q.side?'#a9443b':'#376b91';c.save();c.translate(q.x,q.y);c.rotate(q.heading);
 c.strokeStyle='#d6e6dc66';c.lineWidth=1.5;c.beginPath();c.moveTo(-l+3,-beam);c.quadraticCurveTo(-l-12,-beam-5,-l-30,-beam-8);c.moveTo(-l+3,beam);c.quadraticCurveTo(-l-12,beam+5,-l-30,beam+8);c.stroke();
 c.fillStyle='#302820';c.strokeStyle=navalSelected.includes(q.id)?'#fff1ad':'#ab956b';c.lineWidth=2;c.beginPath();c.moveTo(l,0);c.quadraticCurveTo(l*.55,-beam,-l*.75,-beam);c.lineTo(-l,-beam*.55);c.lineTo(-l,beam*.55);c.lineTo(-l*.75,beam);c.quadraticCurveTo(l*.55,beam,l,0);c.closePath();c.fill();c.stroke();c.fillStyle='#b58c5c';c.beginPath();c.ellipse(-3,0,l*.76,beam*.65,0,0,Math.PI*2);c.fill();c.strokeStyle='#69513a';c.lineWidth=.65;for(let k=-beam+3;k<beam-2;k+=2){c.beginPath();c.moveTo(-l*.65,k);c.lineTo(l*.55,k);c.stroke();}
 if(q.drive==='oar'){c.strokeStyle='#e1c398';c.lineWidth=1.3;for(let k=-l+5;k<l*.6;k+=5){c.beginPath();c.moveTo(k,-beam);c.lineTo(k-5,-beam-9);c.moveTo(k,beam);c.lineTo(k-5,beam+9);c.stroke();}}
 else{const m=q.type>=6?3:q.type>=4?2:1;for(let j=0;j<m;j++){const x=(j-(m-1)/2)*l*.67,span=beam*1.55*Math.max(.25,q.sail);c.fillStyle='#e7d7ac';c.beginPath();c.moveTo(x-5,-span);c.quadraticCurveTo(x+9,-span*.65,x+8,0);c.quadraticCurveTo(x+9,span*.65,x-5,span);c.closePath();c.fill();c.strokeStyle='#9e8664';c.stroke();c.strokeStyle='#5a4732';c.beginPath();c.moveTo(x-5,-span);c.lineTo(x-5,span);c.stroke();}}
 c.fillStyle=ink;c.fillRect(-l+2,-3,8,6);
 if(q.fire>0){for(let j=0;j<3;j++){let z=(navalLab.time*3+j*.37)%1;c.fillStyle='rgba(57,51,43,'+(.5*(1-z))+')';c.beginPath();c.arc(-8-z*16,-z*8,4+z*8,0,Math.PI*2);c.fill();}c.fillStyle='#e98b42';c.beginPath();c.arc(-7,0,3+q.fire*7,0,Math.PI*2);c.fill();}
 c.restore();if(navalSelected.includes(q.id)&&Number.isFinite(q.tx)&&Number.isFinite(q.ty)){c.strokeStyle='#efdb9c';c.lineWidth=1.5;c.setLineDash([5,4]);c.beginPath();c.moveTo(q.x,q.y);c.lineTo(q.tx,q.ty);c.stroke();c.setLineDash([]);}c.fillStyle='#172b2f';c.fillRect(q.x-20,q.y-23,40,4);c.fillStyle=q.hp<.35?'#c56a48':'#c1c996';c.fillRect(q.x-20,q.y-23,40*q.hp,4);}
 c.restore();return {scale,ox,oy};
}
