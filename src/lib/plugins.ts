import { execFile, execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { getDataRoot } from './state-paths.js';
import { readSettings, writeSettings } from './settings.js';

const execFileAsync = promisify(execFile);

const PLUGIN_DIR = getDataRoot();

async function ensureInstallDir(): Promise<void> {
  await mkdir(PLUGIN_DIR, { recursive: true });
  const pj = path.join(PLUGIN_DIR, 'package.json');
  if (!existsSync(pj)) {
    await writeFile(pj, JSON.stringify({
      name:        'tmux-web-plugins',
      private:     true,
      version:     '1.0.0',
      description: 'tmux-web plugin install dir — managed by `tmux-web add/remove`',
    }, null, 2) + '\n');
  }
}

function runNpm(args: string[]): void {
  execFileSync('npm', args, { cwd: PLUGIN_DIR, stdio: 'inherit' });
}

export async function cmdAdd(pkg: string): Promise<void> {
  await ensureInstallDir();
  console.log(`▸ installing ${pkg}`);
  runNpm(['install', pkg]);

  const cfg = await readSettings();
  cfg.plugins ??= [];
  if (!cfg.plugins.includes(pkg)) {
    cfg.plugins.push(pkg);
    await writeSettings(cfg);
    console.log(`✓ enabled ${pkg}`);
  } else {
    console.log(`✓ ${pkg} already enabled`);
  }
}

export async function cmdRemove(pkg: string): Promise<void> {
  if (existsSync(path.join(PLUGIN_DIR, 'node_modules', pkg))) {
    console.log(`▸ uninstalling ${pkg}`);
    runNpm(['uninstall', pkg]);
  }

  const cfg = await readSettings();
  if (cfg.plugins?.includes(pkg)) {
    cfg.plugins = cfg.plugins.filter(p => p !== pkg);
    await writeSettings(cfg);
    console.log(`✓ disabled ${pkg}`);
  } else {
    console.log(`(${pkg} was not enabled)`);
  }
}

export function getPluginDir(): string {
  return PLUGIN_DIR;
}

// npm package name: optional @scope/, then name, with no shell metacharacters or
// a leading dash that could be read as an npm flag. Versions/tags (pkg@1.2.3) allowed.
const VALID_PKG = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~*>=<.-]+)?$/i;

export function isValidPackageName(pkg: string): boolean {
  return typeof pkg === 'string' && pkg.length > 0 && pkg.length <= 214 && VALID_PKG.test(pkg);
}

async function runNpmAsync(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('npm', args, { cwd: PLUGIN_DIR });
    return { ok: true, output: (stdout + stderr).trim() };
  } catch (err: any) {
    const output = [err?.stdout, err?.stderr, err?.message].filter(Boolean).join('\n').trim();
    return { ok: false, output: output || 'npm command failed' };
  }
}

// Web-facing siblings of cmdAdd/cmdRemove: non-blocking (async execFile so the
// server event loop keeps running during npm) and they capture output instead
// of inheriting stdio / calling process.exit.
export async function installPlugin(pkg: string): Promise<{ ok: boolean; output: string }> {
  if (!isValidPackageName(pkg)) return { ok: false, output: `invalid package name: ${pkg}` };
  await ensureInstallDir();
  const result = await runNpmAsync(['install', pkg]);
  if (!result.ok) return result;

  const cfg = await readSettings();
  cfg.plugins ??= [];
  if (!cfg.plugins.includes(pkg)) {
    cfg.plugins.push(pkg);
    await writeSettings(cfg);
  }
  return result;
}

export async function uninstallPlugin(pkg: string): Promise<{ ok: boolean; output: string }> {
  if (!isValidPackageName(pkg)) return { ok: false, output: `invalid package name: ${pkg}` };
  let output = '';
  if (existsSync(path.join(PLUGIN_DIR, 'node_modules', pkg))) {
    const result = await runNpmAsync(['uninstall', pkg]);
    if (!result.ok) return result;
    output = result.output;
  }

  const cfg = await readSettings();
  if (cfg.plugins?.includes(pkg)) {
    cfg.plugins = cfg.plugins.filter((p) => p !== pkg);
    await writeSettings(cfg);
  }
  return { ok: true, output };
}
