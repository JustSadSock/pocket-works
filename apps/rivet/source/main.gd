extends Node2D

const VIEW := Vector2(1280, 720)
const BG := Color("#d6cec0")
const INK := Color("#343935")
const PAPER := Color("#eee7da")
const RUST := Color("#b85c3f")

var running := false
var player_pos := Vector2(640, 390)
var ui_layer: CanvasLayer
var start_overlay: Control
var hud: Control

func _ready() -> void:
	PocketWorks.set_document_title("RIVET")
	_build_ui()
	PocketWorks.publish_test_state({
		"loadingState": "ready",
		"runtime": "godot",
		"app": "rivet",
		"diagnostic": "minimal-boot"
	})
	queue_redraw()

func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	add_child(ui_layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_layer.add_child(root)

	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.visible = false
	root.add_child(hud)

	var pause := Button.new()
	pause.text = "PAUSE"
	pause.position = Vector2(1130, 24)
	pause.size = Vector2(120, 56)
	pause.pressed.connect(_pause)
	hud.add_child(pause)

	start_overlay = Control.new()
	start_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(start_overlay)

	var panel := ColorRect.new()
	panel.position = Vector2(370, 170)
	panel.size = Vector2(540, 370)
	panel.color = PAPER
	start_overlay.add_child(panel)

	var title := Label.new()
	title.text = "RIVET"
	title.position = Vector2(145, 62)
	title.size = Vector2(250, 70)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 52)
	title.add_theme_color_override("font_color", INK)
	panel.add_child(title)

	var copy := Label.new()
	copy.text = "Diagnostic boot — start scene only."
	copy.position = Vector2(80, 145)
	copy.size = Vector2(380, 42)
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy.add_theme_color_override("font_color", INK)
	copy.add_theme_font_size_override("font_size", 18)
	panel.add_child(copy)

	var start := Button.new()
	start.text = "START"
	start.position = Vector2(125, 220)
	start.size = Vector2(290, 62)
	start.pressed.connect(_start)
	panel.add_child(start)

	var exit := Button.new()
	exit.text = "POCKET WORKS"
	exit.position = Vector2(125, 294)
	exit.size = Vector2(290, 52)
	exit.pressed.connect(PocketWorks.exit_to_launcher)
	panel.add_child(exit)

func _start() -> void:
	running = true
	start_overlay.visible = false
	hud.visible = true
	PocketWorks.publish_test_state({
		"loadingState": "running",
		"runtime": "godot",
		"app": "rivet",
		"diagnostic": "minimal-running"
	})

func _pause() -> void:
	running = false
	start_overlay.visible = true
	hud.visible = false

func _process(delta: float) -> void:
	if running:
		player_pos.x = 640.0 + sin(Time.get_ticks_msec() * 0.0018) * 160.0
	queue_redraw()
	void(delta)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, VIEW), BG, true)
	draw_rect(Rect2(100, 110, 1080, 500), Color("#c5bcac"), true)
	draw_rect(Rect2(100, 110, 1080, 500), INK, false, 3.0)
	draw_circle(player_pos, 32.0, RUST)
	draw_circle(player_pos, 14.0, PAPER)

func _on_exit_pressed() -> void:
	PocketWorks.exit_to_launcher()
