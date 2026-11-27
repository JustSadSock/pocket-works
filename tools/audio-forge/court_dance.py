"""Original court dance, 6/8, recorded sources only; research audition."""
import hashlib,json,pathlib,subprocess,sys,wave,zipfile
import numpy as np
SR=48000; PPQ=24; BPM=84; BAR=72
# Six eighths per bar; D minor with a cadential C sharp.
A=[[(74,2),(76,1),(77,2),(76,1)],[(74,3),(69,3)],[(70,2),(72,1),(74,2),(72,1)],[(69,3),(0,3)],[(74,1),(76,1),(77,1),(79,2),(77,1)],[(76,2),(74,1),(72,3)],[(70,2),(72,1),(73,3)],[(74,4),(0,2)]]
B=[[(77,3),(74,3)],[(76,2),(74,1),(72,3)],[(70,1),(72,1),(74,1),(76,3)],[(77,4),(0,2)],[(79,2),(77,1),(76,2),(74,1)],[(72,3),(70,3)],[(69,2),(72,1),(73,3)],[(74,4),(0,2)]]
H=[(62,69),(62,65),(60,67),(69,64),(62,69),(60,67),(69,64),(62,69)]
G=[(65,72),(60,67),(62,69),(65,72),(67,74),(60,67),(69,64),(62,69)]
SECTIONS=[('invitation',4),('dance',8),('answer',8),('variation',8),('interlude',8),('return',12),('farewell',8)]
PARTS={'lead':('alto-recorder','sustain',-.18,.67),'answer':('recorder','sustain',.22,.28),'harp':('folk-harp','pluck',-.32,.72),'drum':('frame-drum','open',.08,.43),'muted':('frame-drum','muted',.10,.32),'tamb':('tambourine','hit-soft',.28,.23),'bass':('cello-section','arco-vib',.05,.63)}
def score():
    events=[]; sections=[];bar=0
    def add(p,m,t,d,v):events.append(dict(part=p,midi=m,tick=t,durationTicks=d,velocity=v))
    for sec,count in SECTIONS:
        sections.append(dict(id=sec,startBar=bar,bars=count))
        for j in range(count):
            k=j%8;t=bar*BAR;row=(B if sec in ('answer','interlude') else A)[k];root,fifth=(G if sec in ('answer','interlude') else H)[k]
            if sec=='return' and j>=8:row=A[4+j-8];root,fifth=H[4+j-8]
            if sec=='invitation':row=[[(0,3),(74,3)],[(76,3),(74,3)],[(70,3),(72,3)],[(73,3),(0,3)]][j]
            if sec=='farewell' and j>=4:row=[[(77,3),(76,3)],[(74,3),(72,3)],[(73,3),(0,3)],[(74,5),(0,1)]][j-4];root,fifth=[(65,72),(60,67),(69,64),(62,69)][j-4]
            v={'invitation':.50,'dance':.74,'answer':.69,'variation':.81,'interlude':.47,'return':.90,'farewell':.55}[sec]
            pos=t
            for i,(m,d) in enumerate(row):
                if m and not(sec=='interlude' and j%2==1):add('lead',min(m,77),pos,d*12,v*(1 if pos-t in (0,36) else .82))
                pos+=d*12
            if sec in ('answer','return') and j%2==1:add('answer',74 if k<4 else 72,t+36,24,v*.66)
            if sec=='interlude' and j%2==1:add('answer',76 if k<4 else 74,t,60,v*.7)
            for off,m in [(0,root),(36,fifth)]+([] if sec in ('invitation','interlude','farewell') else [(24,fifth),(60,root)]):add('harp',m,t+off,12,v*(.95 if off in (0,36) else .55))
            if sec not in ('invitation','interlude') and not(sec=='farewell' and j>=4):
                add('drum',None,t,12,v*.9);add('muted',None,t+36,12,v*.75)
                if sec in ('variation','return'):add('tamb',None,t+60,12,v*.70)
            if sec!='invitation' or j>=2:add('bass',root-12,t,60 if j%4==3 else 72,v*.73)
            bar+=1
    return dict(title='Feast of the Crown',bpm=BPM,ppq=PPQ,meter=[6,8],bars=bar,sections=sections,events=sorted(events,key=lambda e:(e['tick'],e['part'])))
def validate(s):
    assert s['bars']==56 and s['sections'][-1]['startBar']+s['sections'][-1]['bars']==56
    end={}
    for e in s['events']:
        assert e['part'] in PARTS and e['tick']%12==e['durationTicks']%12==0 and e['tick']>=end.get(e['part'],0) and e['durationTicks']>0 and 0<e['velocity']<=1
        end[e['part']]=e['tick']+e['durationTicks'];assert end[e['part']]<=56*BAR
    assert s==score()
sha=lambda b:hashlib.sha256(b).hexdigest()
def readbank(path):
    p=pathlib.Path(path);return (lambda n:(p/n).read_bytes()) if p.is_dir() else zipfile.ZipFile(p).read
