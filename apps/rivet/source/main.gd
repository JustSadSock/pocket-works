extends Control

@onready var status_label: Label = %StatusLabel

func _ready() -> void:
	PocketWorks.set_document_title("RIVET")
	PocketWorks.publish_test_state({
		"loadingState": "ready",
		"runtime": "godot",
		"app": "rivet",
		"diagnostic": "template-baseline"
	})
	status_label.text = "RIVET runtime ready"

func _on_action_pressed() -> void:
	var count := int(PocketWorks.storage_get("action-count", 0)) + 1
	PocketWorks.storage_set("action-count", count)
	status_label.text = "Action " + str(count)
	PocketWorks.publish_test_state({
		"loadingState": "interactive",
		"runtime": "godot",
		"app": "rivet",
		"actionCount": count
	})

func _on_exit_pressed() -> void:
	PocketWorks.exit_to_launcher()
