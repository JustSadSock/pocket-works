"""Stage-II original E-Phrygian political procession. Research-only, recorded sources."""
import hashlib,io,json,math,pathlib,subprocess,sys,wave
import numpy as np
from scipy.signal import butter,sosfilt

SR=48000; BPM=96; PPQ=24; MODE={4,5,7,9,11,0,2}
SPEC=[('empty-throne',5,4),('procession',5,12),('conspiracy',3,8),('bargain',5,10),('the-weight',5,14),('price',5,8)]
PARTS={
 'bass':('double-bass','sustain',0,.92,'low-strings',.055),
 'cello':('cello-section','arco-vib',-.18,.82,'low-strings',.12),
 'violin':('violin','arco-vib',.34,.47,'upper-strings',.15),
 'horn':('horn','sustain',-.27,.82,'brass',.17),
 'trumpet':('trumpet','sustain',.18,.42,'brass',.16),
 'clarinet':('clarinet','sustain',.24,.52,'woodwinds',.14),
 'harp':('folk-harp','pluck',-.42,.56,'plucked-organ',.12),
 'organ':('renaissance-organ','organ-full',0,.22,'plucked-organ',.22),
 'frame-open':('frame-drum','open',-.08,.44,'percussion',.06),
 'frame-muted':('frame-drum','muted',.16,.32,'percussion',.06),
 'bassdrum':('bass-drum','hit',0,.66,'percussion',.05),
 'timpani-hit':('timpani','hit',-.12,.52,'percussion',.08),
 'timpani-roll':('timpani','roll',.12,.35,'percussion',.08)}
