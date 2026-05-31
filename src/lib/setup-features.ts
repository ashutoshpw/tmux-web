import type { TmuxWebSettings } from './settings.js';
import { readSettings, writeSettings } from './settings.js';
import { cmdAdd, cmdRemove } from './plugins.js';
import { upsertEnvVar } from './load-env.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const GITHUB_ACTIONS_PKG = '@tmux-web/ext-github-actions';

export type SetupFeature = {
  id: string;
  label: string;
  description: string;
  kind: 'builtin' | 'extension';
  isEnabled: (cfg: TmuxWebSettings) => boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

export const SETUP_FEATURES: SetupFeature[] = [
  {
    id: 'commandbar',
    label: 'Command bar',
    description: '⌘K session search + quick actions',
    kind: 'builtin',
    isEnabled: (cfg) => cfg.commandbar === true,
    async enable() {
      const cfg = await readSettings();
      await writeSettings({ ...cfg, commandbar: true });
      console.log('✓ command bar enabled');
    },
    async disable() {
      const cfg = await readSettings();
      await writeSettings({ ...cfg, commandbar: false });
      console.log('✓ command bar disabled');
    },
  },
  {
    id: 'agents',
    label: 'Agents page',
    description: 'watch AI agents (Claude, Codex, OpenCode, Cursor) in recently-viewed panes',
    kind: 'builtin',
    isEnabled: (cfg) => cfg.agents === true,
    async enable() {
      const cfg = await readSettings();
      await writeSettings({ ...cfg, agents: true });
      console.log('✓ agents page enabled');
    },
    async disable() {
      const cfg = await readSettings();
      await writeSettings({ ...cfg, agents: false });
      console.log('✓ agents page disabled');
    },
  },
  {
    id: 'github-actions',
    label: 'GitHub Actions extension',
    description: 'sidebar CI status for workflow runs (requires GitHub CLI: gh auth login)',
    kind: 'extension',
    isEnabled: (cfg) => (cfg.plugins ?? []).includes(GITHUB_ACTIONS_PKG),
    async enable() {
      await cmdAdd(GITHUB_ACTIONS_PKG);
    },
    async disable() {
      await cmdRemove(GITHUB_ACTIONS_PKG);
    },
  },
];

export async function writeGithubPat(pat: string): Promise<string> {
  return upsertEnvVar('GITHUB_PAT', pat);
}

export async function verifyGithubCliAuth(): Promise<void> {
  try {
    await execFileAsync('gh', ['auth', 'status'], { env: process.env });
    console.log('✓ GitHub CLI authenticated');
  } catch {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT) {
      console.log('✓ GitHub token found in environment (GH_TOKEN, GITHUB_TOKEN, or GITHUB_PAT)');
      return;
    }
    console.log('⚠ GitHub CLI is not authenticated. Run `gh auth login` to enable the GitHub Actions sidebar.');
    console.log('  Alternatively set GH_TOKEN or GITHUB_PAT in ~/.tmux-web/.env for headless/server use.');
  }
}
