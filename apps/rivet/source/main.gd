extends Node2D

const STICK_SCRIPT := preload("res://source/touch_stick.gd")

const VIEW := Vector2(1280, 720)
const ARENA := Rect2(104, 116, 1072, 500)
const TOTAL_ROOMS := 7

const C_BG := Color("#d6cec0")
const C_PAPER := Color("#eee7da")
const C_INK := Color("#343935")
const C_MID := Color("#71796f")
const C_STEEL := Color("#9a9e92")
const C_RUST := Color("#b85c3f")
const C_BLUE := Color("#637f83")
const C_WARN := Color("#d89a48")
const C_DARK := Color("#232724")

const MODULES := {
	"rivet": {"slot": "weapon", "name": "RIVETER", "desc": "Fast, precise bolts."},
	"cutter": {"slot": "weapon", "name": "CUTTER", "desc": "Short brutal sweep."},
	"coil": {"slot": "weapon", "name": "ARC COIL", "desc": "Chains through two targets."},
	"mortar": {"slot": "weapon", "name": "MORTAR", "desc": "Slow shells, wide blast."},
	"strider": {"slot": "chassis", "name": "STRIDER", "desc": "Balanced drive and ram."},
	"treads": {"slot": "chassis", "name": "TREADS", "desc": "Heavy hull, crushing ram."},
	"skates": {"slot": "chassis", "name": "SKATES", "desc": "Fast drive, fast ram."},
	"flywheel": {"slot": "core", "name": "FLYWHEEL", "desc": "Move to fire faster."},
	"capacitor": {"slot": "core", "name": "CAPACITOR", "desc": "Every fourth shot pulses."},
	"boiler": {"slot": "core", "name": "BOILER", "desc": "Heat increases damage."}
}

var rng := RandomNumberGenerator.new()

var player_pos := Vector2(640, 420)
var player_vel := Vector2.ZERO
var move_input := Vector2.ZERO
var aim_dir := Vector2.RIGHT
var hull := 100.0
var max_hull := 100.0
var invuln := 0.0
var dash_time := 0.0
var dash_cd := 0.0
var dash_dir := Vector2.RIGHT
var fire_cd := 0.0
var recoil := 0.0
var heat := 0.0
var overheat := 0.0
var shot_counter := 0

var weapon_id := "rivet"
var chassis_id := "strider"
var core_id := "flywheel"

var room := 1
var room_budget := 0
var room_spawned := 0
var spawn_timer := 0.0
var clear_delay := -1.0
var room_closing := false
var run_active := false
var paused_game := false
var workshop_open := false
var run_finished := false
var total_kills := 0
var elapsed := 0.0

var enemies: Array = []
var bullets: Array = []
var enemy_bullets: Array = []
var effects: Array = []

var shake := 0.0
var flash := 0.0
var hitstop := 0.0
var publish_timer := 0.0

var best_room := 1
var best_kills := 0
var clears := 0
var sound_enabled := true

var fire_held := false
var workshop_choices: Array[String] = []

var ui_layer: CanvasLayer
var hud: Control
var health_bar: ProgressBar
var health_label: Label
var room_label: Label
var module_label: Label
var core_label: Label
var fire_button: Button
var dash_button: Button
var pause_button: Button
var stick: Control
var start_overlay: Control
var pause_overlay: Control
var workshop_overlay: Control
var result_overlay: Control
var result_title: Label
var result_copy: Label
var workshop_title: Label
var workshop_buttons: Array[Button] = []
var sound_button: Button

var sfx: Dictionary = {}
var audio_players: Array[AudioStreamPlayer] = []
var audio_cursor := 0

func _ready() -> void:
	Engine.max_fps = 60
	rng.randomize()
	PocketWorks.set_document_title("RIVET")
	best_room = int(PocketWorks.storage_get("best-room", 1))
	best_kills = int(PocketWorks.storage_get("best-kills", 0))
	clears = int(PocketWorks.storage_get("clears", 0))
	sound_enabled = bool(PocketWorks.storage_get("sound", true))
	_build_audio()
	_build_ui()
	_reset_run()
	run_active = false
	hud.visible = false
	start_overlay.visible = true
	_publish_state("ready")
	queue_redraw()

func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	ui_layer.layer = 10
	add_child(ui_layer)

	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_layer.add_child(root)

	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(hud)

	health_bar = ProgressBar.new()
	health_bar.position = Vector2(24, 22)
	health_bar.size = Vector2(276, 17)
	health_bar.show_percentage = false
	health_bar.min_value = 0
	health_bar.max_value = 100
	_style_bar(health_bar, C_RUST)
	hud.add_child(health_bar)

	health_label = Label.new()
	health_label.position = Vector2(26, 42)
	health_label.size = Vector2(300, 28)
	health_label.add_theme_font_size_override("font_size", 16)
	health_label.add_theme_color_override("font_color", C_INK)
	hud.add_child(health_label)

	room_label = Label.new()
	room_label.position = Vector2(470, 20)
	room_label.size = Vector2(340, 36)
	room_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	room_label.add_theme_font_size_override("font_size", 19)
	room_label.add_theme_color_override("font_color", C_INK)
	hud.add_child(room_label)

	module_label = Label.new()
	module_label.position = Vector2(24, 71)
	module_label.size = Vector2(470, 26)
	module_label.add_theme_font_size_override("font_size", 14)
	module_label.add_theme_color_override("font_color", C_DARK)
	hud.add_child(module_label)

	core_label = Label.new()
	core_label.position = Vector2(500, 58)
	core_label.size = Vector2(280, 24)
	core_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	core_label.add_theme_font_size_override("font_size", 13)
	core_label.add_theme_color_override("font_color", C_MID)
	hud.add_child(core_label)

	pause_button = Button.new()
	pause_button.text = "PAUSE"
	pause_button.position = Vector2(1147, 20)
	pause_button.size = Vector2(108, 52)
	_style_button(pause_button, false)
	pause_button.pressed.connect(_toggle_pause)
	hud.add_child(pause_button)

	stick = STICK_SCRIPT.new()
	stick.position = Vector2(18, 492)
	stick.size = Vector2(218, 208)
	stick.vector_changed.connect(_on_stick_changed)
	hud.add_child(stick)

	fire_button = Button.new()
	fire_button.text = "FIRE"
	fire_button.position = Vector2(1091, 584)
	fire_button.size = Vector2(164, 108)
	_style_button(fire_button, true)
	fire_button.button_down.connect(_on_fire_down)
	fire_button.button_up.connect(_on_fire_up)
	hud.add_child(fire_button)

	dash_button = Button.new()
	dash_button.text = "RAM"
	dash_button.position = Vector2(948, 612)
	dash_button.size = Vector2(126, 80)
	_style_button(dash_button, false)
	dash_button.pressed.connect(_request_dash)
	hud.add_child(dash_button)

	start_overlay = _make_overlay(root, Vector2(580, 420))
	var start_box: VBoxContainer = start_overlay.get_node("Panel/Box")
	var mark := Label.new()
	mark.text = "RIVET"
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.add_theme_font_size_override("font_size", 58)
	mark.add_theme_color_override("font_color", C_INK)
	start_box.add_child(mark)
	var line := Label.new()
	line.text = "Rebuild the machine while it survives."
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line.add_theme_font_size_override("font_size", 20)
	line.add_theme_color_override("font_color", C_MID)
	start_box.add_child(line)
	var stats := Label.new()
	stats.text = "BEST CELL %d / %d   •   BEST KILLS %d   •   CLEARS %d" % [best_room, TOTAL_ROOMS, best_kills, clears]
	stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stats.add_theme_font_size_override("font_size", 14)
	stats.add_theme_color_override("font_color", C_DARK)
	start_box.add_child(stats)
	start_box.add_child(_spacer(12))
	var start := _overlay_button("START RUN", true)
	start.pressed.connect(_start_run)
	start_box.add_child(start)
	var exit := _overlay_button("POCKET WORKS", false)
	exit.pressed.connect(PocketWorks.exit_to_launcher)
	start_box.add_child(exit)

	pause_overlay = _make_overlay(root, Vector2(500, 390))
	pause_overlay.visible = false
	var pause_box: VBoxContainer = pause_overlay.get_node("Panel/Box")
	pause_box.add_child(_overlay_title("PAUSED"))
	var resume := _overlay_button("RESUME", true)
	resume.pressed.connect(_resume)
	pause_box.add_child(resume)
	sound_button = _overlay_button("SOUND: ON" if sound_enabled else "SOUND: OFF", false)
	sound_button.pressed.connect(_toggle_sound)
	pause_box.add_child(sound_button)
	var restart := _overlay_button("RESTART RUN", false)
	restart.pressed.connect(_restart_run)
	pause_box.add_child(restart)
	var pause_exit := _overlay_button("POCKET WORKS", false)
	pause_exit.pressed.connect(PocketWorks.exit_to_launcher)
	pause_box.add_child(pause_exit)

	workshop_overlay = _make_overlay(root, Vector2(1040, 410))
	workshop_overlay.visible = false
	var work_box: VBoxContainer = workshop_overlay.get_node("Panel/Box")
	workshop_title = _overlay_title("WORKBENCH")
	work_box.add_child(workshop_title)
	var work_copy := Label.new()
	work_copy.text = "Replace one subsystem. No stat cards — the machine actually changes."
	work_copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	work_copy.add_theme_font_size_override("font_size", 17)
	work_copy.add_theme_color_override("font_color", C_MID)
	work_box.add_child(work_copy)
	work_box.add_child(_spacer(8))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	work_box.add_child(row)
	for i in range(3):
		var button := Button.new()
		button.custom_minimum_size = Vector2(310, 172)
		button.add_theme_font_size_override("font_size", 17)
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_style_button(button, i == 1)
		button.pressed.connect(_choose_workshop.bind(i))
		row.add_child(button)
		workshop_buttons.append(button)

	result_overlay = _make_overlay(root, Vector2(590, 410))
	result_overlay.visible = false
	var result_box: VBoxContainer = result_overlay.get_node("Panel/Box")
	result_title = _overlay_title("RUN ENDED")
	result_box.add_child(result_title)
	result_copy = Label.new()
	result_copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_copy.add_theme_font_size_override("font_size", 18)
	result_copy.add_theme_color_override("font_color", C_MID)
	result_box.add_child(result_copy)
	result_box.add_child(_spacer(8))
	var again := _overlay_button("RUN AGAIN", true)
	again.pressed.connect(_restart_run)
	result_box.add_child(again)
	var result_exit := _overlay_button("POCKET WORKS", false)
	result_exit.pressed.connect(PocketWorks.exit_to_launcher)
	result_box.add_child(result_exit)

