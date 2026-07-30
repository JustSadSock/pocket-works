const TEXT_HEADER_PATTERN = /^(?:EU5|EU4|CK3|VIC3|HOI4|IR|PDS)[A-Za-z0-9_-]*txt\s*/i;
const MAX_TEXT_BYTES = 220 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 64;
const MAX_TOKEN_COUNT = 12_000_000;
const MAX_DEPTH = 160;

export class SaveParseError extends Error {
  constructor(message, code = 'PARSE_ERROR', details = {}) {
    super(message);
    this.name = 'SaveParseError';
    this.code = code;
    this.details = details;
  }
}

export class UnsupportedSaveError extends SaveParseError {
  constructor(message, code = 'UNSUPPORTED_SAVE', details = {}) {
    super(message, code, details);
    this.name = 'UnsupportedSaveError';
  }
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/[.\-\s]+/g, '_')
    .toLowerCase();
}

function normalizeScalar(value) {
  const raw = String(value ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower === 'yes' || lower === 'true') return true;
  if (lower === 'no' || lower === 'false') return false;
  if (lower === 'none' || lower === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return raw;
}

function valueEquals(left, right) {
  if (left == null || right == null) return false;
  return normalizeKey(left) === normalizeKey(right);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9+\-.]/g, '');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asDisplayString(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

class ClausewitzTokenizer {
  constructor(text) {
    this.text = text;
    this.length = text.length;
    this.index = 0;
    this.buffered = null;
    this.tokens = 0;
  }

  peek() {
    if (this.buffered === null) this.buffered = this.#read();
    return this.buffered;
  }

  next() {
    const token = this.peek();
    this.buffered = null;
    if (token) {
      this.tokens += 1;
      if (this.tokens > MAX_TOKEN_COUNT) {
        throw new SaveParseError('Сохранение содержит слишком много токенов для безопасного разбора в браузере.', 'TOKEN_LIMIT', {
          limit: MAX_TOKEN_COUNT
        });
      }
    }
    return token;
  }

  #skipSpaceAndComments() {
    while (this.index < this.length) {
      const char = this.text[this.index];
      if (/\s/.test(char)) {
        this.index += 1;
        continue;
      }
      if (char === '#') {
        while (this.index < this.length && this.text[this.index] !== '\n') this.index += 1;
        continue;
      }
      break;
    }
  }

  #read() {
    this.#skipSpaceAndComments();
    if (this.index >= this.length) return null;

    const start = this.index;
    const char = this.text[this.index];
    if (char === '{' || char === '}' || char === '=') {
      this.index += 1;
      return { type: char, value: char, start, end: this.index };
    }

    if (char === '"') {
      this.index += 1;
      let result = '';
      while (this.index < this.length) {
        const current = this.text[this.index++];
        if (current === '"') break;
        if (current === '\\' && this.index < this.length) {
          const escaped = this.text[this.index++];
          if (escaped === 'n') result += '\n';
          else if (escaped === 'r') result += '\r';
          else if (escaped === 't') result += '\t';
          else result += escaped;
        } else {
          result += current;
        }
      }
      return { type: 'scalar', value: result, quoted: true, start, end: this.index };
    }

    while (this.index < this.length) {
      const current = this.text[this.index];
      if (/\s/.test(current) || current === '{' || current === '}' || current === '=' || current === '#') break;
      this.index += 1;
    }

    if (this.index === start) this.index += 1;
    return {
      type: 'scalar',
      value: this.text.slice(start, this.index),
      quoted: false,
      start,
      end: this.index
    };
  }
}

function mapToObject(map) {
  const output = {};
  for (const [key, value] of map.entries()) output[key] = value;
  return output;
}

function rememberField(context, key, value) {
  if (!context || context.fields.size >= 96) return;
  const normalized = normalizeKey(key);
  if (!context.fields.has(normalized)) {
    context.fields.set(normalized, value);
    return;
  }
  const current = context.fields.get(normalized);
  if (Array.isArray(current)) {
    if (current.length < 12) current.push(value);
  } else {
    context.fields.set(normalized, [current, value]);
  }
}

