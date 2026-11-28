"""Research realization using the existing FluidSynth/SoundFont approach; no interval recordings."""
import ctypes as C, ctypes.util, hashlib, json, math, pathlib, sys, time, resource, wave
import numpy as np
SR=48000; BPM=84; BEAT=60/BPM; BARS=48; TAIL=3.; SFHASH='c5378b62028c920cb11e4803327983fee2f2cdff5dc89c708e39da417e51c854'
# Each explicitly authored melodic bar contains six eighths. Zero is a rest.
LINES='0:6|0:4 62:2|66:3 64:1 62:2|69:4 0:2|66:2 69:1 71:3|69:2 66:2 64:2|62:3 64:1 66:2|69:4 0:2|71:2 74:2 73:2|71:3 69:1 67:2|66:2 64:2 61:2|62:5 0:1|66:1 67:1 69:2 71:2|73:3 71:1 69:2|67:2 66:1 64:1 66:2|62:4 0:2|59:2 62:1 66:3|64:2 62:2 61:2|59:3 61:1 62:2|66:2 64:1 62:1 61:2|62:2 66:2 69:2|67:3 66:1 64:2|66:2 64:1 62:1 58:2|59:5 0:1|67:3 66:1 64:2|62:2 64:2 67:2|71:4 69:2|67:3 64:1 62:2|64:2 67:1 69:3|71:2 69:2 66:2|67:2 66:2 64:2|62:4 0:2|66:2 69:1 71:3|74:3 73:1 71:2|69:2 67:1 66:1 64:2|66:4 0:2|71:2 74:1 76:3|74:2 73:2 71:2|69:3 67:1 66:2|64:2 66:1 67:1 69:2|71:3 69:1 67:2|66:2 64:1 66:1 69:2|73:2 71:1 69:1 64:2|62:5 0:1|69:3 66:1 64:2|67:3 66:1 64:2|61:2 64:2 61:2|62:6'
H='D D G A D Bm G D/F# Bm G A D D A Bm D Bm F#m G A Bm Em F# Bm G D G Em C G A D D G Bm A D Bm G A G D/F# A D D G A D'.split()
VO={'D':(50,[57,62,66]),'D/F#':(42,[57,62,69]),'Bm':(47,[54,59,62]),'G':(43,[55,59,62]),'A':(45,[57,61,64]),'F#m':(42,[54,57,61]),'Em':(40,[55,59,64]),'F#':(42,[54,58,61]),'C':(48,[55,60,64])}
PARTS={'cello':(42,46,.66),'flute':(73,82,.72),'strings':(48,65,.76),'viola':(41,37,.46),'harp':(46,83,.69),'pizz':(45,52,.67),'horn':(60,74,.43)}
SECTIONS=[('threshold',0,4),('theme',4,16),('development',16,24),('memory',24,32),('arrival',32,44),('home',44,48)]

