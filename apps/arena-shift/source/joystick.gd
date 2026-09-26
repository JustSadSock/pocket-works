extends Control

signal vector_changed(value: Vector2)

var value := Vector2.ZERO
var active_pointer := -1
var center := Vector2.ZERO
var radius := 74.0
var knob_radius := 30.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_process_input(true)
	queue_redraw()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		center = size * 0.5
		radius = min(size.x, size.y) * 0.38
		knob_radius = radius * 0.38
		queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and active_pointer == -1:
			active_pointer = event.index
			_update_value(event.position)
			accept_event()
		elif not event.pressed and event.index == active_pointer:
			active_pointer = -1
			value = Vector2.ZERO
			vector_changed.emit(value)
			queue_redraw()
			accept_event()
	elif event is InputEventScreenDrag and event.index == active_pointer:
		_update_value(event.position)
		accept_event()
	elif event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				active_pointer = 0
				_update_value(event.position)
			else:
				active_pointer = -1
				value = Vector2.ZERO
				vector_changed.emit(value)
				queue_redraw()
			accept_event()
	elif event is InputEventMouseMotion and active_pointer == 0 and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_update_value(event.position)
		accept_event()

func _update_value(local_pos: Vector2) -> void:
	center = size * 0.5
	var delta := local_pos - center
	if delta.length() > radius:
		delta = delta.normalized() * radius
	value = delta / max(radius, 1.0)
	if value.length() < 0.12:
		value = Vector2.ZERO
	vector_changed.emit(value)
	queue_redraw()

func _draw() -> void:
	center = size * 0.5
	draw_circle(center, radius + 8.0, Color(0.18, 0.20, 0.18, 0.18))
	draw_circle(center, radius, Color(0.93, 0.91, 0.85, 0.42))
	draw_arc(center, radius, 0.0, TAU, 64, Color(0.18, 0.20, 0.18, 0.58), 3.0)
	var knob := center + value * radius
	draw_circle(knob, knob_radius + 5.0, Color(0.18, 0.20, 0.18, 0.20))
	draw_circle(knob, knob_radius, Color(0.85, 0.37, 0.23, 0.92))
	draw_arc(knob, knob_radius, 0.0, TAU, 48, Color(0.18, 0.20, 0.18, 0.78), 3.0)
