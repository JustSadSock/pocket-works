# ECHOES

An interactive audiovisual organism for Pocket Works. Touch, drag, press and tilt to deform a luminous WebGL field. Signals create sound, decay into visual memory and can be captured into a local archive.

## Primary loop

1. Enter the signal.
2. Touch, drag or hold to create pressure waves.
3. Capture a field state into the archive.
4. Replay or export the stored echo.

## Controls

- Touch or drag the field: create and bend signals.
- Hold `HOLD TO SIGNAL`: sustain a strong pulse.
- Save icon: capture the current field to the local archive.
- Export icon: download the clean WebGL field as PNG.
- Archive: replay or remove saved echoes.
- System: sound, tilt, trail, intensity, density and theme.
- Workshop: diagnostics, update controls and app-owned data reset.

## Storage and offline

Preferences and up to eight compressed field captures use the `pocket-works:echoes` versioned local namespace. The app shell, vector icon and shared Pocket Works runtime are cached under `echoes-v1.0.0`.

## Progressive enhancement

WebGL2 and device orientation improve the experience but are not required to open the app. Unsupported devices retain the CSS organism and all interface controls; field capture/export report the missing WebGL capability instead of failing silently.
