// Original medieval forms; local coordinates and fixed ground anchors.
import {assetDimensions} from './landscape-assets.mjs';
export function historicalMesh(type,variant,profile='inland'){
 const [W,D,H]=assetDimensions[type],faces=[],v=variant%3,coastal=profile.includes('coastal'),rural=profile.includes('rural'),culture=profile.includes('culture1')?1:profile.includes('culture2')?2:0;
 const face=(p,mat,variation=0)=>faces.push({p,mat,variation});
 const box=(x,y,z,w,d,h,mat)=>{const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],e=[x,y+d,z],A=[x,y,z+h],B=[x+w,y,z+h],C=[x+w,y+d,z+h],E=[x,y+d,z+h];face([a,b,B,A],mat);face([b,c,C,B],mat);face([c,e,E,C],mat);face([e,a,A,E],mat);face([A,B,C,E],mat);};
 const roof=(x,y,z,w,d,h,mat,hip=false)=>{const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],e=[x,y+d,z],inset=hip?d*.24:0,u=[x+w*.5,y+inset,z+h],t=[x+w*.5,y+d-inset,z+h];face([a,u,t,e],mat,-.06);face([u,b,c,t],mat,.04);face([a,b,u],hip?mat:'plaster');face([e,t,c],hip?mat:'plaster');};
 const cyl=(x,y,z,r,h,mat,n=8)=>{for(let k=0;k<n;k++){const a=k*2*Math.PI/n,b=(k+1)*2*Math.PI/n,p=[x+r*Math.cos(a),y+r*Math.sin(a),z],q=[x+r*Math.cos(b),y+r*Math.sin(b),z];face([p,q,[q[0],q[1],z+h],[p[0],p[1],z+h]],mat);}face(Array.from({length:n},(_,i)=>[x+r*Math.cos(i*2*Math.PI/n),y+r*Math.sin(i*2*Math.PI/n),z+h]),mat);};
 const cone=(x,y,z,r,h,mat,n=8)=>{for(let k=0;k<n;k++){const a=k*2*Math.PI/n,b=(k+1)*2*Math.PI/n;face([[x+r*Math.cos(a),y+r*Math.sin(a),z],[x+r*Math.cos(b),y+r*Math.sin(b),z],[x,y,z+h]],mat);}};
 const opening=(x,y,z,w,h)=>{box(x,y,z,w,.002,h,'glass');box(x-.002,y+.001,z-.002,w+.004,.003,.003,'wood');};
 const hall=(x,y,w,d,h,{timber=false,jetty=false,stone=false,hip=false,roofMat='roof',shop=false}={})=>{
 const ground=h*(jetty?.48:1),mat=stone?'stone':timber?'plaster':rural?'wood':'plaster';box(x,y,0,w,d,ground,mat);box(x,y,0,w,d,.012,'stone');
 let X=x,Y=y,ww=w,dd=d;if(jetty){X-=w*.045;Y-=d*.025;ww+=w*.09;dd+=d*.065;box(X,Y,ground,ww,dd,h-ground,mat);box(X,Y,ground-.004,ww,dd,.007,'wood');}
 if(timber){for(const u of [0,.5,1])box(X+ww*u-.002,Y+dd,ground*.12,.004,.002,h-ground*.12,'wood');for(const t of [.45,.9])box(X,Y+dd,h*t,ww,.003,.004,'wood');face([[X,Y+dd+.003,h*.49],[X+.005,Y+dd+.003,h*.49],[X+ww*.5,Y+dd+.003,h*.90],[X+ww*.5-.005,Y+dd+.003,h*.90]],'wood');face([[X+ww*.5,Y+dd+.003,h*.49],[X+ww*.5+.005,Y+dd+.003,h*.49],[X+ww,Y+dd+.003,h*.90],[X+ww-.005,Y+dd+.003,h*.90]],'wood');}
 roof(X,Y,h,ww,dd,ww*(hip?.35:.68),roofMat,hip);
 if(shop){opening(x+w*.09,y+d+.002,.016,w*.42,h*.31);box(x+w*.08,y+d+.005,.012,w*.44,.012,.009,'wood');face([[x,y+d,h*.40],[x+w*.65,y+d,h*.40],[x+w*.65,y+d+.014,h*.30],[x,y+d+.014,h*.30]],'cloth');}else opening(x+w*.34,y+d+.002,0,w*.25,h*.39);
 for(const u of [.18,.60])opening(X+ww*u,Y+dd+.002,h*.61,ww*.16,h*.21);
 };
 if(['house','timber','shop','warehouse','barn'].includes(type)){const timber=type==='timber'||type==='shop'&&v!==1||culture===1&&type==='house',stone=type==='warehouse'||coastal&&v!==0||type==='house'&&(v===1||culture===2),shop=type==='shop',barn=type==='barn',wing=v===2||culture===1&&v===0||shop&&v===1||barn&&v===1,w=W*(wing?.60:.84),d=D*(wing?.86:.87),x=-W*.45,y=-D*.44,h=H*(barn?.54:shop?.65:coastal?.76:.70),roofMat=coastal&&v!==0?'slate':'roof';
 hall(x,y,w,d,h,{timber,jetty:!barn&&!stone&&(timber||v===0),stone,hip:v===1||culture===2,roofMat,shop});
 if(wing)hall(x+w,y+D*.06,W*.29,D*.48,h*.52,{timber:barn,stone,hip:true,roofMat});else if(!barn)box(x+w*.62,y+d*.20,h*.70,.018,.018,h*.65,'stone');
 if(barn){box(x+w*.20,y+d+.003,0,w*.60,.004,h*.72,'wood');box(x+w*.49,y+d+.006,.005,.005,.003,h*.68,'stone');}
 if(type==='warehouse'){box(x+w*.28,y+d+.003,.012,w*.43,.004,h*.55,'wood');box(x+w*.43,y+d+.004,h*.65,.008,.006,h*.32,'wood');}
 }else if(type==='market'){for(let k=0;k<3;k++){const x=-W*.43+k*W*.29,d=D*(k===1?.80:.57)*(v===1?.88:1);box(x,-d/2,0,W*.25,d,.019,'wood');for(const u of [0,1])for(const t of [0,1])box(x+u*W*.21,-d/2+t*d*.91,0,.005,.005,.063,'wood');roof(x,-d/2,.063,W*.25,d,.022+(v===2?.012:0),k===1?'cloth':'roof',v===1);}}
 else if(type==='chapel'||type==='church'){const w=W*.64,d=D*.70,x=-w/2,y=-D*.44,h=H*.40;box(x,y,0,w,d,h,'stone');roof(x,y,h,w,d,H*.20,'slate');cyl(0,y+d,0,W*.27,H*.29,'stone');cone(0,y+d,H*.29,W*.28,H*.15,'slate');const t=W*.32;box(-t/2,y,0,t,t,H*.82,'stone');if(v===1)roof(-t/2,y,H*.82,t,t,H*.21,'slate');else cone(0,y+t/2,H*.82,t*.66,H*.33,'slate');for(const z of [.27,.54])opening(-t*.16,y+t+.001,H*z,t*.32,H*.15);}
 else if(type==='keep'||type==='tower'){const w=W*.76,d=D*.76,h=H*.73;box(-w/2,-d/2,0,w,d,h,'stone');box(-w*.53,-d*.53,h,w*1.06,d*1.06,.018,'stone');for(const u of [-1,1])for(const t of [-1,1]){const x=u*w*.39,y=t*d*.39;box(x-.009,y-.009,h,.018,.018,.022,'stone');}if(type==='keep'){const rr=W*.14;for(const u of [-1,1]){cyl(u*W*.33,D*.28,0,rr,H*.86,'stone');if(v!==1)cone(u*W*.33,D*.28,H*.86,rr*1.05,H*(v===2?.15:.23),'slate');else box(u*W*.33-rr*.8,D*.28-rr*.8,H*.86,rr*1.6,rr*1.6,.015,'stone');}}else if(v===2)roof(-w/2,-d/2,h+.02,w,d,H*.19,'slate');opening(-w*.06,d/2+.001,h*.51,w*.12,h*.24);}
 else if(type==='gate'){const r=W*.20;for(const u of [-1,1]){cyl(u*W*.29,0,0,r,H*.86,'stone');if(v===1)box(u*W*.29-r*.82,-r*.82,H*.86,r*1.64,r*1.64,.015,'stone');else cone(u*W*.29,0,H*.86,r*1.07,H*(v===2?.16:.24),'slate');}box(-W*.23,-D*.33,H*.48,W*.46,D*.66,H*.28,'stone');roof(-W*.23,-D*.33,H*.76,W*.46,D*.66,H*.14,'slate');}
 return faces;
}
