extends Node

const WORLD_SCRIPT := preload("res://source/world_builder.gd")
const LEVER_SCRIPT := preload("res://source/lever.gd")

const TOTAL_DAYS := 60
const VISITORS_PER_DAY := 3

const C_UI := Color("#202824")
const C_UI_2 := Color("#6f685b")
const C_TEXT := Color("#f5eddc")
const C_MUTED := Color("#d2c8b5")
const C_RUST := Color("#9c543d")
const C_GREEN := Color("#79a18d")
const C_RED := Color("#b26c62")
const C_SAND := Color("#ddcba7")

const VISITORS := [
	{
		"id":"refugees", "name":"Мирослава", "role":"семья беженцев",
		"line":"Мы из Бобровки. Дома сгорели. Нас девять. Пустите — будем работать.",
		"accept":{"population":9,"food":-8,"trust":5,"disease":4},
		"reject":{"trust":-5,"crime":2},
		"accept_result":"Девятерых записали и выдали им пайки на вечер.",
		"reject_result":"Семью не пропустили. Они ушли вдоль реки.",
		"accept_later":{"delay":4,"text":"Трое из беженцев устроились к плотнику. Поселение получило новые рабочие руки.","effects":{"trade":3,"food":2}}
	},
	{
		"id":"blacksmith", "name":"Остап", "role":"кузнец",
		"line":"Кузницу забрали за долги. Дайте сарай — буду чинить инструмент и оружие.",
		"accept":{"money":-8,"trade":4,"guard":2,"has_forge":1},
		"reject":{"trust":-1},
		"accept_result":"Остап занял пустой сарай у стены. Кузница начала работу.",
		"reject_result":"Остап забрал инструменты и ушёл на восток."
	},
	{
		"id":"grain", "name":"Борис", "role":"зерновой купец",
		"line":"Двадцать мешков ржи. Четырнадцать монет. Дешевле в ближайшие дни не будет.",
		"accept":{"money":-14,"food":28,"trade":2},
		"reject":{"food":-1},
		"accept_result":"Рожь приняли на склад. Купцу заплатили четырнадцать монет.",
		"reject_result":"Сделка не состоялась. Караван поехал дальше."
	},
	{
		"id":"deserter", "name":"Левко", "role":"дезертир",
		"line":"Служил у князя Орлика. Ушёл вчера. Возьмёте в стражу — останусь.",
		"accept":{"guard":2,"trust":-2,"crime":3},
		"reject":{"guard":-1,"trust":1},
		"accept_result":"Левко приняли на службу и выдали копьё.",
		"reject_result":"Левко получил отказ и вернулся на тракт.",
		"accept_later":{"delay":6,"text":"Левко пропал ночью. Вместе с ним исчезли два арбалета.","effects":{"guard":-1,"crime":4}}
	},
	{
		"id":"healer", "name":"Агнесса", "role":"лекарь",
		"line":"Нужна комната и чистая вода. Я лекарь. Плату беру только за работу.",
		"accept":{"money":-6,"disease":-9,"trust":4},
		"reject":{"disease":3,"trust":-2},
		"accept_result":"Агнессе выделили комнату у склада. Она открыла приём.",
		"reject_result":"Агнесса ушла в город ниже по реке."
	},
	{
		"id":"taxman", "name":"Королевский сборщик", "role":"чиновник",
		"line":"По указу: десять монет и двое людей в обоз. Вот печать.",
		"accept":{"money":-10,"population":-2,"trust":-2},
		"reject":{"money":4,"guard":-1,"trust":2},
		"accept_result":"Сбор уплачен. Двоих жителей забрали с обозом.",
		"reject_result":"Сборщику отказали. Он записал имя заставы и уехал.",
		"reject_later":{"delay":5,"text":"Пришёл королевский штраф за отказ сборщику.","effects":{"money":-9,"trade":-2}}
	},
	{
		"id":"smugglers", "name":"Двое лодочников", "role":"контрабандисты",
		"line":"В лодке ничего интересного. Пять монет — и вы её не досматриваете.",
		"accept":{"money":5,"crime":7,"trust":-2},
		"reject":{"crime":-2,"trade":-1},
		"accept_result":"Пять монет приняли. Лодку пропустили без досмотра.",
		"reject_result":"Лодку развернули и отправили обратно вниз по реке."
	},
	{
		"id":"mason", "name":"Яромир", "role":"каменщик",
		"line":"На восточной башне пошла трещина. За одиннадцать монет укреплю кладку.",
		"accept":{"money":-11,"guard":3,"trust":2},
		"reject":{"money":2},
		"accept_result":"Яромир начал ремонт башни.",
		"reject_result":"От ремонта отказались. Яромир ушёл."
	},
	{
		"id":"engineer", "name":"Марк", "role":"мостовой мастер",
		"line":"Противовес собран плохо. За девять монет переделаю — мост будет ходить быстрее.",
		"accept":{"money":-9,"trade":4,"guard":1},
		"reject":{"trade":-1},
		"accept_result":"Марк взялся за подъёмный механизм.",
		"reject_result":"Ремонт отложен. Старый механизм остался как есть."
	},
	{
		"id":"mercenaries", "name":"Сотник Радан", "role":"наёмники",
		"line":"Шесть бойцов. Шестнадцать монет за службу. Работаем неделю.",
		"accept":{"money":-16,"guard":7,"trust":-1},
		"reject":{"guard":-1,"crime":2},
		"accept_result":"Шестерых наёмников поставили в караулы.",
		"reject_result":"Радан получил отказ и увёл людей."
	},
	{
		"id":"monks", "name":"Брат Павел", "role":"монахи",
		"line":"Нас двенадцать. Нужны ночлег и хлеб. Есть лекарства и сушёные травы.",
		"accept":{"food":-5,"trust":5,"disease":-3},
		"reject":{"trust":-3},
		"accept_result":"Монахов разместили во дворе. Травы передали лекарю.",
		"reject_result":"Монахам отказали в ночлеге. Они продолжили путь."
	},
	{
		"id":"sick_family", "name":"Катерина", "role":"больная семья",
		"line":"У мальчика жар третий день. До города не дойдём. Пустите хотя бы до утра.",
		"accept":{"population":4,"trust":6,"disease":12},
		"reject":{"trust":-7,"disease":-1},
		"accept_result":"Семью пропустили и отвели в отдельный дом.",
		"reject_result":"Семью не пропустили. Они ушли к северной дороге.",
		"accept_later":{"delay":3,"text":"Болезнь у мальчика оказалась заразной. В лазарете появились новые больные.","effects":{"disease":7,"food":-4}}
	},
	{
		"id":"envoy", "name":"Эдвард", "role":"королевский посланник",
		"line":"Королевская почта. Я не стою в очереди и груз не открываю.",
		"accept":{"trust":-1,"trade":3},
		"reject":{"trust":3,"money":-3},
		"accept_result":"Посланника пропустили без досмотра.",
		"reject_result":"Обоз досмотрели. Запрещённого груза не нашли."
	},
	{
		"id":"ferryman", "name":"Сава", "role":"паромщик",
		"line":"Хочу поставить паром ниже моста. Четыре монеты за лицензию и доля с перевозок.",
		"accept":{"money":-4,"trade":7,"trust":3},
		"reject":{"trade":-2},
		"accept_result":"Саве выдали лицензию на паром.",
		"reject_result":"В лицензии отказали. Сава ушёл искать другой участок."
	},
	{
		"id":"orphans", "name":"Старшая девочка", "role":"четверо сирот",
		"line":"Нас четверо. Старшему четырнадцать. Нужны место и еда.",
		"accept":{"population":4,"food":-5,"trust":6},
		"reject":{"trust":-8,"crime":2},
		"accept_result":"Детей разместили у семей в поселении.",
		"reject_result":"Детям отказали. Они ушли вместе с караваном."
	},
	{
		"id":"hunter", "name":"Тихон", "role":"охотник",
		"line":"Две туши, шкуры и соль. Семь монет за всё.",
		"accept":{"money":-7,"food":16,"trade":2},
		"reject":{"food":-1},
		"accept_result":"Товар Тихона купили и разгрузили на рынке.",
		"reject_result":"Тихон поехал продавать товар в город."
	},
	{
		"id":"guild", "name":"Гильдейский мастер", "role":"торговый союз",
		"line":"Снизьте пошлину до конца сезона. Взамен гильдия поведёт караваны через ваш мост.",
		"accept":{"money":-6,"trade":10,"trust":2},
		"reject":{"money":5,"trade":-5},
		"accept_result":"Пошлину снизили. Гильдия включила заставу в свой маршрут.",
		"reject_result":"Условия гильдии отклонили."
	},
	{
		"id":"prisoner", "name":"Страж из уезда", "role":"конвой с пленником",
		"line":"Поймали разбойника. До суда сутки пути. Оставьте его у себя до утра.",
		"accept":{"guard":-1,"crime":4,"money":3},
		"reject":{"trust":1},
		"accept_result":"Пленника заперли в кладовой под башней.",
		"reject_result":"Конвою отказали. Они продолжили путь.",
		"accept_later":{"delay":2,"text":"Пленник ночью разобрал часть крыши и сбежал.","effects":{"crime":5,"food":-3}}
	},
	{
		"id":"brewer", "name":"Ганна", "role":"пивовар",
		"line":"Есть оборудование и дрожжи. Дайте помещение и семь мешков зерна — открою пивоварню.",
		"accept":{"food":-7,"population":2,"trade":6,"trust":3},
		"reject":{"trade":-1},
		"accept_result":"Ганне выделили помещение. Пивоварня начала работу.",
		"reject_result":"Ганна получила отказ и уехала."
	},
	{
		"id":"scribe", "name":"Иларион", "role":"писарь",
		"line":"Веду счета и реестры. Пять монет и питание — наведу порядок в книгах.",
		"accept":{"money":-5,"food":-2,"trade":3,"crime":-3},
		"reject":{"crime":1},
		"accept_result":"Иларион принял книги заставы и начал перепись.",
		"reject_result":"Иларион получил отказ и ушёл."
	},
	{
		"id":"militia", "name":"Сельский староста", "role":"ополченцы",
		"line":"Двенадцать мужчин готовы в караул. Условие одно: их семьи селятся за стеной.",
		"accept":{"population":12,"food":-10,"guard":5,"trust":4},
		"reject":{"guard":-2,"trust":-3},
		"accept_result":"Ополченцев и семьи поселили внутри стены.",
		"reject_result":"Староста получил отказ. Ополчение вернулось домой."
	},
	{
		"id":"noble", "name":"Барон Рутгер", "role":"дворянин с охотой",
		"line":"Откройте сейчас и без досмотра. За задержку платить не собираюсь.",
		"accept":{"money":9,"trust":-4,"food":-2},
		"reject":{"trust":3,"trade":-2},
		"accept_result":"Барона пропустили вне очереди. Он оставил плату.",
		"reject_result":"Барону отказали в особом порядке. Он уехал недовольным."
	},
	{
		"id":"firewood", "name":"Дровосеки", "role":"лесная артель",
		"line":"Пустите артель в нижний лес. Половина заготовленных дров останется заставе.",
		"accept":{"food":5,"trade":4,"trust":1},
		"reject":{"trade":-2},
		"accept_result":"Дровосекам открыли проход. Первый воз вернулся к вечеру.",
		"reject_result":"Артели отказали в проходе."
	},
	{
		"id":"serfs", "name":"Пятнадцать беглецов", "role":"беглые крестьяне",
		"line":"Мы ушли от барона Крестича. Нас пятнадцать. Если впустите — останемся.",
		"accept":{"population":15,"food":-11,"trust":8,"trade":2},
		"reject":{"trust":-6},
		"accept_result":"Беглецов впустили и распределили по пустующим домам.",
		"reject_result":"Беглецам отказали. Они ушли к северному лесу.",
		"accept_later":{"delay":5,"text":"Барон Крестич прислал требование заплатить за беглых крестьян.","effects":{"money":-8,"trust":2}}
	},
	{
		"id":"doctor", "name":"Доктор Вейс", "role":"чумной лекарь",
		"line":"Я врач. Работаю с заразными больными. Двенадцать монет за сезон.",
		"accept":{"money":-12,"disease":-14,"trust":1},
		"reject":{"disease":2},
		"accept_result":"Вейса наняли. Он принял лазарет и ввёл карантинные правила.",
		"reject_result":"Вейса не наняли. Он уехал в город."
	},
	{
		"id":"salt", "name":"Мара", "role":"соляной торговец",
		"line":"Шесть мешков соли. Девять монет. Больше у меня нет.",
		"accept":{"money":-9,"food":18,"trade":3},
		"reject":{"food":-2},
		"accept_result":"Соль купили и убрали на склад.",
		"reject_result":"Соль не купили. Мара уехала дальше."
	},
	{
		"id":"veterans", "name":"Старший десятник", "role":"ветераны",
		"line":"Пятеро ветеранов ищут постоянную службу. Нужны еда и место в казарме.",
		"accept":{"guard":5,"food":-5,"trust":2},
		"reject":{"guard":-1,"crime":2},
		"accept_result":"Ветеранов приняли в гарнизон.",
		"reject_result":"Ветеранам отказали. Они ушли в город."
	},
	{
		"id":"pilgrims", "name":"Паломники", "role":"дорожная процессия",
		"line":"Нас двадцать. Просим место на одну ночь и немного хлеба.",
		"accept":{"food":-8,"trust":5,"trade":2},
		"reject":{"trust":-3},
		"accept_result":"Паломников разместили во дворе до утра.",
		"reject_result":"Паломникам отказали. Они поставили лагерь за рекой."
	}
]

