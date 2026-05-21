import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getDataRoot } from './state-paths.js';
import { readSettings, writeSettings } from './settings.js';

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
