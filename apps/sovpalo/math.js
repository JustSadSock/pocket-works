export const DEFAULT_DAYS = 365;
export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 1000;

const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;

export function clampPeople(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 23;
  return Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, parsed));
}

function createLogFactorials(max) {
  const values = new Float64Array(max + 1);
  for (let index = 2; index <= max; index += 1) {
    values[index] = values[index - 1] + Math.log(index);
  }
  return values;
}

function logAdd(left, right) {
  if (left === NEGATIVE_INFINITY) return right;
  if (right === NEGATIVE_INFINITY) return left;
  const high = Math.max(left, right);
  const low = Math.min(left, right);
  return high + Math.log1p(Math.exp(low - high));
}

function toProbability(logProbability) {
  if (logProbability === NEGATIVE_INFINITY) return 0;
  if (logProbability >= 0) return 1;
  if (logProbability < -745) return 0;
  return Math.exp(logProbability);
}

function complementFromLog(logProbability) {
  if (logProbability === NEGATIVE_INFINITY) return 1;
  if (logProbability >= 0) return 0;
  return Math.min(1, Math.max(0, -Math.expm1(logProbability)));
}

function logFalling(total, count, logFactorials) {
  if (!Number.isInteger(count) || count < 0 || count > total) return NEGATIVE_INFINITY;
  return logFactorials[total] - logFactorials[total - count];
}

function exactPatternLogProbability(people, counts, days, logFactorials) {
  let groupedPeople = 0;
  let groupedDays = 0;
  let logDenominator = 0;

  for (const [sizeText, countValue] of Object.entries(counts)) {
    const size = Number(sizeText);
    const count = Number(countValue);
    if (!Number.isInteger(size) || size < 2 || !Number.isInteger(count) || count < 0) {
      return NEGATIVE_INFINITY;
    }
    if (count === 0) continue;
    groupedPeople += size * count;
    groupedDays += count;
    logDenominator += logFactorials[count] + count * logFactorials[size];
  }

  const singletons = people - groupedPeople;
  const occupiedDays = singletons + groupedDays;
  if (singletons < 0 || occupiedDays > days) return NEGATIVE_INFINITY;

  logDenominator += logFactorials[singletons];
  return logFalling(days, occupiedDays, logFactorials)
    + logFactorials[people]
    - logDenominator
    - people * Math.log(days);
}

function logProbabilityAtMostTwoPerDay(people, days, logFactorials) {
  if (people > days * 2) return NEGATIVE_INFINITY;
  let total = NEGATIVE_INFINITY;
  const minimumPairs = Math.max(0, people - days);
  const maximumPairs = Math.floor(people / 2);

  for (let pairs = minimumPairs; pairs <= maximumPairs; pairs += 1) {
    const singletons = people - pairs * 2;
    const occupiedDays = singletons + pairs;
    const logProbability = logFalling(days, occupiedDays, logFactorials)
      + logFactorials[people]
      - logFactorials[singletons]
      - logFactorials[pairs]
      - pairs * logFactorials[2]
      - people * Math.log(days);
    total = logAdd(total, logProbability);
  }

  return total;
}

function logProbabilityAtMostThreePerDay(people, days, logFactorials) {
  if (people > days * 3) return NEGATIVE_INFINITY;
  let total = NEGATIVE_INFINITY;

  for (let triples = 0; triples <= Math.floor(people / 3); triples += 1) {
    const remainingAfterTriples = people - triples * 3;
    const maximumPairs = Math.floor(remainingAfterTriples / 2);
    const minimumPairs = Math.max(0, people - triples * 2 - days);

    for (let pairs = minimumPairs; pairs <= maximumPairs; pairs += 1) {
      const singletons = remainingAfterTriples - pairs * 2;
      const occupiedDays = singletons + pairs + triples;
      if (occupiedDays > days) continue;

      const logProbability = logFalling(days, occupiedDays, logFactorials)
        + logFactorials[people]
        - logFactorials[singletons]
        - logFactorials[pairs]
        - logFactorials[triples]
        - pairs * logFactorials[2]
        - triples * logFactorials[3]
        - people * Math.log(days);
      total = logAdd(total, logProbability);
    }
  }

  return total;
}