func _make_overlay(parent: Control, panel_size: Vector2) -> Control:
	var overlay := Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	parent.add_child(overlay)

	var shade := ColorRect.new()
	shade.color = Color(0.08, 0.09, 0.08, 0.76)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(shade)

	var panel := PanelContainer.new()
	panel.name = "Panel"
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = -panel_size * 0.5
	panel.size = panel_size
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = C_PAPER
	panel_style.border_color = C_INK
	panel_style.border_width_left = 3
	panel_style.border_width_top = 3
	panel_style.border_width_right = 3
	panel_style.border_width_bottom = 3
	panel_style.corner_radius_top_left = 5
	panel_style.corner_radius_top_right = 5
	panel_style.corner_radius_bottom_left = 5
	panel_style.corner_radius_bottom_right = 5
	panel.add_theme_stylebox_override("panel", panel_style)
	overlay.add_child(panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 26)
	margin.add_theme_constant_override("margin_right", 26)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_bottom", 24)
	panel.add_child(margin)

	var box := VBoxContainer.new()
	box.name = "Box"
	box.add_theme_constant_override("separation", 12)
	margin.add_child(box)
	return overlay

func _overlay_title(text_value: String) -> Label:
	var label := Label.new()
	label.text = text_value
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 34)
	label.add_theme_color_override("font_color", C_INK)
	return label

func _spacer(height: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(1, height)
	return c

func _overlay_button(text_value: String, accent: bool) -> Button:
	var button := Button.new()
	button.text = text_value
	button.custom_minimum_size = Vector2(0, 62)
	button.add_theme_font_size_override("font_size", 18)
	_style_button(button, accent)
	return button

func _style_button(button: Button, accent: bool) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = C_RUST if accent else C_INK
	normal.border_color = C_DARK
	normal.border_width_left = 2
	normal.border_width_top = 2
	normal.border_width_right = 2
	normal.border_width_bottom = 2
	normal.corner_radius_top_left = 4
	normal.corner_radius_top_right = 4
	normal.corner_radius_bottom_left = 4
	normal.corner_radius_bottom_right = 4
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = C_WARN if accent else C_MID
	pressed.content_margin_top = 7
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = normal.bg_color.lightened(0.08)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", normal)
	button.add_theme_color_override("font_color", C_PAPER)
	button.add_theme_color_override("font_hover_color", C_PAPER)
	button.add_theme_color_override("font_pressed_color", C_DARK if accent else C_PAPER)

func _style_bar(bar: ProgressBar, color: Color) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.16, 0.18, 0.17, 0.34)
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
	sfx["shot"] = _make_wave(220.0, 0.055, "square")
	sfx["hit"] = _make_wave(92.0, 0.080, "noise")
	sfx["dash"] = _make_wave(145.0, 0.120, "saw")
	sfx["hurt"] = _make_wave(72.0, 0.160, "noise")
	sfx["upgrade"] = _make_wave(430.0, 0.190, "sine")
	sfx["boss"] = _make_wave(116.0, 0.300, "saw")
	for i in range(5):
		var player := AudioStreamPlayer.new()
		player.volume_db = -10.0
		add_child(player)
		audio_players.append(player)

func _make_wave(freq: float, duration: float, kind: String) -> AudioStreamWAV:
	var rate := 22050
	var count := maxi(8, int(duration * float(rate)))
	var data := PackedByteArray()
	data.resize(count * 2)
	for i in range(count):
		var t := float(i) / float(rate)
		var phase := TAU * freq * t
		var sample := sin(phase)
		if kind == "square":
			sample = 1.0 if sample >= 0.0 else -1.0
		elif kind == "saw":
			sample = 2.0 * fposmod(freq * t, 1.0) - 1.0
		elif kind == "noise":
			sample = sin(phase * 0.83) * 0.55 + sin(phase * 2.7) * 0.30 + sin(phase * 7.3) * 0.15
		var env := pow(1.0 - float(i) / float(count), 2.4)
		var value := int(clamp(sample * env * 15000.0, -32767.0, 32767.0))
		data[i * 2] = value & 0xff
		data[i * 2 + 1] = (value >> 8) & 0xff
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = rate
	stream.stereo = false
	stream.data = data
	return stream

func _play_sfx(name: String, pitch := 1.0) -> void:
	if not sound_enabled or not sfx.has(name) or audio_players.is_empty():
		return
	var player := audio_players[audio_cursor % audio_players.size()]
	audio_cursor += 1
	player.stream = sfx[name]
	player.pitch_scale = pitch
	player.play()

func _reset_run() -> void:
	enemies.clear()
	bullets.clear()
	enemy_bullets.clear()
	effects.clear()
	player_pos = Vector2(640, 420)
	player_vel = Vector2.ZERO
	move_input = Vector2.ZERO
	aim_dir = Vector2.RIGHT
	weapon_id = "rivet"
	chassis_id = "strider"
	core_id = "flywheel"
	max_hull = 100.0
	hull = max_hull
	invuln = 0.0
	dash_time = 0.0
	dash_cd = 0.0
	fire_cd = 0.0
	recoil = 0.0
	heat = 0.0
	overheat = 0.0
	shot_counter = 0
	room = 1
	total_kills = 0
	elapsed = 0.0
	run_finished = false
	paused_game = false
	workshop_open = false
	room_closing = false
	clear_delay = -1.0
	fire_held = false
	_setup_room()
	_update_ui()

