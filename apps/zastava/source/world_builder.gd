extends Node3D

signal boot_completed
signal visitor_flow_finished

const VISITOR_SCRIPT := preload("res://source/visitor_actor.gd")

var sun: DirectionalLight3D
var environment: WorldEnvironment
var camera: Camera3D
var bridge_pivot: Node3D
var gate_bar: Node3D
var village_root: Node3D
var houses: Array[Node3D] = []
var market: Node3D
var forge: Node3D
var barracks: Node3D
var tents: Node3D
var rain: GPUParticles3D
var snow: GPUParticles3D
var visitor: Node3D
var current_weather := "clear"
var authored_core := false
var last_growth_level := 0
var ambient_root: Node3D
var ambient_people: Array[Node3D] = []
var prosperity_details: Node3D
var security_details: Node3D
var trade_details: Node3D
var lanterns: Array[OmniLight3D] = []
var forge_smoke: GPUParticles3D
var motion_clock := 0.0
var boot_ready := false
var live_scene_ready := false
var live_scene_building := false
var pending_state: Dictionary = {}
var pending_weather := "clear"
var current_time_progress := 0.28
var time_tween: Tween
var weather_tween: Tween
var gate_motion_tween: Tween
var gate_is_open := false

const C_GRASS := Color("#66735f")
const C_GRASS_DARK := Color("#505d4d")
const C_STONE := Color("#8f897b")
const C_STONE_DARK := Color("#5f6059")
const C_WOOD := Color("#684936")
const C_WOOD_LIGHT := Color("#916643")
const C_ROOF := Color("#644239")
const C_ROAD := Color("#756852")
const C_WATER := Color("#4c6e72")
const C_METAL := Color("#444d49")
const C_CLOTH := Color("#79634e")

const RIVER_CENTER_Z := 1.0
const RIVER_HALF_DEPTH := 2.80
const RIVER_Z_MIN := RIVER_CENTER_Z - RIVER_HALF_DEPTH
const RIVER_Z_MAX := RIVER_CENTER_Z + RIVER_HALF_DEPTH
const BRIDGE_HALF_WIDTH := 1.08
const GATE_Z := -1.14
const FAR_LANDING_Z := 4.10

func _ready() -> void:
	# Keep _ready intentionally tiny. Godot does not dismiss its Web splash until
	# the first rendered frame; building the whole diorama here made Chromium sit
	# on the engine splash while meshes, GLB materials and particles were created.
	set_process(false)
	_build_environment()

func finish_boot(initial_state: Dictionary, weather: String) -> void:
	if boot_ready:
		set_state(initial_state)
		set_weather(weather)
		boot_completed.emit()
		return
	pending_state = initial_state.duplicate(true)
	pending_weather = weather

	PocketWorks.set_boot_stage("world-landscape")
	_build_landscape()
	await get_tree().process_frame

	PocketWorks.set_boot_stage("world-gatehouse")
	authored_core = _try_authored_core()
	await get_tree().process_frame

	PocketWorks.set_boot_stage("world-village")
	_build_village_architecture()
	await get_tree().process_frame

	PocketWorks.set_boot_stage("world-mechanism")
	_build_moving_bridge()
	await get_tree().process_frame

	PocketWorks.set_boot_stage("world-weather")
	_build_weather()
	await get_tree().process_frame

	boot_ready = true
	set_time(current_time_progress)
	set_state(pending_state)
	set_weather(pending_weather)
	PocketWorks.set_boot_stage("world-ready")
	boot_completed.emit()

func activate_live_scene(state: Dictionary) -> void:
	if live_scene_ready or live_scene_building or not boot_ready:
		return
	live_scene_building = true
	PocketWorks.set_boot_stage("live-details")
	await get_tree().process_frame
	_build_living_details()
	await get_tree().process_frame
	live_scene_ready = true
	live_scene_building = false
	set_state(state)
	set_time(current_time_progress)
	set_process(true)
	PocketWorks.set_boot_stage("live-ready")

func is_boot_ready() -> bool:
	return boot_ready

func _build_environment() -> void:
	environment = WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#737e78")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#b8b09b")
	env.ambient_light_energy = 0.46
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = env
	add_child(environment)

	sun = DirectionalLight3D.new()
	sun.light_color = Color("#efd0a3")
	sun.light_energy = 0.92
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 28.0
	sun.rotation_degrees = Vector3(-48, -24, 0)
	add_child(sun)

	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 18.7
	camera.position = Vector3(8.25, 12.0, 13.25)
	camera.look_at_from_position(camera.position, Vector3(0, 0.35, -0.75))
	camera.current = true
	add_child(camera)

