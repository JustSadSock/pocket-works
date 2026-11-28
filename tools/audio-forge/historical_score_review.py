"""Non-destructive orchestration experiments and objective score diagnostics."""
import hashlib, io, json, pathlib, sys, wave, zipfile
import numpy as np
from scipy.signal import butter, sosfilt
SR=48000
PARTS=('cello','bass','clarinet','harp','horn','violin')
PREFIX='the-last-pilgrim'
EXPECTED='5f2f55f588674c9be6b670e008c2574ef0f8412352ad581667d65c614e3f7e3a'
sha=lambda b:hashlib.sha256(b).hexdigest()
def analyze(base,out):
    base=pathlib.Path(base).resolve();out=pathlib.Path(out).resolve()
    if base==out or base.is_dir() and (base in out.parents or out in base.parents):raise ValueError('unsafe output')
    out.mkdir(parents=True,exist_ok=True)
    def read(name):
        if base.is_dir():return (base/name).read_bytes()
        with zipfile.ZipFile(base) as z:return z.read(name)
    manifest=json.loads(read('metrics.json'));score=json.loads(read('score.json'))
    if manifest['approval']!='research-only' or score!=manifest['score']:raise ValueError('score identity')
    records={m['file']:m for m in manifest['metrics']}
    if records[PREFIX+'.wav']['sha256']!=EXPECTED:raise ValueError('original master changed')
    def pcm(name):
        b=read(name)
        if sha(b)!=records[name]['sha256']:raise ValueError('WAV identity')
        with wave.open(io.BytesIO(b),'rb') as w:
            if (w.getframerate(),w.getnchannels(),w.getsampwidth())!=(SR,2,2):raise ValueError('WAV format')
            return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(np.float32)/32767
    master=pcm(PREFIX+'.wav');stems={p:pcm(PREFIX+'-'+p+'.wav') for p in PARTS}
    if max(abs(sum(stems.values())-master).ravel())>4.1/32767:raise ValueError('stem reconstruction')
    n=len(master);t=np.arange(n,dtype=np.float32)/SR
    barsec=60/score['bpm']*score['meter'][0];secs=score['sections'];ppq=score['ppq'];barticks=ppq*score['meter'][0]
    rms=lambda x:float(np.sqrt(np.mean(x*x,dtype=np.float64)))
    def db(x):return float(20*np.log10(max(x,1e-12)))
    def section_report(a):
        rows=[]
        for s in secs:
            lo=round(s['startBar']*barsec*SR);hi=round((s['startBar']+s['bars'])*barsec*SR)
            es=[e for e in score['events'] if s['startBar']*barticks<=e['tick']<(s['startBar']+s['bars'])*barticks]
            rows.append(dict(section=s['id'],start=lo/SR,end=hi/SR,rmsDb=db(rms(a[lo:hi])),events=len(es),notesPerBar=len(es)/s['bars'],melodyPitches=[e['midi'] for e in es if e['role']=='melody'],activeParts=sorted({e['part'] for e in es})))
        return rows
    def band(a):
        lo=round(next(s['startBar'] for s in secs if s['id']=='climax')*barsec*SR); x=a[lo:lo+12*SR].mean(axis=1)
        f=np.fft.rfftfreq(len(x),1/SR);power=abs(np.fft.rfft(x*np.hanning(len(x))))**2
        return float(power[(f>=2500)&(f<6500)].sum()/max(power.sum(),1e-15))
    reports={'original':dict(sections=section_report(master),rmsDb=db(rms(master)),peak=float(np.max(abs(master))),upperMidEnergyRatio=band(master))}
    settings={'warm-chamber':{'cello':0,'bass':1,'clarinet':2,'harp':-3,'horn':-2,'violin':-7},'dynamic-arc':{'cello':0,'bass':0,'clarinet':1,'harp':-2,'horn':0,'violin':-5}}
    arc=[-3,-1,0,-2,2,-4]; target=rms(master); outputs=[]
    for name,trims in settings.items():
        a=np.zeros_like(master)
        for p,x in stems.items():
            g=10**(trims[p]/20)
            if p=='violin':x=sosfilt(butter(2,3500,fs=SR,output='sos'),x,axis=0).astype(np.float32)
            a+=x*g
        if name=='dynamic-arc':
            mids=[(s['startBar']+s['bars']/2)*barsec for s in secs]
            env=np.interp(t,[0,*mids,n/SR],[arc[0],*arc,arc[-1]]).astype(np.float32)
            a*=np.power(10,env/20)[:,None]
        g=target/rms(a);a*=g
        reports[name]=dict(sections=section_report(a),rmsDb=db(rms(a)),peak=float(np.max(abs(a))),upperMidEnergyRatio=band(a),trimsDb=trims,matchGain=g)
        outputs.append((name,a))
    common=min(1.,.891250938/max(float(np.max(abs(a))) for _,a in [('original',master),*outputs]))
    files=[]
    def write(name,a):
        a=a*common
        if not np.isfinite(a).all() or np.max(abs(a))>=1:raise ValueError('invalid render')
        p=out/(name+'.wav')
        with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(np.rint(a*32767).astype('<i2').tobytes())
        files.append(dict(file=p.name,sha256=sha(p.read_bytes()),frames=len(a),rmsDb=db(rms(a)),peak=float(np.max(abs(a)))))
    for name,a in outputs:write(name,a)
    lo=round(108*SR);hi=round(136*SR);gap=np.zeros((SR,2),np.float32); clips=[master[lo:hi],*(a[lo:hi] for _,a in outputs)];level=min(map(rms,clips))
    write('climax-ABC',np.concatenate([v for i,a in enumerate(clips) for v in ([gap] if i else [])+[a*(level/rms(a))]]))
    offgrid=[e for e in score['events'] if e['tick']%(ppq//2) or e['durationTicks']%(ppq//2)]
    final=[e for e in score['events'] if e['role']=='melody'][-1]
    report=dict(approval='research-only',originalSha256=EXPECTED,commonGain=common,offgridCount=len(offgrid),finalMelodyMidi=final['midi'],eventCount=len(score['events']),variants=reports,files=files,comparison=dict(order=['original','warm-chamber','dynamic-arc'],starts=[0,29,58],excerpt=[108,136],levelMatched=True))
    if offgrid:raise ValueError('off-grid score')
    if max(abs(v['rmsDb']-reports['original']['rmsDb']) for v in reports.values())>.01:raise ValueError('RMS match')
    (out/'review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('score review',len(score['events']),'events',len(offgrid),'off-grid',[(k,round(v['rmsDb'],2),round(v['upperMidEnergyRatio'],5)) for k,v in reports.items()])
if __name__=='__main__':analyze(*sys.argv[1:])