const STORY := {
	8: "envoy",
	15: "sick_family",
	22: "guild",
	30: "taxman",
	38: "militia",
	46: "doctor",
	54: "veterans"
}

var rng := RandomNumberGenerator.new()
var world
var state: Dictionary = {}
var current_visitor: Dictionary = {}
var recent_ids: Array[String] = []
var outcome_queue: Array = []
var decision_locked := true
var paused_game := false
var campaign_over := false
var sound_enabled := true

var ui_layer: CanvasLayer
var hud: Control
var day_label: Label
var money_label: Label
var food_label: Label
var people_label: Label
var guard_label: Label
var trust_label: Label
var weather_label: Label
var condition_label: Label
var version_label: Label
var result_panel: PanelContainer
var visitor_panel: PanelContainer
var visitor_name: Label
var visitor_role: Label
var visitor_line: Label
var result_hint: Label
var lever
var start_overlay: Control
var pause_overlay: Control
var confirm_overlay: Control
var end_overlay: Control
var continue_button: Button
var sound_button: Button
var end_title: Label
var end_copy: Label
var pause_button: Button
var world_boot_ready := false
var continue_ready_text := "НАЧАТЬ СМЕНУ"
var fallback_lever_dragging := false
var fallback_lever_touch := -1
var fallback_lever_x := 0.0

