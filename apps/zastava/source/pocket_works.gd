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


func set_ambience(enabled: bool, weather: String = "clear", population: int = 18) -> void:
	if not OS.has_feature("web"):
		return
	var source := """
	(() => {
		const enabled = %s, weather = %s, population = %s;
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		const ctx = window.__zastavaAudio || (window.__zastavaAudio = new AC());
		if (ctx.state === 'suspended' && enabled) ctx.resume().catch(() => {});
		if (!window.__zastavaAmbience) {
			const master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination);
			const makeNoise = (type, cutoff, gainValue) => {
				const len = ctx.sampleRate * 2, buffer = ctx.createBuffer(1, len, ctx.sampleRate);
				const data = buffer.getChannelData(0);
				let last = 0;
				for (let i=0;i<len;i++) {
					const white = Math.random()*2-1;
					last = type === 'brown' ? (last + 0.02*white)/1.02 : white;
					data[i] = type === 'brown' ? last*3.2 : white;
				}
				const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
				const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=cutoff;
				const gain = ctx.createGain(); gain.gain.value=gainValue;
				src.connect(filter); filter.connect(gain); gain.connect(master); src.start();
				return gain;
			};
			const river = makeNoise('brown', 620, .26);
			const wind = makeNoise('white', 950, .045);
			const rain = makeNoise('white', 2600, .0001);
			const crowd = ctx.createGain(); crowd.gain.value=.0001; crowd.connect(master);
			for (let i=0;i<3;i++) {
				const o=ctx.createOscillator(), g=ctx.createGain();
				o.type='sine'; o.frequency.value=92+i*31; g.gain.value=.0028;
				o.connect(g); g.connect(crowd); o.start();
			}
			window.__zastavaAmbience={master,river,wind,rain,crowd};
		}
		const a=window.__zastavaAmbience, now=ctx.currentTime;
		const ramp=(node,value)=>{node.gain.cancelScheduledValues(now);node.gain.setTargetAtTime(value,now,.25);};
		ramp(a.master, enabled ? .11 : .0001);
		ramp(a.river, weather==='snow' ? .16 : .24);
		ramp(a.wind, weather==='snow' ? .11 : weather==='rain' ? .075 : .042);
		ramp(a.rain, weather==='rain' ? .16 : .0001);
		ramp(a.crowd, enabled ? Math.min(.055, .008 + population*.00055) : .0001);
	})();
	""" % [str(enabled).to_lower(), JSON.stringify(weather), str(population)]
	_web_eval(source)
