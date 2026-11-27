import numpy as np
SR=48000

def render_interval_phrase(clips, path):
    """Native-rate directed intervals; splice only sustained endpoints, never the transition."""
    if len(path)<2 or any(a==b for a,b in zip(path,path[1:])):raise ValueError('invalid interval score')
    pairs=list(zip(path,path[1:]))
    if any(pair not in clips for pair in pairs):raise ValueError('unadmitted directed interval')
    overlap=round(.04*SR); cut=round(.54*SR); protected=(round(.08*SR),round(.30*SR))
    audio=None; events=[]; joins=[]; normalized=[]
    for i,pair in enumerate(pairs):
        source=np.asarray(clips[pair],dtype=float)
        if source.ndim!=2 or source.shape[1]!=2 or len(source)<cut+overlap or not np.all(np.isfinite(source)):raise ValueError('invalid clip')
        level=float(np.sqrt(np.mean(source[round(.3*SR):round(.5*SR)]**2)))
        if level<.002:raise ValueError('silent clip')
        gain=float(np.clip(.12/level,.5,2.0)); x=source.copy()*gain
        if i<len(pairs)-1:x=x[:cut]
        if audio is None:
            offset=0;audio=x.copy();audio[:240]*=np.linspace(0,1,240)[:,None]
        else:
            offset=len(audio)-overlap
            previous=normalized[-1]; nominal=offset-events[-1]['startFrame']; limit=round(.008*SR)
            incoming=x[:overlap].mean(axis=1); incoming-=incoming.mean()
            def correlation(k):
                y=previous[nominal+k:nominal+k+overlap].mean(axis=1);y-=y.mean()
                return float(np.dot(y,incoming)/max(np.linalg.norm(y)*np.linalg.norm(incoming),1e-12))
            k=max(range(-limit,limit+1,4),key=correlation)
            offset+=k; end=offset+overlap; audio=np.concatenate((audio[:offset],previous[nominal+k:nominal+k+overlap]))
            w=(.5-.5*np.cos(np.linspace(0,np.pi,overlap)))[:,None]
            audio[offset:end]=audio[offset:end]*(1-w)+x[:overlap]*w
            audio=np.concatenate((audio,x[overlap:]))
            joins.append(dict(frame=offset,frames=overlap,alignmentFrames=k,correlation=correlation(k)))
        normalized.append(source*gain)
        events.append(dict(fromMidi=pair[0],toMidi=pair[1],startFrame=offset,protectedSourceFrames=list(protected),nativeRate=1,gain=gain))
    audio[-1920:]*=np.linspace(1,0,1920)[:,None]
    master=min(1.,.707945784/max(np.max(np.abs(audio)),1e-12));audio*=master
    for event,source in zip(events,normalized):
        lo,hi=protected;offset=event['startFrame']
        if not np.allclose(audio[offset+lo:offset+hi],source[lo:hi]*master,atol=1e-12,rtol=0):raise ValueError('protected transition changed')
    for j in joins:
        i=j['frame'];n=j['frames']; y=audio[i-480:i+n+480];levels=np.sqrt(np.mean(y[:len(y)//480*480].reshape(-1,480,2)**2,axis=(1,2)))
        j['continuityRatio']=float(levels.min()/max(np.median(levels),1e-12));j['maxSampleStep']=float(np.max(np.abs(np.diff(y,axis=0))))
        if j['continuityRatio']<.12 or j['maxSampleStep']>.2:raise ValueError('splice quality')
    return audio,dict(events=events,joins=joins,masterGain=master,protectedTransitions=len(events),mode='recorded-interval-phrase-spliced',approval='research-only')
