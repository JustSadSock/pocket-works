"""Pinned CC0 foundation-source expansion for The Weight of a Crown."""
import hashlib,json,math,pathlib,sys,time,urllib.parse,urllib.request,wave,io
import numpy as np
from scipy.signal import find_peaks
HF_REV='3a12d6961bb4e1c3111c68cf1624c45bb49c97dd'
VCSL_REV='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e'
HF='https://huggingface.co/AEmotionStudio/stringstudio-double-bass-samples/resolve/'+HF_REV+'/'
VCSL='https://raw.githubusercontent.com/sgossner/VCSL/'+VCSL_REV+'/'
BASS={
28:('063a9e7c69a1e5278ea759084deda7778c2387c3905120e7e494dea24ce79694','c65b2b2c274cf651e10d4fead9e797a256497fab9ec6865d5a4edbf5c5e4c3f3'),
30:('5fe815e7b3a6d20b1d1ebe13ad704f12b238ccf1435d2cbb509aafb1f1259209','9b96da68bbb12851492f66c280acacbcf7823262681fe6a4c88f51424236bfe2'),
33:('1a8ee12010a8e52fc026be4d0c7e8dbd4d47a6a9b401a94fad82dce8c5156490','0bd452c3632c7b4e7c332567c345501b9979d355f068abe8bd21da6a6f8411d5'),
37:('56843063c0f2322b0e8c1da1752c9853363ade01265ee37c9b006e56125c5cce','07b43406889cf4933d67c9b0bea8b434f3a3ea4d187b6aee3791b3d6da8f42e7'),
40:('df4e24fb6d4031d77f1c0643137064ecd519d7aa5c96bdadf810dff8fc4845cf','53c9c3774c170c20d62683a637cb9731275bcf43505d6002173ab439ecbda724'),
44:('6039d55dcc7abc73e858e99cffbd841b73cc842dd6f2cc4fa276103e8cb3bbea','5624db4a958778878df2edea1af89db32ab6d9887e4a755ab620526ad18f00cb'),
47:('00535988646d5ae11847c014197650d22590a71f6d63b6532f0172fa4ec03e80','311c97a22c0b014b124729a8f7a8fb0c86dc35afd9cd4227c1a9d1626f88b442')}
PERC=[
 ('bass-drum','hit',.65,'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v5_rr1_Sum.wav'),
 ('bass-drum','hit',.65,'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v5_rr2_Sum.wav'),
 ('bass-drum','hit',.95,'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v7_rr1_Sum.wav'),
 ('bass-drum','hit',.95,'Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v7_rr2_Sum.wav'),
 ('timpani','hit',.65,'Membranophones/Struck Membranophones/Timpani 1/Hit/Timpani1_Hit_v4_rr1_Sum.wav'),
 ('timpani','hit',.65,'Membranophones/Struck Membranophones/Timpani 1/Hit/Timpani1_Hit_v4_rr2_Sum.wav'),
 ('timpani','roll',.65,'Membranophones/Struck Membranophones/Timpani 1/Roll/Timpani1_Roll_v3_rr1_Sum.wav'),
 ('timpani','roll',.95,'Membranophones/Struck Membranophones/Timpani 1/Roll/Timpani1_Roll_v5_rr1_Sum.wav')]
def get(url):
    last=None
    for attempt in range(4):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'PocketWorks-SoundForge/1.0'})
            with urllib.request.urlopen(req,timeout=45) as r:
                b=r.read()
                if r.status!=200:raise ValueError('HTTP '+str(r.status))
                return b
        except Exception as e:
            last=e;time.sleep(1+attempt*2)
    raise RuntimeError('download failed: '+url+' '+str(last))
def wav_info(b):
    with wave.open(io.BytesIO(b),'rb') as w:
        x=(w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())
        if x[0] not in (44100,48000) or x[1] not in (1,2) or x[2] not in (2,3,4) or x[3]<1000:raise ValueError('invalid source WAV '+str(x))
        return dict(sampleRate=x[0],channels=x[1],sampleWidth=x[2],frames=x[3],seconds=round(x[3]/x[0],4))
def measure_midi(b,expected):
    with wave.open(io.BytesIO(b),'rb') as w:
        rate=w.getframerate();channels=w.getnchannels();width=w.getsampwidth();raw=w.readframes(w.getnframes())
    if width!=2:raise ValueError('double bass source must be PCM16')
    x=np.frombuffer(raw,dtype='<i2').astype(np.float64)
    if channels>1:x=x.reshape(-1,channels).mean(axis=1)
    x/=32768
    lo=int(rate*.20);hi=min(len(x),int(rate*2.20));x=x[lo:hi]
    if len(x)<rate:raise ValueError('short double bass sample')
    x=x-np.mean(x);x*=np.hanning(len(x))
    nfft=1
    while nfft<len(x):nfft*=2
    spec=np.abs(np.fft.rfft(x,n=nfft*2))
    freqs=np.fft.rfftfreq(nfft*2,1/rate)
    target=440*2**((expected-69)/12);mask=(freqs>=target*.78)&(freqs<=target*1.22)
    if not np.any(mask):raise ValueError('pitch search range empty')
    ids=np.flatnonzero(mask);peak=ids[int(np.argmax(spec[mask]))];freq=float(freqs[peak])
    midi=69+12*math.log2(freq/440)
    return round(midi,3),round(freq,3)
