extends Node

const WORLD_SCRIPT := preload("res://source/world_builder.gd")
const LEVER_SCRIPT := preload("res://source/lever.gd")

const TOTAL_DAYS := 60
const VISITORS_PER_DAY := 3

const C_UI := Color("#2f3936")
const C_UI_2 := Color("#46534e")
const C_TEXT := Color("#e8dfca")
const C_MUTED := Color("#b7b09f")
const C_RUST := Color("#a85f43")
const C_GREEN := Color("#60786d")
const C_RED := Color("#8a514b")
const C_SAND := Color("#c5b696")

const VISITORS := [
	{
		"id":"refugees", "name":"Мирослава", "role":"семья беженцев",
		"line":"Сгорела деревня. Нас девятеро. Работать будем за еду и крышу.",
		"accept":{"population":9,"food":-8,"trust":5,"disease":4},
		"reject":{"trust":-5,"crime":2},
		"accept_result":"Семья проходит внутрь. К вечеру у стены появляются новые костры.",
		"reject_result":"Ворота остаются закрыты. Очередь молча расступается.",
		"accept_later":{"delay":4,"text":"Беженцы обжились. Трое уже работают у плотника.","effects":{"trade":3,"food":2}}
	},
	{
		"id":"blacksmith", "name":"Остап", "role":"кузнец",
		"line":"Мою кузницу забрали за долги. Дайте угол — починю оружие и инструменты.",
		"accept":{"money":-8,"trade":4,"guard":2,"has_forge":1},
		"reject":{"trust":-1},
		"accept_result":"Кузнец получает сарай у стены. Уже слышен первый удар молота.",
		"reject_result":"Остап уходит вдоль реки вместе с инструментами."
	},
	{
		"id":"grain", "name":"Борис", "role":"зерновой купец",
		"line":"Двадцать мешков ржи. Цена высокая, но следующего обоза может не быть.",
		"accept":{"money":-14,"food":28,"trade":2},
		"reject":{"food":-1},
		"accept_result":"Мешки уходят на склад, монеты — в чужой сундук.",
		"reject_result":"Караван разворачивается. Склад не стал полнее."
	},
	{
		"id":"deserter", "name":"Левко", "role":"дезертир",
		"line":"Я умею держать копьё. Имя можете не спрашивать. Мне нужна новая сторона.",
		"accept":{"guard":2,"trust":-2,"crime":3},
		"reject":{"guard":-1,"trust":1},
		"accept_result":"Стража нехотя выдаёт ему серый плащ.",
		"reject_result":"Он смотрит на стены ещё секунду и уходит.",
		"accept_later":{"delay":6,"text":"Новый стражник исчез ночью вместе с двумя арбалетами.","effects":{"guard":-1,"crime":4}}
	},
	{
		"id":"healer", "name":"Агнесса", "role":"лекарь",
		"line":"Мне нужна комната и чистая вода. Взамен лечу ваших людей.",
		"accept":{"money":-6,"disease":-9,"trust":4},
		"reject":{"disease":3,"trust":-2},
		"accept_result":"Лекарю освобождают комнату рядом со складом.",
		"reject_result":"Она уходит к следующему поселению."
	},
	{
		"id":"taxman", "name":"Королевский сборщик", "role":"чиновник",
		"line":"Корона требует десять монет и двух людей в обоз. Печать настоящая.",
		"accept":{"money":-10,"population":-2,"trust":-2},
		"reject":{"money":4,"guard":-1,"trust":2},
		"accept_result":"Печать ставится в книгу. Корона довольна, жители — не очень.",
		"reject_result":"Сборщик уезжает злой. На дороге становится подозрительно тихо.",
		"reject_later":{"delay":5,"text":"Из столицы пришёл штраф за неповиновение.","effects":{"money":-9,"trade":-2}}
	},
	{
		"id":"smugglers", "name":"Двое лодочников", "role":"контрабандисты",
		"line":"Мы ничего не везём. Просто очень тяжёлая пустая лодка. И пять монет вам.",
		"accept":{"money":5,"crime":7,"trust":-2},
		"reject":{"crime":-2,"trade":-1},
		"accept_result":"Лодка исчезает под мостом. Сундук становится тяжелее.",
		"reject_result":"Стража разворачивает лодку шестами."
	},
	{
		"id":"mason", "name":"Яромир", "role":"каменщик",
		"line":"Вижу трещины в башне. Дайте камень и плату — простоит ещё поколение.",
		"accept":{"money":-11,"guard":3,"trust":2},
		"reject":{"money":2},
		"accept_result":"У башни появляются леса и рабочие.",
		"reject_result":"Трещина никуда не делась. Каменщик — да."
	},
	{
		"id":"engineer", "name":"Марк", "role":"мостовой мастер",
		"line":"Ваш механизм жрёт цепи. Переделаю противовес. Недёшево.",
		"accept":{"money":-9,"trade":4,"guard":1},
		"reject":{"trade":-1},
		"accept_result":"Мастер разбирает кожух механизма прямо на месте.",
		"reject_result":"Старые цепи продолжают скрипеть."
	},
	{
		"id":"mercenaries", "name":"Сотник Радан", "role":"наёмники",
		"line":"Шесть копий. Платите сейчас — неделю никто не полезет к вашим стенам.",
		"accept":{"money":-16,"guard":7,"trust":-1},
		"reject":{"guard":-1,"crime":2},
		"accept_result":"На стене становится теснее от чужих щитов.",
		"reject_result":"Отряд уходит вверх по тракту."
	},
	{
		"id":"monks", "name":"Брат Павел", "role":"монахи",
		"line":"Несём книги и сушёные травы. Просим ночлег и хлеб.",
		"accept":{"food":-5,"trust":5,"disease":-3},
		"reject":{"trust":-3},
		"accept_result":"Во дворе пахнет травами и дымом маленькой печи.",
		"reject_result":"Монахи молча продолжают путь."
	},
	{
		"id":"sick_family", "name":"Катерина", "role":"больная семья",
		"line":"У сына жар. До города два дня. Пожалуйста.",
		"accept":{"population":4,"trust":6,"disease":12},
		"reject":{"trust":-7,"disease":-1},
		"accept_result":"Стража отступает на шаг, но ворота открываются.",
		"reject_result":"Мать ещё долго стоит перед закрытой решёткой.",
		"accept_later":{"delay":3,"text":"Жар оказался заразным. Лазарет переполнен.","effects":{"disease":7,"food":-4}}
	},
	{
		"id":"envoy", "name":"Эдвард", "role":"королевский посланник",
		"line":"Еду без досмотра. Таков обычай короны.",
		"accept":{"trust":-1,"trade":3},
		"reject":{"trust":3,"money":-3},
		"accept_result":"Посланник даже не замедляет коня.",
		"reject_result":"Досмотр занимает час. В мешках ничего."
	},
	{
		"id":"ferryman", "name":"Сава", "role":"паромщик",
		"line":"Мост кормит вас, а река могла бы кормить нас обоих. Дайте лицензию.",
		"accept":{"money":-4,"trade":7,"trust":3},
		"reject":{"trade":-2},
		"accept_result":"Ниже по течению начинают ставить причал.",
		"reject_result":"Сава складывает бумаги обратно в сапог."
	},
	{
		"id":"orphans", "name":"Старшая девочка", "role":"четверо сирот",
		"line":"Мы не просим денег. Только пустите туда, где есть стены.",
		"accept":{"population":4,"food":-5,"trust":6},
		"reject":{"trust":-8,"crime":2},
		"accept_result":"Дети быстро исчезают среди домов.",
		"reject_result":"Они уходят молча. Даже стражники отводят глаза."
	},
	{
		"id":"hunter", "name":"Тихон", "role":"охотник",
		"line":"Мясо, шкуры и новости с северной дороги. Возьмёте всё за семь монет.",
		"accept":{"money":-7,"food":16,"trade":2},
		"reject":{"food":-1},
		"accept_result":"На рынке появляются свежие туши и шкуры.",
		"reject_result":"Охотник уходит продавать товар дальше."
	},
	{
		"id":"guild", "name":"Гильдейский мастер", "role":"торговый союз",
		"line":"Снизьте пошлину на сезон. Мы удвоим поток караванов.",
		"accept":{"money":-6,"trade":10,"trust":2},
		"reject":{"money":5,"trade":-5},
		"accept_result":"На доске у ворот меняют ставку. Телег становится больше.",
		"reject_result":"Гильдейская печать исчезает в футляре."
	},
	{
		"id":"prisoner", "name":"Страж из уезда", "role":"конвой с пленником",
		"line":"Разбойник. Нужно оставить его у вас до утра.",
		"accept":{"guard":-1,"crime":4,"money":3},
		"reject":{"trust":1},
		"accept_result":"Пленника запирают в кладовой под башней.",
		"reject_result":"Конвой продолжает путь в темноте.",
		"accept_later":{"delay":2,"text":"Пленник сбежал через крышу склада.","effects":{"crime":5,"food":-3}}
	},
	{
		"id":"brewer", "name":"Ганна", "role":"пивовар",
		"line":"Есть дрожжи, руки и рецепт. Нужна только крыша и зерно.",
		"accept":{"food":-7,"population":2,"trade":6,"trust":3},
		"reject":{"trade":-1},
		"accept_result":"У дальней стены начинают мыть старые бочки.",
		"reject_result":"Рецепт уезжает вместе с хозяйкой."
	},
	{
		"id":"scribe", "name":"Иларион", "role":"писарь",
		"line":"Могу вести учёт людей, пошлин и запасов. За еду и пять монет.",
		"accept":{"money":-5,"food":-2,"trade":3,"crime":-3},
		"reject":{"crime":1},
		"accept_result":"В караулке появляется книга толще кирпича.",
		"reject_result":"Писарь уходит, аккуратно пересчитав собственные шаги."
	},
	{
		"id":"militia", "name":"Сельский староста", "role":"ополченцы",
		"line":"Двенадцать людей готовы дежурить. Но семьи хотят жить за стеной.",
		"accept":{"population":12,"food":-10,"guard":5,"trust":4},
		"reject":{"guard":-2,"trust":-3},
		"accept_result":"Во дворе появляется ещё дюжина копий и столько же узлов с вещами.",
		"reject_result":"Ополченцы возвращаются к своим деревням."
	},
	{
		"id":"noble", "name":"Барон Рутгер", "role":"дворянин с охотой",
		"line":"Откройте ворота без очереди. Мои люди оставят щедрый подарок.",
		"accept":{"money":9,"trust":-4,"food":-2},
		"reject":{"trust":3,"trade":-2},
		"accept_result":"Очередь недовольно гудит, пока свита проходит первой.",
		"reject_result":"Барон обещает запомнить ваше лицо."
	},
	{
		"id":"firewood", "name":"Дровосеки", "role":"лесная артель",
		"line":"Нам нужен проход к нижнему лесу. Вам — половина заготовки.",
		"accept":{"food":5,"trade":4,"trust":1},
		"reject":{"trade":-2},
		"accept_result":"Через мост тянутся первые телеги с брёвнами.",
		"reject_result":"Топоры и лошади уходят на север."
	},
	{
		"id":"serfs", "name":"Пятнадцать беглецов", "role":"беглые крестьяне",
		"line":"Помещик забирает половину урожая. Если впустите — останемся здесь.",
		"accept":{"population":15,"food":-11,"trust":8,"trade":2},
		"reject":{"trust":-6},
		"accept_result":"За стеной внезапно становится заметно теснее.",
		"reject_result":"Группа долго спорит, потом исчезает на дороге.",
		"accept_later":{"delay":5,"text":"От владельца беглецов пришло требование компенсации.","effects":{"money":-8,"trust":2}}
	},
	{
		"id":"doctor", "name":"Доктор Вейс", "role":"чумной лекарь",
		"line":"Если болезнь доберётся сюда, поздно будет искать меня потом.",
		"accept":{"money":-12,"disease":-14,"trust":1},
		"reject":{"disease":2},
		"accept_result":"Чёрный клюв лекаря пугает детей, но лазарет получает хозяина.",
		"reject_result":"Лекарь продолжает путь к городу."
	},
	{
		"id":"salt", "name":"Мара", "role":"соляной торговец",
		"line":"Соль сохраняет мясо лучше молитв. Девять монет за партию.",
		"accept":{"money":-9,"food":18,"trade":3},
		"reject":{"food":-2},
		"accept_result":"Белые мешки уходят глубоко в сухой склад.",
		"reject_result":"Телега скрипит прочь."
	},
	{
		"id":"veterans", "name":"Старший десятник", "role":"ветераны",
		"line":"Война закончилась для короля, не для нас. Пятеро ищут службу.",
		"accept":{"guard":5,"food":-5,"trust":2},
		"reject":{"guard":-1,"crime":2},
		"accept_result":"Опытные люди быстро находят слабые места на стене.",
		"reject_result":"Отряд растворяется среди трактиров на большой дороге."
	},
	{
		"id":"pilgrims", "name":"Паломники", "role":"дорожная процессия",
		"line":"Только переночевать. Нас двадцать, еды почти нет.",
		"accept":{"food":-8,"trust":5,"trade":2},
		"reject":{"trust":-3},
		"accept_result":"Внутри стен звучат тихие песни.",
		"reject_result":"Процессия ставит лагерь далеко за рекой."
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

func _ready() -> void:
	Engine.max_fps = 60
	PocketWorks.set_boot_stage("ready-enter")
	PocketWorks.set_document_title("ЗАСТАВА")
	sound_enabled = bool(PocketWorks.storage_get("sound", true))
	world = WORLD_SCRIPT.new()
	add_child(world)
	_build_ui()
	_load_or_prepare()
	PocketWorks.set_boot_stage("ready")
	_publish_state("ready")

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

	var top := PanelContainer.new()
	top.position = Vector2(14, 18)
	top.size = Vector2(557, 105)
	top.add_theme_stylebox_override("panel", _panel_style(Color(0.13,0.16,0.15,0.90), C_UI_2, 2))
	hud.add_child(top)
	var top_box := VBoxContainer.new()
	top_box.add_theme_constant_override("separation", 4)
	top.add_child(top_box)
	var top_row := HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 12)
	top_box.add_child(top_row)
	day_label = _label("ДЕНЬ 1 / 60", 20, C_TEXT)
	day_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(day_label)
	weather_label = _label("ЯСНО", 14, C_MUTED)
	weather_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	weather_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(weather_label)
	pause_button = Button.new()
	pause_button.text = "ПАУЗА"
	pause_button.custom_minimum_size = Vector2(92, 42)
	_style_button(pause_button, false)
	pause_button.pressed.connect(_pause)
	top_row.add_child(pause_button)
	var stats := HBoxContainer.new()
	stats.add_theme_constant_override("separation", 4)
	top_box.add_child(stats)
	money_label = _stat(stats, "КАЗНА", "40")
	food_label = _stat(stats, "ЕДА", "70")
	people_label = _stat(stats, "ЛЮДИ", "18")
	guard_label = _stat(stats, "СТРАЖА", "6")
	trust_label = _stat(stats, "ДОВЕРИЕ", "55")

	result_hint = Label.new()
	result_hint.position = Vector2(32, 750)
	result_hint.size = Vector2(521, 62)
	result_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	result_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result_hint.add_theme_font_size_override("font_size", 17)
	result_hint.add_theme_color_override("font_color", C_TEXT)
	result_hint.modulate.a = 0.0
	hud.add_child(result_hint)

	visitor_panel = PanelContainer.new()
	visitor_panel.position = Vector2(28, 820)
	visitor_panel.size = Vector2(529, 190)
	visitor_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.12,0.15,0.14,0.93), C_UI_2, 2))
	hud.add_child(visitor_panel)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 20)
	margin.add_theme_constant_override("margin_right", 20)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	visitor_panel.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	margin.add_child(box)
	visitor_name = _label("—", 27, C_TEXT)
	box.add_child(visitor_name)
	visitor_role = _label("ожидание у ворот", 14, C_SAND)
	box.add_child(visitor_role)
	visitor_line = _label("...", 19, C_MUTED)
	visitor_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	visitor_line.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(visitor_line)

	var choice_row := HBoxContainer.new()
	choice_row.position = Vector2(42, 1017)
	choice_row.size = Vector2(501, 30)
	hud.add_child(choice_row)
	var reject := _label("←  ЗАКРЫТЬ", 16, Color("#d4aaa3"))
	reject.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	choice_row.add_child(reject)
	var accept := _label("ПРОПУСТИТЬ  →", 16, Color("#a9c5b6"))
	accept.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	accept.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	choice_row.add_child(accept)

	lever = LEVER_SCRIPT.new()
	lever.position = Vector2(32, 1040)
	lever.size = Vector2(521, 170)
	lever.decision.connect(_on_decision)
	hud.add_child(lever)

	var footer := Label.new()
	footer.text = "Потяни рычаг до края и отпусти"
	footer.position = Vector2(120, 1215)
	footer.size = Vector2(345, 28)
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.add_theme_font_size_override("font_size", 13)
	footer.add_theme_color_override("font_color", Color(C_MUTED, 0.75))
	hud.add_child(footer)

	start_overlay = _overlay(root)
	var start_box := _overlay_box(start_overlay, Vector2(500, 535))
	start_box.add_child(_title("ЗАСТАВА", 48))
	var copy := _label("Один мост. Один рычаг. Шестьдесят дней, за которые маленькая пограничная будка может стать городом — или закончиться бунтом и пустым складом.", 19, C_MUTED)
	copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	start_box.add_child(copy)
	var rule := _label("Людей не оценивают карточки. Смотри, кто приходит, принимай решение и запоминай, что сделал миру.", 16, C_SAND)
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
	pause_box.add_child(_title("СМЕНА ПРИОСТАНОВЛЕНА", 30))
	var resume := _action_button("ПРОДОЛЖИТЬ", true)
	resume.pressed.connect(_resume)
	pause_box.add_child(resume)
	sound_button = _action_button("ЗВУК: ВКЛ" if sound_enabled else "ЗВУК: ВЫКЛ", false)
	sound_button.pressed.connect(_toggle_sound)
	pause_box.add_child(sound_button)
	var restart := _action_button("НАЧАТЬ КАМПАНИЮ ЗАНОВО", false)
	restart.pressed.connect(_confirm_new_game)
	pause_box.add_child(restart)
	var pause_exit := _action_button("POCKET WORKS", false)
	pause_exit.pressed.connect(PocketWorks.exit_to_launcher)
	pause_box.add_child(pause_exit)

	confirm_overlay = _overlay(root)
	confirm_overlay.visible = false
	var confirm_box := _overlay_box(confirm_overlay, Vector2(440, 330))
	confirm_box.add_child(_title("СБРОСИТЬ КАМПАНИЮ?", 28))
	var confirm_copy := _label("Текущая застава и все отложенные последствия будут удалены.", 17, C_MUTED)
	confirm_copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
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
	end_copy = _label("", 18, C_MUTED)
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
		continue_button.text = "ПРОДОЛЖИТЬ · ДЕНЬ %d" % int(state.get("day", 1))
	else:
		_reset_state()
		continue_button.text = "НАЧАТЬ СМЕНУ"
	hud.visible = false
	start_overlay.visible = true
	world.set_state(state)
	world.set_weather(String(state.get("weather", "clear")))