func _start_run() -> void:
	_reset_run()
	start_overlay.visible = false
	result_overlay.visible = false
	pause_overlay.visible = false
	workshop_overlay.visible = false
	hud.visible = true
	run_active = true
	paused_game = false
	_play_sfx("upgrade", 0.82)
	_publish_state("running")

func _restart_run() -> void:
	_reset_run()
	start_overlay.visible = false
	result_overlay.visible = false
	pause_overlay.visible = false
	workshop_overlay.visible = false
	hud.visible = true
	run_active = true
	paused_game = false
	_publish_state("running")

func _setup_room() -> void:
	enemies.clear()
	bullets.clear()
	enemy_bullets.clear()
	room_spawned = 0
	room_closing = false
	clear_delay = -1.0
	spawn_timer = 0.35
	if room >= TOTAL_ROOMS:
		room_budget = 1
	else:
		room_budget = 4 + room * 2
	_update_ui()

func _toggle_pause() -> void:
	if not run_active or workshop_open or run_finished:
		return
	paused_game = not paused_game
	pause_overlay.visible = paused_game
	fire_held = false
	_publish_state("paused" if paused_game else "running")

func _resume() -> void:
	paused_game = false
	pause_overlay.visible = false
	_publish_state("running")

func _toggle_sound() -> void:
	sound_enabled = not sound_enabled
	PocketWorks.storage_set("sound", sound_enabled)
	sound_button.text = "SOUND: ON" if sound_enabled else "SOUND: OFF"
	if sound_enabled:
		_play_sfx("upgrade", 1.05)

func _on_fire_down() -> void:
	fire_held = true

func _on_fire_up() -> void:
	fire_held = false

func _on_stick_changed(value: Vector2) -> void:
	move_input = value

func _keyboard_move() -> Vector2:
	var value := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		value.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		value.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		value.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		value.y += 1.0
	return value.normalized() if value.length() > 1.0 else value

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			_toggle_pause()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_SHIFT or event.keycode == KEY_X:
			_request_dash()
			get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
	elapsed += delta
	recoil = move_toward(recoil, 0.0, delta * 7.0)
	shake = move_toward(shake, 0.0, delta * 18.0)
	flash = move_toward(flash, 0.0, delta * 3.8)
	position = Vector2(rng.randf_range(-shake, shake), rng.randf_range(-shake, shake)) if shake > 0.05 else Vector2.ZERO

	if not run_active or paused_game or workshop_open or run_finished:
		_update_effects(delta)
		queue_redraw()
		return

	if hitstop > 0.0:
		hitstop -= delta
		_update_effects(delta * 0.25)
		queue_redraw()
		return

	var keyboard := _keyboard_move()
	var input_vec := keyboard if keyboard.length() > 0.05 else move_input
	_update_player(delta, input_vec)
	_update_spawning(delta)
	_update_enemies(delta)
	_update_bullets(delta)
	_update_enemy_bullets(delta)
	_update_effects(delta)
	_check_room_clear(delta)
	_update_ui()

	publish_timer -= delta
	if publish_timer <= 0.0:
		publish_timer = 0.45
		_publish_state("running")
	queue_redraw()

func _update_player(delta: float, input_vec: Vector2) -> void:
	invuln = maxf(0.0, invuln - delta)
	dash_cd = maxf(0.0, dash_cd - delta)
	fire_cd = maxf(0.0, fire_cd - delta)
	overheat = maxf(0.0, overheat - delta)
	heat = maxf(0.0, heat - delta * 0.20)

	if input_vec.length() > 0.06:
		aim_dir = input_vec.normalized() if _nearest_target(460.0) == -1 else aim_dir

	var speed := _move_speed()
	var target_vel := input_vec * speed
	player_vel = player_vel.lerp(target_vel, minf(1.0, delta * 9.5))

	if dash_time > 0.0:
		dash_time = maxf(0.0, dash_time - delta)
		player_pos += dash_dir * _dash_speed() * delta
		_check_dash_hits()
	else:
		player_pos += player_vel * delta

	player_pos.x = clampf(player_pos.x, ARENA.position.x + 24.0, ARENA.end.x - 24.0)
	player_pos.y = clampf(player_pos.y, ARENA.position.y + 38.0, ARENA.end.y - 26.0)

	var target_index := _nearest_target(560.0)
	if target_index >= 0:
		var to_target: Vector2 = enemies[target_index]["pos"] - player_pos
		if to_target.length() > 0.1:
			aim_dir = aim_dir.slerp(to_target.normalized(), minf(1.0, delta * 15.0))
	elif input_vec.length() > 0.08:
		aim_dir = aim_dir.slerp(input_vec.normalized(), minf(1.0, delta * 11.0))

	var keyboard_fire := Input.is_key_pressed(KEY_Z) or Input.is_key_pressed(KEY_SPACE)
	if (fire_held or keyboard_fire) and fire_cd <= 0.0 and overheat <= 0.0:
		_attack()

func _move_speed() -> float:
	if chassis_id == "treads":
		return 205.0
	if chassis_id == "skates":
		return 288.0
	return 244.0

func _dash_speed() -> float:
	if chassis_id == "treads":
		return 610.0
	if chassis_id == "skates":
		return 790.0
	return 700.0

func _dash_cooldown_value() -> float:
	if chassis_id == "skates":
		return 0.62
	if chassis_id == "treads":
		return 1.08
	return 0.82

func _request_dash() -> void:
	if not run_active or paused_game or workshop_open or run_finished or dash_cd > 0.0:
		return
	var direction := move_input
	var keyboard := _keyboard_move()
	if keyboard.length() > 0.05:
		direction = keyboard
	if direction.length() < 0.08:
		direction = aim_dir
	dash_dir = direction.normalized()
	dash_time = 0.20 if chassis_id != "treads" else 0.24
	dash_cd = _dash_cooldown_value()
	invuln = dash_time + 0.08
	for i in range(enemies.size()):
		enemies[i]["dash_hit"] = false
	_add_effect({"kind": "ring", "pos": player_pos, "life": 0.26, "max": 0.26, "color": C_BLUE})
	_play_sfx("dash", rng.randf_range(0.94, 1.06))
	shake = maxf(shake, 2.2)

func _check_dash_hits() -> void:
	for i in range(enemies.size() - 1, -1, -1):
		if i >= enemies.size():
			continue
		var e: Dictionary = enemies[i]
		if bool(e.get("dash_hit", false)):
			continue
		var radius := float(e["radius"]) + 31.0
		if player_pos.distance_to(e["pos"]) <= radius:
			e["dash_hit"] = true
			enemies[i] = e
			var damage := 54.0 if chassis_id == "treads" else 28.0
			if chassis_id == "skates":
				damage = 34.0
			_damage_enemy(i, damage, dash_dir, true)

func _attack() -> void:
	shot_counter += 1
	var cooldown := 0.22
	var damage := 17.0
	match weapon_id:
		"cutter":
			cooldown = 0.39
			damage = 34.0
		"coil":
			cooldown = 0.49
			damage = 27.0
		"mortar":
			cooldown = 0.68
			damage = 42.0

	if core_id == "flywheel" and player_vel.length() > 90.0:
		cooldown *= 0.72
	elif core_id == "boiler":
		heat += 0.15
		damage *= 1.0 + heat * 0.34
		if heat >= 1.0:
			overheat = 0.82
			heat = 0.62

	fire_cd = cooldown
	recoil = 1.0
	var dir := aim_dir.normalized()
	var target := _nearest_target(580.0)
	if target >= 0:
		var desired: Vector2 = (enemies[target]["pos"] - player_pos).normalized()
		dir = dir.slerp(desired, 0.78)
		aim_dir = dir

	match weapon_id:
		"cutter":
			_fire_cutter(dir, damage)
		"coil":
			_fire_coil(dir, damage)
		"mortar":
			_fire_mortar(dir, damage)
		_:
			_fire_rivet(dir, damage)

	if core_id == "capacitor" and shot_counter % 4 == 0:
		_capacitor_pulse()

