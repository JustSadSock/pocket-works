extends Node

const ARENA_RADIUS := 9.4
const PLAYER_Y := 0.62
const LEGACY_SCRIPT := preload("res://source/legacy_renderer.gd")
const JOYSTICK_SCRIPT := preload("res://source/joystick.gd")

var rng := RandomNumberGenerator.new()

var world_root: Node3D
var player_node: Node3D
var camera: Camera3D
var attack_light: OmniLight3D
var legacy: Control
var ui_layer: CanvasLayer

var joystick_vector := Vector2.ZERO
var player_pos := Vector2.ZERO
var player_facing := Vector2(0, -1)
var player_health := 100.0
var max_health := 100.0
var move_speed := 4.5
var attack_damage := 18.0
var attack_range := 2.25
var attack_cooldown := 0.0
var attack_rate := 0.48
var attack_timer := 0.0
var dash_cooldown := 0.0
var dash_time := 0.0
var invuln := 0.0

var enemies: Array[Dictionary] = []
var effects: Array[Dictionary] = []
var spawn_timer := 0.7
var elapsed := 0.0
var kills := 0
var wave := 1
var level := 1
var xp := 0
var xp_next := 5
var boss_spawned := false
var boss_active := false
var run_finished := false
var running := false
var paused_game := false
var upgrade_open := false

var mode := "forge"
var sound_enabled := true
var asset_ready := false
var audio_ready := false
var best_kills := 0
var publish_timer := 0.0

var health_bar: ProgressBar
var xp_bar: ProgressBar
var status_label: Label
var wave_label: Label
var mode_button: Button
var sound_button: Button
var pause_button: Button
var attack_button: Button
var dash_button: Button
var start_overlay: Control
var pause_overlay: Control
var upgrade_overlay: Control
var finish_overlay: Control
var finish_title: Label
var finish_stats: Label

var impact_audio: AudioStreamPlayer
var dash_audio: AudioStreamPlayer
var upgrade_audio: AudioStreamPlayer
var ambient_audio: AudioStreamPlayer

var animation_player: AnimationPlayer
var current_anim := ""

func _ready() -> void:
	rng.randomize()
	PocketWorks.set_document_title("Arena Shift")
	best_kills = int(PocketWorks.storage_get("best-kills", 0))
	mode = str(PocketWorks.storage_get("mode", "forge"))
	if mode != "classic" and mode != "forge":
		mode = "forge"
	sound_enabled = bool(PocketWorks.storage_get("sound", true))
	_build_world()
	_build_legacy()
	_build_ui()
	_build_audio()
	_reset_run()
	running = false
	start_overlay.visible = true
	_apply_mode(false)
	_publish_state("ready")

