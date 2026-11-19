// Kaskad: deterministic local-rule engines and the user-authored automata workshop.
import {studioParams,seedStudio,stepStudio,setStudioRule,paintStudio,mutateStudio} from './studio.js';
export const MODES = Object.freeze({
  sand: { label: 'Песок', size: 161 },
  ant: { label: 'Муравьи', size: 181 },
  reaction: { label: 'Реакции', size: 128 },
  studio: { label: 'Мастерская', size: 96 }
});
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function random(w) {let x=w.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;w.seed=x|0;return (x>>>0)/4294967296;}
function defaults(mode) {
  if(mode==='sand') return {feed:40,neighbors:4};
  if(mode==='ant') return {rule:'RL',ants:1};
  if(mode==='studio')return studioParams();
  return {feed:0.0545,kill:0.062};
}
export function createWorld(mode='sand',seed=0x71b246a9,preset='life') {
  if(!MODES[mode]) throw Error('Неизвестный мир');
  const n=MODES[mode].size,w={mode,n,seed:seed|0,ticks:0,params:defaults(mode),a:new Uint8Array(n*n),ants:[]};
  if(mode==='studio'){w.params=studioParams(preset);seedStudio(w,preset);}
  if(mode==='sand'){w.a=new Uint32Array(n*n); initSandQueue(w); addSand(w,Math.floor(n/2),Math.floor(n/2),1800); relaxSand(w,100000);}
  if(mode==='ant'){
    w.ants=[{x:Math.floor(n/2),y:Math.floor(n/2),d:0}];
    for(let i=0;i<5500;i++)stepAnt(w);
  }
  if(mode==='reaction'){
    w.a=new Float32Array(n*n).fill(1);w.b=new Float32Array(n*n);
    w.na=new Float32Array(n*n);w.nb=new Float32Array(n*n);
    for(let j=0;j<14;j++)seedReaction(w,Math.floor(n*(.18+random(w)*.64)),Math.floor(n*(.18+random(w)*.64)),3+Math.floor(random(w)*6));
    for(let i=0;i<100;i++)stepReaction(w);
  }
  return w;
}
const DIR4=[[-1,0],[1,0],[0,-1],[0,1]];
const DIR8=[...DIR4,[-1,-1],[-1,1],[1,-1],[1,1]];
function initSandQueue(w){
  w.queue=[];w.qHead=0;w.queued=new Uint8Array(w.n*w.n);
}
function enqueueSand(w,i){
  if(!w.queued[i]){w.queued[i]=1;w.queue.push(i);}
}
export function addSand(w,x,y,amount=1000) {
  if(w.mode!=='sand'||x<0||y<0||x>=w.n||y>=w.n)return;
  const index=y*w.n+x;
  w.a[index]+=amount;enqueueSand(w,index);
  w.ticks+=amount;
  relaxSand(w,1800);
}
export function relaxSand(w,budget=4500) {
  if(w.mode!=='sand')return 0;
  const n=w.n,dirs=w.params.neighbors===8?DIR8:DIR4,threshold=dirs.length;
  let count=0;
  while(w.qHead<w.queue.length && count<budget){
    const index=w.queue[w.qHead++];w.queued[index]=0;
    const v=w.a[index],times=Math.floor(v/threshold);
    if(times===0)continue;
    w.a[index]=v%threshold;
    const px=index%n,py=Math.floor(index/n);
    for(const [dx,dy] of dirs){
      const x=px+dx,y=py+dy;
      if(x<0||y<0||x>=n||y>=n)continue;
      const k=y*n+x;
      w.a[k]+=times;
      if(w.a[k]>=threshold)enqueueSand(w,k);
    }
    count++;
  }
  if(w.qHead>=w.queue.length){w.queue=[];w.qHead=0;}
  else if(w.qHead>8192){w.queue=w.queue.slice(w.qHead);w.qHead=0;}
  return count;
}
function stepAnt(w) {
  const n=w.n,r=w.params.rule;
  for(const ant of w.ants){
    let i=ant.y*n+ant.x,s=w.a[i]%r.length;
    ant.d=(ant.d+(r[s]==='R'?1:3))%4;
    w.a[i]=(s+1)%r.length;
    if(ant.d===0)ant.y=(ant.y+n-1)%n;
    else if(ant.d===1)ant.x=(ant.x+1)%n;
    else if(ant.d===2)ant.y=(ant.y+1)%n;
    else ant.x=(ant.x+n-1)%n;
  }
  w.ticks++;
}
export function seedReaction(w,x,y,r=6) {
  if(w.mode!=='reaction')return;
  const n=w.n;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(dx*dx+dy*dy>r*r)continue;
    const xx=(x+dx+n)%n,yy=(y+dy+n)%n,i=yy*n+xx;
    w.b[i]=.86;w.a[i]=.12;
  }
}
function stepReaction(w) {
  const n=w.n,a=w.a,b=w.b,na=w.na,nb=w.nb,F=w.params.feed,K=w.params.kill;
  for(let y=0;y<n;y++){
    const up=(y+n-1)%n,down=(y+1)%n;
    for(let x=0;x<n;x++){
      const l=(x+n-1)%n,r=(x+1)%n,i=y*n+x;
      const lapA= -a[i]+.2*(a[y*n+l]+a[y*n+r]+a[up*n+x]+a[down*n+x])+.05*(a[up*n+l]+a[up*n+r]+a[down*n+l]+a[down*n+r]);
      const lapB= -b[i]+.2*(b[y*n+l]+b[y*n+r]+b[up*n+x]+b[down*n+x])+.05*(b[up*n+l]+b[up*n+r]+b[down*n+l]+b[down*n+r]);
      const ab=a[i]*b[i]*b[i];
      na[i]=clamp(a[i]+.95*(1.0*lapA-ab+F*(1-a[i])),0,1);
      nb[i]=clamp(b[i]+.95*(.5*lapB+ab-(K+F)*b[i]),0,1);
    }
  }
  w.a=na;w.b=nb;w.na=a;w.nb=b;w.ticks++;
}
export function stepWorld(w,amount=1) {
  amount=clamp(Math.floor(amount),1,500);
  if(w.mode==='sand'){
    const center=Math.floor(w.n/2);
    addSand(w,center,center,amount*w.params.feed);
    relaxSand(w,4500);
  }else if(w.mode==='ant'){
    for(let i=0;i<amount;i++)stepAnt(w);
  }else if(w.mode==='studio')stepStudio(w,amount);
  else for(let i=0;i<amount;i++)stepReaction(w);
}
export function inject(w,x,y) {
  x=clamp(Math.round(x),0,w.n-1);y=clamp(Math.round(y),0,w.n-1);
  if(w.mode==='sand')addSand(w,x,y,Math.max(220,w.params.feed*8));
  if(w.mode==='ant'){if(w.ants.length<12){w.ants.push({x,y,d:Math.floor(random(w)*4)});w.params.ants=w.ants.length;}}
  if(w.mode==='reaction')seedReaction(w,x,y,6);
  if(w.mode==='studio')paintStudio(w,x,y,w.params.family==='spread'?2:1,2);
}
export function setRule(w,key,value) {
  if(w.mode==='studio')return setStudioRule(w,key,value);
  if(w.mode==='sand'){
    if(key==='feed')w.params.feed=clamp(Math.round(Number(value)),10,800);
    if(key==='neighbors' && [4,8].includes(Number(value))){
      w.params.neighbors=Number(value);
      const threshold=w.params.neighbors;
      for(let i=0;i<w.a.length;i++)if(w.a[i]>=threshold)enqueueSand(w,i);
      relaxSand(w,4500);
    }
  }
  if(w.mode==='ant'){
    if(key==='rule'&&/^[RL]{2,8}$/.test(String(value))){w.params.rule=value;for(let i=0;i<w.a.length;i++)w.a[i]%=value.length;}
    if(key==='ants'){const count=clamp(Math.round(Number(value)),1,12);while(w.ants.length<count)w.ants.push({x:Math.floor(random(w)*w.n),y:Math.floor(random(w)*w.n),d:Math.floor(random(w)*4)});w.ants.length=count;w.params.ants=count;}
  }
  if(w.mode==='reaction'){
    if(key==='feed')w.params.feed=clamp(Number(value),.012,.095);
    if(key==='kill')w.params.kill=clamp(Number(value),.035,.077);
  }
}
export function mutate(w) {
  const copy=cloneWorld(w);
  if(w.mode==='sand')setRule(copy,'feed',Math.round(w.params.feed*(w.params.feed<400?1.7:.63)));
  else if(w.mode==='ant'){const r=w.params.rule;setRule(copy,'rule',r.length<4?'RLLR':r.split('').map((c,i)=>i===0?(c==='R'?'L':'R'):c).join(''));}
  else if(w.mode==='studio')mutateStudio(copy);
  else{setRule(copy,'feed',clamp(w.params.feed+.003,.012,.095));setRule(copy,'kill',clamp(w.params.kill-.0015,.035,.077));}
  return copy;
}
const bytesToB64 = bytes => {
  let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
};
const b64ToBytes = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function serialize(w) {
  let bytes;
  if(w.mode==='reaction'){
    bytes=new Uint8Array(w.a.byteLength+w.b.byteLength);
    bytes.set(new Uint8Array(w.a.buffer,w.a.byteOffset,w.a.byteLength));
    bytes.set(new Uint8Array(w.b.buffer,w.b.byteOffset,w.b.byteLength),w.a.byteLength);
  }else bytes=new Uint8Array(w.a.buffer,w.a.byteOffset,w.a.byteLength).slice();
  return {v:2,mode:w.mode,seed:w.seed,ticks:w.ticks,params:{...w.params},ants:w.ants.map(a=>({...a})),cells:bytesToB64(bytes),...(w.mode==='sand'?{pending:w.queue.slice(w.qHead)}:{})};
}
export function deserialize(snapshot) {
  if(!snapshot||snapshot.v!==2||!MODES[snapshot.mode]||typeof snapshot.cells!=='string')throw Error('Несовместимое сохранение');
  const mode=snapshot.mode,n=MODES[mode].size,data=b64ToBytes(snapshot.cells),length=n*n;
  if(data.length!==length*(mode==='reaction'?8:mode==='sand'?4:1))throw Error('Повреждённый мир');
  const w={mode,n,seed:Number(snapshot.seed)|0,ticks:clamp(Number(snapshot.ticks)||0,0,1e12),params:defaults(mode),ants:[]};
  if(mode==='reaction'){
    w.a=new Float32Array(data.buffer.slice(0,length*4));
    w.b=new Float32Array(data.buffer.slice(length*4,length*8));
    w.na=new Float32Array(length);w.nb=new Float32Array(length);
  }else w.a=mode==='sand'?new Uint32Array(data.buffer.slice(0)):data;
  if(mode==='sand')initSandQueue(w);
  if(mode==='studio')w.next=new Uint8Array(length);
  for(const [k,v] of Object.entries(snapshot.params||{})){
    if(mode==='sand' && k==='neighbors' && [4,8].includes(Number(v))){w.params.neighbors=Number(v);continue;}
    setRule(w,k,v);
  }
  if(mode==='sand'){
    if(Array.isArray(snapshot.pending))for(const i of snapshot.pending){if(Number.isInteger(i)&&i>=0&&i<length)enqueueSand(w,i);}
    for(let i=0;i<length;i++)if(w.a[i]>=w.params.neighbors)enqueueSand(w,i);
  }
  if(mode==='ant'){w.ants=(Array.isArray(snapshot.ants)?snapshot.ants:[]).slice(0,12).filter(a=>Number.isInteger(a.x)&&Number.isInteger(a.y)&&a.x>=0&&a.x<n&&a.y>=0&&a.y<n&&Number.isInteger(a.d)&&a.d>=0&&a.d<4).map(a=>({...a}));if(!w.ants.length)w.ants.push({x:n>>1,y:n>>1,d:0});w.params.ants=w.ants.length;}
  w.seed=Number(snapshot.seed)|0;
  return w;
}
export function cloneWorld(w){return deserialize(serialize(w));}
export function density(w) {
  if(w.mode==='reaction')return Math.round(w.b.reduce((s,v)=>s+v,0));
  let s=0;for(const v of w.a)s+=v;
  return s;
}