func _ready() -> void:
	Engine.max_fps = 60
	PocketWorks.set_boot_stage("ready-enter")
	PocketWorks.set_document_title("ЗАСТАВА")
	sound_enabled = bool(PocketWorks.storage_get("sound", true))

	# Build the menu before the 3D world. This lets the first Web frame land fast
	# enough for mobile Chromium to dismiss Godot's engine splash.
	_build_ui()
	_load_or_prepare()
	continue_button.disabled = true
	continue_button.text = "ПОДГОТОВКА ЗАСТАВЫ…"

	world = WORLD_SCRIPT.new()
	add_child(world)
	world.boot_completed.connect(_on_world_boot_completed)

	PocketWorks.set_boot_stage("menu-visible")
	_publish_state("menu")
	call_deferred("_begin_world_boot")

func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	ui_layer.layer = 20
	add_child(ui_layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_layer.add_child(root)

	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(hud)

	# Keep the resource band below the iOS safe area. Opaque by design: no scene blur
	# or low-contrast text can leak through it.
	var top := PanelContainer.new()
	top.position = Vector2(18, 170)
	top.size = Vector2(549, 112)
	top.add_theme_stylebox_override("panel", _panel_style(Color("#1c2421"), Color("#786f5e"), 2))
	hud.add_child(top)
	var top_box := VBoxContainer.new()
	top_box.add_theme_constant_override("separation", 6)
	top.add_child(top_box)
	var top_row := HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 8)
	top_box.add_child(top_row)
	day_label = _label("ДЕНЬ 1 / 60", 18, C_TEXT)
	day_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(day_label)
	condition_label = _label("", 12, C_SAND)
	condition_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	condition_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(condition_label)
	weather_label = _label("ЯСНО", 12, C_MUTED)
	weather_label.custom_minimum_size = Vector2(62, 0)
	weather_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	top_row.add_child(weather_label)
	version_label = _label("v1.2.0", 10, Color(C_MUTED, 0.68))
	version_label.custom_minimum_size = Vector2(48, 0)
	version_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	top_row.add_child(version_label)
	pause_button = Button.new()
	pause_button.text = "II"
	pause_button.custom_minimum_size = Vector2(46, 34)
	_style_button(pause_button, false)
	pause_button.pressed.connect(_pause)
	top_row.add_child(pause_button)

	var stats := HBoxContainer.new()
	stats.add_theme_constant_override("separation", 2)
	top_box.add_child(stats)
	money_label = _stat(stats, "КАЗНА", "40")
	food_label = _stat(stats, "ЕДА", "70")
	people_label = _stat(stats, "ЛЮДИ", "18")
	guard_label = _stat(stats, "СТРАЖА", "6")
	trust_label = _stat(stats, "ДОВЕРИЕ", "55")

	result_panel = PanelContainer.new()
	result_panel.position = Vector2(50, 746)
	result_panel.size = Vector2(485, 62)
	result_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	result_panel.add_theme_stylebox_override("panel", _panel_style(Color(0,0,0,0), Color(0,0,0,0), 0))
	result_panel.modulate.a = 0.0
	hud.add_child(result_panel)
	result_hint = Label.new()
	result_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	result_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result_hint.add_theme_font_size_override("font_size", 16)
	result_hint.add_theme_color_override("font_color", C_TEXT)
	result_hint.add_theme_constant_override("outline_size", 3)
	result_hint.add_theme_color_override("font_outline_color", Color("#101411"))
	result_panel.add_child(result_hint)

	visitor_panel = PanelContainer.new()
	visitor_panel.position = Vector2(26, 814)
	visitor_panel.size = Vector2(533, 182)
	visitor_panel.add_theme_stylebox_override("panel", _panel_style(Color("#28322d"), Color("#817765"), 2))
	hud.add_child(visitor_panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 22)
	margin.add_theme_constant_override("margin_right", 22)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	visitor_panel.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	margin.add_child(box)
	visitor_name = _label("—", 26, C_TEXT)
	visitor_name.add_theme_constant_override("outline_size", 2)
	visitor_name.add_theme_color_override("font_outline_color", Color("#0d100f"))
	box.add_child(visitor_name)
	visitor_role = _label("ОЖИДАНИЕ У ВОРОТ", 13, C_SAND)
	box.add_child(visitor_role)
	var divider := HSeparator.new()
	divider.add_theme_constant_override("separation", 6)
	box.add_child(divider)
	visitor_line = _label("...", 19, C_TEXT)
	visitor_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	visitor_line.size_flags_vertical = Control.SIZE_EXPAND_FILL
	visitor_line.add_theme_constant_override("outline_size", 1)
	visitor_line.add_theme_color_override("font_outline_color", Color("#0d100f"))
	box.add_child(visitor_line)

	var choice_row := HBoxContainer.new()
	choice_row.position = Vector2(46, 1002)
	choice_row.size = Vector2(493, 28)
	hud.add_child(choice_row)
	var reject := _label("ЗАКРЫТЬ", 14, Color("#e2a49a"))
	reject.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	choice_row.add_child(reject)
	var accept := _label("ПРОПУСТИТЬ", 14, Color("#a9d8c0"))
	accept.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	accept.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	choice_row.add_child(accept)

	lever = LEVER_SCRIPT.new()
	lever.position = Vector2(42, 1024)
	lever.size = Vector2(501, 154)
	lever.decision.connect(_on_decision)
	hud.add_child(lever)

	var footer := Label.new()
	footer.text = "Потяни рукоять к нужному упору"
	footer.position = Vector2(112, 1182)
	footer.size = Vector2(361, 30)
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.add_theme_font_size_override("font_size", 13)
	footer.add_theme_color_override("font_color", Color(C_TEXT, 0.78))
	footer.add_theme_constant_override("outline_size", 2)
	footer.add_theme_color_override("font_outline_color", Color("#202421"))
	hud.add_child(footer)

	start_overlay = _overlay(root)
	var start_box := _overlay_box(start_overlay, Vector2(500, 505))
	start_box.add_child(_title("ЗАСТАВА", 46))
	var copy := _label("Продержи мост 60 дней. Люди, деньги, еда и гарнизон меняются от каждого решения.", 19, C_TEXT)
	copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	start_box.add_child(copy)
	var rule := _label("Слушай, кто пришёл. Решай у ворот. Последствия могут вернуться через несколько дней.", 16, C_SAND)
	rule.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rule.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	start_box.add_child(rule)
	start_box.add_child(_spacer(10))
	continue_button = _action_button("НАЧАТЬ СМЕНУ", true)
	continue_button.pressed.connect(_start_or_continue)
	start_box.add_child(continue_button)
	var new_game := _action_button("НОВАЯ КАМПАНИЯ", false)
	new_game.pressed.connect(_confirm_new_game)
	start_box.add_child(new_game)
	var exit := _action_button("POCKET WORKS", false)
	exit.pressed.connect(PocketWorks.exit_to_launcher)
	start_box.add_child(exit)

	pause_overlay = _overlay(root)
	pause_overlay.visible = false
	var pause_box := _overlay_box(pause_overlay, Vector2(430, 420))
	pause_box.add_child(_title("ПАУЗА", 30))
	var resume := _action_button("ПРОДОЛЖИТЬ", true)
	resume.pressed.connect(_resume)
	pause_box.add_child(resume)
	sound_button = _action_button("ЗВУК: ВКЛ" if sound_enabled else "ЗВУК: ВЫКЛ", false)
	sound_button.pressed.connect(_toggle_sound)
	pause_box.add_child(sound_button)
	var restart := _action_button("НАЧАТЬ ЗАНОВО", false)
	restart.pressed.connect(_confirm_new_game)
	pause_box.add_child(restart)
	var pause_exit := _action_button("POCKET WORKS", false)
	pause_exit.pressed.connect(PocketWorks.exit_to_launcher)
	pause_box.add_child(pause_exit)

	confirm_overlay = _overlay(root)
	confirm_overlay.visible = false
	var confirm_box := _overlay_box(confirm_overlay, Vector2(440, 330))
	confirm_box.add_child(_title("СБРОСИТЬ КАМПАНИЮ?", 28))
	var confirm_copy := _label("Текущее прохождение будет удалено.", 17, C_MUTED)
	confirm_copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	confirm_box.add_child(confirm_copy)
	var confirm_yes := _action_button("СБРОСИТЬ", true)
	confirm_yes.pressed.connect(_new_game)
	confirm_box.add_child(confirm_yes)
	var confirm_no := _action_button("ОТМЕНА", false)
	confirm_no.pressed.connect(func(): confirm_overlay.visible = false)
	confirm_box.add_child(confirm_no)

	end_overlay = _overlay(root)
	end_overlay.visible = false
	var end_box := _overlay_box(end_overlay, Vector2(490, 500))
	end_title = _title("СЕЗОН ОКОНЧЕН", 36)
	end_box.add_child(end_title)
	end_copy = _label("", 18, C_TEXT)
	end_copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	end_copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	end_box.add_child(end_copy)
	var again := _action_button("НОВАЯ КАМПАНИЯ", true)
	again.pressed.connect(_new_game)
	end_box.add_child(again)
	var end_exit := _action_button("POCKET WORKS", false)
	end_exit.pressed.connect(PocketWorks.exit_to_launcher)
	end_box.add_child(end_exit)

