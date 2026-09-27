extends Node3D

signal reached_gate
signal gone

var target_z := 7.0
var walking := false
var leaving := false
var speed := 2.35
var phase := 0.0
var skeleton: Skeleton3D
var pelvis_bone := -1
var spine_bone := -1
var arm_l := -1
var arm_r := -1
var leg_l := -1
var leg_r := -1
var head_bone := -1
var body_color := Color("#7c6e59")
var accent_color := Color("#5f4f45")
var role_name := ""
var variant_id := 0
var base_y := 0.03

func _ready() -> void:
	phase = randf() * TAU
	_build_rig()

func configure(profile: Dictionary, variant: int) -> void:
	role_name = String(profile.get("role", ""))
	variant_id = variant
	body_color = _role_color(role_name, variant)
	accent_color = body_color.darkened(0.22)
	var stature := 0.94 + float(variant % 5) * 0.025
	scale = Vector3(stature, stature, stature)
	speed = 2.12 + float((variant * 7) % 5) * 0.09
	if skeleton:
		_apply_palette()
		_add_accessories(role_name, variant)

func walk_to(z_value: float) -> void:
	target_z = z_value
	walking = true

func depart(accepted: bool) -> void:
	leaving = true
	target_z = -7.4 if accepted else 8.6
	walking = false
	var tw := create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	if accepted:
		tw.tween_property(self, "rotation_degrees:y", 0.0, 0.18)
	else:
		tw.tween_property(self, "rotation_degrees:y", 180.0, 0.28)
	tw.tween_interval(0.08)
	tw.tween_callback(func(): walking = true)

func _process(delta: float) -> void:
	phase += delta * (6.6 if walking else 1.8)
	if walking:
		var p := position
		p.z = move_toward(p.z, target_z, speed * delta)
		p.y = base_y + absf(sin(phase)) * 0.035
		position = p
		var swing := sin(phase) * 0.48
		var counter := sin(phase * 2.0) * 0.035
		skeleton.set_bone_pose_rotation(arm_l, Quaternion(Vector3.RIGHT, swing))
		skeleton.set_bone_pose_rotation(arm_r, Quaternion(Vector3.RIGHT, -swing))
		skeleton.set_bone_pose_rotation(leg_l, Quaternion(Vector3.RIGHT, -swing * 0.72))
		skeleton.set_bone_pose_rotation(leg_r, Quaternion(Vector3.RIGHT, swing * 0.72))
		skeleton.set_bone_pose_rotation(spine_bone, Quaternion(Vector3.FORWARD, counter))
		if absf(position.z - target_z) < 0.04:
			walking = false
			_reset_pose()
			if leaving:
				gone.emit()
				queue_free()
			else:
				reached_gate.emit()
	else:
		# Weight shift, breathing and small head movement. Enough to stop the visitor
		# from reading as a frozen chess piece without wasting a full animation rig.
		var breath := sin(phase) * 0.018
		var shift := sin(phase * 0.55) * 0.035
		skeleton.set_bone_pose_position(spine_bone, Vector3(0, breath, 0))
		skeleton.set_bone_pose_rotation(pelvis_bone, Quaternion(Vector3.FORWARD, shift))
		skeleton.set_bone_pose_rotation(head_bone, Quaternion(Vector3.UP, sin(phase * 0.62) * 0.075))
		skeleton.set_bone_pose_rotation(arm_l, Quaternion(Vector3.RIGHT, 0.04 + sin(phase * 0.7) * 0.025))
		skeleton.set_bone_pose_rotation(arm_r, Quaternion(Vector3.RIGHT, -0.03 - sin(phase * 0.7) * 0.025))

func react(positive: bool) -> void:
	if not skeleton:
		return
	var tw := create_tween().set_parallel(true)
	if positive:
		tw.tween_method(_set_head_pitch, 0.0, -0.22, 0.10)
		tw.chain().tween_method(_set_head_pitch, -0.22, 0.0, 0.14)
		tw.tween_property(self, "position:y", base_y + 0.05, 0.12)
		tw.chain().tween_property(self, "position:y", base_y, 0.16)
	else:
		tw.tween_method(_set_head_yaw, -0.15, 0.15, 0.18)
		tw.chain().tween_method(_set_head_yaw, 0.15, 0.0, 0.10)
		tw.tween_property(self, "position:y", base_y - 0.025, 0.10)
		tw.chain().tween_property(self, "position:y", base_y, 0.15)

func _set_head_pitch(value: float) -> void:
	skeleton.set_bone_pose_rotation(head_bone, Quaternion(Vector3.RIGHT, value))

func _set_head_yaw(value: float) -> void:
	skeleton.set_bone_pose_rotation(head_bone, Quaternion(Vector3.UP, value))

func _reset_pose() -> void:
	skeleton.set_bone_pose_position(spine_bone, Vector3.ZERO)
	for idx in [pelvis_bone, spine_bone, arm_l, arm_r, leg_l, leg_r, head_bone]:
		skeleton.set_bone_pose_rotation(idx, Quaternion.IDENTITY)

