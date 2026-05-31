import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getDataRoot, getSettingsPath, getThemePath } from './state-paths.js';
import { readSettings, writeSettings } from './settings.js';
import { readActiveTheme, setActiveThemeTemplate } from './theme-store.js';
import { isThemeTemplateId, THEME_TEMPLATE_IDS } from './themes/index.js';
import { cmdAdd, cmdRemove, getPluginDir } from './plugins.js';
import { getEnvFilePath } from './load-env.js';
import { SETUP_FEATURES, verifyGithubCliAuth } from './setup-features.js';
import { promptYesNo, promptChoice, requireTty } from './setup-prompts.js';

const DATA_ROOT = getDataRoot();
const PLUGIN_DIR = getPluginDir();
const CONFIG_DISPLAY = getSettingsPath();

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export { cmdAdd, cmdRemove };

type SetupFlags = {
  commandbar?: boolean;
  agents?: boolean;
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
      case '--agents':
        flags.agents = true;
        break;
      case '--no-agents':
        flags.agents = false;
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
  switch (id) {
    case 'github-actions': return 'githubActions';
    case 'agents': return 'agents';
    default: return 'commandbar';
  }
}

export async function cmdSetup(argv: string[]): Promise<void> {
  const args = argv[0] === 'setup' ? argv.slice(1) : argv;
  const flags = parseSetupArgs(args);
  const nonInteractive = flags.yes || flags.commandbar !== undefined || flags.agents !== undefined || flags.githubActions !== undefined;

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

  // Terminal renderer is a choice, not a feature toggle. Ask interactively,
  // defaulting to the saved renderer (xterm for a fresh install).
  let rendererChoice: 'xterm' | 'ghostty' | undefined;
  if (!nonInteractive) {
    const current = cfg.terminalRenderer === 'ghostty' ? 'ghostty' : 'xterm';
    rendererChoice = (await promptChoice(
      'Terminal renderer (xterm.js is the default; ghostty-web is experimental)',
      ['xterm', 'ghostty'],
      current,
    )) as 'xterm' | 'ghostty';
  }

  for (const feature of SETUP_FEATURES) {
    const enabled = selections.get(feature.id)!;
    if (enabled) {
      await feature.enable();
    } else {
      await feature.disable();
    }
  }

  if (rendererChoice) {
    const latest = await readSettings();
    await writeSettings({ ...latest, terminalRenderer: rendererChoice });
    console.log(`✓ terminal renderer set to ${rendererChoice}`);
  }

  const githubExtOn = selections.get('github-actions') === true
    || selections.get('git-workflow') === true;
  if (githubExtOn) {
    await verifyGithubCliAuth();
  }

  console.log(`\nDone. Settings: ${CONFIG_DISPLAY}`);
  if (existsSync(getEnvFilePath())) {
    console.log(`Env file:    ${getEnvFilePath()}`);
  }
  console.log('Restart tmux-web to apply UI changes.');
}

export async function cmdTheme(argv: string[]): Promise<void> {
  const [sub, arg] = argv;
  switch (sub) {
    case 'list': {
      console.log('Available themes:');
      for (const id of THEME_TEMPLATE_IDS) {
        console.log(`  ${id}`);
      }
      return;
    }
    case 'set': {
      if (!arg) {
        console.error('usage: tmux-web theme set <vscode|ghostty>');
        process.exit(1);
      }
      if (!isThemeTemplateId(arg)) {
        console.error(`unknown theme: ${arg}`);
        console.error('Run: tmux-web theme list');
        process.exit(1);
      }
      await setActiveThemeTemplate(arg);
      console.log(`✓ theme set to ${arg}`);
      console.log(`  ${getThemePath()}`);
      console.log('Restart tmux-web to apply.');
      return;
    }
    case 'show': {
      const theme = await readActiveTheme();
      console.log(`Active theme: ${theme.template}`);
      console.log(`Config file:  ${getThemePath()}`);
      return;
    }
    default:
      console.error('usage: tmux-web theme <list|set|show>');
      process.exit(1);
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

export function printVersion(): void {
  console.log(version);
}

export function printUsage(): void {
  const dataDirDisplay = DATA_ROOT;
  const envDisplay = getEnvFilePath();

  console.log(`tmux-web — terminal-in-the-browser for tmux

Usage:
  tmux-web                       Start the server (PORT env var, default 3000)
  tmux-web --ghostty             Start with ghostty-web instead of xterm.js
  tmux-web --xterm               Start with xterm.js explicitly
  tmux-web -V, --version         Print version and exit
  tmux-web -h, --help            Show this help
  tmux-web setup                 Interactive feature setup
  tmux-web setup --yes           Enable all features without prompts
  tmux-web add <package>         Install a plugin and enable it
  tmux-web remove <package>      Uninstall a plugin and disable it
  tmux-web list                  Show enabled plugins
  tmux-web theme list            List available themes
  tmux-web theme set <name>      Set active theme (vscode, ghostty)
  tmux-web theme show            Show active theme

Files:
  ${CONFIG_DISPLAY}   settings (plugins, commandbar)
  ${getThemePath()}   active theme (shell + terminal colors)
  ${envDisplay}       secrets (loaded automatically)
  ${dataDirDisplay}/  plugin installs + runtime state

Most of these are also editable from the browser at /settings and /settings/theme.

Env:
  TMUX_WEB_TERMINAL_RENDERER=xterm|ghostty   (also persistable via /settings)
`);
}
