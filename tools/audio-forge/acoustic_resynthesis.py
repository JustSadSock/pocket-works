"""Offline acoustic identification and seeded resynthesis of short acoustic events.
No original waveform or phase is stored in the portable model. Units are seconds/Hz,
measured digital amplitude, not force in newtons. Research-only."""
import argparse, hashlib, json, math, pathlib, subprocess, time, resource, wave
import numpy as np
from scipy.signal import find_peaks, stft, istft, windows
SR=48000; FFT=1024; HOP=128
BANDS=np.array([0,125,250,500,1000,2000,4000,8000,12000,18000,24001])
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def decode(p):
    result=subprocess.run(['sox','-R','-v','0.5',str(p),'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r',str(SR),'-'],capture_output=True,check=True)
    if b'clipped' in result.stderr.lower():raise ValueError('Decode clipping: '+result.stderr.decode())
    x=np.frombuffer(result.stdout,'<f4').astype(np.float64)
    if not len(x) or not np.isfinite(x).all():raise ValueError('Invalid audio')
    return x
def select_event(x,seconds=1.2):
    # Retain quiet lead-in; avoid peak-based alignment that discards attack.
    threshold=max(.00002,float(np.max(abs(x)))*.025)
    indices=np.flatnonzero(abs(x)>=threshold)
    if not len(indices):raise ValueError('Silent source')
    k=max(0,int(indices[0])-240);n=min(len(x)-k,round(seconds*SR))
    return x[k:k+n],k
def analyze(x):
    if not 64<=len(x)<=SR*12 or not np.isfinite(x).all():raise ValueError('Invalid event')
    # Fine time bins for onset; longer FFT for tonal trajectories.
    f,t,z=stft(x,SR,nperseg=FFT,noverlap=FFT-HOP,boundary='zeros',padded=True)
    mag=abs(z);power=mag**2;frames=[]
    for j,at in enumerate(t):
        p=power[:,j];total=p.sum();peaks,_=find_peaks(mag[:,j],prominence=max(1e-10,mag[:,j].max()*.07))
        peaks=sorted(peaks,key=lambda k:mag[k,j],reverse=True)[:12]
        partials=[];mask=np.ones(len(f),bool)
        for k in peaks:
            if k<1 or k>=len(f)-1:continue
            # Parabolic interpolation of log magnitude, not an identification of literal object modes.
            a,b,c=np.log(np.maximum(mag[k-1:k+2,j],1e-12));d=.5*(a-c)/(a-2*b+c) if abs(a-2*b+c)>1e-9 else 0
            d=float(np.clip(d,-.5,.5));hz=float((k+d)*SR/FFT);amp=float(2*np.exp(b-.25*(a-c)*d))
            if amp>0:partials.append([hz,amp])
            mask[max(0,k-2):min(len(f),k+3)]=False
        bands=[float(p[(f>=a)&(f<b)&mask].sum()) for a,b in zip(BANDS[:-1],BANDS[1:])]
        frames.append(dict(t=float(at),partials=partials,noise=bands,energy=float(total)))
    # Link nearest peaks across time with a bounded tolerance; frequency and amplitude are editable trajectories.
    tracks=[]
    for j,fr in enumerate(frames):
        claimed=set()
        for hz,amp in sorted(fr['partials'],key=lambda p:-p[1]):
            candidates=[(abs(tr[-1][1]-hz),k) for k,tr in enumerate(tracks) if k not in claimed and j-tr[-1][0]==1 and abs(tr[-1][1]-hz)<=max(65,hz*.035)]
            if candidates:
                _,k=min(candidates);tracks[k].append([j,hz,amp]);claimed.add(k)
            else:tracks.append([[j,hz,amp]]);claimed.add(len(tracks)-1)
    tracks=sorted([tr for tr in tracks if len(tr)>=3],key=lambda tr:sum(p[2]**2 for p in tr),reverse=True)[:32]
    # Unlinked/single-frame peaks are included in the residual, so a transient is not discarded.
    noise=[]
    for j in range(len(t)):
        p=power[:,j].copy()
        for tr in tracks:
            first=tr[0][0];i=j-first
            if 0<=i<len(tr) and tr[i][0]==j:
                k=round(tr[i][1]*FFT/SR);p[max(0,k-2):min(len(p),k+3)]=0
        noise.append([float(p[(f>=a)&(f<b)].sum()) for a,b in zip(BANDS[:-1],BANDS[1:])])
    fine=[];step=48
    for k in range(0,len(x),step):fine.append(float(np.sqrt(np.mean(x[k:k+step]**2))))
    return dict(version=1,sampleRate=SR,fft=FFT,hop=HOP,frames=len(x),bands=BANDS.tolist(),noise=noise,tracks=tracks,frameEnergy=[v['energy'] for v in frames],rms1ms=fine)