func _fire_rivet(dir: Vector2, damage: float) -> void:
	bullets.append({
		"kind": "rivet",
		"pos": player_pos + dir * 34.0,
		"vel": dir * 780.0,
		"life": 0.90,
		"damage": damage,
		"radius": 7.0
	})
	_add_effect({"kind": "muzzle", "pos": player_pos + dir * 35.0, "dir": dir, "life": 0.11, "max": 0.11, "color": C_WARN})
	_play_sfx("shot", rng.randf_range(0.96, 1.08))

func _fire_cutter(dir: Vector2, damage: float) -> void:
	for i in range(enemies.size() - 1, -1, -1):
		if i >= enemies.size():
			continue
		var to_enemy: Vector2 = enemies[i]["pos"] - player_pos
		var distance := to_enemy.length()
		if distance <= 126.0 and distance > 0.01 and dir.dot(to_enemy.normalized()) > 0.34:
			_damage_enemy(i, damage, dir, true)
	_add_effect({"kind": "slash", "pos": player_pos + dir * 56.0, "dir": dir, "life": 0.18, "max": 0.18, "color": C_RUST})
	_play_sfx("shot", 0.68)

func _fire_coil(dir: Vector2, damage: float) -> void:
	var first := _nearest_target(520.0)
	if first < 0:
		_fire_rivet(dir, damage * 0.75)
		return
	var first_pos: Vector2 = enemies[first]["pos"]
	_add_effect({"kind": "beam", "a": player_pos + dir * 30.0, "b": first_pos, "life": 0.14, "max": 0.14, "color": C_BLUE})
	_damage_enemy(first, damage, dir, false)
	var second := -1
	var best := 240.0
	for i in range(enemies.size()):
		if i == first:
			continue
		var d := first_pos.distance_to(enemies[i]["pos"])
		if d < best:
			best = d
			second = i
	if second >= 0 and second < enemies.size():
		var second_pos: Vector2 = enemies[second]["pos"]
		_add_effect({"kind": "beam", "a": first_pos, "b": second_pos, "life": 0.12, "max": 0.12, "color": C_BLUE})
		_damage_enemy(second, damage * 0.56, (second_pos - first_pos).normalized(), false)
	_play_sfx("shot", 1.34)

func _fire_mortar(dir: Vector2, damage: float) -> void:
	bullets.append({
		"kind": "mortar",
		"pos": player_pos + dir * 34.0,
		"vel": dir * 360.0,
		"life": 0.62,
		"damage": damage,
		"radius": 12.0
	})
	_add_effect({"kind": "muzzle", "pos": player_pos + dir * 35.0, "dir": dir, "life": 0.16, "max": 0.16, "color": C_RUST})
	_play_sfx("shot", 0.58)

func _capacitor_pulse() -> void:
	_add_effect({"kind": "ring", "pos": player_pos, "life": 0.32, "max": 0.32, "color": C_BLUE})
	for i in range(enemies.size() - 1, -1, -1):
		if i < enemies.size() and player_pos.distance_to(enemies[i]["pos"]) < 148.0:
			var push := (enemies[i]["pos"] - player_pos).normalized()
			_damage_enemy(i, 18.0, push, false)
	shake = maxf(shake, 2.8)

func _nearest_target(max_distance: float) -> int:
	var result := -1
	var best := max_distance
	for i in range(enemies.size()):
		var d := player_pos.distance_to(enemies[i]["pos"])
		if d < best:
			best = d
			result = i
	return result

func _update_spawning(delta: float) -> void:
	if room_closing:
		return
	if room >= TOTAL_ROOMS:
		if room_spawned == 0:
			_spawn_enemy("boss")
			room_spawned = 1
			_play_sfx("boss", 0.88)
		return

	spawn_timer -= delta
	if room_spawned < room_budget and spawn_timer <= 0.0:
		var kind := _pick_enemy_kind()
		_spawn_enemy(kind)
		room_spawned += 1
		spawn_timer = maxf(0.40, 1.05 - float(room) * 0.055)

func _pick_enemy_kind() -> String:
	var roll := rng.randf()
	if room <= 1:
		return "scrapper" if roll < 0.72 else "gunner"
	if room <= 3:
		if roll < 0.48:
			return "scrapper"
		return "gunner" if roll < 0.78 else "rammer"
	if roll < 0.34:
		return "scrapper"
	if roll < 0.61:
		return "gunner"
	if roll < 0.82:
		return "rammer"
	return "drone"

func _spawn_enemy(kind: String) -> void:
	var side := rng.randi_range(0, 3)
	var pos := Vector2.ZERO
	match side:
		0:
			pos = Vector2(ARENA.position.x + 20.0, rng.randf_range(ARENA.position.y + 60.0, ARENA.end.y - 40.0))
		1:
			pos = Vector2(ARENA.end.x - 20.0, rng.randf_range(ARENA.position.y + 60.0, ARENA.end.y - 40.0))
		2:
			pos = Vector2(rng.randf_range(ARENA.position.x + 60.0, ARENA.end.x - 60.0), ARENA.position.y + 30.0)
		_:
			pos = Vector2(rng.randf_range(ARENA.position.x + 60.0, ARENA.end.x - 60.0), ARENA.end.y - 25.0)

	var hp := 46.0 + float(room) * 7.0
	var radius := 24.0
	if kind == "gunner":
		hp *= 0.88
		radius = 23.0
	elif kind == "rammer":
		hp *= 1.48
		radius = 29.0
	elif kind == "drone":
		hp *= 0.72
		radius = 20.0
	elif kind == "boss":
		pos = Vector2(870, 300)
		hp = 1100.0
		radius = 66.0

	enemies.append({
		"kind": kind,
		"pos": pos,
		"vel": Vector2.ZERO,
		"hp": hp,
		"max_hp": hp,
		"radius": radius,
		"attack_cd": rng.randf_range(0.5, 1.2),
		"state": "idle",
		"timer": 0.0,
		"flash": 0.0,
		"dash_hit": false,
		"phase": 1,
		"angle": rng.randf_range(0.0, TAU)
	})
	_add_effect({"kind": "spawn", "pos": pos, "life": 0.30, "max": 0.30, "color": C_WARN})

func _update_enemies(delta: float) -> void:
	for i in range(enemies.size()):
		if i >= enemies.size():
			break
		var e: Dictionary = enemies[i]
		e["flash"] = maxf(0.0, float(e["flash"]) - delta)
		var kind := str(e["kind"])
		match kind:
			"scrapper":
				e = _update_scrapper(e, delta)
			"gunner":
				e = _update_gunner(e, delta)
			"rammer":
				e = _update_rammer(e, delta)
			"drone":
				e = _update_drone(e, delta)
			"boss":
				e = _update_boss(e, delta)
		enemies[i] = e

	for i in range(enemies.size()):
		if i >= enemies.size():
			break
		var e: Dictionary = enemies[i]
		var contact := float(e["radius"]) + 25.0
		if player_pos.distance_to(e["pos"]) < contact:
			if dash_time <= 0.0:
				var damage := 10.0 + float(room) * 0.8
				if str(e["kind"]) == "boss":
					damage = 18.0
				_hurt_player(damage, e["pos"])

