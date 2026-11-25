import {W,H,xx,yy,idx,clamp,hash,neighbors,charted,freshIntel,observedCities,observedOwner,PALETTE} from './world.mjs';
import {miniature,drawMiniature,resourceSheet} from './landscape-assets.mjs';
import {planLivingTown} from './living-town.mjs';
import {prepareLivingSurface,livingLand,livingRivers,riverAudit} from './landscape-surface.mjs';
import {prepareUrbanSurface,inspectDrainage} from './urban-surface.mjs';
import {prepareUrbanGround,drawUrbanGround,drawAgriculture,drawWaterfront} from './urban-fabric.mjs';
export {resourceSheet};
// Review renderer only. No writes to simulation state; all geometry is derived from a known-cell snapshot.
const lerp=(a,b,t)=>a+(b-a)*t, smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)}, mix=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
const rand=(x,y)=>{let n=Math.imul(x+853,374761393)^Math.imul(y+123,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
function noise(x,y,f){x*=f;y*=f;const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j);return lerp(lerp(rand(i,j),rand(i+1,j),u),lerp(rand(i,j+1),rand(i+1,j+1),u),v);}
function path(c,points,close=false){c.beginPath();c.moveTo(...points[0]);for(const q of points.slice(1))c.lineTo(...q);if(close)c.closePath();}
function fill(c,points,color){path(c,points,true);c.fillStyle=color;c.fill();}
function line(c,points,color,width){path(c,points);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
export function model(s){
 const fog=!!(s.discovery&&!s.discovery.fullMap&&!s.autonomous),pf=s.playerFaction??0,known=new Uint8Array(W*H),fresh=new Uint8Array(W*H),own=new Int16Array(W*H).fill(-1);
 for(let i=0;i<known.length;i++){if(!fog||charted(s,pf,i)){known[i]=1;fresh[i]=!fog||freshIntel(s,pf,i);own[i]=fog?observedOwner(s,pf,i):s.owner[i];}}
 const width=W,height=H,m=s.map,at=(x,y)=>x<0||y<0||x>=width||y>=height?-1:y*width+x;
 const sample=(x,y,k)=>{const u=x-.5,v=y-.5,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;let value=0,total=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const t=at(i+dx,j+dy);if(t<0||!known[t])continue;const wt=(dx?a:1-a)*(dy?b:1-b),z=k==='forest'?+(m.terrain[t]===2):k==='owner'?own[t]:m[k]?.[t]??.5;value+=wt*z;total+=wt;}return total?value/total:null;};
 const land=(x,y)=>{const i=at(Math.floor(x),Math.floor(y));if(i<0||!known[i])return null;const a=sample(x,y,'land');return a===null?null:clamp(a+(noise(x,y,2.4)-.5)*.13,0,1);};
 return {s,m,width,height,known,fresh,own,at,sample,land,cities:fog?observedCities(s,pf):s.cities,fog};
}
function elevation(m,x,y){const h=m.sample(x,y,'height');if(h===null)return 0;const ridge=smooth((h-.35)/.22),rough=(noise(x,y,1.15)-.5)*.012+(noise(x+92,y-37,3.7)-.5)*.005;return h+rough*ridge;}
const rgb=PALETTE.map(q=>[parseInt(q.slice(1,3),16),parseInt(q.slice(3,5),16),parseInt(q.slice(5,7),16)]);
function raster(c,m,x0,y0,x1,y1,res,style,political){
 const a=document.createElement('canvas');a.width=(x1-x0)*res;a.height=(y1-y0)*res;const q=a.getContext('2d'),im=q.createImageData(a.width,a.height),d=im.data,n=a.width*a.height;
 // Sample height once at every texel; normals use central differences on the same continuous field.
 const heights=new Float32Array(n),coverage=new Float32Array(n);for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const wx=x0+(x+.5)/res,wy=y0+(y+.5)/res,i=y*a.width+x;heights[i]=elevation(m,wx,wy);coverage[i]=m.land(wx,wy)??-1;}
 const get=(x,y)=>heights[clamp(y,0,a.height-1)*a.width+clamp(x,0,a.width-1)];
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=y*a.width+x,k=i*4,wx=x0+(x+.5)/res,wy=y0+(y+.5)/res,land=coverage[i],h=heights[i],fine=noise(wx,wy,12),grain=(rand(x+x0*res,y+y0*res)-.5)*4;let color=[222,211,181];if(land>=0){
 const wet=m.sample(wx,wy,'moisture')??.5,temp=m.sample(wx,wy,'temperature')??.5,fert=m.sample(wx,wy,'fert')??.5,forest=m.sample(wx,wy,'forest')??0;
 const dx=(get(x+1,y)-get(x-1,y))*res*.5,dy=(get(x,y+1)-get(x,y-1))*res*.5,ex=dx*15,ey=dy*15,norm=Math.hypot(ex,ey,1),light=(.48*ex+.55*ey+.68)/norm,shade=clamp((light-.68)*.85,-.47,.34),slope=Math.hypot(ex,ey);
 let ground=mix([173,165,112],[121,151,101],clamp(wet*.6+fert*.4,0,1));ground=mix(ground,[62,101,68],smooth(forest)*.68);
 ground=mix(ground,[147,131,105],smooth((h-.34)/.19));ground=mix(ground,[189,177,152],smooth((h-.48)/.16)*smooth(slope*.8));ground=mix(ground,[234,226,207],smooth((h-.63)/.12)*(.5+.5*(1-temp)));
 if(style==='engraved'){ground=mix(ground,[202,188,153],.48);const contour=Math.abs(h*29-Math.round(h*29));const hatch=Math.sin((wx+wy*.65)*37);if(contour<.045&&h>.29)ground=ground.map(v=>v*.74);if(shade<-.09&&h>.35&&hatch>.65)ground=ground.map(v=>v*.83);}
 ground=ground.map(v=>v*(1+shade)+(fine-.5)*8);const sea=mix([39,77,97],[99,148,150],smooth(land/.5)),wave=(noise(wx+21,wy*1.4,3)-.5)*9;
 color=mix(sea.map(v=>v+wave),ground,smooth((land-.43)/.14));const shore=1-smooth(Math.abs(land-.51)/.09);color=mix(color,[202,190,151],shore*.50);
 if(political&&land>.56){const cell=m.at(Math.floor(wx),Math.floor(wy)),f=m.own[cell];if(f>=0&&rgb[f])color=mix(color,rgb[f],.095);}
 }
 d[k]=color[0]+grain;d[k+1]=color[1]+grain;d[k+2]=color[2]+grain;d[k+3]=255;}
 q.putImageData(im,0,0);return a;
}
// One network geometry. Draw every bank first, then every channel, so tributary joins are seamless.
function rivers(m){const lines=[],incoming=new Map();for(let i=0;i<m.known.length;i++){if(!m.known[i]||!m.m.river[i])continue;const j=m.m.down[i];if(j<0||!m.known[j])continue;const p=incoming.get(j);if(p===undefined||m.m.flow[i]>m.m.flow[p])incoming.set(j,i);}
 const center=i=>[xx(i)+.5,yy(i)+.5];
 for(let i=0;i<m.known.length;i++){if(!m.known[i]||!m.m.river[i])continue;const j=m.m.down[i];if(j<0||!m.known[j])continue;const a=center(i),b=center(j),pre=incoming.get(i),post=m.m.down[j],p=pre===undefined?[2*a[0]-b[0],2*a[1]-b[1]]:center(pre),n=post>=0&&m.known[post]?center(post):[2*b[0]-a[0],2*b[1]-a[1]],u=[a[0]+(b[0]-p[0])*.16,a[1]+(b[1]-p[1])*.16],v=[b[0]-(n[0]-a[0])*.16,b[1]-(n[1]-a[1])*.16],points=[];
 const mouth=!m.m.land[j];for(let k=0;k<=24;k++){const t=k/24,z=1-t,x=z*z*z*a[0]+3*z*z*t*u[0]+3*z*t*t*v[0]+t*t*t*b[0],y=z*z*z*a[1]+3*z*z*t*u[1]+3*z*t*t*v[1]+t*t*t*b[1],l=m.land(x,y);if(l===null)break;if(l<.51){if(points.length){const p=points.at(-1);let lo=0,hi=1;for(let n=0;n<8;n++){const f=(lo+hi)/2;if((m.land(lerp(p[0],x,f),lerp(p[1],y,f))??0)>=.51)lo=f;else hi=f;}points.push([lerp(p[0],x,lo),lerp(p[1],y,lo)]);}break;}points.push([x,y]);}
 if(points.length>1)lines.push({i,j,points,width:clamp(Math.sqrt(m.m.flow?.[i]||60)*.004,.027,.15),mouth});}
 return lines;
}
function drawRivers(c,lines,scale,style){c.lineJoin='round';c.lineCap='round';for(const p of lines)line(c,p.points,style==='engraved'?'#9e9a76':'#697b58',p.width+.045);for(const p of lines)line(c,p.points,style==='engraved'?'#476c76':'#477f91',Math.max(.65/scale,p.width));}
function distanceToSegment(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
function tree(c,x,y,size,v){c.save();c.translate(x,y);c.scale(size,size);c.fillStyle='#243d2c45';c.beginPath();c.ellipse(.24,.11,.41,.18,.18,0,Math.PI*2);c.fill();line(c,[[0,.06],[0,-.47]],'#554b35',.075);
 if(v<2){for(let k=0;k<3;k++){const h=-.14-k*.21,w=.39-k*.072;fill(c,[[-w,h],[0,h-.57],[w,h],[.12,h+.1]],k===0?'#345c42':k===1?'#47754d':'#648957');fill(c,[[0,h-.57],[-w,h],[0,h+.06]],'#72955a');}}
 else{for(const [a,b,r] of [[-.2,-.38,.26],[.19,-.42,.29],[.03,-.67,.32],[0,-.27,.27]]){c.fillStyle='#375f40';c.beginPath();c.ellipse(a,b,r,r*.78,0,0,Math.PI*2);c.fill();c.fillStyle='#719653';c.beginPath();c.ellipse(a-.06,b-.09,r*.74,r*.55,0,0,Math.PI*2);c.fill();}}
 c.restore();}
function woodland(c,m,bounds,scale,style,towns){if(scale<9)return;const [x0,y0,x1,y1]=bounds,step=style==='engraved'?.48:.30;const trees=[];for(let j=Math.floor(y0/step);j<y1/step;j++)for(let i=Math.floor(x0/step);i<x1/step;i++){const r=rand(i,j),x=(i+.5+(r-.5)*.93)*step,y=(j+.5+(rand(j,i+8)-.5)*.93)*step,cell=m.at(Math.floor(x),Math.floor(y));if(cell<0||!m.known[cell]||m.m.terrain[cell]!==2||(m.land(x,y)??0)<.72||towns.some(t=>Math.hypot(t.x-x,t.y-y)<t.radius))continue;const patch=noise(x,y,.5),density=m.sample(x,y,'forest')??0;if(r>density*(.20+.65*patch))continue;trees.push([x,y,.16+rand(i+3,j-2)*.20,Math.floor(r*8)%4]);}trees.sort((a,b)=>a[1]-b[1]);for(const t of trees)tree(c,...t);}
// Ground plans use world coordinates; roof heights project upward on screen, with the same northwest light as terrain.
const dimensions={house:[.15,.17,.18],shop:[.19,.17,.16],warehouse:[.26,.19,.15],church:[.19,.34,.32],keep:[.31,.29,.38],tower:[.10,.10,.27],market:[.17,.15,.08]};
function architecture(c,b,style){
 const {x,y,type,angle=0,variant=0}=b,[w,d,h]=dimensions[type],cos=Math.cos(angle),sin=Math.sin(angle),P=(u,v,z=0)=>[x+u*cos-v*sin+z*.12,y+u*sin+v*cos-z*.58],stone=['keep','church','tower'].includes(type),front=stone?'#c9c1a8':'#e4d1ad',side=stone?'#908c78':'#a89472',roof=['#92583d','#b2764b','#76624d'][variant%3];
 const face=(p,color)=>fill(c,p.map(q=>P(...q)),color);
 face([[-w/2+.04,-d/2+.04,0],[w/2+.12,-d/2+.04,0],[w/2+.12,d/2+.11,0],[-w/2+.04,d/2+.11,0]],'#352e2340');
 face([[-w/2,d/2,0],[w/2,d/2,0],[w/2,d/2,h],[-w/2,d/2,h]],front);face([[w/2,-d/2,0],[w/2,d/2,0],[w/2,d/2,h],[w/2,-d/2,h]],side);
 face([[-w/2,-d/2,0],[w/2,-d/2,0],[w/2,-d/2,h],[-w/2,-d/2,h]],side);face([[-w/2,-d/2,0],[-w/2,d/2,0],[-w/2,d/2,h],[-w/2,-d/2,h]],front);
 if(type==='keep'||type==='tower'){face([[-w/2,-d/2,h],[w/2,-d/2,h],[w/2,d/2,h],[-w/2,d/2,h]],'#a79f87');for(let n=0;n<3;n++){const u=-w/2+n*w/3;face([[u,d/2,h],[u+w/6,d/2,h],[u+w/6,d/2,h+.035],[u,d/2,h+.035]],front);}}
 else{const z=h+w*.55;face([[-w*.55,-d*.55,h],[0,-d*.55,z],[0,d*.55,z],[-w*.55,d*.55,h]],roof);face([[0,-d*.55,z],[w*.55,-d*.55,h],[w*.55,d*.55,h],[0,d*.55,z]],'#714b37');face([[-w*.55,d*.55,h],[w*.55,d*.55,h],[0,d*.55,z]],front);line(c,[P(0,-d*.55,z),P(0,d*.55,z)],'#d1a16e',.009);if(style==='engraved')for(let n=1;n<4;n++)line(c,[P(-w*.5,-d/2+n*d/4,h),P(0,-d/2+n*d/4,z)],'#6e4f3b77',.004);}
 face([[-w*.12,d/2+.002,0],[w*.12,d/2+.002,0],[w*.12,d/2+.002,h*.34],[-w*.12,d/2+.002,h*.34]],'#4f493d');
 for(const u of [-.28,.28])face([[w*u-.012,d/2+.003,h*.58],[w*u+.012,d/2+.003,h*.58],[w*u+.012,d/2+.003,h*.77],[w*u-.012,d/2+.003,h*.77]],'#4c5149');
 if(type==='shop'){face([[w*.25,-d*.2,h],[w*.40,-d*.2,h],[w*.40,-d*.2,h+.14],[w*.25,-d*.2,h+.14]],'#9e8d77');}
 if(type==='church'){const z=h+.19;face([[-.055,d*.3,h],[.055,d*.3,h],[.055,d*.3,z],[-.055,d*.3,z]],front);face([[.055,d*.05,h],[.055,d*.3,h],[.055,d*.3,z],[.055,d*.05,z]],side);face([[-.066,d*.3,z],[.066,d*.3,z],[0,d*.18,z+.13]],'#6d746b');line(c,[P(0,d*.18,z+.13),P(0,d*.18,z+.18)],'#514c3e',.009);}
}
function layout(m,city,lines,style){
 const x=xx(city.i)+.5,y=yy(city.i)+.5,port=city.port||0,fort=city.fort||0,pop=city.pop||0,level=pop>4200?4:pop>1600?3:pop>900?2:1,industry=(city.build||[]).slice(2).reduce((a,b)=>a+b,0),radius=level===4?1.58:level===3?1.18:level===2?.86:.63;
 const nearby=lines.filter(l=>Math.hypot(xx(l.i)+.5-x,yy(l.i)+.5-y)<radius+3),buildings=[],roads=[],walls=[],piers=[],fields=[],variant=hash(city.name)%3,coast=neighbors(city.i).filter(i=>m.known[i]&&!m.m.land[i]),road=neighbors(city.i).filter(i=>m.fresh[i]&&m.s.road[i]&&m.m.land[i]);
 const angle=road.length?Math.atan2(yy(road[0])+.5-y,xx(road[0])+.5-x):variant*.43,cos=Math.cos(angle),sin=Math.sin(angle),world=(u,v)=>[x+u*cos-v*sin,y+u*sin+v*cos];
 const dry=(a,b,r=0)=>{const i=m.at(Math.floor(a),Math.floor(b));if(i<0||!m.known[i]||!m.m.land[i]||(m.land(a,b)??0)<.65)return false;return !nearby.some(l=>l.points.some((p,k)=>k>0&&distanceToSegment(a,b,l.points[k-1],p)<l.width/2+r+.035));};
 const allowed=(a,b,r)=>[[0,0],[-r,-r],[r,-r],[r,r],[-r,r]].every(([u,v])=>dry(a+u,b+v,.025))&&!buildings.some(z=>Math.hypot(a-z.x,b-z.y)<r+z.r+.025);
 const add=(type,u,v)=>{const [a,b]=world(u,v),d=dimensions[type],r=Math.hypot(d[0],d[1])*.52;if(!allowed(a,b,r))return false;buildings.push({x:a,y:b,r,type,angle,variant:(variant+buildings.length)%3});return true;};
 const roadOk=points=>points.every(([a,b])=>dry(a,b,.025));const addRoad=points=>{if(roadOk(points))roads.push(points);};
 // Civic nucleus first, then distinct street morphologies: radial lanes or orthogonal market blocks.
 const core=[];for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++)core.push([i*.15,j*.15]);core.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
 const place=(type,u,v)=>{for(const [du,dv] of core)if(add(type,u+du,v+dv))return true;return false;};
 if(city.capital||fort>=3){place('keep',-.34,-.32);place('church',.34,-.32);}
 else if(level>=3)place('church',-.24,-.2);
 if(level>=2)place('market',.32,.28);
 const spacing=style==='engraved'?.31:.27,slots=[];
 for(let row=-7;row<=7;row++)for(let col=-7;col<=7;col++){let u=col*spacing,v=row*spacing;if(Math.hypot(u,v)>radius||Math.abs(u)<.13||Math.abs(v)<.14)continue;if(style==='relief'){u+=(rand(col+variant,row)-.5)*.1;v+=(rand(row,col+8)-.5)*.10;if(Math.abs(u-v*.52)<.14&&level>=3)continue;}slots.push([u,v]);}
 slots.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));const target=[0,5,12,23,43][level];let workshops=0;for(const [u,v] of slots){if(buildings.length>=target)break;const type=industry>workshops&&u>0&&Math.abs(v)>.35?'shop':level>=3&&u<-.35&&Math.abs(v)<.8?'warehouse':'house';if(add(type,u,v)&&type==='shop')workshops++;}
 for(const axis of [0,1]){const points=[];for(let t=-radius;t<=radius;t+=.08)points.push(axis?world(0,t):world(t,0));let chain=[];for(const pt of points){if(dry(...pt,.02)){chain.push(pt);}else{if(chain.length>1)addRoad(chain);chain=[];}}if(chain.length>1)addRoad(chain);}
 // Defensive perimeter: a connected land-safe polygon around the civic core, not freestanding towers.
 if(fort>=2){for(const offset of [[0,0],[0,.45],[0,-.45],[.45,0],[-.45,0]]){if(walls.length)break;for(let r=radius+.11;r>=.48;r-=.15){const ring=[];for(let k=0;k<48;k++){const a=k*Math.PI*2/48,shape=style==='engraved'?Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a))):1;ring.push(world(offset[0]+Math.cos(a)*r/shape,offset[1]+Math.sin(a)*r/shape));}if(!ring.every(pt=>dry(...pt,.05))||buildings.some(z=>ring.some((p,k)=>distanceToSegment(z.x,z.y,p,ring[(k+1)%ring.length])<z.r+.06)))continue;walls.push(ring);break;}}}
 // Real shore, found by sampling from the city cell toward an actual water neighbour.
 if(port&&coast.length){for(const j of coast){const dx=xx(j)+.5-x,dy=yy(j)+.5-y;let shore=null;for(let t=0;t<=1;t+=.025)if((m.land(x+dx*t,y+dy*t)??1)<.52){shore=[x+dx*t,y+dy*t];break;}if(!shore)continue;const land=[shore[0]-dx*.13,shore[1]-dy*.13];if(!dry(...land,.02))continue;const end=[shore[0]+dx*.35,shore[1]+dy*.35];if((m.land(...end)??1)>.40)continue;piers.push({land,shore,end});const approach=[];for(let t=0;t<=1;t+=.05){const p=[lerp(x,land[0],t),lerp(y,land[1],t)];if(!dry(...p,.01)){approach.length=0;break;}approach.push(p);}if(approach.length>1)addRoad(approach);break;}}
 if(level<=2)for(const [u,v] of [[-.65,.55],[.65,.55],[-.65,-.45],[.65,-.45]]){const [a,b]=world(u,v);if(allowed(a,b,.22))fields.push({x:a,y:b,angle});}
 return {x,y,radius,city,buildings,roads,walls,piers,fields,valid:buildings.every(z=>dry(z.x,z.y,.025))&&buildings.every((a,i)=>buildings.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r))};
}
function town(c,t,style){for(const f of t.fields){c.save();c.translate(f.x,f.y);c.rotate(f.angle);c.fillStyle='#b6ad6b';c.fillRect(-.21,-.17,.42,.34);for(let k=-.17;k<.2;k+=.056)line(c,[[k,-.16],[k,.16]],'#777348',.018);c.restore();}
 for(const r of t.roads){line(c,r,'#847657',.085);line(c,r,'#c3b38d',.055);}
 for(const ring of t.walls){path(c,ring,true);c.lineWidth=.065;c.strokeStyle='#655e4d';c.stroke();c.lineWidth=.035;c.strokeStyle='#c7bea0';c.stroke();for(let k=0;k<ring.length;k+=12){const [x,y]=ring[k];architecture(c,{x,y,type:'tower',variant:0},style);}}
 for(const p of t.piers){line(c,[p.land,p.shore,p.end],'#6a543a',.13);line(c,[p.land,p.shore,p.end],'#bd9b66',.09);const dx=p.end[0]-p.land[0],dy=p.end[1]-p.land[1],n=Math.hypot(dx,dy);for(let k=0;k<=1;k+=.13){const x=lerp(p.land[0],p.end[0],k),y=lerp(p.land[1],p.end[1],k);line(c,[[x-dy/n*.055,y+dx/n*.055],[x+dy/n*.055,y-dx/n*.055]],'#765e43',.012);}}
 for(const b of [...t.buildings].sort((a,b)=>a.y-b.y))architecture(c,b,style);}
