extends Node3D

signal reached_gate
signal gone

var target_z := 7.0
var walking := false
var leaving := false
var speed := 2.4
var phase := 0.0
var skeleton: Skeleton3D
var arm_l := -1
var arm_r := -1
var leg_l := -1
var leg_r := -1
var head_bone := -1
var body_color := Color("#7c6e59")
var accent_color := Color("#5f4f45")

func _ready() -> void:
	phase = randf() * TAU
	_build_rig()

func configure(profile: Dictionary, variant: int) -> void:
	body_color = _role_color(String(profile.get("role", "")), variant)
	accent_color = body_color.darkened(0.22)
	if skeleton:
		_apply_palette()
		_add_accessory(String(profile.get("role", "")), variant)

func walk_to(z_value: float) -> void:
	target_z = z_value
	walking = true

func depart(accepted: bool) -> void:
	leaving = true
	target_z = -7.4 if accepted else 8.6
	walking = true

func _process(delta: float) -> void:
	phase += delta * (7.0 if walking else 2.0)
	if walking:
		var p := position
		p.z = move_toward(p.z, target_z, speed * delta)
		p.y = 0.03 + abs(sin(phase)) * 0.055
		position = p
		var swing := sin(phase) * 0.55
		skeleton.set_bone_pose_rotation(arm_l, Quaternion(Vector3.RIGHT, swing))
		skeleton.set_bone_pose_rotation(arm_r, Quaternion(Vector3.RIGHT, -swing))
		skeleton.set_bone_pose_rotation(leg_l, Quaternion(Vector3.RIGHT, -swing * 0.7))
		skeleton.set_bone_pose_rotation(leg_r, Quaternion(Vector3.RIGHT, swing * 0.7))
		if abs(position.z - target_z) < 0.04:
			walking = false
			_reset_pose()
			if leaving:
				gone.emit()
				queue_free()
			else:
				reached_gate.emit()
	else:
		var idle := sin(phase) * 0.04
		skeleton.set_bone_pose_rotation(head_bone, Quaternion(Vector3.UP, idle))

func react(positive: bool) -> void:
	if not skeleton:
		return
	var tw := create_tween()
	var target := Vector3(0, 0.10, 0) if positive else Vector3(0, -0.05, 0)
	tw.tween_property(self, "position", position + target, 0.12)
	tw.tween_property(self, "position", position, 0.18)

func _reset_pose() -> void:
	for idx in [arm_l, arm_r, leg_l, leg_r, head_bone]:
		skeleton.set_bone_pose_rotation(idx, Quaternion.IDENTITY)

func _build_rig() -> void:
	skeleton = Skeleton3D.new()
	add_child(skeleton)

	var pelvis := _bone("pelvis", -1, Transform3D(Basis.IDENTITY, Vector3(0, 0.72, 0)))
	var spine := _bone("spine", pelvis, Transform3D(Basis.IDENTITY, Vector3(0, 0.44, 0)))
	head_bone = _bone("head", spine, Transform3D(Basis.IDENTITY, Vector3(0, 0.50, 0)))
	arm_l = _bone("arm_l", spine, Transform3D(Basis.IDENTITY, Vector3(-0.30, 0.22, 0)))
	arm_r = _bone("arm_r", spine, Transform3D(Basis.IDENTITY, Vector3(0.30, 0.22, 0)))
	leg_l = _bone("leg_l", pelvis, Transform3D(Basis.IDENTITY, Vector3(-0.15, -0.42, 0)))
	leg_r = _bone("leg_r", pelvis, Transform3D(Basis.IDENTITY, Vector3(0.15, -0.42, 0)))

	_attach_cylinder(spine, Vector3(0.46, 0.66, 0.30), body_color, Vector3(0, 0.05, 0))
	_attach_sphere(head_bone, 0.22, Color("#c8a983"), Vector3(0, 0.16, 0))
	_attach_limb(arm_l, Vector3(0.11, 0.50, 0.11), accent_color, Vector3(0, -0.20, 0), Vector3(0, 0, -0.08))
	_attach_limb(arm_r, Vector3(0.11, 0.50, 0.11), accent_color, Vector3(0, -0.20, 0), Vector3(0, 0, 0.08))
	_attach_limb(leg_l, Vector3(0.14, 0.55, 0.16), Color("#4b4b45"), Vector3(0, -0.24, 0), Vector3.ZERO)
	_attach_limb(leg_r, Vector3(0.14, 0.55, 0.16), Color("#4b4b45"), Vector3(0, -0.24, 0), Vector3.ZERO)
	_apply_palette()