func _load_or_prepare() -> void:
	var saved = PocketWorks.storage_get("campaign", null)
	if saved is Dictionary and int(saved.get("version", 0)) == 1:
		state = saved
		rng.state = int(state.get("rng_state", 1))
		if not state.has("condition"):
			state["condition"] = "ordinary"
		if not state.has("weather_days_left"):
			state["weather_days_left"] = 2
		if not state.has("visual_time"):
			state["visual_time"] = 0.38
		continue_ready_text = "ПРОДОЛЖИТЬ · ДЕНЬ %d" % int(state.get("day", 1))
	else:
		_reset_state()
		continue_ready_text = "НАЧАТЬ СМЕНУ"
	continue_button.text = continue_ready_text
	hud.visible = false
	start_overlay.visible = true

func _begin_world_boot() -> void:
	# Yield once so the menu is actually painted before any mesh creation begins.
	await get_tree().process_frame
	PocketWorks.set_boot_stage("world-boot-start")
	world.finish_boot(state, String(state.get("weather", "clear")))

func _on_world_boot_completed() -> void:
	world_boot_ready = true
	continue_button.disabled = false
	continue_button.text = continue_ready_text
	world.set_state(state)
	world.set_weather(String(state.get("weather", "clear")))
	world.set_time(float(state.get("visual_time", 0.38)))
	PocketWorks.set_boot_stage("ready")
	_publish_state("ready")

