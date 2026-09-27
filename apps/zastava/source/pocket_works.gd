extends Node

const STORAGE_NAMESPACE := "pocket-works:zastava"

func _web_eval(source: String, use_global_context := true) -> Variant:
	if not OS.has_feature("web"):
		return null
	return JavaScriptBridge.eval(source, use_global_context)

func exit_to_launcher() -> void:
	if OS.has_feature("web"):
		_web_eval("window.location.href='../../';")

func publish_test_state(state: Dictionary) -> void:
	if OS.has_feature("web"):
		_web_eval("window.__AI_TEST_STATE__=" + JSON.stringify(state) + ";")

func set_boot_stage(stage: String) -> void:
	if OS.has_feature("web"):
		_web_eval("window.__ZASTAVA_BOOT_STAGE__=" + JSON.stringify(stage) + ";")

func storage_set(key: String, value: Variant) -> void:
	if not OS.has_feature("web"):
		return
	var full_key := STORAGE_NAMESPACE + ":" + key
	var payload := JSON.stringify(value)
	_web_eval("localStorage.setItem(" + JSON.stringify(full_key) + "," + JSON.stringify(payload) + ");")

func storage_get(key: String, fallback: Variant = null) -> Variant:
	if not OS.has_feature("web"):
		return fallback
	var full_key := STORAGE_NAMESPACE + ":" + key
	var value: Variant = _web_eval("localStorage.getItem(" + JSON.stringify(full_key) + ");")
	if value == null or typeof(value) != TYPE_STRING or value == "":
		return fallback
	var parsed: Variant = JSON.parse_string(value)
	return fallback if parsed == null else parsed

func storage_remove(key: String) -> void:
	if OS.has_feature("web"):
		var full_key := STORAGE_NAMESPACE + ":" + key
		_web_eval("localStorage.removeItem(" + JSON.stringify(full_key) + ");")

func set_document_title(title: String) -> void:
	if OS.has_feature("web"):
		_web_eval("document.title=" + JSON.stringify(title) + ";")

func haptic(ms: int = 18) -> void:
	if OS.has_feature("web"):
		_web_eval("if(navigator.vibrate) navigator.vibrate(" + str(ms) + ");")

func play_sfx(kind: String, pitch: float = 1.0) -> void:
	if not OS.has_feature("web"):
		return
	var source := """
	(() => {
		const kind = %s, pitch = %s;
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		const ctx = window.__zastavaAudio || (window.__zastavaAudio = new AC());
		if (ctx.state === 'suspended') ctx.resume().catch(() => {});
		const specs = {
			lever:[92,.10,'triangle',.035],
			gate:[58,.18,'square',.026],
			coin:[510,.08,'sine',.030],
			good:[360,.16,'sine',.026],
			bad:[105,.20,'sawtooth',.022],
			bell:[660,.24,'sine',.024],
			build:[145,.12,'triangle',.028]
		};
		const s = specs[kind] || specs.lever;
		const osc = ctx.createOscillator(), gain = ctx.createGain();
		osc.type=s[2]; osc.frequency.value=s[0]*pitch;
		gain.gain.setValueAtTime(s[3],ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+s[1]);
		osc.connect(gain); gain.connect(ctx.destination);
		osc.start(); osc.stop(ctx.currentTime+s[1]);
	})();
	""" % [JSON.stringify(kind), str(pitch)]
	_web_eval(source)
