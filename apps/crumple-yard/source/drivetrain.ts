export type Gear = 'drive' | 'reverse';

export type LongitudinalIntent = {
  gear: Gear;
  reverse: number;
  brake: number;
};

/**
 * The brake pedal is a two-stage brake/reverse control. Unlike a stateless
 * speed cutoff it must keep reverse engaged after the car starts moving.
 * Only explicit forward throttle exits reverse.
 */
export function longitudinalIntent(
  gear: Gear,
  speedMps: number,
  throttle: number,
  brake: number
): LongitudinalIntent {
  const t = Math.max(0, Math.min(1, throttle));
  const b = Math.max(0, Math.min(1, brake));
  const speed = Math.abs(speedMps);
  const nextGear = t > 0.15 ? 'drive' : t < 0.15 && b > 0.5 && speed < 1.2 ? 'reverse' : gear;
  const reversing = nextGear === 'reverse' && t < 0.15 && b > 0.1;
  return { gear: nextGear, reverse: reversing ? b * 0.65 : 0, brake: reversing ? 0 : b };
}
