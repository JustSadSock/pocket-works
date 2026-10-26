// Experimental browser-only artefact repair. No external models, no server.
// The layers are calculated once after ONNX; A/B merely changes mix gains.
// They are estimates, not a claim to recover audio missing from the mix.
const N=1024,H=512,EPS=1e-9;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function fft(re,im,inverse=false){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;while(j&bit){j^=bit;bit>>=1}j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
 for(let len=2;len<=n;len*=2){
  const angle=(inverse?2:-2)*Math.PI/len,cs=Math.cos(angle),sn=Math.sin(angle);
  for(let i=0;i<n;i+=len){let cr=1,ci=0;
   for(let j=0;j<len/2;j++){
    const x=i+j,y=x+len/2,tr=cr*re[y]-ci*im[y],ti=cr*im[y]+ci*re[y];
    re[y]=re[x]-tr;im[y]=im[x]-ti;re[x]+=tr;im[x]+=ti;
    const next=cr*cs-ci*sn;ci=cr*sn+ci*cs;cr=next;
   }
  }
 }
 if(inverse)for(let j=0;j<n;j++){re[j]/=n;im[j]/=n}
}
function check(clean,vocals){
 if(!Array.isArray(clean)||!clean.length||clean.length>2||
  !Array.isArray(vocals)||clean.length!==vocals.length||
  clean.some((x,i)=>!(x instanceof Float32Array)||!(vocals[i] instanceof Float32Array)||!x.length||x.length!==vocals[i].length))
  throw Error('Неправильные PCM-дорожки для устранения артефактов.');
}
// Frequency-selective repair of narrow, modulating tones when their frequency
// overlaps the vocal estimate. Unlike the legacy gain mask, this uses both
// local spectral prominence and temporal history; its smoother prevents
// hard-on/off musical noise and has a bounded maximum correction.
export function prepareBuzzLayer(clean,vocals,progress=()=>{}){
 check(clean,vocals);
 const length=clean[0].length,out=[],window=Float64Array.from({length:N},(_,j)=>Math.sin(Math.PI*(j+.5)/N)**2);
 const denom=Float64Array.from({length:H},(_,j)=>window[j]**2+window[j+H]**2);
 for(let ch=0;ch<clean.length;ch++){
  const result=new Float32Array(length),re=new Float64Array(N),im=new Float64Array(N),
   vr=new Float64Array(N),vi=new Float64Array(N),amp=new Float64Array(N),vAmp=new Float64Array(N),
   magHistory=new Float64Array(N),maskHistory=new Float64Array(N);
  let count=0;
  for(let pos=-H;pos<length;pos+=H){
   for(let j=0;j<N;j++){
    const at=pos+j,w=window[j];re[j]=(at>=0&&at<length?clean[ch][at]:0)*w;
    vr[j]=(at>=0&&at<length?vocals[ch][at]:0)*w;im[j]=0;vi[j]=0;
   }
   fft(re,im);fft(vr,vi);
   for(let j=0;j<N;j++){amp[j]=Math.hypot(re[j],im[j]);vAmp[j]=Math.hypot(vr[j],vi[j])}
   for(let j=0;j<N;j++){
    const a=amp[j],v=vAmp[j];
    const neighbour=(amp[Math.max(0,j-4)]+amp[Math.max(0,j-3)]+
      amp[Math.min(N-1,j+3)]+amp[Math.min(N-1,j+4)])*.25;
    const tonal=clamp((a/(neighbour+1e-5)-1.03)/.7);
    const flicker=Math.abs(a-magHistory[j])/(a+magHistory[j]+.005);
    magHistory[j]=.73*magHistory[j]+.27*a;
    const vocalEvidence=clamp((v/(v+a+1e-5)-.17)/.43);
    const target=clamp(.87*vocalEvidence*(.25+.75*tonal)*(.75+.45*flicker),0,.82);
    maskHistory[j]=.58*maskHistory[j]+.42*target;
    re[j]*=-maskHistory[j];im[j]*=-maskHistory[j];
   }
   fft(re,im,true);
   for(let j=0;j<N;j++){
    const at=pos+j;if(at>=0&&at<length)result[at]+=re[j]*window[j]/Math.max(denom[at%H],EPS);
   }
   if((++count&255)===0)progress((ch+(pos+H)/length)/clean.length);
  }
  out.push(result);
 }
 progress(1);
 return out;
}
// Overlap-add short local room-tone patches. A donor must contain detectable
// sound but substantially less estimated vocal energy than the recipient.
// No donor => exact zero correction. A limited wet mix protects transient FX.
export function prepareTextureLayer(clean,vocals,rate=44100){
 check(clean,vocals);
 if(!Number.isFinite(rate)||rate<8000)throw Error('Неправильная частота PCM.');
 const length=clean[0].length,channels=clean.length,size=4096,hop=2048,
  frameCount=Math.ceil((length+size/2)/hop);
 const out=clean.map(()=>new Float32Array(length)),vRms=new Float32Array(frameCount),
  cRms=new Float32Array(frameCount),starts=new Int32Array(frameCount);
 for(let frame=0;frame<frameCount;frame++){
  const start=frame*hop-size/2;starts[frame]=start;let v2=0,c2=0,used=0;
  for(let j=0;j<size;j+=8){
   const at=start+j;if(at<0||at>=length)continue;
   let v=0,c=0;for(let ch=0;ch<channels;ch++){v+=vocals[ch][at];c+=clean[ch][at]}
   v/=channels;c/=channels;v2+=v*v;c2+=c*c;used++;
  }
  vRms[frame]=Math.sqrt(v2/Math.max(1,used));
  cRms[frame]=Math.sqrt(c2/Math.max(1,used));
 }
 const window=Float32Array.from({length:size},(_,j)=>Math.sin(Math.PI*(j+.5)/size)**4);
 const norm=Float32Array.from({length:hop},(_,j)=>window[j]+window[j+hop]);
 const radius=Math.ceil(2*rate/hop);
 let donors=0;
 for(let frame=0;frame<frameCount;frame++){
  const voice=vRms[frame],cleanLevel=cRms[frame];
  const share=voice/(voice+cleanLevel+1e-6);
  const activity=clamp((share-.38)/.27)*clamp((cleanLevel-.006)/.023);
  if(voice<.010||activity<.04)continue;
  let chosen=-1,best=Infinity;
  for(let candidate=Math.max(0,frame-radius);candidate<=Math.min(frameCount-1,frame+radius);candidate++){
   if(candidate===frame||starts[candidate]<0||starts[candidate]+size>length)continue;
   const v=vRms[candidate],m=cRms[candidate];
   if(m<.004||v>Math.min(.009,voice*.43)||v/(v+m+1e-6)>.24)continue;
   const cost=Math.abs(Math.log((m+.004)/(cleanLevel+.004)))+
    v/(m+.004)*1.4+Math.abs(candidate-frame)/radius*.13;
   if(cost<best){best=cost;chosen=candidate}
  }
  if(chosen<0)continue;
  const gain=clamp(cleanLevel/(cRms[chosen]+1e-6),.65,1.5);
  const wet=.7*activity;donors++;
  for(let j=0;j<size;j++){
   const at=starts[frame]+j;if(at<0||at>=length)continue;
   const weight=window[j]/Math.max(norm[at%hop],1e-8)*wet;
   for(let ch=0;ch<channels;ch++)
    out[ch][at]+=weight*(clean[ch][starts[chosen]+j]*gain-clean[ch][at]);
  }
 }
 return {channels:out,coverage:donors/Math.max(1,frameCount),donors};
}
