"""Non-destructive stereo balance of the verified historical consort."""
import hashlib, json, pathlib, sys, wave
import numpy as np
SR=48000
REFERENCE='ea8160cd1d7fabe83ea916d618022318a23a619b555580a463363c53d6650eb2'
TRIMS={'alto-recorder':0,'recorder':1,'folk-harp':-2,'frame-drum':3,'tambourine':5,'psaltery':0,'renaissance-organ':1}
WIDTH={'tambourine':.6}
sha=lambda b:hashlib.sha256(b).hexdigest()
lin=lambda db:10**(db/20)
rms=lambda a:float(np.sqrt(np.mean(a*a)))
def db(x):return float(20*np.log10(max(float(x),1e-15)))

def stats(a):
    if a.ndim!=2 or a.shape[1]!=2 or not len(a) or not np.all(np.isfinite(a)):raise ValueError('invalid stereo PCM')
    mid=a.mean(axis=1);side=(a[:,0]-a[:,1])*.5
    l,r=rms(a[:,0]),rms(a[:,1]);m=rms(mid);s=rms(side);v=rms(a)
    if min(l,r,v)<=0:raise ValueError('silent channel')
    corr=float(np.dot(a[:,0],a[:,1])/len(a)/l/r)
    return dict(peakDb=db(np.max(np.abs(a))),rmsDb=db(v),correlation=corr,sideMidDb=db(s/max(m,1e-15)),monoLossDb=db(m/v),leftRightDb=db(l/r))

def narrow(a,width):
    if not 0<=width<=1:raise ValueError('invalid width')
    if width==1:return a.copy()
    mid=a.mean(axis=1);side=(a[:,0]-a[:,1])*.5*width
    out=np.column_stack((mid+side,mid-side));return out

def balance(parts,trims,widths):
    if set(parts)!=set(trims) or not parts or set(widths)-set(parts):raise ValueError('invalid track inventory')
    shape=next(iter(parts.values())).shape
    if any(a.shape!=shape for a in parts.values()) or any(not np.isfinite(d) or abs(d)>8 for d in trims.values()):raise ValueError('invalid geometry or trim')
    stems={}
    for k,a in parts.items():
        stats(a);stems[k]=narrow(a,widths.get(k,1))*lin(trims[k])
    mix=sum(stems.values());delta=stats(mix)['leftRightDb'];correction=float(np.clip(delta,-6,6));channels=np.array([lin(-correction/2),lin(correction/2)])
    for a in stems.values():a*=channels
    mix=sum(stems.values());peak=max(float(np.max(np.abs(mix))),*(float(np.max(np.abs(a))) for a in stems.values()))
    gain=min(3,lin(-3)/peak)
    for a in stems.values():a*=gain
    mix=sum(stems.values());return mix,stems,channels,gain

def self_test():
    t=np.arange(4800)/SR;x=.2*np.sin(2*np.pi*440*t);y=.15*np.sin(2*np.pi*660*t);a=np.column_stack((x+y,x-y));b=narrow(a,.6)
    assert np.max(np.abs(a.mean(axis=1)-b.mean(axis=1)))<1e-12
    assert np.max(np.abs(narrow(a,1)-a))==0
    assert stats(b)['correlation']>stats(a)['correlation']
    assert stats(b)['monoLossDb']>stats(a)['monoLossDb']
    c=np.column_stack((x*.7,x));mix,stems,channels,gain=balance({'a':c},{'a':0},{})
    assert abs(stats(mix)['leftRightDb'])<1e-10 and stats(mix)['peakDb']<=-3+1e-10
    for f in [lambda:narrow(a,1.1),lambda:balance({'a':a},{'a':20},{}),lambda:stats(np.zeros((10,2)))]:
        try:f();raise AssertionError('invalid input accepted')
        except ValueError:pass
    print('8 stereo checks passed')

