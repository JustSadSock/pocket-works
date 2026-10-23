// Original Web Audio event palette: no samples, requests, or runtime dependencies.
// All nodes are short-lived; audio follows phase commits, never an arbitrary timer.
const PALETTE = {
  tap:      { notes: [310], duration: .070, gain: .017, wave: "triangle", drop: .86 },
  ready:    { notes: [293, 392], duration: .14, gain: .025, wave: "triangle", drop: 1.18 },
  move:     { notes: [205], duration: .095, gain: .018, wave: "triangle", drop: .67 },
  champion: { notes: [184, 246], duration: .13, gain: .029, wave: "triangle", drop: .84 },
  priest:   { notes: [523, 659, 783], duration: .28, gain: .022, wave: "sine", drop: 1.015 },
  guard:    { notes: [162, 97], duration: .14, gain: .036, wave: "sawtooth", drop: .53 },
  beast:    { notes: [112, 76], duration: .22, gain: .046, wave: "sawtooth", drop: .65 },
  thief:    { notes: [540, 390], duration: .13, gain: .018, wave: "triangle", drop: .77 },
  conflict: { notes: [180, 121, 82], duration: .36, gain: .045, wave: "sawtooth", drop: .48 },
  crown:    { notes: [392, 494, 587, 784], duration: .45, gain: .028, wave: "triangle", drop: 1.015 },
  shield:   { notes: [630, 880], duration: .25, gain: .018, wave: "sine", drop: 1.03 },
  seal:     { notes: [450, 320], duration: .22, gain: .029, wave: "triangle", drop: .72 }
};
export const COURT_SOUNDS = Object.freeze(Object.keys(PALETTE));

export function playCourtSound(ctx, name = "tap") {
  if (!ctx) return false;
  const recipe = PALETTE[name] || PALETTE.tap;
  const now = ctx.currentTime;
  try {
    if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});
    const bus = ctx.createGain();
    bus.gain.value = .85;
    bus.connect(ctx.destination);
    recipe.notes.forEach((note, i) => {
      const t = now + i * (name === "crown" ? .082 : .024);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = recipe.wave;
      osc.frequency.setValueAtTime(note, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, note * recipe.drop), t + recipe.duration);
      env.gain.setValueAtTime(.0001, t);
      env.gain.exponentialRampToValueAtTime(recipe.gain / (1 + i * .48), t + .008);
      env.gain.exponentialRampToValueAtTime(.0001, t + recipe.duration);
      osc.connect(env);
      env.connect(bus);
      osc.start(t);
      osc.stop(t + recipe.duration + .012);
      osc.onended = () => { osc.disconnect(); env.disconnect(); };
    });
    // A tiny deterministic papery transient provides physical attack on hard actions.
    if (["guard", "beast", "conflict", "seal"].includes(name) && ctx.createBuffer && ctx.createBufferSource) {
      const count = Math.max(1, Math.floor(ctx.sampleRate * .052));
      const buffer = ctx.createBuffer(1, count, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) {
        // Deliberately deterministic to avoid spending entropy or needing samples.
        data[i] = Math.sin(i * 89.17) * Math.sin(i * 17.7) * Math.pow(1 - i / count, 2) * .19;
      }
      const source = ctx.createBufferSource();
      const transientGain = ctx.createGain();
      source.buffer = buffer;
      transientGain.gain.value = name === "conflict" ? .16 : .09;
      source.connect(transientGain);
      transientGain.connect(bus);
      source.start(now);
      source.stop(now + .053);
      source.onended = () => { source.disconnect(); transientGain.disconnect(); };
    }
    return true;
  } catch {
    return false;
  }
}
