"""Original martial score; shared expressive SoundFont renderer plus admitted recorded percussion."""
import importlib.util,pathlib,sys,json,hashlib,wave,time,resource,io,zipfile,subprocess
import numpy as np
p=pathlib.Path(__file__).with_name('lanterns-of-home.py');s=importlib.util.spec_from_file_location('engine',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
SR=48000;BPM=108;BEAT=60/BPM;BARS=48;TAIL=3
m.BEAT=BEAT;m.BPM=BPM;m.BARS=BARS;m.TAIL=TAIL
m.PARTS={'horn':(60,50,.78),'cello':(42,76,.76),'reed':(68,83,.62),'strings':(48,53,.68),'viola':(41,39,.45),'pizz':(45,64,.73),'harp':(46,85,.50)}
m.SECTIONS=[('approach',0,4),('call',4,16),('uncertainty',16,24),('memory',24,32),('breakthrough',32,44),('dawn',44,48)]
H='Gm Gm Eb D Gm Eb Bb F Gm Cm Eb D Bb F Cm Gm Cm Ab Eb Gm Cm Eb D D Eb Bb F Gm Eb Cm F D Gm Eb Bb F Cm Gm Eb D G Cm D G G Eb D G'.split()
VO={'Gm':(43,[55,58,62]),'Eb':(39,[55,58,63]),'D':(38,[54,57,62]),'Bb':(46,[53,58,62]),'F':(41,[53,57,60]),'Cm':(48,[55,60,63]),'Ab':(44,[56,60,63]),'G':(43,[55,59,62])}
# Eighths; original call and long lyrical answer. Each bar sums to eight.
L='0:8|0:8|0:6 55:2|57:2 54:2 0:4|55:1 55:1 62:3 58:1 60:2|63:4 62:2 58:2|58:2 60:1 62:1 65:3 0:1|65:2 60:2 57:3 0:1|55:1 55:1 62:3 58:1 67:2|67:3 63:1 60:3 0:1|63:2 65:2 67:2 70:2|69:3 66:1 62:3 0:1|62:4 65:2 70:2|69:3 65:1 60:4|63:2 62:2 60:2 55:2|58:3 57:1 55:4|60:1 60:1 67:2 63:2 60:2|56:4 60:2 63:2|67:2 65:1 63:1 58:4|55:2 58:2 62:3 0:1|60:2 63:2 67:2 63:2|58:4 55:2 63:2|62:1 62:1 69:3 66:1 64:2|66:2 64:2 62:4|63:4 67:2 70:2|69:2 65:2 62:4|60:2 65:2 69:2 65:2|67:3 65:1 62:4|63:2 67:2 70:3 0:1|67:4 63:2 60:2|65:2 63:1 60:1 57:4|57:2 54:2 62:3 0:1|55:1 55:1 62:3 58:1 67:2|70:4 67:2 63:2|70:2 72:1 74:1 77:3 0:1|77:2 72:2 69:3 0:1|67:2 72:2 75:2 72:2|74:4 70:2 67:2|70:2 67:1 65:1 63:2 67:2|69:3 66:1 62:4|67:1 67:1 74:3 71:1 72:2|75:3 72:1 67:4|69:2 66:2 62:2 66:2|67:6 0:2|71:4 69:2 67:2|70:3 67:1 63:4|66:2 64:2 62:4|67:8'
assert len(H)==len(L.split('|'))==48
def score():
 es=[]
 def add(p,b,t,d,n,v):es.append(dict(part=p,beat=b*4+t,duration=d,midi=n,velocity=int(v),phrase=b//4))
 for b,line in enumerate(L.split('|')):
  sec=next(i for i,(_,lo,hi) in enumerate(m.SECTIONS) if lo<=b<hi);root,ch=VO[H[b]];v=[.45,.74,.79,.58,1,.48][sec]*[.88,1,.96,.83][b%4];p='reed' if sec==3 else 'cello' if sec in (0,2,5) or 12<=b<16 else 'horn';t=0
  for i,cell in enumerate(line.split()):
   n,d=map(int,cell.split(':'));d/=2
   if n:
    if p=='cello' and n>=67:n-=12
    if p=='horn' and n>74:n-=12
    add(p,b,t,d if d>=1 else d*.88,n,58+30*v+(4 if i==0 else 0))
   t+=d
  assert t==4
  if sec in (0,5):pattern=[(0,1.5,root),(2,1.3,root+7)]
  elif sec==3:pattern=[(0,1.4,root),(3,.7,ch[0]-12)]
  else:pattern=[(0,.68,root),(1,.42,root+7),(1.5,.35,root),(2,.68,root),(3,.42,ch[0]-12),(3.5,.35,root+7)]
  for t,d,n in pattern:add('pizz',b,t,d,n,54+28*v+(5 if t==0 else 0))
  for n in ch[:2] if sec in (0,5) else ch:add('strings',b,0,3.92,n,42+24*v)
  if sec in (1,2,4):
   for j,t in enumerate((0,.75,1.5,2,2.75,3.5)):add('viola',b,t,.30,ch[j%3]-12,49+21*v+(6 if j in (0,3) else 0))
  if sec in (0,3,5) or b%4==3:
   for j,t in enumerate((0,1.5,2.5,3.5)):add('harp',b,t,.4,ch[j%3]+12,47+17*v)
  if sec==3 and b%2==0:add('cello',b,0,3.6,ch[0]-12,50+15*v)
  if sec==4 and b in (33,37,41):add('cello',b,2,1.8,ch[1],65+14*v)
  if sec==1 and b in (7,11,15):add('reed',b,3,.8,ch[1]+12,55+10*v)
  if sec==2 and b in (19,23):add('horn',b,2,1.6,ch[0],65+10*v)
 out=[];last={}
 for e in sorted(es,key=lambda a:(a['beat'],a['part'],a['midi'])):
  k=e['part'],e['midi'];prev=last.get(k)
  if e['part']=='strings' and prev and abs(prev['beat']+prev['duration']+.08-e['beat'])<.001:prev['duration']=round(e['beat']+e['duration']-prev['beat'],5)
  else:out.append(e);last[k]=e
 return out

def main(font,baseline,out):
 t=time.perf_counter();out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);assert m.sha(font)==m.SFHASH;es=score();seconds=BARS*4*BEAT+TAIL;N=round(seconds*SR)
 stems={p:m.synth_part(es,p,font,seconds,True,meter=4) for p in m.PARTS};drums=np.zeros((N,2),np.float32);receipts=[]
 with zipfile.ZipFile(baseline) as z:
  manifest=json.loads(z.read('soundscape/manifest.json'));sources=[e for e in manifest['sources'] if e.get('instrument')=='bass-drum'];assert len(sources)>=3;bank=[]
  for e in sources:
   name='soundscape/originals/'+pathlib.Path(e['path']).name;b=z.read(name);assert hashlib.sha256(b).hexdigest()==e['sha256'] and e['license']=='CC0-1.0' and e['redistribution'] is True
   x=np.frombuffer(subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-'],input=b),'<f4')
   bank.append(x/max(np.max(abs(x)),1e-9))
  for bar in range(BARS):
   sec=next(i for i,(_,lo,hi) in enumerate(m.SECTIONS) if lo<=bar<hi);beats=([0] if bar%2==0 else []) if sec in (0,3,5) else [0,2] if sec in (1,2) else [0,1.5,3]
   for j,beat in enumerate(beats):
    i=(bar+j)%len(bank);k=round((bar*4+beat)*BEAT*SR);x=bank[i][:min(len(bank[i]),N-k)];gain=[.035,.11,.13,.045,.17,.035][sec]*(1 if j==0 else .7);drums[k:k+len(x)]+=x[:,None]*np.array([.72,.69])*gain;receipts.append(dict(bar=bar,beat=beat,source=sources[i]['sha256'],gain=gain))
 stems['drums']=drums
 for a in stems.values():a[:SR//10]*=np.linspace(0,1,SR//10)[:,None];a[-SR:]*=np.linspace(1,0,SR)[:,None]
 mix=sum(stems.values());g=.86/max(np.max(abs(mix)),*(np.max(abs(a)) for a in stems.values()));pcm={k:np.rint(a*g*32767).astype(np.int32) for k,a in stems.items()};master=sum(pcm.values());assert np.max(abs(master))<32768
 files=[m.save(out/'the-dawn-beyond-the-pass.wav',master)]+[m.save(out/(k+'.wav'),a) for k,a in pcm.items()];x=master.astype(np.float64)/32768;mono=x.mean(axis=1)
 report=dict(approval='research-only',duration=N/SR,backend='SoundFont expressive phrases and CC0 recorded bass drums',soundfontSha256=m.SFHASH,recordedSources=sources,recordedIntervalCoverage=0,approximateLegato='25ms connected overlap; not recorded intervals',files=files,pcmError=0,lrCorrelation=float(np.corrcoef(x.T)[0,1]),monoLossDb=float(10*np.log10(np.mean(mono**2)/np.mean(x*x))),wallSeconds=time.perf_counter()-t,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
 (out/'score.json').write_text(json.dumps(dict(bpm=BPM,meter=[4,4],bars=BARS,sections=m.SECTIONS,harmony=H,parts=m.PARTS,events=es,percussion=receipts),indent=2)+'\n');(out/'metrics.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
if __name__=='__main__':main(*sys.argv[1:])