func _build_world() -> void:
	world_root = Node3D.new()
	world_root.name = "ForgeWorld"
	add_child(world_root)

	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#cfcabf")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#d9d3c4")
	env.ambient_light_energy = 0.72
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = env
	world_root.add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-58, -28, 0)
	sun.light_color = Color("#fff0cf")
	sun.light_energy = 1.55
	sun.shadow_enabled = true
	world_root.add_child(sun)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-35, 145, 0)
	fill.light_color = Color("#aeb9aa")
	fill.light_energy = 0.48
	fill.shadow_enabled = false
	world_root.add_child(fill)

	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(24, 24)
	var ground_mat := StandardMaterial3D.new()
	ground_mat.albedo_color = Color("#b9ad93")
	ground_mat.roughness = 0.92
	plane.material = ground_mat
	ground.mesh = plane
	world_root.add_child(ground)

	var ring := Node3D.new()
	ring.name = "YardArchitecture"
	world_root.add_child(ring)
	for i in range(16):
		var angle := float(i) * TAU / 16.0
		var pillar := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.6, 1.35 + 0.18 * float(i % 3), 0.6)
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color("#6e786b") if i % 2 == 0 else Color("#d5cbb5")
		mat.roughness = 0.78
		box.material = mat
		pillar.mesh = box
		pillar.position = Vector3(cos(angle) * 10.55, box.size.y * 0.5, sin(angle) * 10.55)
		pillar.rotation.y = -angle
		ring.add_child(pillar)

		if i % 2 == 0:
			var cap := MeshInstance3D.new()
			var cap_mesh := CylinderMesh.new()
			cap_mesh.top_radius = 0.38
			cap_mesh.bottom_radius = 0.48
			cap_mesh.height = 0.24
			var cap_mat := StandardMaterial3D.new()
			cap_mat.albedo_color = Color("#d95f3b")
			cap_mesh.material = cap_mat
			cap.mesh = cap_mesh
			cap.position = pillar.position + Vector3(0, box.size.y * 0.5 + 0.15, 0)
			ring.add_child(cap)

	var inner_mark := MeshInstance3D.new()
	var mark_mesh := CylinderMesh.new()
	mark_mesh.top_radius = ARENA_RADIUS + 0.08
	mark_mesh.bottom_radius = ARENA_RADIUS + 0.08
	mark_mesh.height = 0.04
	var mark_mat := StandardMaterial3D.new()
	mark_mat.albedo_color = Color("#3a3e37")
	mark_mat.roughness = 1.0
	mark_mesh.material = mark_mat
	inner_mark.mesh = mark_mesh
	inner_mark.position.y = 0.015
	world_root.add_child(inner_mark)

	var arena_disk := MeshInstance3D.new()
	var disk_mesh := CylinderMesh.new()
	disk_mesh.top_radius = ARENA_RADIUS - 0.12
	disk_mesh.bottom_radius = ARENA_RADIUS - 0.12
	disk_mesh.height = 0.045
	var disk_mat := StandardMaterial3D.new()
	disk_mat.albedo_color = Color("#cec2a8")
	disk_mat.roughness = 0.95
	disk_mesh.material = disk_mat
	arena_disk.mesh = disk_mesh
	arena_disk.position.y = 0.04
	world_root.add_child(arena_disk)

	camera = Camera3D.new()
	camera.fov = 50.0
	camera.position = Vector3(0, 12.6, 13.8)
	camera.look_at(Vector3.ZERO, Vector3.UP)
	world_root.add_child(camera)
	camera.current = true

	player_node = Node3D.new()
	player_node.name = "Player"
	player_node.position = Vector3(0, PLAYER_Y, 0)
	world_root.add_child(player_node)
	asset_ready = ResourceLoader.exists("res://assets/sentinel.glb")
	if asset_ready:
		var packed = load("res://assets/sentinel.glb")
		if packed is PackedScene:
			var model := packed.instantiate()
			model.name = "BlenderSentinel"
			model.scale = Vector3.ONE * 0.78
			player_node.add_child(model)
			animation_player = _find_animation_player(model)
	else:
		_build_fallback_player()

	attack_light = OmniLight3D.new()
	attack_light.light_color = Color("#ed7a4f")
	attack_light.light_energy = 0.0
	attack_light.omni_range = 4.0
	attack_light.position = Vector3(0, 0.65, -0.6)
	player_node.add_child(attack_light)

func _build_fallback_player() -> void:
	var body := MeshInstance3D.new()
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.38
	body_mesh.height = 1.25
	var body_mat := StandardMaterial3D.new()
	body_mat.albedo_color = Color("#59665d")
	body_mat.metallic = 0.36
	body_mat.roughness = 0.55
	body_mesh.material = body_mat
	body.mesh = body_mesh
	body.position.y = 0.34
	player_node.add_child(body)

	var head := MeshInstance3D.new()
	var head_mesh := BoxMesh.new()
	head_mesh.size = Vector3(0.54, 0.34, 0.54)
	var head_mat := StandardMaterial3D.new()
	head_mat.albedo_color = Color("#e2d8c2")
	head_mesh.material = head_mat
	head.mesh = head_mesh
	head.position = Vector3(0, 1.07, 0)
	player_node.add_child(head)

	var weapon := MeshInstance3D.new()
	var weapon_mesh := BoxMesh.new()
	weapon_mesh.size = Vector3(0.12, 0.12, 1.05)
	var weapon_mat := StandardMaterial3D.new()
	weapon_mat.albedo_color = Color("#d95f3b")
	weapon_mat.metallic = 0.58
	weapon_mesh.material = weapon_mat
	weapon.mesh = weapon_mesh
	weapon.position = Vector3(0.5, 0.55, -0.34)
	player_node.add_child(weapon)

func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found != null:
			return found
	return null

func _build_legacy() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 1
	add_child(layer)
	legacy = LEGACY_SCRIPT.new()
	legacy.name = "ClassicRenderer"
	legacy.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	legacy.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(legacy)

