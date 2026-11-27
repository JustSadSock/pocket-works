"""Independent harmonic-grid admission for recorded psaltery, research only."""
import math
from functools import reduce
import numpy as np

SR = 48000
WINDOWS = (.06, .12, .22, .36, .52, .72, 1.)

def inspect(pcm):
    if pcm.ndim != 1 or not np.all(np.isfinite(pcm)) or len(pcm) < SR*.2 or np.max(np.abs(pcm)) > 1.1:
        raise ValueError('invalid PCM')
    peak = float(np.max(np.abs(pcm)))
    if peak < .002: raise ValueError('silent source')
    onset = next((i for i in range(0,len(pcm)-240,240) if np.sqrt(np.mean(pcm[i:i+240]**2)) > peak*.045),None)
    if onset is None: raise ValueError('missing attack')
    receipts=[]
    for sec in WINDOWS:
        start=onset+round(sec*SR); x=pcm[start:start+4800]
        if len(x)!=4800 or np.sqrt(np.mean(x*x))<max(.001,peak*.015): continue
        z=np.abs(np.fft.rfft(x*np.hanning(len(x)),n=32768)); bins=np.arange(1,len(z)-1)
        bins=bins[(z[bins]>z[bins-1]) & (z[bins]>=z[bins+1]) & (bins*SR/32768>100) & (bins*SR/32768<6000)]
        if not len(bins): continue
        bins=sorted((int(j) for j in bins if z[j]>=np.max(z[bins])*.06),key=lambda j:z[j],reverse=True)[:24]
        peaks=[]
        for j in bins:
            y=np.log(np.maximum(z[j-1:j+2],1e-20)); d=float(np.clip(.5*(y[0]-y[2])/(y[0]-2*y[1]+y[2]),-.5,.5))
            peaks.append(((j+d)*SR/32768,float(z[j]**2)))
        total=sum(v for f,v in peaks); candidates=[]
        for f,v in peaks:
            for h in range(1,13):
                f0=f/h
                if not 130<=f0<=1500: continue
                good=[(f,v,round(f/f0)) for f,v in peaks if 1<=round(f/f0)<=12 and abs(f-f0*round(f/f0))<=max(5,f*.008)]
                hs=sorted({h for f,v,h in good})
                if len(hs)<3 or reduce(math.gcd,hs,0)!=1: continue
                score=sum(v for f,v,h in good)/total
                fit=sum(v*h*f for f,v,h in good)/sum(v*h*h for f,v,h in good)
                candidates.append((score,fit,hs))
        if not candidates: receipts.append({'sec':sec,'accepted':False,'reason':'insufficient harmonic evidence'}); continue
        candidates.sort(key=lambda x:x[0],reverse=True); best=candidates[0]
        rival=next((x for x in candidates if abs(12*math.log2(x[1]/best[1]))>.4),None)
        margin=best[0]-(rival[0] if rival else 0)
        receipts.append({'sec':sec,'midi':69+12*math.log2(best[1]/440),'explainedEnergy':best[0],'margin':margin,'harmonics':best[2],'accepted':best[0]>=.8 and margin>=.12})
    good=sorted(w['midi'] for w in receipts if w['accepted'])
    valid=len(good)>=3 and len(good)/max(1,len(receipts))>=.4 and good[-1]-good[0]<=.75
    return {'onset':onset,'peak':peak,'windows':receipts,'measuredMidi':float(np.median(good)) if valid else None}

