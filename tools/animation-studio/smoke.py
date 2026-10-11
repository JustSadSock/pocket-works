"""Create temporary app-owned sources, export real clips and Audio Forge WAV."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools/art-forge"))
from forge import build, capabilities, check, json_write

def bird_svg(pose):
    # Authored changing silhouettes: anticipation, dive, contact, recoil, settle.
    angles=[-18,-30,15,77,30,-8]
    wing=["M110 140 Q40 50 80 40 Q140 58 147 130Z","M112 140 Q26 36 58 20 Q130 30 150 126Z","M112 142 Q48 100 54 80 Q124 84 150 136Z","M114 144 Q64 170 57 145 Q109 109 150 130Z","M112 140 Q49 89 64 64 Q130 68 151 130Z","M112 140 Q55 67 77 48 Q134 57 150 130Z"][pose]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><g stroke="#302d29" stroke-width="3" stroke-linejoin="round"><path d="M35 266Q90 251 157 264T295 262" fill="none" stroke="#9b8572"/><path d="M148 247L150 192M170 247L169 187" fill="none" stroke="#9b632f"/><g transform="rotate({angles[pose]} 159 188)"><path d="M86 199Q115 149 140 100Q162 70 192 86Q220 98 205 135Q192 158 171 180Q142 205 86 199Z" fill="#34434b"/><path d="{wing}" fill="#8c5947"/><path d="M178 85Q195 76 207 89L235 103L201 109" fill="#bd924e"/><path d="M146 117Q162 92 177 96" fill="none" stroke="#c3c0a9"/><circle cx="196" cy="95" r="3" fill="#181e24"/><path d="M97 176Q116 169 130 152M103 185Q130 179 146 159" fill="none" stroke="#c3c0a9"/></g><path d="M213 243Q240 227 273 242L279 260L208 261Z" fill="#947760"/><path d="M220 248L266 246M230 255L268 254" stroke="#cfbca1" stroke-width="2"/></g></svg>'''

def run(destination, blender):
    if destination.exists():raise ValueError("Fresh evidence directory required")
    with tempfile.TemporaryDirectory(prefix="pw-motion-") as tmp:
        app=Path(tmp)/"app";source=app/"asset-forge";source.mkdir(parents=True)
        shutil.copyfile(Path(__file__).with_name("fixtures")/"striker.py",source/"striker.py")
        jobs=[]
        def job(identity,adapter,src,outputs,params=None,inputs=None,deps=None):
            j={"id":identity,"adapter":adapter,"source":src,"outputs":outputs,"seed":27,"parameters":params or {},"inputs":inputs or [],"dependsOn":deps or [],"budget":{"maxBytes":8000000,"maxWidth":4096,"maxHeight":4096},"provenance":{"author":"Pocket Works","license":"original","origin":"Stage III capability scene"}}
            if adapter=="blender":j["budget"]={"maxBytes":8000000,"maxTriangles":30000,"maxTextureSize":1024};j["validation"]={"requireArmature":True,"requireAnimation":True}
            jobs.append(j)
        for pose in range(6):
            (source/f"bird-{pose}.svg").write_text(bird_svg(pose))
            job(f"bird-{pose}","vector",f"asset-forge/bird-{pose}.svg",{"image":f"public/assets/bird-{pose}.png","vector":f"public/assets/bird-{pose}.svg"},{"width":320,"height":320})
        durations=[.16,.18,.16,.08,.18,.24]
        json_write(source/"bird.json",{"version":1,"id":"Peck","loop":False,"frames":[{"input":f"public/assets/bird-{i}.png","duration":d} for i,d in enumerate(durations)],"events":[{"name":"release","time":.34},{"name":"contact","time":.5}]})
        job("drawn","frames","asset-forge/bird.json",{"image":"public/assets/bird.png","clip":"public/assets/bird-clip.json"},inputs=[f"public/assets/bird-{i}.png" for i in range(6)],deps=[f"bird-{i}" for i in range(6)])
        job("striker","blender","asset-forge/striker.py",{"model":"public/assets/striker.glb","editable":"asset-forge/generated/striker.blend"})
        job("baked","bake-sequence","asset-forge/generated/striker.blend",{"image":"public/assets/baked.png","clip":"public/assets/baked-clip.json"},{"width":256,"height":256,"samples":8,"start":1,"end":25,"step":2,"fps":24,"id":"BakedStrike","loop":False,"events":[{"name":"contact","time":.5}]},deps=["striker"])
        manifest={"version":2,"runtimeRoot":"public","index":"public/assets/forge-index.json","jobs":jobs}
        caps=capabilities({"blender":blender});build(app,manifest,caps,trusted=True);check(app,manifest)
        # Existing Audio Forge, not an unrelated new sound generator.
        audio={"version":1,"jobs":[{"name":"contact","type":"ambient","generator":"pluck","frequency":180,"duration":.16,"output":"public/assets/contact.wav","seed":17,"post":{"sampleRate":48000,"channels":1,"normalizeDb":-6,"fadeOut":.1}}]}
        json_write(source/"audio.json",audio)
        subprocess.run(["node",str(ROOT/"tools/audio-forge/run_manifest.mjs"),"--manifest",str(source/"audio.json"),"--base",str(app)],cwd=tmp,check=True)
        destination.mkdir(parents=True);shutil.copytree(app/"public",destination/"scene");shutil.copytree(source,destination/"source");json_write(destination/"manifest.json",manifest)
        print("Real drawn frames, weighted animated GLB, baked motion and Audio Forge contact exported",flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--blender",required=True);p.add_argument("--output",required=True);args=p.parse_args();run(Path(args.output).resolve(),args.blender)
