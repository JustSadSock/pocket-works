import path from 'node:path';

// Only runtime assets are eligible for published fingerprints. Keep .txt:
// several Quick applications load text chunks as executable or narrative data.
const SOURCE_DIRS = new Set([
  'source', 'public', '.dist', 'server', 'web', '.godot',
  'node_modules', 'qa', 'test', 'tests', '__tests__', 'asset-forge',
  'audio-forge', 'screenshots', 'docs', 'coverage', 'test-results',
  'playwright-report', '.github'
]);
const ROOT_FILES = new Set([
  'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json',
  'project.godot', 'export_presets.cfg', 'README.md', 'AGENTS.md',
  'progress.md', '.env', '.env.example'
]);
const SOURCE_EXTENSIONS = /(?:\.map|\.py|\.pyc|\.blend\d*|\.psd|\.aseprite|\.gd|\.ts|\.tsx|\.log|\.md)$/i;
const TEST_PATTERN = /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.(?:js|mjs|cjs)$/i;

export function shouldPublishAppPath(relative, isDirectory = false) {
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.some(part => part.startsWith('.') && part !== '.well-known')) return false;
  if (SOURCE_DIRS.has(parts[0])) return false;
  if (parts.length === 1 && ROOT_FILES.has(parts[0])) return false;
  if (parts.some(part => ['__pycache__', '.pytest_cache'].includes(part))) return false;
  if (isDirectory) return true;
  if (SOURCE_EXTENSIONS.test(relative) || TEST_PATTERN.test(relative)) return false;
  return true;
}

export function shouldPublishSharedPath(relative, isDirectory = false) {
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (parts.some(part => ['__pycache__', '__tests__', 'tests'].includes(part))) return false;
  return isDirectory || (!SOURCE_EXTENSIONS.test(relative) && !TEST_PATTERN.test(relative));
}

export function shouldPublishGodotWebPath(relative, isDirectory = false) {
  if (isDirectory) return true;
  return !/(?:\.map|\.md|\.log)$/i.test(path.posix.basename(relative));
}