def self_test():
    t=np.arange(SR*2)/SR
    def tone(f,hs): return sum(.09*np.sin(2*np.pi*f*h*t) for h in hs)
    assert abs(inspect(tone(440,[1,2,3]))['measuredMidi']-69)<.1
    assert abs(inspect(tone(440,[2,3,4]))['measuredMidi']-69)<.1
    assert abs(inspect(tone(440,[2,4,6]))['measuredMidi']-81)<.1
    assert inspect(tone(440,[1]))['measuredMidi'] is None
    a=tone(440,[1,2,3]); b=tone(550,[1,2,3]); a[SR//2:]=b[SR//2:]; assert inspect(a)['measuredMidi'] is None
    try: inspect(np.zeros(SR)); raise AssertionError('accepted silence')
    except ValueError: pass
    print('6 harmonic checks passed')

if __name__=='__main__':
    import sys, json, hashlib, pathlib, subprocess, shutil, sqlite3, wave
    self_test()
    if len(sys.argv)==1 or sys.argv[1]=='--self-test': sys.exit(0)
    base=pathlib.Path(sys.argv[1]).resolve(); root=pathlib.Path(sys.argv[2]).resolve()
    if root==base or base in root.parents: raise ValueError('unsafe output path')
    root.mkdir(parents=True,exist_ok=True)
    sha=lambda b:hashlib.sha256(b).hexdigest()
    blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
    def load(file,expected):
        b=(base/file).read_bytes()
        if sha(b)!=expected: raise ValueError('reference mismatch '+file)
        return json.loads(b)
    prior=load('metrics.json','7fb381e8798ef03c9d9318505df646c3b296c594ada13154faf3204363945620')
    evidence=load('admission.json','65b8e048e2d144eba375d945b56ca87823d230798a4f1c0cc7857c9f16d0cfef')
    index=load('library/index.json','9e97254f3eb578b482020bb8caf9af009e03b1be0132d0ecce8fabc76cf289d6')
    if len(index['entries'])!=37 or len(evidence['items'])!=18: raise ValueError('reference inventory')
    for m in prior['metrics']:
        if sha((base/m['file']).read_bytes())!=m['sha256']: raise ValueError('previous WAV changed')
    license=(base/'LICENSE').read_bytes()
    if blob(license)!='0e259d42c996742e9e3cba14c677129b2c1b6311': raise ValueError('license mismatch')
    (root/'LICENSE').write_bytes(license)
    pcms={}; receipts=[]
    def decode(file):
        raw=subprocess.check_output(['sox','-R','-v','.8',str(file),'-t','raw','-e','floating-point','-b','32','-L','-c','1','-r','48000','-','trim','0','12'])
        return np.frombuffer(raw,'<f4').astype(float)
    for x in evidence['items']:
        p=x['pin']; s=x['source']; file=base/s['file']; b=file.read_bytes()
        if len(b)!=p['size'] or sha(b)!=s['sha256'] or blob(b)!=p['blob']: raise ValueError('source mismatch')
        pcm=decode(file); pcms[p['id']]=pcm
        if p['group'].startswith('psaltery'):
            r=inspect(pcm); receipts.append({'pin':p,'source':s,'pitch':r})
    groups={}
    for r in receipts: groups.setdefault(r['pin']['group'],[]).append(r)
    accepted={}
    for g,rs in groups.items():
        offsets=[o for o in (0,12) if len(rs)==3 and all(r['pitch']['measuredMidi'] is not None and abs(r['pitch']['measuredMidi']-r['pin']['labelMidi']-o)<=.75 for r in rs)]
        if len(offsets)==1:
            for r in rs: accepted[r['pin']['id']]=r['pin']['labelMidi']+offsets[0]
    def save(name,obj): (root/name).write_text(json.dumps(obj,indent=2)+'\n')
    save('admission.json',{'approval':'research-only','receipts':receipts,'accepted':accepted})
    if len(accepted)!=9: raise ValueError('psaltery admission incomplete')
    lib=root/'library'; (lib/'objects').mkdir(parents=True,exist_ok=True); entries=index['entries'][:]
    for e in entries:
        b=(base/'library'/e['path']).read_bytes()
        if sha(b)!=e['sha256'] or blob(b)!=e['pin']['blob']: raise ValueError('prior object mismatch')
        (lib/e['path']).write_bytes(b)
    for r in receipts:
        p=r['pin']; s=r['source']; pitch=r['pitch']; b=(base/s['file']).read_bytes(); target='objects/'+s['sha256']+'.wav'; (lib/target).write_bytes(b)
        entries.append(dict(id='vcsl-historical-'+p['id'],path=target,title=p['group']+' MIDI '+str(accepted[p['id']]),creator='VCSL contributors (Versilian Studios Community Library)',license='CC0-1.0',redistribution=True,provenance='Pinned VCSL original recording '+p['path'],sourceUrl=s['url'],rightsEvidence='https://github.com/sgossner/VCSL/blob/'+prior['revision']+'/LICENSE',sha256=s['sha256'],tags=['recorded','historical','research-only',p['group']],approval='research-only',pin=dict(revision=prior['revision'],blob=p['blob'],bytes=p['size']),instrument='psaltery',articulation=p['group'],expectedMidi=accepted[p['id']],measuredMidi=pitch['measuredMidi'],upstreamLabel=p['label']))
    entries.sort(key=lambda e:e['id'])
    if len(entries)!=46 or len({e['sha256'] for e in entries})!=46: raise ValueError('catalog inventory')
    db=sqlite3.connect(lib/'catalog.sqlite')
    with db:
        db.executescript('CREATE TABLE samples(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,metadata TEXT NOT NULL); CREATE INDEX samples_hash ON samples(sha256); CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED,title,creator,tags);')
        for e in entries:
            db.execute('INSERT INTO samples VALUES(?,?,?)',(e['id'],e['sha256'],json.dumps(e,separators=(',',':'))))
            db.execute('INSERT INTO search VALUES(?,?,?,?)',(e['id'],e['title'],e['creator'],' '.join(e['tags'])))
    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute("SELECT count(*) FROM search WHERE search MATCH 'psaltery'").fetchone()[0]!=9: raise ValueError('catalog validation')
    db.close(); save('library/index.json',{'approval':'research-only','entries':entries})
    zones={r['pin']['id']:(accepted[r['pin']['id']],r['pitch']['measuredMidi'],r['pitch']['onset']) for r in receipts}
    for g in prior['groups']:
        if g['accepted']:
            for r in g['roots']:
                x=next(x for x in evidence['items'] if x['pin']['id']==r['id']);zones[r['id']]=(r['midi'],r['measuredMidi'],x['pitch']['onset'])
    seconds=42; stems={g:np.zeros((seconds*SR,2)) for g in ['psaltery-bow','psaltery-pluck','psaltery-spiccato','organ-8','organ-4']}; events=[]
    def note(group,midi,start,duration,velocity,pan):
        keys=[k for k in zones if k.startswith(group+'-')]; key=min(keys,key=lambda k:abs(zones[k][0]-midi)); expected,measured,onset=zones[key]
        if abs(expected-midi)>3: raise ValueError('pitch coverage')
        rate=2**((midi-measured)/12); pcm=pcms[key][onset:]; limit=(len(pcm)-1)/rate
        finite=group in ('psaltery-pluck','psaltery-spiccato'); n=int(limit if finite else min(limit,duration*SR)); offset=round(start*SR)
        if n<240 or offset+n>seconds*SR: raise ValueError('invalid note timeline')
        signal=np.interp(np.arange(n)*rate,np.arange(len(pcm)),pcm); peak=np.max(np.abs(signal)); rms=np.sqrt(np.mean(signal[:min(n,SR//4)]**2)); gain=velocity*min(.25/peak,.065/max(rms,.001)); fade=np.minimum(1,np.minimum(np.arange(n)/96,(n-1-np.arange(n))/(480 if finite else 5760))); signal=signal*gain*fade
        stems[group][offset:offset+n]+=signal[:,None]*np.sqrt([(1-pan)/2,(1+pan)/2]);events.append(dict(group=group,source=key,midi=midi,startFrame=offset,frames=n,rate=rate,finite=finite))
    melody=[74,72,70,72,74,77,74,72,70,72,74,70]; bass=[74,72,70,69,74,72,74,72,70,69,72,74]
    for i,(m,b) in enumerate(zip(melody,bass)):
        t=i*3;note('organ-8',b,t,2.7,.65,-.08);note('psaltery-bow',m,t+.12,1.4,.62,-.32);note('psaltery-bow',melody[(i+1)%12],t+1.6,1.1,.47,-.32)
        for j,v in enumerate([70,74,86] if i%3==0 else [74,70,74]):note('psaltery-pluck',v,t+j*.85,0,.5 if j<2 else .32,.32)
        if 3<=i<=9:note('psaltery-spiccato',[70,72,78][i%3],t+1.95,0,.55,-.25)
        if 4<=i<=10:note('organ-4',[84,86,88][i%3],t+.35,1.8,.28,.15)
    if not set(accepted)<=set(e['source'] for e in events): raise ValueError('source coverage')
    mix=sum(stems.values()); gain=min(3,10**(-3/20)/max(np.max(np.abs(mix)),*(np.max(np.abs(a)) for a in stems.values()))); mix*=gain
    for a in stems.values():a*=gain
    quant=lambda a:np.rint(a*32767).astype('<i2'); q=quant(mix); error=int(np.max(np.abs(sum(quant(a).astype(np.int32) for a in stems.values())-q.astype(np.int32))))
    if error>3: raise ValueError('stem reconstruction')
    metrics=[]
    for name,a in [('cloister-procession',mix),*[(f'cloister-procession-{g}',a) for g,a in stems.items()]]:
        file=root/(name+'.wav')
        with wave.open(str(file),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(quant(a).tobytes())
        metrics.append(dict(file=file.name,sha256=sha(file.read_bytes()),peak=float(np.max(np.abs(a))),rms=float(np.sqrt(np.mean(a*a))),frames=len(a)))
    save('metrics.json',dict(approval='research-only',catalogCount=len(entries),admitted=accepted,score=events,masterGain=float(gain),pcmError=error,metrics=metrics))
    print('Catalog',len(entries),'events',len(events),'PCM error',error)