func _reset_state() -> void:
	rng.seed = int(Time.get_unix_time_from_system()) ^ 0x5A57A
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
		"rng_state":rng.state
	}
	recent_ids.clear()
	outcome_queue.clear()
	campaign_over = false
	_save()

func _start_or_continue() -> void:
	start_overlay.visible = false
	hud.visible = true
	paused_game = false
	world.set_state(state)
	_begin_day_if_needed()
	_show_next()

func _confirm_new_game() -> void:
	confirm_overlay.visible = true

func _new_game() -> void:
	_reset_state()
	confirm_overlay.visible = false
	end_overlay.visible = false
	pause_overlay.visible = false
	start_overlay.visible = false
	hud.visible = true
	world.set_state(state)
	_begin_day_if_needed()
	_show_next()

func _begin_day_if_needed() -> void:
	if int(state.get("visitors_today", 0)) != 0:
		_refresh_hud()
		return
	var day := int(state["day"])
	state["weather"] = _pick_weather(day)
	world.set_weather(String(state["weather"]))
	world.set_time(0.20)
	_process_scheduled()
	_daily_background(day)
	_refresh_hud()
	_save()

func _pick_weather(day: int) -> String:
	var roll := rng.randf()
	if day > 42 and roll < 0.24:
		return "snow"
	if roll < 0.27:
		return "rain"
	return "clear"

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
	visitor_line.text = "«" + String(current_visitor["line"]) + "»"
	decision_locked = false
	lever.set_enabled(true)
	lever.reset()
	var variant := rng.randi_range(0, 11)
	world.spawn_visitor(current_visitor, variant)
	var index := int(state["visitors_today"])
	world.set_time(0.25 + float(index) * 0.20)
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
	world.operate_gate(accepted)
	if sound_enabled:
		PocketWorks.play_sfx("gate", 1.04 if accepted else 0.90)
	world.visitor_react(accepted)

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
	_flash(String(current_visitor.get(result_key, "Решение принято.")), C_GREEN if accepted else C_RED)
	state["visitors_today"] = int(state["visitors_today"]) + 1
	state["rng_state"] = rng.state
	world.set_state(state)
	_refresh_hud()
	current_visitor = {}
	_save()
	_publish_state("resolved")
	var timer := get_tree().create_timer(1.45)
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
	_flash(String(item.get("text", "")), C_SAND)
	if sound_enabled:
		PocketWorks.play_sfx("bell", 0.92)
	var timer := get_tree().create_timer(2.2)
	timer.timeout.connect(_show_next)

