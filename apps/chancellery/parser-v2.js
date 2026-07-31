import { parseCampaignFile as parseBaseCampaign, SaveParseError } from './parser.js';

const decoder = new TextDecoder('utf-8');
const MAX_BLOCK = 180 * 1024 * 1024;
const aliases = {
  locations: ['locations', 'location_database', 'provinces', 'territories'],
  estates: ['estates', 'estate_manager', 'social_estates'],
  markets: ['markets', 'market_database'],
  loans: ['loans', 'active_loans', 'debt']
};

function key(value) { return String(value ?? '').trim().replace(/^"|"$/g, '').replace(/[.\-\s]+/g, '_').toLowerCase(); }
function scalar(value) {
  const raw = String(value ?? '').trim();
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (/^(yes|true)$/i.test(raw)) return true;
  if (/^(no|false)$/i.test(raw)) return false;
  if (/^(none|null)$/i.test(raw)) return null;
  return raw;
}
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function first(object, names) { for (const name of names) if (object?.[name] !== undefined) return object[name]; return undefined; }
function text(value) { return value == null || typeof value === 'object' ? null : String(value); }

function findEnd(bytes, view, offset, length) {
  const end = offset + length;
  if (offset < 0 || end > bytes.length) throw new SaveParseError('Повреждённый ZIP-контейнер.', 'CORRUPT_ZIP');
  return bytes.slice(offset, end);
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new SaveParseError('Браузер не умеет распаковать Deflate.', 'DEFLATE_UNAVAILABLE');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipGamestate(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i += 1) {
    if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new SaveParseError('ZIP не содержит центрального каталога.', 'CORRUPT_ZIP');
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  let fallback = null;
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new SaveParseError('Повреждён каталог ZIP.', 'CORRUPT_ZIP');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(findEnd(bytes, view, cursor + 46, nameLength));
    const candidate = { method, compressedSize, uncompressedSize, localOffset, name };
    if (!fallback && /(?:^|\/)(?:gamestate|savegame|state)(?:\.|$)/i.test(name)) fallback = candidate;
    if (/gamestate$/i.test(name)) { fallback = candidate; break; }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!fallback) throw new SaveParseError('В ZIP не найден gamestate.', 'GAMESTATE_NOT_FOUND');
  const local = fallback.localOffset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new SaveParseError('Повреждена запись gamestate.', 'CORRUPT_ZIP');
  const localName = view.getUint16(local + 26, true);
  const localExtra = view.getUint16(local + 28, true);
  const packed = findEnd(bytes, view, local + 30 + localName + localExtra, fallback.compressedSize);
  const unpacked = fallback.method === 0 ? packed : fallback.method === 8 ? await inflateRaw(packed) : null;
  if (!unpacked) throw new SaveParseError(`Метод ZIP ${fallback.method} не поддерживается.`, 'ZIP_METHOD_UNSUPPORTED');
  if (unpacked.length > MAX_BLOCK || fallback.uncompressedSize > MAX_BLOCK) throw new SaveParseError('Gamestate слишком велик для безопасного анализа.', 'SAVE_TOO_LARGE');
  return decoder.decode(unpacked);
}

async function sourceText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return unzipGamestate(buffer);
  return decoder.decode(bytes).replace(/^(?:EU5|PDS)[A-Za-z0-9_-]*txt\s*/i, '');
}

function skipQuoted(source, index) {
  index += 1;
  while (index < source.length) {
    if (source[index] === '\\') index += 2;
    else if (source[index++] === '"') break;
  }
  return index;
}
function skipComment(source, index) { while (index < source.length && source[index] !== '\n') index += 1; return index; }
function balanced(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '"') { i = skipQuoted(source, i) - 1; continue; }
    if (source[i] === '#') { i = skipComment(source, i); continue; }
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return i;
  }
  return -1;
}
function namedBlock(source, names) {
  for (const name of names) {
    const expression = new RegExp(`(?:^|\\s)${name}\\s*=\\s*\\{`, 'i');
    const match = expression.exec(source);
    if (!match) continue;
    const open = source.indexOf('{', match.index);
    const close = balanced(source, open);
    if (close > open) return source.slice(open + 1, close);
  }
  return null;
}

