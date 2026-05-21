import type { TmuxWebSettings } from './settings.js';
import { readSettings, writeSettings } from './settings.js';
import { cmdAdd, cmdRemove } from './plugins.js';
import { upsertEnvVar } from './load-env.js';

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
    id: 'github-actions',
    label: 'GitHub Actions extension',
    description: 'sidebar CI status for workflow runs',
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
