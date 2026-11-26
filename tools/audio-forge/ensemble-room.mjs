// Offline stereo stage mixer with first-order image-source reflections and a
// four-line feedback delay network. Deliberately not binaural or measured IR.
const SR=48000,SPEED=343;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const presets={
 chamber:{width:12,length:18,height:5,rt60:1.05,reflection:.34,late:.13,damping:.30},
 hall:{width:20,length:32,height:10,rt60:1.85,reflection:.39,late:.18,damping:.24}
};
export const ensembleStage=Object.freeze({
 strings:Object.freeze({x:-3.2,y:5.3,z:1.25,gain:1,width:.72}),
 plucked:Object.freeze({x:3.4,y:5.8,z:1.15,gain:1,width:.55}),
 woodwind:Object.freeze({x:.8,y:8,z:1.5,gain:1,width:.45}),
 brass:Object.freeze({x:-.8,y:10,z:1.6,gain:1.08,width:.65}),
 percussion:Object.freeze({x:3.1,y:12,z:1.2,gain:1.1,width:.65})
});
const panWeights=p=>[Math.sqrt((1-p)/2),Math.sqrt((1+p)/2)];
function bounded(v,a,b,label){if(!Number.isFinite(v)||v<a||v>b)throw Error('Invalid '+label);return v}
function geometry(s,r){
 const listener=[0,2,1.3],direct=[s.x,s.y,s.z],distance=p=>Math.hypot(...p.map((v,i)=>v-listener[i]));
 const d=distance(direct);
 const images=[[-r.width-s.x,s.y,s.z],[r.width-s.x,s.y,s.z],[s.x,-s.y,s.z],[s.x,2*r.length-s.y,s.z],[s.x,s.y,-s.z],[s.x,s.y,2*r.height-s.z]];
 const pan=p=>clamp((p[0]-listener[0])/Math.max(1,distance(p))*1.65,-.9,.9);
 return {distance:d,pan:pan(direct),taps:images.map((p,i)=>{
  const length=distance(p);
  return {delay:Math.max(1,Math.round((length-d)/SPEED*SR)),pan:pan(p),gain:r.reflection*d/length*(i===4?.62:i===5?.78:1)};
 })};
}
export function renderEnsembleRoom({stems,stage=ensembleStage,preset='chamber',tailSeconds=2.5}={}){
 const r=presets[preset];if(!r||!stems||typeof stems!=='object')throw Error('Invalid ensemble room');
 bounded(tailSeconds,.25,5,'tail length');
 const entries=Object.entries(stems);if(!entries.length||entries.length>16)throw Error('Invalid stage size');
 const frames=entries[0][1]?.length/2;
 if(!Number.isInteger(frames)||frames<2||frames>SR*90)throw Error('Invalid stereo stem');
 const total=frames+Math.round(tailSeconds*SR),direct=new Float32Array(total*2),early=new Float32Array(total*2),send=new Float32Array(total),layout={};
 for(const [id,a] of entries){
  const s=stage[id];
  if(!(a instanceof Float32Array)||a.length!==frames*2||!s)throw Error('Invalid or unaligned stage stem '+id);
  bounded(s.x,-r.width/2+.2,r.width/2-.2,'stage x');bounded(s.y,2.5,r.length-.2,'stage y');bounded(s.z,.2,r.height-.2,'stage z');
  const gain=bounded(s.gain??1,0,2,'stage gain'),width=bounded(s.width??.65,0,1,'stage width');
  const g=geometry(s,r),[pl,pr]=panWeights(g.pan),attenuation=Math.min(1,4.5/g.distance)**.72*gain;
  const taps=g.taps.map(t=>({...t,w:panWeights(t.pan)}));
  layout[id]={distance:g.distance,pan:g.pan,directGain:attenuation,early:taps.map(({delay,pan,gain})=>({delayMs:delay/SR*1000,pan,gain}))};
  let low=0,sideLow=0;
  const alpha=1-Math.exp(-2*Math.PI*(11000/(1+.045*g.distance))/SR);
  for(let i=0;i<frames;i++){
   const l=a[i*2],rr=a[i*2+1];if(!Number.isFinite(l)||!Number.isFinite(rr)||Math.abs(l)>1||Math.abs(rr)>1)throw Error('Invalid stage PCM');
   const mid=(l+rr)*.5,side=(l-rr)*.5;
   low+=alpha*(mid-low);sideLow+=alpha*(side-sideLow);
   direct[i*2]+=(low*pl+sideLow*width*.7071)*attenuation;
   direct[i*2+1]+=(low*pr-sideLow*width*.7071)*attenuation;
   send[i]+=low*attenuation*.33;
   for(const t of taps){
    const j=i+t.delay;if(j>=total)continue;
    const v=low*attenuation*t.gain*.48;
    early[j*2]+=v*t.w[0];early[j*2+1]+=v*t.w[1];
   }
  }
 }
 // Orthogonal Hadamard feedback, individual RT60 gains, one-pole damping.
 const lengths=[1499,2137,2671,3253].map(n=>Math.round(n*(preset==='hall'?1.28:1)));
 const lines=lengths.map(n=>new Float32Array(n)),pos=[0,0,0,0],damped=[0,0,0,0],v=[0,0,0,0];
 const gains=lengths.map(n=>10**(-3*n/(SR*r.rt60))),wet=new Float32Array(total*2);
 let peak=0,wetEnergy=0;
 for(let i=0;i<total;i++){
  for(let j=0;j<4;j++){v[j]=lines[j][pos[j]];damped[j]+=(1-r.damping)*(v[j]-damped[j]);}
  const [a,b,c,d]=damped;
  const f0=(a+b+c+d)*.5,f1=(a-b+c-d)*.5,f2=(a+b-c-d)*.5,f3=(a-b-c+d)*.5;
  const x=send[i]*.5;
  lines[0][pos[0]]=x+gains[0]*f0;lines[1][pos[1]]=-x+gains[1]*f1;
  lines[2][pos[2]]=x+gains[2]*f2;lines[3][pos[3]]=-x+gains[3]*f3;
  for(let j=0;j<4;j++)pos[j]=(pos[j]+1)%lengths[j];
  const fade=Math.min(1,(total-1-i)/Math.min(2400,total-1));
  const l=(early[i*2]+(v[0]+v[1]-v[2]+v[3])*r.late*.5)*fade;
  const rr=(early[i*2+1]+(v[0]-v[1]+v[2]+v[3])*r.late*.5)*fade;
  wet[i*2]=l;wet[i*2+1]=rr;wetEnergy+=l*l+rr*rr;
  peak=Math.max(peak,Math.abs(direct[i*2]+l),Math.abs(direct[i*2+1]+rr),Math.abs(direct[i*2]),Math.abs(direct[i*2+1]),Math.abs(l),Math.abs(rr));
 }
 if(!Number.isFinite(peak)||peak<1e-8)throw Error('Silent or invalid room');
 const master=Math.min(1,.8/peak),mix=new Float32Array(total*2);
 for(let i=0;i<mix.length;i++){direct[i]*=master;wet[i]*=master;mix[i]=direct[i]+wet[i];}
 return {mix,direct,wet,sampleRate:SR,channels:2,frames:total,sourceFrames:frames,master,layout,preset,nominalRt60:r.rt60,wetRms:Math.sqrt(wetEnergy/(total*2))*master};
}