func _daily_background(day: int) -> void:
	if day > 1:
		return
	# First day intentionally has no hidden modifier; the player learns the clean loop.

func _end_day() -> void:
	decision_locked = true
	lever.set_enabled(false)
	world.operate_gate(false)
	world.set_time(0.90)
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
		outcome_queue.append({"text":"Еды не хватило. Ночью несколько семей ушли, а утром очередь у склада стала злой.","effects":{}})
	if int(state["disease"]) > 22:
		var sick_loss := maxi(1, int(state["disease"]) / 22)
		state["population"] = maxi(0, int(state["population"]) - sick_loss)
		state["trust"] = int(state["trust"]) - 2
		state["disease"] = maxi(0, int(state["disease"]) - 3)
		outcome_queue.append({"text":"Ночью лазарет снова работал без сна. Несколько домов погасли.","effects":{}})
	else:
		state["disease"] = maxi(0, int(state["disease"]) - 1)
	if int(state["crime"]) > 28:
		var stolen := mini(maxi(2, int(state["crime"]) / 10), maxi(0, int(state["money"])))
		state["money"] = int(state["money"]) - stolen
		state["trust"] = int(state["trust"]) - 2
		state["crime"] = maxi(0, int(state["crime"]) - 2)
		outcome_queue.append({"text":"Ночью вскрыли один из складов. Стража нашла только следы у воды.","effects":{}})
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
		end_copy.text = "Шестьдесят дней закончились. %s\n\nНаселение: %d · казна: %d · стража: %d · доверие: %d.\n\nЗастава осталась не набором бонусов, а местом, которое помнит почти каждое ваше решение." % [
			identity, int(state["population"]), int(state["money"]), int(state["guard"]), int(state["trust"])
		]
		if sound_enabled:
			PocketWorks.play_sfx("good", 0.9)
	else:
		end_title.text = "ЗАСТАВА НЕ УДЕРЖАЛАСЬ"
		var reason := "Люди перестали подчиняться." if int(state.get("trust", 0)) <= 0 else ("Поселение опустело." if int(state.get("population", 0)) <= 0 else "Долги съели остатки власти.")
		end_copy.text = "%s\n\nК этому привела не одна кнопка: цепочка решений постепенно изменила еду, безопасность, торговлю и отношение людей." % reason
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
	money_label.text = "КАЗНА\n%d" % int(state.get("money", 0))
	food_label.text = "ЕДА\n%d" % int(state.get("food", 0))
	people_label.text = "ЛЮДИ\n%d" % int(state.get("population", 0))
	guard_label.text = "СТРАЖА\n%d" % int(state.get("guard", 0))
	trust_label.text = "ДОВЕРИЕ\n%d" % int(state.get("trust", 0))
	var w := String(state.get("weather", "clear"))
	weather_label.text = {"clear":"ЯСНО","rain":"ДОЖДЬ","snow":"СНЕГ"}.get(w, "ЯСНО")

