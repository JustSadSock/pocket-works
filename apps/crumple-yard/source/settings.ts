import type { VehicleId } from './config';

export type GameSettings = {
  vehicle: VehicleId;
  preset: number;
  sound: boolean;
  graphics: 'auto' | 'high' | 'balanced';
};

const KEY = 'pocket-works:crumple-yard:settings';

export const DEFAULT_SETTINGS: GameSettings = {
  vehicle: 'meridian',
  preset: 0,
  sound: true,
  graphics: 'auto'
};

export function loadSettings(): GameSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<GameSettings>;
    return {
      vehicle: parsed.vehicle === 'kestrel' || parsed.vehicle === 'meridian' || parsed.vehicle === 'bastion' ? parsed.vehicle : DEFAULT_SETTINGS.vehicle,
      preset: Number.isFinite(parsed.preset) ? Math.max(0, Math.min(2, Number(parsed.preset))) : 0,
      sound: parsed.sound !== false,
      graphics: parsed.graphics === 'high' || parsed.graphics === 'balanced' ? parsed.graphics : 'auto'
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browser contexts; gameplay remains usable.
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
