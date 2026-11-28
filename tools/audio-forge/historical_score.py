"""Score-first historical audition. Original notes, verified acoustic recordings only."""
import hashlib, io, json, pathlib, subprocess, sys, wave, zipfile
import numpy as np
from scipy.signal import butter, sosfilt
SR=48000; PPQ=24; BPM=72; BAR=4*PPQ
SECTIONS=[('prologue',4,.44),('theme',8,.66),('development',12,.76),('contrast',8,.50),('climax',12,.94),('epilogue',8,.38)]
CHORDS={'d':(50,57,62,65,69),'b':(46,53,62,65,70),'f':(48,53,60,65,69),'c':(48,55,60,64,67),'g':(43,55,62,67,70),'a':(45,52,57,61,64)}
# Each bar contains (pitch, duration in eighth-note units); 0 denotes rest.
THEME=[[(50,3),(53,1),(57,3),(55,1)],[(53,4),(50,2),(0,2)],[(48,2),(53,2),(57,2),(60,2)],[(57,4),(55,2),(53,2)],[(55,3),(58,1),(57,2),(55,2)],[(53,4),(50,2),(53,2)],[(52,2),(55,2),(57,2),(61,2)],[(62,6),(0,2)]]
HARM=['d','b','f','d','g','b','a','d']
CONTRAST=[[(65,4),(67,2),(69,2)],[(70,3),(69,1),(65,4)],[(64,2),(67,2),(72,4)],[(69,6),(0,2)],[(70,4),(67,2),(65,2)],[(65,4),(62,4)],[(64,3),(67,1),(69,4)],[(62,6),(0,2)]]
CH=['f','b','c','f','g','b','a','d']
PARTS={'cello':('cello-section',-.18,.95),'bass':('cello-section',.12,.52),'clarinet':('clarinet',.23,.57),'harp':('folk-harp',-.38,.54),'horn':('horn',.10,.43),'violin':('violin',-.27,.27)}

def score():
    events=[]; sections=[]; bar=0
    def add(part,pitch,tick,length,velocity,role):
        if pitch:events.append(dict(part=part,midi=pitch,tick=tick,durationTicks=length,velocity=round(velocity,4),role=role))
    def line(part,row,start,level):
        t=start
        assert sum(d for _,d in row)==8
        for i,(p,d) in enumerate(row):
            add(part,p,t,d*12,level*(1 if i==0 else .88), 'melody');t+=d*12
    for name,count,level in SECTIONS:
        sections.append(dict(id=name,startBar=bar,bars=count,intensity=level))
        for j in range(count):
            t=bar*BAR; k=j%8
            if name=='prologue':h=['d','b','g','a'][j];row=[[(0,4),(50,2),(53,2)],[(57,4),(53,2),(0,2)],[(55,4),(53,4)],[(52,4),(0,4)]][j]
            elif name=='contrast':h=CH[k];row=CONTRAST[k]
            elif name=='development' and j>=8:h=['g','b','a','a'][j-8];row=[[(55,2),(58,2),(57,4)],[(53,3),(50,1),(53,4)],[(52,2),(57,2),(61,4)],[(57,6),(0,2)]][j-8]
            elif name=='climax' and j>=8:h=['g','b','a','d'][j-8];row=[[(58,4),(57,2),(55,2)],[(53,2),(57,2),(62,4)],[(61,4),(57,2),(61,2)],[(62,8)]][j-8]
            elif name=='epilogue':h=HARM[k];row=THEME[k] if j<4 else [[(55,4),(53,4)],[(50,6),(0,2)],[(52,4),(0,4)],[(50,8)]][j-4]
            else:
                h=HARM[k];row=THEME[k]
                if name=='development' and k in (0,2,4):row=[(p,d) for p,d in reversed(row)]
                if name=='climax' and k==0:row=[(50,2),(53,2),(57,2),(62,2)]
            root,fifth,p1,p2,p3=CHORDS[h]; root=root+12 if root<45 else root; fifth=fifth+12 if fifth<45 else fifth
            lead='clarinet' if name=='contrast' else 'cello'
            line(lead,row,t,level)
            # Bass on the same metrical grid; a breath on cadence bars.
            if name!='prologue' or j>=2:
                add('bass',root,t,72 if j%4==3 else 96,level*.65,'bass')
            # Sparse harp: no perpetual six-note arpeggio; alternate two related patterns.
            pattern=[(0,p1),(48,p2)] if name in ('prologue','epilogue','contrast') else ([(0,p1),(36,p2),(72,p3)] if j%2==0 else [(0,p1),(48,p3),(72,p2)])
            for beat,p in pattern:add('harp',p,t+beat,24,level*.78,'pulse')
            if name in ('development','climax'):
                if name=='climax' or j%4 in (2,3):add('horn',fifth,t+24,60,level*.72,'harmony')
                if name=='climax' and j>=4:
                    add('violin',p3,t+48,48,level*.62,'counterline')
                elif j%4==2:add('clarinet',p2,t+48,36,level*.54,'counterline')
            if name=='contrast' and j%2==0:add('cello',min(57,fifth),t+24,60,level*.73,'counterline')
            bar+=1
    return dict(title='The Last Pilgrim',bpm=BPM,ppq=PPQ,meter=[4,4],bars=bar,sections=sections,events=sorted(events,key=lambda e:(e['tick'],e['part'])))

