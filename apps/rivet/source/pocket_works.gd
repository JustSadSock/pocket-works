extends Node

const STORAGE_NAMESPACE := "pocket-works:rivet"

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
		_web_eval("window.__RIVET_BOOT_STAGE__=" + JSON.stringify(stage) + ";")

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

func play_tone(kind: String, pitch: float = 1.0) -> void:
	if not OS.has_feature("web"):
		return
	var source := """
	(() => {
		const kind = %s;
		const pitch = %s;
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		const ctx = window.__rivetAudio || (window.__rivetAudio = new AC());
		if (ctx.state === 'suspended') ctx.resume().catch(() => {});
		const table = {
			shot: [220, 0.055, 'square', 0.035],
			hit: [92, 0.080, 'triangle', 0.045],
			dash: [145, 0.120, 'sawtooth', 0.040],
			hurt: [72, 0.160, 'square', 0.055],
			upgrade: [430, 0.190, 'sine', 0.040],
			boss: [116, 0.300, 'sawtooth', 0.045]
		};
		const spec = table[kind] || table.hit;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = spec[2];
		osc.frequency.value = spec[0] * pitch;
		gain.gain.setValueAtTime(spec[3], ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + spec[1]);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + spec[1]);
	})();
	""" % [JSON.stringify(kind), str(pitch)]
	_web_eval(source)

func set_document_title(title: String) -> void:
	if OS.has_feature("web"):
		_web_eval("document.title=" + JSON.stringify(title) + ";")
