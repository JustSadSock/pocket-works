"""Aggregate tactical soundscape. No per-soldier audio nodes or music."""
import pathlib,sys,zipfile,io,wave,hashlib,json,time,resource
import numpy as np
from scipy.signal import butter,sosfilt
SR=48000;SEC=76;SEED=41128
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(b):
 with wave.open(io.BytesIO(b),'rb') as w:assert (w.getframerate(),w.getsampwidth(),w.getnchannels())==(SR,2,2);return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(np.float32)/32768
def save(p,a):
 assert np.max(abs(a))<32768
 with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(a.astype('<i2').tobytes())
 return dict(file=p.name,sha256=sha(p.read_bytes()),peak=float(np.max(abs(a))/32768),frames=len(a))
def main(baseline,out):
 t0=time.perf_counter();out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);rng=np.random.default_rng(SEED);N=SEC*SR;t=np.arange(N)/SR
 with zipfile.ZipFile(baseline) as z:
  d=json.loads(z.read('soundscape/manifest.json'));bank={};sources=[]
  for e in d['variants']:
   if e['family'] not in ('blade','shield','footstep'):continue
   b=z.read('soundscape/variants/'+e['file']);assert sha(b)==e['sha256'];bank.setdefault(e['key'],[]).append(read(b).mean(axis=1));sources.append(e)
  windrec=next(e for e in d['layers'] if e['id']=='wind');b=z.read('soundscape/layers/'+windrec['file']);assert sha(b)==windrec['sha256'];wind=read(b);sources.append(windrec)
 zoom=np.interp(t,[0,13,23,38,51,62,76],[.10,.30,.95,1,.42,.12,.08]);battle=np.interp(t,[0,15,25,38,48,60,76],[.02,.10,.45,.96,1,.48,.08]);march=np.interp(t,[0,6,20,33,48,65,76],[.2,.8,1,.45,.12,.30,.08]);cam=np.interp(t,[0,22,37,52,76],[-.2,-.42,.25,.48,0]);stems={'nature':np.tile(wind,(5,1))[:N].copy()*.85};receipts=[]
 groups=[('left-infantry',-.66,1.05,.90),('centre-infantry',0,1.,1.),('right-infantry',.65,1.12,.75),('mounted-flank',.87,1.55,.63)]
 def periodic_noise(n,cutoff):
  f=np.fft.rfftfreq(n,1/SR);s=np.fft.rfft(rng.normal(size=n));s*=f/(f+70)/(1+(f/cutoff)**4);x=np.fft.irfft(s,n);return (x/max(np.max(abs(x)),1e-9)).astype(np.float32)
 for gi,(name,pos,speed,strength) in enumerate(groups):
  detail=np.zeros(N,np.float32);beds=np.zeros(N,np.float32);phase=gi*.31;cache={};bags={};last={};draws=0
  def take(key):
   nonlocal draws
   if not bags.get(key):
    bags[key]=list(rng.permutation(len(bank[key])));
    if bags[key][0]==last.get(key):bags[key][0],bags[key][1]=bags[key][1],bags[key][0]
   i=int(bags[key].pop(0));last[key]=i;draws+=1;return i,bank[key][i]
  def add(at,key,amp):
   i,a=take(key);k=round(at*SR);n=min(len(a),N-k)
   if n>0:detail[k:k+n]+=a[:n]*amp;receipts.append(dict(group=name,time=at,key=key,variant=i,amplitude=amp))
  at=phase
  while at<SEC-.5:
   k=round(at*SR);a=float(march[k]);b=float(battle[k]);gain=.19*a*strength
   if a>.16:
    if name=='mounted-flank':
     for off in (0,.10,.25,.36):
      if at+off<SEC-.5:add(at+off,'step-earth',gain*.72)
    else:
     for off in (0,.07,.15):
      if at+off<SEC-.5:add(at+off,'step-earth' if gi!=2 else 'step-gravel',gain*(.75 if off else 1))
   at+=max(.36,.72/speed+rng.uniform(-.07,.07))
  at=22+gi*3.5
  while at<65:
   k=round(at*SR);b=float(battle[k]);gain=.36*b*strength
   for off,key in [(0,'shield-wood' if gi%2==0 else 'shield-metal'),(.17,'blade-heavy'),(.38,'blade-glance')]:
    if at+off<SEC:add(at+off,key,gain*rng.uniform(.55,1.0))
   at+=max(.4,2.1-b*1.45+rng.uniform(-.22,.24))
  n=12*SR;noise=np.tile(periodic_noise(n,550),7)[:N];clash=np.tile(periodic_noise(n,1800),7)[:N];pulse=(.72+.28*np.sin(2*np.pi*t*1.6*speed+phase)**2)
  beds=(noise*float(strength)*march*pulse*.11+clash*battle*.13*strength).astype(np.float32)
  salience=np.clip(1-abs(pos-cam)*.65,.22,1);close=(zoom**.7)*salience;far=sosfilt(butter(2,850,fs=SR,output='sos'),detail).astype(np.float32)
  signal=detail*close+far*(1-close)*.28+beds*(.75-.35*zoom);pan=np.clip((pos-cam)*(.35+.5*zoom),-.9,.9);stems[name]=np.column_stack((signal*np.sqrt((1-pan)/2),signal*np.sqrt((1+pan)/2))).astype(np.float32)
 for a in stems.values():a[:SR]*=np.linspace(0,1,SR)[:,None];a[-2*SR:]*=np.linspace(1,0,2*SR)[:,None]
 mix=sum(stems.values());g=.83/max(np.max(abs(mix)),*(np.max(abs(a)) for a in stems.values()));pcm={k:np.rint(a*g*32767).astype(np.int32) for k,a in stems.items()};master=sum(pcm.values());files=[save(out/'battle-at-the-pass.wav',master)]+[save(out/(k+'.wav'),a) for k,a in pcm.items()];x=master.astype(np.float64)/32768;mono=x.mean(axis=1)
 report=dict(approval='research-only',music=False,seconds=SEC,seed=SEED,groups=[x[0] for x in groups],aggregateStems=len(stems),sourceReceipts=sources,originalSources=d['sources'],events=receipts,files=files,pcmError=0,lrCorrelation=float(np.corrcoef(x.T)[0,1]),monoLossDb=float(10*np.log10(np.mean(mono**2)/np.mean(x*x))),wallSeconds=time.perf_counter()-t0,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,limitations='Offline aggregate mix, not Web Audio capture; no real horses, crowd or spoken commands. Hooves approximate procedural foot impacts. Voices not per soldier. No actual online voice cap measured.')
 (out/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print({k:v for k,v in report.items() if k not in ('events','sourceReceipts','originalSources','files')},'events',len(receipts))
if __name__=='__main__':main(*sys.argv[1:])