function logProbabilityAtMostOneSharedDate(people, days, logFactorials) {
  const logUnique = people <= days
    ? logFalling(days, people, logFactorials) - people * Math.log(days)
    : NEGATIVE_INFINITY;

  let logExactlyOneSharedDate = NEGATIVE_INFINITY;
  const minimumGroupSize = Math.max(2, people - days + 1);

  for (let groupSize = minimumGroupSize; groupSize <= people; groupSize += 1) {
    const remaining = people - groupSize;
    if (remaining > days - 1) continue;

    const logChoosePeople = logFactorials[people]
      - logFactorials[groupSize]
      - logFactorials[remaining];
    const logAssignments = Math.log(days)
      + logChoosePeople
      + logFalling(days - 1, remaining, logFactorials)
      - people * Math.log(days);
    logExactlyOneSharedDate = logAdd(logExactlyOneSharedDate, logAssignments);
  }

  return logAdd(logUnique, logExactlyOneSharedDate);
}

function patternKey(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([size, count]) => `${size}x${count}`)
    .join('|') || 'unique';
}

function cloneCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([size, count]) => [String(size), count])
  );
}

function addPattern(patterns, people, counts, source = 'generated') {
  let grouped = 0;
  for (const [sizeText, count] of Object.entries(counts)) {
    grouped += Number(sizeText) * count;
  }
  if (grouped > people) return null;
  const key = patternKey(counts);
  if (!patterns.has(key)) {
    patterns.set(key, { key, counts: cloneCounts(counts), source });
  }
  return key;
}

function addCuratedPatterns(patterns, people) {
  addPattern(patterns, people, {}, 'canonical');

  for (let pairs = 1; pairs <= Math.min(12, Math.floor(people / 2)); pairs += 1) {
    addPattern(patterns, people, { 2: pairs }, pairs <= 3 ? 'canonical' : 'curated');
  }

  for (let triples = 1; triples <= Math.min(4, Math.floor(people / 3)); triples += 1) {
    const maximumPairs = Math.min(8, Math.floor((people - triples * 3) / 2));
    for (let pairs = 0; pairs <= maximumPairs; pairs += 1) {
      addPattern(patterns, people, { 2: pairs, 3: triples }, triples === 1 && pairs <= 1 ? 'canonical' : 'curated');
    }
  }

  for (let quartets = 1; quartets <= Math.min(2, Math.floor(people / 4)); quartets += 1) {
    for (let triples = 0; triples <= Math.min(2, Math.floor((people - quartets * 4) / 3)); triples += 1) {
      const maximumPairs = Math.min(6, Math.floor((people - quartets * 4 - triples * 3) / 2));
      for (let pairs = 0; pairs <= maximumPairs; pairs += 1) {
        addPattern(patterns, people, { 2: pairs, 3: triples, 4: quartets }, quartets === 1 && triples === 0 && pairs === 0 ? 'canonical' : 'curated');
      }
    }
  }

  for (let quintets = 1; quintets <= Math.min(2, Math.floor(people / 5)); quintets += 1) {
    const maximumPairs = Math.min(4, Math.floor((people - quintets * 5) / 2));
    for (let pairs = 0; pairs <= maximumPairs; pairs += 1) {
      addPattern(patterns, people, { 2: pairs, 5: quintets }, quintets === 1 && pairs === 0 ? 'canonical' : 'curated');
    }
  }

  addPattern(patterns, people, { [people]: 1 }, 'extreme');
}

function addModeNeighbourhood(patterns, people, days) {
  const lambda = people / days;
  const dimensions = [];
  let factorial = 1;

  for (let size = 2; size <= Math.min(8, people); size += 1) {
    factorial *= size;
    const expected = days * Math.exp(-lambda) * (lambda ** size) / factorial;
    if (size <= 4 || expected >= 0.06) {
      const base = Math.max(0, Math.round(expected));
      const values = [...new Set([
        Math.max(0, base - 1),
        base,
        base + 1
      ])];
      dimensions.push({ size, values });
    }
  }

  const counts = {};
  const walk = (index, usedPeople) => {
    if (index >= dimensions.length) {
      addPattern(patterns, people, counts, 'mode');
      return;
    }

    const { size, values } = dimensions[index];
    for (const count of values) {
      const nextUsed = usedPeople + size * count;
      if (nextUsed > people) continue;
      counts[size] = count;
      walk(index + 1, nextUsed);
    }
    delete counts[size];
  };

  walk(0, 0);
}

