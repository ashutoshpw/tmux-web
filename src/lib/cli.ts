import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getDataRoot, getSettingsPath } from './state-paths.js';

const DATA_ROOT   = getDataRoot();
const PLUGIN_DIR  = DATA_ROOT;
const CONFIG_PATH = getSettingsPath();
const CONFIG_DISPLAY = getSettingsPath();

interface Settings {
  plugins?: string[];
}

async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as Settings;
  } catch {
    return {};
  }
}

async function writeSettings(cfg: Settings): Promise<void> {
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

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

export async function cmdList(): Promise<void> {
  const cfg = await readSettings();
  const plugins = cfg.plugins ?? [];
  if (plugins.length === 0) {
    console.log('No plugins enabled. Add one with:\n  tmux-web add <package>');
    return;
  }
  console.log('Enabled plugins:');
  for (const p of plugins) {
    const installed = existsSync(path.join(PLUGIN_DIR, 'node_modules', p));
    console.log(`  ${installed ? '✓' : '✗'} ${p}${installed ? '' : '  (not installed — run: tmux-web add ' + p + ')'}`);
  }
}

export function printUsage(): void {
  const dataDirDisplay = DATA_ROOT;

  console.log(`tmux-web — terminal-in-the-browser for tmux

Usage:
  tmux-web                       Start the server (PORT env var, default 3000)
  tmux-web add <package>         Install a plugin and enable it
  tmux-web remove <package>      Uninstall a plugin and disable it
  tmux-web list                  Show enabled plugins

Files:
  ${CONFIG_DISPLAY}   plugin list
  ${dataDirDisplay}/                                                                         plugin installs + runtime state
`);
}