func _update_scrapper(e: Dictionary, delta: float) -> Dictionary:
	var to_player: Vector2 = player_pos - e["pos"]
	if to_player.length() > 0.01:
		var speed := 104.0 + float(room) * 4.0
		e["vel"] = (e["vel"] as Vector2).lerp(to_player.normalized() * speed, minf(1.0, delta * 4.5))
		e["pos"] = e["pos"] + e["vel"] * delta
	return e

func _update_gunner(e: Dictionary, delta: float) -> Dictionary:
	var to_player: Vector2 = player_pos - e["pos"]
	var distance := to_player.length()
	var dir := to_player.normalized() if distance > 0.01 else Vector2.RIGHT
	var desired := Vector2.ZERO
	if distance > 315.0:
		desired = dir * 82.0
	elif distance < 230.0:
		desired = -dir * 92.0
	e["vel"] = (e["vel"] as Vector2).lerp(desired, minf(1.0, delta * 4.2))
	e["pos"] = e["pos"] + e["vel"] * delta

	e["attack_cd"] = float(e["attack_cd"]) - delta
	e["timer"] = maxf(0.0, float(e["timer"]) - delta)
	if str(e["state"]) == "windup":
		if float(e["timer"]) <= 0.0:
			_enemy_shot(e["pos"], dir, 270.0 + float(room) * 8.0, 9.0)
			e["state"] = "idle"
			e["attack_cd"] = rng.randf_range(1.25, 1.62)
	elif float(e["attack_cd"]) <= 0.0:
		e["state"] = "windup"
		e["timer"] = 0.30
		_add_effect({"kind": "telegraph", "pos": e["pos"], "dir": dir, "life": 0.30, "max": 0.30, "color": C_WARN})
	return e

func _update_rammer(e: Dictionary, delta: float) -> Dictionary:
	var to_player: Vector2 = player_pos - e["pos"]
	var dir := to_player.normalized() if to_player.length() > 0.01 else Vector2.RIGHT
	e["attack_cd"] = float(e["attack_cd"]) - delta
	e["timer"] = maxf(0.0, float(e["timer"]) - delta)
	var state := str(e["state"])
	if state == "windup":
		e["vel"] = (e["vel"] as Vector2).lerp(Vector2.ZERO, minf(1.0, delta * 12.0))
		if float(e["timer"]) <= 0.0:
			e["state"] = "charge"
			e["timer"] = 0.48
			e["vel"] = dir * 430.0
			_play_sfx("dash", 0.62)
	elif state == "charge":
		e["pos"] = e["pos"] + e["vel"] * delta
		if float(e["timer"]) <= 0.0:
			e["state"] = "idle"
			e["attack_cd"] = rng.randf_range(1.6, 2.1)
	else:
		e["vel"] = (e["vel"] as Vector2).lerp(dir * 72.0, minf(1.0, delta * 3.2))
		e["pos"] = e["pos"] + e["vel"] * delta
		if float(e["attack_cd"]) <= 0.0 and to_player.length() < 390.0:
			e["state"] = "windup"
			e["timer"] = 0.56
			_add_effect({"kind": "telegraph_line", "pos": e["pos"], "dir": dir, "life": 0.56, "max": 0.56, "color": C_RUST})
	return e

func _update_drone(e: Dictionary, delta: float) -> Dictionary:
	e["angle"] = float(e["angle"]) + delta * 0.8
	var desired := player_pos + Vector2.from_angle(float(e["angle"])) * 235.0
	var to_desired: Vector2 = desired - e["pos"]
	e["vel"] = (e["vel"] as Vector2).lerp(to_desired.limit_length(125.0), minf(1.0, delta * 3.5))
	e["pos"] = e["pos"] + e["vel"] * delta
	e["attack_cd"] = float(e["attack_cd"]) - delta
	if float(e["attack_cd"]) <= 0.0:
		var dir := (player_pos - e["pos"]).normalized()
		_enemy_shot(e["pos"], dir, 320.0, 7.0)
		e["attack_cd"] = rng.randf_range(1.05, 1.42)
	return e

func _update_boss(e: Dictionary, delta: float) -> Dictionary:
	var ratio := float(e["hp"]) / maxf(1.0, float(e["max_hp"]))
	var new_phase := 3 if ratio <= 0.33 else (2 if ratio <= 0.66 else 1)
	if new_phase != int(e["phase"]):
		e["phase"] = new_phase
		e["state"] = "windup"
		e["timer"] = 0.78
		e["attack_cd"] = 0.0
		_add_effect({"kind": "ring", "pos": e["pos"], "life": 0.70, "max": 0.70, "color": C_RUST})
		flash = 0.34
		shake = maxf(shake, 8.0)
		_play_sfx("boss", 0.84 + new_phase * 0.10)

	e["angle"] = float(e["angle"]) + delta * (0.34 + new_phase * 0.08)
	var target := Vector2(825, 330) + Vector2(cos(float(e["angle"])) * 175.0, sin(float(e["angle"]) * 0.73) * 112.0)
	var to_target: Vector2 = target - e["pos"]
	e["vel"] = (e["vel"] as Vector2).lerp(to_target.limit_length(95.0 + new_phase * 22.0), minf(1.0, delta * 2.8))
	e["pos"] = e["pos"] + e["vel"] * delta
	e["attack_cd"] = float(e["attack_cd"]) - delta
	e["timer"] = maxf(0.0, float(e["timer"]) - delta)

	if str(e["state"]) == "windup":
		if float(e["timer"]) <= 0.0:
			_boss_fire(e["pos"], new_phase)
			e["state"] = "idle"
			e["attack_cd"] = maxf(0.66, 1.45 - new_phase * 0.19)
	elif float(e["attack_cd"]) <= 0.0:
		e["state"] = "windup"
		e["timer"] = maxf(0.28, 0.52 - new_phase * 0.06)
		_add_effect({"kind": "telegraph", "pos": e["pos"], "dir": (player_pos - e["pos"]).normalized(), "life": e["timer"], "max": e["timer"], "color": C_WARN})
	return e

func _boss_fire(pos: Vector2, phase: int) -> void:
	var aimed := (player_pos - pos).normalized()
	var count := 5 + phase * 2
	for i in range(count):
		var spread := lerpf(-0.72 - phase * 0.08, 0.72 + phase * 0.08, float(i) / maxf(1.0, float(count - 1)))
		_enemy_shot(pos, aimed.rotated(spread), 250.0 + phase * 34.0, 10.0 + phase)
	if phase >= 2 and enemies.size() < 7:
		_spawn_enemy("rammer" if phase == 2 else "drone")
	if phase >= 3:
		for j in range(5):
			var dir := Vector2.from_angle(float(j) * TAU / 5.0 + elapsed)
			_enemy_shot(pos, dir, 225.0, 8.0)
	shake = maxf(shake, 4.2)

func _enemy_shot(pos: Vector2, dir: Vector2, speed: float, damage: float) -> void:
	enemy_bullets.append({
		"pos": pos + dir * 24.0,
		"vel": dir.normalized() * speed,
		"life": 3.2,
		"damage": damage,
		"radius": 7.0
	})

func _update_bullets(delta: float) -> void:
	for i in range(bullets.size() - 1, -1, -1):
		var b: Dictionary = bullets[i]
		b["life"] = float(b["life"]) - delta
		b["pos"] = b["pos"] + b["vel"] * delta
		var exploded := false
		if str(b["kind"]) == "mortar" and float(b["life"]) <= 0.0:
			_explode_mortar(b["pos"], float(b["damage"]))
			bullets.remove_at(i)
			continue
		if float(b["life"]) <= 0.0:
			bullets.remove_at(i)
			continue

		for j in range(enemies.size() - 1, -1, -1):
			if j >= enemies.size():
				continue
			var e: Dictionary = enemies[j]
			if (b["pos"] as Vector2).distance_to(e["pos"]) <= float(b["radius"]) + float(e["radius"]):
				if str(b["kind"]) == "mortar":
					_explode_mortar(b["pos"], float(b["damage"]))
					exploded = true
				else:
					var push := (b["vel"] as Vector2).normalized()
					_damage_enemy(j, float(b["damage"]), push, false)
				break

		if exploded:
			if i < bullets.size():
				bullets.remove_at(i)
			continue

		var hit_something := false
		for e in enemies:
			if (b["pos"] as Vector2).distance_to(e["pos"]) <= float(b["radius"]) + float(e["radius"]):
				hit_something = true
				break
		if hit_something and i < bullets.size():
			bullets.remove_at(i)
		else:
			bullets[i] = b