def validate(s):
    assert s['bars']==52 and s['sections'][-1]['startBar']+s['sections'][-1]['bars']==s['bars']
    ends={}; total=s['bars']*BAR
    for e in s['events']:
        assert e['tick']%12==0 and e['durationTicks']%12==0 and 0<=e['tick']<e['tick']+e['durationTicks']<=total
        assert 0<e['velocity']<=1 and e['tick']>=ends.get(e['part'],0)
        ends[e['part']]=e['tick']+e['durationTicks']
    assert s==score() and len(s['events'])>200

def digest(b):return hashlib.sha256(b).hexdigest()
class DirectoryBank:
    def __init__(self,path):self.path=pathlib.Path(path)
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self,name):return (self.path/name).read_bytes()
def open_bank(path):return DirectoryBank(path) if pathlib.Path(path).is_dir() else zipfile.ZipFile(path)
def load_sources(dyn,hist):
    banks=[]
    with open_bank(dyn) as z:
        manifest=json.loads(z.read('metrics.json'));assert manifest['approval']=='research-only' and len(manifest['zones'])==39
        catalog={e['id']:e for e in json.loads(z.read('library/index.json'))['entries']}
        for e in manifest['zones']:
            if e['instrument'] not in ('cello-section','clarinet','horn','violin') or e['velocity']!=.35:continue
            h=e['sourceSha256'];b=z.read('library/objects/'+h+'.wav');c=catalog[e['id']]
            assert digest(b)==h==c['sha256'] and c['license']=='CC0-1.0' and c['approval']=='research-only'
            assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==c['pin']['blob']
            banks.append(dict(id=e['id'],instrument=e['instrument'],midi=e['expectedMidi'],measured=e['measuredMidi'],offset=e['offsetFrames'],hash=h,bytes=b))
    with open_bank(hist) as z:
        entries=json.loads(z.read('library/index.json'))['entries'];assert len(entries)==46
        for e in entries:
            if e['instrument']!='folk-harp':continue
            h=e['sha256'];b=z.read('library/'+e['path']);assert digest(b)==h and e['license']=='CC0-1.0' and e['approval']=='research-only'
            assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==e['pin']['blob']
            banks.append(dict(id=e['id'],instrument=e['instrument'],midi=e['expectedMidi'],measured=e['measuredMidi'],offset=0,hash=h,bytes=b))
    return banks