func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	ui_layer.layer = 8
	add_child(ui_layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_layer.add_child(root)

	health_bar = ProgressBar.new()
	health_bar.min_value = 0
	health_bar.max_value = 100
	health_bar.value = 100
	health_bar.show_percentage = false
	health_bar.set_anchors_preset(Control.PRESET_TOP_LEFT)
	health_bar.offset_left = 24
	health_bar.offset_top = 20
	health_bar.offset_right = 290
	health_bar.offset_bottom = 38
	_style_bar(health_bar, Color("#d95f3b"))
	root.add_child(health_bar)

	status_label = Label.new()
	status_label.text = "HP 100"
	status_label.add_theme_font_size_override("font_size", 16)
	status_label.add_theme_color_override("font_color", Color("#30342e"))
	status_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	status_label.offset_left = 28
	status_label.offset_top = 42
	status_label.offset_right = 250
	status_label.offset_bottom = 66
	root.add_child(status_label)

	wave_label = Label.new()
	wave_label.text = "WAVE 1"
	wave_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wave_label.add_theme_font_size_override("font_size", 18)
	wave_label.add_theme_color_override("font_color", Color("#30342e"))
	wave_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	wave_label.offset_left = 300
	wave_label.offset_top = 20
	wave_label.offset_right = -300
	wave_label.offset_bottom = 44
	root.add_child(wave_label)

	mode_button = Button.new()
	mode_button.text = "CLASSIC  ⇄  FORGE"
	mode_button.tooltip_text = "Switch renderer without resetting the fight"
	mode_button.set_anchors_preset(Control.PRESET_CENTER_TOP)
	mode_button.offset_left = -128
	mode_button.offset_top = 50
	mode_button.offset_right = 128
	mode_button.offset_bottom = 94
	_style_button(mode_button, true)
	mode_button.pressed.connect(_toggle_mode)
	root.add_child(mode_button)

	pause_button = Button.new()
	pause_button.text = "PAUSE"
	pause_button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	pause_button.offset_left = -128
	pause_button.offset_top = 18
	pause_button.offset_right = -24
	pause_button.offset_bottom = 62
	_style_button(pause_button, false)
	pause_button.pressed.connect(_toggle_pause)
	root.add_child(pause_button)

	sound_button = Button.new()
	sound_button.text = "SOUND"
	sound_button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	sound_button.offset_left = -242
	sound_button.offset_top = 18
	sound_button.offset_right = -138
	sound_button.offset_bottom = 62
	_style_button(sound_button, false)
	sound_button.pressed.connect(_toggle_sound)
	root.add_child(sound_button)

	var joystick := JOYSTICK_SCRIPT.new()
	joystick.custom_minimum_size = Vector2(176, 176)
	joystick.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	joystick.offset_left = 20
	joystick.offset_top = -198
	joystick.offset_right = 196
	joystick.offset_bottom = -22
	joystick.vector_changed.connect(_on_joystick)
	root.add_child(joystick)

	attack_button = Button.new()
	attack_button.text = "ATTACK"
	attack_button.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	attack_button.offset_left = -178
	attack_button.offset_top = -114
	attack_button.offset_right = -22
	attack_button.offset_bottom = -26
	_style_button(attack_button, true)
	attack_button.pressed.connect(_request_attack)
	root.add_child(attack_button)

	dash_button = Button.new()
	dash_button.text = "DASH"
	dash_button.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	dash_button.offset_left = -306
	dash_button.offset_top = -94
	dash_button.offset_right = -188
	dash_button.offset_bottom = -26
	_style_button(dash_button, false)
	dash_button.pressed.connect(_request_dash)
	root.add_child(dash_button)

	xp_bar = ProgressBar.new()
	xp_bar.min_value = 0
	xp_bar.max_value = xp_next
	xp_bar.value = 0
	xp_bar.show_percentage = false
	xp_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	xp_bar.offset_left = 245
	xp_bar.offset_top = -24
	xp_bar.offset_right = -345
	xp_bar.offset_bottom = -15
	_style_bar(xp_bar, Color("#6b7866"))
	root.add_child(xp_bar)

	start_overlay = _make_overlay(root, "ARENA SHIFT", "One fight. Two Pocket Works generations.\nSwitch CLASSIC / FORGE at any moment — the simulation does not reset.")
	var start_box: VBoxContainer = start_overlay.get_node("Panel/Box")
	var start := _overlay_button("START RUN")
	start.pressed.connect(_start_run)
	start_box.add_child(start)
	var start_exit := _overlay_button("POCKET WORKS")
	start_exit.pressed.connect(PocketWorks.exit_to_launcher)
	start_box.add_child(start_exit)

	pause_overlay = _make_overlay(root, "PAUSED", "The run is preserved.")
	pause_overlay.visible = false
	var pause_box: VBoxContainer = pause_overlay.get_node("Panel/Box")
	var resume := _overlay_button("RESUME")
	resume.pressed.connect(_resume)
	pause_box.add_child(resume)
	var restart := _overlay_button("RESTART RUN")
	restart.pressed.connect(_restart_from_overlay)
	pause_box.add_child(restart)
	var pause_exit := _overlay_button("POCKET WORKS")
	pause_exit.pressed.connect(PocketWorks.exit_to_launcher)
	pause_box.add_child(pause_exit)

	upgrade_overlay = _make_overlay(root, "UPGRADE", "Choose one. The arena continues immediately.")
	upgrade_overlay.visible = false
	var up_box: VBoxContainer = upgrade_overlay.get_node("Panel/Box")
	var power := _overlay_button("HEAVY COIL   +35% DAMAGE")
	power.pressed.connect(func(): _take_upgrade("power"))
	up_box.add_child(power)
	var servo := _overlay_button("SERVO DRIVE   +18% SPEED")
	servo.pressed.connect(func(): _take_upgrade("speed"))
	up_box.add_child(servo)
	var plate := _overlay_button("PLATING   +25 MAX HP + HEAL")
	plate.pressed.connect(func(): _take_upgrade("health"))
	up_box.add_child(plate)

	finish_overlay = _make_overlay(root, "RUN COMPLETE", "")
	finish_overlay.visible = false
	var finish_box: VBoxContainer = finish_overlay.get_node("Panel/Box")
	finish_title = finish_overlay.get_node("Panel/Box/Title")
	finish_stats = finish_overlay.get_node("Panel/Box/Copy")
	var again := _overlay_button("RUN AGAIN")
	again.pressed.connect(_restart_from_overlay)
	finish_box.add_child(again)
	var finish_exit := _overlay_button("POCKET WORKS")
	finish_exit.pressed.connect(PocketWorks.exit_to_launcher)
	finish_box.add_child(finish_exit)

func _make_overlay(parent: Control, title: String, copy: String) -> Control:
	var overlay := Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	parent.add_child(overlay)
	var shade := ColorRect.new()
	shade.color = Color(0.12, 0.13, 0.12, 0.80)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(shade)
	var panel := PanelContainer.new()
	panel.name = "Panel"
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -250
	panel.offset_top = -165
	panel.offset_right = 250
	panel.offset_bottom = 165
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color("#e8e1d2")
	panel_style.border_color = Color("#30342e")
	panel_style.set_border_width_all(3)
	panel_style.corner_radius_top_left = 8
	panel_style.corner_radius_top_right = 8
	panel_style.corner_radius_bottom_left = 8
	panel_style.corner_radius_bottom_right = 8
	panel.add_theme_stylebox_override("panel", panel_style)
	overlay.add_child(panel)
	var box := VBoxContainer.new()
	box.name = "Box"
	box.add_theme_constant_override("separation", 10)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_child(box)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override("margin_left", 26)
	pad.add_theme_constant_override("margin_right", 26)
	pad.add_theme_constant_override("margin_top", 22)
	pad.add_theme_constant_override("margin_bottom", 22)
	box.add_child(pad)
	var intro := VBoxContainer.new()
	intro.add_theme_constant_override("separation", 8)
	pad.add_child(intro)
	var title_label := Label.new()
	title_label.name = "Title"
	title_label.text = title
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 28)
	title_label.add_theme_color_override("font_color", Color("#30342e"))
	intro.add_child(title_label)
	var copy_label := Label.new()
	copy_label.name = "Copy"
	copy_label.text = copy
	copy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	copy_label.add_theme_font_size_override("font_size", 15)
	copy_label.add_theme_color_override("font_color", Color("#555b51"))
	intro.add_child(copy_label)
	return overlay