def render(model,seed=42,gain=1.,size=1.,duration=1.,noiseMix=1.,modalMix=1.):
    if model.get('version')!=1 or model.get('sampleRate')!=SR or model.get('fft')!=FFT or model.get('hop')!=HOP:raise ValueError('Unsupported model')
    for a,lo,hi in [(gain,0,4),(size,.65,1.6),(duration,.5,2),(noiseMix,0,2),(modalMix,0,2)]:
        if not isinstance(a,(float,int)) or not math.isfinite(a) or not lo<=a<=hi:raise ValueError('Invalid control')
    if not isinstance(seed,int) or not 0<=seed<=2**32-1:raise ValueError('Invalid seed')
    n0=model['frames'];raw=np.array(model['noise'],dtype=float);tracks=model['tracks']
    if not isinstance(n0,int) or not 64<=n0<=SR*12 or raw.ndim!=2 or raw.shape[1]!=len(BANDS)-1 or not 1<=len(raw)<=4502 or len(raw)!=math.ceil(n0/HOP)+1 or not np.isfinite(raw).all() or np.min(raw)<0 or len(tracks)>32:raise ValueError('Invalid model bounds')
    n=round(n0*duration);u=np.arange(n)/SR;src=u/duration*SR/HOP;rng=np.random.default_rng(seed);tonal=np.zeros(n)
    for tr in tracks:
        a=np.array(tr,float)
        if a.ndim!=2 or a.shape[1]!=3 or len(a)<3 or not np.isfinite(a).all() or np.any(np.diff(a[:,0])!=1) or a[0,0]<0 or a[-1,0]>=len(raw) or np.any(a[:,1]<0) or np.any(a[:,1]>SR/2) or np.any(a[:,2]<0):raise ValueError('Invalid trajectory')
        hz=np.interp(src,a[:,0],a[:,1])/size
        amp=np.interp(src,np.r_[a[0,0]-1,a[:,0],a[-1,0]+1],np.r_[0,a[:,2],0],left=0,right=0)
        tonal+=amp*np.sin(rng.uniform(0,2*np.pi)+2*np.pi*np.cumsum(hz)/SR)*(hz<SR*.46)
    # Independent phase/noise every frame; overlap/add creates continuous stochastic residual.
    # Correct magnitude convention for scipy STFT spectrum scaling.
    f=np.fft.rfftfreq(FFT,1/SR);origf=f*size;positions=np.arange(math.ceil(n/HOP)+1)/duration
    z=np.zeros((len(f),len(positions)),complex)
    for j,at in enumerate(positions):
        e=np.array([np.interp(at,np.arange(len(raw)),raw[:,k],right=0) for k in range(raw.shape[1])])
        for k,(lo,hi) in enumerate(zip(BANDS[:-1],BANDS[1:])):
            mask=(origf>=lo)&(origf<hi);count=mask.sum()
            if count:z[mask,j]=np.sqrt(e[k]/count)*np.exp(1j*rng.uniform(0,2*np.pi,count))
        z[0,j]=z[0,j].real;z[-1,j]=z[-1,j].real
    _,res=istft(z,SR,nperseg=FFT,noverlap=FFT-HOP,boundary=True)
    res=np.pad(res,(0,max(0,n-len(res))))[:n]
    # Preserve the measured millisecond total RMS envelope, but not source samples.
    fine=np.array(model['rms1ms'],float)
    if fine.shape!=(math.ceil(n0/48),) or not np.isfinite(fine).all() or np.any(fine<0):raise ValueError('Invalid envelope')
    both=tonal+res;step=48;env=np.array([np.sqrt(np.mean(both[k:k+step]**2)) for k in range(0,n,step)])
    desired=np.interp(np.arange(len(env))*step/duration/48,np.arange(len(fine)),fine,right=0)
    correction=np.clip(desired/np.maximum(env,1e-7),0,5)
    g=np.interp(np.arange(n),np.arange(len(env))*step+step/2,correction)
    a=tonal*g*gain*modalMix;b=res*g*gain*noiseMix
    fade=np.minimum(1,np.minimum(np.arange(n)/24,(n-1-np.arange(n))/240));a*=fade;b*=fade
    if not np.isfinite(a+b).all():raise ValueError('Nonfinite synthesis')
    return a,b