const states=new WeakMap();
const livingStates=new WeakMap(),urbanStates=new WeakMap();
function livingWoodland(c,m,bounds,scale,towns,urban=false){
 if(scale<11)return;const [x0,y0,x1,y1]=bounds,step=scale>45?.32:.48,points=[];
 for(let j=Math.floor(y0/step);j<y1/step;j++)for(let i=Math.floor(x0/step);i<x1/step;i++){const z=rand(i,j),x=(i+.5+(z-.5)*.92)*step,y=(j+.5+(rand(j,i+8)-.5)*.92)*step,cell=m.at(Math.floor(x),Math.floor(y));if(cell<0||!m.known[cell]||!m.m.land[cell]||m.m.terrain[cell]!==2||(m.land(x,y)??0)<.72||towns.some(t=>Math.hypot(t.x-x,t.y-y)<t.radius+.3))continue;
 const patch=noise(x,y,.64),density=m.sample(x,y,'forest')??0;if(z>density*(.25+.65*patch))continue;const kind=['pine','fir','oak','birch','bush'][Math.floor(rand(j,i+21)*5)],size=(urban?.38:.52)+rand(i+31,j-7)*(urban?.47:.62);points.push({x,y,kind,size,variant:Math.floor(z*3)});}
 points.sort((a,b)=>a.y-b.y);for(const t of points){const a=miniature(t.kind,t.variant);c.drawImage(a,t.x-96/290*t.size,t.y-156/290*t.size,192/290*t.size,224/290*t.size);}
}
function drawLivingTown(c,t,m,urban=false){
 if(urban)drawUrbanGround(c,t);else{
 for(const f of t.fields){c.save();c.translate(f.x,f.y);c.rotate(f.angle);fill(c,[[-.22,-.18],[.22,-.18],[.22,.18],[-.22,.18]],'#b5ab69');for(let k=-.16;k<.20;k+=.075){line(c,[[k,-.17],[k,.17]],'#82794d',.012);for(let j=-.12;j<=.12;j+=.10)drawMiniature(c,{type:'crop',x:k,y:j,variant:1});}c.restore();}
 for(const b of t.buildings){const a=b.r*.92;c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);c.fillStyle='#b8aa8580';c.fillRect(-a,-a,2*a,2*a);c.restore();}
 for(const row of t.roads){line(c,row,'#897d5f',.047);line(c,row,'#b8a782',.027);}}
 const props=[];
 for(const ring of t.walls){const k=ring.gate??0,points=Array.from({length:ring.length-3},(_,n)=>ring[(k+2+n)%ring.length]);line(c,points,'#554e3e55',.13);for(let n=1;n<points.length;n++){const a=points[n-1],b=points[n],A=[a[0]+.012,a[1]-.067],B=[b[0]+.012,b[1]-.067];fill(c,[a,b,B,A],'#90846a');line(c,[A,B],'#c7baa0',.042);if(n%2===0)line(c,[A,[A[0],A[1]-.019]],'#e0d2b3',.017);}
 for(const n of [k+9,k+18,k+27]){const p=ring[(n+ring.length)%ring.length];props.push({x:p[0],y:p[1],type:'tower',variant:0});}const p=ring[k],prev=ring[(k+ring.length-1)%ring.length],next=ring[(k+1)%ring.length];props.push({x:p[0],y:p[1],type:'gate',angle:Math.atan2(next[1]-prev[1],next[0]-prev[0]),variant:0});}
 if(urban)drawWaterfront(c,t,m);else for(const p of t.piers){line(c,[p.land,p.shore,p.end],'#594e3c',.12);line(c,[p.land,p.shore,p.end],'#b89b71',.082);const dx=p.end[0]-p.land[0],dy=p.end[1]-p.land[1],n=Math.hypot(dx,dy);for(let k=.1;k<1;k+=.11){const x=lerp(p.land[0],p.end[0],k),y=lerp(p.land[1],p.end[1],k);line(c,[[x-dy/n*.045,y+dx/n*.045],[x+dy/n*.045,y-dx/n*.045]],'#6d583f',.010);}}
 for(const b of [...t.buildings,...props].sort((a,b)=>a.y-b.y))drawMiniature(c,b);
}
function drawLivingReview(atlas,s,cam,mode,quality,urban=false){
 const states=urban?urbanStates:livingStates;
 const started=performance.now();atlas.resize(quality);atlas.fit(cam,false);cam.layout(atlas.width,atlas.height);const c=atlas.ctx,w=atlas.width,h=atlas.height,scale=cam.s,physical=mode==='geography';
 const stateKey=[s.day,s.playerFaction,s.autonomous,s.discovery?.fullMap,s.cities.length,s.news.length].join('|');let cache=states.get(s);if(!cache||cache.key!==stateKey){const m=model(s);m.land=(x,y)=>livingLand(m,x,y);cache={key:stateKey,m,network:livingRivers(m),audit:riverAudit(m),tiles:new Map(),jobs:new Map(),towns:new Map(),townJob:null};states.set(s,cache);}
 const {m,network}=cache,x0=clamp(Math.floor(-cam.ox/scale)-2,0,W-1),y0=clamp(Math.floor(-cam.oy/scale)-2,0,H-1),x1=clamp(Math.ceil((w-cam.ox)/scale)+2,x0+1,W),y1=clamp(Math.ceil((h-cam.oy)/scale)+2,y0+1,H),bounds=[x0,y0,x1,y1],res=clamp(Math.ceil(Math.min(scale,urban?20:14)),4,urban?20:14),key=[...bounds,res,!physical].join('|');
 let tile=cache.tiles.get(key);if(!tile&&!cache.jobs.has(key)){const job=(urban?prepareUrbanSurface(m,bounds,res,!physical,rgb,'massifs',network):prepareLivingSurface(m,bounds,res,!physical,rgb)).then(value=>{cache.tiles.set(key,value);if(cache.tiles.size>10)cache.tiles.delete(cache.tiles.keys().next().value);cache.jobs.delete(key);return value;},err=>{cache.jobs.delete(key);throw err;});cache.jobs.set(key,job);}
 atlas.reviewPending=cache.jobs.get(key)||null;
 c.fillStyle=m.fog?'#ded3b5':'#315a6b';c.fillRect(0,0,w,h);
 c.save();c.translate(cam.ox,cam.oy);c.scale(scale,scale);if(tile)c.drawImage(tile.canvas,x0,y0,x1-x0,y1-y0);
 if(!tile){c.restore();c.fillStyle='#e3d9c0';c.font='16px Georgia';c.textAlign='center';c.fillText('Preparing surveyed relief…',w/2,h/2);atlas.metrics.geography={pending:true,totalMs:performance.now()-started};return;}
 const t0=performance.now(),towns=[];
 if(!physical)for(const city of m.cities){const x=xx(city.i)+.5,y=yy(city.i)+.5;if(x<x0-4||x>x1+4||y<y0-4||y>y1+4||!m.known[city.i])continue;let t=cache.towns.get(city.id);if(!t){if(!cache.townJob){const job=planLivingTown(m,city,network,{fabric:urban}).then(async value=>{if(urban)value.ground=await prepareUrbanGround(m,value,network);cache.towns.set(city.id,value);cache.townJob=null;return value;}).catch(err=>{cache.townJob=null;throw err;});cache.townJob=job;}atlas.reviewPending=cache.townJob;continue;}towns.push(t);}
 const layoutMs=performance.now()-t0,assetStart=performance.now();livingWoodland(c,m,bounds,scale,towns,urban);const fields=urban&&!physical?drawAgriculture(c,m,bounds,towns,network,scale):0;
 const riversInView=network.filter(l=>l.points.some(p=>p[0]>=x0-1&&p[0]<=x1+1&&p[1]>=y0-1&&p[1]<=y1+1));
 c.lineJoin='round';c.lineCap='round';
 if(!physical){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=idx(x,y);if(!m.known[i]||!m.m.land[i])continue;for(const j of neighbors(i)){if(j<=i||!m.known[j]||!m.m.land[j])continue;const dx=xx(j)-x,dy=yy(j)-y;if(m.own[i]!==m.own[j]&&(m.own[i]>=0||m.own[j]>=0)){const ax=x+.5+dx*.5,ay=y+.5+dy*.5;line(c,[[ax-dy*.5,ay-dx*.5],[ax+dy*.5,ay+dx*.5]],'#66543d65',.7/scale);}
 if(m.fresh[i]&&m.fresh[j]&&s.road[i]&&s.road[j]){line(c,[[x+.5,y+.5],[xx(j)+.5,yy(j)+.5]],'#a58c60',.037);if(s.bridge?.[i]||s.bridge?.[j])line(c,[[x+.5,y+.5],[xx(j)+.5,yy(j)+.5]],'#e0ccb0',.022);}}}
 }
 const channel=r=>urban?clamp(.011+.021*Math.log2(Math.max(1,m.m.flow[r.i]/58)),.011,r.width):r.width;
 for(const r of riversInView)line(c,r.points,urban?'#899a72a0':'#748c75',channel(r)+(urban?.018:.018));for(const r of riversInView){for(let k=1;k<r.points.length;k++){const f=r.source?clamp(k/(r.points.length*.72),.22,1):1;line(c,[r.points[k-1],r.points[k]],urban?(m.m.flow[r.i]<100?'#547d7b':'#396d83'):'#3e7387',Math.max((urban?.27:.5)/scale,channel(r)*f));}}
 if(!physical){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=idx(x,y);if(!m.fresh[i]||!s.bridge?.[i])continue;const e=network.find(r=>r.i===i||r.j===i);if(!e)continue;const a=e.points[0],b=e.points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1,p=[x+.5,y+.5];line(c,[[p[0]-dy/n*.11,p[1]+dx/n*.11],[p[0]+dy/n*.11,p[1]-dx/n*.11]],'#d7c6a3',.055);}for(const t of towns){if(scale>=10)drawLivingTown(c,t,m,urban);else{c.fillStyle='#574a37';c.beginPath();c.arc(t.x,t.y,t.city.capital?.20:.12,0,Math.PI*2);c.fill();}}}
 c.restore();if(!physical){c.font='600 14px Georgia';c.textAlign='center';const used=[];for(const t of towns.sort((a,b)=>b.city.pop-a.city.pop)){const x=cam.ox+t.x*scale,y=cam.oy+(t.y+(scale>=10?t.radius+.25:.4))*scale,width=c.measureText(t.city.name).width+12;if(used.some(q=>Math.abs(q.x-x)<(q.width+width)/2&&Math.abs(q.y-y)<20))continue;used.push({x,y,width});c.strokeStyle='#e3d6b6';c.lineWidth=3;c.strokeText(t.city.name,x,y);c.fillStyle='#403426';c.fillText(t.city.name,x,y);}}
 atlas.metrics.geography={style:urban?'urban':'living',physical,fields,drainage:urban?inspectDrainage(m):undefined,rasterMs:tile.ms,rasterComputeMs:tile.compute,rasterMaxSlice:tile.maxSlice,layoutMs,layoutJobs:towns.map(t=>({name:t.city.name,ms:t.layoutMs,maxSlice:t.maxSlice,groundMs:t.ground?.ms,groundMaxSlice:t.ground?.maxSlice})),drawAssetsMs:performance.now()-assetStart,totalMs:performance.now()-started,audit:{...cache.audit,clipped:network.filter(r=>r.clipped).length},settlements:towns.map(t=>({id:t.city.id,name:t.city.name,pop:t.city.pop,fort:t.city.fort,port:t.city.port,buildings:t.buildings.length,walls:t.walls.length,piers:t.piers.length,valid:t.valid,complete:t.complete,missing:t.missing,types:[...new Set(t.buildings.map(b=>b.type))]}))};
}

