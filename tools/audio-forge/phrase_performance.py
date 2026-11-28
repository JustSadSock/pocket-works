"""Research audition: phrase-aware joins, recorded dynamic layers, unchanged score."""
import hashlib, io, json, pathlib, subprocess, sys, wave, zipfile
import numpy as np
SR=48000; PARTS=('cello','bass','clarinet','harp','horn','violin'); PREFIX='the-last-pilgrim'
PIN='5f2f55f588674c9be6b670e008c2574ef0f8412352ad581667d65c614e3f7e3a'
sha=lambda b:hashlib.sha256(b).hexdigest()
def readbank(path):
    p=pathlib.Path(path);return (lambda n:(p/n).read_bytes()) if p.is_dir() else zipfile.ZipFile(p).read

def main(dynamics,original,out):
    d=readbank(dynamics);o=readbank(original);out=pathlib.Path(out).resolve();out.mkdir(parents=True,exist_ok=True)
    if any(pathlib.Path(x).resolve()==out or pathlib.Path(x).resolve() in out.parents for x in (dynamics,original)):raise ValueError('unsafe output')
    m=json.loads(o('metrics.json'));s=json.loads(o('score.json'));assert s==m['score'] and m['approval']=='research-only'
    metrics={x['file']:x for x in m['metrics']};assert metrics[PREFIX+'.wav']['sha256']==PIN
    def pcm(name):
        b=o(name);assert sha(b)==metrics[name]['sha256']
        with wave.open(io.BytesIO(b),'rb') as w:
            assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(SR,2,2)
            return np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(np.float32)/32767
    ref=pcm(PREFIX+'.wav');n=len(ref);bank=json.loads(d('metrics.json'));assert bank['approval']=='research-only' and len(bank['zones'])==39
    cat={x['id']:x for x in json.loads(d('library/index.json'))['entries']};cache={}
    def source(z):
        if z['id'] not in cache:
            h=z['sourceSha256'];b=d('library/objects/'+h+'.wav');c=cat[z['id']]
            assert sha(b)==h==c['sha256'] and c['license']=='CC0-1.0' and c['approval']=='research-only'
            assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==c['pin']['blob']
            raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r',str(SR),'-'],input=b)
            cache[z['id']]=np.frombuffer(raw,'<f4').astype(float)[z['offsetFrames']:]
        return cache[z['id']]
    frame=lambda t:round(t*60*SR/(s['bpm']*s['ppq']));bar=s['ppq']*s['meter'][0]
    settings={'cello':('cello-section',-.18,.95),'bass':('cello-section',.12,.52),'clarinet':('clarinet',.23,.57),'horn':('horn',.10,.43)}
    mix=np.zeros_like(ref); receipts=[];joins=[];files=[];stems={}
    def rms(x):return float(np.sqrt(np.mean(x*x,dtype=np.float64)))
    for part in PARTS:
        old=pcm(PREFIX+'-'+part+'.wav')
        if part not in settings:mix+=old;continue
        inst,pan,trim=settings[part];ev=[e for e in s['events'] if e['part']==part];a=np.zeros(n,np.float32);previous=None
        for i,e in enumerate(ev):
            start=frame(e['tick']);end=frame(e['tick']+e['durationTicks']);length=end-start
            climax=32*bar<=e['tick']<44*bar
            # Select a real forte take for stronger climax, not a louder copy of piano.
            velocity=.85 if climax and part in ('cello','bass','horn') else .35
            z=min((z for z in bank['zones'] if z['instrument']==inst and z['velocity']==velocity),key=lambda z:(abs(z['expectedMidi']-e['midi']),z['id']))
            assert abs(z['expectedMidi']-e['midi'])<=5 and abs(z['expectedMidi']-z['measuredMidi'])<=.75
            src=source(z);rate=2**((e['midi']-z['measuredMidi'])/12)
            connected=previous is not None and previous['end']==start and e['role']=='melody' and previous['role']=='melody' and e['tick']%(4*bar)!=0
            following=i+1<len(ev) and e['tick']+e['durationTicks']==ev[i+1]['tick'] and e['role']==ev[i+1]['role']=='melody' and ev[i+1]['tick']%(4*bar)!=0
            fade=min(round(.075*SR),length//4); offset=round(.12*SR*rate) if connected else 0; extra=round(.075*SR) if following else 0
            pos=offset+np.arange(length+extra)*rate
            if pos[-1]>=len(src)-1:raise ValueError('recorded source exhausted')
            x=np.interp(pos,np.arange(len(src)),src);u=np.minimum(np.arange(len(x))/max(1,length-1),1)
            # Shared phrase envelope spans four bars; inner notes do not fade to zero.
            phase=((e['tick']%(4*bar))+u*e['durationTicks'])/(4*bar)
            contour=.76+.24*np.sin(np.pi*phase);g=min(.14/max(rms(x[:length]),1e-12),.42/max(abs(x)))*e['velocity']*trim
            if climax:g*=1.24 if part=='cello' else 1.12
            x*=contour*g
            if connected:
                w=.5-.5*np.cos(np.linspace(0,np.pi,fade));tail=previous['tail'][:fade];x[:fade]=tail*(1-w)+x[:fade]*w
            else:x[:min(length,3120)]*=np.linspace(0,1,min(length,3120))
            if not following:
                release=min(length//3,round(.16*SR));x[length-release:length]*=np.linspace(1,0,release)
            a[start:end]=x[:length];previous=dict(end=end,tail=x[length:],role=e['role'])
            if connected:
                span=round(.04*SR);left=a[start-span:start];right=a[start:start+span];ratio=min(rms(left),rms(right))/max(rms(left),rms(right),1e-12)
                joins.append(dict(part=part,frame=start,energyRatio=ratio,step=float(abs(a[start]-a[start-1])),mode='recorded-note-crossfade'))
            receipts.append(dict(part=part,midi=e['midi'],frame=start,source=z['id'],sha256=z['sourceSha256'],layer=velocity,connected=connected))
        stereo=a[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2]).astype(np.float32)
        for delay,g in ((.043,.065),(.071,.045),(.113,.025),(.173,.015)):
            k=round(delay*SR);stereo[k:]+=stereo[:-k,::-1]*g
        if part=='cello':stems['old']=old;stems['new']=stereo
        mix+=stereo
    # Same overall RMS unless the common ceiling requires attenuation of both comparators.
    gain=rms(ref)/rms(mix);mix*=gain;common=min(1.,.891250938/max(float(np.max(abs(ref))),float(np.max(abs(mix)))))
    def write(name,a):
        a=a*common;assert np.isfinite(a).all() and 0<np.max(abs(a))<1
        p=out/(name+'.wav')
        with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(np.rint(a*32767).astype('<i2').tobytes())
        files.append(dict(file=p.name,sha256=sha(p.read_bytes()),frames=len(a),rms=rms(a),peak=float(np.max(abs(a)))))
    write('the-last-pilgrim-phrase-edition',mix)
    lo=frame(32*bar);hi=frame(40*bar);gap=np.zeros((SR,2),np.float32)
    clips=[ref[lo:hi],mix[lo:hi]];level=min(map(rms,clips));write('climax-phrase-AB',np.concatenate((clips[0]*level/rms(clips[0]),gap,clips[1]*level/rms(clips[1]))))
    lo=frame(4*bar);hi=frame(12*bar);clips=[stems[k][lo:hi] for k in ('old','new')];level=min(map(rms,clips));write('cello-phrase-AB',np.concatenate((clips[0]*level/rms(clips[0]),gap,clips[1]*level/rms(clips[1]))))
    assert len(joins)>30 and max(j['step'] for j in joins)<.15 and any(r['layer']==.85 for r in receipts)
    assert abs(rms(ref)-rms(mix))<1e-5
    (out/'metrics.json').write_text(json.dumps(dict(approval='research-only',originalSha256=PIN,scoreUnchanged=True,recordedInstrumentIntervalCoverage=0,joins=joins,receipts=receipts,commonGain=common,files=files),indent=2)+'\n')
    print('joins',len(joins),'forte',sum(r['layer']==.85 for r in receipts),'min join ratio',min(j['energyRatio'] for j in joins),'peak',files[0]['peak'])
if __name__=='__main__':main(*sys.argv[1:])
