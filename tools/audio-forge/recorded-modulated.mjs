// Independent multi-window measurement for bowed tremolo. Do not infer pitch
// from the expected label; require agreement across energetic windows.
export function prepareModulatedNote(pcm,expectedMidi){
 const sr=48000;
 if(!(pcm instanceof Float32Array)||pcm.length<sr*1.4||pcm.length>sr*15||!Number.isInteger(expectedMidi)||expectedMidi<36||expectedMidi>96)throw Error('Invalid modulated source');
 let peak=0;for(const x of pcm){if(!Number.isFinite(x)||Math.abs(x)>1.1)throw Error('Invalid modulated PCM');peak=Math.max(peak,Math.abs(x));}
 if(peak<.002)throw Error('Silent modulated source');
 let start=-1;
 for(let i=0;i+480<pcm.length;i+=480){let e=0;for(let j=i;j<i+480;j++)e+=pcm[j]**2;if(Math.sqrt(e/480)>peak*.045){start=Math.max(0,i-240);break;}}
 if(start<0)throw Error('No modulated attack');
 const samples=pcm.slice(start),estimates=[];
 const ds=4,n=960,maxLag=200;
 for(let sec=.12;sec<=2.4;sec+=.12){
  const at=Math.round(sec*sr);
  if(at+(n+maxLag)*ds>=samples.length)break;
  const a=new Float64Array(n+maxLag);let energy=0;
  for(let i=0;i<a.length;i++){const k=at+i*ds;a[i]=(samples[k]+samples[k+1]+samples[k+2]+samples[k+3])*.25;if(i<n)energy+=a[i]**2;}
  if(Math.sqrt(energy/n)<Math.max(.0003,peak*.035))continue;
  const d=new Float64Array(maxLag+1);d[0]=1;let total=0;
  for(let lag=1;lag<=maxLag;lag++){let v=0;for(let i=0;i<n;i++)v+=(a[i]-a[i+lag])**2;total+=v;d[lag]=total>1e-12?v*lag/total:1;}
  let best=0;
  for(let lag=5;lag<maxLag;lag++)if(d[lag]<.20&&d[lag]<=d[lag-1]&&d[lag]<d[lag+1]){best=lag;break;}
  if(!best)continue;
  const [l,c,r]=[d[best-1],d[best],d[best+1]],den=l-2*c+r,off=den>1e-12?Math.max(-.5,Math.min(.5,.5*(l-r)/den)):0;
  estimates.push(69+12*Math.log2(12000/(best+off)/440));
 }
 if(estimates.length<5)throw Error('Insufficient stable tremolo pitch windows');
 const sorted=[...estimates].sort((a,b)=>a-b);
 const measuredMidi=sorted[Math.floor(sorted.length/2)];
 const consensus=estimates.filter(v=>Math.abs(v-measuredMidi)<=.45).length/estimates.length;
 if(consensus<.7||Math.abs(measuredMidi-expectedMidi)>.75)throw Error('Recorded pitch disagrees with reviewed zone: expected '+expectedMidi+', measured '+measuredMidi.toFixed(3)+', consensus '+consensus.toFixed(3));
 let energy=0;const end=Math.min(samples.length,Math.round(sr*1.2));
 for(let i=0;i<end;i++)energy+=samples[i]**2;
 const rms=Math.sqrt(energy/end);if(rms<.001)throw Error('Silent modulated sustain');
 return {samples,expectedMidi,measuredMidi,offsetFrames:start,rms,peak,pitchWindows:estimates.length,pitchConsensus:consensus};
}