export function drawGeographyReview(atlas,s,cam,mode,selection,quality,style){if(style==='living'||style==='urban'){drawLivingReview(atlas,s,cam,mode,quality,style==='urban');return;}atlas.reviewPending=null;
 const started=performance.now();atlas.resize(quality);atlas.fit(cam,false);cam.layout(atlas.width,atlas.height);const c=atlas.ctx,w=atlas.width,h=atlas.height,scale=cam.s,physical=mode==='geography';
 const stateKey=[s.day,s.playerFaction,s.autonomous,s.discovery?.fullMap,s.cities.length,s.news.length].join('|');let cache=states.get(s);if(!cache||cache.key!==stateKey){const m=model(s),network=rivers(m);cache={key:stateKey,m,network,tiles:new Map(),towns:new Map()};states.set(s,cache);}
 const {m,network}=cache,x0=clamp(Math.floor(-cam.ox/scale)-1,0,W-1),y0=clamp(Math.floor(-cam.oy/scale)-1,0,H-1),x1=clamp(Math.ceil((w-cam.ox)/scale)+1,x0+1,W),y1=clamp(Math.ceil((h-cam.oy)/scale)+1,y0+1,H),bounds=[x0,y0,x1,y1],res=clamp(Math.ceil(Math.min(scale,18)),3,18),key=[...bounds,res,style,!physical].join('|');
 const rasterStart=performance.now();let tile=cache.tiles.get(key);if(!tile){tile=raster(c,m,...bounds,res,style,!physical);if(cache.tiles.size>=6)cache.tiles.delete(cache.tiles.keys().next().value);cache.tiles.set(key,tile);}const rasterMs=performance.now()-rasterStart;
 c.fillStyle=m.fog?'#ded3b5':'#315a6b';c.fillRect(0,0,w,h);c.save();c.translate(cam.ox,cam.oy);c.scale(scale,scale);c.drawImage(tile,x0,y0,x1-x0,y1-y0);
 const townStart=performance.now(),towns=[];if(!physical)for(const city of m.cities){const x=xx(city.i)+.5,y=yy(city.i)+.5;if(x<x0-3||x>x1+3||y<y0-3||y>y1+3||!m.known[city.i])continue;const tk=[style,city.id,city.pop,city.port,city.fort,city.build?.join(',')].join('|');let t=cache.towns.get(tk);if(!t){t=layout(m,city,network,style);cache.towns.set(tk,t);}towns.push(t);}
 const layoutMs=performance.now()-townStart;woodland(c,m,bounds,scale,style,towns);
 drawRivers(c,network.filter(l=>xx(l.i)>=x0-2&&xx(l.i)<=x1+2&&yy(l.i)>=y0-2&&yy(l.i)<=y1+2),scale,style);
 if(!physical){c.lineCap='round';c.lineJoin='round';for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=idx(x,y);if(!m.known[i]||!m.m.land[i])continue;const f=m.own[i];for(const j of neighbors(i)){if(j<=i||!m.known[j]||!m.m.land[j])continue;if(f!==m.own[j]&&(f>=0||m.own[j]>=0)){const dx=xx(j)-x,dy=yy(j)-y,ax=x+.5+dx*.5,ay=y+.5+dy*.5;c.strokeStyle='#66543d91';c.lineWidth=.75/scale;c.beginPath();c.moveTo(ax-dy*.5,ay-dx*.5);c.quadraticCurveTo(ax+(rand(x,y)-.5)*.13,ay+(rand(y,x)-.5)*.13,ax+dy*.5,ay+dx*.5);c.stroke();}if(m.fresh[i]&&m.fresh[j]&&s.road[i]&&s.road[j]){line(c,[[x+.5,y+.5],[xx(j)+.5,yy(j)+.5]],'#937d55',.045);if(s.bridge?.[i]||s.bridge?.[j])line(c,[[x+.5,y+.5],[xx(j)+.5,yy(j)+.5]],'#d5c39a',.024);}}}
 for(const t of towns){if(scale>=10)town(c,t,style);else{c.fillStyle='#574a37';c.beginPath();c.arc(t.x,t.y,t.city.capital?.20:.12,0,Math.PI*2);c.fill();}}}
 c.restore();if(!physical){c.font='600 13px Georgia';c.textAlign='center';const used=[];for(const t of towns.sort((a,b)=>b.city.pop-a.city.pop)){const x=cam.ox+t.x*scale,y=cam.oy+(t.y+(scale>=10?t.radius+.25:.4))*scale,width=c.measureText(t.city.name).width+12;if(used.some(q=>Math.abs(q.x-x)<(q.width+width)/2&&Math.abs(q.y-y)<20))continue;used.push({x,y,width});c.strokeStyle='#e3d6b6';c.lineWidth=3;c.strokeText(t.city.name,x,y);c.fillStyle='#403426';c.fillText(t.city.name,x,y);}}
 atlas.metrics.geography={style,physical,rasterMs,layoutMs,totalMs:performance.now()-started,settlements:towns.map(t=>({name:t.city.name,buildings:t.buildings.length,walls:t.walls.length,piers:t.piers.length,valid:t.valid,types:[...new Set(t.buildings.map(b=>b.type))]}))};
}