func _reset_state() -> void:
	rng.seed = int(Time.get_unix_time_from_system()) ^ 0x5A57A
	var conditions := ["lean_year", "busy_road", "border_fear"]
	var condition: String = conditions[rng.randi_range(0, conditions.size() - 1)]
	state = {
		"version":1,
		"day":1,
		"money":40,
		"food":70,
		"population":18,
		"guard":6,
		"trust":55,
		"trade":8,
		"disease":2,
		"crime":2,
		"has_forge":false,
		"visitors_today":0,
		"scheduled":[],
		"weather":"clear",
		"weather_days_left":3,
		"visual_time":0.38,
		"condition":condition,
		"rng_state":rng.state
	}
	recent_ids.clear()
	outcome_queue.clear()
	campaign_over = false
	_save()

func _start_or_continue() -> void:
	if not world_boot_ready:
		return
	start_overlay.visible = false
	hud.visible = true
	paused_game = false
	world.set_state(state)
	_begin_day_if_needed()
	_show_next()
	call_deferred("_activate_live_presentation")

func _activate_live_presentation() -> void:
	if not world_boot_ready:
		return
	await get_tree().process_frame
	world.activate_live_scene(state)
	PocketWorks.set_ambience(sound_enabled, String(state.get("weather", "clear")), int(state.get("population", 18)))

func _confirm_new_game() -> void:
	confirm_overlay.visible = true

func _new_game() -> void:
	_reset_state()
	continue_ready_text = "НАЧАТЬ СМЕНУ"
	confirm_overlay.visible = false
	end_overlay.visible = false
	pause_overlay.visible = false
	if not world_boot_ready:
		start_overlay.visible = true
		hud.visible = false
		continue_button.disabled = true
		continue_button.text = "ПОДГОТОВКА ЗАСТАВЫ…"
		return
	start_overlay.visible = false
	hud.visible = true
	world.set_state(state)
	_begin_day_if_needed()
	_show_next()
	call_deferred("_activate_live_presentation")

func _begin_day_if_needed() -> void:
	if int(state.get("visitors_today", 0)) != 0:
		_refresh_hud()
		return
	var day := int(state["day"])
	var weather := _advance_weather(day)
	world.transition_weather(weather, 2.6)
	PocketWorks.set_ambience(sound_enabled, weather, int(state.get("population", 18)))
	_process_scheduled()
	_daily_background(day)
	_refresh_hud()
	_save()

func _advance_weather(day: int) -> String:
	var current := String(state.get("weather", "clear"))
	var days_left := int(state.get("weather_days_left", 0))
	if days_left > 0:
		state["weather_days_left"] = days_left - 1
		return current

	var roll := rng.randf()
	var next_weather := "clear"
	if day > 42 and roll < 0.18:
		next_weather = "snow"
	elif roll < 0.40:
		next_weather = "rain"
	else:
		next_weather = "clear"

	state["weather"] = next_weather
	state["weather_days_left"] = rng.randi_range(2, 4)
	return next_weather

func _show_next() -> void:
	if campaign_over or paused_game:
		return
	if not outcome_queue.is_empty():
		var item: Dictionary = outcome_queue.pop_front()
		_show_consequence(item)
		return
	if _is_failed():
		_finish(false)
		return
	if int(state["day"]) > TOTAL_DAYS:
		_finish(true)
		return
	if int(state["visitors_today"]) >= VISITORS_PER_DAY:
		_end_day()
		return
	current_visitor = _pick_visitor()
	visitor_name.text = String(current_visitor["name"])
	visitor_role.text = String(current_visitor["role"]).to_upper()
	visitor_role.add_theme_color_override("font_color", C_SAND)
	visitor_line.text = "«" + String(current_visitor["line"]) + "»"
	decision_locked = false
	lever.set_enabled(true)
	lever.reset()
	var variant := rng.randi_range(0, 11)
	world.spawn_visitor(current_visitor, variant)
	var visual_time := fposmod(float(state.get("visual_time", 0.38)) + 0.018, 1.0)
	state["visual_time"] = visual_time
	world.transition_time(visual_time, 1.15)
	_publish_state("awaiting_decision")

func _pick_visitor() -> Dictionary:
	var day := int(state["day"])
	if int(state["visitors_today"]) == 1 and STORY.has(day):
		var story_id := String(STORY[day])
		for v in VISITORS:
			if String(v["id"]) == story_id:
				return v.duplicate(true)
	var candidates: Array = []
	for v in VISITORS:
		if recent_ids.has(String(v["id"])):
			continue
		if String(v["id"]) == "blacksmith" and bool(state.get("has_forge", false)):
			continue
		if String(v["id"]) == "doctor" and day < 28:
			continue
		if String(v["id"]) == "veterans" and day < 34:
			continue
		if String(v["id"]) == "guild" and int(state.get("trade", 0)) < 12:
			continue
		candidates.append(v)
	if candidates.is_empty():
		candidates = VISITORS.duplicate()
	var chosen: Dictionary = candidates[rng.randi_range(0, candidates.size() - 1)].duplicate(true)
	recent_ids.append(String(chosen["id"]))
	if recent_ids.size() > 5:
		recent_ids.pop_front()
	return chosen

