"""Original acoustic victory cue, research-only. Usage: dynamics.zip historical.zip output."""
import hashlib,json,pathlib,subprocess,sys,wave,zipfile
import numpy as np
from scipy.signal import butter,sosfilt,fftconvolve
SR=48000; BPM=108; PPQ=24; BAR=96
A=[[(62,2),(65,1),(67,1),(69,4)],[(65,2),(64,2),(62,4)],[(58,2),(62,2),(67,2),(65,2)],[(64,3),(61,1),(57,4)],[(62,2),(65,1),(67,1),(69,2),(72,2)],[(70,3),(69,1),(65,4)],[(67,2),(65,2),(64,2),(61,2)],[(62,6),(0,2)]]
V=[[(74,2),(78,1),(79,1),(81,4)],[(78,2),(76,2),(74,4)],[(73,2),(74,2),(79,2),(78,2)],[(76,3),(73,1),(69,4)],[(74,2),(78,1),(79,1),(81,2),(83,2)],[(81,3),(79,1),(78,4)],[(76,2),(78,2),(79,2),(73,2)],[(74,6),(0,2)]]
H={'dm':(50,57,62,65,69),'bb':(46,53,62,65,70),'g':(55,50,62,67,70),'a':(45,57,61,64,69),'D':(50,57,62,66,69),'G':(55,50,62,67,71),'bm':(47,54,62,66,71),'A':(45,57,61,64,69)}
MIN=['dm','dm','bb','a','dm','bb','a','dm']; MAJ=['D','D','G','A','bm','G','A','D']
SECTIONS=[('oath',4,.45),('advance',8,.65),('struggle',8,.82),('silence',4,.33),('victory',8,.91),('coronation',12,1.),('seal',4,.77)]
P={'bass':('cello-section','arco-vib',-.10,.80,'strings'),'celli':('cello-section','arco-vib',.20,.75,'strings'),'horn':('horn','sustain',-.29,.83,'brass'),'horn2':('horn','sustain',.30,.54,'brass'),'trumpet':('trumpet','sustain',.10,.86,'brass'),'violin':('violin','arco-vib',-.37,.47,'strings'),'violin2':('violin','arco-vib',.42,.28,'strings'),'clarinet':('clarinet','sustain',.18,.48,'winds'),'harp':('folk-harp','pluck',-.45,.52,'winds'),'drum':('frame-drum','open',.02,.85,'percussion'),'muted':('frame-drum','muted',-.17,.58,'percussion'),'tamb':('tambourine','hit-strong',.35,.36,'percussion'),'organ':('renaissance-organ','organ-8',0,.42,'organ')}
def score():
    events=[];sections=[];bar=0
    def add(p,m,t,d,v):
        if m!=0:events.append(dict(part=p,midi=m,tick=t,durationTicks=d,velocity=round(min(1,v),4)))
    def line(p,row,t,v,shift=0):
        assert sum(d for m,d in row)==8
        for m,d in row:
            if m:add(p,m+shift,t,d*12,v*(1 if t%48==0 else .91))
            t+=d*12
    for sec,count,l in SECTIONS:
        sections.append(dict(id=sec,startBar=bar,bars=count))
        for j in range(count):
            t=bar*BAR;k=j%8;major=sec in ('victory','coronation','seal');h=(MAJ if major else MIN)[k];row=(V if major else A)[k];v=l*(.88+.12*j/max(1,count-1))
            if sec=='oath':h=['dm','bb','g','a'][j];row=[[(50,4),(53,2),(57,2)],[(53,4),(50,4)],[(55,4),(58,2),(57,2)],[(52,6),(0,2)]][j]
            if sec=='silence':h=['dm','bb','a','a'][j];row=[[(62,6),(0,2)],[(58,4),(57,4)],[(64,4),(61,4)],[(57,4),(0,4)]][j]
            if sec=='coronation' and j>=8:h=['G','bm','A','D'][j-8];row=[[(79,4),(78,2),(76,2)],[(78,2),(81,2),(83,4)],[(81,2),(79,2),(76,2),(73,2)],[(74,8)]][j-8]
            if sec=='seal':h=['D','G','A','D'][j];row=[[(74,4),(78,2),(81,2)],[(79,4),(78,4)],[(76,4),(73,4)],[(74,8)]][j]
            r,f,m,n,q=H[h]
            if sec=='oath':line('celli',row,t,v)
            elif sec=='silence':line('clarinet',row,t,v)
            elif major:line('trumpet',row,t,v);line('violin',[(p-12 if p>77 else p,d) for p,d in row],t,v*.86);line('horn',row,t,v*.89,-24)
            else:line('horn',row,t,v,-12);line('violin',[(p+12 if 0<p<62 else p,d) for p,d in row],t,v*.65)
            if sec in ('oath','silence','seal'):add('bass',r,t,96 if j!=count-1 or sec=='seal' else 72,v*.76)
            else:
                for off,p,d in [(0,r,24),(24,r,12),(36,f,12),(48,r,24),(72,f,24)]:add('bass',p,t+off,d,v*.82)
            if sec not in ('oath','silence'):
                add('celli',f,t,96,v*.65);add('horn2',m-12,t,96,v*.75)
                if major:
                    add('violin2',n+12 if n+12<=77 else n,t,96,v*.72);add('organ',q,t,96,v*.58)
                    if j%2==0:add('clarinet',m,t+48,48,v*.58)
                else:add('clarinet',m,t+48,36,v*.60)
            for off,p in ([(0,m),(48,n)] if sec in ('oath','silence','seal') else [(0,m),(24,n),(48,q),(72,n)]):add('harp',p,t+off,12,v*.8)
            if sec not in ('oath','silence'):
                hits=[(0,'drum',1),(48,'drum',.86),(24,'muted',.67),(72,'muted',.75)]
                if sec in ('struggle','coronation') and j%4==3:hits += [(60,'muted',.6),(84,'muted',.83)]
                if major:hits += [(0,'tamb',.85),(48,'tamb',.65)]
                if sec=='seal' and j==3:hits=[(0,'drum',1),(0,'tamb',.9)]
                for off,p,a in hits:add(p,None,t+off,12,v*a)
            elif sec=='oath' and j in (0,2):add('drum',None,t,12,v*.7)
            bar+=1
    return dict(title='The Crown Endures',bpm=BPM,meter=[4,4],ppq=PPQ,bars=bar,sections=sections,events=sorted(events,key=lambda e:(e['tick'],e['part'])))
