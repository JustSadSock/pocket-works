"""Non-destructive, note-level expression from verified historical recordings."""
import hashlib, importlib.util, json, pathlib, sys, wave
import numpy as np
SR=48000
sha=lambda b:hashlib.sha256(b).hexdigest()
REF='eb61977b3752038a99ea1bda3d938b2af7ffd2c635645068fd75b693a919a038'
CAT='bed9488a1507e2eff128430a3eee54fbbfd3610a2b29165f54fa7d0bb9e8dff0'
PLAYERS=('alto-recorder','recorder','folk-harp','frame-drum','tambourine','psaltery','renaissance-organ')

def expression(event,n):
    p=event['player']; t=event['start']; art=event['art']; u=np.linspace(0,1,n)
    if art in ('sustain','psaltery-bow','organ-4','organ-8','organ-full'):
        contour=(.83+.26*np.sin(np.pi*u)**1.4)*(1-.09*u)
        if p=='renaissance-organ':contour=.97+.06*np.sin(np.pi*u)
    else: contour=np.ones(n)
    phrase=.88+.15*np.sin(np.pi*((t%12)/12))
    accent=1.12 if t%3<.18 else .96
    return contour*phrase*accent

def self_test():
    e=dict(player='recorder',start=0.,art='sustain'); a=expression(e,4800)
    assert len(a)==4800 and a.min()>0 and a.max()<1.4 and a[2400]>a[0]
    assert np.all(expression(dict(e,art='staccato'),4800)==expression(dict(e,art='staccato'),4800)[0])
    assert np.ptp(expression(dict(e,player='renaissance-organ',art='organ-8'),4800))<np.ptp(a)
    assert np.array_equal(a,expression(e,4800))
    print('4 expression checks passed')

def main(catalog,original,stereo,root):
    catalog,original,stereo,root=map(lambda p:pathlib.Path(p).resolve(),(catalog,original,stereo,root))
    if any(root==p or p in root.parents or root in p.parents for p in (catalog,original,stereo)):raise ValueError('unsafe output')
    root.mkdir(parents=True,exist_ok=True)
    raw=(stereo/'metrics.json').read_bytes()
    if sha(raw)!=REF:raise ValueError('stereo reference mismatch')
    sm=json.loads(raw)
    for m in sm['metrics']:
        if sha((stereo/m['file']).read_bytes())!=m['sha256']:raise ValueError('stereo audition changed')
    oldraw=(original/'metrics.json').read_bytes(); old=json.loads(oldraw)
    if sha(oldraw)!=sm['reference'] or len(old['events'])!=270:raise ValueError('original reference mismatch')
    for f,h in sm['sourceHashes'].items():
        if sha((original/f).read_bytes())!=h:raise ValueError('original changed')
    raw=(catalog/'library/index.json').read_bytes()
    if sha(raw)!=CAT:raise ValueError('catalog reference mismatch')
    entries={e['id']:e for e in json.loads(raw)['entries']}
    if len(entries)!=46:raise ValueError('catalog inventory')
    spec=importlib.util.spec_from_file_location('consort',pathlib.Path(__file__).with_name('historical-consort.py')); mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    for e in entries.values():
        f=catalog/'library'/e['path'];b=f.read_bytes()
        if e['approval']!='research-only' or e['license']!='CC0-1.0' or sha(b)!=e['sha256'] or mod.blob(b)!=e['pin']['blob']:raise ValueError('source mismatch')
    stems={p:np.zeros((56*SR,2)) for p in PLAYERS}; cache={}; events=[]
    for i,e in enumerate(old['events']):
        p=e['player'];entry=entries[e['source']]
        if e['sourceSha256']!=entry['sha256']:raise ValueError('event provenance mismatch')
        if entry['id'] not in cache:cache[entry['id']]=mod.decode(catalog/'library'/entry['path'])
        a,onset=cache[entry['id']];finite=e['art'] in mod.FINITE
        if onset!=e['onset']:raise ValueError('onset mismatch')
        duration=e['duration'] if finite else e['duration']*(.96 if p in ('alto-recorder','recorder') else .99)
        x,gain=mod.voice(a,e['rate'],duration,finite,e['velocity'],mod.PANS[p]); curve=expression(e,len(x));x*=curve[:,None]
        if p=='tambourine':
            mid=x.mean(axis=1); side=(x[:,0]-x[:,1])*.3;x=np.column_stack((mid+side,mid-side))
        offset=round((e['start']+(.006*np.sin(i*1.71) if e['start']>.02 and p!='renaissance-organ' else 0))*SR)
        if offset<0 or offset+len(x)>56*SR:raise ValueError('note grid')
        stems[p][offset:offset+len(x)]+=x*mod.LEVELS[p]*10**(sm['trims'][p]/20)
        events.append(dict(source=e['source'],sourceSha256=entry['sha256'],player=p,art=e['art'],midi=e['midi'],startFrame=offset,frames=len(x),curveMin=float(curve.min()),curveMax=float(curve.max()),rate=e['rate'],mode='recorded-note-shaped'))
    mix=sum(stems.values());l,r=np.sqrt(np.mean(mix*mix,axis=0));delta=float(np.clip(20*np.log10(l/r),-6,6));channels=10**(np.array([-delta/2,delta/2])/20)
    for a in stems.values():a*=channels
    mix=sum(stems.values());gain=min(3,10**(-3/20)/max(np.max(np.abs(mix)),*(np.max(np.abs(a)) for a in stems.values())))
    for a in stems.values():a*=gain
    mix=sum(stems.values());quant=lambda a:np.rint(a*32767).astype('<i2');error=int(np.max(np.abs(sum(quant(a).astype(np.int32) for a in stems.values())-quant(mix).astype(np.int32))))
    if error>4 or abs(20*np.log10(np.sqrt(np.mean(mix[:,0]**2)/np.mean(mix[:,1]**2))))>.1:raise ValueError('mix acceptance')
    metrics=[]
    def write(name,a):
        if not np.all(np.isfinite(a)) or np.max(np.abs(a))>=1 or not np.any(a):raise ValueError('invalid output')
        f=root/(name+'.wav')
        with wave.open(str(f),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(quant(a).tobytes())
        metrics.append(dict(file=f.name,sha256=sha(f.read_bytes()),frames=len(a),peak=float(np.max(np.abs(a))),rms=float(np.sqrt(np.mean(a*a)))))
    write('pilgrims-crossing-expressive',mix)
    for p,a in stems.items():write('pilgrims-crossing-expressive-'+p,a)
    with wave.open(str(stereo/'pilgrims-crossing-stereo.wav'),'rb') as w:ref=np.frombuffer(w.readframes(w.getnframes()),'<i2').reshape(-1,2).astype(float)/32767
    n=48*SR; a,b=[np.sqrt(np.mean(x[:n]**2)) for x in (ref,mix)];target=min(a,b)
    write('pilgrims-crossing-expression-AB',np.concatenate((ref*target/a,np.zeros((SR,2)),mix*target/b)))
    (root/'metrics.json').write_text(json.dumps(dict(approval='research-only',reference=REF,events=events,sourceCount=len(cache),pcmError=error,masterGain=float(gain),recordedIntervalCoverage=0,metrics=metrics),indent=2)+'\n')
    print('Events',len(events),'sources',len(cache),'PCM error',error)
if __name__=='__main__':
    self_test()
    if len(sys.argv)>1 and sys.argv[1]!='--self-test':main(*sys.argv[1:])
