"""Seven-player recorded historical consort, research-only."""
import hashlib, json, pathlib, sqlite3, subprocess, sys, wave
import numpy as np
SR=48000
PLAYERS=('alto-recorder','recorder','folk-harp','frame-drum','tambourine','psaltery','renaissance-organ')
PANS=dict(zip(PLAYERS,(-.28,.28,.4,.04,.18,-.4,0)))
LEVELS=dict(zip(PLAYERS,(.8,.64,.8,.72,.72,.76,.58)))
FINITE={'staccato','pluck','muted','open','hit-soft','hit-strong','shake','psaltery-pluck','psaltery-spiccato'}
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

def select(entries,player,art,midi,rr):
    candidates=[e for e in entries if e['instrument']==player and e['articulation']==art]
    if not candidates: raise ValueError('missing articulation '+player+'/'+art)
    if midi is None:
        if any(e['expectedMidi'] is not None for e in candidates): raise ValueError('unpitched request')
        return sorted(candidates,key=lambda e:e['id'])[rr%len(candidates)]
    if any(e['expectedMidi'] is None for e in candidates): raise ValueError('pitched percussion')
    e=min(candidates,key=lambda e:(abs(e['expectedMidi']-midi),e['id']))
    if abs(e['expectedMidi']-midi)>3: raise ValueError('pitch coverage '+player+'/'+str(midi))
    return e

def decode(file):
    raw=subprocess.check_output(['sox','-R','-v','.8',str(file),'-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-'])
    a=np.frombuffer(raw,'<f4').reshape(-1,2).astype(float)
    if not np.all(np.isfinite(a)) or len(a)<SR*.2 or len(a)>SR*20 or np.max(np.abs(a))>1.1: raise ValueError('invalid source PCM')
    peak=np.max(np.abs(a)); start=next((i for i in range(0,len(a)-240,240) if np.sqrt(np.mean(a[i:i+240]**2))>peak*.045),None)
    if peak<.002 or start is None: raise ValueError('missing attack')
    return a[max(0,start-120):],max(0,start-120)

