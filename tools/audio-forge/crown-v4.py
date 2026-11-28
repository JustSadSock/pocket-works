"""Stage II: original oath and price, using the v3 recorded renderer."""
import importlib.util,json,pathlib,sys,time,resource,wave,subprocess,hashlib,zipfile
import numpy as np
from scipy.signal import welch
spec=importlib.util.spec_from_file_location('recorded_renderer',pathlib.Path(__file__).with_name('crown-coherent.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
# Explicit original phrase bars: MIDI pitch, eighth-note length. Rest = 0.
LINES='52:4 0:2 53:1 0:3|55:3 0:3 59:2 0:2|57:4 0:2 53:2 0:2|52:5 0:5|52:3 53:1 55:2 59:3 0:1|57:4 55:2 53:3 0:1|55:3 57:1 60:2 55:3 0:1|57:4 55:1 52:3 0:2|55:2 59:2 57:2 55:3 0:1|53:4 57:2 60:3 0:1|57:3 55:1 52:2 57:3 0:1|53:2 52:5 0:3|55:2 60:3 0:1 55:2 0:2|59:2 57:2 55:2 59:3 0:1|60:2 59:1 57:2 0:1 52:3 0:1|53:3 55:1 57:2 53:3 0:1|57:2 53:2 50:2 53:3 0:1|55:4 52:2 55:2 0:2|57:3 60:1 57:2 53:3 0:1|55:2 53:1 52:5 0:2|57:4 55:1 52:3 0:2|52:2 55:2 60:4 0:2|59:4 57:1 55:3 0:2|53:4 57:2 53:2 0:2|57:2 55:2 53:4 0:2|55:2 52:2 55:2 60:2 0:2|60:2 57:2 55:1 52:3 0:2|53:2 52:5 0:3|52:3 53:1 55:2 59:3 0:1|60:2 57:2 55:1 53:3 0:2|55:3 57:1 60:2 55:3 0:1|57:2 60:2 59:1 57:3 0:2|57:2 53:2 50:2 53:3 0:1|55:2 57:1 59:3 55:3 0:1|57:3 60:1 57:2 53:3 0:1|59:2 55:2 53:1 52:4 0:1|55:3 0:1 52:3 0:3|53:3 0:1 57:3 0:3|53:4 0:6|52:5 0:5'
H='Em Em F Em Em F C Am G F Am Em C G Am F Dm C F Em Am C G Dm F C Am Em Em F C Am Dm G F Em C F F Em'.split()
VO={'Em':(28,35,55,71),'F':(29,36,57,72),'C':(36,31,52,67),'Am':(33,40,52,69),'G':(31,38,59,67),'Dm':(38,33,53,69)}
SECTIONS=[('oath',0,4),('theme',4,12),('development',12,20),('contrast',20,28),('return',28,36),('price',36,40)]
r.BARS=40;r.LEVEL={'lead':.115,'bass':.095,'harmony':.044,'pluck':.025,'answer':.048,'pulse':.043};r.PARTS=dict(r.PARTS,bigdrum=('bass-drum','hit',0))
def score():
    es=[]
    def add(b,t,p,n,d,v,role):es.append(dict(bar=b,beat=t,part=p,midi=n,duration=d,velocity=v,role=role))
    for b,line in enumerate(LINES.split('|')):
        section=next(i for i,(_,lo,hi) in enumerate(SECTIONS) if lo<=b<hi);root,fifth,inner,upper=VO[H[b]]
        p='clarinet' if section==3 else 'cello';shift=12 if section==3 else 0
        v=[.56,.79,.82,.68,.92,.50][section];t=0;end=0
        for i,cell in enumerate(line.split()):
            n,d=map(int,cell.split(':'));d=d/2
            if n:add(b,t,p,n+shift,d,v*(1 if i==0 else .88 if i==1 else .96),'lead');end=t+d
            t+=d
        assert t==5
        add(b,0,'bass',root,2.25,[.50,.72,.79,.48,.88,.46][section],'bass')
        if section in (1,2,4):
            add(b,2.5,'bass',fifth,.5,.44,'bass');add(b,3,'bass',root if section!=2 or b%2==0 else fifth,1.5,.66,'bass')
            if b%4 in (0,2):add(b,0,'drum',None,.4,.65,'pulse');add(b,3,'drum',None,.4,.46,'pulse')
            if section==4 and b%4==0:add(b,0,'bigdrum',None,.4,.70,'pulse')
        if section in (1,2,4) and b%2==0:add(b,0,'violin',upper,2,.42,'harmony')
        if section in (2,3,4) and b%2==1:add(b,0,'harp',upper,.4,.55,'pluck');add(b,3,'harp',upper,.4,.35,'pluck')
        if section in (1,2,4) and end<=4.5 and (b%2==1 or b%4==0):add(b,end,'clarinet',upper,min(.75,5-end),.53,'answer')
        if section==3 and b%2==0:add(b,0,'cello',inner,2,.43,'harmony')
    return sorted(es,key=lambda e:(e['bar'],e['beat'],e['part']))
def validate(es):
    assert len(H)==40 and len(LINES.split('|'))==40
    for b in range(40):
        events=[e for e in es if e['bar']==b];assert any(e['role']=='lead' for e in events)
        for e in events:assert e['beat']+e['duration']<=5 and (e['midi'] is None or e['midi']%12 in (0,2,4,5,7,9,11))
        for t in np.arange(0,5,.125):
            a=[e for e in events if e['beat']<=t<e['beat']+e['duration']];assert sum(e['role']=='lead' for e in a)<=1 and len(a)<=5
            assert not(any(e['role']=='answer' for e in a) and any(e['role']=='lead' for e in a))
        for role in ('bass','lead','harmony'):
            x=[e for e in events if e['role']==role];assert all(a['beat']+a['duration']<=z['beat'] for a,z in zip(x,x[1:]))
    assert len(set(H))==6 and len({tuple(H[i:i+4]) for i in range(0,40,4)})>=8
r.score=score;r.validate=validate

def main(paths,out):
    start=time.perf_counter();out=pathlib.Path(out);r.render(paths,out)
    m=json.loads((out/'metrics.json').read_text());m.update(version='v4-oath-and-price',direction='2e9a0c89d15ca8d74e5b688cdf9b2c6e2e03e117',sections=SECTIONS,harmony=H,approximateLegato='none; recorded single notes with shaped attacks/releases; bass sustain loops if required')
    for e in m['metrics']:
        old=out/e['file'];new=out/e['file'].replace('crown-coherent','crown-v4');old.rename(new);e['file']=new.name
    def read(p):
        with wave.open(str(p),'rb') as w:return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(np.int32)
    # Keep the melody focused, spread support with shared room and different sends.
    gains={'lead':(.99,1.01,.14),'bass':(1,1,.045),'harmony':(.66,1.18,.25),'pluck':(1.20,.58,.20),'answer':(.58,1.20,.19),'pulse':(.90,1.05,.13)}
    stems={}
    for e in m['metrics'][1:]:
        role=e['file'][9:-4];a=read(out/e['file']).astype(np.float32)/32768;left,right,send=gains[role];a*=np.array([left,right],np.float32)
        raw=subprocess.check_output(['sox','-R','-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-','-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-','reverb','-w','35','60','85','100','22','0'],input=a.astype('<f4').tobytes())
        wet=np.frombuffer(raw,'<f4').reshape(a.shape);assert np.isfinite(wet).all();stems[role]=a+send*wet
    mix=sum(stems.values());g=min(1.,.88/max(float(np.max(abs(mix))),*(float(np.max(abs(a))) for a in stems.values())))
    pcm={role:np.rint(a*g*32767).astype(np.int32) for role,a in stems.items()};master=sum(pcm.values());assert np.max(abs(master))<32768
    for e in m['metrics']:
        role=e['file'][9:-4];a=master if role=='master' else pcm[role];p=out/e['file']
        with wave.open(str(p),'wb') as w:w.setparams((2,2,48000,0,'NONE','not compressed'));w.writeframes(a.astype('<i2').tobytes())
        e.update(sha256=hashlib.sha256(p.read_bytes()).hexdigest(),peak=float(np.max(abs(a))/32768),rms=float(np.sqrt(np.mean((a.astype(float)/32768)**2))))
    m['room']=dict(type='shared SoX wet-only room',roleGains=gains,parameters=[35,60,85,100,22,0]);del stems,pcm,mix,master,a,wet,raw
    x=read(out/'crown-v4-master.wav');acc=np.zeros_like(x);roles={}
    for e in m['metrics'][1:]:
        a=read(out/e['file']);acc+=a;role=e['file'][9:-4];mask=np.zeros(len(a),bool)
        for event in m['events']:
            if event['role']==role:
                t=round((event['bar']*5+event['beat'])*r.BEAT*r.SR);mask[t:t+event['frames']]=True
        roles[role]=dict(activeRms=float(np.sqrt(np.mean((a[mask].astype(float)/32768)**2))) if mask.any() else 0,activeSeconds=float(mask.sum()/r.SR))
    assert np.max(abs(acc-x))==0 and np.max(abs(x))<32768
    y=x.astype(np.float64)/32768;mono=y.mean(axis=1);f,p=welch(mono,r.SR,nperseg=8192);m.update(pcmError=0,lrCorrelation=float(np.corrcoef(y.T)[0,1]),monoLossDb=float(10*np.log10(np.mean(mono**2)/np.mean(y*y))),sub120=float(p[f<120].sum()/p.sum()),activeRoles=roles,sectionRmsDb={n:float(10*np.log10(np.mean(y[round(lo*5*r.BEAT*r.SR):round(hi*5*r.BEAT*r.SR)]**2))) for n,lo,hi in SECTIONS},wallSeconds=time.perf_counter()-start,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    used={e['sha256'] for e in m['events']};catalog=[]
    for path in paths:
        path=pathlib.Path(path);z=zipfile.ZipFile(path) if path.is_file() else None;read_source=z.read if z else lambda n:(path/n).read_bytes()
        for e in json.loads(read_source('library/index.json'))['entries']:
            if e['sha256'] in used:
                assert hashlib.sha256(read_source('library/'+e['path'])).hexdigest()==e['sha256'] and e['license']=='CC0-1.0' and e['redistribution'] is True;catalog.append(e)
        if z:z.close()
    assert {e['sha256'] for e in catalog}==used
    (out/'sources.json').write_text(json.dumps(catalog,indent=2)+'\n')
    (out/'metrics.json').write_text(json.dumps(m,indent=2)+'\n');(out/'score.json').write_text(json.dumps(dict(tempo=96,meter=[5,4],bars=40,harmony=H,sections=SECTIONS,events=score()),indent=2)+'\n')
    print({k:m[k] for k in ('sourceCount','lrCorrelation','monoLossDb','sub120','activeRoles','wallSeconds','maxRssKiB')})
if __name__=='__main__':
    if sys.argv[1:]==['--self-test']:validate(score());print(len(score()))
    else:main(sys.argv[1:4],sys.argv[4])
