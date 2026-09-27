extends Control

signal decision(value: int)

var handle_x := 0.0
var dragging := false
var enabled := true
var active_touch := -1
var snap_tween: Tween

const LEFT := Color("#76514b")
const RIGHT := Color("#526b62")
const METAL := Color("#414846")
const TRACK := Color("#9a8f79")
const WOOD := Color("#8a6248")
const GLOW := Color("#d6c59f")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(520, 150)
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
	var half := max(1.0, size.x * 0.5 - 72.0)
	handle_x = clamp((pos.x - size.x * 0.5) / half, -1.0, 1.0)
	queue_redraw()

func _end_drag() -> void:
	if not dragging:
		return
	dragging = false
	if handle_x <= -0.52:
		decision.emit(-1)
		_snap_to(-1.0)
	elif handle_x >= 0.52:
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
	snap_tween.tween_method(_set_handle, handle_x, target, 0.20 if target == 0.0 else 0.14)
	if target != 0.0:
		snap_tween.tween_interval(0.22)
		snap_tween.tween_method(_set_handle, target, 0.0, 0.24)

func _set_handle(value: float) -> void:
	handle_x = value
	queue_redraw()

func _draw() -> void:
	var center := Vector2(size.x * 0.5, size.y * 0.56)
	var left_x := 62.0
	var right_x := size.x - 62.0
	draw_rect(Rect2(Vector2(left_x, center.y - 12), Vector2(right_x - left_x, 24)), TRACK.darkened(0.30), true)
	draw_rect(Rect2(Vector2(left_x, center.y - 5), Vector2(right_x - left_x, 10)), TRACK, true)

	var left_fill := Rect2(Vector2(left_x, center.y - 5), Vector2(max(0.0, center.x - left_x), 10))
	var right_fill := Rect2(Vector2(center.x, center.y - 5), Vector2(max(0.0, right_x - center.x), 10))
	draw_rect(left_fill, LEFT.darkened(0.12), true)
	draw_rect(right_fill, RIGHT.darkened(0.12), true)

	draw_circle(Vector2(left_x, center.y), 22, LEFT)
	draw_circle(Vector2(right_x, center.y), 22, RIGHT)
	draw_circle(center, 18, METAL.lightened(0.18))

	var half := max(1.0, size.x * 0.5 - 72.0)
	var knob := Vector2(center.x + handle_x * half, center.y - 18)
	var stem_start := center + Vector2(0, 2)
	draw_line(stem_start, knob, METAL, 18.0, true)
	draw_line(stem_start, knob, METAL.lightened(0.18), 7.0, true)
	draw_circle(knob, 31, WOOD.darkened(0.18))
	draw_circle(knob - Vector2(3, 5), 24, WOOD)
	draw_circle(knob - Vector2(8, 10), 6, WOOD.lightened(0.22))

	if enabled:
		var a := abs(handle_x)
		if a > 0.30:
			var signal_color := LEFT if handle_x < 0 else RIGHT
			draw_circle(knob, 38 + a * 4.0, Color(signal_color, 0.18), false, 5.0)
		else:
			draw_circle(knob, 38, Color(GLOW, 0.12), false, 3.0)
	else:
		draw_rect(Rect2(Vector2(left_x, center.y - 5), Vector2(right_x - left_x, 10)), Color(0.2,0.22,0.21,0.45), true)