func _on_decision(value: int) -> void:
	if decision_locked or paused_game or current_visitor.is_empty():
		return
	decision_locked = true
	lever.set_enabled(false)
	var accepted := value > 0
	if sound_enabled:
		PocketWorks.play_sfx("lever", 1.08 if accepted else 0.86)
		PocketWorks.haptic(20)
	if sound_enabled:
		PocketWorks.play_sfx("gate", 1.04 if accepted else 0.90)
	if world.visitor_flow_finished.is_connected(_on_visitor_flow_finished):
		world.visitor_flow_finished.disconnect(_on_visitor_flow_finished)
	world.visitor_flow_finished.connect(_on_visitor_flow_finished, CONNECT_ONE_SHOT)
	world.resolve_visitor(accepted)

	var key := "accept" if accepted else "reject"
	_apply_effects(current_visitor.get(key, {}))
	var later_key := key + "_later"
	if current_visitor.has(later_key):
		var later: Dictionary = current_visitor[later_key].duplicate(true)
		var due := int(state["day"]) + int(later.get("delay", 2))
		var scheduled: Array = state["scheduled"]
		scheduled.append({"due":due,"text":later.get("text","Последствие решения."),"effects":later.get("effects",{})})
		state["scheduled"] = scheduled
	var result_key := key + "_result"
	var result_text := String(current_visitor.get(result_key, "Решение принято."))
	var summary := _effect_summary(current_visitor.get(key, {}))
	if not summary.is_empty():
		result_text += "\n" + summary
	visitor_role.text = "ПРОПУЩЕН" if accepted else "ОТКАЗАНО"
	visitor_role.add_theme_color_override("font_color", C_GREEN.lightened(0.18) if accepted else C_RED.lightened(0.18))
	visitor_line.text = result_text
	_flash(result_text, C_GREEN if accepted else C_RED)
	state["visitors_today"] = int(state["visitors_today"]) + 1
	state["rng_state"] = rng.state
	world.set_state(state)
	_refresh_hud()
	current_visitor = {}
	_save()
	_publish_state("resolved")

func _on_visitor_flow_finished() -> void:
	if campaign_over or paused_game:
		return
	var timer := get_tree().create_timer(0.22)
	timer.timeout.connect(_show_next)

func _apply_effects(effects: Dictionary) -> void:
	for key in effects.keys():
		if key == "has_forge":
			state["has_forge"] = int(effects[key]) > 0
			continue
		if not state.has(key):
			continue
		state[key] = int(state[key]) + int(effects[key])
	state["money"] = maxi(-99, int(state["money"]))
	state["food"] = maxi(0, int(state["food"]))
	state["population"] = maxi(0, int(state["population"]))
	state["guard"] = maxi(0, int(state["guard"]))
	state["trust"] = clampi(int(state["trust"]), 0, 100)
	state["trade"] = clampi(int(state["trade"]), 0, 100)
	state["disease"] = clampi(int(state["disease"]), 0, 100)
	state["crime"] = clampi(int(state["crime"]), 0, 100)

func _process_scheduled() -> void:
	var remaining: Array = []
	for entry in state.get("scheduled", []):
		if int(entry.get("due", 9999)) <= int(state["day"]):
			_apply_effects(entry.get("effects", {}))
			outcome_queue.append(entry)
		else:
			remaining.append(entry)
	state["scheduled"] = remaining

func _show_consequence(item: Dictionary) -> void:
	visitor_name.text = "ПОСЛЕДСТВИЕ"
	visitor_role.text = "ИЗ ПРОШЛЫХ РЕШЕНИЙ"
	visitor_line.text = String(item.get("text", "Старое решение вернулось."))
	decision_locked = true
	lever.set_enabled(false)
	world.set_state(state)
	_refresh_hud()
	if sound_enabled:
		PocketWorks.play_sfx("bell", 0.92)
	var timer := get_tree().create_timer(2.2)
	timer.timeout.connect(_show_next)

func _daily_background(day: int) -> void:
	var condition := String(state.get("condition", "ordinary"))
	if condition == "lean_year" and day > 1 and day % 4 == 0:
		state["food"] = maxi(0, int(state["food"]) - 2)
		outcome_queue.append({"text":"Урожай в округе слабый. На рынок привезли меньше еды, чем обычно.","effects":{}})
	elif condition == "busy_road" and day > 1 and day % 3 == 0:
		state["trade"] = mini(100, int(state["trade"]) + 1)
		state["crime"] = mini(100, int(state["crime"]) + 1)
	elif condition == "border_fear" and day > 1 and day % 5 == 0:
		if int(state["guard"]) < 10:
			state["trust"] = maxi(0, int(state["trust"]) - 2)
			outcome_queue.append({"text":"По дороге снова слухи о рейдах. Люди спрашивают, хватит ли стражи.","effects":{}})

func _end_day() -> void:
	decision_locked = true
	lever.set_enabled(false)
	world.operate_gate(false)
	var day_time := fposmod(float(state.get("visual_time", 0.38)) + 0.012, 1.0)
	state["visual_time"] = day_time
	world.transition_time(day_time, 1.40)
	var population := int(state["population"])
	var upkeep := maxi(2, int(ceil(float(population) / 11.0)))
	state["food"] = int(state["food"]) - upkeep
	var income := maxi(0, int(state["trade"]) / 6)
	state["money"] = int(state["money"]) + income
	if int(state["food"]) < 0:
		var shortage: int = absi(int(state["food"]))
		state["food"] = 0
		state["trust"] = int(state["trust"]) - 5 - shortage
		state["population"] = maxi(0, int(state["population"]) - maxi(1, shortage / 3))
		outcome_queue.append({"text":"Запасов не хватило. Несколько семей ушли до рассвета.","effects":{}})
	if int(state["disease"]) > 22:
		var sick_loss := maxi(1, int(state["disease"]) / 22)
		state["population"] = maxi(0, int(state["population"]) - sick_loss)
		state["trust"] = int(state["trust"]) - 2
		state["disease"] = maxi(0, int(state["disease"]) - 3)
		outcome_queue.append({"text":"За ночь болезнь забрала нескольких жителей.","effects":{}})
	else:
		state["disease"] = maxi(0, int(state["disease"]) - 1)
	if int(state["crime"]) > 28:
		var stolen := mini(maxi(2, int(state["crime"]) / 10), maxi(0, int(state["money"])))
		state["money"] = int(state["money"]) - stolen
		state["trust"] = int(state["trust"]) - 2
		state["crime"] = maxi(0, int(state["crime"]) - 2)
		outcome_queue.append({"text":"Ночью вскрыли склад. Часть казны пропала.","effects":{}})
	if int(state["guard"]) >= 12:
		state["crime"] = maxi(0, int(state["crime"]) - 2)
	if int(state["trust"]) >= 70:
		state["trade"] = mini(100, int(state["trade"]) + 1)

	_flash("День %d: склад −%d еды · торговля +%d монет" % [int(state["day"]), upkeep, income], C_SAND)
	state["day"] = int(state["day"]) + 1
	state["visitors_today"] = 0
	state["rng_state"] = rng.state
	world.set_state(state)
	_refresh_hud()
	_save()
	if int(state["day"]) > TOTAL_DAYS or _is_failed():
		var timer_end := get_tree().create_timer(1.8)
		timer_end.timeout.connect(_show_next)
		return
	var timer := get_tree().create_timer(1.8)
	timer.timeout.connect(_start_new_day)

