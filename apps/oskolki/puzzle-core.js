const marker = /^\s*(?:(?:\d{1,4}[.)]|\d{1,4}\s*[-:])\s*|[-*•]\s+)/u;

export function parseItems(source) {
  const lines = String(source).replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').split('\n');
  const marked = lines.some((line) => marker.test(line));
  const items = [];
  let current = '';
  let collectingList = false;
  const flush = () => {
    if (current.trim()) items.push(current.trim().replace(/\s+/gu, ' '));
    current = '';
    collectingList = false;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }
    const match = marker.exec(line);
    if (match) {
      flush();
      current = line.slice(match[0].length).trim();
      collectingList = true;
    } else if (marked && collectingList) {
      current += (current ? ' ' : '') + trimmed;
    } else {
      flush();
      current = trimmed;
    }
  }
  flush();
  return items.filter(Boolean);
}

export function graphemes(text) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}

export function segmentsFor(text) {
  const trimmed = text.trim();
  if (/\s/u.test(trimmed)) return { units: trimmed.split(/\s+/u), separator: ' ' };
  if (typeof Intl.Segmenter === 'function') {
    const units = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(trimmed)]
      .map((part) => part.segment).filter((part) => part.trim());
    if (units.length > 1) return { units, separator: '' };
  }
  return { units: graphemes(trimmed), separator: '' };
}

export function fragmentText(text) {
  const { units, separator } = segmentsFor(text);
  if (!units.length) return [];
  if (units.length === 1) return [units[0]];
  const target = Math.min(units.length, 10, Math.max(2, Math.ceil(units.length / 1.3)));
  const output = [];
  let offset = 0;
  for (let i = 0; i < target; i++) {
    const remaining = units.length - offset;
    const amount = Math.ceil(remaining / (target - i));
    output.push(units.slice(offset, offset + amount).join(separator));
    offset += amount;
  }
  return output;
}

export function shuffledIds(count) {
  const values = Array.from({ length: count }, (_, i) => i);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  if (count > 1 && values.every((value, i) => value === i)) {
    [values[0], values[count - 1]] = [values[count - 1], values[0]];
  }
  return values;
}

export function makeRound(text) {
  const parts = fragmentText(text);
  return { text, parts, bank: shuffledIds(parts.length), answer: [], checked: false, skipped: false, right: 0, accuracy: 0 };
}

export function correctPositions(parts, answer) {
  return answer.reduce((count, id, index) => count + Number(parts[id] === parts[index]), 0);
}