function flattenSummary(summary, target = {}, prefix = '', depth = 0) {
  if (!summary || depth > 2) return target;
  for (const [key, value] of Object.entries(summary.fields || {})) {
    const full = prefix ? `${prefix}_${key}` : key;
    if (!(full in target)) target[full] = value;
    if (!(key in target)) target[key] = value;
  }
  for (const [key, child] of Object.entries(summary.children || {})) {
    const full = prefix ? `${prefix}_${key}` : key;
    flattenSummary(child, target, full, depth + 1);
  }
  return target;
}

function pathLooksLike(path, pattern) {
  return path.some((segment) => pattern.test(normalizeKey(segment)));
}

function fieldFrom(fields, keys) {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (fields[normalized] !== undefined) return fields[normalized];
    for (const [candidate, value] of Object.entries(fields)) {
      if (candidate.endsWith(`_${normalized}`)) return value;
    }
  }
  return undefined;
}

function createVisitor() {
  const stack = [];
  const meta = new Map();
  const global = new Map();
  const countries = [];
  const ownerStats = new Map();
  const armyStats = new Map();
  const navyStats = new Map();
  const wars = [];
  const relations = [];
  const warnings = [];
  let maxDepth = 0;
  let anonymousBlocks = 0;

  function ownerBucket(map, owner) {
    const key = asDisplayString(owner);
    if (!key) return null;
    if (!map.has(key)) map.set(key, { count: 0, total: 0, secondary: 0, samples: 0 });
    return map.get(key);
  }

  return {
    enter(key, path) {
      const context = {
        key: asDisplayString(key) || '_anonymous',
        path,
        fields: new Map(),
        children: {},
        items: [],
        depth: stack.length
      };
      stack.push(context);
      maxDepth = Math.max(maxDepth, stack.length);
      if (stack.length > MAX_DEPTH) {
        throw new SaveParseError('Вложенность сохранения превышает безопасный предел.', 'DEPTH_LIMIT', { limit: MAX_DEPTH });
      }
      if (!key) anonymousBlocks += 1;
    },

    scalar(key, value, path) {
      const normalizedKey = normalizeKey(key);
      const normalizedValue = normalizeScalar(value);
      const current = stack.at(-1);
      rememberField(current, normalizedKey, normalizedValue);

      if (!global.has(normalizedKey)) global.set(normalizedKey, normalizedValue);
      if (pathLooksLike(path, /^(meta|metadata|meta_data|save_game|savegame)$/) && !meta.has(normalizedKey)) {
        meta.set(normalizedKey, normalizedValue);
      }
    },

    item(value) {
      const current = stack.at(-1);
      if (current && current.items.length < 32) current.items.push(normalizeScalar(value));
    },

    exit() {
      const context = stack.pop();
      if (!context) return;

      const summary = {
        fields: mapToObject(context.fields),
        children: context.children,
        items: context.items.slice(0, 12)
      };
      const direct = summary.fields;
      const flattened = flattenSummary(summary);
      const normalizedPath = context.path.map(normalizeKey);
      const parentKey = normalizeKey(context.path.at(-2));
      const contextKey = normalizeKey(context.key);

      const hasCountryShape = fieldFrom(flattened, ['tag', 'country_tag', 'country']) !== undefined
        || fieldFrom(flattened, ['treasury', 'gold', 'manpower', 'population']) !== undefined;
      const inCountryBranch = normalizedPath.some((segment) => /^(countries|country_manager|country_database|country)$/.test(segment));
      if ((hasCountryShape || inCountryBranch) && countries.length < 1200) {
        countries.push({ id: context.key, path: context.path.slice(), fields: flattened });
      }

      const owner = firstDefined(
        fieldFrom(direct, ['owner', 'country_owner', 'country', 'country_id']),
        fieldFrom(direct, ['controller'])
      );

      const control = numericValue(fieldFrom(direct, ['control', 'country_control', 'local_control']));
      const population = numericValue(fieldFrom(direct, ['population', 'total_population', 'pop_size', 'population_amount']));
      const locationShape = owner != null && (control != null || population != null)
        && (pathLooksLike(normalizedPath, /(location|province|territor|area)/) || parentKey === 'locations');
      if (locationShape) {
        const bucket = ownerBucket(ownerStats, owner);
        if (bucket) {
          bucket.count += 1;
          if (population != null) bucket.total += population;
          if (control != null) {
            bucket.secondary += control;
            bucket.samples += 1;
          }
        }
      }

      const armyShape = pathLooksLike(normalizedPath, /(^|_)(army|armies|land_unit|military_unit)(_|$)/)
        || fieldFrom(direct, ['regiments', 'soldiers', 'army_strength']) !== undefined;
      if (owner != null && armyShape) {
        const bucket = ownerBucket(armyStats, owner);
        if (bucket) {
          bucket.count += 1;
          bucket.total += numericValue(fieldFrom(direct, ['strength', 'soldiers', 'army_strength', 'men'])) || 0;
          bucket.secondary += numericValue(fieldFrom(direct, ['regiments', 'unit_count'])) || 0;
        }
      }

      const navyShape = pathLooksLike(normalizedPath, /(^|_)(navy|navies|fleet|fleets|ship)(_|$)/)
        || fieldFrom(direct, ['ships', 'ship_count', 'navy_strength']) !== undefined;
      if (owner != null && navyShape) {
        const bucket = ownerBucket(navyStats, owner);
        if (bucket) {
          bucket.count += 1;
          bucket.total += numericValue(fieldFrom(direct, ['ships', 'ship_count', 'navy_strength'])) || 0;
        }
      }

      const warShape = pathLooksLike(normalizedPath, /(^|_)(wars|war_database|active_wars)(_|$)/)
        || (fieldFrom(direct, ['attackers', 'defenders']) !== undefined && fieldFrom(direct, ['start_date', 'war_goal']) !== undefined);
      if (warShape && wars.length < 80) {
        wars.push({
          id: context.key,
          name: asDisplayString(firstDefined(fieldFrom(direct, ['name', 'war_name']), context.key)),
          startDate: asDisplayString(fieldFrom(direct, ['start_date', 'date'])),
          attackers: fieldFrom(direct, ['attackers', 'attacker']),
          defenders: fieldFrom(direct, ['defenders', 'defender']),
          goal: asDisplayString(fieldFrom(direct, ['war_goal', 'casus_belli', 'cb']))
        });
      }

      const relationShape = pathLooksLike(normalizedPath, /(relation|diplomacy|opinion)/)
        && fieldFrom(direct, ['opinion', 'relation', 'value']) !== undefined;
      if (relationShape && relations.length < 300) {
        relations.push({
          source: asDisplayString(firstDefined(fieldFrom(direct, ['source', 'from', 'owner']), context.path.at(-3))),
          target: asDisplayString(firstDefined(fieldFrom(direct, ['target', 'to', 'country']), context.key)),
          value: numericValue(fieldFrom(direct, ['opinion', 'relation', 'value'])),
          type: asDisplayString(fieldFrom(direct, ['type', 'relation_type']))
        });
      }

      const parent = stack.at(-1);
      if (parent && Object.keys(parent.children).length < 32) {
        const compact = {
          fields: Object.fromEntries(Object.entries(summary.fields).slice(0, 24)),
          children: Object.fromEntries(Object.entries(summary.children).slice(0, 8))
        };
        if (!parent.children[contextKey]) parent.children[contextKey] = compact;
      }
    },

    result() {
      if (anonymousBlocks > 0) warnings.push(`Обнаружено позиционных блоков: ${anonymousBlocks}. Они разобраны без названий.`);
      return { meta, global, countries, ownerStats, armyStats, navyStats, wars, relations, warnings, maxDepth };
    }
  };
}