func _flash(text_value: String, color: Color) -> void:
	result_hint.text = text_value
	result_hint.add_theme_color_override("font_color", color)
	result_hint.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(result_hint, "modulate:a", 1.0, 0.12)
	tw.tween_interval(0.88)
	tw.tween_property(result_hint, "modulate:a", 0.0, 0.34)

func _pause() -> void:
	if campaign_over:
		return
	paused_game = true
	decision_locked = true
	lever.set_enabled(false)
	pause_overlay.visible = true
	_save()
	_publish_state("paused")

func _resume() -> void:
	pause_overlay.visible = false
	paused_game = false
	decision_locked = false if not current_visitor.is_empty() else true
	lever.set_enabled(not current_visitor.is_empty())
	_publish_state("awaiting_decision" if not current_visitor.is_empty() else "running")

func _toggle_sound() -> void:
	sound_enabled = not sound_enabled
	PocketWorks.storage_set("sound", sound_enabled)
	sound_button.text = "ЗВУК: ВКЛ" if sound_enabled else "ЗВУК: ВЫКЛ"
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
		"campaignOver":campaign_over
	})

func _on_exit_pressed() -> void:
	_save()
	PocketWorks.exit_to_launcher()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_CLOSE_REQUEST:
		_save()

func _label(text_value: String, font_size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text_value
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	return l

func _stat(parent: HBoxContainer, title: String, value: String) -> Label:
	var l := _label(title + "\n" + value, 13, C_TEXT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.custom_minimum_size = Vector2(100, 44)
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
