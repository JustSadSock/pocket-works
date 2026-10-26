// Browser-only, model-independent DSP laboratory. The Open-Unmix/SCNet
// estimates are cached; all optional corrections are prepared ONCE per scene.
// This is NOT the model library's internal multichannel EM Wiener algorithm.
const SIZE=1024, HOP=512, EPS=1e-10;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function fft(re,im,inverse=false){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;
  for(;j&bit;bit>>=1)j^=bit;
  j^=bit;
  if(i<j){let x=re[i];re[i]=re[j];re[j]=x;x=im[i];im[i]=im[j];im[j]=x}
 }
 for(let len=2;len<=n;len<<=1){
  const angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
  for(let i=0;i<n;i+=len){
   let cr=1,ci=0;
   for(let j=0;j<len/2;j++){
    const u=i+j,v=u+len/2,tr=cr*re[v]-ci*im[v],ti=cr*im[v]+ci*re[v];
    re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;
    const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;
   }
  }
 }
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n}
}
function checkAudio(base,vocals){
 if(!Array.isArray(base)||!base.length||base.length>2||
    !Array.isArray(vocals)||vocals.length!==base.length||
    base.some((a,i)=>!(a instanceof Float32Array)||!(vocals[i] instanceof Float32Array)||a.length!==vocals[i].length||!a.length))
  throw Error('Некорректные исходные или вокальные дорожки.');
}
function spectralCorrections(clean,vocals,progress=()=>{}){
 const frames=clean[0].length,channels=clean.length;
 const spectral=[],reconstruct=[];
 const window=Float64Array.from({length:SIZE},(_,i)=>Math.sin(Math.PI*(i+.5)/SIZE)**2);
 // 50%-overlapped Hann frames contribute exactly two squared windows at
 // every sample, including the edges covered by our initial negative frame.
 // A periodic 512-entry normalization table avoids a 90-second Float64
 // buffer (~63 MiB) on mobile devices.
 const norm=Float64Array.from({length:HOP},(_,i)=>
  window[i]*window[i]+window[i+HOP]*window[i+HOP]);
 for(let ch=0;ch<channels;ch++){
  const src=clean[ch],vocal=vocals[ch];
  const spec=new Float32Array(frames),soft=new Float32Array(frames);
  const rr=new Float64Array(SIZE),ri=new Float64Array(SIZE),vr=new Float64Array(SIZE),vi=new Float64Array(SIZE);
  const sr=new Float64Array(SIZE),si=new Float64Array(SIZE),wr=new Float64Array(SIZE),wi=new Float64Array(SIZE);
  let counter=0;
  for(let start=-SIZE/2;start<frames;start+=HOP){
   for(let j=0;j<SIZE;j++){
    const at=start+j,w=window[j];
    rr[j]=(at>=0&&at<frames?src[at]:0)*w;ri[j]=0;
    vr[j]=(at>=0&&at<frames?vocal[at]:0)*w;vi[j]=0;
   }
   fft(rr,ri);fft(vr,vi);
   for(let j=0;j<SIZE;j++){
    const a=rr[j]*rr[j]+ri[j]*ri[j],b=vr[j]*vr[j]+vi[j]*vi[j];
    const ratio=Math.sqrt(b)/(Math.sqrt(a)+Math.sqrt(b)+1e-5);
    // Additional conservative attenuation only where the estimated vocal
    // energy is comparatively strong in this time/frequency bin.
    const spectralGain=-0.32*clamp((ratio-0.19)/0.65);
    // Independently selectable soft power-ratio reconstruction. This is a
    // post-inference soft mask, not a change to the library Wiener iterations.
    const softGain=-0.22*b/(a+b+EPS);
    sr[j]=rr[j]*spectralGain;si[j]=ri[j]*spectralGain;
    wr[j]=rr[j]*softGain;wi[j]=ri[j]*softGain;
   }
   fft(sr,si,true);fft(wr,wi,true);
   for(let j=0;j<SIZE;j++){
    const at=start+j;if(at<0||at>=frames)continue;
    const scale=window[j]/Math.max(norm[at%HOP],1e-9);
    spec[at]+=sr[j]*scale;soft[at]+=wr[j]*scale;
   }
   if((++counter&127)===0)progress((ch+(start+SIZE/2)/frames)/channels);
  }
  spectral.push(spec);reconstruct.push(soft);
 }
 progress(1);
 return {spectral,reconstruct};
}
function adaptiveCenterCorrection(clean,vocals,rate=44100){
 const count=clean[0].length;
 const result=clean.map(()=>new Float32Array(count));
 if(clean.length!==2)return result;
 const alphaLo=1-Math.exp(-2*Math.PI*180/rate);
 const alphaHi=1-Math.exp(-2*Math.PI*4800/rate);
 const follow=1-Math.exp(-1/(.040*rate));
 const release=1-Math.exp(-1/(.105*rate));
 let low=0,band=0,m2=0,s2=0,v2=0,activity=0;
 for(let i=0;i<count;i++){
  const l=clean[0][i],r=clean[1][i],mid=(l+r)*.5,side=(l-r)*.5;
  const vm=(vocals[0][i]+vocals[1][i])*.5;
  low+=alphaLo*(mid-low);band+=alphaHi*(mid-low-band);
  m2+=follow*(mid*mid-m2);s2+=follow*(side*side-s2);v2+=follow*(vm*vm-v2);
  const relative=Math.sqrt(Math.max(0,v2))/(Math.sqrt(Math.max(0,m2+v2))+1e-6);
  const gate=clamp((relative-.18)*1.4)*clamp(Math.sqrt(Math.max(0,v2))/.014);
  activity+=(gate>activity?follow:release)*(gate-activity);
  const centerWeight=m2/(m2+1.7*s2+EPS);
  const delta=-.65*activity*centerWeight*band;
  result[0][i]=delta;result[1][i]=delta;
 }
 return result;
}
export function createEnhancementLayers(base,vocals,{rate=44100,progress=()=>{}}={}){
 checkAudio(base,vocals);
 if(!Number.isFinite(rate)||rate<8000)throw Error('Некорректная частота аудио.');
 const clean=base.map((c,i)=>Float32Array.from(c,(x,j)=>x-vocals[i][j]));
 const {spectral,reconstruct}=spectralCorrections(clean,vocals,progress);
 const center=adaptiveCenterCorrection(clean,vocals,rate);
 return {spectral,reconstruct,center};
}
export function renderEnhancedPCM(base,vocals,layers,{
 strength=1,spectral=false,reconstruct=false,center=false,centerAmount=35,
 artifact=true,texture=true,artifactAmount=85,textureAmount=45
}={}){
 checkAudio(base,vocals);
 if(!Number.isFinite(strength)||strength<0||strength>1.5||
    !Number.isFinite(centerAmount)||centerAmount<0||centerAmount>100||
    !Number.isFinite(artifactAmount)||artifactAmount<0||artifactAmount>100||
    !Number.isFinite(textureAmount)||textureAmount<0||textureAmount>100)
  throw Error('Недопустимая интенсивность очистки.');
 for(const key of ['spectral','reconstruct','center','artifact','texture']){
  if(!Array.isArray(layers?.[key])||layers[key].length!==base.length||
   layers[key].some((a,i)=>!(a instanceof Float32Array)||a.length!==base[i].length))
   throw Error('Дополнительная обработка не подготовлена: '+key);
 }
 return base.map((src,ch)=>{
  const out=new Float32Array(src.length),v=vocals[ch],
    s=layers.spectral[ch],w=layers.reconstruct[ch],c=layers.center[ch],
    b=layers.artifact[ch],t=layers.texture[ch];
  const centerScale=center?strength*centerAmount/100:0;
  for(let i=0;i<src.length;i++)
   out[i]=src[i]-strength*v[i]+
    (spectral?strength*s[i]:0)+(reconstruct?strength*w[i]:0)+centerScale*c[i]+
    (artifact?Math.min(strength,1)*artifactAmount/100*b[i]:0)+
    (texture?Math.min(strength,1)*textureAmount/100*t[i]:0);
  return out;
 });
}
