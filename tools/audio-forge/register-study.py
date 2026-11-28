"""Measure pitch/velocity independently for accepted cue's candidate lead programs."""
import importlib.util,pathlib,sys,json,zipfile,io,wave,hashlib,struct
import numpy as np
from scipy.signal import welch,butter,sosfiltfilt
p=pathlib.Path(__file__).with_name('lanterns-of-home.py');s=importlib.util.spec_from_file_location('engine',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def analyze(a,f0):
 x=a.mean(axis=1);sr=m.SR;z=x[int(.22*sr):int(.82*sr)];f,p=welch(z,sr,nperseg=4096);p=p+1e-30;peak=float(np.max(abs(x)));env=np.sqrt(np.mean(x[:len(x)//480*480].reshape(-1,480)**2,axis=1));attack=np.flatnonzero(env>env.max()*.5);tail=np.flatnonzero(env>env.max()*.1);harm=[]
 for k in range(1,9):harm.append(float(p[abs(f-k*f0)<max(15,k*f0*.02)].sum()))
 t=np.arange(len(z))/sr;d=sosfiltfilt(butter(2,25,fs=sr,output='sos'),z*np.exp(-2j*np.pi*f0*t));inst=np.diff(np.unwrap(np.angle(d)))*sr/(2*np.pi)+f0;inst=inst[2400:-2400:480];cents=1200*np.log2(np.maximum(inst,1)/f0)
 return dict(peak=peak,centroidHz=float((f*p).sum()/p.sum()),centroidRelative=float((f*p).sum()/p.sum()/f0),fundamentalFraction=float(harm[0]/p.sum()),harmonicFractions=[float(h/p.sum()) for h in harm],attack50ms=int(attack[0]*10),tail10ms=int(tail[-1]*10),frequencyVariationCents=float(np.std(cents)))
def zones(font):
 def chunks(b):
  i=0
  while i+8<=len(b):
   k,n=struct.unpack_from('<4sI',b,i);yield k,b[i+8:i+8+n];i+=8+n+n%2
 b=pathlib.Path(font).read_bytes();pd=dict(chunks(next(d[4:] for k,d in chunks(b[12:]) if k==b'LIST' and d[:4]==b'pdta')))
 ph=list(struct.iter_unpack('<20sHHHIII',pd[b'phdr']));pb=list(struct.iter_unpack('<HH',pd[b'pbag']));pg=list(struct.iter_unpack('<HH',pd[b'pgen']));ins=list(struct.iter_unpack('<20sH',pd[b'inst']));ib=list(struct.iter_unpack('<HH',pd[b'ibag']));ig=list(struct.iter_unpack('<HH',pd[b'igen']));sh=list(struct.iter_unpack('<20sIIIIIBbHH',pd[b'shdr']));result=[]
 for program in (42,73):
  i=next(i for i,p in enumerate(ph) if p[1:3]==(program,0))
  for j in range(ph[i][3],ph[i+1][3]):
   gs=dict(pg[pb[j][0]:pb[j+1][0]])
   if 41 not in gs:continue
   ii=gs[41]
   for l in range(ins[ii][1],ins[ii+1][1]):
    g=dict(ig[ib[l][0]:ib[l+1][0]])
    if 53 not in g:continue
    sm=sh[g[53]];lo,hi=g.get(43,32512)&255,g.get(43,32512)>>8
    result.append(dict(program=program,range=[lo,hi],sample=sm[0].split(b'\0')[0].decode(),root=g.get(58,sm[6]),sampleRate=sm[5],sampleFrames=sm[2]-sm[1],loopFrames=sm[4]-sm[3],velocityRange=[g.get(44,32512)&255,g.get(44,32512)>>8],generators=g))
 return result
def main(font,baseline,out):
 out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);assert m.sha(font)==m.SFHASH
 with zipfile.ZipFile(baseline) as z:
  score=json.loads(z.read('music/score.json'));events=score['events'];ranges={p:[min(e['midi'] for e in events if e['part']==p),max(e['midi'] for e in events if e['part']==p)] for p in score['parts']};high=[]
  for part in ('flute','cello','horn'):
   with wave.open(io.BytesIO(z.read('music/'+part+'.wav')),'rb') as w:a=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(np.float32)/32768
   for e in events:
    if e['part']==part and e['midi']>=74:
     at=e['beat']*m.BEAT;k=round(at*m.SR);end=k+round(e['duration']*m.BEAT*m.SR);high.append(dict(part=part,midi=e['midi'],seconds=at,duration=e['duration']*m.BEAT,rms=float(np.sqrt(np.mean(a[k:end]**2)))))
 records=[]
 for part in ('flute','cello'):
  for note in (62,67,72,74,76):
   for vel in (64,88):
    e=[dict(part=part,beat=0,duration=1.4/m.BEAT,midi=note,velocity=vel,phrase=0)];a=m.synth_part(e,part,font,4.4,False);f0=440*2**((note-69)/12);metrics=analyze(a,f0);name=f'{part}-{note}-{vel}.wav';metrics.update(part=part,note=note,velocity=vel);metrics.update(m.save(out/name,np.rint(a*32767).astype(np.int32)));records.append(metrics)
 (out/'register-study.json').write_text(json.dumps(dict(source=m.SFHASH,ranges=ranges,highEvents=high,sampleZones=zones(font),controls=records,scope='pitch and velocity, fixed CC11, fixed room; vibrato not independently controlled; no genuine interval recording'),indent=2)+'\n')
if __name__=='__main__':main(*sys.argv[1:])