sha=lambda b:hashlib.sha256(b).hexdigest()
def bank(path):
    p=pathlib.Path(path);return (lambda n:(p/n).read_bytes()) if p.is_dir() else zipfile.ZipFile(p).read
def render(dyn,hist,out):
    s=score();out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);d,h=bank(dyn),bank(hist);c={e['id']:e for e in json.loads(d('library/index.json'))['entries']};sources=[];cache={}
    for z in json.loads(d('metrics.json'))['zones']:
        if (z['instrument'],z['articulation']) in [p[:2] for p in P.values()]:sources.append((dict(c[z['id']],instrument=z['instrument'],articulation=z['articulation']),z,d))
    for e in json.loads(h('library/index.json'))['entries']:
        if (e['instrument'],e['articulation']) in [p[:2] for p in P.values()]:sources.append((e,dict(expectedMidi=e['expectedMidi'],measuredMidi=e['measuredMidi'],offsetFrames=0,velocity=.6),h))
    f=lambda t:round(t*60*SR/(BPM*PPQ));N=f(s['bars']*BAR)+4*SR;groups={g:np.zeros((N,2),np.float32) for g in sorted(set(p[4] for p in P.values()))};receipts=[]
    for part,(inst,art,pan,trim,group) in P.items():
        es=[e for e in s['events'] if e['part']==part];a=np.zeros(N,np.float32);pool=[x for x in sources if (x[0]['instrument'],x[0]['articulation'])==(inst,art)];last=0
        for i,ev in enumerate(es):
            m=ev['midi'];v=ev['velocity'];t=ev['tick'];assert t>=last and t%12==0 and ev['durationTicks']%12==0;last=t+ev['durationTicks'];assert last<=s['bars']*BAR
            if m is None:e,z,read=pool[i%len(pool)]
            else:e,z,read=min(pool,key=lambda x:(abs(x[1]['expectedMidi']-m),abs(x[1]['velocity']-v),x[0]['id']));assert abs(z['expectedMidi']-m)<=5,(part,m,z['expectedMidi']);assert abs(z['expectedMidi']-z['measuredMidi'])<=.75
            if e['id'] not in cache:
                b=read('library/'+e['path']);assert sha(b)==e['sha256'] and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==e['pin']['blob'] and e['license']=='CC0-1.0' and e['approval']=='research-only'
                raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r',str(SR),'-'],input=b);x=np.frombuffer(raw,'<f4').astype(float)[z['offsetFrames']:];assert np.isfinite(x).all()
                if not z['offsetFrames']:on=np.flatnonzero(abs(x)>max(abs(x))*.025)[0];x=x[max(0,on-120):]
                cache[e['id']]=x
            x=cache[e['id']];rate=1 if m is None else 2**((m-z['measuredMidi'])/12);start=f(t);dur=f(last)-start;finite=inst in ('folk-harp','frame-drum','tambourine');connected=i>0 and es[i-1]['tick']+es[i-1]['durationTicks']==t and not finite and inst!='trumpet';nextconn=i+1<len(es) and es[i+1]['tick']==last and not finite and inst!='trumpet'
            overlap=round(.045*SR) if nextconn else 0;length=min(int((len(x)-2)/rate),int(SR*1.65)) if finite else dur+overlap;offset=round(.085*SR) if connected else 0;assert (length+offset-1)*rate<len(x)-1 and start+length<=N
            y=np.interp((np.arange(length)+offset)*rate,np.arange(len(x)),x);u=np.linspace(0,1,length);attack=96 if finite else round(SR*(.045 if connected else .024 if inst=='trumpet' else .055));release=min(length//3,overlap if nextconn else int(SR*(.10 if finite else .075)));env=np.minimum(1,np.minimum(np.arange(length)/attack,(length-1-np.arange(length))/max(1,release)))
            if not finite:env*=.82+.18*np.sin(np.pi*u)
            if inst=='violin':y=sosfilt(butter(2,4700,fs=SR,output='sos'),y)
            if inst=='trumpet':y=sosfilt(butter(2,6200,fs=SR,output='sos'),y)
            gain=min(.16/max(np.sqrt(np.mean(y*y)),1e-9),.58/max(abs(y)))*v*trim;a[start:start+length]+=(y*env*gain).astype(np.float32);receipts.append(dict(**ev,source=e['id'],sha256=e['sha256'],rate=rate,connected=connected,frames=length))
        groups[group]+=a[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2]).astype(np.float32)
    rng=np.random.default_rng(314);L=int(SR*1.7);ir=np.zeros((L,2),np.float32)
    for c in range(2):
        for delay,g in ((.026,.12),(.047,.09),(.082,.07),(.117,.06),(.163,.045)):ir[int(SR*(delay+c*.007)),c]=g
        tail=rng.standard_normal(L).astype(np.float32)*np.exp(-np.arange(L)/(SR*.31));tail[:int(.045*SR)]=0;tail*=.17/np.sqrt(np.sum(tail*tail));ir[:,c]+=tail
    for a in groups.values():
        mono=a.mean(axis=1)
        for c in range(2):a[:,c]+=fftconvolve(mono,ir[:,c])[:N]
    mix=sum(groups.values());gain=min(3,.89/max(float(np.max(abs(mix))),*(float(np.max(abs(a))) for a in groups.values())));metrics=[];quant=lambda a:np.rint(a*gain*32767).astype('<i2')
    qm=quant(mix);err=int(np.max(abs(sum(quant(a).astype(np.int32) for a in groups.values())-qm.astype(np.int32))));assert err<=3
    for name,a in [('the-crown-endures',mix),*groups.items()]:
        p=out/(name+'.wav');assert np.isfinite(a).all() and 0<np.max(abs(a))*gain<1
        with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(quant(a).tobytes())
        metrics.append(dict(file=p.name,sha256=sha(p.read_bytes()),peak=float(np.max(abs(a))*gain),rms=float(np.sqrt(np.mean(a*a))*gain),frames=N))
    report=dict(approval='research-only',score=s,receipts=receipts,metrics=metrics,pcmError=err,sourceCount=len(cache),seconds=N/SR,recordedIntervalCoverage=0)
    (out/'metrics.json').write_text(json.dumps(report,indent=2)+'\n');print(len(receipts),len(cache),N/SR,err,metrics[0])
if __name__=='__main__':render(*sys.argv[1:])
