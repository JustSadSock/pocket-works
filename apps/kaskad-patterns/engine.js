// Kaskad: three independent deterministic local-rule engines. No DOM or networking.
export const MODES = Object.freeze({
  sand: { label: 'Песок', size: 161 },
  ant: { label: 'Муравьи', size: 181 },
  reaction: { label: 'Реакции', size: 128 }
});
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function random(w) {let x=w.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;w.seed=x|0;return (x>>>0)/4294967296;}
function defaults(mode) {
  if(mode==='sand') return {feed:200,neighbors:4};
  if(mode==='ant') return {rule:'RL',ants:1};
  return {feed:0.0545,kill:0.062};
}
export function createWorld(mode='sand',seed=0x71b246a9) {
  if(!MODES[mode]) throw Error('Неизвестный мир');
  const n=MODES[mode].size,w={mode,n,seed:seed|0,ticks:0,params:defaults(mode),a:new Uint8Array(n*n),ants:[]};
  if(mode==='sand'){w.a=new Uint16Array(n*n); addSand(w,Math.floor(n/2),Math.floor(n/2),30000);}
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
export function addSand(w,x,y,amount=1000) {
  if(w.mode!=='sand')return;
  const n=w.n,dirs=w.params.neighbors===8?[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1]];
  const threshold=dirs.length, stack=[],start=y*n+x;
  if(x<0||y<0||x>=n||y>=n)return;
  w.a[start]+=amount; if(w.a[start]>=threshold)stack.push(start);
  let work=0;
  while(stack.length && work<2400000){
    const index=stack.pop(),v=w.a[index];if(v<threshold)continue;
    const cycles=Math.floor(v/threshold);
    w.a[index]=v%threshold;
    const px=index%n,py=(index/n)|0;
    for(const [dx,dy] of dirs){const xx=px+dx,yy=py+dy;if(xx<0||yy<0||xx>=n||yy>=n)continue;const k=yy*n+xx;w.a[k]+=cycles;if(w.a[k]>=threshold)stack.push(k);}
    work++;
  }
  w.ticks+=amount;
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
    for(let i=0;i<amount;i++)addSand(w,center,center,w.params.feed);
  }else if(w.mode==='ant'){
    for(let i=0;i<amount;i++)stepAnt(w);
  }else for(let i=0;i<amount;i++)stepReaction(w);
}
export function inject(w,x,y) {
  x=clamp(Math.round(x),0,w.n-1);y=clamp(Math.round(y),0,w.n-1);
  if(w.mode==='sand')addSand(w,x,y,Math.max(400,w.params.feed*18));
  if(w.mode==='ant'){if(w.ants.length<12){w.ants.push({x,y,d:Math.floor(random(w)*4)});w.params.ants=w.ants.length;}}
  if(w.mode==='reaction')seedReaction(w,x,y,6);
}
export function setRule(w,key,value) {
  if(w.mode==='sand'){
    if(key==='feed')w.params.feed=clamp(Math.round(Number(value)),10,800);
    if(key==='neighbors' && [4,8].includes(Number(value))){w.params.neighbors=Number(value);if(Number(value)===4)for(let i=0;i<w.a.length;i++)if(w.a[i]>=4){const x=i%w.n,y=(i/w.n)|0;const count=w.a[i];w.a[i]=0;addSand(w,x,y,count);}}
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
  else{setRule(copy,'feed',clamp(w.params.feed+.003,.012,.095));setRule(copy,'kill',clamp(w.params.kill-.0015,.035,.077));}
  return copy;
}
const bytesToB64 = bytes => {
  let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
};
const b64ToBytes = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function serialize(w) {
  const data=w.mode==='reaction'
    ? (()=>{const u=new Uint8Array(w.a.length*2);for(let i=0;i<w.a.length;i++){u[i]=Math.round(clamp(w.a[i],0,1)*255);u[i+w.a.length]=Math.round(clamp(w.b[i],0,1)*255);}return u;})()
    : Uint8Array.from(w.a, v=>clamp(v,0,255));
  return {v:1,mode:w.mode,seed:w.seed,ticks:w.ticks,params:{...w.params},ants:w.ants.map(a=>({...a})),cells:bytesToB64(data)};
}
export function deserialize(snapshot) {
  if(!snapshot||snapshot.v!==1||!MODES[snapshot.mode]||typeof snapshot.cells!=='string')throw Error('Несовместимое сохранение');
  const mode=snapshot.mode,n=MODES[mode].size,data=b64ToBytes(snapshot.cells);
  if(data.length!==n*n*(mode==='reaction'?2:1))throw Error('Повреждённый мир');
  const w={mode,n,seed:Number(snapshot.seed)|0,ticks:clamp(Number(snapshot.ticks)||0,0,1e12),params:defaults(mode),ants:[]};
  if(mode==='reaction'){
    w.a=new Float32Array(n*n);w.b=new Float32Array(n*n);w.na=new Float32Array(n*n);w.nb=new Float32Array(n*n);
    for(let i=0;i<n*n;i++){w.a[i]=data[i]/255;w.b[i]=data[i+n*n]/255;}
  }else w.a=mode==='sand'?Uint16Array.from(data):data;
  for(const [k,v] of Object.entries(snapshot.params||{}))setRule(w,k,v);
  if(mode==='ant'){w.ants=(Array.isArray(snapshot.ants)?snapshot.ants:[]).slice(0,12).filter(a=>Number.isInteger(a.x)&&Number.isInteger(a.y)&&a.x>=0&&a.x<n&&a.y>=0&&a.y<n&&Number.isInteger(a.d)&&a.d>=0&&a.d<4).map(a=>({...a}));if(!w.ants.length)w.ants.push({x:n>>1,y:n>>1,d:0});w.params.ants=w.ants.length;}
  return w;
}
export function cloneWorld(w){return deserialize(serialize(w));}
export function density(w) {
  if(w.mode==='reaction')return Math.round(w.b.reduce((s,v)=>s+v,0));
  let s=0;for(const v of w.a)s+=v;
  return s;
}
