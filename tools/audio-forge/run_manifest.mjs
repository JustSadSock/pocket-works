import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const GENERATED_LIST = path.join(ROOT, '.audio-forge-generated.txt');
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function assertInside(base, candidate, label) {
  const absoluteBase = path.resolve(base);
  const absolute = path.resolve(base, candidate);
  if (absolute !== absoluteBase && !absolute.startsWith(`${absoluteBase}${path.sep}`)) {
    throw new Error(`${label} escapes its owning directory: ${candidate}`);
  }
  return absolute;
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options
  });
}

function commandExists(command) {
  try {
    execFileSync('bash', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function writePcm16Wav(filePath, samples, sampleRate = 44100, channels = 1) {
  const data = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const bytesPerSample = 2;
  const dataSize = data.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < data.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(data[index]) || 0));
    buffer.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
}

function loadSfxr() {
  const isolatedNodeModules = process.env.AUDIO_FORGE_NODE_MODULES;
  const candidates = [
    isolatedNodeModules ? path.join(isolatedNodeModules, 'jsfxr') : null,
    'jsfxr'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const loaded = require(candidate);
      return loaded.sfxr || loaded.default?.sfxr || loaded.default || loaded;
    } catch {
      // Try the next resolution path.
    }
  }

  throw new Error('jsfxr is unavailable. Install jsfxr@1.4.1 or set AUDIO_FORGE_NODE_MODULES.');
}

function synthesizeSfx(job, rawOutput) {
  const sfxr = loadSfxr();
  const seed = Number.isFinite(Number(job.seed)) ? Number(job.seed) : hashString(job.name || job.output || 'audio-forge');
  const previousRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    const sound = job.params || sfxr.generate(job.preset || 'random');
    const samples = sfxr.toBuffer(sound);
    const sampleRate = Number(sound?.sample_rate || sound?.sampleRate || job.sampleRate || 44100);
    writePcm16Wav(rawOutput, samples, sampleRate, 1);
  } finally {
    Math.random = previousRandom;
  }
}

function synthesizeAmbient(job, rawOutput) {
  const duration = Math.max(0.05, Number(job.duration || 4));
  const sampleRate = Math.max(8000, Number(job.sampleRate || 48000));
  const channels = Math.max(1, Math.min(2, Number(job.channels || 2)));
  const generator = String(job.generator || 'brownnoise').toLowerCase();
  const allowed = new Set(['whitenoise', 'pinknoise', 'brownnoise', 'sine', 'square', 'triangle', 'sawtooth', 'pluck']);
  if (!allowed.has(generator)) throw new Error(`Unsupported SoX ambient generator: ${generator}`);

  const synthArgs = ['-n', '-r', String(sampleRate), '-c', String(channels), rawOutput, 'synth', String(duration)];
  if (['sine', 'square', 'triangle', 'sawtooth', 'pluck'].includes(generator)) {
    const frequency = Math.max(20, Number(job.frequency || 220));
    synthArgs.push(generator, String(frequency));
  } else {
    synthArgs.push(generator);
  }
  run('sox', synthArgs);
}

function variableLength(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiNote(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(127, Math.round(Number(value))));
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(value || '').trim());
  if (!match) throw new Error(`Invalid MIDI note: ${value}`);
  const letter = match[1].toUpperCase();
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]);
  return Math.max(0, Math.min(127, (octave + 1) * 12 + NOTE_BASE[letter] + accidental));
}

function buildMidi(job, midiPath) {
  const ppq = 480;
  const tempo = Math.max(20, Math.min(300, Number(job.tempo || 100)));
  const microseconds = Math.round(60_000_000 / tempo);
  const channel = Math.max(0, Math.min(15, Number(job.channel || 0)));
  const program = Math.max(0, Math.min(127, Number(job.program || 0)));
  const events = [];

  events.push({ tick: 0, priority: 0, bytes: [0xff, 0x51, 0x03, (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff] });
  events.push({ tick: 0, priority: 1, bytes: [0xc0 | channel, program] });

  const notes = Array.isArray(job.notes) ? job.notes : [];
  if (notes.length === 0) throw new Error(`Music job ${job.name || job.output} has no notes.`);

  for (const item of notes) {
    const startBeat = Math.max(0, Number(item.beat || 0));
    const durationBeat = Math.max(0.02, Number(item.duration || 1));
    const startTick = Math.round(startBeat * ppq);
    const endTick = Math.max(startTick + 1, Math.round((startBeat + durationBeat) * ppq));
    const note = midiNote(item.note);
    const velocity = Math.max(1, Math.min(127, Math.round(Number(item.velocity || 88))));
    const noteChannel = Math.max(0, Math.min(15, Number(item.channel ?? channel)));
    events.push({ tick: startTick, priority: 2, bytes: [0x90 | noteChannel, note, velocity] });
    events.push({ tick: endTick, priority: 1, bytes: [0x80 | noteChannel, note, 0] });
  }

  events.sort((left, right) => left.tick - right.tick || left.priority - right.priority);
  const track = [];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = Buffer.alloc(14);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(ppq, 12);

  const trackHeader = Buffer.alloc(8);
  trackHeader.write('MTrk', 0);
  trackHeader.writeUInt32BE(track.length, 4);
  writeFileSync(midiPath, Buffer.concat([header, trackHeader, Buffer.from(track)]));
}

function findSoundfont() {
  const explicit = process.env.AUDIO_FORGE_SOUNDFONT;
  if (explicit && existsSync(explicit)) return explicit;
  const roots = ['/usr/share/sounds/sf2', '/usr/share/sounds/sf3'];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const candidate = readdirSync(root)
      .filter((name) => /\.(sf2|sf3)$/i.test(name))
      .sort()
      .map((name) => path.join(root, name))
      .find((file) => statSync(file).isFile());
    if (candidate) return candidate;
  }
  throw new Error('No SoundFont found. Set AUDIO_FORGE_SOUNDFONT or install fluid-soundfont-gm.');
}