def main(base,root):
    base=pathlib.Path(base).resolve();root=pathlib.Path(root).resolve()
    if root==base or base in root.parents or root in base.parents:raise ValueError('unsafe output')
    root.mkdir(parents=True,exist_ok=True)
    raw=(base/'metrics.json').read_bytes();m=json.loads(raw)
    if sha(raw)!=REFERENCE or m['approval']!='research-only' or len(m['metrics'])!=8 or m['seconds']!=56 or len(m['events'])!=270 or m['catalogCount']!=46:raise ValueError('reference mismatch')
    hashes={x['file']:x['sha256'] for x in m['metrics']}
    def read(name):
        f=base/name;b=f.read_bytes()
        if sha(b)!=hashes[name]:raise ValueError('reference PCM mismatch')
        with wave.open(str(f),'rb') as w:
            if (w.getnchannels(),w.getsampwidth(),w.getframerate(),w.getnframes())!=(2,2,SR,56*SR):raise ValueError('reference WAV geometry')
            q=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2)
        if np.max(np.abs(q.astype(np.int32)))>=32767:raise ValueError('clipped reference')
        return q.astype(float)/32767
    original=read('pilgrims-crossing.wav');parts={k:read('pilgrims-crossing-'+k+'.wav') for k in TRIMS}
    original_error=int(np.max(np.abs(np.rint(sum(parts.values())*32767)-np.rint(original*32767))))
    if original_error>4:raise ValueError('reference reconstruction')
    before={k:stats(a) for k,a in parts.items()};before['master']=stats(original)
    mix,stems,channels,gain=balance(parts,TRIMS,WIDTH)
    after={k:stats(a) for k,a in stems.items()};after['master']=stats(mix)
    if abs(after['master']['leftRightDb'])>.1 or after['master']['monoLossDb']<before['master']['monoLossDb']-.25 or after['tambourine']['correlation']<.35 or after['tambourine']['monoLossDb']< -2 or after['master']['peakDb']>-3+1e-9:raise ValueError('stereo acceptance failed')
    quant=lambda a:np.rint(a*32767).astype('<i2')
    error=int(np.max(np.abs(sum(quant(a).astype(np.int32) for a in stems.values())-quant(mix).astype(np.int32))))
    if error>4:raise ValueError('stem reconstruction')
    metrics=[]
    def write(name,a):
        if a.ndim==1:a=a[:,None]
        if not np.all(np.isfinite(a)) or np.max(np.abs(a))>=1 or rms(a)==0:raise ValueError('invalid output')
        f=root/(name+'.wav')
        with wave.open(str(f),'wb') as w:w.setparams((a.shape[1],2,SR,0,'NONE','not compressed'));w.writeframes(quant(a).tobytes())
        metrics.append(dict(file=f.name,sha256=sha(f.read_bytes()),frames=len(a),channels=a.shape[1],peakDb=db(np.max(np.abs(a))),rmsDb=db(rms(a))))
    write('pilgrims-crossing-stereo',mix)
    for k,a in stems.items():write('pilgrims-crossing-stereo-'+k,a)
    write('pilgrims-crossing-mono',mix.mean(axis=1))
    n=48*SR;target=min(rms(original[:n]),rms(mix[:n]));g1=target/rms(original[:n]);g2=target/rms(mix[:n]);a=original*g1;b=mix*g2
    if abs(db(rms(a[:n])/rms(b[:n])))>1e-8:raise ValueError('comparison mismatch')
    write('pilgrims-crossing-stereo-AB',np.concatenate((a,np.zeros((SR,2)),b)))
    if len(metrics)!=10 or any(sha((base/k).read_bytes())!=v for k,v in hashes.items()):raise ValueError('reference changed')
    receipt=dict(approval='research-only',reference=REFERENCE,sourceHashes=hashes,trims=TRIMS,widths=WIDTH,channelGains=channels.tolist(),masterGain=gain,originalPcmError=original_error,pcmError=error,before=before,after=after,comparison=dict(startSeconds=[0,57],activeSeconds=48,gains=[g1,g2]),metrics=metrics)
    (root/'metrics.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({k:receipt[k] for k in ['channelGains','masterGain','pcmError','before','after']},indent=2))

if __name__=='__main__':
    self_test()
    if len(sys.argv)>1 and sys.argv[1]!='--self-test':main(sys.argv[1],sys.argv[2])
