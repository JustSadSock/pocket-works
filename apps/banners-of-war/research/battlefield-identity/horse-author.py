import bpy,os,json
from pathlib import Path
out=json.loads(os.environ["ART_FORGE_OUTPUTS"]);inputs=json.loads(os.environ["ART_FORGE_INPUTS"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=inputs["asset-forge/horse.glb"])
for img in bpy.data.images:
    if max(img.size)>1024:
        r=1024/max(img.size);img.scale(max(1,round(img.size[0]*r)),max(1,round(img.size[1]*r)))
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out["editable"],compress=False)
bpy.ops.export_scene.gltf(filepath=out["model"],export_format="GLB",export_animations=True)
# Universal Forge requires uncompressed editable BLEND. This extra budget is
# exclusively for offline source, never a relaxation of the runtime GLB cap.
model=Path(out["model"]);editable=Path(out["editable"])
print("Horse GLB / editable bytes",model.stat().st_size,editable.stat().st_size,flush=True)
if model.stat().st_size>8000000:raise ValueError("Horse runtime GLB exceeds original 8 MB limit")
