"""Art Forge actual temporary app-local round trip of provider rock asset.
This is a private CI staging owner, not a new Pocket Works app or runtime change."""
import os,json,shutil,subprocess
from pathlib import Path
root=Path.cwd();out=Path(os.environ["BOW_ART_OUTPUT"]);scratch=root/"apps/bow-reference-workshop-temp"
if scratch.exists():raise ValueError("Unexpected pre-existing staging owner")
try:
    source=scratch/"asset-forge/source";source.mkdir(parents=True)
    shutil.copytree(out/"nature/rock_moss_set_01",source/"rock")
    script=scratch/"asset-forge/import-rock.py"
    script.write_text("""import bpy,os,json
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
inputs=json.loads(os.environ['ART_FORGE_INPUTS']);outputs=json.loads(os.environ['ART_FORGE_OUTPUTS'])
src=next(p for k,p in inputs.items() if k.endswith('.gltf'))
bpy.ops.import_scene.gltf(filepath=src)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=outputs['editable'])
bpy.ops.export_scene.gltf(filepath=outputs['model'],export_format='GLB',export_cameras=False,export_lights=False)
""")
    inputs=[str(p.relative_to(scratch)) for p in (source/"rock").rglob("*") if p.is_file()]
    manifest={"version":2,"runtimeRoot":"public","index":"public/forge-index.json","jobs":[{"id":"moss-rock","adapter":"blender","source":"asset-forge/import-rock.py","inputs":inputs,"seed":17,"parameters":{},"outputs":{"model":"public/rock.glb","editable":"asset-forge/generated/rock.blend"},"budget":{"maxBytes":250000000,"maxTriangles":1000000,"maxTextureSize":4096},"provenance":{"author":"Poly Haven / Kless Gyzen","license":"CC0","origin":"https://polyhaven.com/a/rock_moss_set_01"}}]}
    (scratch/"asset-forge/manifest.json").write_text(json.dumps(manifest,indent=2))
    cmd=["python3","tools/art-forge/forge.py"];blender=os.environ["BLENDER"]
    for op in ("capabilities","plan","build"):
        args=cmd+[op,"--blender",blender]
        if op!="capabilities":args+=["--app",scratch.name]
        if op=="build":args+=["--allow-authored-python"]
        r=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        (out/("forge-"+op+".log")).write_text(r.stdout)
        if r.returncode:raise ValueError("Art Forge "+op+" failed; log retained")
    shutil.copyfile(scratch/"public/forge-index.json",out/"forge-index.json")
    shutil.copyfile(scratch/"public/rock.glb",out/"forge-rock.glb")
finally:
    shutil.rmtree(scratch,ignore_errors=True)
