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
	if not OS.has_feature("web"):
		return
	_web_eval("window.__AI_TEST_STATE__=" + JSON.stringify(state) + ";")

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
	if not OS.has_feature("web"):
		return
	var full_key := STORAGE_NAMESPACE + ":" + key
	_web_eval("localStorage.removeItem(" + JSON.stringify(full_key) + ");")

func set_document_title(title: String) -> void:
	if OS.has_feature("web"):
		_web_eval("document.title=" + JSON.stringify(title) + ";")