func _overlay_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 48)
	_style_button(button, text.begins_with("START") or text.begins_with("RUN AGAIN") or text.begins_with("RESUME"))
	return button

func _style_button(button: Button, accent: bool) -> void:
	button.add_theme_font_size_override("font_size", 16)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("#d95f3b") if accent else Color("#f0eadc")
	normal.border_color = Color("#30342e")
	normal.set_border_width_all(2)
	normal.corner_radius_top_left = 6
	normal.corner_radius_top_right = 6
	normal.corner_radius_bottom_left = 6
	normal.corner_radius_bottom_right = 6
	var hover := normal.duplicate()
	hover.bg_color = Color("#e77956") if accent else Color("#ddd5c3")
	var pressed := normal.duplicate()
	pressed.bg_color = Color("#b64d31") if accent else Color("#c8c0af")
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", normal)
	button.add_theme_color_override("font_color", Color("#252923"))
	button.add_theme_color_override("font_hover_color", Color("#252923"))
	button.add_theme_color_override("font_pressed_color", Color("#252923"))

func _style_bar(bar: ProgressBar, color: Color) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.18, 0.20, 0.18, 0.18)
	bg.corner_radius_top_left = 2
	bg.corner_radius_top_right = 2
	bg.corner_radius_bottom_left = 2
	bg.corner_radius_bottom_right = 2
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.corner_radius_top_left = 2
	fill.corner_radius_top_right = 2
	fill.corner_radius_bottom_left = 2
	fill.corner_radius_bottom_right = 2
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fill)

