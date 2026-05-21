import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getDataRoot, getSettingsPath } from './state-paths.js';
import { readSettings } from './settings.js';
import { cmdAdd, cmdRemove, getPluginDir } from './plugins.js';
import { getEnvFilePath } from './load-env.js';
import { SETUP_FEATURES, writeGithubPat } from './setup-features.js';
import { promptYesNo, promptSecret, requireTty } from './setup-prompts.js';

const DATA_ROOT = getDataRoot();
const PLUGIN_DIR = getPluginDir();
const CONFIG_DISPLAY = getSettingsPath();

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export { cmdAdd, cmdRemove };

type SetupFlags = {
  commandbar?: boolean;
  githubActions?: boolean;
  yes?: boolean;
};

function parseSetupArgs(argv: string[]): SetupFlags {
  const flags: SetupFlags = {};
  for (const arg of argv) {
    switch (arg) {
      case '--yes':
      case '-y':
        flags.yes = true;
        break;
      case '--commandbar':
        flags.commandbar = true;
        break;
      case '--no-commandbar':
        flags.commandbar = false;
        break;
      case '--github-actions':
        flags.githubActions = true;
        break;
      case '--no-github-actions':
        flags.githubActions = false;
        break;
    }
  }
  return flags;
}

function flagKey(id: string): keyof SetupFlags {
  return id === 'github-actions' ? 'githubActions' : 'commandbar';
}

export async function cmdSetup(argv: string[]): Promise<void> {
  const args = argv[0] === 'setup' ? argv.slice(1) : argv;
  const flags = parseSetupArgs(args);
  const nonInteractive = flags.yes || flags.commandbar !== undefined || flags.githubActions !== undefined;

  if (!nonInteractive) requireTty();

  const cfg = await readSettings();
  console.log('tmux-web setup\n');
  console.log('Configure optional features.\n');

  const selections = new Map<string, boolean>();

  for (const feature of SETUP_FEATURES) {
    const key = flagKey(feature.id);
    let enabled: boolean;

    if (flags.yes) {
      enabled = true;
    } else if (flags[key] !== undefined) {
      enabled = flags[key] as boolean;
    } else {
      const currently = feature.isEnabled(cfg);
      enabled = await promptYesNo(
        `${feature.label} (${feature.description})`,
        currently,
      );
    }

    selections.set(feature.id, enabled);
  }

  for (const feature of SETUP_FEATURES) {
    const enabled = selections.get(feature.id)!;
    if (enabled) {
      await feature.enable();
    } else {
      await feature.disable();
    }
  }

  const githubOn = selections.get('github-actions') === true;
  if (githubOn && !nonInteractive) {
    const pat = await promptSecret('GitHub PAT (optional, press Enter to skip)');
    if (pat) {
      const envPath = await writeGithubPat(pat);
      console.log(`✓ saved GITHUB_PAT to ${envPath} (loaded automatically on startup)`);
    }
  }

  console.log(`\nDone. Settings: ${CONFIG_DISPLAY}`);
  if (existsSync(getEnvFilePath())) {
    console.log(`Env file:    ${getEnvFilePath()}`);
  }
  console.log('Restart tmux-web to apply UI changes.');
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

export function printVersion(): void {
  console.log(version);
}

export function printUsage(): void {
  const dataDirDisplay = DATA_ROOT;
  const envDisplay = getEnvFilePath();

  console.log(`tmux-web — terminal-in-the-browser for tmux

Usage:
  tmux-web                       Start the server (PORT env var, default 3000)
  tmux-web -V, --version         Print version and exit
  tmux-web -h, --help            Show this help
  tmux-web setup                 Interactive feature setup
  tmux-web setup --yes           Enable all features without prompts
  tmux-web add <package>         Install a plugin and enable it
  tmux-web remove <package>      Uninstall a plugin and disable it
  tmux-web list                  Show enabled plugins

Files:
  ${CONFIG_DISPLAY}   settings (plugins, commandbar)
  ${envDisplay}       secrets (loaded automatically)
  ${dataDirDisplay}/  plugin installs + runtime state
`);
}
