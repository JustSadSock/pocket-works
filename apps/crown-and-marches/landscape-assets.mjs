// Original medieval miniature meshes, orthographic projection, northwest light.
// Geometry is authored in local 3D coordinates and rasterized once per asset.
const C=(x,a,b)=>Math.max(a,Math.min(b,x)),R=(n)=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
export const assetTypes=['house','timber','shop','warehouse','market','chapel','church','cathedral','keep','tower','gate','barn','pine','fir','oak','birch','bush','crop'];
const size={house:[.15,.17,.18],timber:[.16,.18,.21],shop:[.19,.17,.16],warehouse:[.26,.19,.15],market:[.17,.15,.08],chapel:[.13,.20,.21],church:[.19,.34,.32],cathedral:[.28,.40,.39],keep:[.31,.29,.38],tower:[.10,.10,.27],gate:[.19,.09,.23],barn:[.22,.19,.14]};
export const assetDimensions=size;
const palettes={stone:[183,174,151],plaster:[222,207,174],wood:[99,75,48],roof:[139,75,46],slate:[85,94,94],glass:[48,56,51],leaf:[76,111,55],bark:[99,77,49],cloth:[191,159,99]};
const mul=(a,n)=>a.map(v=>C(Math.round(v*n),0,255)),color=a=>'rgb('+a.join(',')+')';
function mesh(type,v){
 const faces=[];const face=(p,mat,variation=0)=>faces.push({p,mat,variation});
 const box=(x,y,z,w,d,h,mat)=>{const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],e=[x,y+d,z],A=[x,y,z+h],B=[x+w,y,z+h],D=[x+w,y+d,z+h],E=[x,y+d,z+h];face([a,b,B,A],mat);face([b,c,D,B],mat);face([c,e,E,D],mat);face([e,a,A,E],mat);face([A,B,D,E],mat);};
 const roof=(x,y,z,w,d,h,mat)=>{const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],e=[x,y+d,z],u=[x+w/2,y,z+h],v=[x+w/2,y+d,z+h];face([a,u,v,e],mat);face([u,b,c,v],mat);face([a,b,u],'plaster');face([e,v,c],'plaster');
 // Each roof course is geometrically laid on the same slope, not a screen-space stripe.
 for(let k=1;k<7;k++){const t=k/7,zz=z+h*t+.0009,L=x+w*t/2,U=x+w-w*t/2;face([[L,y,zz],[L,y+d,zz],[L+.0018,y+d,zz+.0018],[L+.0018,y,zz+.0018]],mat,-.12);face([[U,y,zz],[U,y+d,zz],[U-.0018,y+d,zz+.0018],[U-.0018,y,zz+.0018]],mat,-.12);}};
 const cyl=(x,y,z,r,h,mat,n=10)=>{for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,p=[x+r*Math.cos(a),y+r*Math.sin(a),z],q=[x+r*Math.cos(b),y+r*Math.sin(b),z];face([p,q,[q[0],q[1],z+h],[p[0],p[1],z+h]],mat); }const top=Array.from({length:n},(_,i)=>[x+r*Math.cos(i*Math.PI*2/n),y+r*Math.sin(i*Math.PI*2/n),z+h]);face(top,mat);};
 const cone=(x,y,z,r,h,mat,n=12,phase=0)=>{for(let k=0;k<n;k++){const a=(k+phase)*Math.PI*2/n,b=(k+1+phase)*Math.PI*2/n;face([[x+r*Math.cos(a),y+r*Math.sin(a),z],[x+r*Math.cos(b),y+r*Math.sin(b),z],[x,y,z+h]],mat,(R(k+phase)-.5)*.13);}};
 const ellipsoid=(x,y,z,a,b,c,mat,seed)=>{const n=12,l=6,P=(j,k)=>{const t=Math.PI*j/l,u=2*Math.PI*k/n,f=.90+.19*R(seed+j*17+(k%n)*11);return [x+a*Math.sin(t)*Math.cos(u)*f,y+b*Math.sin(t)*Math.sin(u)*f,z+c*Math.cos(t)*f]};for(let j=0;j<l;j++)for(let k=0;k<n;k++)face([P(j,k),P(j+1,k),P(j+1,k+1),P(j,k+1)],mat,(R(seed+j*19+k)-.5)*.14);};
 const windows=(x,y,z,w,d,h,rows=1)=>{for(let r=0;r<rows;r++)for(let k=1;k<=Math.max(1,Math.floor(w/.045));k++){const n=Math.max(1,Math.floor(w/.045)),u=x+w*k/(n+1),zz=z+h*(r+1)/(rows+1);box(u-.008,y+d+.001,zz,.016,.003,.024,'glass');box(u-.010,y+d+.004,zz-.003,.020,.004,.004,'wood');}for(let k=1;k<=Math.max(1,Math.floor(d/.06));k++){const n=Math.max(1,Math.floor(d/.06)),u=y+d*k/(n+1);box(x+w+.001,u-.008,z+h*.55,.003,.016,.025,'glass');}};
 const home=(x,y,z,w,d,h,timber=false,mat='plaster',roofMat='roof')=>{box(x,y,z,w,d,h,mat);box(x-.003,y-.003,z,w+.006,d+.006,.018,'stone');roof(x-.006,y-.006,z+h,w+.012,d+.012,w*.55,roofMat);windows(x,y,z,w,d,h,h>.17?2:1);box(x+w*.43,y+d+.002,z,.025,.004,.049,'wood');
 if(timber){for(const u of [0,.5,1])box(x+w*u-.003,y+d+.004,z+.015,.006,.004,h-.016,'wood');for(const t of [.38,.75])box(x,y+d+.004,z+h*t,w,.004,.006,'wood');for(let i=0;i<2;i++){const a=x+w*i*.5,b=a+w*.5;face([[a,y+d+.005,z+h*.4],[a+.006,y+d+.005,z+h*.4],[b,y+d+.005,z+h*.75],[b-.006,y+d+.005,z+h*.75]],'wood');}}};
 const tower=(x,y,r,h,spire=false)=>{cyl(x,y,0,r,h,'stone',12);if(spire)cone(x,y,h,r*1.17,r*2.4,'slate',12);else{cyl(x,y,h-.012,r*1.10,.020,'stone',12);for(let k=0;k<8;k++){const a=k*Math.PI/4;box(x+r*.79*Math.cos(a)-.008,y+r*.79*Math.sin(a)-.008,h+.008,.016,.016,.022,'stone');}}};
 if(['pine','fir','oak','birch','bush','crop'].includes(type)){if(type==='crop'){for(let i=0;i<18;i++){const x=(R(i+v)-.5)*.17,y=(R(i+v+98)-.5)*.17,h=.025+R(i+99)*.06;cone(x,y,0,.009,h,'leaf',5,i);ellipsoid(x,y,h,.006,.006,.016,'cloth',i);}return faces;}
 const h=type==='bush'?.12:type==='fir'?.39:type==='pine'?.34:.29,rad=type==='bush'?.105:.085;cyl(0,0,0,type==='birch'?.010:.013,h*.82,type==='birch'?'plaster':'bark',7);
 if(type==='pine'||type==='fir'){for(let k=0;k<8;k++){const z=h*(.23+k*.081),r=rad*(1-k*.10);for(let j=0;j<7;j++){const a=(j+k*.38)*Math.PI*2/7;cone(Math.cos(a)*r*.43,Math.sin(a)*r*.43,z,r*.49,h*.20,'leaf',7,j+k);}}cone(0,0,h*.63,rad*.49,h*.42,'leaf',10,v);}
 else{for(let k=0;k<11;k++){const a=k*2.39996,r=rad*(.2+.60*R(k+v*31)),z=h*(.43+.48*R(k+v*17));ellipsoid(Math.cos(a)*r,Math.sin(a)*r,z,rad*.55,rad*.54,h*.23,'leaf',k+v*31);}}return faces;}
 const [w,d,h]=size[type]||size.house, x=-w/2,y=-d/2;
 if(type==='keep'){box(x,y,0,w,d,h*.72,'stone');windows(x,y,0,w,d,h*.72,2);for(const u of [-1,1])for(const t of [-1,1])tower(u*w*.44,t*d*.43,.045,h*(.88+.10*(u===t)),u===t);home(-w*.25,-d*.21,h*.72,w*.5,d*.42,h*.23,false,'stone','slate');}
 else if(type==='tower')tower(0,0,w*.49,h,v%2===1);
 else if(type==='gate'){tower(-w*.36,0,.038,h*.89);tower(w*.36,0,.038,h*.89);box(-w*.23,-d*.4,h*.48,w*.46,d*.8,h*.23,'stone');roof(-w*.27,-d*.48,h*.71,w*.54,d*.96,h*.14,'slate');}
 else if(['chapel','church','cathedral'].includes(type)){home(x,y,0,w,d,h*.52,false,'stone','slate');const tw=w*.38;box(-tw/2,d*.22,0,tw,tw,h*.91,'stone');windows(-tw/2,d*.22,0,tw,tw,h*.9,2);cone(0,d*.22+tw/2,h*.91,tw*.68,h*.35,'slate',8);if(type==='cathedral'){for(const u of [-1,1]){home(u*w*.36-w*.14,-d*.12,0,w*.28,d*.32,h*.41,false,'stone','slate');tower(u*w*.36,-d*.38,w*.13,h*.68,true);}}}
 else if(type==='shop'){home(x,y,0,w,d,h*.72,v%2===0,v%2?'stone':'plaster');box(x+w*.15,y+d*.18,h*.55,.026,.027,h*.75,'stone');box(x-w*.08,y+d*.55,0,w*.45,d*.18,.035,'wood');}
 else if(type==='market'){for(let k=0;k<3;k++){const xx=x+k*w/3;box(xx,y,0,w*.27,d,.025,'wood');for(const u of [0,1])for(const t of [0,1])box(xx+u*w*.23,y+t*d*.9,0,.006,.006,.065,'wood');roof(xx-.004,y-.004,.066,w*.30,d+.008,.021,k%2?'cloth':'roof');}}
 else if(type==='warehouse'||type==='barn'){home(x,y,0,w,d,h,type==='barn','wood','roof');box(-w*.14,y+d+.004,0,w*.28,.006,h*.54,'wood');}
 else home(x,y,0,w,d,h,type==='timber'||v%3===1,'plaster',v%3===2?'slate':'roof');
 return faces;
}
const cache=new Map();
export function miniature(type,variant=0,angle=0){
 const facing=Math.round(angle/(Math.PI/4)),key=[type,variant%3,facing].join(':');if(cache.has(key))return cache.get(key);
 const a=document.createElement('canvas');a.width=192;a.height=224;const c=a.getContext('2d'),S=290,ox=96,oy=156,ang=facing*Math.PI/4,co=Math.cos(ang),si=Math.sin(ang);
 const transform=p=>[p[0]*co-p[1]*si,p[0]*si+p[1]*co,p[2]],proj=p=>[ox+p[0]*S,oy+(p[1]-p[2]*.73)*S],light=[-.47,-.42,.77];
 const shadow=c.createRadialGradient(ox+5,oy+4,2,ox+5,oy+4,44);shadow.addColorStop(0,'#34312865');shadow.addColorStop(1,'#34312800');c.save();c.translate(ox,oy);c.scale(1,.54);c.translate(-ox,-oy);c.fillStyle=shadow;c.fillRect(ox-48,oy-48,100,100);c.restore();
 const fs=mesh(type,variant).map(f=>{const p=f.p.map(transform),u=p[1].map((v,i)=>v-p[0][i]),v=p[2].map((v,i)=>v-p[0][i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;const lit=C(.69+.43*(n[0]*light[0]+n[1]*light[1]+Math.abs(n[2])*light[2])/len,.48,1.17);return {p,depth:p.reduce((s,q)=>s+q[1]*.73+q[2],0)/p.length,shade:mul(palettes[f.mat],lit+(f.variation||0))};});
 fs.sort((a,b)=>a.depth-b.depth);for(const f of fs){c.beginPath();c.moveTo(...proj(f.p[0]));for(const p of f.p.slice(1))c.lineTo(...proj(p));c.closePath();c.fillStyle=color(f.shade);c.fill();c.strokeStyle=color(f.shade);c.lineWidth=.6;c.stroke();}
 if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,a);return a;
}
export function drawMiniature(c,b){const a=miniature(b.type,b.variant||0,b.angle||0);c.drawImage(a,b.x-96/290,b.y-156/290,192/290,224/290);}
export function resourceSheet(){const c=document.createElement('canvas');c.width=1440;c.height=1260;const q=c.getContext('2d');q.fillStyle='#e3d9c0';q.fillRect(0,0,c.width,c.height);q.fillStyle='#393a2c';q.font='36px Georgia';q.fillText('Living Landscapes · original mesh miniatures',42,58);q.font='16px Georgia';q.fillText('Orthographic projection · northwest light · 18 distinct asset classes',42,88);assetTypes.forEach((type,i)=>{const x=40+i%6*233,y=120+Math.floor(i/6)*360;q.fillStyle='#c7c5a4';q.fillRect(x,y,214,278);q.drawImage(miniature(type,i%3,Math.PI/4),x+5,y+28,204,238);q.fillStyle='#3b3a2e';q.font='20px Georgia';q.fillText(type,x,y+305);});return c;}