function walkClausewitz(text) {
  const tokenizer = new ClausewitzTokenizer(text);
  const visitor = createVisitor();

  function parseSequence(path, stopOnBrace = false) {
    while (true) {
      const token = tokenizer.peek();
      if (!token) return;
      if (token.type === '}') {
        if (stopOnBrace) tokenizer.next();
        return;
      }
      if (token.type === '{') {
        tokenizer.next();
        visitor.enter(null, path.concat('_anonymous'));
        parseSequence(path.concat('_anonymous'), true);
        visitor.exit();
        continue;
      }

      const keyToken = tokenizer.next();
      const next = tokenizer.peek();
      if (next?.type !== '=') {
        visitor.item(keyToken.value, path);
        continue;
      }

      tokenizer.next();
      const valueToken = tokenizer.next();
      if (!valueToken) break;
      if (valueToken.type === '{') {
        const nextPath = path.concat(keyToken.value);
        visitor.enter(keyToken.value, nextPath);
        parseSequence(nextPath, true);
        visitor.exit();
      } else if (valueToken.type === 'scalar') {
        visitor.scalar(keyToken.value, valueToken.value, path);
      }
    }
  }

  parseSequence([]);
  return { visitor: visitor.result(), tokenCount: tokenizer.tokens };
}

function lookupMap(map, keys) {
  for (const key of keys) {
    const value = map.get(normalizeKey(key));
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function playerAliases(playerId, country) {
  const aliases = new Set();
  for (const value of [playerId, country?.id, country && fieldFrom(country.fields, ['tag', 'country_tag', 'id', 'database_id'])]) {
    const display = asDisplayString(value);
    if (display) aliases.add(normalizeKey(display));
  }
  return aliases;
}

function findOwnerStats(map, aliases) {
  for (const [key, value] of map.entries()) {
    if (aliases.has(normalizeKey(key))) return value;
  }
  return null;
}

function pickPlayerCountry(countries, playerId) {
  const normalizedPlayer = normalizeKey(playerId);
  if (normalizedPlayer) {
    const exact = countries.find((country) => {
      const tag = fieldFrom(country.fields, ['tag', 'country_tag', 'id', 'database_id']);
      return valueEquals(country.id, playerId) || valueEquals(tag, playerId);
    });
    if (exact) return exact;
  }

  return countries.find((country) => {
    const human = fieldFrom(country.fields, ['human', 'is_human', 'player_controlled', 'is_player']);
    return human === true || normalizeKey(human) === 'yes';
  }) || null;
}

function normalizeDate(value) {
  const text = asDisplayString(value);
  if (!text) return null;
  const match = text.match(/(-?\d{1,5})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return text;
  return `${match[1].padStart(4, '0')}.${match[2].padStart(2, '0')}.${match[3].padStart(2, '0')}`;
}

function buildSnapshot(parsed, sourceInfo, timings) {
  const { meta, global, countries, ownerStats, armyStats, navyStats, wars, relations, warnings, maxDepth } = parsed.visitor;
  const playerId = firstDefined(
    lookupMap(meta, ['player_country', 'player', 'played_country', 'country']),
    lookupMap(global, ['player_country', 'played_country', 'player'])
  );
  const playerCountry = pickPlayerCountry(countries, playerId);
  const fields = playerCountry?.fields || {};
  const aliases = playerAliases(playerId, playerCountry);
  const locations = findOwnerStats(ownerStats, aliases);
  const armies = findOwnerStats(armyStats, aliases);
  const navies = findOwnerStats(navyStats, aliases);

  const tag = asDisplayString(firstDefined(
    fieldFrom(fields, ['tag', 'country_tag']),
    playerCountry?.id,
    playerId
  ));
  const countryName = asDisplayString(firstDefined(
    fieldFrom(fields, ['name', 'country_name', 'display_name', 'localization_key']),
    lookupMap(meta, ['country_name']),
    tag
  ));
  const date = normalizeDate(firstDefined(
    lookupMap(meta, ['date', 'current_date', 'save_date']),
    lookupMap(global, ['date', 'current_date'])
  ));
  const version = asDisplayString(firstDefined(
    lookupMap(meta, ['version', 'game_version', 'save_game_version', 'savegame_version']),
    lookupMap(global, ['game_version', 'version'])
  ));

  const treasury = numericValue(fieldFrom(fields, ['treasury', 'gold', 'cash', 'money', 'current_treasury']));
  const income = numericValue(fieldFrom(fields, ['monthly_income', 'total_income', 'income', 'revenue']));
  const expenses = numericValue(fieldFrom(fields, ['monthly_expenses', 'total_expenses', 'expenses', 'expenditure']));
  const balance = numericValue(fieldFrom(fields, ['balance', 'monthly_balance', 'net_income']))
    ?? (income != null && expenses != null ? income - expenses : null);
  const manpower = numericValue(fieldFrom(fields, ['manpower', 'current_manpower', 'available_manpower']));
  const population = numericValue(fieldFrom(fields, ['population', 'total_population', 'country_population'])) ?? locations?.total ?? null;
  const territoryCount = numericValue(fieldFrom(fields, ['location_count', 'province_count', 'territory_count'])) ?? locations?.count ?? null;
  const averageControl = locations?.samples ? locations.secondary / locations.samples : numericValue(fieldFrom(fields, ['average_control', 'control']));

  const relationRows = relations
    .filter((relation) => {
      const source = normalizeKey(relation.source);
      const target = normalizeKey(relation.target);
      return aliases.has(source) || aliases.has(target);
    })
    .sort((a, b) => Math.abs(b.value || 0) - Math.abs(a.value || 0))
    .slice(0, 8);

  const activeWars = wars.filter((war) => {
    const haystack = normalizeKey(JSON.stringify(war));
    return [...aliases].some((alias) => alias && haystack.includes(alias));
  });

  const metricValues = [tag, date, treasury, population, territoryCount, manpower, armies?.count, navies?.count];
  const foundMetrics = metricValues.filter((value) => value !== null && value !== undefined && value !== '').length;
  const confidence = Math.max(0.2, Math.min(0.98, foundMetrics / metricValues.length));

  if (!playerCountry) warnings.push('Блок страны игрока не найден уверенно; часть показателей взята из метаданных.');
  if (!date) warnings.push('Дата кампании не распознана.');
  if (!tag) warnings.push('Идентификатор страны игрока не распознан.');

  return {
    schemaVersion: 1,
    metadata: {
      game: 'Europa Universalis V',
      version,
      date,
      playerCountryId: asDisplayString(playerId),
      tag,
      countryName,
      ruler: asDisplayString(fieldFrom(fields, ['ruler_name', 'current_ruler_name', 'monarch_name', 'head_of_state_name', 'ruler', 'monarch'])),
      sourceFileName: sourceInfo.fileName,
      sourceSize: sourceInfo.sourceSize,
      container: sourceInfo.container,
      encoding: sourceInfo.encoding,
      importedAt: new Date().toISOString()
    },
    economy: { treasury, income, expenses, balance },
    country: {
      population,
      territoryCount,
      averageControl,
      manpower
    },
    military: {
      armies: armies?.count ?? null,
      soldiers: armies?.total || null,
      regiments: armies?.secondary || null,
      fleets: navies?.count ?? null,
      ships: navies?.total || null
    },
    wars: activeWars.length ? activeWars : wars.slice(0, 12),
    relations: relationRows,
    diagnostics: {
      confidence,
      partial: confidence < 0.72,
      tokenCount: parsed.tokenCount,
      maxDepth,
      countryCandidates: countries.length,
      locationOwners: ownerStats.size,
      warnings,
      parseDurationMs: timings.parseDurationMs,
      decompressionDurationMs: timings.decompressionDurationMs,
      parser: 'chancellery-clausewitz-stream-v1'
    }
  };
}

function printableRatio(bytes) {
  if (!bytes.length) return 0;
  const sampleLength = Math.min(bytes.length, 64 * 1024);
  let printable = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const value = bytes[index];
    if (value === 9 || value === 10 || value === 13 || (value >= 32 && value <= 126) || value >= 160) printable += 1;
  }
  return printable / sampleLength;
}

function decodeText(bytes) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount < Math.max(4, utf8.length * 0.0005)) return { text: utf8, encoding: 'utf-8' };
  try {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  } catch {
    return { text: utf8, encoding: 'utf-8-lossy' };
  }
}