func _explode_mortar(pos: Vector2, damage: float) -> void:
	_add_effect({"kind": "blast", "pos": pos, "life": 0.34, "max": 0.34, "color": C_RUST})
	for i in range(enemies.size() - 1, -1, -1):
		if i < enemies.size():
			var d := pos.distance_to(enemies[i]["pos"])
			if d <= 128.0:
				var scale := 1.0 - d / 170.0
				var push := (enemies[i]["pos"] - pos).normalized()
				_damage_enemy(i, damage * maxf(0.45, scale), push, true)
	shake = maxf(shake, 7.0)
	_play_sfx("hit", 0.68)

func _update_enemy_bullets(delta: float) -> void:
	for i in range(enemy_bullets.size() - 1, -1, -1):
		var b: Dictionary = enemy_bullets[i]
		b["life"] = float(b["life"]) - delta
		b["pos"] = b["pos"] + b["vel"] * delta
		if float(b["life"]) <= 0.0 or not ARENA.grow(80.0).has_point(b["pos"]):
			enemy_bullets.remove_at(i)
			continue
		if player_pos.distance_to(b["pos"]) <= 25.0 + float(b["radius"]):
			_hurt_player(float(b["damage"]), b["pos"])
			enemy_bullets.remove_at(i)
			continue
		enemy_bullets[i] = b

func _damage_enemy(index: int, damage: float, push: Vector2, heavy: bool) -> void:
	if index < 0 or index >= enemies.size():
		return
	var e: Dictionary = enemies[index]
	e["hp"] = float(e["hp"]) - damage
	e["flash"] = 0.11
	if str(e["kind"]) != "boss":
		e["pos"] = e["pos"] + push * (14.0 if heavy else 6.0)
	enemies[index] = e
	_add_sparks(e["pos"], C_WARN if heavy else C_RUST, 10 if heavy else 6)
	hitstop = maxf(hitstop, 0.050 if heavy else 0.022)
	shake = maxf(shake, 4.0 if heavy else 1.8)
	if heavy or rng.randf() < 0.32:
		_play_sfx("hit", rng.randf_range(0.88, 1.12))
	if float(e["hp"]) <= 0.0:
		_kill_enemy(index)

func _kill_enemy(index: int) -> void:
	if index < 0 or index >= enemies.size():
		return
	var e: Dictionary = enemies[index]
	var was_boss := str(e["kind"]) == "boss"
	var pos: Vector2 = e["pos"]
	enemies.remove_at(index)
	total_kills += 1
	_add_effect({"kind": "blast", "pos": pos, "life": 0.38, "max": 0.38, "color": C_WARN})
	_add_sparks(pos, C_INK, 14 if was_boss else 8)
	if was_boss:
		_finish_run(true)

func _hurt_player(damage: float, source: Vector2) -> void:
	if invuln > 0.0 or run_finished:
		return
	if chassis_id == "treads":
		damage *= 0.78
	hull -= damage
	invuln = 0.44
	var away := (player_pos - source).normalized()
	player_vel += away * 130.0
	flash = 0.22
	shake = maxf(shake, 8.0)
	hitstop = maxf(hitstop, 0.055)
	_add_sparks(player_pos, C_RUST, 12)
	_play_sfx("hurt", rng.randf_range(0.90, 1.02))
	if hull <= 0.0:
		hull = 0.0
		_finish_run(false)

func _check_room_clear(delta: float) -> void:
	if run_finished or workshop_open or room_closing:
		return
	if room >= TOTAL_ROOMS:
		return
	if room_spawned >= room_budget and enemies.is_empty():
		if clear_delay < 0.0:
			clear_delay = 0.62
			_add_effect({"kind": "ring", "pos": player_pos, "life": 0.55, "max": 0.55, "color": C_BLUE})
		else:
			clear_delay -= delta
			if clear_delay <= 0.0:
				room_closing = true
				_show_workshop()

func _show_workshop() -> void:
	workshop_open = true
	run_active = true
	fire_held = false
	workshop_choices = [
		_random_module_for_slot("weapon"),
		_random_module_for_slot("chassis"),
		_random_module_for_slot("core")
	]
	workshop_choices.shuffle()
	workshop_title.text = "CELL %d CLEARED" % room
	for i in range(3):
		var id := workshop_choices[i]
		var m: Dictionary = MODULES[id]
		workshop_buttons[i].text = "%s\n%s\n%s" % [str(m["slot"]).to_upper(), str(m["name"]), str(m["desc"])]
	workshop_overlay.visible = true
	_play_sfx("upgrade", 0.94)
	_publish_state("workbench")

func _random_module_for_slot(slot: String) -> String:
	var ids: Array[String] = []
	for id in MODULES.keys():
		if str(MODULES[id]["slot"]) != slot:
			continue
		if slot == "weapon" and id == weapon_id:
			continue
		if slot == "chassis" and id == chassis_id:
			continue
		if slot == "core" and id == core_id:
			continue
		ids.append(id)
	if ids.is_empty():
		return weapon_id if slot == "weapon" else (chassis_id if slot == "chassis" else core_id)
	return ids[rng.randi_range(0, ids.size() - 1)]

func _choose_workshop(index: int) -> void:
	if index < 0 or index >= workshop_choices.size():
		return
	var id := workshop_choices[index]
	var slot := str(MODULES[id]["slot"])
	if slot == "weapon":
		weapon_id = id
	elif slot == "chassis":
		var old_max := max_hull
		chassis_id = id
		max_hull = 126.0 if chassis_id == "treads" else 100.0
		hull = minf(max_hull, hull + maxf(18.0, max_hull - old_max))
	else:
		core_id = id
		heat = 0.0
		overheat = 0.0
	workshop_open = false
	workshop_overlay.visible = false
	room += 1
	best_room = maxi(best_room, room)
	PocketWorks.storage_set("best-room", best_room)
	_setup_room()
	_play_sfx("upgrade", 1.12)
	_publish_state("running")

func _finish_run(victory: bool) -> void:
	if run_finished:
		return
	run_finished = true
	run_active = false
	workshop_open = false
	paused_game = false
	fire_held = false
	hud.visible = false
	pause_overlay.visible = false
	workshop_overlay.visible = false
	best_room = maxi(best_room, room)
	best_kills = maxi(best_kills, total_kills)
	if victory:
		clears += 1
	PocketWorks.storage_set("best-room", best_room)
	PocketWorks.storage_set("best-kills", best_kills)
	PocketWorks.storage_set("clears", clears)
	result_title.text = "FORGE BROKEN" if victory else "MACHINE LOST"
	result_copy.text = "CELL %d / %d   •   KILLS %d\n%s / %s / %s\nBEST KILLS %d   •   CLEARS %d" % [
		room, TOTAL_ROOMS, total_kills,
		str(MODULES[weapon_id]["name"]),
		str(MODULES[chassis_id]["name"]),
		str(MODULES[core_id]["name"]),
		best_kills, clears
	]
	result_overlay.visible = true
	_play_sfx("boss" if victory else "hurt", 1.08 if victory else 0.72)
	_publish_state("complete" if victory else "game-over")