func _start_new_day() -> void:
	_begin_day_if_needed()
	_show_next()

func _is_failed() -> bool:
	return int(state.get("trust", 50)) <= 0 or int(state.get("population", 1)) <= 0 or int(state.get("money", 0)) <= -80

func _finish(success: bool) -> void:
	campaign_over = true
	decision_locked = true
	lever.set_enabled(false)
	_save()
	end_overlay.visible = true
	hud.visible = true
	if success:
		end_title.text = "МОСТ ПЕРЕЖИЛ СЕЗОН"
		var identity := _settlement_identity()
		end_copy.text = "Шестьдесят дней закончились. %s\n\nНаселение: %d · казна: %d · стража: %d · доверие: %d.\n\nСезон закончен. Такой стала застава к последнему дню." % [
			identity, int(state["population"]), int(state["money"]), int(state["guard"]), int(state["trust"])
		]
		if sound_enabled:
			PocketWorks.play_sfx("good", 0.9)
	else:
		end_title.text = "ЗАСТАВА НЕ УДЕРЖАЛАСЬ"
		var reason := "Люди перестали подчиняться." if int(state.get("trust", 0)) <= 0 else ("Поселение опустело." if int(state.get("population", 0)) <= 0 else "Долги съели остатки власти.")
		end_copy.text = "%s\n\nДо конца сезона застава не дожила." % reason
		if sound_enabled:
			PocketWorks.play_sfx("bad", 0.9)
	_publish_state("complete")

func _settlement_identity() -> String:
	var trade := int(state["trade"])
	var guard := int(state["guard"])
	var trust := int(state["trust"])
	var pop := int(state["population"])
	if trade >= 55:
		return "У моста вырос шумный торговый город."
	if guard >= 24:
		return "Деревянная застава превратилась в тяжёлую пограничную крепость."
	if trust >= 75 and pop >= 80:
		return "За стеной выросло убежище, куда люди идут добровольно."
	if int(state["crime"]) >= 35:
		return "Поселение разбогатело, но дорога вокруг него стала территорией серых сделок."
	return "На берегу вырос суровый, смешанный пограничный город."

func _refresh_hud() -> void:
	day_label.text = "ДЕНЬ %d / %d" % [mini(int(state.get("day", 1)), TOTAL_DAYS), TOTAL_DAYS]
	var condition := String(state.get("condition", "ordinary"))
	condition_label.text = {"lean_year":"НЕУРОЖАЙ","busy_road":"БОЛЬШОЙ ТРАКТ","border_fear":"ТРЕВОЖНАЯ ГРАНИЦА","ordinary":""}.get(condition, "")
	money_label.text = "КАЗНА\n%d" % int(state.get("money", 0))
	food_label.text = "ЕДА\n%d" % int(state.get("food", 0))
	people_label.text = "ЛЮДИ\n%d" % int(state.get("population", 0))
	guard_label.text = "СТРАЖА\n%d" % int(state.get("guard", 0))
	trust_label.text = "ДОВЕРИЕ\n%d" % int(state.get("trust", 0))
	money_label.add_theme_color_override("font_color", C_RED if int(state.get("money", 0)) < 8 else C_TEXT)
	food_label.add_theme_color_override("font_color", C_RED if int(state.get("food", 0)) < 14 else C_TEXT)
	guard_label.add_theme_color_override("font_color", C_RED if int(state.get("guard", 0)) < 4 else C_TEXT)
	trust_label.add_theme_color_override("font_color", C_RED if int(state.get("trust", 0)) < 24 else C_TEXT)
	var w := String(state.get("weather", "clear"))
	weather_label.text = {"clear":"ЯСНО","rain":"ДОЖДЬ","snow":"СНЕГ"}.get(w, "ЯСНО")
	PocketWorks.set_ambience(sound_enabled, w, int(state.get("population", 18)))

func _flash(text_value: String, color: Color) -> void:
	result_hint.text = text_value.split("\n")[0]
	result_hint.add_theme_color_override("font_color", color.lightened(0.28))
	result_hint.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(result_hint, "modulate:a", 1.0, 0.10)
	tw.tween_interval(0.86)
	tw.tween_property(result_hint, "modulate:a", 0.0, 0.24)

func _effect_summary(effects: Dictionary) -> String:
	var parts: Array[String] = []
	var visible := {
		"money":"казна",
		"food":"еда",
		"population":"люди",
		"guard":"стража",
		"trust":"доверие"
	}
	for key in visible.keys():
		if effects.has(key) and int(effects[key]) != 0:
			var value := int(effects[key])
			var sign := "+" if value > 0 else ""
			parts.append(sign + str(value) + " " + String(visible[key]))
	if effects.has("has_forge") and int(effects["has_forge"]) > 0:
		parts.append("+ кузница")
	return " · ".join(parts)

func _pause() -> void:
	if campaign_over:
		return
	paused_game = true
	decision_locked = true
	lever.set_enabled(false)
	pause_overlay.visible = true
	PocketWorks.set_ambience(false)
	_save()
	_publish_state("paused")

func _resume() -> void:
	pause_overlay.visible = false
	paused_game = false
	decision_locked = false if not current_visitor.is_empty() else true
	lever.set_enabled(not current_visitor.is_empty())
	PocketWorks.set_ambience(sound_enabled, String(state.get("weather", "clear")), int(state.get("population", 18)))
	_publish_state("awaiting_decision" if not current_visitor.is_empty() else "running")