func _build_landscape() -> void:
	var ground := _box("Ground", Vector3(13.2, 0.25, 21.0), C_GRASS, Vector3(0, -0.20, -1.1))
	add_child(ground)
	var far_bank := _box("FarBank", Vector3(13.2, 0.32, 6.0), C_GRASS_DARK, Vector3(0, -0.12, 8.0))
	add_child(far_bank)

	var water_mesh := MeshInstance3D.new()
	water_mesh.name = "River"
	var plane := PlaneMesh.new()
	plane.size = Vector2(13.4, 5.6)
	plane.subdivide_width = 36
	plane.subdivide_depth = 16
	water_mesh.mesh = plane
	water_mesh.position = Vector3(0, -0.03, 1.0)
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
render_mode cull_disabled;
void vertex() {
	float a = sin(VERTEX.x * 1.7 + TIME * 1.15) * 0.045;
	float b = sin(VERTEX.z * 2.4 - TIME * 0.82) * 0.028;
	VERTEX.y += a + b;
}
void fragment() {
	float ripple = sin((VERTEX.x + VERTEX.z) * 3.2 + TIME * 1.7) * 0.5 + 0.5;
	float bands = sin(VERTEX.x * 5.0 - TIME * 0.55) * 0.5 + 0.5;
	ALBEDO = mix(vec3(0.20,0.32,0.34), vec3(0.31,0.44,0.44), ripple * 0.16 + bands * 0.035);
	ROUGHNESS = 0.46;
	METALLIC = 0.01;
}
"""
	var sm := ShaderMaterial.new()
	sm.shader = shader
	water_mesh.material_override = sm
	add_child(water_mesh)

	var road_a := _box("RoadNear", Vector3(2.0, 0.05, 7.0), C_ROAD, Vector3(0, 0.01, -5.25))
	road_a.rotation_degrees.y = -1.0
	add_child(road_a)
	var road_b := _box("RoadFar", Vector3(1.75, 0.05, 5.4), C_ROAD.darkened(0.05), Vector3(0, 0.01, 6.75))
	add_child(road_b)

	# Trees are curated outside the rectangular river footprint. Procedural z
	# stepping used to place trunks directly in the water.
	for spec in [
		[Vector3(-5.15,0,-8.4),0.86], [Vector3(5.20,0,-7.2),0.80],
		[Vector3(-4.75,0,-5.7),0.92], [Vector3(5.10,0,-4.35),0.78],
		[Vector3(-5.35,0,-2.65),0.82], [Vector3(4.95,0,-2.55),0.76],
		[Vector3(-5.00,0,5.25),0.74], [Vector3(4.70,0,5.75),0.78],
		[Vector3(-5.45,0,7.05),0.70], [Vector3(5.05,0,7.70),0.76],
		[Vector3(-4.80,0,9.00),0.80], [Vector3(5.30,0,9.35),0.72]
	]:
		add_child(_tree(spec[0], spec[1]))

	# Give the rectangular water mesh actual banks. Each bank is split around the
	# bridge corridor, so land can never visually cover the usable crossing.
	for side_index in range(2):
		var side: float = -1.0 if side_index == 0 else 1.0
		var bank_x: float = side * 3.85
		add_child(_box("NearBank", Vector3(5.45, 0.18, 0.56), C_GRASS_DARK.lightened(0.04), Vector3(bank_x, 0.015, RIVER_Z_MIN - 0.08)))
		add_child(_box("FarBankLip", Vector3(5.45, 0.18, 0.56), C_GRASS_DARK.lightened(0.02), Vector3(bank_x, 0.015, RIVER_Z_MAX + 0.08)))
		var wet_near := _box("WetBank", Vector3(5.35, 0.028, 0.14), C_ROAD.darkened(0.22), Vector3(bank_x, 0.07, RIVER_Z_MIN + 0.12))
		var wet_far := _box("WetBank", Vector3(5.35, 0.028, 0.14), C_ROAD.darkened(0.22), Vector3(bank_x, 0.07, RIVER_Z_MAX - 0.12))
		add_child(wet_near)
		add_child(wet_far)

	for i in range(7):
		var rut := _box("RoadRut", Vector3(0.07, 0.014, 0.56), C_ROAD.darkened(0.18), Vector3(-0.43 if i % 2 == 0 else 0.43, 0.045, -8.50 + float(i) * 1.02))
		rut.rotation_degrees.y = -1.0
		add_child(rut)

	for pos in [
		Vector3(-4.75,0.08,RIVER_Z_MIN - 0.42), Vector3(4.55,0.08,RIVER_Z_MIN - 0.38),
		Vector3(-4.55,0.08,RIVER_Z_MAX + 0.40), Vector3(4.82,0.08,RIVER_Z_MAX + 0.36),
		Vector3(-3.15,0.08,RIVER_Z_MAX + 0.48), Vector3(3.25,0.08,RIVER_Z_MIN - 0.44)
	]:
		_add_land_prop(_rock_cluster(pos, 0.23), pos, 0.22)

	for pos in [
		Vector3(-4.65,0.02,RIVER_Z_MIN - 0.22), Vector3(-3.9,0.02,RIVER_Z_MAX + 0.20),
		Vector3(4.45,0.02,RIVER_Z_MIN - 0.20), Vector3(3.9,0.02,RIVER_Z_MAX + 0.22)
	]:
		_add_land_prop(_reed_cluster(pos), pos, 0.12)

	# Small grass tufts break the empty planes without becoming gameplay clutter.
	for pos in [
		Vector3(-3.8,0.02,-3.1), Vector3(4.1,0.02,-4.0), Vector3(-4.25,0.02,-6.4),
		Vector3(4.35,0.02,5.1), Vector3(-4.0,0.02,6.2), Vector3(3.7,0.02,8.0)
	]:
		add_child(_grass_tuft(pos))

func _try_authored_core() -> bool:
	var path := "res://assets/zastava_core.glb"
	if not ResourceLoader.exists(path):
		return false
	var packed := load(path)
	if packed is PackedScene:
		var instance := (packed as PackedScene).instantiate()
		instance.name = "AuthoredCore"
		_tint_authored_core(instance)
		add_child(instance)
		return true
	return false

func _tint_authored_core(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		var n := String(mesh_node.name).to_lower()
		var tint := C_STONE
		if n.contains("roof") or n.contains("banner"):
			tint = C_ROOF if n.contains("roof") else Color("#6d4a3e")
		elif n.contains("iron") or n.contains("drum") or n.contains("chain"):
			tint = C_METAL
		elif n.contains("booth") or n.contains("winch") or n.contains("oak"):
			tint = C_WOOD_LIGHT
		elif n.contains("slit") or n.contains("mortar") or n.contains("cap"):
			tint = C_STONE_DARK
		mesh_node.material_override = _mat(tint)
	for child in node.get_children():
		_tint_authored_core(child)

func _build_village_architecture() -> void:
	village_root = Node3D.new()
	village_root.name = "Village"
	add_child(village_root)

	if not authored_core:
		_build_gatehouse()
	for spec in [
		[Vector3(-3.3, 0, -4.8), 0.85, 0.0],
		[Vector3(3.15, 0, -5.4), 0.78, 180.0],
		[Vector3(-3.9, 0, -7.3), 0.70, 10.0],
		[Vector3(3.8, 0, -8.0), 0.72, -8.0],
		[Vector3(-2.4, 0, -9.3), 0.68, -8.0],
		[Vector3(2.2, 0, -9.6), 0.74, 8.0]
	]:
		var house := _house(spec[0], spec[1], spec[2])
		house.visible = false
		houses.append(house)
		village_root.add_child(house)

	market = _market(Vector3(2.85, 0, -3.45))
	market.visible = false
	village_root.add_child(market)
	forge = _forge(Vector3(-2.9, 0, -3.55))
	forge.visible = false
	village_root.add_child(forge)
	barracks = _barracks(Vector3(3.75, 0, -6.7))
	barracks.visible = false
	village_root.add_child(barracks)
	tents = _tents(Vector3(-4.0, 0, -6.7))
	tents.visible = false
	village_root.add_child(tents)

func _build_gatehouse() -> void:
	for x in [-1.65, 1.65]:
		var tower := Node3D.new()
		tower.position = Vector3(x, 0, -1.95)
		tower.add_child(_box("Tower", Vector3(1.65, 3.1, 1.45), C_STONE, Vector3(0, 1.55, 0)))
		var roof := _roof(Vector3(1.95, 0.62, 1.75), C_ROOF)
		roof.position = Vector3(0, 3.38, 0)
		tower.add_child(roof)
		for y in [1.25, 2.15]:
			var slit := _box("Slit", Vector3(0.12, 0.38, 0.05), C_STONE_DARK, Vector3(0, y, 0.74))
			tower.add_child(slit)
		village_root.add_child(tower)
	var wall_l := _box("WallL", Vector3(2.1, 2.1, 0.85), C_STONE, Vector3(-3.5, 1.05, -2.0))
	var wall_r := _box("WallR", Vector3(2.1, 2.1, 0.85), C_STONE, Vector3(3.5, 1.05, -2.0))
	village_root.add_child(wall_l)
	village_root.add_child(wall_r)

func _build_moving_bridge() -> void:
	# Fixed aprons close the visual/physical gaps between road, gate and the
	# moving deck. The bridge hinge now sits exactly at the outer gate threshold.
	add_child(_box("GateApron", Vector3(2.02, 0.26, 0.82), C_STONE_DARK.lightened(0.10), Vector3(0, 0.17, -1.52)))
	add_child(_box("FarLanding", Vector3(2.02, 0.24, 0.90), C_ROAD.darkened(0.05), Vector3(0, 0.16, FAR_LANDING_Z)))
	for x in [-0.94, 0.94]:
		add_child(_box("GateCurb", Vector3(0.12, 0.30, 0.88), C_STONE_DARK, Vector3(x, 0.23, -1.52)))
		add_child(_box("LandingPost", Vector3(0.11, 0.48, 0.11), C_WOOD.darkened(0.08), Vector3(x, 0.30, FAR_LANDING_Z + 0.16)))

	bridge_pivot = Node3D.new()
	bridge_pivot.name = "BridgePivot"
	bridge_pivot.position = Vector3(0, 0.18, GATE_Z)
	add_child(bridge_pivot)
	var bridge_length := 4.98
	var bridge_center := bridge_length * 0.5
	var deck := _box("Deck", Vector3(1.8, 0.24, bridge_length), C_WOOD_LIGHT, Vector3(0, 0, bridge_center))
	bridge_pivot.add_child(deck)
	for x in [-0.82, 0.82]:
		var rail := _box("Rail", Vector3(0.085, 0.40, bridge_length), C_WOOD.darkened(0.04), Vector3(x, 0.31, bridge_center))
		bridge_pivot.add_child(rail)
	for i in range(14):
		var z := 0.28 + float(i) * 0.34
		bridge_pivot.add_child(_box("Plank", Vector3(1.68, 0.035, 0.055), C_WOOD.darkened(0.16), Vector3(0, 0.135, z)))
		for x in [-0.69, 0.69]:
			var stud := _box("Stud", Vector3(0.055, 0.035, 0.055), C_METAL, Vector3(x, 0.162, z))
			bridge_pivot.add_child(stud)
	# Closed is the canonical idle state: raised deck, lowered portcullis.
	bridge_pivot.rotation = Vector3(-0.82, 0, 0)

	gate_bar = Node3D.new()
	gate_bar.name = "Gate"
	gate_bar.position = Vector3(0, 0, -1.23)
	add_child(gate_bar)
	for x in [-0.70, -0.35, 0.0, 0.35, 0.70]:
		gate_bar.add_child(_box("Iron", Vector3(0.09, 2.55, 0.09), C_METAL, Vector3(x, 1.25, 0)))
		var spike := _roof(Vector3(0.18, 0.28, 0.18), C_METAL)
		spike.position = Vector3(x, -0.10, 0)
		spike.rotation_degrees = Vector3(0, 0, 180)
		gate_bar.add_child(spike)
	gate_bar.add_child(_box("Cross", Vector3(1.65, 0.11, 0.10), C_METAL, Vector3(0, 1.18, 0)))
	for x in [-0.90, 0.90]:
		var hinge := MeshInstance3D.new()
		var hinge_mesh := CylinderMesh.new()
		hinge_mesh.top_radius = 0.16
		hinge_mesh.bottom_radius = 0.16
		hinge_mesh.height = 0.28
		hinge_mesh.radial_segments = 10
		hinge.mesh = hinge_mesh
		hinge.position = Vector3(x, 0.30, GATE_Z + 0.02)
		hinge.rotation_degrees.z = 90.0
		hinge.material_override = _mat(C_METAL.darkened(0.08))
		add_child(hinge)

func _build_living_details() -> void:
	ambient_root = Node3D.new()
	ambient_root.name = "LivingDetails"
	add_child(ambient_root)

	# Clutter around the gate and settlement.
	for spec in [
		[Vector3(-2.55,0,-2.82),0.46], [Vector3(-3.02,0,-2.62),0.38],
		[Vector3(2.46,0,-2.95),0.42], [Vector3(3.02,0,-3.18),0.34]
	]:
		ambient_root.add_child(_barrel(spec[0], spec[1]))
	ambient_root.add_child(_crate(Vector3(-2.18,0,-3.15),0.48))
	ambient_root.add_child(_crate(Vector3(2.15,0,-3.52),0.42))
	ambient_root.add_child(_signpost(Vector3(2.0,0,5.15)))
	ambient_root.add_child(_fence(Vector3(-4.8,0,-5.7), 3.0, 8.0))
	ambient_root.add_child(_fence(Vector3(4.75,0,-7.0), 2.8, -5.0))
	ambient_root.add_child(_dock(Vector3(-5.20,0.04,RIVER_Z_MIN - 0.10)))
	ambient_root.add_child(_woodpile(Vector3(-2.75,0,-4.38)))
	ambient_root.add_child(_handcart(Vector3(3.05,0,-4.55), -18.0))
	ambient_root.add_child(_well(Vector3(-3.55,0,-5.55)))

	trade_details = Node3D.new()
	trade_details.name = "TradeDetails"
	ambient_root.add_child(trade_details)
	for i in range(4):
		trade_details.add_child(_crate(Vector3(2.7 + float(i%2)*0.55,0,-4.0-float(i/2)*0.55),0.36))
	trade_details.visible = false

	security_details = Node3D.new()
	security_details.name = "SecurityDetails"
	ambient_root.add_child(security_details)
	for x in [-2.35, 2.35]:
		var rack := _box("SpearRack", Vector3(0.10, 1.25, 0.10), C_WOOD, Vector3(x,0.65,-2.72))
		security_details.add_child(rack)
		for j in range(3):
			var spear := _box("Spear", Vector3(0.035, 1.45, 0.035), C_METAL, Vector3(x-0.18+float(j)*0.18,0.80,-2.67))
			spear.rotation_degrees.z = -4.0 + float(j)*4.0
			security_details.add_child(spear)
	security_details.visible = false

	prosperity_details = Node3D.new()
	prosperity_details.name = "ProsperityDetails"
	ambient_root.add_child(prosperity_details)
	for i in range(5):
		var cloth := _box("Laundry", Vector3(0.42,0.24,0.025), Color("#9a8a6f").lightened(float(i%2)*0.08), Vector3(-3.8+float(i)*0.45,1.35,-5.85))
		cloth.rotation_degrees.z = -5.0 + float(i)*3.0
		prosperity_details.add_child(cloth)
	prosperity_details.visible = false

	# Tiny background inhabitants. They are deliberately simple and only read as
	# movement at this camera distance.
	for spec in [
		[Vector3(-2.6,0,-4.1), Color("#695b4b"), 0.55, 0.0],
		[Vector3(2.45,0,-5.0), Color("#59685f"), 0.70, 1.6],
		[Vector3(-3.1,0,-7.0), Color("#756154"), 0.42, 3.0],
		[Vector3(3.2,0,-8.2), Color("#5e6470"), 0.60, 4.4]
	]:
		var person := _ambient_person(spec[0], spec[1])
		person.set_meta("origin", spec[0])
		person.set_meta("range", spec[2])
		person.set_meta("phase", spec[3])
		ambient_people.append(person)
		ambient_root.add_child(person)

	for pos in [Vector3(-1.28,2.45,-1.48), Vector3(1.28,2.45,-1.48)]:
		var lamp := OmniLight3D.new()
		lamp.position = pos
		lamp.light_color = Color("#e9a35f")
		lamp.light_energy = 0.0
		lamp.omni_range = 4.0
		lamp.shadow_enabled = false
		add_child(lamp)
		lanterns.append(lamp)
		var cage := _box("Lantern", Vector3(0.18,0.28,0.18), Color("#6e4a2f"), pos)
		add_child(cage)

	forge_smoke = _smoke_particles()
	forge_smoke.position = Vector3(-2.45,2.65,-3.85)
	forge_smoke.emitting = false
	add_child(forge_smoke)

func _process(delta: float) -> void:
	if not live_scene_ready:
		return
	motion_clock += delta
	for i in range(ambient_people.size()):
		var p := ambient_people[i]
		if not is_instance_valid(p) or not p.visible:
			continue
		var origin: Vector3 = p.get_meta("origin")
		var travel: float = float(p.get_meta("range"))
		var phase: float = float(p.get_meta("phase"))
		var offset := sin(motion_clock * (0.34 + float(i)*0.035) + phase) * travel
		p.position = origin + Vector3(offset, absf(sin(motion_clock*2.1+phase))*0.025, 0)
		p.rotation_degrees.y = 90.0 if cos(motion_clock*(0.34+float(i)*0.035)+phase) >= 0.0 else -90.0
	for i in range(lanterns.size()):
		if lanterns[i].light_energy > 0.0:
			lanterns[i].light_energy = 0.78 + sin(motion_clock*8.0+float(i))*0.08

func _smoke_particles() -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 18
	p.lifetime = 3.2
	p.visibility_aabb = AABB(Vector3(-2,-1,-2),Vector3(4,7,4))
	var proc := ParticleProcessMaterial.new()
	proc.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	proc.emission_box_extents = Vector3(0.10,0.05,0.10)
	proc.direction = Vector3(0.12,1,0.04)
	proc.spread = 16.0
	proc.gravity = Vector3(0,0.16,0)
	proc.initial_velocity_min = 0.25
	proc.initial_velocity_max = 0.48
	proc.scale_min = 0.12
	proc.scale_max = 0.32
	p.process_material = proc
	var mesh := SphereMesh.new()
	mesh.radius = 0.12
	mesh.height = 0.24
	mesh.radial_segments = 6
	mesh.rings = 3
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.28,0.30,0.28,0.38)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material = mat
	p.draw_pass_1 = mesh
	return p

func _build_weather() -> void:
	rain = _precipitation(false)
	rain.amount_ratio = 0.0
	add_child(rain)
	snow = _precipitation(true)
	snow.amount_ratio = 0.0
	add_child(snow)

func _precipitation(is_snow: bool) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = 130 if is_snow else 210
	p.lifetime = 3.2 if is_snow else 1.0
	p.visibility_aabb = AABB(Vector3(-8, -1, -11), Vector3(16, 14, 24))
	var proc := ParticleProcessMaterial.new()
	proc.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	proc.emission_box_extents = Vector3(7.0, 0.3, 10.0)
	proc.direction = Vector3(0.15, -1, 0.06)
	proc.spread = 8.0 if is_snow else 3.0
	proc.gravity = Vector3(0, -0.9 if is_snow else -10.5, 0)
	proc.initial_velocity_min = 0.35 if is_snow else 5.5
	proc.initial_velocity_max = 0.75 if is_snow else 7.5
	p.process_material = proc
	var drop := BoxMesh.new()
	drop.size = Vector3(0.020 if is_snow else 0.010, 0.040 if is_snow else 0.18, 0.020)
	var dm := StandardMaterial3D.new()
	dm.albedo_color = Color(0.88, 0.90, 0.88, 0.72) if is_snow else Color(0.63, 0.72, 0.74, 0.34)
	dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	drop.material = dm
	p.draw_pass_1 = drop
	p.position = Vector3(0, 7.0, -1)
	p.emitting = false
	return p

func set_weather(kind: String) -> void:
	current_weather = kind
	pending_weather = kind
	if not boot_ready or rain == null or snow == null:
		return
	if weather_tween and weather_tween.is_running():
		weather_tween.kill()
	rain.emitting = kind == "rain"
	snow.emitting = kind == "snow"
	rain.amount_ratio = 1.0 if kind == "rain" else 0.0
	snow.amount_ratio = 1.0 if kind == "snow" else 0.0
	if kind == "rain":
		environment.environment.background_color = Color("#697574")
		environment.environment.ambient_light_energy = 0.40
	elif kind == "snow":
		environment.environment.background_color = Color("#8f9996")
		environment.environment.ambient_light_energy = 0.58
	else:
		environment.environment.background_color = Color("#737e78")
		environment.environment.ambient_light_energy = 0.46

func transition_weather(kind: String, duration: float = 2.4) -> void:
	pending_weather = kind
	if not boot_ready or rain == null or snow == null:
		current_weather = kind
		return
	if kind == current_weather:
		return
	if weather_tween and weather_tween.is_running():
		weather_tween.kill()

	var target_bg := Color("#737e78")
	var target_ambient := 0.46
	if kind == "rain":
		target_bg = Color("#697574")
		target_ambient = 0.40
	elif kind == "snow":
		target_bg = Color("#8f9996")
		target_ambient = 0.58

	if kind == "rain" or current_weather == "rain":
		rain.emitting = true
	if kind == "snow" or current_weather == "snow":
		snow.emitting = true

	current_weather = kind
	weather_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	weather_tween.tween_property(environment.environment, "background_color", target_bg, duration)
	weather_tween.tween_property(environment.environment, "ambient_light_energy", target_ambient, duration)
	weather_tween.tween_property(rain, "amount_ratio", 1.0 if kind == "rain" else 0.0, duration)
	weather_tween.tween_property(snow, "amount_ratio", 1.0 if kind == "snow" else 0.0, duration)
	weather_tween.finished.connect(_finish_weather_transition.bind(kind), CONNECT_ONE_SHOT)

func _finish_weather_transition(kind: String) -> void:
	rain.emitting = kind == "rain"
	snow.emitting = kind == "snow"

func transition_time(target: float, duration: float = 0.75) -> void:
	if time_tween and time_tween.is_running():
		time_tween.kill()
	var start := current_time_progress
	var unwrapped_target := fposmod(target, 1.0)
	if unwrapped_target < start - 0.5:
		unwrapped_target += 1.0
	elif unwrapped_target > start + 0.5:
		unwrapped_target -= 1.0
	time_tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	time_tween.tween_method(set_time, start, unwrapped_target, maxf(0.10, duration))

func set_time(progress: float) -> void:
	var t: float = fposmod(progress, 1.0)
	current_time_progress = t
	if environment == null or sun == null:
		return

	# Continuous 24h cycle. Noon is 0.50, sunrise/sunset sit near 0.25/0.75.
	# Night stays readable; there is no piecewise jump at the end of a day.
	var sun_height: float = sin((t - 0.25) * TAU)
	var daylight: float = clampf((sun_height + 0.18) / 1.18, 0.0, 1.0)
	var horizon: float = pow(1.0 - absf(sun_height), 2.0) * daylight
	sun.rotation_degrees.x = lerpf(8.0, -58.0, daylight)
	sun.rotation_degrees.y = t * 360.0 - 120.0
	sun.light_color = Color("#8da0b5").lerp(Color("#efd5ad"), daylight).lerp(Color("#d79369"), horizon * 0.42)
	sun.light_energy = lerpf(0.18, 0.94, daylight)
	environment.environment.ambient_light_color = Color("#66717d").lerp(Color("#b9b39f"), daylight)
	var lamp_energy := (1.0 - daylight) * 0.82
	for lamp in lanterns:
		lamp.light_energy = lamp_energy

func set_state(state: Dictionary) -> void:
	pending_state = state.duplicate(true)
	if not boot_ready or village_root == null:
		return
	var population := int(state.get("population", 18))
	var trade := int(state.get("trade", 8))
	var guard := int(state.get("guard", 6))
	var trust := int(state.get("trust", 55))
	var growth := clampi(int(population / 18), 0, houses.size())
	for i in range(houses.size()):
		_set_visible_animated(houses[i], i < growth)
	if market:
		_set_visible_animated(market, trade >= 18)
	if forge:
		_set_visible_animated(forge, bool(state.get("has_forge", false)))
	if barracks:
		_set_visible_animated(barracks, guard >= 11)
	if tents:
		_set_visible_animated(tents, population >= 52 and trust < 58)
	if trade_details:
		_set_visible_animated(trade_details, trade >= 18)
	if security_details:
		_set_visible_animated(security_details, guard >= 10)
	if prosperity_details:
		_set_visible_animated(prosperity_details, population >= 36 and trust >= 45)
	if forge_smoke:
		forge_smoke.emitting = bool(state.get("has_forge", false))
	for i in range(ambient_people.size()):
		ambient_people[i].visible = i < clampi(1 + int(population / 28), 1, ambient_people.size())
	if growth > last_growth_level:
		last_growth_level = growth

func _set_visible_animated(node: Node3D, desired: bool) -> void:
	if node.visible == desired:
		return
	if desired:
		node.visible = true
		node.scale = Vector3(0.05, 0.05, 0.05)
		var tw := create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(node, "scale", Vector3.ONE, 0.55)
	else:
		node.visible = false

func operate_gate(opened: bool):
	if not boot_ready or bridge_pivot == null or gate_bar == null:
		return null
	if gate_motion_tween and gate_motion_tween.is_running():
		gate_motion_tween.kill()
	gate_motion_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	if opened:
		gate_motion_tween.tween_property(gate_bar, "position", Vector3(0, 2.30, -1.23), 0.58)
		gate_motion_tween.tween_property(bridge_pivot, "rotation", Vector3.ZERO, 0.78).set_delay(0.06)
	else:
		gate_motion_tween.tween_property(bridge_pivot, "rotation", Vector3(-0.82, 0, 0), 0.66)
		gate_motion_tween.tween_property(gate_bar, "position", Vector3(0, 0, -1.23), 0.40).set_delay(0.18)
	gate_is_open = opened
	return gate_motion_tween

func spawn_visitor(profile: Dictionary, variant: int) -> void:
	if not boot_ready:
		return
	if is_instance_valid(visitor):
		visitor.queue_free()
	visitor = VISITOR_SCRIPT.new()
	add_child(visitor)
	visitor.position = Vector3(0.0, 0.03, 8.25)
	visitor.configure(profile, variant)
	# Waiting point is on the far bank, never on the water/bridge footprint.
	visitor.walk_to(4.58)

func resolve_visitor(accepted: bool) -> void:
	if not is_instance_valid(visitor):
		var fallback_tw = operate_gate(false)
		if fallback_tw:
			await fallback_tw.finished
		visitor_flow_finished.emit()
		return

	var active_visitor = visitor
	active_visitor.react(accepted)
	if accepted:
		var open_tw = operate_gate(true)
		if open_tw:
			await open_tw.finished
		if not is_instance_valid(active_visitor):
			visitor_flow_finished.emit()
			return
		var route: Array[Vector3] = [
			Vector3(0.0, 0.03, 4.48),
			Vector3(0.0, 0.30, 3.88),
			Vector3(0.0, 0.30, -1.10),
			Vector3(0.0, 0.14, -1.62),
			Vector3(0.0, 0.03, -3.60)
		]
		active_visitor.walk_path(route, true)
		await active_visitor.gone
		var close_tw = operate_gate(false)
		if close_tw:
			await close_tw.finished
	else:
		operate_gate(false)
		var reject_route: Array[Vector3] = [Vector3(0.0, 0.03, 8.75)]
		active_visitor.walk_path(reject_route, true)
		await active_visitor.gone

	visitor = null
	visitor_flow_finished.emit()

func visitor_react(accepted: bool) -> void:
	# Compatibility wrapper for older calls; new gameplay uses resolve_visitor().
	if is_instance_valid(visitor):
		visitor.react(accepted)

func _house(pos: Vector3, scale_factor: float, yaw: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	root.rotation_degrees.y = yaw
	root.scale = Vector3.ONE * scale_factor
	root.add_child(_box("Walls", Vector3(1.75, 1.35, 1.45), Color("#b4a78b"), Vector3(0, 0.67, 0)))
	var roof := _roof(Vector3(2.05, 0.75, 1.75), C_ROOF)
	roof.position = Vector3(0, 1.60, 0)
	root.add_child(roof)
	root.add_child(_box("Door", Vector3(0.38, 0.70, 0.06), C_WOOD, Vector3(0, 0.38, 0.755)))
	for x in [-0.52, 0.52]:
		var beam := _box("Beam", Vector3(0.08,1.22,0.07), C_WOOD.darkened(0.12), Vector3(x,0.72,0.76))
		root.add_child(beam)
	var sill := _box("Sill", Vector3(1.28,0.07,0.07), C_WOOD.darkened(0.12), Vector3(0,0.92,0.76))
	root.add_child(sill)
	return root

func _market(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for x in [-0.65, 0.65]:
		root.add_child(_box("Post", Vector3(0.10, 1.45, 0.10), C_WOOD, Vector3(x, 0.72, 0)))
	root.add_child(_box("Counter", Vector3(1.7, 0.16, 0.62), C_WOOD_LIGHT, Vector3(0, 0.55, 0)))
	var canopy := _box("Canopy", Vector3(1.95, 0.12, 1.0), Color("#9a6657"), Vector3(0, 1.45, 0))
	root.add_child(canopy)
	return root

func _forge(pos: Vector3) -> Node3D:
	var root := _house(pos, 0.86, 5)
	var chimney := _box("Chimney", Vector3(0.34, 1.35, 0.34), C_STONE_DARK, Vector3(0.52, 2.05, -0.30))
	root.add_child(chimney)
	return root

func _barracks(pos: Vector3) -> Node3D:
	var root := _house(pos, 1.05, -4)
	var banner := _box("Banner", Vector3(0.05, 1.6, 0.05), C_WOOD, Vector3(1.1, 1.35, 0.2))
	root.add_child(banner)
	root.add_child(_box("Cloth", Vector3(0.55, 0.42, 0.04), Color("#6f5c52"), Vector3(1.38, 1.75, 0.2)))
	return root

func _tents(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for i in range(3):
		var tent := _roof(Vector3(1.25, 0.75, 1.45), C_CLOTH.lightened(float(i) * 0.03))
		tent.position = Vector3(float(i % 2) * 1.4, 0.38, float(i / 2) * 1.3)
		root.add_child(tent)
	return root

func _tree(pos: Vector3, scale_factor: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	root.scale = Vector3.ONE * scale_factor
	var trunk := _box("Trunk", Vector3(0.30, 1.2, 0.30), C_WOOD, Vector3(0, 0.60, 0))
	root.add_child(trunk)
	var crown := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.88
	mesh.height = 1.6
	mesh.radial_segments = 7
	mesh.rings = 4
	crown.mesh = mesh
	crown.position = Vector3(0, 1.72, 0)
	crown.material_override = _mat(C_GRASS_DARK.darkened(0.06))
	root.add_child(crown)
	return root

func _rock_cluster(pos: Vector3, scale_factor: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for i in range(3):
		var mesh_instance := MeshInstance3D.new()
		var mesh := SphereMesh.new()
		mesh.radius = scale_factor * (0.62 + float(i) * 0.10)
		mesh.height = scale_factor * (0.78 + float(i) * 0.08)
		mesh.radial_segments = 6
		mesh.rings = 3
		mesh_instance.mesh = mesh
		mesh_instance.position = Vector3((float(i)-1.0)*scale_factor*0.62, scale_factor*0.22, float(i%2)*scale_factor*0.28)
		mesh_instance.scale = Vector3(1.0 + float(i)*0.10, 0.72, 0.88)
		mesh_instance.rotation_degrees = Vector3(float(i)*7.0, pos.x*9.0+float(i)*19.0, float(i-1)*5.0)
		mesh_instance.material_override = _mat(C_STONE_DARK.lightened(0.06 + float(i)*0.025))
		root.add_child(mesh_instance)
	return root

func _add_land_prop(node: Node3D, pos: Vector3, margin: float = 0.0) -> void:
	if _is_water_position(pos, margin):
		node.queue_free()
		return
	add_child(node)

func _is_water_position(pos: Vector3, margin: float = 0.0) -> bool:
	return pos.z > RIVER_Z_MIN + margin and pos.z < RIVER_Z_MAX - margin and absf(pos.x) > BRIDGE_HALF_WIDTH

func _reed_cluster(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for i in range(5):
		var blade := _box("Reed", Vector3(0.035,0.46+float(i%3)*0.08,0.035), C_GRASS_DARK.lightened(0.10), Vector3(-0.16+float(i)*0.08,0.22,0))
		blade.rotation_degrees.z = -7.0 + float(i)*3.0
		root.add_child(blade)
	return root

func _barrel(pos: Vector3, scale_factor: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	var body := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = scale_factor*0.34
	mesh.bottom_radius = scale_factor*0.38
	mesh.height = scale_factor*0.82
	mesh.radial_segments = 10
	body.mesh = mesh
	body.position.y = scale_factor*0.41
	body.material_override = _mat(C_WOOD)
	root.add_child(body)
	for y in [0.16,0.50,0.76]:
		root.add_child(_box("Hoop", Vector3(scale_factor*0.82,0.035,scale_factor*0.82), C_METAL, Vector3(0,scale_factor*y,0)))
	return root

func _crate(pos: Vector3, scale_factor: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	root.add_child(_box("Crate", Vector3(scale_factor,scale_factor*0.72,scale_factor), C_WOOD_LIGHT, Vector3(0,scale_factor*0.36,0)))
	root.add_child(_box("Brace", Vector3(scale_factor*0.08,scale_factor*0.76,scale_factor*1.03), C_WOOD.darkened(0.14), Vector3(0,scale_factor*0.36,0)))
	return root

func _signpost(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	root.add_child(_box("Post",Vector3(0.11,1.65,0.11),C_WOOD,Vector3(0,0.82,0)))
	var arm := _box("Sign",Vector3(0.95,0.28,0.10),C_WOOD_LIGHT,Vector3(0.36,1.32,0))
	arm.rotation_degrees.z = -4.0
	root.add_child(arm)
	return root

func _fence(pos: Vector3, length: float, yaw: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	root.rotation_degrees.y = yaw
	var count := maxi(2,int(length/0.65))
	for i in range(count):
		root.add_child(_box("FencePost",Vector3(0.09,0.78,0.09),C_WOOD,Vector3(-length*0.5+float(i)*(length/float(count-1)),0.39,0)))
	for y in [0.28,0.58]:
		root.add_child(_box("FenceRail",Vector3(length,0.07,0.07),C_WOOD.darkened(0.08),Vector3(0,y,0)))
	return root

func _dock(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for i in range(4):
		root.add_child(_box("DockPlank",Vector3(0.72,0.08,0.42),C_WOOD_LIGHT,Vector3(0,0.12,float(i)*0.38)))
	for x in [-0.30,0.30]:
		root.add_child(_box("DockPost",Vector3(0.08,0.72,0.08),C_WOOD,Vector3(x,0.28,0.56)))
	return root

func _grass_tuft(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for i in range(4):
		var blade := _box("Grass", Vector3(0.035,0.26+float(i%2)*0.06,0.035), C_GRASS_DARK.lightened(0.06), Vector3(-0.10+float(i)*0.065,0.13,0))
		blade.rotation_degrees.z = -12.0 + float(i)*8.0
		root.add_child(blade)
	return root

func _woodpile(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	for row in range(2):
		for i in range(4-row):
			var log := MeshInstance3D.new()
			var mesh := CylinderMesh.new()
			mesh.top_radius = 0.105
			mesh.bottom_radius = 0.105
			mesh.height = 0.72
			mesh.radial_segments = 8
			log.mesh = mesh
			log.rotation_degrees.z = 90.0
			log.position = Vector3(-0.34+float(i)*0.23,0.12+float(row)*0.18,0)
			log.material_override = _mat(C_WOOD_LIGHT.darkened(0.08))
			root.add_child(log)
	return root

func _handcart(pos: Vector3, yaw: float) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	root.rotation_degrees.y = yaw
	root.add_child(_box("CartBed", Vector3(1.05,0.16,0.62), C_WOOD_LIGHT, Vector3(0,0.42,0)))
	root.add_child(_box("CartSide", Vector3(1.05,0.28,0.08), C_WOOD, Vector3(0,0.58,-0.28)))
	root.add_child(_box("CartSide", Vector3(1.05,0.28,0.08), C_WOOD, Vector3(0,0.58,0.28)))
	for x in [-0.42,0.42]:
		var wheel := MeshInstance3D.new()
		var mesh := CylinderMesh.new()
		mesh.top_radius = 0.27
		mesh.bottom_radius = 0.27
		mesh.height = 0.08
		mesh.radial_segments = 12
		wheel.mesh = mesh
		wheel.rotation_degrees.z = 90.0
		wheel.position = Vector3(x,0.28,0)
		wheel.material_override = _mat(C_WOOD.darkened(0.18))
		root.add_child(wheel)
	root.add_child(_box("Handle", Vector3(0.08,0.08,1.30), C_WOOD, Vector3(0,0.45,0.92)))
	return root

func _well(pos: Vector3) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	var ring := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.46
	mesh.bottom_radius = 0.52
	mesh.height = 0.48
	mesh.radial_segments = 12
	ring.mesh = mesh
	ring.position.y = 0.24
	ring.material_override = _mat(C_STONE_DARK.lightened(0.10))
	root.add_child(ring)
	for x in [-0.52,0.52]:
		root.add_child(_box("WellPost",Vector3(0.08,1.30,0.08),C_WOOD,Vector3(x,0.72,0)))
	var roof := _roof(Vector3(1.35,0.38,0.85),C_ROOF.darkened(0.04))
	roof.position = Vector3(0,1.38,0)
	root.add_child(roof)
	return root

func _ambient_person(pos: Vector3, color: Color) -> Node3D:
	var root := Node3D.new()
	root.position = pos
	var body := MeshInstance3D.new()
	var body_mesh := CylinderMesh.new()
	body_mesh.top_radius = 0.11
	body_mesh.bottom_radius = 0.16
	body_mesh.height = 0.48
	body_mesh.radial_segments = 7
	body.mesh = body_mesh
	body.position.y = 0.45
	body.material_override = _mat(color)
	root.add_child(body)
	var head := MeshInstance3D.new()
	var head_mesh := SphereMesh.new()
	head_mesh.radius = 0.11
	head_mesh.height = 0.22
	head_mesh.radial_segments = 7
	head_mesh.rings = 4
	head.mesh = head_mesh
	head.position.y = 0.79
	head.material_override = _mat(Color("#b99874"))
	root.add_child(head)
	return root

func _roof(size: Vector3, color: Color) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	var mesh := PrismMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.material_override = _mat(color)
	mesh_instance.rotation_degrees.y = 90
	return mesh_instance

func _box(name_value: String, size: Vector3, color: Color, pos: Vector3) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = name_value
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.position = pos
	mesh_instance.material_override = _mat(color)
	return mesh_instance

func _mat(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.86
	return material
