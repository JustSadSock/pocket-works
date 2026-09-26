# __APP_NAME__

Pocket Works Godot Web application.

- Runtime: Godot Web / WebAssembly
- Renderer: Compatibility
- Threads: disabled for iOS/Safari portability
- Source directory: source/
- Generated browser export: web/ (owned by GitHub Actions; do not hand-edit)
- Shared platform bridge: PocketWorks autoload in source/pocket_works.gd

The repository agent authors the Godot project as text. GitHub Actions runs the pinned Godot editor headlessly and commits the generated Web export back to the feature branch.
