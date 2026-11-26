"""Use the existing Art Forge v2 build/check contract, in a disposable app owner.
No runtime publish, registry edit, or independent production mechanism."""
import os,sys,json,shutil,subprocess
from pathlib import Path
root=Path.cwd();evidence=Path(os.environ["CHARACTER_EVIDENCE"]).resolve()
scratch=root/"apps/character-forge-research-temp"
if scratch.exists():raise ValueError("Staging owner already exists")
try:
    source=scratch/"asset-forge";source.mkdir(parents=True)
    shutil.copyfile(evidence/"rider-miniature/character.glb",source/"candidate.glb")
    (source/"import.py").write_text("""import bpy,os,json
bpy.ops.wm.read_factory_settings(use_empty=True)
inputs=json.loads(os.environ['ART_FORGE_INPUTS']);outputs=json.loads(os.environ['ART_FORGE_OUTPUTS'])
bpy.ops.import_scene.gltf(filepath=inputs['asset-forge/candidate.glb'])
assert any(o.type=='ARMATURE' for o in bpy.context.scene.objects)
assert len(bpy.data.actions)>0
bpy.ops.wm.save_as_mainfile(filepath=outputs['editable'])
bpy.ops.export_scene.gltf(filepath=outputs['model'],export_format='GLB',export_animations=True)
""")
    manifest={"version":2,"runtimeRoot":"public","index":"public/forge-index.json","jobs":[{"id":"character-roundtrip","adapter":"blender","source":"asset-forge/import.py","inputs":["asset-forge/candidate.glb"],"seed":17,"parameters":{},"outputs":{"model":"public/character.glb","editable":"asset-forge/generated/character.blend"},"budget":{"maxBytes":32000000,"maxTriangles":1000000,"maxTextureSize":4096},"validation":{"requireArmature":True,"requireAnimation":True},"provenance":{"author":"Pocket Works","license":"original","origin":"Universal Character Forge research"}}]}
    (source/"manifest.json").write_text(json.dumps(manifest,indent=2))
    for op in ("plan","build","check"):
        args=[sys.executable,"tools/art-forge/forge.py",op,"--app",scratch.name,"--blender",os.environ["BLENDER"]]
        if op=="build":args.append("--allow-authored-python")
        r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(evidence/("forge-"+op+".log")).write_text(r.stdout)
        if r.returncode:raise ValueError("Art Forge "+op+" failed")
    for f in ("public/character.glb","public/forge-index.json","asset-forge/generated/character.blend"):shutil.copyfile(scratch/f,evidence/("roundtrip-"+Path(f).name))
finally:shutil.rmtree(scratch,ignore_errors=True)
