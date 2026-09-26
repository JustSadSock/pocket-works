import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.POCKET_WORKS_SITE_ROOT || path.join(scriptDirectory, '..', 'dist-site'));
const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '4173', 10);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.wasm', 'application/wasm']
]);

function isInsideRoot(candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function loadStaticHeaders() {
  const rules = new Map();
  let source = '';
  try { source = await readFile(path.join(root, '_headers'), 'utf8'); } catch { return rules; }

  let current = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = line.trim();
      if (!current.includes('*') && !current.includes(':')) rules.set(current, {});
      else current = null;
      continue;
    }
    if (!current) continue;
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    rules.get(current)[match[1].trim()] = match[2].trim();
  }
  return rules;
}

const staticHeaders = await loadStaticHeaders();

async function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl || '/', `http://${host}:${port}`).pathname);
  const candidate = path.resolve(root, `.${pathname}`);
  if (!isInsideRoot(candidate)) return null;

  try {
    const details = await stat(candidate);
    if (details.isDirectory()) return path.join(candidate, 'index.html');
    if (details.isFile()) return candidate;
  } catch {
    return candidate.endsWith(path.sep) ? path.join(candidate, 'index.html') : candidate;
  }

  return null;
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolveRequestPath(request.url);
    if (!filePath || !isInsideRoot(filePath)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    const requestPath = decodeURIComponent(new URL(request.url || '/', `http://${host}:${port}`).pathname);
    const extension = path.extname(filePath).toLowerCase();
    const cacheControl = filePath.endsWith('sw.js') || extension === '.webmanifest' || filePath.endsWith('apps.json')
      ? 'no-store'
      : 'public, max-age=0, must-revalidate';

    const headers = {
      'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      ...(staticHeaders.get(requestPath) || {})
    };
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 404 : 500;
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(status === 404 ? 'Not found' : `Preview server error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`Pocket Works preview listening at http://${host}:${port} from ${root}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