func _build_rig() -> void:
	skeleton = Skeleton3D.new()
	add_child(skeleton)

	pelvis_bone = _bone("pelvis", -1, Transform3D(Basis.IDENTITY, Vector3(0, 0.72, 0)))
	spine_bone = _bone("spine", pelvis_bone, Transform3D(Basis.IDENTITY, Vector3(0, 0.44, 0)))
	head_bone = _bone("head", spine_bone, Transform3D(Basis.IDENTITY, Vector3(0, 0.50, 0)))
	arm_l = _bone("arm_l", spine_bone, Transform3D(Basis.IDENTITY, Vector3(-0.30, 0.22, 0)))
	arm_r = _bone("arm_r", spine_bone, Transform3D(Basis.IDENTITY, Vector3(0.30, 0.22, 0)))
	leg_l = _bone("leg_l", pelvis_bone, Transform3D(Basis.IDENTITY, Vector3(-0.15, -0.42, 0)))
	leg_r = _bone("leg_r", pelvis_bone, Transform3D(Basis.IDENTITY, Vector3(0.15, -0.42, 0)))

	_attach_cylinder(spine_bone, Vector3(0.48, 0.68, 0.30), body_color, Vector3(0, 0.05, 0))
	_attach_sphere(head_bone, 0.22, Color("#c39c78"), Vector3(0, 0.16, 0))
	_attach_limb(arm_l, Vector3(0.11, 0.50, 0.11), accent_color, Vector3(0, -0.20, 0), Vector3(0, 0, -0.08))
	_attach_limb(arm_r, Vector3(0.11, 0.50, 0.11), accent_color, Vector3(0, -0.20, 0), Vector3(0, 0, 0.08))
	_attach_limb(leg_l, Vector3(0.14, 0.55, 0.16), Color("#3e403c"), Vector3(0, -0.24, 0), Vector3.ZERO)
	_attach_limb(leg_r, Vector3(0.14, 0.55, 0.16), Color("#3e403c"), Vector3(0, -0.24, 0), Vector3.ZERO)
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
	mesh.radial_segments = 9
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
	mesh.radial_segments = 9
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
				if mesh is MeshInstance3D and child.bone_idx == spine_bone:
					mesh.material_override = _mat(body_color)

func _add_accessories(role: String, variant: int) -> void:
	var head_attach := BoneAttachment3D.new()
	head_attach.bone_idx = head_bone
	skeleton.add_child(head_attach)
	var hat := MeshInstance3D.new()
	var hat_mesh := CylinderMesh.new()
	hat_mesh.top_radius = 0.14 + float(variant % 3) * 0.014
	hat_mesh.bottom_radius = 0.24
	hat_mesh.height = 0.10
	hat_mesh.radial_segments = 9
	hat.mesh = hat_mesh
	hat.position = Vector3(0, 0.38, 0)
	hat.material_override = _mat(Color("#666a62") if _is_military(role) else accent_color)
	head_attach.add_child(hat)

	if _is_military(role):
		var back_attach := BoneAttachment3D.new()
		back_attach.bone_idx = spine_bone
		skeleton.add_child(back_attach)
		var spear := MeshInstance3D.new()
		var spear_mesh := BoxMesh.new()
		spear_mesh.size = Vector3(0.035, 1.45, 0.035)
		spear.mesh = spear_mesh
		spear.position = Vector3(0.28, 0.15, 0.15)
		spear.rotation_degrees.z = -8.0
		spear.material_override = _mat(Color("#575c57"))
		back_attach.add_child(spear)
	elif role.contains("беж") or role.contains("охот") or role.contains("палом") or role.contains("сирот"):
		var back_attach := BoneAttachment3D.new()
		back_attach.bone_idx = spine_bone
		skeleton.add_child(back_attach)
		var pack := MeshInstance3D.new()
		var pack_mesh := BoxMesh.new()
		pack_mesh.size = Vector3(0.34,0.42,0.18)
		pack.mesh = pack_mesh
		pack.position = Vector3(0,-0.02,0.20)
		pack.material_override = _mat(Color("#69533e"))
		back_attach.add_child(pack)

func _is_military(role: String) -> bool:
	return role.contains("солдат") or role.contains("дезертир") or role.contains("наём") or role.contains("ветеран") or role.contains("ополчен")

func _mat(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.90
	return material

func _role_color(role: String, variant: int) -> Color:
	var palette := [
		Color("#6f5a49"), Color("#5e6e62"), Color("#725452"),
		Color("#626071"), Color("#806d50"), Color("#52666a")
	]
	if role.contains("купец") or role.contains("торгов"):
		return Color("#816846")
	if role.contains("лекар") or role.contains("монах"):
		return Color("#64705f")
	if _is_military(role):
		return Color("#565e59")
	return palette[variant % palette.size()]
