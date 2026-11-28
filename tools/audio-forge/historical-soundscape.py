"""Historical vertical slice: original procedural SFX plus qualified recorded body/rain."""
import hashlib,io,json,pathlib,subprocess,sys,time,resource,wave,zipfile
import numpy as np
from scipy.signal import butter,sosfilt
SR=48000;SEED=91473
sha=lambda b:hashlib.sha256(b).hexdigest()
def bank(path):
    p=pathlib.Path(path);z=zipfile.ZipFile(p) if p.is_file() else None
    return (z.read if z else lambda n:(p/n).read_bytes()),z

def decode(b,fmt):
    raw=subprocess.check_output(['sox','-R','-t',fmt,'-','-t','raw','-e','floating-point','-b','32','-L','-c','2','-r',str(SR),'-'],input=b);a=np.frombuffer(raw,'<f4').reshape(-1,2).copy();assert np.isfinite(a).all();return a

def norm(a):return a/max(float(np.max(abs(a))),1e-8)
def filter_noise(x,lo,hi):return sosfilt(butter(2,[lo,hi],btype='bandpass',fs=SR,output='sos'),x)
def pcm(a):return np.rint(a*32767).astype('<i2')
def save(path,a):
    assert np.isfinite(a).all() and np.max(abs(a))<1
    with wave.open(str(path),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(pcm(a).tobytes())
    return dict(file=path.name,sha256=sha(path.read_bytes()),frames=len(a),peak=float(np.max(abs(a))),rms=float(np.sqrt(np.mean(a*a))))
def fade(a,n):
    a[:n]*=np.linspace(0,1,n)[:,None];a[-n:]*=np.linspace(1,0,n)[:,None];return a

def render(field,foundation,music,out):
    start=time.perf_counter();out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);(out/'variants').mkdir(exist_ok=True)
    rd,z=bank(field);manifest=json.loads(rd('manifest.json'));rain=next(e for e in manifest['samples'] if e['id']=='stockholm-rain');b=rd(rain['path']);assert sha(b)==rain['sha256'] and rain['license']=='public-domain' and rain['redistribution'] is True;rain_audio=decode(b,'ogg');z and z.close()
    rd,z=bank(foundation);idx=json.loads(rd('library/index.json'));drums=[];used=[rain]
    for e in idx['entries']:
        if e['instrument']=='bass-drum' and e['articulation']=='hit':
            b=rd('library/'+e['path']);assert sha(b)==e['sha256'] and e['license']=='CC0-1.0' and e['redistribution'] is True;drums.append((e,decode(b,'wav').mean(axis=1)));used.append(e)
    z and z.close();assert len(drums)>=4
    rng=np.random.default_rng(SEED);variants={};records=[]
    for family in ('blade','shield','footstep'):
        for i in range(6):
            strong=i>=3;seed=int(rng.integers(0,2**31));q=np.random.default_rng(seed);t=np.arange(round(SR*(.95 if family=='blade' else .65 if family=='shield' else .48)))/SR
            n=q.normal(size=len(t));attack=filter_noise(n,1700 if family=='blade' else 700,10000 if family=='blade' else 6000)*np.exp(-t/(.012 if family!='footstep' else .035));body=np.zeros_like(t);res=np.zeros_like(t);src=None
            if family=='blade':
                for f,d in zip([870,1297,2111,3180,4620],[.13,.22,.12,.08,.045]):res+=np.sin(2*np.pi*f*q.uniform(.90,1.10)*t+q.uniform(0,6.28))*np.exp(-t/d)*q.uniform(.07,.17)
                body=filter_noise(n,550,2400)*np.exp(-t/.065)*.22;context='heavy steel' if strong else 'glancing steel'
            elif family=='shield':
                for f,d in zip([110,185,310,590] if not strong else [180,340,720,1550],[.10,.085,.055,.04]):res+=np.sin(2*np.pi*f*q.uniform(.91,1.09)*t)*np.exp(-t/d)*.18
                src,x=drums[i%len(drums)];body[:min(len(x),len(t))]=norm(x[:len(t)])[:len(t)]*.34;body*=np.exp(-t/.14);context='metal boss' if strong else 'wood face'
            else:
                body=filter_noise(n,90 if strong else 45,1100 if strong else 480)*np.exp(-t/.075)*.85
                for delay in (.06,.115,.17):
                    k=round(delay*SR);body[k:]+=filter_noise(q.normal(size=len(t)-k),300,3200 if strong else 900)*np.exp(-t[:len(t)-k]/.025)*q.uniform(.10,.26)
                res=np.sin(2*np.pi*q.uniform(65,100)*t)*np.exp(-t/.045)*.12;context='gravel' if strong else 'earth'
            mono=norm(.35*attack+body+res)*(.66 if strong else .42);a=np.column_stack((mono,mono));a=fade(a,min(240,len(a)//8));p=out/'variants'/f'{family}-{i+1:02}.wav';m=save(p,a);m.update(family=family,context=context,seed=seed,layers=['attack','body','resonance','decay'],recordedBody=src['sha256'] if src else None);records.append(m);variants.setdefault(family,[]).append(a)
    assert len({m['sha256'] for m in records})==18
    N=40*SR;F=SR*2;u=np.linspace(0,1,F)[:,None];raw=rain_audio.copy()
    while len(raw)<N+F:
        raw[-F:]=raw[-F:]*(1-u)+rain_audio[:F]*u;raw=np.concatenate((raw,rain_audio[F:]))
    raw=raw[:N+F];raw[:F]=raw[N:N+F]*(1-u)+raw[:F]*u;rain_loop=raw[:N]
    noise=rng.normal(size=N);f=np.fft.rfftfreq(N,1/SR);spec=np.fft.rfft(noise);spec*=np.minimum(f/60,1)/(1+(f/900)**2);wind=np.fft.irfft(spec,N);wind=norm(wind);phase=np.arange(N)/N;wind*=.7+.3*np.sin(2*np.pi*phase)**2
    amb=norm(rain_loop)*.14+np.column_stack((wind,np.roll(wind,211)))*.045;amb=amb.astype(np.float32);amb_meta=save(out/'rain-at-the-gate-loop.wav',amb);amb_meta.update(seam=float(np.max(abs(amb[-1]-amb[0]))),derivativeP99=float(np.quantile(abs(np.diff(amb,axis=0)),.99)));assert amb_meta['seam']<=amb_meta['derivativeP99']
    # Fixed 60s scene. Offline audition uses the same distance, pan and bounded-voice concepts;
    # browser integration separately exercises existing JS runtime APIs.
    N=60*SR;bg=np.tile(amb,(2,1))[:N]*.72;near=np.zeros((N,2),np.float32);far=np.zeros_like(near);duck=np.ones(N,np.float32);events=[];active=[];cache={};peakvoices=0;drops=0;hits=0;bags={k:[] for k in variants};last={}
    def pick(k):
        nonlocal hits
        if not bags[k]:
            bags[k]=list(rng.permutation(6));
            if len(bags[k])>1 and bags[k][0]==last.get(k):bags[k][0],bags[k][1]=bags[k][1],bags[k][0]
        i=int(bags[k].pop(0));last[k]=i;key=(k,i)
        if key in cache:hits+=1
        else:
            if len(cache)>=8:cache.pop(next(iter(cache)))
            cache[key]=variants[k][i]
        return i,cache[key]
    timeline=[]
    for t in np.arange(3,18,.65):timeline.append((float(t),'footstep',2.5+float(t)/8,-.4))
    for t in np.arange(19,42,.78):timeline.append((float(t),'blade' if int(t*10)%3 else 'shield',3.5 if int(t)%3 else 23.,float(rng.uniform(-.8,.8))))
    for t in np.arange(20,44,1.3):timeline.append((float(t),'shield',16.,float(rng.uniform(-.8,.8))))
    for t in np.arange(45,55,.95):timeline.append((float(t),'footstep',7+float(t-45)*2,.5))
    for j in range(10):timeline.append((30+j*.005,'blade',3.,(-1)**j*.4))
    for t,k,dist,pan in sorted(timeline):
        i,a=pick(k);st=round(t*SR);active=[end for end in active if end>st]
        if len(active)>=6:drops+=1;continue
        en=min(N,st+len(a));active.append(min(N,en+round(.079*SR)));peakvoices=max(peakvoices,len(active));gain=min(1,3/max(3,dist));a=a[:en-st].mean(axis=1);a=sosfilt(butter(2,max(900,11000/(1+dist/9)),fs=SR,output='sos'),a);stereo=a[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2])*gain*.46
        dest=near if dist<10 else far;dest[st:en]+=stereo
        for delay,level in ((.031,.11),(.079,.065)):
            k0=round(delay*SR);end2=min(N,en+k0);dest[st+k0:end2]+=stereo[:end2-st-k0,::-1]*level
        if dist<10 and k!='footstep':
            lo=max(0,st-2400);hi=min(N,en+12000);curve=np.concatenate((np.linspace(1,.55,st-lo),np.full(en-st,.55),np.linspace(.55,1,hi-en)));duck[lo:hi]=np.minimum(duck[lo:hi],curve)
        events.append(dict(time=t,family=k,variant=i+1,distance=dist,pan=pan,gain=gain,frames=en-st))
    with wave.open(str(music),'rb') as w:assert w.getframerate()==SR;mx=np.frombuffer(w.readframes(N),'<i2').reshape(-1,2).astype(np.float32)/32768
    assert len(mx)==N;music_stem=mx*duck[:,None]*.30;music_stem[-SR:]*=np.linspace(1,0,SR)[:,None]
    stems={'music':music_stem,'near':near,'far':far,'ambience':bg};mix=sum(stems.values());g=min(2,.88/max(np.max(abs(mix)),*(np.max(abs(a)) for a in stems.values())));quant={k:pcm(a*g).astype(np.int32) for k,a in stems.items()};master=sum(quant.values());assert np.max(abs(master))<32768
    scene=[]
    for k,a in [('master',master),*quant.items()]:scene.append(save(out/f'scene-{k}.wav',a.astype(np.float64)/32767))
    def read(p):
        with wave.open(str(p),'rb') as w:return np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.int32)
    error=int(np.max(abs(sum(read(out/f'scene-{k}.wav') for k in stems)-read(out/'scene-master.wav'))));assert error==0
    m=dict(approval='research-only',seed=SEED,musicSha256=sha(pathlib.Path(music).read_bytes()),sourceReceipts=used,variants=records,ambience=amb_meta,scene=scene,events=events,sceneSeconds=60,voiceLimit=6,peakVoices=peakvoices,dropped=drops,cacheLimit=8,cacheHits=hits,minimumMusicGain=float(duck.min()),pcmError=error,wallSeconds=time.perf_counter()-start,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,limitations='Blade and steps procedural, shield hybrid recorded drum body not actual shield recording; offline scene not browser render.')
    (out/'manifest.json').write_text(json.dumps(m,indent=2)+'\n');print({k:m[k] for k in ('peakVoices','dropped','cacheHits','minimumMusicGain','pcmError','wallSeconds','maxRssKiB')})
if __name__=='__main__':render(*sys.argv[1:])
