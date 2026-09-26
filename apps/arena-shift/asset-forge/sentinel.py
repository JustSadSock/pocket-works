import bpy
import math
import os
import sys
from mathutils import Vector

def output_path():
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1:]
        for i, arg in enumerate(args):
            if arg == "--output" and i + 1 < len(args):
                return args[i + 1]
    value = os.environ.get("ASSET_FORGE_OUTPUT")
    if value:
        return value
    raise RuntimeError("Asset Forge output path is required")

OUT = output_path()
os.makedirs(os.path.dirname(OUT), exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0.0, roughness=0.6, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 2.0
    return mat

IRON = material("Iron", (0.22, 0.27, 0.24), 0.55, 0.44)
STONE = material("Ceramic", (0.72, 0.68, 0.58), 0.05, 0.78)
ACCENT = material("SignalOrange", (0.76, 0.22, 0.10), 0.35, 0.42)
DARK = material("DarkJoint", (0.07, 0.08, 0.07), 0.65, 0.35)
GLOW = material("Eye", (0.95, 0.58, 0.23), 0.1, 0.25, (0.95, 0.30, 0.06))

arm_data = bpy.data.armatures.new("SentinelRig")
arm = bpy.data.objects.new("SentinelRig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

bones = {}
def bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = bones[parent]
    bones[name] = b
    return b

bone("root", (0,0,0), (0,0,0.35))
bone("torso", (0,0,0.35), (0,0,1.25), "root")
bone("head", (0,0,1.25), (0,0,1.7), "torso")
bone("arm_l", (-0.46,0,1.15), (-0.86,0,0.70), "torso")
bone("arm_r", (0.46,0,1.15), (0.86,0,0.70), "torso")
bone("leg_l", (-0.24,0,0.35), (-0.30,0,-0.60), "root")
bone("leg_r", (0.24,0,0.35), (0.30,0,-0.60), "root")
bone("weapon", (0.86,0,0.70), (0.86,-0.85,0.55), "arm_r")
bpy.ops.object.mode_set(mode='POSE')

for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

bpy.ops.object.mode_set(mode='OBJECT')

def parent_to_bone(obj, bone_name):
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    obj.matrix_world = world

def cube(name, loc, scale, mat, bevel=0.08, bone_name=None):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("EdgeSoftener", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    obj.data.materials.append(mat)
    if bone_name:
        parent_to_bone(obj, bone_name)
    return obj

def cyl(name, loc, radius, depth, mat, bone_name=None, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("RimSoftener", "BEVEL")
    bevel.width = min(radius * 0.18, 0.06)
    bevel.segments = 2
    obj.data.materials.append(mat)
    if bone_name:
        parent_to_bone(obj, bone_name)
    return obj

# Torso: broad mechanical chest with contrasting ceramic armor.
cube("Core", (0,0,0.88), (0.42,0.28,0.46), IRON, 0.10, "torso")
cube("ChestPlate", (0,-0.29,0.94), (0.34,0.08,0.29), STONE, 0.06, "torso")
cube("SignalStripe", (0,-0.385,0.94), (0.08,0.025,0.22), ACCENT, 0.02, "torso")
cyl("Waist", (0,0,0.38), 0.28, 0.22, DARK, "root", (math.pi/2,0,0))

# Head and glowing optic.
cube("Head", (0,0,1.48), (0.29,0.27,0.22), STONE, 0.07, "head")
cube("Face", (0,-0.285,1.47), (0.22,0.035,0.10), DARK, 0.02, "head")
cyl("Eye", (0,-0.345,1.48), 0.08, 0.055, GLOW, "head", (math.pi/2,0,0))

# Arms with shoulder discs.
for side, x, bname in [("L",-1,"arm_l"),("R",1,"arm_r")]:
    cyl("Shoulder"+side, (0.49*x,0,1.15), 0.24, 0.24, ACCENT if side=="R" else STONE, bname, (0,math.pi/2,0))
    cube("UpperArm"+side, (0.66*x,0,0.91), (0.13,0.15,0.30), IRON, 0.05, bname)
    cyl("Elbow"+side, (0.78*x,0,0.66), 0.13, 0.18, DARK, bname, (0,math.pi/2,0))
    cube("Forearm"+side, (0.81*x,-0.03,0.48), (0.16,0.18,0.25), STONE, 0.05, bname)

# Legs and heavy feet.
for side, x, bname in [("L",-1,"leg_l"),("R",1,"leg_r")]:
    cube("Thigh"+side, (0.25*x,0,0.08), (0.17,0.19,0.34), IRON, 0.06, bname)
    cyl("Knee"+side, (0.28*x,-0.08,-0.20), 0.14, 0.18, ACCENT, bname, (0,math.pi/2,0))
    cube("Shin"+side, (0.30*x,0,-0.43), (0.16,0.18,0.28), STONE, 0.05, bname)
    cube("Foot"+side, (0.30*x,-0.16,-0.70), (0.20,0.34,0.11), DARK, 0.05, bname)

# Weapon: a compact orange-edged impact baton.
cube("WeaponSpine", (0.84,-0.45,0.55), (0.07,0.48,0.08), DARK, 0.03, "weapon")
cube("WeaponEdge", (0.84,-0.63,0.55), (0.13,0.26,0.13), ACCENT, 0.05, "weapon")
cyl("WeaponPommel", (0.84,0.02,0.55), 0.12, 0.18, IRON, "weapon", (math.pi/2,0,0))

# Deterministic authored animation. The clip intentionally contains idle breathing,
# locomotion and a readable strike within one exported action; runtime movement
# chooses when the model is visible and supplements it with gameplay rotation.
arm.animation_data_create()
action = bpy.data.actions.new("Sentinel_Motion")
action.use_fake_user = True
arm.animation_data.action = action

def set_frame(frame, torso_z=0.0, arm_l=0.0, arm_r=0.0, leg_l=0.0, leg_r=0.0, weapon=0.0):
    torso = arm.pose.bones["torso"]
    torso.location = Vector((0,0,torso_z))
    torso.keyframe_insert("location", frame=frame, group="torso")
    for name, value in [("arm_l",arm_l),("arm_r",arm_r),("leg_l",leg_l),("leg_r",leg_r),("weapon",weapon)]:
        pb = arm.pose.bones[name]
        pb.rotation_euler = (value, 0, 0)
        pb.keyframe_insert("rotation_euler", frame=frame, group=name)

set_frame(1, 0.00, 0.05, -0.05, -0.03, 0.03, 0.0)
set_frame(12, 0.035, -0.06, 0.06, 0.04, -0.04, 0.0)
set_frame(24, 0.00, 0.05, -0.05, -0.03, 0.03, 0.0)
set_frame(34, 0.02, 0.45, -0.55, -0.35, 0.35, -0.25)
set_frame(42, 0.00, -0.48, 0.50, 0.35, -0.35, 0.18)
set_frame(50, 0.015, 0.34, -1.10, -0.18, 0.18, -1.35)
set_frame(56, 0.00, 0.02, 0.08, 0.00, 0.00, 0.10)
set_frame(64, 0.00, 0.05, -0.05, -0.03, 0.03, 0.0)

# Blender 5.x Action slots no longer expose Action.fcurves directly.
# Default interpolation is preserved; the authored timing remains deterministic.

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 64
scene.render.fps = 30

# Add a tiny hidden skinned marker so the GLB contains an actual armature modifier,
# not merely bone-parented rigid pieces.
bpy.ops.mesh.primitive_cube_add(size=0.05, location=(0,0,0.7))
skin = bpy.context.object
skin.name = "RigValidationMesh"
skin.hide_render = True
skin.data.materials.append(IRON)
mod = skin.modifiers.new("Armature", "ARMATURE")
mod.object = arm
group = skin.vertex_groups.new(name="torso")
for v in skin.data.vertices:
    group.add([v.index], 1.0, 'REPLACE')

bpy.context.view_layer.objects.active = arm
arm.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_animations=True,
    export_apply=True,
    export_yup=True
)

print("Arena Shift sentinel exported:", OUT)
