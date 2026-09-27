import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isInside = (rootPath, path) => path.startsWith(`${rootPath}${sep}`);
const validPath = (path) => typeof path === 'string' && !path.includes('\\') && !path.startsWith('/') && path.split('/').every((part) => part && part !== '.' && part !== '..');
const checksum = async (path) => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };

export function validateCompilerManifest(data) {
  const errors = [];
  if (data?.version !== 1 || !Array.isArray(data.jobs)) return ['expected version 1 and jobs array'];
  const outputs = new Set();
  for (const job of data.jobs) {
    if (!validPath(job.source) || !['.glb', '.gltf'].includes(extname(job.source))) errors.push('invalid source');
    if (!validPath(job.output) || extname(job.output) !== '.glb' || !job.output.startsWith('public/')) errors.push('output must be an app-local public/*.glb');
    if (outputs.has(job.output)) errors.push(`duplicate output: ${job.output}`);
    outputs.add(job.output);
    if (!['static', 'animated'].includes(job.profile)) errors.push(`invalid profile: ${job.profile}`);
    if (job.textureSize !== undefined && (![512, 1024, 2048].includes(job.textureSize))) errors.push('textureSize must be 512, 1024 or 2048');
  }
  return errors;
}

export function compilerArgs(job, binary, source, output) {
  const args = [binary, 'optimize', source, output,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(job.textureSize ?? 1024),
    '--flatten', 'false', '--join', 'false', '--instance', 'false', '--prune', 'false',
    '--simplify', job.profile === 'static' ? 'true' : 'false'];
  if (job.profile === 'static') args.push('--simplify-error', '0.0001');
  return args;
}

export async function compileForApp(slug, { projectRoot = root, runner = spawnSync } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid app slug');
  const appDir = join(projectRoot, 'apps', slug);
  const manifestPath = join(appDir, 'asset-compiler.json');
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const errors = validateCompilerManifest(manifest);
  if (errors.length) throw new Error(`${slug}: ${errors.join('; ')}`);
  const binary = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');
  const reports = [];
  for (const job of manifest.jobs) {
    const source = resolve(appDir, job.source), output = resolve(appDir, job.output);
    if (!isInside(appDir, source) || !isInside(appDir, output) || source === output) throw new Error('Asset compiler paths must remain separate inside the app');
    await stat(source);
    await mkdir(dirname(output), { recursive: true });
    const command = compilerArgs(job, binary, source, output);
    const result = runner(binary, command.slice(1), { cwd: projectRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
    if (result.status !== 0 || result.error) throw new Error(`Asset compile failed for ${slug}/${job.source}: ${result.error?.message ?? result.stderr ?? result.stdout}`);
    const header = Buffer.alloc(4);
    const { open } = await import('node:fs/promises');
    const handle = await open(output, 'r');
    try { await handle.read(header, 0, 4, 0); } finally { await handle.close(); }
    if (header.toString('ascii') !== 'glTF') throw new Error(`Compiler output is not GLB: ${job.output}`);
    const validation = runner(binary, ['validate', output], { cwd: projectRoot, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    if (validation.status !== 0 || validation.error) throw new Error(`Compiled GLB validation failed: ${job.output}: ${validation.error?.message ?? validation.stderr ?? validation.stdout}`);
    reports.push({ source: job.source, output: job.output, profile: job.profile, inputBytes: (await stat(source)).size, outputBytes: (await stat(output)).size, sourceSha256: await checksum(source), outputSha256: await checksum(output) });
  }
  await writeFile(join(appDir, 'asset-compiler.lock.json'), JSON.stringify({ version: 1, jobs: reports }, null, 2) + '\n');
  return reports;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--app');
  if (index < 0 || !args[index + 1]) { console.error('Usage: npm run assets:compile -- --app <slug>'); process.exit(2); }
  compileForApp(args[index + 1]).then((jobs) => console.log(`Compiled ${jobs.length} asset(s) for ${args[index + 1]}`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