func _build_audio() -> void:
	impact_audio = _make_audio("res://assets/audio/generated/impact.ogg")
	dash_audio = _make_audio("res://assets/audio/generated/dash.ogg")
	upgrade_audio = _make_audio("res://assets/audio/generated/upgrade.ogg")
	ambient_audio = _make_audio("res://assets/audio/generated/yard.ogg")
	if ambient_audio.stream != null:
		ambient_audio.volume_db = -8
		ambient_audio.finished.connect(func():
			if running and sound_enabled:
				ambient_audio.play()
		)
	audio_ready = impact_audio.stream != null and dash_audio.stream != null

func _make_audio(path: String) -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	add_child(player)
	if ResourceLoader.exists(path):
		player.stream = load(path)
	return player

func _reset_run() -> void:
	for enemy in enemies:
		var node: Node3D = enemy.get("node")
		if is_instance_valid(node):
			node.queue_free()
	enemies.clear()
	effects.clear()
	player_pos = Vector2.ZERO
	player_facing = Vector2(0, -1)
	max_health = 100.0
	player_health = max_health
	move_speed = 4.5
	attack_damage = 18.0
	attack_rate = 0.48
	attack_cooldown = 0.0
	attack_timer = 0.0
	dash_cooldown = 0.0
	dash_time = 0.0
	invuln = 0.0
	spawn_timer = 0.45
	elapsed = 0.0
	kills = 0
	wave = 1
	level = 1
	xp = 0
	xp_next = 5
	boss_spawned = false
	boss_active = false
	run_finished = false
	paused_game = false
	upgrade_open = false
	if player_node != null:
		player_node.position = Vector3(0, PLAYER_Y, 0)
	_update_ui()

func _start_run() -> void:
	start_overlay.visible = false
	finish_overlay.visible = false
	pause_overlay.visible = false
	_reset_run()
	running = true
	if sound_enabled and ambient_audio.stream != null:
		ambient_audio.play()
	_spawn_enemy(false)
	_spawn_enemy(false)
	_publish_state("running")

func _restart_from_overlay() -> void:
	pause_overlay.visible = false
	finish_overlay.visible = false
	start_overlay.visible = false
	_reset_run()
	running = true
	if sound_enabled and ambient_audio.stream != null and not ambient_audio.playing:
		ambient_audio.play()
	_spawn_enemy(false)
	_spawn_enemy(false)

func _resume() -> void:
	paused_game = false
	pause_overlay.visible = false

func _toggle_pause() -> void:
	if not running or run_finished or upgrade_open:
		return
	paused_game = not paused_game
	pause_overlay.visible = paused_game

func _toggle_sound() -> void:
	sound_enabled = not sound_enabled
	PocketWorks.storage_set("sound", sound_enabled)
	sound_button.text = "SOUND" if sound_enabled else "MUTED"
	if not sound_enabled:
		ambient_audio.stop()
	elif running and ambient_audio.stream != null:
		ambient_audio.play()

func _toggle_mode() -> void:
	mode = "classic" if mode == "forge" else "forge"
	PocketWorks.storage_set("mode", mode)
	_apply_mode(true)

func _apply_mode(with_feedback: bool) -> void:
	world_root.visible = mode == "forge"
	legacy.visible = mode == "classic"
	mode_button.text = "CLASSIC  ◀  FORGE" if mode == "classic" else "CLASSIC  ▶  FORGE"
	if with_feedback:
		mode_button.modulate = Color("#d95f3b")
		var tween := create_tween()
		tween.tween_property(mode_button, "modulate", Color.WHITE, 0.22)
	_publish_state("running" if running else "ready")

func _on_joystick(value: Vector2) -> void:
	joystick_vector = value

func _request_attack() -> void:
	if not running or paused_game or upgrade_open or run_finished:
		return
	if attack_cooldown > 0.0:
		return
	attack_cooldown = attack_rate
	attack_timer = 0.19
	_play_player_anim("attack")
	attack_light.light_energy = 4.0
	var hit_any := false
	for i in range(enemies.size() - 1, -1, -1):
		var enemy := enemies[i]
		var pos: Vector2 = enemy["pos"]
		if player_pos.distance_to(pos) <= attack_range + float(enemy["radius"]) * 0.45:
			enemy["hp"] = float(enemy["hp"]) - attack_damage
			enemy["flash"] = 0.13
			enemies[i] = enemy
			hit_any = true
			_add_effect(pos, "hit")
			_spawn_hit_particles(pos, false)
			if float(enemy["hp"]) <= 0.0:
				_kill_enemy(i)
	if hit_any:
		_play_sfx(impact_audio, rng.randf_range(0.92, 1.08))

func _request_dash() -> void:
	if not running or paused_game or upgrade_open or run_finished:
		return
	if dash_cooldown > 0.0:
		return
	var direction := _movement_vector()
	if direction.length() < 0.1:
		direction = player_facing
	else:
		direction = direction.normalized()
	player_facing = direction
	dash_time = 0.20
	dash_cooldown = 1.15
	invuln = 0.26
	_play_sfx(dash_audio, rng.randf_range(0.96, 1.06))