def self_test():
    assert len(BASS)==7 and all(len(v)==2 for v in BASS.values())
    assert len(PERC)==8 and len({x[3] for x in PERC})==8
    assert len({h for pair in BASS.values() for h in pair})==14
    print('foundation source manifest self-test passed')
def run(out):
    out=pathlib.Path(out);obj=out/'library/objects';obj.mkdir(parents=True,exist_ok=True);entries=[];receipts=[]
    for root,hashes in BASS.items():
        for layer,digest in enumerate(hashes):
            vel=(0,63) if layer==0 else (64,127);name=f'samples/{root}_v{vel[0]}-{vel[1]}_rr1.wav'
            b=get(HF+name)
            if len(b)!=360044 or hashlib.sha256(b).hexdigest()!=digest:raise ValueError('double bass bytes/hash mismatch '+name)
            info=wav_info(b);midi,freq=measure_midi(b,root)
            if abs(midi-root)>.75:raise ValueError(f'double bass pitch rejected {name}: {midi:.3f} != {root}')
            sha=digest;eid=f'vsco-double-bass-{root}-v{layer+1}';path=f'objects/{sha}.wav';(out/'library'/path).write_bytes(b)
            e=dict(id=eid,path=path,title=f'Solo contrabass recorded root {root} velocity {vel[0]}-{vel[1]}',creator='Versilian Studios — Sam Gossner and Simon Dalzell',license='CC0-1.0',redistribution=True,provenance='VSCO 2 CE BKCtbss Solo Contrabass; pinned AEmotionStudio String Studio repack',sourceUrl='https://github.com/sgossner/VSCO-2-CE',rightsEvidence='https://huggingface.co/AEmotionStudio/stringstudio-double-bass-samples/blob/'+HF_REV+'/manifest.json (CC0-1.0; source library VSCO 2 CE)',sha256=sha,tags=['instrument','recorded','double-bass','sustain','research-only'],approval='research-only',pin=dict(revision=HF_REV,blob='huggingface-xet-sha256:'+sha,bytes=len(b)),instrument='double-bass',articulation='sustain',expectedMidi=root,measuredMidi=midi,velocity=(vel[0]+vel[1])/254,recipe=dict(instrument='double-bass',articulation='sustain',velocity=(vel[0]+vel[1])/254,variant=1,midi=root,lowVelocity=vel[0],highVelocity=vel[1]))
            entries.append(e);receipts.append(dict(id=eid,sha256=sha,bytes=len(b),**info,expectedMidi=root,measuredMidi=midi,fundamentalHz=freq,velocity=vel))
    for inst,art,velocity,path in PERC:
        encoded=urllib.parse.quote(path,safe='/')
        url=VCSL+encoded;b=get(url);info=wav_info(b);sha=hashlib.sha256(b).hexdigest();eid=f'vcsl-{inst}-{art}-{len([e for e in entries if e["instrument"]==inst and e["articulation"]==art])+1}'
        target=f'objects/{sha}.wav';(out/'library'/target).write_bytes(b)
        e=dict(id=eid,path=target,title=f'VCSL {inst} {art} take',creator='VCSL contributors; Versilian Studios',license='CC0-1.0',redistribution=True,provenance='Pinned VCSL original recording; '+path,sourceUrl='https://github.com/sgossner/VCSL/tree/'+VCSL_REV,rightsEvidence='https://github.com/sgossner/VCSL/blob/'+VCSL_REV+'/LICENSE (CC0-1.0)',sha256=sha,tags=['instrument','recorded','percussion',inst,art,'research-only'],approval='research-only',pin=dict(revision=VCSL_REV,path=path,sha256=sha,bytes=len(b)),instrument=inst,articulation=art,expectedMidi=None,measuredMidi=None,velocity=velocity,recipe=dict(instrument=inst,articulation=art,velocity=velocity,variant=len([e for e in entries if e['instrument']==inst and e['articulation']==art])+1,midi=None))
        entries.append(e);receipts.append(dict(id=eid,sha256=sha,bytes=len(b),sourceUrl=url,**info,velocity=velocity))
    index=dict(approval='research-only',entries=entries);(out/'library/index.json').write_text(json.dumps(index,indent=2)+'\n')
    report=dict(approval='research-only',sources=len(entries),doubleBassZones=sum(e['instrument']=='double-bass' for e in entries),percussionZones=sum(e['instrument']!='double-bass' for e in entries),doubleBassCoverage=sorted(BASS),sourceRevisions=dict(doubleBass=HF_REV,vcsl=VCSL_REV),receipts=receipts)
    (out/'metrics.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='receipts'},indent=2))
if __name__=='__main__':
    if len(sys.argv)==2 and sys.argv[1]=='--self-test':self_test()
    elif len(sys.argv)==2:run(sys.argv[1])
    else:raise SystemExit('usage: recorded-foundation-expansion.py --self-test | OUTPUT')
