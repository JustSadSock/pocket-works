"""The Weight of a Crown: thematic reduction, recorded sources only."""
import hashlib,json,math,pathlib,subprocess,sys,wave,zipfile
import numpy as np
from scipy.signal import butter,sosfilt
SR=48000; BPM=96; BEAT=60/BPM; BARS=24
THEME=[[(0,52,1.5),(1.5,53,.5),(2,55,1),(3,59,1.75)],[(0,57,2),(2,55,.5),(2.5,53,1.5),(4,52,.5)],[(0,55,1.5),(1.5,57,.5),(2,55,1),(3,52,1.75)],[(0,53,1),(1,52,2.75)]]
BRIDGE=[[(0,59,2),(2,55,1),(3,52,1.5)],[(0,57,1.5),(1.5,55,.5),(2,53,2.5)],[(0,55,2),(2,52,1),(3,55,1.5)],[(0,53,1.5),(1.5,52,2.25)]]
CHORDS=[(28,55,71),(29,57,72),(36,52,67),(28,55,71)]
PARTS={'cello':('cello-section','arco-vib',-.08),'violin':('violin','arco-vib',.16),'clarinet':('clarinet','sustain',.06),'bass':('double-bass','sustain',0),'harp':('folk-harp','pluck',-.25),'horn':('horn','sustain',-.16),'drum':('frame-drum','open',0)}
LEVEL={'lead':.115,'bass':.047,'harmony':.028,'pluck':.025,'answer':.019,'pulse':.025}

def score():
    events=[]
    def add(bar,beat,part,note,dur,vel,role):
        events.append(dict(bar=bar,beat=beat,part=part,midi=note,duration=dur,velocity=vel,role=role))
    for bar in range(BARS):
        phrase,j=divmod(bar,4); root,third,fifth=CHORDS[j]
        lead=['cello','cello','violin','clarinet','violin','cello'][phrase]
        shift=0 if lead=='cello' else 12
        strength=[.73,.80,.86,.65,.96,.67][phrase]
        line=(BRIDGE if phrase==3 else THEME)[j]
        for i,(beat,note,dur) in enumerate(line):
            add(bar,beat,lead,note+shift,dur,strength*(1 if i==0 else .91 if i==1 else .96),'lead')
        # The same four harmonies underpin all statements; only orchestration changes.
        if phrase==0:
            add(bar,0,'bass',root,2.5,.55,'bass')
        elif phrase==3:
            add(bar,0,'bass',root,2.5,.45,'bass')
        elif phrase==5:
            add(bar,0,'bass',root,2.5,.48,'bass')
        else:
            add(bar,0,'bass',root,2.5,.66,'bass');add(bar,3,'bass',root,1.5,.50,'bass')
        if phrase in (2,4):
            add(bar,0,'cello',third,2.5,.55,'harmony')
            add(bar,3,'cello',third,1.5,.43,'harmony')
        if phrase in (1,3) and j!=3 or phrase==4 and j==1:
            add(bar,3,'harp',fifth,.4,.48,'pluck')
        if phrase==4 and j==3:
            add(bar,4,'horn',59,.75,.45,'answer')
        if phrase in (1,2,4) and j in (0,2):
            add(bar,0,'drum',None,.4,.48,'pulse');add(bar,3,'drum',None,.4,.34,'pulse')
    return sorted(events,key=lambda e:(e['bar'],e['beat'],e['part']))