func _toggle_sound() -> void:
	sound_enabled = not sound_enabled
	PocketWorks.storage_set("sound", sound_enabled)
	sound_button.text = "ЗВУК: ВКЛ" if sound_enabled else "ЗВУК: ВЫКЛ"
	PocketWorks.set_ambience(sound_enabled, String(state.get("weather", "clear")), int(state.get("population", 18)))
	if sound_enabled:
		PocketWorks.play_sfx("bell", 1.0)

func _save() -> void:
	if state.is_empty():
		return
	state["rng_state"] = rng.state
	PocketWorks.storage_set("campaign", state)

func _publish_state(stage: String) -> void:
	PocketWorks.publish_test_state({
		"loadingState": stage,
		"runtime":"godot",
		"app":"zastava",
		"day":int(state.get("day", 1)),
		"visitorsToday":int(state.get("visitors_today", 0)),
		"awaitingDecision":not decision_locked,
		"resources":{
			"money":int(state.get("money", 0)),
			"food":int(state.get("food", 0)),
			"population":int(state.get("population", 0)),
			"guard":int(state.get("guard", 0)),
			"trust":int(state.get("trust", 0))
		},
		"weather":String(state.get("weather", "clear")),
		"campaignOver":campaign_over,
		"worldBootReady":world_boot_ready
	})

func _on_exit_pressed() -> void:
	_save()
	PocketWorks.exit_to_launcher()

func _input(event: InputEvent) -> void:
	# The lever owns normal GUI input. This scene-level path is intentionally
	# redundant: mobile browsers occasionally route a drag as raw canvas input
	# instead of Control GUI input. A gate mechanism should not miss a finger.
	if decision_locked or paused_game or campaign_over or lever == null:
		fallback_lever_dragging = false
		fallback_lever_touch = -1
		return

	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed and fallback_lever_touch == -1 and _in_lever_hitbox(touch.position):
			fallback_lever_touch = touch.index
			fallback_lever_dragging = true
			_preview_fallback_lever(touch.position.x)
		elif not touch.pressed and touch.index == fallback_lever_touch:
			_finish_fallback_lever(touch.position.x)
			fallback_lever_touch = -1
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if fallback_lever_dragging and drag.index == fallback_lever_touch:
			_preview_fallback_lever(drag.position.x)
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.button_index == MOUSE_BUTTON_LEFT:
			if mouse.pressed and _in_lever_hitbox(mouse.position):
				fallback_lever_dragging = true
				_preview_fallback_lever(mouse.position.x)
			elif not mouse.pressed and fallback_lever_dragging:
				_finish_fallback_lever(mouse.position.x)
	elif event is InputEventMouseMotion and fallback_lever_dragging:
		_preview_fallback_lever((event as InputEventMouseMotion).position.x)

func _in_lever_hitbox(pos: Vector2) -> bool:
	return pos.x >= 24.0 and pos.x <= 561.0 and pos.y >= 1008.0 and pos.y <= 1202.0

func _lever_normalized_from_x(x: float) -> float:
	return clampf((x - 292.5) / 178.0, -1.0, 1.0)

func _preview_fallback_lever(x: float) -> void:
	fallback_lever_x = _lever_normalized_from_x(x)
	lever.preview_external(fallback_lever_x)

func _finish_fallback_lever(x: float) -> void:
	if not fallback_lever_dragging:
		return
	fallback_lever_dragging = false
	var value := _lever_normalized_from_x(x)
	lever.preview_external(value)
	if value >= 0.52:
		_on_decision(1)
	elif value <= -0.52:
		_on_decision(-1)
	else:
		lever.reset()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_CLOSE_REQUEST:
		_save()

func _label(text_value: String, font_size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text_value
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_constant_override("outline_size", 1)
	l.add_theme_color_override("font_outline_color", Color("#111512"))
	return l

func _stat(parent: HBoxContainer, title: String, value: String) -> Label:
	var l := _label(title + "\n" + value, 12, C_TEXT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.custom_minimum_size = Vector2(96, 48)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(l)
	return l

func _panel_style(bg: Color, border: Color, width: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.border_width_left = width
	s.border_width_top = width
	s.border_width_right = width
	s.border_width_bottom = width
	s.corner_radius_top_left = 3
	s.corner_radius_top_right = 3
	s.corner_radius_bottom_left = 3
	s.corner_radius_bottom_right = 3
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 12
	s.content_margin_bottom = 12
	return s

func _style_button(button: Button, accent: bool) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = C_RUST if accent else C_UI
	normal.border_color = C_UI_2.lightened(0.12)
	normal.border_width_left = 2
	normal.border_width_top = 2
	normal.border_width_right = 2
	normal.border_width_bottom = 2
	normal.corner_radius_top_left = 3
	normal.corner_radius_top_right = 3
	normal.corner_radius_bottom_left = 3
	normal.corner_radius_bottom_right = 3
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = normal.bg_color.lightened(0.14)
	pressed.content_margin_top = 7
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = normal.bg_color.lightened(0.07)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("focus", normal)
	button.add_theme_color_override("font_color", C_TEXT)
	button.add_theme_color_override("font_hover_color", C_TEXT)
	button.add_theme_color_override("font_pressed_color", C_TEXT)
	button.add_theme_font_size_override("font_size", 16)

func _overlay(parent: Control) -> Control:
	var overlay := Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	parent.add_child(overlay)
	var shade := ColorRect.new()
	shade.color = Color(0.07,0.09,0.08,0.86)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(shade)
	return overlay

func _overlay_box(overlay: Control, box_size: Vector2) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.position = -box_size * 0.5
	panel.size = box_size
	panel.add_theme_stylebox_override("panel", _panel_style(Color("#303a36"), C_UI_2.lightened(0.12), 2))
	overlay.add_child(panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 28)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_top", 28)
	margin.add_theme_constant_override("margin_bottom", 28)
	panel.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	margin.add_child(box)
	return box

func _title(text_value: String, size_value: int) -> Label:
	var l := _label(text_value, size_value, C_TEXT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l

func _action_button(text_value: String, accent: bool) -> Button:
	var b := Button.new()
	b.text = text_value
	b.custom_minimum_size = Vector2(0, 62)
	_style_button(b, accent)
	return b

func _spacer(height: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(1, height)
	return c
