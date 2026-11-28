"""Research-only music-free living soundscape; source rain/thunder plus contextual procedural foley."""
import hashlib,json,math,pathlib,subprocess,sys,time,resource,wave,zipfile,io
import numpy as np
from scipy.signal import butter,sosfilt
SR=48000; SEED=52118; SEC=72
RAIN_HASH='e081d22b28b7b757cbbab98098231ab8192030cc9c408efe094fd8401b88c8fb'
sha=lambda b:hashlib.sha256(b).hexdigest()
def reader(p):
 p=pathlib.Path(p);z=zipfile.ZipFile(p) if p.is_file() else None;return (z.read if z else lambda n:(p/n).read_bytes()),z
def decode(b,fmt):
 a=np.frombuffer(subprocess.check_output(['sox','-R','-t',fmt,'-','-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-'],input=b),'<f4').reshape(-1,2).copy();assert np.isfinite(a).all();return a
def readwav(b):
 with wave.open(io.BytesIO(b),'rb') as w:assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(SR,2,2);return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(np.float32)/32768
def filt(a,lo,hi):return sosfilt(butter(2,[lo,hi],btype='bandpass',fs=SR,output='sos'),a,axis=0).astype(np.float32)
def low(a,hi):return sosfilt(butter(2,hi,fs=SR,output='sos'),a,axis=0).astype(np.float32)
def norm(a):return a/max(float(np.max(abs(a))),1e-9)
def stereo(a):return np.column_stack((a,a)).astype(np.float32)
def taper(a,attack=.006,release=.08):
 n=len(a);k=min(n//2,round(attack*SR));j=min(n//2,round(release*SR));a[:k]*=np.linspace(0,1,k)[:,None];a[-j:]*=np.linspace(1,0,j)[:,None];return a
def quant(a):return np.rint(a*32767).astype(np.int32)
def save(p,a):
 if a.dtype.kind=='f':a=quant(a)
 assert np.max(abs(a))<32768
 with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(a.astype('<i2').tobytes())
 return dict(file=p.name,sha256=sha(p.read_bytes()),frames=len(a),peak=float(np.max(abs(a))/32768),rms=float(np.sqrt(np.mean((a.astype(np.float64)/32768)**2))))
def loop(a,fade):
 a=a.copy();f=round(fade*SR);u=np.linspace(0,1,f)[:,None];a[:f]=a[-f:]*(1-u)+a[:f]*u;return a[:-f]
def periodic(rng,n,lo,hi):
 # Independently generated stereo periodic spectrum, no phase-only widening.
 f=np.fft.rfftfreq(n,1/SR);s=np.fft.rfft(rng.normal(size=(n,2)),axis=0);s*=((f/(f+lo))**2/(1+(f/hi)**4))[:,None];a=np.fft.irfft(s,n,axis=0).astype(np.float32);return norm(a)
def tile(a,n):return np.tile(a,(math.ceil(n/len(a)),1))[:n].copy()
def render(field,old,foundation,out):
 t0=time.perf_counter();out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);(out/'variants').mkdir(exist_ok=True);(out/'originals').mkdir(exist_ok=True);(out/'layers').mkdir(exist_ok=True)
 rd,z=reader(old);oldb=rd('rain-at-the-gate-loop.wav');assert sha(oldb)==RAIN_HASH;(out/'originals/rain-at-the-gate-loop.wav').write_bytes(oldb);z and z.close()
 rd,z=reader(field);source=next(e for e in json.loads(rd('manifest.json'))['samples'] if e['id']=='stockholm-rain');b=rd(source['path']);assert sha(b)==source['sha256'] and source['license']=='public-domain' and source['redistribution'] is True;(out/'originals'/pathlib.Path(source['path']).name).write_bytes(b);rain=decode(b,'ogg');z and z.close();sources=[source]
 rd,z=reader(foundation);drums=[]
 for e in json.loads(rd('library/index.json'))['entries']:
  if e['instrument']=='bass-drum' and e['articulation']=='hit':
   b=rd('library/'+e['path']);assert sha(b)==e['sha256'] and e['license']=='CC0-1.0' and e['redistribution'] is True;(out/'originals'/pathlib.Path(e['path']).name).write_bytes(b);drums.append((e,decode(b,'wav').mean(axis=1)));sources.append(e)
 z and z.close();assert len(drums)>=3
 rng=np.random.default_rng(SEED);layers={}
 # Actual quiet rain segment and separate actual thunder segment are derived from the admitted recording.
 rainbed=loop(rain[round(8*SR):],1.2);layers['rain']=norm(rainbed)*.22
 layers['wind']=periodic(rng,20*SR,55,550)*.095;layers['leaves']=periodic(rng,12*SR,500,3700)*.038
 layers['hearth']=periodic(rng,12*SR,110,1600)*.035
 # Separate sparse roof/water and hearth transients, periodic placement in each loop.
 for key,duration,count,band in [('drips',16,24,(1100,5800)),('hearth',12,29,(450,5000))]:
  n=duration*SR;a=layers.get(key,np.zeros((n,2),np.float32));
  for j in range(count):
   k=int(rng.integers(0,n));length=round(rng.uniform(.025,.085)*SR);u=np.arange(length)/SR
   click=norm(filt(rng.normal(size=length),*band)*np.exp(-u/rng.uniform(.009,.035)))*rng.uniform(.015,.07);p=rng.uniform(.2,.8);a[(k+np.arange(length))%n]+=click[:,None]*np.sqrt([p,1-p])
  layers[key]=a
 layer_receipts=[]
 for key,a in layers.items():
  m=save(out/'layers'/f'{key}.wav',a);m.update(id=key,loop=True,seam=int(np.max(abs(quant(a[0])-quant(a[-1])))),derivativeP99=float(np.quantile(abs(np.diff(quant(a),axis=0)),.99)));assert m['seam']<=m['derivativeP99']+2;layer_receipts.append(m)
 thunder=taper(rain[round(2.4*SR):round(7.5*SR)].copy(),.3,.8);thunder=norm(low(thunder,450))*.25
 thunder_receipt=save(out/'layers/thunder.wav',thunder)
 contexts={'blade-glance':('blade','glancing-steel'),'blade-heavy':('blade','heavy-steel'),'shield-wood':('shield','wood'),'shield-metal':('shield','metal'),'step-earth':('footstep','earth'),'step-gravel':('footstep','gravel'),'step-wood':('footstep','wood'),'door':('door','wood')};manifest=[];buffers={}
 for key,(family,context) in contexts.items():
  for i in range(3):
   seed=int(rng.integers(0,2**31));q=np.random.default_rng(seed);dur=1.05 if key=='blade-heavy' else .72 if family in ('blade','shield','door') else .42;t=np.arange(round(dur*SR))/SR;n=q.normal(size=len(t));res=np.zeros_like(t);body=np.zeros_like(t);record=None
   if family=='blade':
    if key=='blade-glance':
     # Friction scrape with rising spectral centroid and short ringing contacts.
     attack=filt(n,1500,10500)*np.exp(-((t-.065)/.045)**2);freqs=[1450,2710,4200,6900];decays=[.07,.10,.055,.035];body=filt(n,900,4900)*np.exp(-t/.07)*.16
    else:
     attack=filt(n,850,8200)*np.exp(-t/.010);freqs=[560,890,1380,2140,3480];decays=[.20,.29,.24,.13,.08];body=filt(n,220,2100)*np.exp(-t/.085)*.30
    for f,d in zip(freqs,decays):res+=np.sin(2*np.pi*f*q.uniform(.94,1.06)*t+q.uniform(0,6.28))*np.exp(-t/d)*q.uniform(.05,.19)
    a=.42*attack+body+res
   elif family=='shield':
    attack=filt(n,650,6300)*np.exp(-t/.016)*.36;record,x=drums[i%len(drums)];body[:min(len(x),len(t))]=norm(x[:len(t)])[:len(t)]*.5;body*=np.exp(-t/.14)
    for f,d in zip([85,152,230,435] if key=='shield-wood' else [230,490,1050,2240],[.12,.095,.075,.045]):res+=np.sin(2*np.pi*f*q.uniform(.94,1.06)*t)*np.exp(-t/d)*.23
    a=attack+body+res
   elif family=='footstep':
    band={'step-earth':(55,520),'step-gravel':(120,3500),'step-wood':(90,850)}[key];a=filt(n,*band)*np.exp(-t/.066)*.8
    for delay in ([.035,.08,.125,.19] if key=='step-gravel' else [.055,.13]):
     k=round(delay*SR);a[k:]+=filt(q.normal(size=len(t)-k),350,4600 if key=='step-gravel' else 1700)*np.exp(-t[:len(t)-k]/.023)*q.uniform(.1,.35)
    if key=='step-wood':a+=np.sin(2*np.pi*q.uniform(115,170)*t)*np.exp(-t/.105)*.38
   else:
    a=filt(n,70,1000)*np.exp(-t/.18)*.35;f=110+70*np.sin(t*8);a+=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t/.18)*.21
   a=taper(stereo(norm(a)*(.56 if family in ('blade','shield') else .28 if family=='footstep' else .35)),.004,.065);name=f'{key}-{i+1:02}.wav';m=save(out/'variants'/name,a);m.update(family=family,context=context,key=key,seed=seed,recordedBody=record['sha256'] if record else None);manifest.append(m);buffers[name]=m
 # 72-second authored listener route; outside -> doorway -> interior -> window -> outside.
 N=SEC*SR;tt=np.arange(N)/SR;outside=np.interp(tt,[0,14,19,42,49,56,60,72],[1,1,.13,.13,.36,.13,1,1]);intensity=np.interp(tt,[0,9,19,35,54,67,72],[.72,1,.92,.65,.86,1,.78]);inside=1-outside
 env={};a=tile(layers['rain'],N);filtered=low(a,620);env['rain']=(a*outside[:,None]+filtered*(1-outside[:,None])*.58)*intensity[:,None]*1.8
 for key in ('wind','leaves'):
  a=tile(layers[key],N);env[key]=a*(outside[:,None]*.8+.04)*intensity[:,None]
 env['drips']=tile(layers['drips'],N)*(.3+.7*inside[:,None]);env['hearth']=tile(layers['hearth'],N)*inside[:,None]*.9
 env['thunder']=np.zeros((N,2),np.float32)
 for start,dist in [(7,18),(30,42),(65,26)]:
  k=round(start*SR);a=low(thunder,1600/(1+dist/10));env['thunder'][k:k+len(a)]+=a*(.9 if outside[k]>.5 else .35)
 timeline=[]
 for j,at in enumerate(np.arange(3,13,.67)):timeline.append((float(at),'step-gravel' if j<9 else 'step-earth',2.3,-.3 if j%2 else .3,2))
 timeline += [(15.5,'door',2,-.55,3),(19.1,'door',2,.3,3)]
 for j,at in enumerate(np.arange(20,27,.73)):timeline.append((float(at),'step-wood',2.5,(-1)**j*.26,2))
 for at,key,dist,pan in [(9.2,'blade-glance',20,-.7),(10.1,'shield-wood',19,-.7),(11.3,'blade-heavy',17,.5),(33.2,'blade-heavy',34,.6),(35.0,'shield-metal',34,.6),(62.1,'blade-glance',7,-.5),(62.7,'shield-metal',8,.4),(63.4,'blade-heavy',8,-.4),(64.3,'shield-wood',10,.6)]:timeline.append((at,key,dist,pan,2))
 for j,at in enumerate(np.arange(56,60,.67)):timeline.append((float(at),'step-wood',2.5,(-1)**j*.25,2))
 timeline += [(60,'door',2,.5,3)]
 for j,at in enumerate(np.arange(66,70,.73)):timeline.append((float(at),'step-earth',2.7,(-1)**j*.25,2))
 # Decode only on demand from WAV, bounded LRU. Rejected requests are checked before shuffle draw.
 cache={};bags={};last={};hits=misses=0;max_cache=0;active=[];events=[];drops=[];peakvoices=0;sfx=np.zeros((N,2),np.float32)
 for at,key,dist,pan,priority in sorted(timeline):
  start=round(at*SR);active=[x for x in active if x[0]>start]
  if len(active)>=6:drops.append(dict(time=at,key=key,reason='voice budget'));continue
  if not bags.get(key):
   bags[key]=list(rng.permutation(3));
   if bags[key][0]==last.get(key):bags[key][0],bags[key][1]=bags[key][1],bags[key][0]
  i=int(bags[key].pop(0));last[key]=i;name=f'{key}-{i+1:02}.wav'
  if name in cache:hits+=1;a=cache.pop(name)
  else:misses+=1;a=readwav((out/'variants'/name).read_bytes())
  cache[name]=a
  while len(cache)>8:cache.pop(next(iter(cache)))
  max_cache=max(max_cache,sum(x.nbytes for x in cache.values()))
  e=min(N,start+len(a));a=a[:e-start].mean(axis=1);occlusion=(1-outside[start]) if dist>10 else 0;gain=min(1,3/max(3,dist))*(1-.7*occlusion);a=low(a, max(450,12000/(1+dist/9)*(1-.8*occlusion)));stereo_a=a[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2])*gain*.62;sfx[start:e]+=stereo_a
  tail=.09 if outside[start]<.5 else .035;k=round(tail*SR);end=min(N,e+k);sfx[start+k:end]+=stereo_a[:end-start-k,::-1]*(.20 if outside[start]<.5 else .07);active.append((end,priority));peakvoices=max(peakvoices,len(active));events.append(dict(time=at,key=key,context=contexts[key][1],variant=name,sha256=buffers[name]['sha256'],distance=dist,occlusion=float(occlusion),priority=priority))
 env['foley']=sfx
 for a in env.values():a[:SR//4]*=np.linspace(0,1,SR//4)[:,None];a[-SR//2:]*=np.linspace(1,0,SR//2)[:,None]
 mix=sum(env.values());g=min(2,.88/max(float(np.max(abs(mix))),*(float(np.max(abs(a))) for a in env.values())));stems={k:quant(a*g) for k,a in env.items()};master=sum(stems.values());assert np.max(abs(master))<32768
 files=[save(out/'tavern-in-the-rain.wav',master)]+[save(out/f'scene-{k}.wav',a) for k,a in stems.items()];x=master.astype(np.float64)/32768;m=x.mean(axis=1)
 report=dict(approval='research-only',music=False,seconds=SEC,seed=SEED,approvedRainSha256=RAIN_HASH,sources=sources,layers=layer_receipts,thunder=thunder_receipt,variants=manifest,scene=files,events=events,dropped=drops,peakVoices=peakvoices,cacheHits=hits,cacheMisses=misses,maxCacheBytes=max_cache,listenerRoute=[0,14,19,42,49,56,60,72],pcmError=int(np.max(abs(master-sum(stems.values())))),lrCorrelation=float(np.corrcoef(x.T)[0,1]),monoLossDb=float(10*np.log10(np.mean(m*m)/np.mean(x*x))),wallSeconds=time.perf_counter()-t0,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,limitations='Rain/thunder actual recording; shield body recorded drum, not actual shield. Blade, steps, door, wind, leaves, hearth and drips procedural. No crowd speech; offline route is not browser capture.')
 (out/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('sources','layers','variants','scene','events','dropped')},indent=2))
if __name__=='__main__':render(*sys.argv[1:])
