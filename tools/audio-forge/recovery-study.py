"""Internal same-score backend comparison, no additional user audition required."""
import importlib.util,pathlib,zipfile,json,hashlib,subprocess,sys,wave,io,time
import numpy as np
from scipy.signal import welch
p=pathlib.Path(__file__).with_name('lanterns-of-home.py');s=importlib.util.spec_from_file_location('music',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
SR=m.SR
sha=lambda b:hashlib.sha256(b).hexdigest()
def rms(a):return float(np.sqrt(np.mean(a.astype(np.float64)**2)))
def read(b):
 with wave.open(io.BytesIO(b),'rb') as w:return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,w.getnchannels()).astype(np.float32)/32768,w.getframerate()
def source(p):
 p=pathlib.Path(p);z=zipfile.ZipFile(p) if p.is_file() else None;return (z.read if z else lambda n:(p/n).read_bytes()),z
def study(font,bank,out):
 start=time.perf_counter();out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);assert m.sha(font)==m.SFHASH
 # Keep the exact four-bar phrase and all other notes, only replace flute backend.
 events=[dict(e,beat=e['beat']-72,duration=min(e['duration'],84-e['beat'])) for e in m.score() if 72<=e['beat']<84];duration=12*m.BEAT+m.TAIL
 gm=m.synth_part(events,'flute',font,duration,True);accompaniment=sum(m.synth_part(events,p,font,duration,True) for p in m.PARTS if p!='flute');N=len(gm);rec=np.zeros_like(gm);rd,z=source(bank);idx=json.loads(rd('library/index.json'));metrics=json.loads(rd('metrics.json'));zones={e['id']:e for e in metrics['zones']};pool=[];used={}
 for e in idx['entries']:
  if e.get('recipe',{}).get('instrument')!='flute' or e.get('recipe',{}).get('articulation')!='non-vibrato':continue
  zone=zones[e['id']];b=rd('library/'+e['path']);assert sha(b)==e['sha256'] and e['license']=='CC0-1.0' and e['redistribution'] is True
  raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-'],input=b);a=np.frombuffer(raw,'<f4')[zone['offsetFrames']:];pool.append((e,zone,a,b))
 z and z.close();assert pool
 receipts=[]
 for e in events:
  if e['part']!='flute':continue
  entry,zone,x,b=min(pool,key=lambda a:abs(a[1]['measuredMidi']-e['midi']));delta=e['midi']-zone['measuredMidi'];assert abs(delta)<=5.1;rate=2**(delta/12);n=round(e['duration']*m.BEAT*SR);k=round(e['beat']*m.BEAT*SR);assert (n-1)*rate<len(x)-1
  y=np.interp(np.arange(n)*rate,np.arange(len(x)),x).astype(np.float32);env=np.minimum(1,np.minimum(np.arange(n)/(.045*SR),(n-1-np.arange(n))/(.08*SR)));y=y*env*e['velocity']/100;rec[k:k+n]+=y[:,None]*np.sqrt([.37,.63]);used[entry['sha256']]=entry;receipts.append(dict(event=e,source=entry['sha256'],rate=rate))
  (out/(entry['sha256']+'.wav')).write_bytes(b)
 # Same modest room on the alternate lead. Level-match lead and complete mix; no claim of perception.
 raw=subprocess.check_output(['sox','-R','-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-','-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-','reverb','-w','28','55','75','100','20','0'],input=rec.astype('<f4').tobytes());rec+=np.frombuffer(raw,'<f4').reshape(rec.shape)*.12
 rec*=rms(gm)/max(rms(rec),1e-9);hybrid=(gm+rec)*.5;hybrid*=rms(gm)/max(rms(hybrid),1e-9)
 mixes=[accompaniment+x for x in (gm,rec,hybrid)];target=min(rms(x) for x in mixes);g=min(1,.85/max(np.max(abs(x)) for x in mixes));stats=[]
 for name,x in zip(('soundfont','recorded-flute','hybrid-flute'),mixes):
  x=x*target/max(rms(x),1e-9)*g;pcm=np.rint(x*32767).astype(np.int32);recp=m.save(out/(name+'.wav'),pcm);recp.update(lr=float(np.corrcoef(x.T)[0,1]));stats.append(recp)
 (out/'comparison.json').write_text(json.dumps(dict(approval='research-only',scope='same score, same accompaniment; flute realization only, room implementations differ',events=events,recordedSources=list(used.values()),receipts=receipts,metrics=stats,realRecordedIntervals=0,recordedLegato='none',wallSeconds=time.perf_counter()-start),indent=2)+'\n');print(stats)
if __name__=='__main__':study(*sys.argv[1:])
