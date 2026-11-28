"""Build portable packages from admitted native references and exercise mixed recipes."""
import hashlib,json,pathlib,shutil,subprocess,sys,time,resource,wave
import numpy as np
from acoustic_authoring import engines,load_package,synthesize,sha
from acoustic_resynthesis import descriptors,distance,decode,analyze,SR
def dump(p,x):p.write_text(json.dumps(x,sort_keys=True,separators=(",",":"))+"\n")
def main(root):
    start=time.perf_counter();root=pathlib.Path(root).resolve();out=root/"authoring";out.mkdir()
    report={};sources=json.loads((root/"report.json").read_text())["sources"]
    source=next(s for s in sources if s["group"]=="slide" and s["split"]=="train")
    package=out/"packages"/"friction";package.mkdir(parents=True)
    original=package/source["file"];shutil.copyfile(root/"originals"/source["file"],original)
    assert sha(original)==source["sha256"]
    license_file=package/"rpg-audio-LICENSE.txt";shutil.copyfile(root/license_file.name,license_file)
    dep=dict(path=original.name,sha256=sha(original),license=source["license"],creator=source["creator"],sourceUrl=source["sourceUrl"],rightsEvidence=license_file.name,provenance=source["mirror"]+"; "+source["conditions"],redistribution=True)
    lic=dict(path=license_file.name,sha256=sha(license_file),license=source["license"],creator=source["creator"],sourceUrl=source["sourceUrl"],rightsEvidence="Original included license text",provenance=source["sourceUrl"],redistribution=True)
    model=json.loads((root/"models/slide.json").read_text())
    p=dict(version=1,engine=engines(),approval="research-only",scope="Published knife draw Foley friction texture, used as stylized mechanical creak; not calibrated geometry",limitations="Unknown recording conditions; no phase, physical force or measured friction law; offline only",seed=914,controls={},model=model,dependencies=[dep,lic])
    f=package/"package.json";dump(f,p)
    q=load_package(f);a,b=synthesize(q);c,d=synthesize(q);assert np.array_equal(a,c) and np.array_equal(b,d)
    e,g=synthesize(q,seed=915);assert not np.array_equal(a+b,e+g)
    edits={"noiseEnvelope":[[0,1],[.35,1],[.75,.2],[1,.2]],"tonalEnvelope":[[0,.2],[.3,1],[1,1]],"noiseBands":{"7":[[0,1],[.45,1],[1,.15]]},"excitation":[[0,1],[.4,1],[1,.6]]}
    if model["tracks"]:edits["tracks"]={"0":{"frequency":[[0,1],[.4,1],[1,.7]],"amplitude":[[0,1],[.5,1],[1,.4]]}}
    u,v=synthesize(q,edits);assert not np.array_equal(a+b,u+v)
    restored=out/"restored"/"friction";shutil.copytree(package,restored);r=load_package(restored/"package.json");x,y=synthesize(r,edits);assert np.array_equal(u,x) and np.array_equal(v,y)
    (restored/original.name).write_bytes(b"tampered")
    try:load_package(restored/"package.json")
    except ValueError:pass
    else:raise AssertionError("Tampered dependency admitted")
    shutil.rmtree(out/"restored")
    # New creative brief: slow tensioning ratchet on a fictional wooden observatory shutter.
    # No specialized generator or object-name dispatch.
    recipe=dict(version=1,intent="Tensioning wooden observatory shutter: rising friction, flex and final catch",duration=1.8,seed=914,layers=[
        dict(id="friction",type="acoustic",model="friction",duration=1.2,gain=.8,controls={**edits,"duration":1.35},envelope=[[0,0],[.06,1],[.85,.8],[1.2,0]],pan=-.15),
        dict(id="flex",type="oscillator",frequency=103,endFrequency=157,harmonics=[1,.34,.13],jitter=.025,at=.1,duration=1.25,gain=.13,envelope=[[0,0],[.3,.6],[.8,1],[1.25,0]],filter=[65,900]),
        dict(id="catch",type="impulse",at=1.35,duration=.44,width=.0018,gain=.45,modes=[[235,.08,.8],[583,.035,.5],[1120,.022,.25]],delay={"seconds":.017,"gain":.15}),
        dict(id="grit",type="noise",at=.6,duration=.65,gain=.12,band=[350,4100],envelope=[[0,0],[.25,.7],[.65,0]])])
    catalog=[dict(id="friction",path=str(f.relative_to(out)),sha256=sha(f))]
    # Recorded layer uses the same qualified dependency, independently identified.
    samples=[dict(id="friction-reference",path=str(original.relative_to(out)),sha256=sha(original),license=source["license"],creator=source["creator"],title="Knife draw Foley",sourceUrl=source["sourceUrl"],rightsEvidence=source["sourceUrl"],provenance=dep["provenance"],redistribution=True,tags=["friction"])]
    recipe["layers"].append(dict(id="latch-detail",type="sample",source="friction-reference",at=1.35,duration=.22,gain=.12))
    jobs=[dict(type="recipe",name="shutter-"+str(i),output="shutter-"+str(i)+".wav",recipe={**recipe,"seed":seed}) for i,seed in enumerate([914,914,915])]
    mf=out/"manifest.json";dump(mf,dict(version=2,acousticModels=catalog,samples=samples,jobs=jobs))
    subprocess.run(["node","tools/audio-forge/run_manifest.mjs","--manifest",str(mf),"--base",str(out)],check=True)
    files=[out/j["output"] for j in jobs];assert sha(files[0])==sha(files[1]) and sha(files[0])!=sha(files[2])
    for file in files:
        with wave.open(str(file)) as w:
            assert (w.getframerate(),w.getnchannels(),w.getsampwidth(),w.getnframes())==(SR,2,2,86400)
            data=np.frombuffer(w.readframes(w.getnframes()),"<i2").astype(np.int32);assert 0<np.max(abs(data))<32768
    report.update(packageSha256=sha(f),sameSeedExact=True,distinctSeed=True,restoredExact=True,dependencyTamperRejected=True,outputs={v.name:sha(v) for v in files},creativeBrief=recipe["intent"],editRmsDifference=float(np.sqrt(np.mean((a+b-u-v)**2))))
    # Documentary breathing: analyze distinct measured windows, never label direction from energy.
    receipts=json.loads((root/"documentary/documentary-receipts.json").read_text())
    breath=next((e for e in receipts if e["kind"]=="breathing"),{})
    if breath.get("status")=="acquired" and len(breath.get("windows",[]))>=2:
        ref=root/"documentary"/breath["file"];assert sha(ref)==breath["sha256"]
        signal=decode(ref);(a0,a1),(b0,b1)=breath["windows"][:2];train=signal[a0:a1];held=signal[b0:b1]
        model=analyze(train);base=dict(model=model,seed=77,controls={})
        t,z=synthesize(base)
        report["breathing"]={"label":"energetic breathing events, direction unknown","trainFrames":[a0,a1],"holdoutFrames":[b0,b1],"sourceSha256":sha(ref),"trainDistance":distance(descriptors(train),descriptors(t+z)),"holdoutDistance":distance(descriptors(held),descriptors(t+z)),"noiseEnergy":float(np.sum(z*z)),"tonalEnergy":float(np.sum(t*t)),"sourceEnvelope1ms":model["rms1ms"]}
    else:report["breathing"]={"status":"blocked","receipt":breath}
    report.update(wallSeconds=time.perf_counter()-start,maxRssKiB=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,childMaxRssKiB=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss)
    dump(out/"authoring-report.json",report)
if __name__=="__main__":main(sys.argv[1])