func _movement_vector() -> Vector2:
	var key := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		key.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		key.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		key.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		key.y += 1.0
	var combined := joystick_vector
	if key.length() > 0.05:
		combined = key.normalized()
	return combined

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE:
				_request_attack()
			KEY_SHIFT:
				_request_dash()
			KEY_TAB:
				_toggle_mode()
				get_viewport().set_input_as_handled()
			KEY_ESCAPE:
				_toggle_pause()
				get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
	if not running or paused_game or upgrade_open or run_finished:
		_sync_visuals(delta)
		return

	elapsed += delta
	attack_cooldown = max(0.0, attack_cooldown - delta)
	attack_timer = max(0.0, attack_timer - delta)
	dash_cooldown = max(0.0, dash_cooldown - delta)
	dash_time = max(0.0, dash_time - delta)
	invuln = max(0.0, invuln - delta)
	attack_light.light_energy = lerp(attack_light.light_energy, 0.0, min(1.0, delta * 14.0))

	var move := _movement_vector()
	if move.length() > 0.08:
		player_facing = move.normalized()
	var speed := move_speed
	if dash_time > 0.0:
		speed = 12.5
		move = player_facing
	player_pos += move * speed * delta
	if player_pos.length() > ARENA_RADIUS - 0.55:
		player_pos = player_pos.normalized() * (ARENA_RADIUS - 0.55)

	if dash_time > 0.0:
		_play_player_anim("run")
	elif attack_timer > 0.0:
		_play_player_anim("attack")
	elif move.length() > 0.08:
		_play_player_anim("run")
	else:
		_play_player_anim("idle")

	spawn_timer -= delta
	var desired := min(3 + wave * 2, 12)
	if not boss_active and enemies.size() < desired and spawn_timer <= 0.0:
		_spawn_enemy(false)
		spawn_timer = max(0.34, 1.1 - float(wave) * 0.09)

	for i in range(enemies.size()):
		var enemy := enemies[i]
		enemy["flash"] = max(0.0, float(enemy["flash"]) - delta)
		enemy["touch_cd"] = max(0.0, float(enemy["touch_cd"]) - delta)
		var pos: Vector2 = enemy["pos"]
		var to_player := player_pos - pos
		if to_player.length() > 0.01:
			var speed_e := float(enemy["speed"])
			if bool(enemy["boss"]):
				speed_e *= 0.85 + 0.13 * sin(elapsed * 1.8)
			pos += to_player.normalized() * speed_e * delta
		enemy["pos"] = pos
		var contact := float(enemy["radius"]) + 0.52
		if pos.distance_to(player_pos) < contact and float(enemy["touch_cd"]) <= 0.0 and invuln <= 0.0:
			enemy["touch_cd"] = 0.72 if not bool(enemy["boss"]) else 0.44
			var damage := 8.0 + float(wave) * 0.8
			if bool(enemy["boss"]):
				damage = 15.0
			player_health -= damage
			_add_effect(player_pos, "hurt")
			_spawn_hit_particles(player_pos, true)
			if player_health <= 0.0:
				player_health = 0.0
				_finish_run(false)
		enemies[i] = enemy

	if kills >= 30 and not boss_spawned:
		boss_spawned = true
		boss_active = true
		for i in range(enemies.size() - 1, -1, -1):
			if not bool(enemies[i]["boss"]) and enemies.size() > 4:
				var node: Node3D = enemies[i]["node"]
				if is_instance_valid(node):
					node.queue_free()
				enemies.remove_at(i)
		_spawn_enemy(true)

	for i in range(effects.size() - 1, -1, -1):
		effects[i]["life"] = float(effects[i]["life"]) - delta * 1.8
		if float(effects[i]["life"]) <= 0.0:
			effects.remove_at(i)

	_sync_visuals(delta)
	_update_ui()
	publish_timer -= delta
	if publish_timer <= 0.0:
		publish_timer = 0.5
		_publish_state("running")

func _spawn_enemy(boss: bool) -> void:
	var angle := rng.randf_range(0.0, TAU)
	var pos := Vector2(cos(angle), sin(angle)) * rng.randf_range(ARENA_RADIUS - 0.8, ARENA_RADIUS - 0.2)
	var hp := 34.0 + float(wave) * 8.0
	var speed_e := 1.35 + float(wave) * 0.07 + rng.randf_range(-0.08, 0.12)
	var radius := 0.58
	if boss:
		hp = 280.0 + float(level) * 22.0
		speed_e = 1.18
		radius = 1.25

	var node := _make_enemy_visual(boss, radius)
	world_root.add_child(node)
	node.position = Vector3(pos.x, radius if boss else 0.55, pos.y)
	var enemy: Dictionary = {
		"pos": pos,
		"hp": hp,
		"max_hp": hp,
		"speed": speed_e,
		"radius": radius,
		"boss": boss,
		"flash": 0.0,
		"touch_cd": 0.0,
		"node": node
	}
	enemies.append(enemy)