function synthesizeMusic(job, rawOutput, tempDir) {
  const midiPath = path.join(tempDir, 'score.mid');
  buildMidi(job, midiPath);
  const soundfont = findSoundfont();
  const sampleRate = Math.max(8000, Number(job.sampleRate || 48000));
  const gain = Math.max(0.01, Math.min(10, Number(job.synthGain || 0.7)));
  run('fluidsynth', ['-ni', '-F', rawOutput, '-r', String(sampleRate), '-g', String(gain), soundfont, midiPath]);
}

function processWithSox(rawInput, output, job) {
  const post = job.post || {};
  const args = [rawInput, output];

  if (post.sampleRate) args.push('rate', String(Math.max(8000, Number(post.sampleRate))));
  if (post.channels) args.push('channels', String(Math.max(1, Math.min(2, Number(post.channels)))));
  if (post.highpass) args.push('highpass', String(Math.max(10, Number(post.highpass))));
  if (post.lowpass) args.push('lowpass', String(Math.max(20, Number(post.lowpass))));
  if (post.reverb) {
    const amount = Math.max(0, Math.min(100, Number(post.reverb)));
    args.push('reverb', String(amount));
  }
  if (post.fadeIn || post.fadeOut) {
    const fadeIn = Math.max(0, Number(post.fadeIn || 0));
    const fadeOut = Math.max(0, Number(post.fadeOut || 0));
    args.push('fade', 't', String(fadeIn), '0', String(fadeOut));
  }
  if (post.normalizeDb !== undefined) {
    const target = Math.max(-30, Math.min(0, Number(post.normalizeDb)));
    args.push('gain', '-n', String(target));
  }

  run('sox', args);
}

function validateJob(job) {
  if (!job || typeof job !== 'object') throw new Error('Audio job must be an object.');
  if (!job.name || typeof job.name !== 'string') throw new Error('Audio job requires a string name.');
  if (!['sfx', 'ambient', 'music'].includes(job.type)) throw new Error(`Unsupported audio job type for ${job.name}: ${job.type}`);
  if (!job.output || typeof job.output !== 'string') throw new Error(`Audio job ${job.name} requires output.`);
  if (!/\.(wav|ogg)$/i.test(job.output)) throw new Error(`Audio job ${job.name} output must be .wav or .ogg.`);
}

function generateManifest(manifestPath, baseDir, generated) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.jobs)) {
    throw new Error(`${manifestPath} must be an Audio Forge manifest v1 with jobs[].`);
  }

  for (const job of manifest.jobs) {
    validateJob(job);
    const output = assertInside(baseDir, job.output, `Output for ${job.name}`);
    mkdirSync(path.dirname(output), { recursive: true });
    const tempDir = mkdtempSync(path.join(tmpdir(), 'pocket-audio-forge-'));
    const rawOutput = path.join(tempDir, 'raw.wav');
    try {
      if (job.type === 'sfx') synthesizeSfx(job, rawOutput);
      else if (job.type === 'ambient') synthesizeAmbient(job, rawOutput);
      else synthesizeMusic(job, rawOutput, tempDir);
      processWithSox(rawOutput, output, job);
      if (!existsSync(output) || statSync(output).size < 128) throw new Error(`Generated audio is empty: ${output}`);
      generated.add(path.relative(ROOT, output).replaceAll(path.sep, '/'));
      console.log(`Generated ${job.type}: ${path.relative(ROOT, output)}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function changedApps(fromRef) {
  const output = execFileSync('git', ['diff', '--name-only', `${fromRef}..HEAD`], { encoding: 'utf8' });
  const slugs = new Set();
  for (const file of output.split(/\r?\n/)) {
    const match = /^apps\/([^/]+)\/audio-forge\//.exec(file.trim());
    if (match) slugs.add(match[1]);
  }
  return [...slugs].sort();
}

function generateApp(slug, generated) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Invalid app slug: ${slug}`);
  const appDir = path.join(ROOT, 'apps', slug);
  const manifestPath = path.join(appDir, 'audio-forge', 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Missing audio manifest: ${path.relative(ROOT, manifestPath)}`);
  generateManifest(manifestPath, appDir, generated);
}

function main() {
  if (!commandExists('sox')) throw new Error('SoX is required for Audio Forge.');
  const args = parseArgs(process.argv.slice(2));
  const generated = new Set();

  if (args.manifest) {
    const manifestPath = path.resolve(ROOT, String(args.manifest));
    const baseDir = path.resolve(ROOT, String(args.base || path.dirname(manifestPath)));
    generateManifest(manifestPath, baseDir, generated);
  } else if (args.app) {
    generateApp(String(args.app), generated);
  } else if (args['changed-from']) {
    const apps = changedApps(String(args['changed-from']));
    if (apps.length === 0) console.log('No changed Audio Forge app manifests found.');
    for (const slug of apps) generateApp(slug, generated);
  } else {
    throw new Error('Use --app <slug>, --changed-from <git-ref>, or --manifest <path> [--base <dir>].');
  }

  writeFileSync(GENERATED_LIST, [...generated].sort().join('\n') + (generated.size ? '\n' : ''));
}

main();
