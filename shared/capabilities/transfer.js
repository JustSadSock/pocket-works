function safeFilename(value) {
  return String(value || 'pocket-works-export')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pocket-works-export';
}

export function serializeJson(value, spacing = 2) {
  return `${JSON.stringify(value, null, spacing)}\n`;
}

export function downloadJson(value, filename = 'pocket-works-export.json') {
  const blob = new Blob([serializeJson(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename(filename).endsWith('.json') ? safeFilename(filename) : `${safeFilename(filename)}.json`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(value) {
  const text = String(value);
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

export async function readJsonFile(file, options = {}) {
  if (!(file instanceof File)) throw new TypeError('A File object is required');
  const { maxBytes = 5_000_000, validate } = options;
  if (file.size > maxBytes) throw new RangeError(`JSON file exceeds ${maxBytes} bytes`);
  const value = JSON.parse(await file.text());
  if (validate && !validate(value)) throw new TypeError('Imported JSON failed validation');
  return value;
}

export function pickJsonFile(options = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.hidden = true;
    document.body.append(input);

    const cleanup = () => input.remove();
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      try {
        resolve(await readJsonFile(file, options));
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    }, { once: true });

    input.click();
  });
}