GROUPS=('low-strings','upper-strings','brass','woodwinds','plucked-organ','percussion')
def make_score():
    events=[];sections=[];tick=0;barno=0
    for name,beats,bars in SPEC:
        sections.append(dict(id=name,startTick=tick,startBar=barno,bars=bars,meter=[beats,4],beatsPerBar=beats,durationTicks=bars*beats*PPQ))
        tick+=bars*beats*PPQ;barno+=bars
    def add(part,midi,start,dur,vel,art=None):
        t=int(round(start*PPQ));d=int(round(dur*PPQ))
        if d<=0:raise ValueError('nonpositive duration')
        if midi is not None and midi%12 not in MODE:raise ValueError(f'out-of-mode note {midi}')
        if t<0 or t+d>tick:raise ValueError('event outside form')
        e=dict(part=part,midi=midi,tick=t,durationTicks=d,velocity=round(float(np.clip(vel,.05,1)),4))
        if art:e['articulation']=art
        events.append(e)
    def at(sec,bar,beat,part,midi,dur,vel,art=None):
        s=sections[sec];barlen=s['beatsPerBar']*PPQ
        add(part,midi,(s['startTick']+bar*barlen)/PPQ+beat,dur,vel,art)
    # I. Empty throne: sound appears in fragments, with space between gestures.
    at(0,0,0,'bass',28,5,.37);at(0,0,0,'cello',50,4.5,.32);at(0,0,3,'horn',53,2,.25)
    at(0,1,0,'bass',35,3,.32);at(0,1,0,'cello',53,5,.30);at(0,1,3.5,'clarinet',62,1.5,.23)
    at(0,2,0,'bass',28,5,.34);at(0,2,1.5,'harp',64,.5,.24);at(0,2,3.5,'horn',55,1.5,.24)
    at(0,3,0,'bass',28,5,.39);at(0,3,0,'horn',59,4,.32);at(0,3,3.5,'timpani-roll',None,1.5,.40)
    # II. Procession: asymmetrical 3+2 bass pulse, varied answers and displaced accents.
    bass_patterns=[
      [(0,28,1.5),(1.5,35,.5),(2.5,31,.5),(3,29,1),(4.5,28,.5)],
      [(0,28,1),(1,31,.5),(1.5,35,1),(3,36,.5),(3.5,33,1),(4.5,28,.5)],
      [(0,28,2),(2,35,.5),(2.5,31,1),(3.5,29,.5),(4,40,1)],
      [(0,33,1),(1,35,.5),(1.5,38,1),(3,36,.5),(3.5,31,1),(4.5,28,.5)]]
    cello_a=[50,53,55,57,59,57,55,53,52,53,57,59]
    cello_b=[53,55,57,59,57,55,53,52,53,55,59,60]
    horn_patterns=[
      [(0,59,1.5),(1.5,57,1),(2.5,55,2.5)],
      [(0,57,2),(2,60,1),(3,59,2)],
      [(0,55,1),(1,57,1),(2,59,1),(3,60,2)],
      [(0,60,2.5),(2.5,59,1),(3.5,57,1.5)]]
    clarinet_patterns=[
      [(0,64,1),(1.5,65,.5),(2,67,1),(3.5,65,1)],
      [(0,67,1.5),(1.5,69,.5),(2.5,67,1),(4,64,1)],
      [(0,65,1),(1,67,1),(2.5,69,1),(4,67,1)]]
    for j in range(12):
        pat=bass_patterns[(j+j//3)%4]
        for beat,m,d in pat:at(1,j,beat,'bass',m,d,.57+.07*(j%3==2))
        at(1,j,0,'cello',cello_a[j],2.5,.49)
        at(1,j,2.5,'cello',cello_b[j],2.5,.43)
        if j%2==0:
            for beat,m,d in horn_patterns[(j//2)%4]:at(1,j,beat,'horn',m,d,.43+.05*(j%4==0))
        if j%3==1:
            for beat,m,d in clarinet_patterns[(j//3)%3]:at(1,j,beat,'clarinet',m,d,.34)
        if j>=4 and j%2==0:
            row=[(0,77,1),(1,76,.5),(1.5,71,1),(3,69,1),(4,67,.75)]
            for beat,m,d in row:at(1,j,beat,'violin',m,d,.40)
        for beat,m in [(.5,64),(2.5,67),(4.5,71)]:at(1,j,beat,'harp',m,.45,.30)
        if j%2==0:
            at(1,j,0,'frame-open',None,.5,.52);at(1,j,3,'frame-open',None,.5,.40)
        if j%3==1:
            at(1,j,1.5,'frame-muted',None,.5,.32);at(1,j,4.5,'frame-muted',None,.5,.28)
        if j in (0,4,8,11):at(1,j,0,'bassdrum',None,1,.66 if j!=11 else .90)
        if j in (3,7,11):at(1,j,0,'timpani-hit',None,1,.62)
        if j==10:at(1,j,4,'timpani-roll',None,1,.58)
    # III. Conspiracy: 3/4, thinner pulse, longer counter-lines.
    cnotes=[53,52,50,52,55,53,52,50]
    clarinet_3=[
      [(0,72,.75),(1,69,.5),(1.5,67,.5),(2.25,65,.5)],
      [(0,67,1),(1.25,69,.5),(2,71,.75)],
      [(0,70,.5),(.75,69,.5),(1.5,65,.5),(2,64,.75)],
      [(0,65,1),(1.5,64,.5),(2,62,.75)]]
    for j in range(8):
        if j%2==0:at(2,j,0,'bass',28 if j<4 else 35,3,.31)
        at(2,j,0,'cello',cnotes[j],3,.34)
        for beat,m,d in clarinet_3[j%4]:at(2,j,beat,'clarinet',m,d,.31)
        if j%2==0:at(2,j,0,'violin',[72,71,69,67][j//2],3,.29)
        at(2,j,1.5,'harp',[67,69,71,64][j%4],.5,.22)
        if j in (2,6):at(2,j,2.5,'horn',53 if j==2 else 59,.5,.20)
    # IV. Bargain: displaced accents and a semitone conflict over the E pedal.
    bargain_bass=[
      [(1,28,1),(2.5,35,.5),(3,31,1),(4.5,29,.5)],
      [(.5,28,1.5),(2.5,33,.5),(3.5,36,.5),(4,31,1)],
      [(0,28,1),(1.5,35,1),(3,29,.5),(3.5,40,1)],
      [(1,33,.5),(1.5,35,1),(3,38,1),(4.5,28,.5)]]
    for j in range(10):
        for beat,m,d in bargain_bass[(j+j//2)%4]:at(3,j,beat,'bass',m,d,.66)
        at(3,j,0,'cello',53 if j%2==0 else 52,3,.55)
        at(3,j,3,'cello',52 if j%2==0 else 53,2,.48)
        at(3,j,0,'horn',[59,60,57,55,53][j%5],2.5,.47)
        at(3,j,2.5,'horn',[57,55,53,59,60][j%5],2.5,.43)
        for beat,m,d in [(0,65,1),(1.5,67,.5),(2,69,1),(3.5,67,.5),(4,64,1)]:at(3,j,beat,'clarinet',m,d,.36)
        if j%2==0:
            at(3,j,0,'violin',77 if j%4==0 else 76,1.5,.36)
            at(3,j,2,'violin',71 if j%4==0 else 69,1.5,.32)
        at(3,j,1.5,'frame-muted',None,.5,.36);at(3,j,3.5,'frame-open',None,.5,.38)
        if j in (0,5,9):at(3,j,4.5,'bassdrum',None,.5,.62)
        if j==9:at(3,j,2.5,'timpani-roll',None,2.5,.76)
        if j in (3,7):at(3,j,0,'timpani-hit',None,1,.55)
    # V. The Weight: broad register, independent lines, staggered brass and a dense pulse.
    weight_bass=[
      [(0,28,1.5),(1.5,35,.5),(2,31,1),(3.5,29,.5),(4,40,1)],
      [(0,28,1),(1,33,.5),(1.5,35,1),(3,36,.5),(3.5,31,1),(4.5,28,.5)],
      [(0,28,2),(2,35,.5),(2.5,38,.5),(3,36,1),(4,43,1)],
      [(0,33,1),(1,35,.5),(1.5,38,1),(3,40,.5),(3.5,31,1),(4.5,28,.5)]]
    weight_melodies=[
      [(0,77,1),(1,76,.5),(1.5,71,1),(2.5,74,.5),(3,72,1),(4,69,1)],
      [(0,76,1.5),(1.5,77,.5),(2,79,1),(3,77,.5),(3.5,74,1),(4.5,72,.5)],
      [(0,74,1),(1,76,1),(2,77,.5),(2.5,76,.5),(3,71,1),(4,69,1)],
      [(0,72,1.5),(1.5,74,.5),(2,76,1),(3,77,1),(4,76,1)]]
    horn_a=[55,57,59,60,62,64,62,60,59,57,55,53,52,53]
    horn_b=[59,60,62,64,60,59,57,55,57,59,60,62,64,60]
    for j in range(14):
        for beat,m,d in weight_bass[(j+j//3)%4]:at(4,j,beat,'bass',m,d,.78+.10*(j%4==3))
        at(4,j,0,'cello',horn_a[j],2.5,.66)
        at(4,j,2.5,'cello',horn_b[j],2.5,.59)
        for beat,m,d in weight_melodies[(j+j//4)%4]:at(4,j,beat,'violin',m,d,.56+.06*(j%4==0))
        at(4,j,0,'horn',horn_b[j],2.5,.64)
        at(4,j,2.5,'horn',horn_a[j],2.5,.55)
        if j%2==0:
            at(4,j,0,'clarinet',[64,65,67,69,67,65,64][(j//2)%7],1.5,.42)
            at(4,j,2,'clarinet',[67,69,71,72,71,69,67][(j//2)%7],1.5,.39)
        if j in (3,7,11):
            at(4,j,0,'trumpet',[77,79,81][(j//4)],2,.58)
            at(4,j,3.5,'trumpet',[74,77,79][(j//4)],1,.43)
        for beat,m in [(.5,64),(2.5,67),(4.5,71)]:at(4,j,beat,'harp',m,.5,.34)
        at(4,j,0,'frame-open',None,.5,.61)
        if j%2==0:at(4,j,2.5,'frame-open',None,.5,.46)
        at(4,j,1.5,'frame-muted',None,.5,.36)
        at(4,j,3.5,'frame-muted',None,.5,.32)
        if j%4==0:at(4,j,0,'bassdrum',None,1,.86)
        if j%4==2:at(4,j,0,'timpani-hit',None,1,.72)
        if j%4==3:at(4,j,3.5,'timpani-roll',None,1.5,.76)
        if j in (0,4,8,12):
            at(4,j,0,'organ',76,5,.22);at(4,j,0,'organ',77,5,.14)
    # VI. The price: remove the pulse, leave a suspended modal cluster.
    for j in range(8):
        at(5,j,0,'bass',28 if j<6 else 35,5,.39-.025*j)
        if j in (0,2,4,6):at(5,j,0,'cello',53 if j%4==0 else 52,5,.32-.02*j)
        if j in (1,3):at(5,j,0,'violin',76 if j==1 else 77,4,.22)
        if j in (0,2,4,6):at(5,j,0,'clarinet',[72,71,69,67][j//2],3,.24)
        if j in (0,4,7):at(5,j,0,'organ',76,5,.18-.01*j);at(5,j,0,'organ',77,5,.13-.01*j)
        if j in (0,4):at(5,j,1.5,'harp',64,.5,.18)
        if j==0:at(5,j,0,'timpani-hit',None,1,.35)
    s=dict(title='The Weight of a Crown',directionBrief='the-weight-of-a-crown-v2',compositionStage='II',researchOnly=True,mode='E Phrygian',pitchClasses=sorted(MODE),tempoBpm=BPM,ppq=PPQ,rhythmicGrouping='5/4 grouped 3+2 with 3/4 conspiracy contrast',sections=sections,totalTicks=tick,bars=56,events=sorted(events,key=lambda e:(e['tick'],e['part'],e['midi'] or -1)))
    return s
def validate(s):
    assert s['bars']==56 and len(s['sections'])==6
    assert [x['meter'] for x in s['sections']]==[[5,4],[5,4],[3,4],[5,4],[5,4],[5,4]]
    assert s['totalTicks']==6336 and 700<len(s['events'])<1400
    assert all(e['tick']+e['durationTicks']<=s['totalTicks'] and e['durationTicks']>0 for e in s['events'])
    assert all(e['midi'] is None or e['midi']%12 in MODE for e in s['events'])
    assert len({(e['part'],e['tick'],e['midi']) for e in s['events']})==len(s['events'])
    # Each 5/4 block has more than one bass rhythm; the 3/4 section is genuinely distinct.
    def rhythm(section):
        start=section['startTick'];end=start+section['durationTicks']
        return tuple((e['tick']-start,e['durationTicks'],e['midi']) for e in s['events'] if e['part']=='bass' and start<=e['tick']<end)
    assert len({rhythm(x) for x in (s['sections'][1],s['sections'][3],s['sections'][4])})==3
def load_index(root):
    root=pathlib.Path(root);return root,json.loads((root/'library/index.json').read_text())
def sources(dyn,hist,exp):
    out=[]
    for root,idx in (load_index(dyn),load_index(hist),load_index(exp)):
        metrics={}
        if root==pathlib.Path(dyn):metrics={x['id']:x for x in json.loads((root/'metrics.json').read_text()).get('zones',[])}
        for e in idx['entries']:
            if e.get('approval')!='research-only' or e.get('license')!='CC0-1.0':continue
            recipe=e.get('recipe',{})
            inst=e.get('instrument') or recipe.get('instrument')
            art=e.get('articulation') or recipe.get('articulation')
            if not any(p[0]==inst and p[1]==art for p in PARTS.values()):continue
            z=metrics.get(e['id'],{})
            midi=e.get('expectedMidi',recipe.get('midi'))
            measured=e.get('measuredMidi',z.get('measuredMidi',midi))
            vel=e.get('velocity') or recipe.get('velocity') or .65
            offset=z.get('offsetFrames',0)
            b=(root/'library'/e['path']).read_bytes()
            if hashlib.sha256(b).hexdigest()!=e['sha256']:raise ValueError('source hash mismatch '+e['id'])
            out.append(dict(id=e['id'],path=e['path'],sha256=e['sha256'],instrument=inst,articulation=art,midi=midi,measured=measured,velocity=vel,offsetFrames=offset,root=root,bytes=b))
    return out
def decode(src):
    raw=subprocess.check_output(['sox','-R','-t','wav','-','-t','raw','-e','floating-point','-b','32','-L','-c','1','-r',str(SR),'-'],input=src['bytes'])
    x=np.frombuffer(raw,'<f4').astype(np.float32)
    if not np.isfinite(x).all() or len(x)<1200:raise ValueError('bad decoded sample '+src['id'])
    off=int(src['offsetFrames'])
    if off<=0:
        peak=float(np.max(abs(x)));idx=np.flatnonzero(abs(x)>max(1e-6,peak*.025))
        if len(idx):off=max(0,int(idx[0])-120)
    return x[off:]
def write_wav(path,a):
    with wave.open(str(path),'wb') as w:
        w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(a.astype('<i2').tobytes())
def db(x):return float(20*np.log10(max(float(x),1e-12)))
def render(dyn,hist,exp,out):
    s=make_score();validate(s);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    src=sources(dyn,hist,exp);pools={}
    for part,(inst,art,pan,trim,group,wet) in PARTS.items():
        pools[part]=[x for x in src if x['instrument']==inst and x['articulation']==art]
        if not pools[part]:raise ValueError('missing qualified source '+part)
    total_seconds=s['totalTicks']*60/(BPM*PPQ);N=round((total_seconds+3.2)*SR)
    frame=lambda t:round(t*60*SR/(BPM*PPQ))
    cache={};groups={g:np.zeros((N,2),np.float32) for g in GROUPS};receipts=[];crossfades=0
    for part,(inst,art,pan,trim,group,wet) in PARTS.items():
        es=[e for e in s['events'] if e['part']==part];a=np.zeros((N,2),np.float32);rr=0
        for i,e in enumerate(es):
            midi=e['midi'];vel=e['velocity'];pool=pools[part]
            if midi is None:
                near=min(abs(x['velocity']-vel) for x in pool);candidates=sorted([x for x in pool if abs(x['velocity']-vel)==near],key=lambda x:x['id']);source=candidates[rr%len(candidates)];rr+=1
            else:
                source=min(pool,key=lambda x:(abs(float(x['measured'] or x['midi'])-midi),abs(x['velocity']-vel),x['id']))
                delta=abs(float(source['measured'] or source['midi'])-midi)
                if delta>5.1:raise ValueError(f'pitch coverage gap {part} {midi}: {delta:.2f} semitones')
            if source['id'] not in cache:cache[source['id']]=decode(source)
            x=cache[source['id']];measured=float(source['measured'] or source['midi'] or 69)
            rate=1 if midi is None else 2**((midi-measured)/12)
            start=frame(e['tick']);end=frame(e['tick']+e['durationTicks']);dur=end-start
            finite=inst in ('folk-harp','frame-drum','bass-drum','timpani')
            can_connect=part in ('cello','violin','horn','clarinet','organ')
            connected=can_connect and i>0 and es[i-1]['midi'] is not None and es[i-1]['tick']+es[i-1]['durationTicks']==e['tick']
            next_conn=can_connect and i+1<len(es) and es[i+1]['midi'] is not None and e['tick']+e['durationTicks']==es[i+1]['tick']
            overlap=round(.055*SR) if can_connect else 0
            if connected:crossfades+=1
            start=max(0,start-(overlap if connected else 0))
            length=dur+(overlap if connected else 0)+(overlap if next_conn else 0)
            if finite:
                tail={'folk-harp':1.15,'frame-drum':1.0,'bass-drum':1.55,'timpani':1.8}[inst]
                length=min(int((len(x)-2)/rate),max(dur,round(tail*SR)))
            offset=round(.065*SR) if connected else 0
            if (length-1)*rate+offset>=len(x)-1:
                length=min(length,int((len(x)-offset-2)/rate))
            if length<480 or start+length>N:raise ValueError('sample too short or event outside render '+part)
            y=np.interp((np.arange(length)+offset)*rate,np.arange(len(x)),x).astype(np.float32)
            idx=np.arange(length);attack=round(SR*(.012 if finite else .075 if connected else .045));release=min(length//2,round(SR*(.28 if finite else .12)))
            env=np.minimum(1,np.minimum(idx/max(1,attack),(length-1-idx)/max(1,release))).astype(np.float32)
            if not finite:env*=.82+.18*np.sin(np.linspace(0,np.pi,length,dtype=np.float32))
            if inst=='violin':y=sosfilt(butter(2,5200,fs=SR,output='sos'),y).astype(np.float32)
            if inst=='trumpet':y=sosfilt(butter(2,7600,fs=SR,output='sos'),y).astype(np.float32)
            target={'double-bass':.105,'cello-section':.095,'violin':.075,'horn':.095,'trumpet':.10,'clarinet':.075,'folk-harp':.085,'renaissance-organ':.045,'frame-drum':.11,'bass-drum':.19,'timpani':.14}[inst]
            rms=float(np.sqrt(np.mean(y*y,dtype=np.float64)));peak=float(np.max(abs(y)))
            gain=min(target/max(rms,1e-8),.72/max(peak,1e-8))*vel*trim
            pan_l=math.cos((pan+1)*math.pi/4);pan_r=math.sin((pan+1)*math.pi/4)
            a[start:start+length,0]+=y*env*gain*pan_l
            a[start:start+length,1]+=y*env*gain*pan_r
            receipts.append(dict(part=part,tick=e['tick'],midi=midi,source=source['id'],sourceSha256=source['sha256'],pitchRate=round(rate,6),approximateCrossfade=bool(connected),frames=length))
        # Distinct early reflections create a shared stone chamber without masking attacks.
        mono=a.mean(axis=1);ref=np.zeros_like(a)
        taps=((.019,.115),(.031,.086),(.047,.064),(.067,.048),(.091,.035),(.127,.026),(.173,.018),(.229,.012))
        for k,(delay,amount) in enumerate(taps):
            q=round(delay*SR)
            if q<N:
                ref[q:,0]+=mono[:-q]*amount*(.72 if k%2 else 1)
                ref[q:,1]+=mono[:-q]*amount*(1 if k%2 else .72)
        a+=ref*wet
        groups[group]+=a
    mix=sum(groups.values());peak=max(float(np.max(abs(mix))),*(float(np.max(abs(v))) for v in groups.values()));gain=min(1.,.90/max(peak,1e-9))
    quantized={k:np.rint(v*gain*32767).astype(np.int32) for k,v in groups.items()}
    master32=sum(quantized.values());pcm_error=int(np.max(abs(sum(quantized.values())-master32)))
    if np.max(abs(master32))>32767:raise ValueError('master clipping after stem sum')
    master=master32.astype('<i2')
    metrics=[];section_metrics=[]
    def save(name,pcm):
        p=out/(name+'.wav');write_wav(p,pcm)
        metrics.append(dict(file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),frames=N,peak=float(np.max(abs(pcm))/32768),rms=float(np.sqrt(np.mean((pcm.astype(np.float64)/32768)**2)))))
    save('the-weight-of-a-crown',master)
    for name,q in quantized.items():
        save('the-weight-of-a-crown-'+name,q.astype('<i2'))
    for sec in s['sections']:
        lo=frame(sec['startTick']);hi=frame(sec['startTick']+sec['durationTicks']);x=master[lo:hi].astype(np.float64)/32768
        es=[e for e in s['events'] if sec['startTick']<=e['tick']<sec['startTick']+sec['durationTicks']]
        section_metrics.append(dict(id=sec['id'],meter=sec['meter'],rmsDb=db(np.sqrt(np.mean(x*x))),events=len(es),activeParts=sorted({e['part'] for e in es})))
    mono=master.astype(np.float64).mean(axis=1);stereo=master.astype(np.float64)
    width=float(np.sqrt(np.mean((stereo[:,0]-stereo[:,1])**2))/max(np.sqrt(np.mean(mono**2)),1e-9))
    report=dict(approval='research-only',score=s,sourceCount=len({r['source'] for r in receipts}),sourceEntries=len(src),eventCount=len(s['events']),receipts=receipts,approximateCrossfades=crossfades,recordedIntervalCoverage=0,sections=section_metrics,stereoWidth=width,monoPeak=float(np.max(abs(mono))/32768),pcmReconstructionError=pcm_error,commonGain=gain,metrics=metrics)
    (out/'score.json').write_text(json.dumps(s,indent=2)+'\n');(out/'metrics.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k in ('sourceCount','sourceEntries','eventCount','approximateCrossfades','recordedIntervalCoverage','stereoWidth','monoPeak','pcmReconstructionError','sections','metrics')},indent=2))
def self_test():
    s=make_score();validate(s)
    assert sum(x['bars'] for x in s['sections'])==56
    assert len({e['tick'] for e in s['events'] if e['part']=='bass'})>100
    print('The Weight of a Crown score self-test passed:',len(s['events']),'events')
if __name__=='__main__':
    if len(sys.argv)==2 and sys.argv[1]=='--self-test':self_test()
    elif len(sys.argv)==5:render(*sys.argv[1:])
    else:raise SystemExit('usage: weight-of-crown.py --self-test | DYNAMICS HISTORICAL EXPANSION OUTPUT')