func _update_ui() -> void:
	if health_bar == null:
		return
	health_bar.max_value = max_hull
	health_bar.value = hull
	health_label.text = "HULL %d / %d   •   KILLS %d" % [int(ceil(hull)), int(max_hull), total_kills]
	room_label.text = "FORGE" if room >= TOTAL_ROOMS else "CELL %02d / %02d" % [room, TOTAL_ROOMS]
	module_label.text = "%s  •  %s  •  %s" % [
		str(MODULES[weapon_id]["name"]),
		str(MODULES[chassis_id]["name"]),
		str(MODULES[core_id]["name"])
	]
	if core_id == "boiler":
		core_label.text = "BOILER %d%%" % int(heat * 100.0)
	elif overheat > 0.0:
		core_label.text = "VENTING"
	else:
		core_label.text = str(MODULES[core_id]["desc"])
	dash_button.text = "RAM" if dash_cd <= 0.0 else "%.1f" % dash_cd
	fire_button.text = "VENT" if overheat > 0.0 else "FIRE"

func _update_effects(delta: float) -> void:
	for i in range(effects.size() - 1, -1, -1):
		var e: Dictionary = effects[i]
		e["life"] = float(e["life"]) - delta
		if e.has("vel"):
			e["pos"] = e["pos"] + e["vel"] * delta
			e["vel"] = e["vel"] * maxf(0.0, 1.0 - delta * 4.0)
		if float(e["life"]) <= 0.0:
			effects.remove_at(i)
		else:
			effects[i] = e

func _add_effect(effect: Dictionary) -> void:
	effects.append(effect)

func _add_sparks(pos: Vector2, color: Color, count: int) -> void:
	for i in range(count):
		var dir := Vector2.from_angle(rng.randf_range(0.0, TAU))
		effects.append({
			"kind": "spark",
			"pos": pos,
			"vel": dir * rng.randf_range(80.0, 230.0),
			"life": rng.randf_range(0.16, 0.34),
			"max": 0.34,
			"color": color
		})

func _draw() -> void:
	_draw_background()
	_draw_world()
	if flash > 0.01:
		draw_rect(Rect2(Vector2.ZERO, VIEW), Color(0.90, 0.77, 0.60, flash * 0.26), true)

func _draw_background() -> void:
	draw_rect(Rect2(Vector2.ZERO, VIEW), C_BG, true)

	for i in range(9):
		var x := float(i) * 160.0 - fposmod(elapsed * 10.0, 160.0)
		draw_rect(Rect2(x, 0, 2, 720), Color(0.26, 0.29, 0.27, 0.13), true)
	for j in range(5):
		var y := 92.0 + float(j) * 128.0
		draw_line(Vector2(0, y), Vector2(1280, y), Color(0.26, 0.29, 0.27, 0.10), 2.0)

	for i in range(7):
		var x := 86.0 + i * 190.0
		var piston := 20.0 + sin(elapsed * 0.9 + i * 0.8) * 12.0
		draw_rect(Rect2(x, 30, 42, 74 + piston), C_INK, true)
		draw_rect(Rect2(x + 8, 38, 26, 44 + piston), C_STEEL, true)
		draw_circle(Vector2(x + 21, 122 + piston), 10, C_RUST)

	draw_rect(ARENA, Color("#c5bcac"), true)
	draw_rect(ARENA, C_INK, false, 3.0)

	for i in range(10):
		var yy := ARENA.position.y + 18.0 + i * 52.0
		var fade := 0.10 + float(i) * 0.012
		draw_line(Vector2(ARENA.position.x, yy), Vector2(ARENA.end.x, yy), Color(0.18, 0.20, 0.18, fade), 1.5)
	for i in range(14):
		var xx := ARENA.position.x + 20.0 + i * 78.0
		draw_line(Vector2(xx, ARENA.position.y), Vector2(xx + 34.0, ARENA.end.y), Color(0.18, 0.20, 0.18, 0.08), 1.0)

	draw_rect(Rect2(ARENA.position.x, ARENA.position.y - 16, ARENA.size.x, 12), C_INK, true)
	for i in range(22):
		var x := ARENA.position.x + 12.0 + i * 49.0
		draw_circle(Vector2(x, ARENA.position.y - 10.0), 4.0, C_RUST if i % 4 == 0 else C_STEEL)

func _draw_world() -> void:
	for b in bullets:
		_draw_player_bullet(b)
	for b in enemy_bullets:
		var p: Vector2 = b["pos"]
		var v: Vector2 = b["vel"]
		draw_line(p - v.normalized() * 16.0, p, C_RUST, 4.0)
		draw_circle(p, float(b["radius"]), C_WARN)

	for e in enemies:
		_draw_enemy(e)

	_draw_player()

	for effect in effects:
		_draw_effect(effect)

func _draw_player() -> void:
	var pos := player_pos
	var angle := aim_dir.angle()
	var shadow_scale := 1.0 + abs(sin(elapsed * 4.0)) * 0.04
	draw_ellipse(pos + Vector2(0, 20), Vector2(38, 15) * shadow_scale, Color(0.12, 0.13, 0.12, 0.22))

	if chassis_id == "treads":
		_draw_rot_rect(pos + Vector2(-3, 2), Vector2(78, 48), angle, C_DARK)
		_draw_rot_rect(pos + Vector2(-3, -13).rotated(angle), Vector2(62, 10), angle, C_MID)
		_draw_rot_rect(pos + Vector2(-3, 17).rotated(angle), Vector2(62, 10), angle, C_MID)
	elif chassis_id == "skates":
		_draw_rot_rect(pos, Vector2(66, 36), angle, C_DARK)
		var side := Vector2(0, 24).rotated(angle)
		draw_line(pos - aim_dir * 20.0 + side, pos + aim_dir * 24.0 + side, C_BLUE, 6.0)
		draw_line(pos - aim_dir * 20.0 - side, pos + aim_dir * 24.0 - side, C_BLUE, 6.0)
	else:
		_draw_rot_rect(pos, Vector2(60, 42), angle, C_DARK)
		var leg_side := Vector2(0, 25).rotated(angle)
		draw_line(pos - aim_dir * 13.0 + leg_side, pos + aim_dir * 17.0 + leg_side, C_MID, 7.0)
		draw_line(pos - aim_dir * 13.0 - leg_side, pos + aim_dir * 17.0 - leg_side, C_MID, 7.0)

	draw_circle(pos, 24.0, C_PAPER)
	draw_circle(pos, 13.0, C_RUST if core_id == "boiler" else (C_BLUE if core_id == "capacitor" else C_STEEL))
	draw_circle(pos, 5.5, C_INK)

	var weapon_pos := pos + aim_dir * (28.0 - recoil * 6.0)
	match weapon_id:
		"cutter":
			draw_line(weapon_pos, weapon_pos + aim_dir * 48.0, C_RUST, 10.0)
			var blade_side := aim_dir.orthogonal()
			draw_line(weapon_pos + aim_dir * 40.0 - blade_side * 16.0, weapon_pos + aim_dir * 48.0 + blade_side * 16.0, C_PAPER, 6.0)
		"coil":
			draw_circle(weapon_pos + aim_dir * 16.0, 14.0, C_BLUE)
			draw_arc(weapon_pos + aim_dir * 16.0, 18.0, 0, TAU, 24, C_INK, 4.0)
			draw_line(weapon_pos + aim_dir * 14.0, weapon_pos + aim_dir * 42.0, C_INK, 8.0)
		"mortar":
			draw_line(weapon_pos, weapon_pos + aim_dir * 42.0, C_INK, 18.0)
			draw_circle(weapon_pos + aim_dir * 44.0, 11.0, C_RUST)
		_:
			draw_line(weapon_pos, weapon_pos + aim_dir * 50.0, C_INK, 10.0)
			draw_line(weapon_pos + aim_dir * 26.0, weapon_pos + aim_dir * 52.0, C_RUST, 5.0)

	if invuln > 0.0:
		draw_arc(pos, 38.0 + sin(elapsed * 24.0) * 2.0, 0, TAU, 30, Color(C_PAPER, 0.65), 3.0)