func _make_enemy_visual(boss: bool, radius: float) -> Node3D:
	var root := Node3D.new()
	var body := MeshInstance3D.new()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#8f5144") if boss else Color("#687467")
	mat.metallic = 0.32
	mat.roughness = 0.62
	if boss:
		var box := BoxMesh.new()
		box.size = Vector3(radius * 1.35, radius * 1.5, radius * 1.35)
		box.material = mat
		body.mesh = box
	else:
		var capsule := CapsuleMesh.new()
		capsule.radius = radius * 0.68
		capsule.height = radius * 1.75
		capsule.material = mat
		body.mesh = capsule
	root.add_child(body)

	var eye := MeshInstance3D.new()
	var eye_mesh := SphereMesh.new()
	eye_mesh.radius = radius * 0.14
	eye_mesh.height = radius * 0.28
	var eye_mat := StandardMaterial3D.new()
	eye_mat.albedo_color = Color("#f2e6cf")
	eye_mat.emission_enabled = true
	eye_mat.emission = Color("#f0a76a")
	eye_mat.emission_energy_multiplier = 1.8
	eye_mesh.material = eye_mat
	eye.mesh = eye_mesh
	eye.position = Vector3(0, radius * 0.18, -radius * 0.62)
	root.add_child(eye)
	return root

func _kill_enemy(index: int) -> void:
	if index < 0 or index >= enemies.size():
		return
	var enemy := enemies[index]
	var was_boss := bool(enemy["boss"])
	var pos: Vector2 = enemy["pos"]
	var node: Node3D = enemy["node"]
	if is_instance_valid(node):
		node.queue_free()
	enemies.remove_at(index)
	_add_effect(pos, "kill")
	_spawn_hit_particles(pos, false, true)
	kills += 1
	xp += 3 if was_boss else 1
	if not was_boss and kills % 7 == 0:
		wave += 1
	if was_boss:
		boss_active = false
		_finish_run(true)
		return
	if xp >= xp_next:
		xp -= xp_next
		level += 1
		xp_next = 4 + level * 3
		_show_upgrade()

func _show_upgrade() -> void:
	upgrade_open = true
	upgrade_overlay.visible = true

func _take_upgrade(kind: String) -> void:
	match kind:
		"power":
			attack_damage *= 1.35
		"speed":
			move_speed *= 1.18
			attack_rate = max(0.29, attack_rate * 0.94)
		"health":
			max_health += 25.0
			player_health = min(max_health, player_health + 38.0)
	upgrade_open = false
	upgrade_overlay.visible = false
	_play_sfx(upgrade_audio, 1.0)
	_add_effect(player_pos, "heal")
	_update_ui()

func _add_effect(pos: Vector2, kind: String) -> void:
	effects.append({"pos": pos, "kind": kind, "life": 1.0})

func _spawn_hit_particles(pos: Vector2, player_hit: bool, big: bool = false) -> void:
	if mode != "forge":
		return
	var particles := CPUParticles3D.new()
	particles.amount = 24 if big else 12
	particles.lifetime = 0.55 if big else 0.32
	particles.one_shot = true
	particles.explosiveness = 1.0
	particles.direction = Vector3(0, 1, 0)
	particles.spread = 180.0
	particles.initial_velocity_min = 2.2
	particles.initial_velocity_max = 4.6 if big else 3.4
	particles.gravity = Vector3(0, -7.0, 0)
	var mesh := BoxMesh.new()
	mesh.size = Vector3.ONE * (0.09 if big else 0.055)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#f0d7ae") if player_hit else Color("#d95f3b")
	mesh.material = mat
	particles.mesh = mesh
	particles.position = Vector3(pos.x, 0.72, pos.y)
	world_root.add_child(particles)
	particles.emitting = true
	var timer := get_tree().create_timer(0.9)
	timer.timeout.connect(func():
		if is_instance_valid(particles):
			particles.queue_free()
	)

