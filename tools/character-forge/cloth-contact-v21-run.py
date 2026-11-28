"""Isolated one-factor contact matrix, not a production qualification."""
import hashlib,json,os,subprocess,shutil,sys
from pathlib import Path
root=Path(os.environ['CHARACTER_EVIDENCE'])
source=root/'morph/v9-cloth-input.json'
spec=json.loads(source.read_text())
blender=os.environ['BLENDER']
labels={'A':'outer-control','B':'bounded-geometric-smoothing','C':'axis-cross-section','D':'collider-margin-3mm','E':'local-diagonal-flip','F':'first-ring-pin-transition'}
summary=[]
for candidate,label in labels.items():
    out=root/('v21-contact-'+candidate);(out/'morph').mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,out/'morph/v9-cloth-input.json')
    cfg=out/'config.json';cfg.write_text(json.dumps({'diagnosticOnly':True,'candidate':candidate}))
    env=os.environ.copy();env.update({'CHARACTER_EVIDENCE':str(out),'CHARACTER_V15_CLOTH':'1','CHARACTER_V21_CLOTH_CONFIG':str(cfg)})
    with (out/'blender.log').open('w') as log:
        proc=subprocess.run([blender,'--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python','tools/character-forge/cloth-recovery-v11.py'],env=env,stdout=log,stderr=subprocess.STDOUT)
    file=out/'v11-cloth-recovery.json';data=json.loads(file.read_text()) if file.exists() else {}
    stage=next((s for s in data.get('stages',[]) if s['stage']==2),{})
    frames=stage.get('frames',[]);contact=out/'v21-contact.json'
    row={'candidate':candidate,'factor':label,'exit':proc.returncode,'status':data.get('status','missing report'),'gates':stage.get('gates'),
         'passedLocal':bool(stage.get('passed')),'productionAllowed':False,'executionError':stage.get('executionError'),
         'firstDefect':stage.get('firstDefect'),'firstDefectSeconds':None if stage.get('firstDefect') is None else (stage['firstDefect']-1)/spec['fps']}
    if frames:
        row.update({'maxStretch':max(x['maxStretch'] for x in frames),'p95Stretch':max(x['p95Stretch'] for x in frames),
                    'maxSelfPairs':max(x.get('selfOverlapPairs',0) for x in frames),'maxExternalPairs':max(sum(x['nonSeamTrianglePairs'].values()) for x in frames),
                    'maxPinErrorMm':1000*max(x['pinErrorMetres'] for x in frames),'hemRatioMin':min(x['hemRadiusRatio'] for x in frames),
                    'hemRatioMax':max(x['hemRadiusRatio'] for x in frames),'peakFrame':max(frames,key=lambda x:x['maxStretch'])['frame']})
    if contact.exists():
        d=json.loads(contact.read_text());row['timeline']=d['timeline'];row['proxyFit']=d['proxyFit'];row['contactFrameCount']=len(d['contactRows'])
    summary.append(row)
    # Keep raw samples and render actual geometry; failures still retain their evidence.
    if frames:
        subprocess.run(['node','tools/character-forge/cloth-evidence-v12.mjs'],env=env,check=True)
        for view in ('front','side'):
            framesdir=out/'v15-cloth-remesh-frames'
            seq=out/('v21-'+view+'-sequence');seq.mkdir(exist_ok=True)
            for i,p in enumerate(sorted(framesdir.glob(view+'-[0-9][0-9][0-9].png'))):shutil.copy2(p,seq/('%03d.png'%i))
            if list(seq.glob('*.png')):
                subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(spec['fps']),'-i',str(seq/'%03d.png'),'-c:v','libx264','-pix_fmt','yuv420p',str(out/('v21-'+view+'.mp4'))],check=True)
    print(json.dumps(row),flush=True)
files=['cloth-recovery-v11.py','cloth_contact_v21.py','cloth-contact-v21-run.py','cloth-evidence-v12.mjs']
hashes={f:hashlib.sha256((Path('tools/character-forge')/f).read_bytes()).hexdigest() for f in files}
version=subprocess.check_output([blender,'--version'],text=True).splitlines()[0]
(root/'v21-contact-matrix.json').write_text(json.dumps({'diagnosticOnly':True,'productionAllowed':False,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'codeSha256':hashes,'blenderVersion':version,'candidates':summary},indent=2))
# A rejected geometry candidate is useful evidence, but an incomplete baseline is not.
if len(summary)!=6 or summary[0]['exit']!=0 or not summary[0].get('contactFrameCount'):
    raise SystemExit('Missing qualified diagnostic execution of the baseline')