def score():
    es=[]
    def add(p,b,t,d,n,v,phrase):es.append(dict(part=p,beat=round(b*3+t,5),duration=d,midi=n,velocity=v,phrase=phrase))
    for b,line in enumerate(LINES.split('|')):
        si=next(i for i,(_,a,z) in enumerate(SECTIONS) if a<=b<z);root,notes=VO[H[b]];level=[.52,.76,.75,.64,.92,.48][si]
        phrase=(b%4);shape=[.83,.99,1.07,.81][phrase];v=level*shape
        lead='flute' if (8<=b<12 or 24<=b<32 or 36<=b<40) else 'cello'; shift=0
        t=0
        for i,cell in enumerate(line.split()):
            n,d=map(int,cell.split(':'));d/=2
            if n:add(lead,b,t,d,n+shift,round(56+24*v+(4 if i==0 else 0)),b//4)
            t+=d
        assert t==3
        # Bass pulse changes from open spacious downbeats to walking and a hemiola before cadences.
        if si in (0,5):add('pizz',b,0,.8,root,round(53+12*v),b//4)
        elif si==2 or (si==4 and b%4==2):
            for t,n in [(0,root),(1,notes[0]-12),(2,root+12)]:add('pizz',b,t,.72,n,round(58+15*v-(3 if t else 0)),b//4)
        else:
            add('pizz',b,0,.9,root,round(57+15*v),b//4)
            if b%4!=3:add('pizz',b,2,.67,notes[0]-12,round(51+12*v),b//4)
        # Plucked pattern is sparse in contrast and epilogue, not continuous mechanical eighths.
        pattern=([(.0,0),(.5,1),(1.5,2),(2.5,1)] if si in (1,2,4) else [(0,0),(1.5,2)])
        for t,i in pattern:add('harp',b,t,.48 if t>0 else .7,notes[i]+(12 if i==2 else 0),round(48+17*v+(5 if t==0 else 0)),b//4)
        # Sustained inner voices with slow motion; use complementary registers, not a copied lead.
        for n in notes[:2] if si in (0,3,5) else notes:
            add('strings',b,0,2.92,n,round(43+20*v),b//4)
        if si in (2,4):
            add('viola',b,0,1.45,notes[1]-12,round(50+14*v),b//4)
            add('viola',b,1.5,1.4,notes[2]-12,round(48+14*v),b//4)
        if si==1 and b in (7,11,15) or si==4 and b in (35,39,43):
            add('horn',b,2, .85,notes[0],round(53+13*v),b//4)
        if si==3 and b%2==0:add('cello',b,0,2.7,notes[0]-12,round(50+10*v),b//4)
    assert len(H)==len(LINES.split('|'))==BARS
    # Tie unchanged inner voices across bar lines instead of restarting every common tone.
    merged=[];last={}
    for e in sorted(es,key=lambda e:(e['beat'],e['part'],e['midi'])):
        k=(e['part'],e['midi']);p=last.get(k)
        if e['part']=='strings' and p and abs(p['beat']+p['duration']+.08-e['beat'])<.001:
            p['duration']=round(e['beat']+e['duration']-p['beat'],5)
        else:merged.append(e);last[k]=e
    return merged

def synth_part(events,part,font,seconds,expressive=True):
    lib=C.CDLL(C.util.find_library('fluidsynth') or 'libfluidsynth.so.3');P=C.c_void_p;I=C.c_int;D=C.c_double
    def bind(n,ret,*args):f=getattr(lib,n);f.restype=ret;f.argtypes=args;return f
    settings=bind('new_fluid_settings',P)(); setn=bind('fluid_settings_setnum',I,P,C.c_char_p,D);seti=bind('fluid_settings_setint',I,P,C.c_char_p,I)
    setn(settings,b'synth.sample-rate',SR);setn(settings,b'synth.gain',.65);seti(settings,b'synth.chorus.active',0);seti(settings,b'synth.reverb.active',1)
    sy=bind('new_fluid_synth',P,P)(settings);sf=bind('fluid_synth_sfload',I,P,C.c_char_p,I)(sy,str(font).encode(),0);assert sf>=0
    program,pan,gain=PARTS[part];assert bind('fluid_synth_program_select',I,P,I,I,I,I)(sy,0,sf,0,program)==0
    cc=bind('fluid_synth_cc',I,P,I,I,I);on=bind('fluid_synth_noteon',I,P,I,I,I);off=bind('fluid_synth_noteoff',I,P,I,I);write=bind('fluid_synth_write_float',I,P,I,P,I,I,P,I,I)
    bind('fluid_synth_set_reverb',I,P,D,D,D,D)(sy,.44,.52,.70,.24)
    cc(sy,0,10,pan);cc(sy,0,7,100);cc(sy,0,91,40 if part in ('harp','pizz') else 56);cc(sy,0,93,0);cc(sy,0,11,95)
    schedule=[];N=round(seconds*SR);sustain=part not in ('harp','pizz');ev=[e for e in events if e['part']==part and e['beat']*BEAT<seconds-TAIL]
    # One shared phrase envelope per instrument, with continuity between adjacent different pitches.
    for i,e in enumerate(ev):
        t=e['beat']*BEAT;dur=e['duration']*BEAT;n=e['midi'];vel=e['velocity'];end=min(t+dur,seconds-TAIL)
        nxt=ev[i+1] if i+1<len(ev) else None
        if expressive and sustain and part in ('cello','flute','viola') and nxt and nxt['midi']!=n and abs(nxt['beat']*BEAT-end)<.015:end+=.025
        schedule.extend([(round(t*SR),2,n,vel),(round(end*SR),0,n,0)])
    if expressive and sustain:
        for i in range(0,N,round(.045*SR)):
            b=i/SR/BEAT; bar=b/3;phase=(bar%4)/4;section=next((j for j,(_,a,z) in enumerate(SECTIONS) if a<=bar<z),5)
            sec=[.65,.90,.86,.74,1,.56][section];value=round((76+35*math.sin(math.pi*phase))*sec);schedule.append((i,1,11,max(30,min(120,value))))
    schedule.sort();out=np.zeros((N,2),np.float32);pos=0
    def chunk(end):
        nonlocal pos
        end=min(N,end)
        if end>pos:
            a=out[pos:end];ptr=a.ctypes.data;assert write(sy,len(a),ptr,0,2,ptr,1,2)==0;pos=end
    try:
        for t,k,n,v in schedule:
            if t>=N:break
            chunk(t)
            if k==0:off(sy,0,n)
            elif k==1:cc(sy,0,n,v)
            else:on(sy,0,n,v)
        chunk(N)
    finally:bind('delete_fluid_synth',None,P)(sy);bind('delete_fluid_settings',None,P)(settings)
    return out*gain

def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,a):
    assert np.max(abs(a))<32768
    with wave.open(str(p),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(a.astype('<i2').tobytes())
    return dict(file=p.name,sha256=sha(p),peak=float(np.max(abs(a))/32768),rms=float(np.sqrt(np.mean((a.astype(np.float64)/32768)**2))))
def render(font,out):
    t=time.perf_counter();font=pathlib.Path(font);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True);assert sha(font)==SFHASH
    es=score();seconds=BARS*3*BEAT+TAIL
    stems={p:synth_part(es,p,font,seconds) for p in PARTS}
    for a in stems.values():a[:SR//10]*=np.linspace(0,1,SR//10)[:,None];a[-SR:]*=np.linspace(1,0,SR)[:,None]
    mix=sum(stems.values());g=.84/max(np.max(abs(mix)),*(np.max(abs(a)) for a in stems.values()));pcm={p:np.rint(a*g*32767).astype(np.int32) for p,a in stems.items()};master=sum(pcm.values());assert np.max(abs(master))<32768
    files=[save(out/'lanterns-of-home.wav',master)]+[save(out/(p+'.wav'),a) for p,a in pcm.items()]
    # Matched first 12 bars (same pitches/timing/velocities), only expression and connected overlap differ.
    dur=12*3*BEAT+TAIL;flat=sum(synth_part(es,p,font,dur,False) for p in PARTS);exp=sum(synth_part(es,p,font,dur,True) for p in PARTS);rr=[float(np.sqrt(np.mean(a*a))) for a in (flat,exp)];target=min(rr);controls=[]
    for name,a,rms in [('flat',flat,rr[0]),('expressive',exp,rr[1])]:controls.append(save(out/('control-'+name+'.wav'),np.rint(a*min(target/rms,.8/max(np.max(abs(a)),1e-9))*32767).astype(np.int32)))
    x=master.astype(np.float64)/32768;m=x.mean(axis=1);report=dict(approval='research-only',title='Lanterns of Home',duration=len(x)/SR,source=dict(file=font.name,sha256=SFHASH,license='GPL-2.0-only',provenance='Debian timgm6mb-soundfont copyright',redistribution='GPL-2 terms; render release subject to review'),backend='FluidSynth GM soundfont',recordedIntervalCoverage=0,approximateLegato='25 ms overlap on contiguous different-pitch cello/flute/viola notes; not recorded transitions',files=files,controls=controls,controlUnmatchedRms=rr,lrCorrelation=float(np.corrcoef(x.T)[0,1]),monoLossDb=float(10*np.log10(np.mean(m*m)/np.mean(x*x))),pcmError=int(np.max(abs(master-sum(pcm.values())))),wallSeconds=time.perf_counter()-t,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    (out/'score.json').write_text(json.dumps(dict(title=report['title'],bpm=BPM,meter=[3,4],bars=BARS,sections=SECTIONS,harmony=H,parts=PARTS,events=es),indent=2)+'\n');(out/'metrics.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('files','controls')},indent=2))
if __name__=='__main__':render(*sys.argv[1:])