def voice(a,rate,duration,finite,velocity,pan):
    if a.ndim!=2 or a.shape[1]!=2 or len(a)<2 or not np.all(np.isfinite(a)) or not .8<=rate<=1.26 or not 0<velocity<=1 or not -1<=pan<=1: raise ValueError('invalid voice')
    limit=int((len(a)-1)/rate); n=limit if finite else round(duration*SR)
    if n<240 or n>limit: raise ValueError('insufficient recorded duration')
    pos=np.arange(n)*rate; k=pos.astype(int); f=(pos-k)[:,None]; x=a[k]*(1-f)+a[k+1]*f
    peak=np.max(np.abs(x)); rms=np.sqrt(np.mean(x[:min(n,SR//4)]**2))
    if peak<.002 or rms<.0001: raise ValueError('silent voice')
    gain=velocity*min(.28/peak,.075/rms)
    fade=np.minimum(1,np.minimum(np.arange(n)/96,(n-1-np.arange(n))/min(n//3,480 if finite else 5760)))
    # Balance original stereo; no downmix, no additional room on the organ.
    return x*fade[:,None]*gain*np.sqrt([1-pan,1+pan]),float(gain)

def score():
    # D minor, 16 bars of 6/8, 48 musical seconds; final eight seconds reserved for tails.
    melody=[[74,77,76,74],[72,74,77,76],[70,72,74,70],[69,72,74,74],[74,77,81,77],[76,77,76,74],[72,74,77,72],[70,72,74,69],[74,77,81,77],[76,74,72,74],[70,72,74,77],[76,74,72,69],[74,77,76,74],[72,74,77,76],[70,72,74,70],[74,72,69,74]]
    chords=[[62,69,74],[65,69,72],[62,65,70],[62,69,74],[62,69,74],[64,69,76],[65,70,72],[62,69,74],[62,69,74],[64,69,76],[62,65,70],[62,69,74],[62,69,74],[65,69,72],[62,65,70],[62,69,74]]
    events=[]
    def add(p,a,m,t,d,v): events.append(dict(player=p,art=a,midi=m,start=t,duration=d,velocity=v))
    for i,(mel,ch) in enumerate(zip(melody,chords)):
        t=i*3; crest=.64+.13*np.sin(np.pi*(i+.5)/16)
        for j,k in enumerate([0,1,2,1,0,2]): add('folk-harp','pluck',ch[k],t+j*.5,0,.53 if j else .77)
        if i<4 or i>=12:
            for j,m in enumerate(mel): add('alto-recorder','sustain' if j!=1 else 'staccato',m if m<=77 else m-12,t+j*.65,.6,crest)
        else:
            for j,m in enumerate(mel): add('recorder','staccato' if j==2 else 'sustain',m,t+j*.65,.57,crest)
            for j,m in enumerate([ch[1] if ch[1]>=67 else ch[1]+12,ch[2]]): add('alto-recorder','sustain',m,t+.15+j*1.4,1.12,.55)
        if i>=2:
            add('psaltery','psaltery-bow',ch[2],t+.18,1.15,.63)
            add('psaltery','psaltery-bow',max(69,min(76,mel[-1])),t+1.6,1.12,.5)
        if 4<=i<12:
            add('psaltery','psaltery-pluck',[70,74,86][i%3],t+.75,0,.58)
            add('psaltery','psaltery-spiccato',[70,72,78][i%3],t+2.15,0,.53)
            add('frame-drum','open',None,t,0,.79); add('frame-drum','muted',None,t+1.5,0,.58)
            add('tambourine','hit-soft' if i<8 else 'hit-strong',None,t+1,0,.65); add('tambourine','shake',None,t+2.5,0,.52)
        if 6<=i<14:
            reg='organ-8' if i<10 else 'organ-full'
            for m in ([72,76] if i%3==1 else [74,77]): add('renaissance-organ',reg,m,t+.04,2.6,.46)
        if 10<=i<12: add('renaissance-organ','organ-4',84+(i%2)*2,t+.3,1.9,.25)
    return sorted(events,key=lambda e:(e['start'],e['player'],e['art']))

def self_test():
    a=np.column_stack((np.ones(1000)*.2,np.ones(1000)*.1)); x,g=voice(a,1,0,True,.8,0); assert len(x)==999 and np.max(np.abs(x[:,0]-2*x[:,1]))<1e-12 and not x[0].any() and not x[-1].any()
    for rate,d,finite in [(2,0,True),(1,1,False)]:
        try: voice(a,rate,d,finite,.8,0); raise AssertionError('bad input accepted')
        except ValueError: pass
    e=[dict(instrument='p',articulation='a',expectedMidi=None,id=str(i)) for i in range(2)]; assert select(e,'p','a',None,1)['id']=='1'
    assert len(score())>100
    print('5 consort checks passed')

def main(base,root):
    base=pathlib.Path(base).resolve(); root=pathlib.Path(root).resolve()
    if root==base or base in root.parents: raise ValueError('unsafe output')
    root.mkdir(parents=True,exist_ok=True)
    pins={'metrics.json':'ad1c8fd0f3cc955c492c559c43b7b7ecef777e55cec6e039206fcb1d31201bfb','admission.json':'78da658899f47141536f22a5fce62de3d2ecd302e2128335a92207ec2c275805','library/index.json':'bed9488a1507e2eff128430a3eee54fbbfd3610a2b29165f54fa7d0bb9e8dff0'}
    for f,h in pins.items():
        if sha((base/f).read_bytes())!=h: raise ValueError('reference mismatch '+f)
    prior=json.loads((base/'metrics.json').read_text()); entries=json.loads((base/'library/index.json').read_text())['entries']
    if len(entries)!=46 or len(prior['metrics'])!=6 or prior['approval']!='research-only': raise ValueError('reference inventory')
    for m in prior['metrics']:
        if sha((base/m['file']).read_bytes())!=m['sha256']: raise ValueError('old audition mismatch')
    db=sqlite3.connect('file:'+str(base/'library/catalog.sqlite')+'?mode=ro',uri=True)
    if db.execute('pragma integrity_check').fetchone()[0]!='ok' or {r[0]:json.loads(r[1]) for r in db.execute('select id,metadata from samples')}!={e['id']:e for e in entries}: raise ValueError('catalog mismatch')
    db.close(); paths={}
    for e in entries:
        if e['approval']!='research-only' or e['license']!='CC0-1.0' or e['path']!='objects/'+e['sha256']+'.wav': raise ValueError('invalid entry')
        f=base/'library'/e['path']; b=f.read_bytes()
        if sha(b)!=e['sha256'] or blob(b)!=e['pin']['blob'] or len(b)!=e['pin']['bytes']: raise ValueError('object mismatch')
        paths[e['id']]=f
    seconds=56; stems={p:np.zeros((seconds*SR,2)) for p in PLAYERS}; cache={}; rr={}; receipts=[]
    for ev in score():
        p,art,m=ev['player'],ev['art'],ev['midi']; key=(p,art); e=select(entries,p,art,m,rr.get(key,0)); rr[key]=rr.get(key,0)+1; id=e['id']
        if id not in cache: cache[id]=decode(paths[id])
        a,onset=cache[id]; rate=1 if m is None else 2**((m-e['measuredMidi'])/12)
        x,gain=voice(a,rate,ev['duration'],art in FINITE,ev['velocity'],PANS[p]); offset=round(ev['start']*SR)
        if offset+len(x)>seconds*SR: raise ValueError('tail truncated')
        stems[p][offset:offset+len(x)]+=x*LEVELS[p]; receipts.append(dict(**ev,source=id,sourceSha256=e['sha256'],rate=rate,onset=onset,frames=len(x),gain=gain*LEVELS[p],nativeStereo=True))
    mix=sum(stems.values()); peak=max(np.max(np.abs(mix)),*(np.max(np.abs(a)) for a in stems.values())); gain=min(3,10**(-3/20)/peak); mix*=gain
    for a in stems.values(): a*=gain
    quant=lambda a:np.rint(a*32767).astype('<i2'); q=quant(mix); error=int(np.max(np.abs(sum(quant(a).astype(np.int32) for a in stems.values())-q.astype(np.int32))))
    if error>4 or any(np.max(np.abs(a))<=0 for a in stems.values()): raise ValueError('stem reconstruction')
    metrics=[]
    for name,a in [('pilgrims-crossing',mix),*[(f'pilgrims-crossing-{p}',a) for p,a in stems.items()]]:
        f=root/(name+'.wav')
        with wave.open(str(f),'wb') as w: w.setparams((2,2,SR,0,'NONE','not compressed')); w.writeframes(quant(a).tobytes())
        metrics.append(dict(file=f.name,sha256=sha(f.read_bytes()),peak=float(np.max(np.abs(a))),rms=float(np.sqrt(np.mean(a*a))),frames=len(a)))
    (root/'metrics.json').write_text(json.dumps(dict(approval='research-only',reference=pins,title='Pilgrims Crossing',seconds=seconds,events=receipts,sourceCount=len(cache),catalogCount=len(entries),masterGain=float(gain),pcmError=error,metrics=metrics,recordedIntervalCoverage=0),indent=2)+'\n')
    print('Events',len(receipts),'used sources',len(cache),'PCM error',error)

if __name__=='__main__':
    self_test()
    if len(sys.argv)>1 and sys.argv[1]!='--self-test': main(sys.argv[1],sys.argv[2])