func _bone(name: String, parent: int, rest: Transform3D) -> int:
	var idx := skeleton.get_bone_count()
	skeleton.add_bone(name)
	if parent >= 0:
		skeleton.set_bone_parent(idx, parent)
	skeleton.set_bone_rest(idx, rest)
	return idx

func _attach_cylinder(bone: int, size: Vector3, color: Color, offset: Vector3) -> void:
	var attachment := BoneAttachment3D.new()
	attachment.bone_idx = bone
	skeleton.add_child(attachment)
	var mesh_instance := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = size.x * 0.46
	mesh.bottom_radius = size.x * 0.58
	mesh.height = size.y
	mesh.radial_segments = 8
	mesh_instance.mesh = mesh
	mesh_instance.position = offset
	mesh_instance.material_override = _mat(color)
	attachment.add_child(mesh_instance)

func _attach_sphere(bone: int, radius: float, color: Color, offset: Vector3) -> void:
	var attachment := BoneAttachment3D.new()
	attachment.bone_idx = bone
	skeleton.add_child(attachment)
	var mesh_instance := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 8
	mesh.rings = 5
	mesh_instance.mesh = mesh
	mesh_instance.position = offset
	mesh_instance.material_override = _mat(color)
	attachment.add_child(mesh_instance)

func _attach_limb(bone: int, size: Vector3, color: Color, offset: Vector3, rotation: Vector3) -> void:
	var attachment := BoneAttachment3D.new()
	attachment.bone_idx = bone
	skeleton.add_child(attachment)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.position = offset
	mesh_instance.rotation = rotation
	mesh_instance.material_override = _mat(color)
	attachment.add_child(mesh_instance)

func _apply_palette() -> void:
	if not skeleton:
		return
	for child in skeleton.get_children():
		if child is BoneAttachment3D:
			for mesh in child.get_children():
				if mesh is MeshInstance3D and child.bone_idx == skeleton.find_bone("spine"):
					mesh.material_override = _mat(body_color)

func _add_accessory(role: String, variant: int) -> void:
	var head_attach := BoneAttachment3D.new()
	head_attach.bone_idx = head_bone
	skeleton.add_child(head_attach)
	var mesh_instance := MeshInstance3D.new()
	if role.contains("солдат") or role.contains("дезертир") or role.contains("наём"):
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.18
		mesh.bottom_radius = 0.24
		mesh.height = 0.13
		mesh.radial_segments = 8
		mesh_instance.mesh = mesh
		mesh_instance.position = Vector3(0, 0.39, 0)
		mesh_instance.material_override = _mat(Color("#72736a"))
	else:
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.14 + float(variant % 3) * 0.015
		mesh.bottom_radius = 0.24
		mesh.height = 0.10
		mesh.radial_segments = 8
		mesh_instance.mesh = mesh
		mesh_instance.position = Vector3(0, 0.38, 0)
		mesh_instance.material_override = _mat(accent_color)
	head_attach.add_child(mesh_instance)

func _mat(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.88
	return material

func _role_color(role: String, variant: int) -> Color:
	var palette := [
		Color("#77634f"), Color("#68766a"), Color("#755b59"),
		Color("#6b6978"), Color("#8a7757"), Color("#596b70")
	]
	if role.contains("купец") or role.contains("торгов"):
		return Color("#8a704d")
	if role.contains("лекар") or role.contains("монах"):
		return Color("#6c7567")
	if role.contains("солдат") or role.contains("дезертир") or role.contains("наём"):
		return Color("#646762")
	return palette[variant % palette.size()]