def validate(events):
    for bar in range(BARS):
        es=[e for e in events if e['bar']==bar];lead=[e for e in es if e['role']=='lead']
        assert len({e['part'] for e in lead})==1
        assert [e['midi']%12 for e in lead]==[n%12 for _,n,_ in (BRIDGE if bar//4==3 else THEME)[bar%4]]
        assert all(e['beat']+e['duration']<=5 for e in es)
        for t in np.arange(0,5,.125):
            active=[e for e in es if e['beat']<=t<e['beat']+e['duration']]
            assert sum(e['role']=='lead' for e in active)<=1
            assert len({e['part'] for e in active})<=4
            assert not(any(e['role']=='answer' for e in active) and any(e['role']=='lead' for e in active))
    assert not any(e['part']=='trumpet' for e in events)

def banks(paths):
    pools={p:[] for p in PARTS}
    for path in paths:
        path=pathlib.Path(path);z=zipfile.ZipFile(path) if path.is_file() else None
        read=z.read if z else lambda n:(path/n).read_bytes()
        index=json.loads(read('library/index.json'));metrics=json.loads(read('metrics.json'))
        zones={e['id']:e for e in metrics.get('zones',[])}
        for e in index['entries']:
            recipe=e.get('recipe',{}); inst=e.get('instrument') or recipe.get('instrument');art=e.get('articulation') or recipe.get('articulation')
            for p,(i,a,_) in PARTS.items():
                if (inst,art)!=(i,a):continue
                assert e['approval']=='research-only' and e['license']=='CC0-1.0'
                b=read('library/'+e['path']);assert hashlib.sha256(b).hexdigest()==e['sha256']
                zone=zones.get(e['id'],{});m=e.get('measuredMidi',zone.get('measuredMidi',recipe.get('midi')))
                pools[p].append((e['id'],m,e.get('velocity') or recipe.get('velocity') or .6,b,e['sha256'],zone.get('offsetFrames',0)))
        if z:z.close()
    assert all(pools.values());return pools

def render(paths,out):
    events=score();validate(events);pools=banks(paths);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    N=round((BARS*5*BEAT+1.5)*SR);stems={r:np.zeros((N,2),np.float32) for r in LEVEL};cache={};receipts=[]
    for e in events:
        p=e['part'];note=e['midi'];role=e['role'];v=e['velocity']
        source=min(pools[p],key=lambda s:(abs(s[1]-note) if note is not None else 0,abs(s[2]-v),s[0]));sid,m,_,b,sha,off=source
        rate=1 if note is None else 2**((note-m)/12)
        if note is not None:assert abs(note-m)<=5.1,(p,note,m)
        if sid not in cache:
            raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r',str(SR),'-'],input=b)
            x=np.frombuffer(raw,'<f4').copy();nz=np.flatnonzero(abs(x)>max(1e-6,np.max(abs(x))*.025));cache[sid]=x[off or max(0,int(nz[0])-100):]
        x=cache[sid];finite=role in ('pluck','pulse');n=round(e['duration']*BEAT*SR);start=round((e['bar']*5+e['beat'])*BEAT*SR)
        if finite:n=min(round(.7*SR),int((len(x)-2)/rate))
        required=int((n-1)*rate)+2;looped=False
        if required>len(x) and p=='bass':
            seg=x[round(.30*SR):-round(.20*SR)];fade=round(.05*SR);x=x[:-round(.20*SR)].copy()
            assert len(seg)>fade*4
            while len(x)<required:
                u=np.linspace(0,1,fade,dtype=np.float32);x[-fade:]=x[-fade:]*(1-u)+seg[:fade]*u;x=np.concatenate((x,seg[fade:]));looped=True
        if required>len(x):raise ValueError(f'short recording {p} {note}: {len(x)} < {required}')
        y=np.interp(np.arange(n)*rate,np.arange(len(x)),x).astype(np.float32)
        if p in ('violin','horn'):y=sosfilt(butter(2,4200 if p=='violin' else 2400,fs=SR,output='sos'),y).astype(np.float32)
        env=np.minimum(1,np.minimum(np.arange(n)/max(1,round(SR*(.009 if finite else .033))),(n-1-np.arange(n))/max(1,min(n//2,round(SR*(.15 if finite else .065))))))
        rms=np.sqrt(np.mean(y*y,dtype=np.float64));gain=min(LEVEL[role]/max(rms,1e-9),.7/max(np.max(abs(y)),1e-9))*v
        pan=PARTS[p][2];a=y*env*gain;stems[role][start:start+n]+=a[:,None]*np.array([math.cos((pan+1)*math.pi/4),math.sin((pan+1)*math.pi/4)])
        receipts.append(dict(**e,source=sid,sha256=sha,pitchRate=rate,frames=n,loopedSustain=looped))
    # Short, quiet shared room. Keep the foreground dry enough to hear each note.
    for role,a in stems.items():
        mono=a.mean(axis=1);wet=.11 if role=='lead' else .08
        for delay,g,l,r in ((.027,.5,1,.6),(.044,.3,.6,1),(.073,.2,1,.7)):
            k=round(delay*SR);a[k:,0]+=mono[:-k]*wet*g*l;a[k:,1]+=mono[:-k]*wet*g*r
    mix=sum(stems.values());gain=min(4,.89/max(np.max(abs(mix)),*(np.max(abs(a)) for a in stems.values())))
    pcm={r:np.rint(a*gain*32767).astype(np.int32) for r,a in stems.items()};master=sum(pcm.values());assert np.max(abs(master))<32768
    metrics=[]
    for r,a in [('master',master),*pcm.items()]:
        f=out/('crown-coherent-'+r+'.wav')
        with wave.open(str(f),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(a.astype('<i2').tobytes())
        metrics.append(dict(file=f.name,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),peak=float(np.max(abs(a))/32768),rms=float(np.sqrt(np.mean((a.astype(float)/32768)**2)))))
    report=dict(approval='research-only',version='v3-thematic-reduction',bars=BARS,seconds=N/SR,tempo=BPM,meter='5/4',events=receipts,sourceCount=len(cache),recordedIntervalCoverage=0,metrics=metrics)
    (out/'metrics.json').write_text(json.dumps(report,indent=2)+'\n')
    print('coherent score:',len(events),'events;',len(cache),'recorded sources;',N/SR,'seconds')
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:validate(score());print('thematic hierarchy self-test passed')
    else:render(sys.argv[1:4],sys.argv[4])
