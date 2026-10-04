export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

export function interpolateTrack(track, time) {
  if (!Array.isArray(track) || !track.length) return null;
  if (time <= track[0].t) return { ...track[0] };
  const last = track[track.length - 1];
  if (time >= last.t) return { ...last };
  for (let i = 0; i < track.length - 1; i += 1) {
    const a = track[i];
    const b = track[i + 1];
    if (time < a.t || time > b.t) continue;
    const span = Math.max(0.0001, b.t - a.t);
    const p = smooth(clamp((time - a.t) / span, 0, 1));
    return { ...a, ...b, t: time, x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), strength: lerp(a.strength ?? 1, b.strength ?? 1, p) };
  }
  return { ...last };
}

export function eventPressure(events, time, radius = 22) {
  return events.reduce((sum, event) => {
    const d = Math.abs(event.t - time);
    if (d > radius) return sum;
    const proximity = 1 - d / radius;
    return sum + proximity * (event.importance ?? 1);
  }, 0);
}

export function smartPlaybackMultiplier(events, time) {
  const pressure = eventPressure(events, time);
  if (pressure >= 7) return 0.18;
  if (pressure >= 4) return 0.35;
  if (pressure >= 2) return 0.6;
  return 1;
}

export function activeEvent(events, time, windowMinutes = 8) {
  let best = null;
  let bestDistance = Infinity;
  for (const event of events) {
    const distance = Math.abs(event.t - time);
    if (distance <= windowMinutes && distance < bestDistance) { best = event; bestDistance = distance; }
  }
  return best;
}

export function cameraCueAt(cues, time) {
  if (!cues?.length) return null;
  let previous = cues[0];
  let next = cues[cues.length - 1];
  for (let i = 0; i < cues.length; i += 1) {
    if (cues[i].t <= time) previous = cues[i];
    if (cues[i].t >= time) { next = cues[i]; break; }
  }
  if (previous === next) return { ...previous };
  const p = smooth(clamp((time - previous.t) / Math.max(1, next.t - previous.t), 0, 1));
  return { t: time, x: lerp(previous.x, next.x, p), y: lerp(previous.y, next.y, p), zoom: lerp(previous.zoom, next.zoom, p) };
}

export function formatClock(startMinutes, elapsedMinutes) {
  const total = Math.round(startMinutes + elapsedMinutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
