# Нотограф 0.1.0
Audio capture/import, local 8192Hz resampling, YIN-style pitch estimation and spectral two-register detection. Register mode is NOT stem separation; one strongest note per register, not a full chord transcription. Fixed 4/4, manual tempo, sixteenth grid, rests and ties, sharp spelling, editable pitches, native synthesized playback, MusicXML/MIDI/print. Local score persistence, source held in memory. Limit: 60MB/180s, browser-dependent codecs. Sound Forge PR #1392 is not production-integrated; standalone Web Audio and standard MIDI interchange. Tests: node --test apps/notograph/core.test.mjs; qa/flow.spec.ts.

## 0.2.0 (research)
Local spectral polyphony tracks up to six detected candidates per frame and preserves simultaneous notes in separate monophonic notation lanes. It does not identify instruments. AI analysis imports a versioned JSON plus optional SHA-256-verified original WAV stems. The local Python companion runs real Demucs separation (4 stems, experimental 6-stem model option) and Basic Pitch per tonal stem; drums are audio only. Amplitude is a relative confidence indicator, not calibrated probability. Model weights may download on first invocation, but audio is processed locally. No browser inference or remote audio upload. Requires desktop Python 3.10/3.11, ffmpeg, and an isolated virtual environment; PyTorch CPU/CUDA wheels may need platform-specific installation. Model inference has not yet been qualified in CI.

```sh
python -m venv .venv
# Activate the virtual environment for your OS, then:
python -m pip install -r apps/notograph/lab/requirements.txt
python apps/notograph/lab/analyze.py recording.wav ./analysis --model htdemucs
# Select notograph.json and optional WAVs with Import AI analysis.
node --test apps/notograph/core.test.mjs apps/notograph/advanced.test.mjs
python -m unittest discover -s apps/notograph/lab -p 'test_*.py'
```

Sound Forge JSON exports manifest v2 with independent note lanes, explicit MIDI channels (excluding percussion), exact quantized start and duration, and default program choices by stem category (not identified instruments). It is an offline interchange format for PR #1392, not a browser runtime or an admitted recorded bank. Source split uses the real model outputs; the browser cannot reconstruct notes for drums. Limits 180 seconds, 15 notation lanes and 12,000 notes; invalid inputs fail explicitly.
