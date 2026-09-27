extends Control

signal decision(value: int)

var handle_x := 0.0
var dragging := false
var enabled := true
var active_touch := -1
var snap_tween: Tween

const LEFT := Color("#9a5b53")
const RIGHT := Color("#5f8171")
const METAL := Color("#2c3431")
const METAL_EDGE := Color("#716b5e")
const TRACK := Color("#a18f72")
const WOOD := Color("#7c523a")
const WOOD_LIGHT := Color("#a97450")
const GLOW := Color("#dbcaa4")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(500, 154)
	set_process(false)
	queue_redraw()

func set_enabled(value: bool) -> void:
	enabled = value
	if not enabled:
		dragging = false
		_snap_to(0.0)
	queue_redraw()

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
	queue_redraw()

func _end_drag() -> void:
	if not dragging:
		return
	dragging = false
	if handle_x <= -0.58:
		decision.emit(-1)
		_snap_to(-1.0)
	elif handle_x >= 0.58:
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
		snap_tween.tween_interval(0.20)
		snap_tween.tween_method(_set_handle, target, 0.0, 0.25)

func _set_handle(value: float) -> void:
	handle_x = value
	queue_redraw()

func _knob_position() -> Vector2:
	var pivot := Vector2(size.x * 0.5, size.y - 23.0)
	var t := (handle_x + 1.0) * 0.5
	var angle := lerpf(-2.36, -0.78, t)
	return pivot + Vector2(cos(angle), sin(angle)) * 92.0

func _draw() -> void:
	var pivot := Vector2(size.x * 0.5, size.y - 23.0)
	var knob := _knob_position()

	# Heavy iron mounting plate: reads like part of the gate mechanism, not a UI slider.
	var plate := Rect2(Vector2(10, 11), Vector2(size.x - 20, size.y - 16))
	draw_rect(plate, Color("#1b211f"), true)
	draw_rect(Rect2(plate.position + Vector2(3,3), plate.size - Vector2(6,6)), METAL, false, 3.0)
	draw_line(Vector2(28, size.y - 13), Vector2(size.x - 28, size.y - 13), METAL_EDGE.darkened(0.25), 3.0)
	for bolt in [Vector2(28,30), Vector2(size.x-28,30), Vector2(28,size.y-30), Vector2(size.x-28,size.y-30)]:
		draw_circle(bolt, 7.0, Color("#141917"))
		draw_circle(bolt - Vector2(1.5,1.5), 3.8, METAL_EDGE)

	# Brass travel arc and mechanical detents.
	draw_arc(pivot, 92.0, -2.36, -0.78, 36, TRACK.darkened(0.28), 15.0, true)
	draw_arc(pivot, 92.0, -2.36, -0.78, 36, TRACK, 5.0, true)
	for x in [-1.0, 0.0, 1.0]:
		var t := (x + 1.0) * 0.5
		var a := lerpf(-2.36, -0.78, t)
		var p1 := pivot + Vector2(cos(a), sin(a)) * 79.0
		var p2 := pivot + Vector2(cos(a), sin(a)) * 104.0
		draw_line(p1, p2, METAL_EDGE, 5.0, true)

	# Side decision plates.
	var left_center := pivot + Vector2(-115, -46)
	var right_center := pivot + Vector2(115, -46)
	draw_circle(left_center, 23, LEFT.darkened(0.18))
	draw_circle(left_center, 16, LEFT)
	draw_line(left_center + Vector2(-8,-8), left_center + Vector2(8,8), Color("#f2ddd5"), 4.0, true)
	draw_line(left_center + Vector2(8,-8), left_center + Vector2(-8,8), Color("#f2ddd5"), 4.0, true)

	draw_circle(right_center, 23, RIGHT.darkened(0.18))
	draw_circle(right_center, 16, RIGHT)
	draw_line(right_center + Vector2(-8,0), right_center + Vector2(8,0), Color("#d8eee2"), 4.0, true)
	draw_line(right_center + Vector2(3,-6), right_center + Vector2(9,0), Color("#d8eee2"), 4.0, true)
	draw_line(right_center + Vector2(3,6), right_center + Vector2(9,0), Color("#d8eee2"), 4.0, true)

	# Lever arm, pivot and wood handle.
	draw_circle(pivot, 28, Color("#171c1a"))
	draw_circle(pivot, 22, METAL_EDGE.darkened(0.08))
	draw_line(pivot, knob, Color("#151a18"), 22.0, true)
	draw_line(pivot, knob, METAL_EDGE, 10.0, true)
	draw_circle(knob, 34, Color("#2a1b14"))
	draw_circle(knob - Vector2(2,4), 27, WOOD)
	draw_circle(knob - Vector2(7,10), 8, WOOD_LIGHT)

	if enabled:
		var a := absf(handle_x)
		if a > 0.34:
			var signal_color := LEFT if handle_x < 0 else RIGHT
			draw_arc(knob, 41.0, 0, TAU, 32, Color(signal_color, 0.72), 4.0)
		else:
			draw_arc(knob, 40.0, 0, TAU, 32, Color(GLOW, 0.35), 3.0)
	else:
		draw_rect(Rect2(Vector2(12,13), Vector2(size.x-24,size.y-20)), Color(0.04,0.05,0.05,0.22), true)
