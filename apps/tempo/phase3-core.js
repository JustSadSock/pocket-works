export const PRIVACY_STORAGE_KEY = 'pocket-works:tempo:privacy';
export const FOUNDATION_STORAGE_KEY = 'pocket-works:tempo:state';
export const EXPERIMENT_STORAGE_KEY = 'pocket-works:tempo:phase2:state';
export const BACKUP_SCHEMA = 'tempo-encrypted-backup';
export const BACKUP_VERSION = 1;
export const PBKDF2_ITERATIONS = 250000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function safeJsonParse(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function readStoredData(storage, key, fallback = {}) {
  const envelope = safeJsonParse(storage?.getItem?.(key), null);
  if (!envelope || typeof envelope !== 'object') return fallback;
  const data = envelope.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : fallback;
}

export function scoreMedian(values) {
  const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

export function weekKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - day);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

export function weeklySeries(episodes, metric = 'control', limit = 8) {
  const groups = new Map();
  for (const item of Array.isArray(episodes) ? episodes : []) {
    const key = weekKey(item.occurredAt || item.createdAt);
    const value = Number(item[metric]);
    if (!key || !Number.isFinite(value)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-Math.max(1, limit))
    .map(([week, values]) => ({ week, value: scoreMedian(values), count: values.length }));
}

export function summarizeHome(foundation, phase2 = {}) {
  const episodes = Array.isArray(foundation?.episodes) ? foundation.episodes : [];
  const checkIns = Array.isArray(foundation?.checkIns) ? foundation.checkIns : [];
  const sessions = Array.isArray(foundation?.techniqueSessions) ? foundation.techniqueSessions : [];
  const active = (Array.isArray(phase2?.experiments) ? phase2.experiments : []).find((item) => item.status === 'active') || null;
  const latestCheck = [...checkIns].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))[0] || null;
  const recentEpisodes = [...episodes]
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 8);
  return {
    totalEntries: episodes.length + checkIns.length + sessions.length,
    episodeCount: episodes.length,
    activeExperiment: active,
    medianControl: scoreMedian(recentEpisodes.map((item) => item.control)),
    medianPleasure: scoreMedian(recentEpisodes.map((item) => item.pleasure)),
    latestPenetrationDesire: latestCheck?.penetrationDesire ?? null,
    controlSeries: weeklySeries(episodes, 'control'),
    pleasureSeries: weeklySeries(episodes, 'pleasure')
  };
}

export function nextAction(summary) {
  if (!summary || summary.totalEntries === 0) {
    return { tone: 'start', title: 'Сначала точка отсчёта', body: 'Запиши обычный эпизод без попытки что-либо улучшить. Этого достаточно для старта.', action: 'episode' };
  }
  if (summary.episodeCount < 3) {
    return { tone: 'collect', title: `Ещё ${3 - summary.episodeCount} наблюдения до первой сводки`, body: 'Пока не меняй сразу несколько условий. Собери короткую базовую серию.', action: 'episode' };
  }
  if (!summary.activeExperiment) {
    return { tone: 'test', title: 'Можно проверить одну гипотезу', body: 'База уже есть. Выбери одну технику, средство или условие и сравни его отдельно.', action: 'experiments' };
  }
  return { tone: 'active', title: `Продолжить: ${summary.activeExperiment.title}`, body: 'Следующая запись автоматически предложит нужную группу эксперимента.', action: 'episode' };
}

export function journalKindFromElement(element) {
  return element?.querySelector?.('[data-delete-kind]')?.dataset?.deleteKind || 'other';
}

export function filterJournalItems(items, filter) {
  const normalized = filter || 'all';
  return [...items].map((item) => {
    const kind = journalKindFromElement(item);
    const visible = normalized === 'all' || normalized === kind;
    return { item, kind, visible };
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(passphrase, salt, usage) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

export function collectTempoStorage(storage) {
  const data = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith('pocket-works:tempo')) data[key] = storage.getItem(key);
  }
  return data;
}

export async function encryptBackup(storageData, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 6) throw new Error('Passphrase must contain at least 6 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const plaintext = encoder.encode(JSON.stringify({ exportedAt: new Date().toISOString(), storage: storageData }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
}

export async function decryptBackup(payload, passphrase) {
  if (payload?.schema !== BACKUP_SCHEMA || payload?.version !== BACKUP_VERSION) throw new Error('Unsupported backup format');
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const key = await deriveKey(passphrase, salt, ['decrypt']);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Incorrect passphrase or damaged backup');
  }
  const decoded = safeJsonParse(decoder.decode(plaintext), null);
  if (!decoded || typeof decoded.storage !== 'object') throw new Error('Damaged backup content');
  for (const keyName of Object.keys(decoded.storage)) {
    if (!keyName.startsWith('pocket-works:tempo')) throw new Error('Backup contains foreign application data');
  }
  return decoded;
}

export async function hashPin(pin, salt = null) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must contain 4–8 digits');
  const actualSalt = salt ? base64ToBytes(salt) : crypto.getRandomValues(new Uint8Array(16));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...actualSalt, ...encoder.encode(String(pin))])));
  return { salt: bytesToBase64(actualSalt), hash: bytesToBase64(digest) };
}

export async function verifyPin(pin, record) {
  if (!record?.salt || !record?.hash) return false;
  const calculated = await hashPin(pin, record.salt);
  return calculated.hash === record.hash;
}