def render(dyn,hist,out):
    s=score();validate(s);out=pathlib.Path(out).resolve();assert all(out!=pathlib.Path(p).resolve() and pathlib.Path(p).resolve() not in out.parents for p in (dyn,hist));out.mkdir(parents=True,exist_ok=True)
    d,h=readbank(dyn),readbank(hist);catalog=json.loads(h('library/index.json'))['entries'];assert len(catalog)==46
    z=json.loads(d('metrics.json'));assert z['approval']=='research-only' and len(z['zones'])==39
    dc={e['id']:e for e in json.loads(d('library/index.json'))['entries']};bank=[]
    for e in catalog:
        if (e['instrument'],e['articulation']) not in [x[:2] for x in PARTS.values()]:continue
        bank.append((e,h('library/'+e['path']),e['expectedMidi'],e['measuredMidi'],0))
    for x in z['zones']:
        if x['instrument']=='cello-section' and x['velocity']==.35:
            e=dc[x['id']];bank.append((dict(e,instrument=x['instrument'],articulation=x['articulation']),d('library/objects/'+x['sourceSha256']+'.wav'),x['expectedMidi'],x['measuredMidi'],x['offsetFrames']))
    for e,b,m,meas,offset in bank:
        assert e['license']=='CC0-1.0' and e['approval']=='research-only' and sha(b)==e['sha256'] and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==e['pin']['blob'] and (m is None or abs(m-meas)<=.75)
    f=lambda t:round(t*60*SR/(BPM*PPQ));n=f(56*BAR)+3*SR;mix=np.zeros((n,2),np.float32);cache={};receipts=[];rr={};stems={}
    for part,(inst,art,pan,trim) in PARTS.items():
        a=np.zeros(n,np.float32);pool=[x for x in bank if (x[0]['instrument'],x[0]['articulation'])==(inst,art)];assert pool
        for ev in [e for e in s['events'] if e['part']==part]:
            m=ev['midi'];idx=rr.get(part,0);rr[part]=idx+1
            e,b,root,meas,offset=pool[idx%len(pool)] if m is None else min(pool,key=lambda x:(abs(x[2]-m),x[0]['id']))
            assert m is None or abs(root-m)<=5
            if e['id'] not in cache:
                raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-'],input=b)
                src=np.frombuffer(raw,'<f4').astype(float)[offset:];assert np.isfinite(src).all() and len(src)>240
                if not offset:
                    at=np.flatnonzero(abs(src)>max(abs(src))*.035)[0];src=src[max(0,at-120):]
                cache[e['id']]=src
            src=cache[e['id']];rate=1 if m is None else 2**((m-meas)/12);start=f(ev['tick']);dur=f(ev['tick']+ev['durationTicks'])-start
            finite=inst in ('folk-harp','frame-drum','tambourine');length=min(int((len(src)-2)/rate),int(SR*1.25)) if finite else dur
            assert length>240 and (length-1)*rate<len(src)-1 and start+length<=n
            x=np.interp(np.arange(length)*rate,np.arange(len(src)),src);u=np.linspace(0,1,length);attack=96 if finite else 720;release=min(length//3,2400 if finite else 2200)
            env=np.minimum(1,np.minimum(np.arange(length)/attack,(length-1-np.arange(length))/release))
            if not finite:env*=.85+.15*np.sin(np.pi*u)
            gain=min(.12/max(np.sqrt(np.mean(x*x)),1e-9),.4/max(abs(x)))*ev['velocity']*trim
            a[start:start+length]+=(x*env*gain).astype(np.float32);receipts.append(dict(**ev,source=e['id'],sha256=e['sha256'],rate=rate,frames=length))
        stereo=a[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2]).astype(np.float32)
        for delay,g in ((.043,.06),(.071,.04),(.113,.025)):
            q=round(delay*SR);stereo[q:]+=stereo[:-q,::-1]*g
        stems[part]=stereo;mix+=stereo
    gain=min(2.,.707945784/max(float(np.max(abs(mix))),*(float(np.max(abs(a))) for a in stems.values())));metrics=[]
    def write(name,a):
        a=a*gain;assert np.isfinite(a).all() and 0<np.max(abs(a))<1;p=out/(name+'.wav')
        with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(np.rint(a*32767).astype('<i2').tobytes())
        metrics.append(dict(file=p.name,sha256=sha(p.read_bytes()),frames=n,peak=float(np.max(abs(a))),rms=float(np.sqrt(np.mean(a*a)))))
    write('feast-of-the-crown',mix)
    for p,a in stems.items():write('feast-of-the-crown-'+p,a)
    (out/'score.json').write_text(json.dumps(s,indent=2)+'\n');(out/'metrics.json').write_text(json.dumps(dict(approval='research-only',score=s,receipts=receipts,metrics=metrics,recordedIntervalCoverage=0),indent=2)+'\n');print(len(receipts),len(cache),n/SR,metrics[0])
if __name__=='__main__':
    validate(score())
    if len(sys.argv)>1 and sys.argv[1]!='--self-test':render(*sys.argv[1:])