function buildScenarioCatalog(people, days, logFactorials) {
  const patterns = new Map();
  addCuratedPatterns(patterns, people);
  addModeNeighbourhood(patterns, people, days);

  const evaluated = [];
  for (const pattern of patterns.values()) {
    const logProbability = exactPatternLogProbability(people, pattern.counts, days, logFactorials);
    if (logProbability === NEGATIVE_INFINITY) continue;

    let groupedPeople = 0;
    let groupedDays = 0;
    const groups = [];
    for (const [sizeText, count] of Object.entries(pattern.counts)) {
      const size = Number(sizeText);
      if (count <= 0) continue;
      groupedPeople += size * count;
      groupedDays += count;
      groups.push({ size, count });
    }

    evaluated.push({
      ...pattern,
      groups: groups.sort((a, b) => b.size - a.size),
      singletons: people - groupedPeople,
      occupiedDays: people - groupedPeople + groupedDays,
      collisionGroups: groupedDays,
      logProbability,
      probability: toProbability(logProbability)
    });
  }

  evaluated.sort((a, b) => b.logProbability - a.logProbability);
  const compact = evaluated.slice(0, 8);
  const expanded = evaluated.slice(0, 14);
  const desiredKeys = [
    'unique',
    '2x1',
    '2x2',
    '3x1',
    '2x1|3x1',
    '4x1',
    `${people}x1`
  ];

  for (const key of desiredKeys) {
    const match = evaluated.find((item) => item.key === key);
    if (match && !expanded.some((item) => item.key === key)) expanded.push(match);
  }

  return {
    compact,
    expanded: expanded.slice(0, 20),
    totalEvaluated: evaluated.length
  };
}

export function createBirthdayModel(inputPeople, days = DEFAULT_DAYS) {
  const people = clampPeople(inputPeople);
  const logFactorials = createLogFactorials(Math.max(days, people));
  const logUnique = people <= days
    ? logFalling(days, people, logFactorials) - people * Math.log(days)
    : NEGATIVE_INFINITY;
  const logAtMostTwo = logProbabilityAtMostTwoPerDay(people, days, logFactorials);
  const logAtMostThree = logProbabilityAtMostThreePerDay(people, days, logFactorials);
  const logAtMostOneSharedDate = logProbabilityAtMostOneSharedDate(people, days, logFactorials);
  const emptyDayProbability = ((days - 1) / days) ** people;
  const singletonDayProbability = people * (1 / days) * (((days - 1) / days) ** (people - 1));
  const expectedSharedDates = days * (1 - emptyDayProbability - singletonDayProbability);
  const expectedOccupiedDays = days * (1 - emptyDayProbability);

  return {
    people,
    days,
    anyMatch: complementFromLog(logUnique),
    allUnique: toProbability(logUnique),
    logAllUnique: logUnique,
    tripleOrMore: complementFromLog(logAtMostTwo),
    quartetOrMore: complementFromLog(logAtMostThree),
    twoSharedDatesOrMore: complementFromLog(logAtMostOneSharedDate),
    expectedSharedDates,
    expectedDuplicatePeople: Math.max(0, people - expectedOccupiedDays),
    scenarios: buildScenarioCatalog(people, days, logFactorials)
  };
}

export function createSample(inputPeople, seed, days = DEFAULT_DAYS) {
  const people = clampPeople(inputPeople);
  const counts = new Uint16Array(days);
  let state = (Number(seed) >>> 0) || 0x9e3779b9;

  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let index = 0; index < people; index += 1) {
    counts[Math.floor(random() * days)] += 1;
  }

  const occupancy = new Map();
  let occupiedDays = 0;
  let sharedDates = 0;
  let largestGroup = 0;

  for (const count of counts) {
    if (count > 0) occupiedDays += 1;
    if (count > 1) sharedDates += 1;
    largestGroup = Math.max(largestGroup, count);
    occupancy.set(count, (occupancy.get(count) || 0) + 1);
  }

  return {
    counts: Array.from(counts),
    occupiedDays,
    sharedDates,
    largestGroup,
    occupancy,
    nextSeed: state >>> 0
  };
}

export function exactPatternProbability(inputPeople, counts, days = DEFAULT_DAYS) {
  const people = clampPeople(inputPeople);
  const logFactorials = createLogFactorials(Math.max(days, people));
  const logProbability = exactPatternLogProbability(people, counts, days, logFactorials);
  return {
    logProbability,
    probability: toProbability(logProbability)
  };
}