def render(dyn,hist,out):
    s=score();validate(s);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    bank=load_sources(dyn,hist);frame=lambda tick:round(tick*60*SR/(BPM*PPQ)); musical=frame(s['bars']*BAR);n=musical+SR*3
    stems={p:np.zeros((n,2),np.float32) for p in PARTS};cache={};receipts=[]
    for e in s['events']:
        part=e['part'];inst,pan,trim=PARTS[part];m=e['midi'];z=min((z for z in bank if z['instrument']==inst),key=lambda z:(abs(z['midi']-m),z['id']))
        assert abs(z['midi']-m)<=5 and abs(z['midi']-z['measured'])<=.75
        if z['id'] not in cache:
            raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r',str(SR),'-'],input=z['bytes'])
            a=np.frombuffer(raw,'<f4').astype(np.float64)[z['offset']:];assert np.isfinite(a).all()
            if inst=='folk-harp':
                onset=np.flatnonzero(abs(a)>max(abs(a))*.025)[0];a=a[max(0,onset-120):]
            cache[z['id']]=a
        a=cache[z['id']];rate=2**((m-z['measured'])/12);start=frame(e['tick']);length=frame(e['tick']+e['durationTicks'])-start
        if inst=='folk-harp':length=min(round(SR*1.65),int((len(a)-2)/rate))
        assert length>240 and (length-1)*rate<len(a)-1 and start+length<=n
        pos=np.arange(length)*rate;x=np.interp(pos,np.arange(len(a)),a);u=np.linspace(0,1,length)
        if inst=='folk-harp':env=np.minimum(1,np.minimum(np.arange(length)/96,(length-1-np.arange(length))/(.13*SR)))
        else:
            env=np.minimum(1,np.minimum(np.arange(length)/(.065*SR),(length-1-np.arange(length))/(.16*SR)))*(.79+.21*np.sin(np.pi*u))
            if inst=='violin':x=sosfilt(butter(2,4400,fs=SR,output='sos'),x)
        rms=np.sqrt(np.mean(x*x));assert rms>1e-5
        gain=min(.14/rms,.42/max(abs(x)))*e['velocity']*trim
        x=(x*env*gain).astype(np.float32);stems[part][start:start+length]+=x[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2])
        receipts.append(dict(**e,source=z['id'],sha256=z['hash'],rate=rate,startFrame=start,frames=length))
    # A restrained stereo early-reflection field, no synthesizer or electronic layer.
    for a in stems.values():
        for delay,g in ((.043,.065),(.071,.045),(.113,.025),(.173,.015)):
            d=round(delay*SR);a[d:]+=a[:-d,::-1]*g
    mix=sum(stems.values());gain=min(2.,.707945784/max(float(np.max(abs(mix))),*(float(np.max(abs(a))) for a in stems.values())))
    for a in stems.values():a*=gain
    mix=sum(stems.values());q=lambda a:np.rint(a*32767).astype('<i2');qm=q(mix)
    err=int(np.max(abs(sum(q(a).astype(np.int32) for a in stems.values())-qm.astype(np.int32))));assert err<=4
    metrics=[]
    for name,a in [('the-last-pilgrim',mix),*[(f'the-last-pilgrim-{p}',a) for p,a in stems.items()]]:
        f=out/(name+'.wav');assert np.isfinite(a).all() and 0<np.max(abs(a))<1
        with wave.open(str(f),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(q(a).tobytes())
        metrics.append(dict(file=f.name,sha256=digest(f.read_bytes()),peak=float(np.max(abs(a))),rms=float(np.sqrt(np.mean(a*a))),frames=n))
    (out/'score.json').write_text(json.dumps(s,indent=2)+'\n');(out/'metrics.json').write_text(json.dumps(dict(approval='research-only',sourceMode='verified-recorded-notes',intervalCoverage=0,score=s,receipts=receipts,pcmError=err,metrics=metrics,masterGain=gain),indent=2)+'\n')
    print('score events',len(receipts),'sources',len(cache),'seconds',n/SR,'PCM error',err,'peak',metrics[0]['peak'])
if __name__=='__main__':
    validate(score())
    if len(sys.argv)>1 and sys.argv[1]!='--self-test':render(*sys.argv[1:])
