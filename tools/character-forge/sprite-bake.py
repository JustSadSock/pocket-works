"""One bounded matching sprite: native transparent PNG vs existing Art Forge bake.
No new publisher. Render an authored BLEND in disposable staging owner."""
import os,sys,json,shutil,subprocess,time
from pathlib import Path
from PIL import Image
root=Path.cwd();evidence=Path(os.environ["CHARACTER_EVIDENCE"]);surface=os.environ.get("CHARACTER_SURFACE_BAKE")=="1";src=evidence/("morph" if surface else "sprites-citizen");scratch=root/"apps/character-sprite-research-temp";prefix="sprite-v7" if surface else "sprite";size=512 if surface else 128
if scratch.exists():raise ValueError("Staging owner already exists")
try:
    source=scratch/"asset-forge";source.mkdir(parents=True)
    shutil.copyfile(src/("v7-C.glb" if surface else "model.glb"),source/"candidate.glb")
    if surface:
        report=json.loads((src/"v7-report.json").read_text());b=next(v["bounds"] for r in report["records"] if r["label"]=="C" for v in r["views"] if v["view"]=="three-quarter")
        f={"surface":True,"bounds":b,"scale":max(b[1]-b[0],b[3]-b[2])/.88}
        metadata={}
    else:
        metadata=json.loads((src/"metadata.json").read_text());f=metadata["frames"][0]
    script=source/"prepare.py"
    script.write_text("""import bpy,os,json,math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ['SPRITE_INPUT'])
s=bpy.context.scene
rig=next(o for o in s.objects if o.type=='ARMATURE')
f=json.loads(os.environ['SPRITE_FRAME']);b=f['bounds']
if f.get('surface'):
    rig.animation_data_clear()
    for bone in rig.pose.bones:bone.matrix_basis.identity()
    bpy.context.view_layer.update()
else:
    action=next(a for a in bpy.data.actions if a.name=='walk')
    rig.animation_data_clear();rig.animation_data_create();rig.animation_data.action=action
    if len(action.slots)==1:rig.animation_data.action_slot=action.slots[0]
    s.frame_set(int(action.frame_range[0]))
a=f.get('azimuth',0)
# Core coordinates +Y up +Z forward => Blender +Z up -Y forward.
dir=Vector((1,-1.65,.30) if f.get('surface') else (math.sin(a),-math.cos(a),.3)).normalized()
right=Vector((0,0,1)).cross(dir).normalized()
up=dir.cross(right)
target=right*((b[0]+b[1])*.5)+up*((b[2]+b[3])*.5)
cam=bpy.data.objects.new('Matched orthographic',bpy.data.cameras.new('Matched'));s.collection.objects.link(cam);s.camera=cam
cam.location=target+dir*8;cam.rotation_euler=(-dir).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=f['scale'] if f.get('surface') else 128/f['pixelsPerMetre']
world=bpy.data.worlds.new('Neutral sky');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.38,.38,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;s.world=world
light=bpy.data.objects.new('Key',bpy.data.lights.new('Key','AREA'));s.collection.objects.link(light);light.location=(-3,-4,5);light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=500;light.data.shape='DISK';light.data.size=4
s.view_settings.view_transform='AgX';s.render.film_transparent=True
bpy.ops.wm.save_as_mainfile(filepath=os.environ['SPRITE_BLEND'],compress=False)
""")
    blend=source/"sprite.blend";env=dict(os.environ,SPRITE_INPUT=str(source/"candidate.glb"),SPRITE_BLEND=str(blend),SPRITE_FRAME=json.dumps(f));blender=os.environ["BLENDER"];t=time.perf_counter()
    p=subprocess.run([blender,"--background","--factory-startup","--disable-autoexec","--python-exit-code","1","--python",str(script)],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (evidence/(prefix+"-prepare.log")).write_text(p.stdout)
    if p.returncode:raise ValueError("Sprite preparation failed")
    prep=(time.perf_counter()-t)*1000
    manifest={"version":2,"runtimeRoot":"public","index":"public/forge-index.json","jobs":[{"id":"matched-sprite","adapter":"bake","source":"asset-forge/sprite.blend","inputs":[],"seed":17,"parameters":{"width":size,"height":size,"frame":1,"samples":16},"outputs":{"image":"public/sprite.png"},"budget":{"maxBytes":1000000,"maxWidth":size,"maxHeight":size},"provenance":{"author":"Pocket Works","license":"original","origin":"Character Forge bounded sprite comparison"}}]}
    (source/"manifest.json").write_text(json.dumps(manifest,indent=2));t=time.perf_counter()
    for op in ("build","check"):
        p=subprocess.run([sys.executable,"tools/art-forge/forge.py",op,"--app",scratch.name,"--blender",blender],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(evidence/(prefix+"-forge-"+op+".log")).write_text(p.stdout)
        if p.returncode:raise ValueError("Sprite Art Forge "+op+" failed")
    ms=(time.perf_counter()-t)*1000
    for name,path in [(prefix+"-native.png",src/("v7-C-three-quarter.png" if surface else "0-0.png")),(prefix+"-blender.png",scratch/"public/sprite.png"),(prefix+"-source.blend",blend)]:shutil.copyfile(path,evidence/name)
    def measure(path):
        im=Image.open(path).convert("RGBA");a=im.getchannel("A");return {"bytes":path.stat().st_size,"alphaBounds":a.getbbox(),"opaquePixels":sum(1 for x in a.getdata() if x>0)}
    result={"native":measure(evidence/(prefix+"-native.png")),"artForge":measure(evidence/(prefix+"-blender.png")),"prepareMs":prep,"forgeBuildCheckMs":ms,"nativeSvgGenerationMsAllFrames":metadata.get("svgGenerationMs"),"nativeAtlasBytes":metadata.get("atlasBytes"),"limitations":"One v7 static textured GLB through Art Forge bake; camera framing matched, lighting/color management and native image resolution differ." if surface else "One matched 128px frame, lighting and raster pipeline differ. No atlas mass production or per-pixel artistic equivalence."}
    (evidence/(prefix+"-bake-comparison.json")).write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:shutil.rmtree(scratch,ignore_errors=True)
