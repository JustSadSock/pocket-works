// Visual-only cassette inertia. No changes to the PocketNet or audio clock.
const TAU = Math.PI * 2;
export function advanceDeckMotion(state, elapsedSeconds, playing, bpm = 108) {
 const dt = Math.min(0.05, Math.max(0, Number(elapsedSeconds) || 0));
 const tempo = Math.min(180, Math.max(60, Number(bpm) || 108));
 const target = playing ? (0.7 + tempo / 160) * TAU : 0;
 const response = playing ? 5.5 : 3.3;
 let velocity = Math.max(0, state.velocity + (target - state.velocity) * (1 - Math.exp(-response * dt)));
 if (!playing && velocity < 0.01) velocity = 0;
 const angle = ((state.angle + velocity * dt) % TAU + TAU) % TAU;
 return { angle, velocity };
}
