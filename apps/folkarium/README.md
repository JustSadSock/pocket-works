# Folkarium — мастерская менестреля

Standalone Pocket Works Quick PWA. Open \`/apps/folkarium/\` from the launcher.

## First version

- Four-section generated folk composition (introduction, theme, answer, coda), in Dorian/Aeolian/Mixolydian/Phrygian modes.
- Six independently editable tracks: vielle, lute, hurdy-gurdy, flute, harp and frame drum; mute, level, individual reroll.
- Tap or drag notes in the 16-step modal-score editor. Section/rhythm selection and full generation.
- Polyphonic browser Web Audio synthesis. **Version 0.1 uses synthesized, historically inspired timbres, not recorded period-instrument samples**.
- Realtime listening, WAV audio rendering and multitrack MIDI file export. Instrument timbres are represented by MIDI programs.
- Automatic local project persistence; multi-song folio with create, duplicate, delete and load.
- Offline service-worker cache, shared mobile runtime, app-specific icon, Pocket Works launcher return.

## Verification

Run app-local module test via \`node --test apps/folkarium/music.test.mjs\`. The complete site is validated through the standard repository pipeline. Check playback after a user gesture; browser audio cannot autoplay.

## Limitations

Wave export is rendered on-device and may take time on low-memory phones. Musical passages use algorithmic 2-bar motifs repeated with sectional variations. Better multisampling/articulations can replace the internal voices in a later release without changing saved score data.
