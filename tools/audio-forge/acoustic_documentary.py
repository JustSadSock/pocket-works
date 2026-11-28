"""Bounded lawful acquisition of documentary recordings, separately from game Foley.
No retries around denied access. Do not infer inhale/exhale from energy segmentation."""
import hashlib,json,pathlib,urllib.request,urllib.parse,sys,time
import numpy as np
from scipy.signal import find_peaks
from acoustic_resynthesis import decode,analyze,render,save,descriptors,distance,SR
SPECS=[
 dict(file='Breathing_man.ogg',title='Breathing man',creator='hugh',revision=831970510,expectedSha1='e588e74da090efea5b528b979dcd1a93cc728eeb',kind='breathing',conditions='Exaggerated breathing by adult man, 2008-05-06; original MP3 mono, published Commons OGG transcode; microphone/distance unknown; segments not verified inhale/exhale.',event='Human breathing (inhaling and exhaling), not isolated confirmed exhale'),
 dict(file='Metal_pot_and_lid_percu.ogg',title='Metal Pot and Lid Percussion',creator='stilgar',revision=722713457,kind='metal',conditions='Hitting a metal pot and lid, 2008-08-26; original FLAC mono, published Commons OGG transcode; striker, force, dimensions, microphone unknown.',event='Metal pot/lid percussion; not swords or shields')
]
def get(url,maxbytes):
    req=urllib.request.Request(url,headers={'User-Agent':'PocketWorksSoundForge/0.1 (acoustic reference research; https://github.com/JustSadSock/pocket-works)'})
    with urllib.request.urlopen(req,timeout=15) as r:
        b=r.read(maxbytes+1)
        if len(b)>maxbytes:raise ValueError('Size limit')
        return b
def main(out):
    out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);receipts=[]
    for spec in SPECS:
        e=dict(spec,license='public-domain',sourceUrl=f"https://commons.wikimedia.org/w/index.php?oldid={spec['revision']}",rightsEvidence='PD-pdsounds and PD-author worldwide dedication, Commons reviewed description revision; not raw original session WAV.')
        try:
            params=urllib.parse.urlencode({'action':'query','titles':'File:'+spec['file'],'prop':'imageinfo','iiprop':'url|sha1|size|timestamp','format':'json'})
            j=json.loads(get('https://commons.wikimedia.org/w/api.php?'+params,100000));page=next(iter(j['query']['pages'].values()));i=page['imageinfo'][0];url=i['url']
            if urllib.parse.urlsplit(url).hostname!='upload.wikimedia.org' or i['size']>3*1024*1024:raise ValueError('Unexpected original source')
            expected=i['sha1'];expected=expected.lower() if len(expected)==40 else format(int(expected,36),'040x')
            if spec.get('expectedSha1') and expected!=spec['expectedSha1']:raise ValueError('Pinned source drift')
            b=get(url,3*1024*1024);assert len(b)==i['size'] and hashlib.sha1(b).hexdigest()==expected and b[:4]==b'OggS'
            # Only the historical original upload, not an arbitrary replacement.
            if not i['timestamp'].startswith('2013-01-19'):raise ValueError('Unexpected upload revision')
            p=out/spec['file'];p.write_bytes(b);e.update(status='acquired',sha256=hashlib.sha256(b).hexdigest(),sha1=expected,bytes=len(b),url=url,upload=i['timestamp'])
        except Exception as ex:
            e.update(status='blocked',reason=str(ex));receipts.append(e);continue
        x=decode(p);hop=480;env=np.array([np.sqrt(np.mean(x[k:k+hop]**2)) for k in range(0,len(x),hop)])
        # Distinct events, no claim of force or breathing direction.
        peaks,_=find_peaks(env,distance=120 if spec['kind']=='breathing' else 90,prominence=max(.0001,env.max()*.10))
        windows=[]
        for k in peaks:
            left=max(0,k-(55 if spec['kind']=='breathing' else 9));right=min(len(env),k+(70 if spec['kind']=='breathing' else 55))
            if windows and left*hop<windows[-1][1]:continue
            windows.append((left*hop,min(len(x),right*hop)))
            if len(windows)==3:break
        if len(windows)<2:
            e.update(analysis='blocked: fewer than two separated energetic events');receipts.append(e);continue
        a,b=windows[0];c,d=windows[1];train=x[a:b];held=x[c:d];m=analyze(train);u,v=render(m,seed=77);g=min(1,.8/max(np.max(abs(w)) for w in [train,held,u+v]))
        prefix=spec['kind'];files={}
        for name,w in [('training',train),('holdout',held),('resynthesis',u+v)]:
            f=out/f'{prefix}-{name}.wav';files[name]=save(f,w*g)
        (out/f'{prefix}-model.json').write_text(json.dumps(m,separators=(',',':'))+'\n')
        e.update(analysis='automatic energetic windows; physical event identity and breath direction unverified',windows=windows,files=files,fixedGain=g,heldoutDistance=distance(descriptors(held),descriptors(u+v)))
        receipts.append(e)
    (out/'documentary-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n');print(json.dumps([{k:v for k,v in e.items() if k in ('title','status','sha256','reason','analysis')} for e in receipts],indent=2))
if __name__=='__main__':main(sys.argv[1])