func _sync_visuals(delta: float) -> void:
	if player_node != null:
		player_node.position = Vector3(player_pos.x, PLAYER_Y, player_pos.y)
		var target_yaw := atan2(player_facing.x, player_facing.y) + PI
		player_node.rotation.y = lerp_angle(player_node.rotation.y, target_yaw, min(1.0, delta * 12.0))

	for enemy in enemies:
		var node: Node3D = enemy["node"]
		if is_instance_valid(node):
			var pos: Vector2 = enemy["pos"]
			node.position.x = pos.x
			node.position.z = pos.y
			node.look_at(Vector3(player_pos.x, node.position.y, player_pos.y), Vector3.UP)
			var flash := float(enemy["flash"])
			node.scale = Vector3.ONE * (1.0 + flash * 0.8)

	if camera != null:
		var target := Vector3(player_pos.x * 0.28, 0, player_pos.y * 0.28)
		camera.position = Vector3(player_pos.x * 0.18, 12.6, 13.8 + player_pos.y * 0.14)
		camera.look_at(target, Vector3.UP)

	var legacy_enemies: Array = []
	for enemy in enemies:
		legacy_enemies.append({
			"pos": enemy["pos"],
			"hp_ratio": float(enemy["hp"]) / max(float(enemy["max_hp"]), 1.0),
			"radius": enemy["radius"],
			"boss": enemy["boss"],
			"flash": enemy["flash"]
		})
	legacy.sync_state({
		"player_pos": player_pos,
		"player_angle": atan2(player_facing.y, player_facing.x),
		"player_health": player_health,
		"enemies": legacy_enemies,
		"effects": effects,
		"attacking": attack_timer > 0.0,
		"dash_amount": dash_time / 0.20,
		"wave": wave,
		"boss_active": boss_active
	})

func _play_player_anim(wanted: String) -> void:
	if animation_player == null:
		return
	var list := animation_player.get_animation_list()
	for name in list:
		var lower := str(name).to_lower()
		if lower.contains(wanted):
			if wanted != current_anim or not animation_player.is_playing():
				animation_player.play(name, 0.10)
				current_anim = wanted
			return

	# Asset Forge intentionally exports one deterministic authored timeline.
	# Reuse its authored idle / locomotion / strike segments as a runtime state machine.
	var fallback: StringName = &""
	for name in list:
		if str(name).to_lower() != "reset":
			fallback = name
			break
	if fallback == &"":
		return
	var start := 0.0
	var finish := 0.78
	match wanted:
		"run":
			start = 1.08
			finish = 1.46
		"attack":
			start = 1.62
			finish = 1.90
		_:
			start = 0.0
			finish = 0.78
	var needs_restart := wanted != current_anim or animation_player.current_animation != fallback or not animation_player.is_playing()
	if not needs_restart and animation_player.current_animation_position >= finish:
		needs_restart = true
	if needs_restart:
		animation_player.play(fallback, 0.08)
		animation_player.seek(start, true)
		current_anim = wanted

func _play_sfx(player: AudioStreamPlayer, pitch: float) -> void:
	if not sound_enabled or player == null or player.stream == null:
		return
	player.pitch_scale = pitch
	player.play()

func _update_ui() -> void:
	if health_bar == null:
		return
	health_bar.max_value = max_health
	health_bar.value = player_health
	status_label.text = "HP %d / %d   •   KILLS %d   •   LV %d" % [int(ceil(player_health)), int(max_health), kills, level]
	wave_label.text = "BOSS" if boss_active else "WAVE %d" % wave
	xp_bar.max_value = max(xp_next, 1)
	xp_bar.value = xp
	dash_button.text = "DASH" if dash_cooldown <= 0.0 else "%.1f" % dash_cooldown
	attack_button.text = "ATTACK" if attack_cooldown <= 0.0 else "RECOVER"

func _finish_run(victory: bool) -> void:
	if run_finished:
		return
	run_finished = true
	running = false
	paused_game = false
	upgrade_open = false
	upgrade_overlay.visible = false
	if ambient_audio != null:
		ambient_audio.stop()
	best_kills = max(best_kills, kills)
	PocketWorks.storage_set("best-kills", best_kills)
	finish_title.text = "YARD CLEARED" if victory else "RUN ENDED"
	finish_stats.text = "Kills: %d   •   Level: %d   •   Best: %d\nFinal damage: %d   •   Mode can be switched again next run." % [kills, level, best_kills, int(attack_damage)]
	finish_overlay.visible = true
	_publish_state("complete" if victory else "game-over")

func _publish_state(state_name: String) -> void:
	PocketWorks.publish_test_state({
		"loadingState": state_name,
		"runtime": "godot",
		"app": "arena-shift",
		"mode": mode,
		"running": running,
		"paused": paused_game,
		"upgradeOpen": upgrade_open,
		"playerHealth": player_health,
		"playerPosition": {"x": player_pos.x, "y": player_pos.y},
		"kills": kills,
		"level": level,
		"wave": wave,
		"enemyCount": enemies.size(),
		"bossActive": boss_active,
		"blenderAssetReady": asset_ready,
		"generatedAudioReady": audio_ready,
		"bestKills": best_kills
	})


func _on_exit_pressed() -> void:
	PocketWorks.exit_to_launcher()
