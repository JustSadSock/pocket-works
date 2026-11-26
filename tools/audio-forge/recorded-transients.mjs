// Short recorded attacks must not be treated as sustain samples.
export function prepareTransientNote(pcm,expectedMidi){
 const sr=48000;
 if(!(pcm instanceof Float32Array)||pcm.length<sr*.2||pcm.length>sr*12||!Number.isInteger(expectedMidi)||expectedMidi<36||expectedMidi>96)throw Error('Invalid transient source');
 let peak=0;for(const v of pcm){if(!Number.isFinite(v)||Math.abs(v)>1.1)throw Error('Invalid transient PCM');peak=Math.max(peak,Math.abs(v));}
 if(peak<.002)throw Error('Silent transient');
 let start=-1;
 for(let i=0;i<pcm.length-240;i+=240){let e=0;for(let j=i;j<i+240;j++)e+=pcm[j]**2;if(Math.sqrt(e/240)>peak*.045){start=Math.max(0,i-120);break;}}
 if(start<0)throw Error('No transient attack');
 const samples=pcm.slice(start),estimates=[];
 for(const sec of [.035,.075,.115]){
  const at=Math.round(sec*sr),n=480,maxLag=200,ds=4;
  if(at+(n+maxLag)*ds>=samples.length)continue;
  const data=new Float64Array(n+maxLag);
  for(let i=0;i<data.length;i++){const k=at+i*ds;data[i]=(samples[k]+samples[k+1]+samples[k+2]+samples[k+3])*.25;}
  const d=new Float64Array(maxLag+1);d[0]=1;let total=0;
  for(let lag=1;lag<=maxLag;lag++){let diff=0;for(let i=0;i<n;i++)diff+=(data[i]-data[i+lag])**2;total+=diff;d[lag]=total>1e-12?diff*lag/total:1;}
  let best=0;for(let lag=5;lag<maxLag;lag++)if(d[lag]<.25&&d[lag]<=d[lag-1]&&d[lag]<d[lag+1]){best=lag;break;}
  if(!best)continue;
  const [a,b,c]=[d[best-1],d[best],d[best+1]],den=a-2*b+c,delta=den>1e-12?Math.max(-.5,Math.min(.5,.5*(a-c)/den)):0;
  estimates.push(69+12*Math.log2(12000/(best+delta)/440));
 }
 if(!estimates.length)throw Error('Unable to measure transient pitch');
 estimates.sort((a,b)=>a-b);const measuredMidi=estimates[Math.floor(estimates.length/2)];
 if(Math.abs(measuredMidi-expectedMidi)>.75)throw Error('Recorded pitch disagrees with reviewed zone: expected '+expectedMidi+', measured '+measuredMidi.toFixed(3));
 const end=Math.min(samples.length,Math.round(.18*sr));let energy=0;
 for(let i=0;i<end;i++)energy+=samples[i]**2;
 const rms=Math.sqrt(energy/end);if(rms<.001)throw Error('Silent transient attack');
 return {samples,expectedMidi,measuredMidi,offsetFrames:start,rms,peak};
}