func _draw_enemy(e: Dictionary) -> void:
	var pos: Vector2 = e["pos"]
	var kind := str(e["kind"])
	var hp_ratio := float(e["hp"]) / maxf(1.0, float(e["max_hp"]))
	var flash_amount := float(e["flash"])
	var body_color := C_PAPER if flash_amount > 0.0 else C_MID
	var to_player := (player_pos - pos).normalized()
	var angle := to_player.angle()

	draw_ellipse(pos + Vector2(0, float(e["radius"]) * 0.58), Vector2(float(e["radius"]) * 1.0, float(e["radius"]) * 0.42), Color(0.12, 0.13, 0.12, 0.22))

	match kind:
		"scrapper":
			_draw_rot_rect(pos, Vector2(48, 38), angle, body_color)
			var side := to_player.orthogonal() * 27.0
			draw_line(pos - side, pos - side + to_player * 24.0, C_DARK, 7.0)
			draw_line(pos + side, pos + side + to_player * 24.0, C_DARK, 7.0)
			draw_circle(pos + to_player * 18.0, 5.0, C_RUST)
		"gunner":
			_draw_rot_rect(pos, Vector2(44, 44), angle, body_color)
			draw_line(pos, pos + to_player * 38.0, C_INK, 9.0)
			draw_circle(pos + to_player * 8.0, 6.0, C_WARN if str(e["state"]) == "windup" else C_BLUE)
		"rammer":
			var points := PackedVector2Array([
				pos + Vector2(35, 0).rotated(angle),
				pos + Vector2(-25, -27).rotated(angle),
				pos + Vector2(-31, 0).rotated(angle),
				pos + Vector2(-25, 27).rotated(angle)
			])
			draw_colored_polygon(points, C_RUST if str(e["state"]) == "charge" else body_color)
			draw_line(pos - to_player * 20.0, pos + to_player * 28.0, C_INK, 6.0)
		"drone":
			draw_circle(pos, 22.0, body_color)
			draw_arc(pos, 29.0, elapsed * 2.0, elapsed * 2.0 + PI * 1.45, 20, C_BLUE, 5.0)
			draw_circle(pos + to_player * 10.0, 5.0, C_WARN)
		"boss":
			var phase := int(e["phase"])
			draw_circle(pos, 66.0, C_INK)
			draw_circle(pos, 53.0, C_RUST if phase >= 3 else (C_WARN if phase == 2 else C_MID))
			for i in range(6):
				var arm := Vector2.from_angle(elapsed * 0.45 + i * TAU / 6.0)
				draw_line(pos + arm * 48.0, pos + arm * 82.0, C_INK, 13.0)
				draw_circle(pos + arm * 84.0, 11.0, C_STEEL)
			draw_circle(pos + to_player * 24.0, 13.0, C_PAPER)
			draw_circle(pos + to_player * 27.0, 6.0, C_RUST)

	if kind != "boss" and hp_ratio < 0.999:
		draw_rect(Rect2(pos.x - 24, pos.y - float(e["radius"]) - 13, 48, 5), Color(0.15,0.16,0.15,0.35), true)
		draw_rect(Rect2(pos.x - 24, pos.y - float(e["radius"]) - 13, 48 * hp_ratio, 5), C_RUST, true)
	elif kind == "boss":
		draw_rect(Rect2(390, 92, 500, 8), Color(0.15,0.16,0.15,0.30), true)
		draw_rect(Rect2(390, 92, 500 * hp_ratio, 8), C_RUST, true)

func _draw_player_bullet(b: Dictionary) -> void:
	var pos: Vector2 = b["pos"]
	var vel: Vector2 = b["vel"]
	var dir := vel.normalized()
	if str(b["kind"]) == "mortar":
		draw_line(pos - dir * 18.0, pos, C_DARK, 7.0)
		draw_circle(pos, 11.0, C_RUST)
		draw_circle(pos, 5.0, C_WARN)
	else:
		draw_line(pos - dir * 24.0, pos, C_RUST, 4.0)
		draw_circle(pos, 6.0, C_PAPER)

func _draw_effect(e: Dictionary) -> void:
	var kind := str(e["kind"])
	var life := float(e["life"])
	var max_life := maxf(0.001, float(e.get("max", life)))
	var t := clampf(life / max_life, 0.0, 1.0)
	var color: Color = e.get("color", C_WARN)
	color.a *= t

	match kind:
		"spark":
			var pos: Vector2 = e["pos"]
			var vel: Vector2 = e["vel"]
			draw_line(pos, pos - vel.normalized() * 12.0 * t, color, 3.0)
		"ring":
			draw_arc(e["pos"], lerpf(68.0, 10.0, t), 0, TAU, 32, color, 4.0)
		"blast":
			draw_circle(e["pos"], lerpf(68.0, 10.0, t), Color(color, 0.22 * t))
			draw_arc(e["pos"], lerpf(82.0, 18.0, t), 0, TAU, 28, color, 5.0)
		"spawn":
			draw_arc(e["pos"], lerpf(18.0, 54.0, 1.0 - t), 0, TAU, 24, color, 4.0)
		"muzzle":
			var dir: Vector2 = e["dir"]
			var side := dir.orthogonal()
			var p: Vector2 = e["pos"]
			var poly := PackedVector2Array([p + dir * 28.0 * t, p + side * 10.0 * t, p - side * 10.0 * t])
			draw_colored_polygon(poly, color)
		"slash":
			var dir: Vector2 = e["dir"]
			var a := dir.angle()
			draw_arc(e["pos"], 64.0, a - 1.0, a + 1.0, 18, color, 11.0 * t)
		"beam":
			draw_line(e["a"], e["b"], color, 8.0 * t)
			draw_line(e["a"], e["b"], Color(C_PAPER, 0.75 * t), 3.0 * t)
		"telegraph":
			var p: Vector2 = e["pos"]
			var d: Vector2 = e["dir"]
			draw_arc(p, 38.0 + (1.0 - t) * 16.0, 0, TAU, 28, color, 4.0)
			draw_line(p, p + d * 120.0, Color(color, 0.38 * t), 4.0)
		"telegraph_line":
			var p: Vector2 = e["pos"]
			var d: Vector2 = e["dir"]
			draw_line(p, p + d * 420.0, Color(color, 0.30 + 0.35 * (1.0 - t)), 8.0 * (1.0 - t) + 2.0)

func _draw_rot_rect(center: Vector2, size: Vector2, angle: float, color: Color) -> void:
	var half := size * 0.5
	var points := PackedVector2Array([
		center + Vector2(-half.x, -half.y).rotated(angle),
		center + Vector2(half.x, -half.y).rotated(angle),
		center + Vector2(half.x, half.y).rotated(angle),
		center + Vector2(-half.x, half.y).rotated(angle)
	])
	draw_colored_polygon(points, color)

func draw_ellipse(center: Vector2, radius: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in range(24):
		var a := float(i) * TAU / 24.0
		points.append(center + Vector2(cos(a) * radius.x, sin(a) * radius.y))
	draw_colored_polygon(points, color)

func _publish_state(state_name: String) -> void:
	PocketWorks.publish_test_state({
		"loadingState": state_name,
		"runtime": "godot",
		"app": "rivet",
		"running": run_active,
		"paused": paused_game,
		"workbenchOpen": workshop_open,
		"room": room,
		"totalRooms": TOTAL_ROOMS,
		"playerHealth": hull,
		"maxHealth": max_hull,
		"playerPosition": {"x": player_pos.x, "y": player_pos.y},
		"enemyCount": enemies.size(),
		"projectileCount": bullets.size() + enemy_bullets.size(),
		"kills": total_kills,
		"weapon": weapon_id,
		"chassis": chassis_id,
		"core": core_id,
		"bestRoom": best_room,
		"bestKills": best_kills,
		"clears": clears
	})

func _on_exit_pressed() -> void:
	PocketWorks.exit_to_launcher()