function stripTextHeader(text) {
  return text.replace(/^\uFEFF/, '').replace(TEXT_HEADER_PATTERN, '');
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readUInt32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) throw new SaveParseError('Повреждённая ZIP-структура.', 'ZIP_BOUNDS');
  return view.getUint32(offset, true);
}

function readUInt16(view, offset) {
  if (offset < 0 || offset + 2 > view.byteLength) throw new SaveParseError('Повреждённая ZIP-структура.', 'ZIP_BOUNDS');
  return view.getUint16(offset, true);
}

function decodeZipName(bytes, utf8) {
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function findEocd(bytes) {
  const view = viewOf(bytes);
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readUInt32(view, offset) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new UnsupportedSaveError('Браузер не поддерживает локальную распаковку ZIP Deflate.', 'DEFLATE_UNAVAILABLE');
  }
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  } catch (error) {
    throw new UnsupportedSaveError('Этот браузер не умеет распаковывать Deflate Raw.', 'DEFLATE_UNAVAILABLE', { cause: error?.message });
  }
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractZipEntries(bytes) {
  const view = viewOf(bytes);
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new SaveParseError('Центральный каталог ZIP не найден.', 'ZIP_DIRECTORY_MISSING');

  const entryCount = readUInt16(view, eocd + 10);
  const centralOffset = readUInt32(view, eocd + 16);
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new SaveParseError('В архиве слишком много файлов для сохранения EU5.', 'ZIP_ENTRY_LIMIT', { entryCount });
  }

  const entries = [];
  let totalUncompressed = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(view, cursor) !== 0x02014b50) throw new SaveParseError('Повреждён центральный каталог ZIP.', 'ZIP_DIRECTORY_CORRUPT');
    const flags = readUInt16(view, cursor + 8);
    const method = readUInt16(view, cursor + 10);
    const compressedSize = readUInt32(view, cursor + 20);
    const uncompressedSize = readUInt32(view, cursor + 24);
    const nameLength = readUInt16(view, cursor + 28);
    const extraLength = readUInt16(view, cursor + 30);
    const commentLength = readUInt16(view, cursor + 32);
    const localOffset = readUInt32(view, cursor + 42);
    const nameStart = cursor + 46;
    const name = decodeZipName(bytes.subarray(nameStart, nameStart + nameLength), Boolean(flags & 0x0800));
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > MAX_TEXT_BYTES || totalUncompressed > MAX_TEXT_BYTES) {
      throw new SaveParseError('Распакованный ZIP превышает безопасный размер.', 'ZIP_TOO_LARGE', {
        entry: name,
        totalUncompressed,
        limit: MAX_TEXT_BYTES
      });
    }

    if (flags & 0x0001) throw new UnsupportedSaveError('Зашифрованные ZIP-сохранения не поддерживаются.', 'ZIP_ENCRYPTED');
    if (readUInt32(view, localOffset) !== 0x04034b50) throw new SaveParseError('Локальный ZIP-заголовок повреждён.', 'ZIP_LOCAL_CORRUPT');
    const localNameLength = readUInt16(view, localOffset + 26);
    const localExtraLength = readUInt16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = compressed.slice();
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new UnsupportedSaveError(`Метод сжатия ZIP ${method} не поддерживается.`, 'ZIP_METHOD_UNSUPPORTED', { method });

    if (uncompressedSize && data.length !== uncompressedSize) {
      throw new SaveParseError(`Размер распакованного файла ${name} не совпадает с каталогом.`, 'ZIP_SIZE_MISMATCH');
    }
    entries.push({ name, data });
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function selectSaveText(entries) {
  const candidates = entries.filter((entry) => !entry.name.endsWith('/'));
  const gameState = candidates.find((entry) => /(^|\/)gamestate$/i.test(entry.name))
    || candidates.find((entry) => /gamestate/i.test(entry.name))
    || candidates.find((entry) => /\.eu5$/i.test(entry.name))
    || candidates.sort((a, b) => b.data.length - a.data.length)[0];
  if (!gameState) throw new SaveParseError('В ZIP-контейнере нет gamestate.', 'GAMESTATE_MISSING');

  const metadata = candidates.find((entry) => /(^|\/)(meta|metadata)$/i.test(entry.name));
  const decodedGame = decodeText(gameState.data);
  const decodedMeta = metadata ? decodeText(metadata.data) : null;
  return {
    text: `${decodedMeta ? `${stripTextHeader(decodedMeta.text)}\n` : ''}${stripTextHeader(decodedGame.text)}`,
    encoding: decodedMeta && decodedMeta.encoding !== decodedGame.encoding
      ? `${decodedMeta.encoding}+${decodedGame.encoding}`
      : decodedGame.encoding,
    entries: candidates.map((entry) => entry.name)
  };
}

