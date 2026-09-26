extends Control

signal vector_changed(value: Vector2)

var value := Vector2.ZERO
var pointer_id := -1
var center := Vector2.ZERO
var radius := 76.0
var thumb_radius := 31.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_process_input(true)
	queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and pointer_id == -1:
			pointer_id = event.index
			center = event.position
			_update_value(event.position)
			accept_event()
		elif not event.pressed and event.index == pointer_id:
			_release()
			accept_event()
	elif event is InputEventScreenDrag and event.index == pointer_id:
		_update_value(event.position)
		accept_event()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			pointer_id = -2
			center = event.position
			_update_value(event.position)
		else:
			_release()
		accept_event()
	elif event is InputEventMouseMotion and pointer_id == -2 and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_update_value(event.position)
		accept_event()

func _update_value(position: Vector2) -> void:
	var delta := position - center
	if delta.length() > radius:
		delta = delta.normalized() * radius
	value = delta / radius
	vector_changed.emit(value)
	queue_redraw()

func _release() -> void:
	pointer_id = -1
	value = Vector2.ZERO
	vector_changed.emit(value)
	queue_redraw()

func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not visible:
		_release()

func _draw() -> void:
	var default_center := size * Vector2(0.5, 0.58)
	var base := center if pointer_id != -1 else default_center
	draw_circle(base, radius, Color(0.14, 0.16, 0.15, 0.22))
	draw_arc(base, radius, 0.0, TAU, 48, Color(0.20, 0.22, 0.20, 0.58), 3.0, true)
	var thumb := base + value * radius
	draw_circle(thumb, thumb_radius, Color(0.84, 0.80, 0.72, 0.88))
	draw_arc(thumb, thumb_radius, 0.0, TAU, 32, Color(0.20, 0.22, 0.20, 0.88), 3.0, true)