def descriptors(x):
    x=np.asarray(x);energy=float(np.sum(x*x));rawLength=len(x);p=max(np.max(abs(x)),1e-12)
    # Align both at first nontrivial amplitude; raw RMS is separately reported.
    j=np.flatnonzero(abs(x)>=p*.025);x=x[int(j[0]):] if len(j) else x
    slices=[]
    for a,b in [(0,.005),(.005,.02),(.02,.08),(.08,.2),(.2,.6),(.6,1.2)]:
        y=x[round(a*SR):round(b*SR)]
        if len(y)<8:slices.append([0.]*(len(BANDS)));continue
        f=np.fft.rfftfreq(len(y),1/SR);v=abs(np.fft.rfft(y*windows.hann(len(y))))**2
        slices.append([float(np.sum(y*y)/max(energy,1e-12))]+[float(v[(f>=lo)&(f<hi)].sum()/max(v.sum(),1e-12)) for lo,hi in zip(BANDS[:-1],BANDS[1:])])
    return dict(peak=float(p),rms=float(np.sqrt(energy/rawLength)),energy=energy,trajectory=slices)
def distance(a,b):
    # Diagnostic L1 distance over time-band energy, with each band's energy weighted by interval energy.
    a=np.array(a['trajectory']);b=np.array(b['trajectory'])
    return float(np.mean(abs(a[:,0,None]*a[:,1:]-b[:,0,None]*b[:,1:])))
def save(p,x):
    p=pathlib.Path(p);x=np.asarray(x);assert np.isfinite(x).all() and np.max(abs(x))<1
    q=np.rint(x*32767).astype('<i2')
    with wave.open(str(p),'wb') as w:w.setparams((1,2,SR,0,'NONE','not compressed'));w.writeframes(q.tobytes())
    return sha(p)