function tokenize(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (/\s/.test(char)) { i += 1; continue; }
    if (char === '#') { i = skipComment(source, i); continue; }
    if ('{}='.includes(char)) { tokens.push(char); i += 1; continue; }
    if (char === '"') {
      i += 1; let value = '';
      while (i < source.length && source[i] !== '"') { value += source[i] === '\\' && i + 1 < source.length ? source[++i] : source[i]; i += 1; }
      i += 1; tokens.push(value); continue;
    }
    const start = i;
    while (i < source.length && !/[\s{}=#]/.test(source[i])) i += 1;
    tokens.push(source.slice(start, i));
  }
  return tokens;
}

function parseBlock(source) {
  const tokens = tokenize(source); let index = 0;
  function put(target, rawKey, value) {
    const name = key(rawKey);
    if (target[name] === undefined) target[name] = value;
    else if (Array.isArray(target[name])) target[name].push(value);
    else target[name] = [target[name], value];
  }
  function object() {
    const output = {}; const items = [];
    while (index < tokens.length) {
      if (tokens[index] === '}') { index += 1; break; }
      const current = tokens[index++];
      if (tokens[index] !== '=') { items.push(scalar(current)); continue; }
      index += 1;
      if (tokens[index] === '{') { index += 1; put(output, current, object()); }
      else put(output, current, scalar(tokens[index++]));
    }
    if (items.length) output._items = items;
    return output;
  }
  return object();
}

function childObjects(container) {
  const rows = [];
  for (const [id, value] of Object.entries(container || {})) {
    if (id === '_items') continue;
    for (const item of Array.isArray(value) ? value : [value]) if (item && typeof item === 'object') rows.push([id, item]);
  }
  return rows;
}
function namesFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(namesFrom);
  if (typeof value !== 'object') return [String(value)];
  const list = [];
  for (const [name, amount] of Object.entries(value)) {
    if (name === '_items') list.push(...namesFrom(amount));
    else if (typeof amount === 'number' || amount === true || typeof amount === 'object') list.push(name);
  }
  return [...new Set(list)];
}

function locationRows(container, playerTag) {
  return childObjects(container).map(([id, row]) => {
    const owner = text(first(row, ['owner', 'country_owner', 'country', 'controller']));
    return {
      id: String(id), name: text(first(row, ['name', 'display_name'])) || String(id), owner,
      controller: text(first(row, ['controller'])), control: number(first(row, ['control', 'country_control', 'local_control'])),
      population: number(first(row, ['population', 'total_population', 'pop_size', 'population_amount'])),
      good: text(first(row, ['good', 'trade_good', 'raw_material', 'resource'])), culture: text(first(row, ['culture', 'dominant_culture'])),
      religion: text(first(row, ['religion', 'dominant_religion'])), market: text(first(row, ['market', 'market_id', 'market_owner'])),
      buildings: namesFrom(first(row, ['buildings', 'building', 'building_levels'])), food: number(first(row, ['food', 'food_balance', 'local_food'])),
      unrest: number(first(row, ['unrest', 'local_unrest', 'discontent'])), x: number(first(row, ['x', 'map_x', 'longitude'])), y: number(first(row, ['y', 'map_y', 'latitude'])),
      isPlayerOwned: owner ? key(owner) === key(playerTag) : false
    };
  }).filter((row) => row.owner || row.population !== null || row.control !== null);
}
function summaryRows(container, type) {
  return childObjects(container).map(([id, row]) => {
    if (type === 'estate') return { id, name: text(first(row, ['name', 'type'])) || id, power: number(first(row, ['power', 'influence', 'clout'])), satisfaction: number(first(row, ['satisfaction', 'loyalty', 'approval'])) };
    if (type === 'market') return { id, name: text(first(row, ['name'])) || id, owner: text(first(row, ['owner', 'country'])), value: number(first(row, ['value', 'market_value', 'size'])) };
    return { id, amount: number(first(row, ['amount', 'principal', 'value', 'size'])) || 0, interest: number(first(row, ['interest', 'rate'])), lender: text(first(row, ['lender', 'creditor'])) };
  });
}
function counts(list, field) {
  const map = new Map();
  for (const item of list) { const value = item[field]; if (value) map.set(value, (map.get(value) || 0) + 1); }
  return [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export async function parseCampaignFile(file) {
  const base = await parseBaseCampaign(file);
  const raw = await sourceText(file);
  const parse = (name) => { const block = namedBlock(raw, aliases[name]); return block ? parseBlock(block) : {}; };
  const locations = locationRows(parse('locations'), base.metadata?.tag);
  const estates = summaryRows(parse('estates'), 'estate');
  const markets = summaryRows(parse('markets'), 'market');
  const loans = summaryRows(parse('loans'), 'loan').filter((loan) => loan.amount || loan.interest !== null);
  const owned = locations.filter((item) => item.isPlayerOwned || !base.metadata?.tag);
  const population = owned.reduce((sum, item) => sum + (item.population || 0), 0);
  const controls = owned.map((item) => item.control).filter(Number.isFinite);
  const totalDebt = loans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
  const warnings = [...(base.diagnostics?.warnings || [])];
  if (!locations.length) warnings.push('Контейнер территорий не найден: карта и локальная диагностика будут пустыми.');
  return {
    ...base,
    schemaVersion: 2,
    campaignKey: `${base.metadata?.tag || 'unknown'}:${base.metadata?.startDate || base.metadata?.version || 'unknown'}`,
    country: {
      ...base.country,
      population: base.country?.population ?? (population || null),
      territoryCount: owned.length || base.country?.territoryCount,
      averageControl: controls.length ? controls.reduce((a, b) => a + b, 0) / controls.length : base.country?.averageControl
    },
    economy: { ...base.economy, loans: loans.length, totalDebt },
    locations, estates, markets, loans,
    goods: counts(owned, 'good'), cultures: counts(owned, 'culture'), religions: counts(owned, 'religion'),
    diagnostics: { ...base.diagnostics, warnings, partial: base.diagnostics?.partial || !locations.length, entityCounts: { locations: locations.length, estates: estates.length, markets: markets.length, loans: loans.length } }
  };
}
