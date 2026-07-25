export const FORMAT_VERSION = 1;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function indexOfCell(x: number, y: number, width: number): number {
  return y * width + x;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function rleEncode(values: ArrayLike<number>): number[] {
  const output: number[] = [];
  if (values.length === 0) return output;
  let value = values[0];
  let count = 1;
  for (let i = 1; i < values.length; i += 1) {
    const next = values[i];
    if (next === value && count < 65535) {
      count += 1;
    } else {
      output.push(value, count);
      value = next;
      count = 1;
    }
  }
  output.push(value, count);
  return output;
}

export function rleDecode(encoded: number[], expectedLength: number): Uint16Array {
  if (!Array.isArray(encoded) || encoded.length % 2 !== 0) throw new Error('Invalid RLE payload');
  const output = new Uint16Array(expectedLength);
  let cursor = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    const value = encoded[i];
    const count = encoded[i + 1];
    if (!Number.isInteger(value) || !Number.isInteger(count) || count <= 0 || value < 0 || value > 65535) {
      throw new Error('Invalid RLE run');
    }
    if (cursor + count > expectedLength) throw new Error('RLE overflow');
    output.fill(value, cursor, cursor + count);
    cursor += count;
  }
  if (cursor !== expectedLength) throw new Error('RLE length mismatch');
  return output;
}

export function encodeSigned(values: Int16Array): number[] {
  return rleEncode(new Uint16Array(values.buffer.slice(0)));
}

export function decodeSigned(encoded: number[], expectedLength: number): Int16Array {
  const unsigned = rleDecode(encoded, expectedLength);
  return new Int16Array(unsigned.buffer);
}

export type ReactionRule = {
  with: number;
  minTemp?: number;
  maxTemp?: number;
  needsOxygen?: boolean;
  chance?: number;
  selfTo?: number;
  otherTo?: number;
  heat?: number;
  pressure?: number;
  gas?: number;
  spread?: boolean;
};

export function validateReactionRule(rule: ReactionRule): { ok: boolean; warning?: string } {
  if (!rule || !Number.isInteger(rule.with) || rule.with < 0) return { ok: false, warning: 'Не выбрано второе вещество.' };
  const chance = rule.chance ?? 1;
  if (!(chance > 0 && chance <= 1)) return { ok: false, warning: 'Вероятность должна быть больше 0 и не выше 100%.' };
  if (rule.minTemp !== undefined && rule.maxTemp !== undefined && rule.minTemp > rule.maxTemp) {
    return { ok: false, warning: 'Минимальная температура выше максимальной.' };
  }
  const createsNothing = rule.selfTo === undefined && rule.otherTo === undefined && !rule.gas && !rule.heat && !rule.pressure && !rule.spread;
  if (createsNothing) return { ok: false, warning: 'Правило ничего не меняет.' };
  const dangerousLoop = chance >= 0.8 && rule.spread && rule.selfTo === undefined && rule.otherTo === undefined && ((rule.heat ?? 0) > 0 || (rule.pressure ?? 0) > 0 || Boolean(rule.gas));
  if (dangerousLoop) return { ok: false, warning: 'Правило может бесконечно самовоспроизводиться. Добавьте превращение вещества или снизьте вероятность.' };
  const energeticLoop = chance >= 0.95 && (rule.heat ?? 0) > 500 && rule.selfTo === undefined && rule.otherTo === undefined;
  if (energeticLoop) return { ok: false, warning: 'Слишком мощная реакция без расхода реагентов.' };
  return { ok: true };
}

export function phaseTransition(material: { meltPoint?: number; boilPoint?: number; meltTo?: number; boilTo?: number; freezeTo?: number; condenseTo?: number }, temperature: number): number | null {
  if (material.boilTo !== undefined && material.boilPoint !== undefined && temperature >= material.boilPoint) return material.boilTo;
  if (material.meltTo !== undefined && material.meltPoint !== undefined && temperature >= material.meltPoint) return material.meltTo;
  if (material.freezeTo !== undefined && material.meltPoint !== undefined && temperature < material.meltPoint - 3) return material.freezeTo;
  if (material.condenseTo !== undefined && material.boilPoint !== undefined && temperature < material.boilPoint - 8) return material.condenseTo;
  return null;
}

export function diffuseTemperature(center: number, neighbors: number[], conductivity: number, heatCapacity: number): number {
  if (neighbors.length === 0) return center;
  const average = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
  const factor = clamp((conductivity / Math.max(0.1, heatCapacity)) * 0.08, 0, 0.45);
  return Math.round(center + (average - center) * factor);
}

export function migrateSave(raw: unknown): any {
  if (!raw || typeof raw !== 'object') throw new Error('Corrupted save');
  const value = raw as Record<string, any>;
  const version = Number(value.formatVersion ?? 0);
  if (version > FORMAT_VERSION) throw new Error('Save was created by a newer version');
  if (version === 0) {
    return {
      ...value,
      formatVersion: 1,
      camera: value.camera ?? { x: 0, y: 0, zoom: 1 },
      layer: value.layer ?? 'normal'
    };
  }
  return value;
}

export function validateSave(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (value.formatVersion !== FORMAT_VERSION) return false;
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height)) return false;
  if (value.width < 16 || value.height < 16 || value.width * value.height > 120000) return false;
  if (!Array.isArray(value.materials) || !Array.isArray(value.temperatures)) return false;
  return true;
}