def main(corpus,baseline,out):
    import zipfile
    start=time.perf_counter();corpus=pathlib.Path(corpus);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    for p in ('originals','models','renders','controls'): (out/p).mkdir(exist_ok=True)
    manifest=json.loads((corpus/'sources.json').read_text());sources=[];models={};events={};report=[]
    for e in manifest['sources']:
        p=corpus/'originals'/e['file'];data=p.read_bytes();blob=hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
        assert blob==e['gitBlob'] and e['license']=='CC0-1.0'
        (out/'originals'/p.name).write_bytes(data);e=dict(e,sha256=sha(p),bytes=len(data));sources.append(e)
        x,k=select_event(decode(p));events[e['id']]=x;e['eventOffsetFrames']=k;e['eventFrames']=len(x);e['analysis']=descriptors(x)
        if e['split']=='train':
            model=analyze(x);models[e['group']]=model
            (out/'models'/(e['group']+'.json')).write_text(json.dumps(model,separators=(',',':'))+'\n')
    with zipfile.ZipFile(baseline) as z:
        ledger=json.loads(z.read('archive-sha256.json'))
        assert ledger['contact-audition.wav']=='4fe50b182ac255c739fe5b5b896644765f1b5eef789f35207ddb47ac62e7393e'
        for path in ledger:assert hashlib.sha256(z.read(path)).hexdigest()==ledger[path]
        old_ids={'metal':'blade-heavy','metal-light':'blade-cross','wood':'shield-wood','tin':'shield-metal','slide':'blade-glance'}
        for group,model in models.items():
            tr=next(e for e in sources if e['group']==group and e['split']=='train')
            ho=next(e for e in sources if e['group']==group and e['split']=='holdout')
            x=events[tr['id']];y=events[ho['id']]
            a,b=render(model,seed=914);a2,b2=render(model,seed=914);assert np.array_equal(a,a2) and np.array_equal(b,b2)
            c,d=render(model,seed=915);assert not np.array_equal(a+b,c+d)
            # Fixed gain, shared limiter only if necessary; no individual normalization hides force differences.
            weak=render(model,seed=914,gain=.55);strong=render(model,seed=914,gain=1.25)
            assert np.allclose(sum(weak),.55*(a+b)) and np.allclose(sum(strong),1.25*(a+b))
            size=render(model,seed=914,size=1.25,duration=1.2);assert len(sum(size))==round(len(x)*1.2)
            old_path='variants/'+old_ids[group]+'-1.wav';p=out/'controls'/(group+'-old.wav');p.write_bytes(z.read(old_path));old=decode(p)
            # Compare held-out event untouched, same group only, not calibrated physical force.
            methods={'training-reference':x,'holdout-reference':y,'procedural-baseline':old,'resynthesis':a+b,'variant':c+d,'weak':sum(weak),'strong':sum(strong),'large-long':sum(size)}
            raw={name:descriptors(v) for name,v in methods.items()}
            g=min(.8/max(np.max(abs(v)) for v in methods.values()),1)
            files={}
            for name,v in methods.items():
                p=out/'renders'/(group+'-'+name+'.wav');files[name]=dict(sha256=save(p,v*g),gain=g)
            # Integer exact stems with common scale, separately checked.
            qa=np.rint(a*g*32767);qb=np.rint(b*g*32767);master=(qa+qb)/32767
            assert max(abs(master))<1
            files['tonal']=dict(sha256=save(out/'renders'/(group+'-tonal.wav'),qa/32767),gain=g)
            files['residual']=dict(sha256=save(out/'renders'/(group+'-residual.wav'),qb/32767),gain=g)
            files['resynthesis']=dict(sha256=save(out/'renders'/(group+'-resynthesis.wav'),master),gain=g)
            # Equal RMS comparison is separate; padding to common duration prevents silence bias.
            n=max(len(x),len(y),len(old),len(master));level=min(np.sqrt(np.sum(v*v)/n) for v in (y,old,a+b));matched={}
            for name,v in [('holdout',y),('old',old),('resynthesis',a+b)]:
                w=np.pad(v,(0,n-len(v)));w*=level/max(np.sqrt(np.mean(w*w)),1e-12);matched[name]=w
            mg=min(1,.85/max(np.max(abs(v)) for v in matched.values()))
            for name,v in matched.items():save(out/'controls'/(group+'-matched-'+name+'.wav'),v*mg)
            report.append(dict(group=group,train=tr['id'],holdout=ho['id'],tracks=len(model['tracks']),fixedGain=g,raw=raw,files=files,heldoutDistance={name:distance(raw['holdout-reference'],raw[name]) for name in ('training-reference','procedural-baseline','resynthesis')},matchedRms=level*mg,weakStrongEnergyRatio=raw['strong']['energy']/raw['weak']['energy'],scope='Uncontrolled Foley class holdout, not independent verified physical geometry or force. gain is amplitude; size/time are acoustic transforms.'))
    (out/'report.json').write_text(json.dumps(dict(approval='research-only',decodeGain=.5,sources=sources,groups=report,baselineSha256=sha(baseline),wallSeconds=time.perf_counter()-start,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss),indent=2)+'\n')
    print(json.dumps([{k:v for k,v in row.items() if k in ('group','tracks','heldoutDistance','weakStrongEnergyRatio')} for row in report],indent=2))
if __name__=='__main__':
    import sys
    if len(sys.argv)>1 and sys.argv[1]=='render':
        p=argparse.ArgumentParser();p.add_argument('model');p.add_argument('output');p.add_argument('--seed',type=int,default=914);p.add_argument('--gain',type=float,default=1);p.add_argument('--size',type=float,default=1);p.add_argument('--duration',type=float,default=1);p.add_argument('--noise-mix',type=float,default=1);p.add_argument('--modal-mix',type=float,default=1);p.add_argument('--output-gain',type=float,default=1);a=p.parse_args(sys.argv[2:])
        if not 0<a.output_gain<=1:raise ValueError('Invalid output gain')
        u,v=render(json.loads(pathlib.Path(a.model).read_text()),a.seed,a.gain,a.size,a.duration,a.noise_mix,a.modal_mix)
        print(save(a.output,(u+v)*a.output_gain))
    else:
        p=argparse.ArgumentParser();p.add_argument('corpus');p.add_argument('baseline');p.add_argument('out');a=p.parse_args();main(a.corpus,a.baseline,a.out)
