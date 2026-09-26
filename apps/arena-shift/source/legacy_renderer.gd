extends Control

var player_pos := Vector2.ZERO
var player_angle := 0.0
var player_health := 100.0
var enemies: Array = []
var effects: Array = []
var arena_radius := 10.0
var attacking := false
var dash_amount := 0.0
var wave := 1
var boss_active := false

const BG := Color("#e7e0d2")
const INK := Color("#30342e")
const GRID := Color(0.19, 0.21, 0.18, 0.12)
const ACCENT := Color("#d95f3b")
const ENEMY := Color("#6b7866")
const BOSS := Color("#8b4637")
const LIGHT := Color("#f7f2e7")

func sync_state(state: Dictionary) -> void:
	player_pos = state.get("player_pos", player_pos)
	player_angle = state.get("player_angle", player_angle)
	player_health = state.get("player_health", player_health)
	enemies = state.get("enemies", enemies)
	effects = state.get("effects", effects)
	attacking = state.get("attacking", false)
	dash_amount = state.get("dash_amount", 0.0)
	wave = state.get("wave", wave)
	boss_active = state.get("boss_active", boss_active)
	queue_redraw()

func _world_to_screen(p: Vector2) -> Vector2:
	var usable := Rect2(Vector2(0, 36), Vector2(size.x, max(size.y - 36, 1.0)))
	var s := min(usable.size.x, usable.size.y) / (arena_radius * 2.55)
	return usable.position + usable.size * 0.5 + Vector2(p.x, p.y) * s

func _scale() -> float:
	return min(size.x, max(size.y - 36, 1.0)) / (arena_radius * 2.55)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), BG)
	var center := _world_to_screen(Vector2.ZERO)
	var scale := _scale()

	for i in range(-10, 11):
		var a := _world_to_screen(Vector2(float(i), -arena_radius))
		var b := _world_to_screen(Vector2(float(i), arena_radius))
		draw_line(a, b, GRID, 1.0)
		var c := _world_to_screen(Vector2(-arena_radius, float(i)))
		var d := _world_to_screen(Vector2(arena_radius, float(i)))
		draw_line(c, d, GRID, 1.0)

	draw_circle(center, arena_radius * scale, Color(0.95, 0.92, 0.85, 0.65))
	draw_arc(center, arena_radius * scale, 0.0, TAU, 96, INK, 4.0)
	draw_arc(center, (arena_radius - 0.65) * scale, 0.0, TAU, 96, Color(0.19,0.21,0.18,0.22), 2.0)

	for effect in effects:
		var ep: Vector2 = effect.get("pos", Vector2.ZERO)
		var life: float = float(effect.get("life", 0.0))
		var kind: String = str(effect.get("kind", "hit"))
		var col := ACCENT if kind != "heal" else Color("#7d9b6e")
		var r := (0.22 + (1.0 - clamp(life,0.0,1.0)) * 0.65) * scale
		draw_arc(_world_to_screen(ep), r, 0.0, TAU, 32, Color(col, clamp(life,0.0,1.0)), 3.0)
		for k in range(5):
			var ang := float(k) * TAU / 5.0 + (1.0 - life) * 0.9
			var p1 := _world_to_screen(ep) + Vector2(cos(ang), sin(ang)) * r * 0.65
			var p2 := _world_to_screen(ep) + Vector2(cos(ang), sin(ang)) * r * 1.15
			draw_line(p1, p2, Color(col, clamp(life,0.0,1.0)), 2.0)

	for enemy in enemies:
		var p: Vector2 = enemy.get("pos", Vector2.ZERO)
		var radius: float = float(enemy.get("radius", 0.55)) * scale
		var hp_ratio: float = float(enemy.get("hp_ratio", 1.0))
		var is_boss: bool = bool(enemy.get("boss", false))
		var flash: float = float(enemy.get("flash", 0.0))
		var sp := _world_to_screen(p)
		var col := BOSS if is_boss else ENEMY
		if flash > 0.0:
			col = LIGHT
		if is_boss:
			var pts := PackedVector2Array()
			for n in range(8):
				var a := float(n) * TAU / 8.0 + PI / 8.0
				pts.append(sp + Vector2(cos(a), sin(a)) * radius)
			draw_colored_polygon(pts, col)
			draw_polyline(PackedVector2Array(Array(pts) + [pts[0]]), INK, 3.0)
		else:
			draw_circle(sp, radius, col)
			draw_arc(sp, radius, 0.0, TAU, 32, INK, 2.5)
			var eye_dir := ( _world_to_screen(player_pos) - sp ).normalized()
			draw_circle(sp + eye_dir * radius * 0.35, max(radius * 0.14, 2.0), LIGHT)
		var bar_w := max(radius * 1.7, 24.0)
		var bar_rect := Rect2(sp + Vector2(-bar_w*0.5, -radius-11.0), Vector2(bar_w, 4.0))
		draw_rect(bar_rect, Color(0.19,0.21,0.18,0.18))
		draw_rect(Rect2(bar_rect.position, Vector2(bar_w * clamp(hp_ratio,0.0,1.0), 4.0)), ACCENT)

	var pp := _world_to_screen(player_pos)
	var forward := Vector2(cos(player_angle), sin(player_angle))
	var side := Vector2(-forward.y, forward.x)
	var body := PackedVector2Array([
		pp + forward * 26.0,
		pp - forward * 17.0 + side * 17.0,
		pp - forward * 10.0,
		pp - forward * 17.0 - side * 17.0
	])
	if dash_amount > 0.01:
		for t in range(1,4):
			var ghost := PackedVector2Array()
			for v in body:
				ghost.append(v - forward * float(t) * 16.0)
			draw_colored_polygon(ghost, Color(0.85,0.37,0.23,0.10 * (4-t)))
	draw_colored_polygon(body, ACCENT)
	draw_polyline(PackedVector2Array(Array(body) + [body[0]]), INK, 3.0)
	draw_circle(pp, 7.0, LIGHT)

	if attacking:
		draw_arc(pp, 50.0, player_angle - 0.8, player_angle + 0.8, 24, ACCENT, 7.0)

	var caption := "CLASSIC VECTOR MODE  •  SAME SIMULATION"
	draw_string(ThemeDB.fallback_font, Vector2(18, 27), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, INK)
	var right_text := "WAVE " + str(wave)
	if boss_active:
		right_text += "  •  BOSS"
	var width := ThemeDB.fallback_font.get_string_size(right_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
	draw_string(ThemeDB.fallback_font, Vector2(size.x - width - 18, 27), right_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, INK)
