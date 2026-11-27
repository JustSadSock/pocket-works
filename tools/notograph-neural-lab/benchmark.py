import argparse,json,subprocess,sys,wave
from pathlib import Path
import numpy as np
import pretty_midi
from scipy.io import wavfile
from scipy.signal import resample_poly
p=argparse.ArgumentParser()
p.add_argument('app',type=Path);p.add_argument('forge',type=Path);p.add_argument('out',type=Path);p.add_argument('sf2',type=Path)
a=p.parse_args();a.out=a.out.resolve();a.out.mkdir(parents=True,exist_ok=True)
app=a.app.resolve();forge=a.forge.resolve()
def pcm(path):
    sr,x=wavfile.read(path); x=x.astype(np.float64)/32768
    if sr!=44100: raise ValueError('wrong rate')
    return x if x.ndim==2 else np.repeat(x[:,None],2,axis=1)
def write(path,x):
    wavfile.write(path,44100,np.round(np.clip(x,-1,1)*32767).astype(np.int16))
def render_midi(path,out):
    subprocess.run(['fluidsynth','-ni','-F',str(out),'-r','44100','-g','.4',str(a.sf2),str(path)],check=True)
def sdr(ref,est):
    n=min(len(ref),len(est));ref=ref[:n].ravel();est=est[:n].ravel()
    target=ref*np.dot(ref,est)/max(1e-12,np.dot(ref,ref))
    return float(10*np.log10(max(1e-12,np.dot(target,target))/max(1e-12,np.dot(est-target,est-target))))
def note_metrics(ref,found):
    matches=[]
    candidates=sorted((abs(n['start']-r[0]),i,j) for i,r in enumerate(ref) for j,n in enumerate(found) if r[2]==n['pitch'] and abs(n['start']-r[0])<=.1)
    left=set();right=set()
    for err,i,j in candidates:
        if i not in left and j not in right:
            left.add(i);right.add(j);matches.append(err)
    tp=len(matches);precision=tp/max(1,len(found));recall=tp/max(1,len(ref))
    return dict(reference=len(ref),predicted=len(found),true_positive=tp,precision=precision,recall=recall,f1=2*precision*recall/max(1e-12,precision+recall),onset_mae=sum(matches)/len(matches) if matches else None)
spec={'vocals':(52,[(.25,1.1,67),(1.4,2.3,69),(2.6,3.5,64),(3.8,4.7,67)]),'bass':(33,[(.2,1.05,36),(1.3,2.15,41),(2.5,3.35,43),(3.7,4.55,36)]),'other':(0,[(.25,1.15,60),(.25,1.15,64),(.25,1.15,67),(1.4,2.3,65),(1.4,2.3,69),(1.4,2.3,72),(2.6,3.5,55),(2.6,3.5,59),(2.6,3.5,62)]),'drums':(0,[(.2+i*.5,.3+i*.5,36 if i%2==0 else 38) for i in range(9)])}
length=6*44100; refs={}; source=a.out/'reference';source.mkdir()
for name,(program,notes) in spec.items():
    m=pretty_midi.PrettyMIDI();inst=pretty_midi.Instrument(program,is_drum=name=='drums')
    inst.notes=[pretty_midi.Note(velocity=78,pitch=p,start=s,end=e) for s,e,p in notes];m.instruments.append(inst)
    mid=source/(name+'.mid');m.write(str(mid));render_midi(mid,source/(name+'.wav'))
    x=pcm(source/(name+'.wav')); y=np.zeros((length,2));y[:min(length,len(x))]=x[:length];refs[name]=y
    write(source/(name+'.wav'),y)
mix=sum(refs.values());gain=.8/max(.8,np.abs(mix).max());mix*=gain
for name in refs:refs[name]*=gain;write(source/(name+'.wav'),refs[name])
write(a.out/'mix.wav',mix)
for name in ['other','mix']:
    path=source/'other.wav' if name=='other' else a.out/'mix.wav'
    subprocess.run([sys.executable,str(app/'lab/analyze.py'),str(path),str(a.out/('basic-'+name)),'--mix-only'],check=True)
subprocess.run([sys.executable,str(app/'lab/analyze.py'),str(a.out/'mix.wav'),str(a.out/'separated'),'--model','htdemucs'],check=True)
data=json.loads((a.out/'separated/notograph.json').read_text())
metrics={'fixture':'original MIDI + General MIDI soundfont; vocals surrogate choir, not human singing','separation':{},'notes':{},'model':data['model'],'engines':data['engines']}
for stem in data['stems']:
    name=stem['id']; est=pcm(a.out/'separated'/stem['file']);ref=refs[name]
    metrics['separation'][name]={'si_sdr_db':sdr(ref,est),'mixture_baseline_db':sdr(ref,mix)}
    if name!='drums':metrics['notes'][name]=note_metrics(spec[name][1],stem['notes'])
solo=json.loads((a.out/'basic-other/notograph.json').read_text())
metrics['isolated_piano']=note_metrics(spec['other'][1],solo['stems'][0]['notes'])
(a.out/'metrics.json').write_text(json.dumps(metrics,indent=2,allow_nan=False))
print(json.dumps(metrics,indent=2))
# Actual Forge manifest compiled by application code, then rendered by pinned Forge checkout.
script="""import fs from 'node:fs';import {readAnalysis,forgeManifest} from './advanced.mjs';import {quantize} from './core.mjs';const data=readAnalysis(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));fs.writeFileSync(process.argv[3],JSON.stringify(forgeManifest(data.tracks,120,quantize),null,2));"""
runner=app/'lab-forge-smoke.mjs';runner.write_text(script)
manifest=a.out/'forge.json'
subprocess.run(['node',str(runner),str(a.out/'separated/notograph.json'),str(manifest)],check=True)
subprocess.run(['node',str(forge/'tools/audio-forge/run_manifest.mjs'),'--manifest',str(manifest),'--base',str(a.out)],cwd=forge,check=True)
sr,y=wavfile.read(a.out/'generated/notograph-score.wav')
f=y.astype(np.float64)/(32768 if y.dtype==np.int16 else 1)
assert sr>=22050 and np.isfinite(f).all() and np.max(np.abs(f))>.001
metrics['forge_render']={'sample_rate':sr,'seconds':len(f)/sr,'peak':float(np.max(np.abs(f))),'rms':float(np.sqrt(np.mean(f*f)))}
(a.out/'metrics.json').write_text(json.dumps(metrics,indent=2,allow_nan=False))
print(json.dumps(metrics,indent=2))