function isZip(bytes) {
  return bytes.length >= 4 && viewOf(bytes).getUint32(0, true) === 0x04034b50;
}

function looksBinary(bytes) {
  const firstText = new TextDecoder('ascii', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 32)));
  if (/EU5bin|EU5binary|binary/i.test(firstText)) return true;
  return printableRatio(bytes) < 0.72;
}

export async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function parseCampaignBuffer(buffer, options = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const fileName = options.fileName || 'campaign.eu5';
  if (!bytes.length) throw new SaveParseError('Файл пуст.', 'EMPTY_FILE');
  if (bytes.length > MAX_TEXT_BYTES) {
    throw new SaveParseError('Сохранение слишком велико для безопасной обработки на телефоне.', 'FILE_TOO_LARGE', {
      size: bytes.length,
      limit: MAX_TEXT_BYTES
    });
  }

  const startedAt = performance.now();
  let decompressionDurationMs = 0;
  let text;
  let encoding;
  let container;
  let entries = [];

  if (isZip(bytes)) {
    container = 'zip';
    const decompressStarted = performance.now();
    const extracted = await extractZipEntries(bytes);
    decompressionDurationMs = performance.now() - decompressStarted;
    const selected = selectSaveText(extracted);
    text = selected.text;
    encoding = selected.encoding;
    entries = selected.entries;
  } else {
    if (looksBinary(bytes)) {
      throw new UnsupportedSaveError(
        'Обнаружено бинарное или Ironman-сохранение. Для этой версии требуется таблица токенов EU5; файл не был прочитан частично или выдуманно.',
        'BINARY_SAVE_UNSUPPORTED',
        { signature: [...bytes.subarray(0, 12)] }
      );
    }
    container = 'plaintext';
    const decoded = decodeText(bytes);
    text = stripTextHeader(decoded.text);
    encoding = decoded.encoding;
  }

  if (!text.includes('=') || !text.includes('{')) {
    throw new SaveParseError('Файл не похож на текстовое сохранение Paradox.', 'NOT_CLAUSEWITZ_TEXT');
  }

  const parseStarted = performance.now();
  const parsed = walkClausewitz(text);
  const parseDurationMs = performance.now() - parseStarted;
  const snapshot = buildSnapshot(parsed, {
    fileName,
    sourceSize: bytes.length,
    container,
    encoding
  }, { parseDurationMs, decompressionDurationMs });

  snapshot.diagnostics.totalDurationMs = performance.now() - startedAt;
  snapshot.diagnostics.zipEntries = entries;
  snapshot.hash = await sha256Hex(bytes);
  return snapshot;
}

export async function parseCampaignFile(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new SaveParseError('Не выбран файл сохранения.', 'NO_FILE');
  const buffer = await file.arrayBuffer();
  return parseCampaignBuffer(buffer, { ...options, fileName: file.name || options.fileName });
}

export const parserInternals = {
  normalizeKey,
  normalizeScalar,
  walkClausewitz,
  extractZipEntries,
  stripTextHeader
};
