extends Control

signal decision(value: int)

var handle_x := 0.0
var dragging := false
var enabled := true
var active_touch := -1
var snap_tween: Tween

var plate: Panel
var arc_line: Line2D
var stem_line: Line2D
var pivot_node: Panel
var knob_node: Panel
var left_stop: Panel
var right_stop: Panel

const LEFT := Color("#9a5b53")
const RIGHT := Color("#5f8171")
const METAL := Color("#2c3431")
const METAL_EDGE := Color("#716b5e")
const TRACK := Color("#a18f72")
const WOOD := Color("#7c523a")
const WOOD_LIGHT := Color("#a97450")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(500, 154)
	_build_visuals()
	_update_visual()

func _style_box(bg: Color, border: Color, border_width: int, radius: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.border_width_left = border_width
	s.border_width_top = border_width
	s.border_width_right = border_width
	s.border_width_bottom = border_width
	s.corner_radius_top_left = radius
	s.corner_radius_top_right = radius
	s.corner_radius_bottom_left = radius
	s.corner_radius_bottom_right = radius
	return s

func _circle_panel(diameter: float, color: Color, border: Color, width: int) -> Panel:
	var p := Panel.new()
	p.size = Vector2(diameter, diameter)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_theme_stylebox_override("panel", _style_box(color, border, width, int(diameter * 0.5)))
	add_child(p)
	return p

func _build_visuals() -> void:
	plate = Panel.new()
	plate.position = Vector2(6, 5)
	plate.size = Vector2(size.x - 12, size.y - 10)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_theme_stylebox_override("panel", _style_box(Color("#1a211e"), METAL_EDGE.darkened(0.08), 3, 8))
	add_child(plate)
	move_child(plate, 0)

	arc_line = Line2D.new()
	arc_line.width = 13.0
	arc_line.default_color = TRACK.darkened(0.10)
	arc_line.antialiased = true
	arc_line.z_index = 2
	arc_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(arc_line)

	stem_line = Line2D.new()
	stem_line.width = 15.0
	stem_line.default_color = METAL_EDGE
	stem_line.antialiased = true
	stem_line.z_index = 4
	stem_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stem_line)

	pivot_node = _circle_panel(48, METAL_EDGE.darkened(0.10), Color("#111613"), 5)
	pivot_node.z_index = 5

	knob_node = _circle_panel(66, WOOD, Color("#2b1b14"), 6)
	knob_node.z_index = 7
	var shine := Panel.new()
	shine.position = Vector2(10, 8)
	shine.size = Vector2(18, 13)
	shine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shine.add_theme_stylebox_override("panel", _style_box(WOOD_LIGHT, WOOD_LIGHT, 0, 8))
	knob_node.add_child(shine)

	left_stop = _circle_panel(42, LEFT, LEFT.darkened(0.25), 5)
	left_stop.z_index = 5
	var lx := Label.new()
	lx.text = "×"
	lx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	lx.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lx.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lx.add_theme_font_size_override("font_size", 25)
	lx.add_theme_color_override("font_color", Color("#f4e3dc"))
	left_stop.add_child(lx)

	right_stop = _circle_panel(42, RIGHT, RIGHT.darkened(0.25), 5)
	right_stop.z_index = 5
	var rx := Label.new()
	rx.text = "→"
	rx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rx.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rx.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rx.add_theme_font_size_override("font_size", 22)
	rx.add_theme_color_override("font_color", Color("#e0f0e7"))
	right_stop.add_child(rx)

	for i in range(4):
		var bolt := _circle_panel(12, Color("#444942"), Color("#111411"), 2)
		bolt.z_index = 3
		var x := 25.0 if i % 2 == 0 else size.x - 37.0
		var y := 22.0 if i < 2 else size.y - 34.0
		bolt.position = Vector2(x, y)

func _pivot() -> Vector2:
	return Vector2(size.x * 0.5, size.y - 25.0)

func _knob_position() -> Vector2:
	var pivot := _pivot()
	var t := (handle_x + 1.0) * 0.5
	var angle := lerpf(-2.36, -0.78, t)
	return pivot + Vector2(cos(angle), sin(angle)) * 88.0

func _update_visual() -> void:
	if plate == null:
		return
	var pivot := _pivot()
	var points := PackedVector2Array()
	for i in range(25):
		var t := float(i) / 24.0
		var a := lerpf(-2.36, -0.78, t)
		points.append(pivot + Vector2(cos(a), sin(a)) * 88.0)
	arc_line.points = points

	var knob := _knob_position()
	stem_line.points = PackedVector2Array([pivot, knob])
	pivot_node.position = pivot - pivot_node.size * 0.5
	knob_node.position = knob - knob_node.size * 0.5
	left_stop.position = pivot + Vector2(-120, -58) - left_stop.size * 0.5
	right_stop.position = pivot + Vector2(120, -58) - right_stop.size * 0.5

	var intensity := absf(handle_x)
	if handle_x < -0.32:
		knob_node.modulate = Color.WHITE.lerp(LEFT.lightened(0.28), intensity * 0.35)
	elif handle_x > 0.32:
		knob_node.modulate = Color.WHITE.lerp(RIGHT.lightened(0.28), intensity * 0.35)
	else:
		knob_node.modulate = Color.WHITE

func set_enabled(value: bool) -> void:
	enabled = value
	if not enabled:
		dragging = false
		_snap_to(0.0)
	modulate.a = 1.0 if value else 0.74

func preview_external(value: float) -> void:
	if not enabled:
		return
	if snap_tween and snap_tween.is_running():
		snap_tween.kill()
	handle_x = clampf(value, -1.0, 1.0)
	_update_visual()

func _gui_input(event: InputEvent) -> void:
	if not enabled:
		return
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed and active_touch == -1:
			active_touch = touch.index
			_begin_drag(touch.position)
		elif not touch.pressed and touch.index == active_touch:
			active_touch = -1
			_end_drag()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if drag.index == active_touch:
			_update_drag(drag.position)
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.button_index == MOUSE_BUTTON_LEFT:
			if mouse.pressed:
				_begin_drag(mouse.position)
			else:
				_end_drag()
	elif event is InputEventMouseMotion and dragging:
		_update_drag((event as InputEventMouseMotion).position)

func _begin_drag(pos: Vector2) -> void:
	if snap_tween and snap_tween.is_running():
		snap_tween.kill()
	dragging = true
	_update_drag(pos)

func _update_drag(pos: Vector2) -> void:
	if not dragging:
		return
	var half := maxf(1.0, size.x * 0.5 - 88.0)
	handle_x = clampf((pos.x - size.x * 0.5) / half, -1.0, 1.0)
	_update_visual()

func _end_drag() -> void:
	if not dragging:
		return
	dragging = false
	if handle_x <= -0.55:
		decision.emit(-1)
		_snap_to(-1.0)
	elif handle_x >= 0.55:
		decision.emit(1)
		_snap_to(1.0)
	else:
		_snap_to(0.0)

func reset() -> void:
	_snap_to(0.0)

func _snap_to(target: float) -> void:
	if snap_tween and snap_tween.is_running():
		snap_tween.kill()
	snap_tween = create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	snap_tween.tween_method(_set_handle, handle_x, target, 0.18 if target == 0.0 else 0.13)
	if target != 0.0:
		snap_tween.tween_interval(0.18)
		snap_tween.tween_method(_set_handle, target, 0.0, 0.24)

func _set_handle(value: float) -> void:
	handle_x = value
	_update_visual()
