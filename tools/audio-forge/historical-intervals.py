"""Research-only interval acquisition. Real source transitions, not synthetic note joins."""
import hashlib, json, pathlib, subprocess, sys, wave
import numpy as np
from historical_interval_phrase import render_interval_phrase
SR=48000
REV='fac6461ee4c7f498b23246eced644616fa58d2ec'
PINS=json.loads('''[{"id":"voice-50-52","path":"Samples/vowel_transition/a/vowel_a_e4_fromd4.wav","blob":"f2097ef58b844f8c330e346917c7ff63d3ba59ff","size":317600,"upstreamFrom":62,"upstreamTo":64,"fromMidi":50,"toMidi":52},{"id":"voice-52-53","path":"Samples/vowel_transition/a/vowel_a_f4_frome4.wav","blob":"799f768f3043675a17b1526b2d223509547c531d","size":317600,"upstreamFrom":64,"upstreamTo":65,"fromMidi":52,"toMidi":53},{"id":"voice-53-55","path":"Samples/vowel_transition/a/vowel_a_g4_fromf4.wav","blob":"888cd2cb6c1c7b8772ed3d8bb300df89762b0487","size":317600,"upstreamFrom":65,"upstreamTo":67,"fromMidi":53,"toMidi":55},{"id":"voice-55-53","path":"Samples/vowel_transition/a/vowel_a_f4_fromg4.wav","blob":"94f0e9ce82560e102dd765fb0f4db33bf8b932b6","size":317600,"upstreamFrom":67,"upstreamTo":65,"fromMidi":55,"toMidi":53},{"id":"voice-53-52","path":"Samples/vowel_transition/a/vowel_a_e4_fromf4.wav","blob":"1a9bc99e56ce23f54e06fca011f4694026a4d9d4","size":317600,"upstreamFrom":65,"upstreamTo":64,"fromMidi":53,"toMidi":52},{"id":"voice-52-50","path":"Samples/vowel_transition/a/vowel_a_d4_frome4.wav","blob":"cde061a58ec8f140346ee02e2edd4bfe909f2d41","size":317600,"upstreamFrom":64,"upstreamTo":62,"fromMidi":52,"toMidi":50}]''')
BASE='https://raw.githubusercontent.com/sfzinstruments/legato_vocal_tutorial/'+REV+'/'
RIGHTS='https://github.com/sfzinstruments/legato_vocal_tutorial/blob/'+REV+'/LICENSE'
MAPPING='Programs/modules/vowel_transition_a.sfz'
MAPPING_BLOB='a2aa8a4319a73b23fa5e25ea3b913d9a32a77af6'

sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def rms(x):return float(np.sqrt(np.mean(x*x)))
def pitch_track(pcm):
    if pcm.ndim!=1 or len(pcm)<SR*.2 or not np.all(np.isfinite(pcm)) or np.max(np.abs(pcm))>1.1:raise ValueError('invalid PCM')
    a=pcm[:len(pcm)//4*4].reshape(-1,4).mean(axis=1); rate=12000;n=540;maxlag=120;minlag=7; hop=240
    peak=float(np.max(np.abs(a))); rows=[]
    hann=np.hanning(n); t=np.arange(n)/rate
    def amp(x,f):
        return float(abs(np.dot(x*hann,np.exp(-2j*np.pi*f*t)))*2/hann.sum())
    for i in range(0,len(a)-n-maxlag,hop):
        x=a[i:i+n]; level=rms(x)
        if level<max(.0015,peak*.025):continue
        d=np.array([0.]+[np.sum((x-a[i+k:i+k+n])**2) for k in range(1,maxlag+1)])
        d[1:]=d[1:]*np.arange(1,maxlag+1)/np.maximum(np.cumsum(d[1:]),1e-15);d[0]=1
        lag=next((k for k in range(minlag,maxlag) if d[k]<.22 and d[k]<=d[k-1] and d[k]<d[k+1]),None)
        if lag is None:continue
        den=d[lag-1]-2*d[lag]+d[lag+1]; delta=np.clip(.5*(d[lag-1]-d[lag+1])/den,-.5,.5) if den>1e-12 else 0
        f=rate/(lag+delta);fund=amp(x,f); harmonics=[amp(x,f*k) for k in (1,2,3,4,5) if f*k<rate/2]
        rel=fund/max(max(harmonics),1e-12); sub=amp(x,f/2)/max(fund,1e-12)
        if rel<.06 or sub>.55:continue
        rows.append(dict(sec=i/rate,midi=float(69+12*np.log2(f/440)),periodicity=float(d[lag]),rms=level,fundamentalRelative=rel,subharmonicRelative=sub))
    return rows

def continuous(pcm,start,end):
    x=pcm[round(start*SR):round(end*SR)];n=len(x)//480
    if n<3:return 0.
    levels=np.sqrt(np.mean(x[:n*480].reshape(n,480)**2,axis=1))
    return float(np.min(levels)/max(np.median(levels),1e-12))
def measure(pcm,p):
    rows=pitch_track(pcm)
    def window(lo,hi):
        a=[r['midi'] for r in rows if lo<=r['sec']<=hi]
        return (float(np.median(a)),float(max(a)-min(a)),len(a)) if a else (None,None,0)
    a,aspread,an=window(0,.08); b,bspread,bn=window(.30,.70)
    ratio=continuous(pcm,.04,.34)
    ok=an>=3 and bn>=8 and aspread<=.85 and bspread<=1.2 and abs(a-p['fromMidi'])<=.75 and abs(b-p['toMidi'])<=.75 and ratio>=.12
    return dict(accepted=bool(ok),fromMeasured=a,toMeasured=b,fromWindows=an,toWindows=bn,fromSpread=aspread,toSpread=bspread,continuityRatio=ratio,track=rows,mode='recorded-interval' if ok else 'quarantined')
def self_test():
    t=np.arange(round(SR*1.2))/SR;f=np.where(t<.15,440.,493.883301);phase=np.cumsum(2*np.pi*f/SR)
    a=.15*np.sin(phase)+.05*np.sin(2*phase)+.03*np.sin(3*phase)
    p=dict(fromMidi=69,toMidi=71)
    assert measure(a,p)['accepted']
    assert not measure(a,dict(fromMidi=81,toMidi=83))['accepted']
    assert not measure(a,dict(fromMidi=71,toMidi=69))['accepted']
    b=a.copy();b[round(.10*SR):round(.19*SR)]=0;assert not measure(b,p)['accepted']
    assert not measure(np.zeros_like(a),p)['accepted']
    assert continuous(a,.04,.34)>.7
    print('6 interval checks passed')
def fetch(url,limit):
    return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-time','45','--retry','1','--max-filesize',str(limit),'-A','PocketWorks-SoundForge/1.0 (research; github.com/JustSadSock/pocket-works)',url],stderr=subprocess.PIPE)
def decode(file):
    raw=subprocess.check_output(['sox','-R','-v','.8',str(file),'-t','raw','-e','floating-point','-b','32','-L','-c','2','-r','48000','-'])
    a=np.frombuffer(raw,'<f4').reshape(-1,2).astype(float)
    if not np.all(np.isfinite(a)) or not SR*.2<=len(a)<=SR*30 or np.max(np.abs(a))>1.1:raise ValueError('decoded PCM')
    return a
def write(root,name,a):
    if a.ndim!=2 or a.shape[1]!=2 or not np.all(np.isfinite(a)) or np.max(np.abs(a))>=1 or not np.any(a):raise ValueError('invalid audition')
    f=root/name
    with wave.open(str(f),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(np.rint(a*32767).astype('<i2').tobytes())
    return dict(file=name,sha256=sha(f.read_bytes()),frames=len(a),channels=2,peak=float(np.max(np.abs(a))))
def recorder_candidate(root):
    # File history is independently documented by Commons; content is not yet a frozen production pin.
    page='https://commons.wikimedia.org/wiki/File:SopranoRecorder.ogg'
    url='https://upload.wikimedia.org/wikipedia/commons/6/69/SopranoRecorder.ogg'
    api='https://commons.wikimedia.org/w/api.php?action=query&titles=File%3ASopranoRecorder.ogg&prop=imageinfo&iiprop=sha1%7Csize%7Curl%7Ctimestamp&format=json'
    receipt=dict(source=page,author='Thparkth',rights='PD-user',expectedBytes=244296,expectedTimestamp='2012-03-15T07:00:00Z',approval='candidate-only',admitted=0)
    try:
        evidence=json.loads(fetch(api,100000)); info=next(iter(evidence['query']['pages'].values()))['imageinfo'][0]
        receipt['observedImageInfo']={k:info.get(k) for k in ('url','size','timestamp','sha1')}
        (root/'recorder-imageinfo.json').write_text(json.dumps(evidence,indent=2)+'\n')
        # The public history displays minute precision, not the seconds field.
        if info['url']!=url or info['size']!=244296 or not info['timestamp'].startswith('2012-03-15T07:00:'):raise ValueError('file revision differs from documented source')
        b=fetch(url,300000)
        # MediaWiki returns SHA-1 in hexadecimal or base36 depending on endpoint.
        digest=hashlib.sha1(b).hexdigest(); h=info['sha1']
        if len(b)!=244296 or not b.startswith(b'OggS') or not (h==digest or int(h,36)==int(digest,16)):raise ValueError('source identity mismatch')
        f=root/'sources/SopranoRecorder.ogg';f.write_bytes(b);a=decode(f);mono=a.mean(axis=1);rows=pitch_track(mono)
        receipt.update(sourceSha256=sha(b),upstreamSha1=h,sourceFile='sources/SopranoRecorder.ogg',track=rows)
        # Identify candidate connected adjacent pitch regions; never admit these as dedicated legato
        # without articulation review. Preserve the continuous recording rather than inventing cuts.
        runs=[]
        for r in rows:
            note=round(r['midi'])
            if abs(note-r['midi'])>.45:continue
            if runs and runs[-1]['midi']==note and r['sec']-runs[-1]['end']<=.041:
                runs[-1]['end']=r['sec'];runs[-1]['windows']+=1
            else:runs.append(dict(midi=note,start=r['sec'],end=r['sec'],windows=1))
        pairs=[]
        for x,y in zip(runs,runs[1:]):
            gap=y['start']-x['end']
            if x['windows']>=4 and y['windows']>=4 and x['midi']!=y['midi'] and 0<gap<=.10:
                ratio=continuous(mono,max(x['start'],x['end']-.04),min(y['end'],y['start']+.06))
                if ratio>=.12:pairs.append(dict(fromMidi=x['midi'],toMidi=y['midi'],fromEnd=x['end'],toStart=y['start'],continuityRatio=ratio))
        receipt['connectedCandidates']=pairs
        gain=min(3,.65/np.max(np.abs(a))); receipt['diagnostic']=write(root,'recorder-native-phrase.wav',a*gain)
    except (OSError,subprocess.SubprocessError,ValueError,KeyError,IndexError,StopIteration) as e:receipt['blocked']=str(e)
    return receipt
def main(root):
    root=pathlib.Path(root).resolve();(root/'sources').mkdir(parents=True,exist_ok=True)
    license=fetch(BASE+'LICENSE',20000)
    if blob(license)!='0e259d42c996742e9e3cba14c677129b2c1b6311':raise ValueError('license identity')
    (root/'LICENSE').write_bytes(license)
    mapping=fetch(BASE+MAPPING,80000)
    if blob(mapping)!=MAPPING_BLOB:raise ValueError('mapping identity')
    (root/'mapping.sfz').write_bytes(mapping)
    receipts=[]; accepted=[]; clips={}; native_clips={}
    def save():
        (root/'admission.json').write_text(json.dumps(dict(approval='research-only',revision=REV,rights=RIGHTS,sourceCreator='Karoryfer Samples / Hadzi-Fia',mappingBlob=MAPPING_BLOB,candidates=receipts,admitted=len(accepted)),indent=2)+'\n')
    for p in PINS:
        if ('sample=../'+p['path']+'\nsw_previous='+str(p['upstreamFrom'])+' key='+str(p['upstreamTo'])) not in mapping.decode():raise ValueError('mapping mismatch')
        b=fetch(BASE+p['path'],500000)
        if len(b)!=p['size'] or blob(b)!=p['blob'] or b[:4]!=b'RIFF':raise ValueError('source mismatch '+p['id'])
        f=root/'sources'/(p['id']+'.wav');f.write_bytes(b);a=decode(f)
        result=measure(a.mean(axis=1),p)
        receipt=dict(pin=p,sourceSha256=sha(b),sourceFile='sources/'+f.name,pitch=result,license='CC0-1.0',approval='research-only' if result['accepted'] else 'quarantined')
        # A diagnostic is a gain-normalized excerpt of one native recording, not a synthesized transition.
        x=a.copy();g=min(3,.65/np.max(np.abs(x)));fade=np.minimum(1,np.minimum(np.arange(len(x))/240,(len(x)-1-np.arange(len(x)))/960));x*=fade[:,None]*g
        receipt['audition']=write(root,p['id']+'-native.wav',x); receipts.append(receipt)
        if result['accepted']:
            accepted.append(receipt);clips[(p['fromMidi'],p['toMidi'])]=x;native_clips[(p['fromMidi'],p['toMidi'])]=a
        save()
    # A sequence of native intervals (not a continuous multi-note performance): 0.35s silence between clips.
    # Every source clip has its measured physical pitch change intact, at native playback speed.
    if len(accepted)<2:raise ValueError('insufficient independently verified recorded intervals')
    reel=[];positions=[];cursor=0
    for r in accepted:
        p=r['pin'];x=clips[(p['fromMidi'],p['toMidi'])];positions.append(dict(id=p['id'],startFrame=cursor,frames=len(x),nativeRate=1))
        reel.extend((x,np.zeros((round(.35*SR),2))));cursor+=len(x)+round(.35*SR)
    output=write(root,'recorded-interval-reel.wav',np.concatenate(reel))
    phrase_path=[50,52,53,55,53,52,50]
    if all(pair in native_clips for pair in zip(phrase_path,phrase_path[1:])):
        audio,phrase=render_interval_phrase(native_clips,phrase_path)
        for event in phrase['events']:
            event['sourceSha256']=next(r['sourceSha256'] for r in accepted if (r['pin']['fromMidi'],r['pin']['toMidi'])==(event['fromMidi'],event['toMidi']))
        phrase['output']=write(root,'recorded-vocal-connected-phrase.wav',audio)
        for bad in ([50,55],[50,52,50,50]):
            try:render_interval_phrase(native_clips,bad)
            except ValueError:pass
            else:raise AssertionError('unsupported transition accepted')
        repeat,_=render_interval_phrase(native_clips,phrase_path)
        if not np.array_equal(audio,repeat):raise ValueError('phrase nondeterminism')
        (root/'phrase-receipt.json').write_text(json.dumps(phrase,indent=2)+'\n')
        print('Native connected phrase',len(phrase['events']),'protected intervals',len(phrase['joins']),'joins')
    else:raise ValueError('complete admitted interval path required')
    recorder=recorder_candidate(root)
    (root/'metrics.json').write_text(json.dumps(dict(approval='research-only',voiceIntervalCount=len(accepted),historicalInstrumentIntervalCount=0,voiceReel=output,positions=positions,connectedPhrase=phrase,recorderCandidate=recorder,sourceInventory=len(receipts)),indent=2)+'\n')
    print('Admitted recorded vocal intervals',len(accepted),'recorder candidates',len(recorder.get('connectedCandidates',[])))
if __name__=='__main__':
    self_test()
    if len(sys.argv)>1 and sys.argv[1]!='--self-test':main(sys.argv[1])
