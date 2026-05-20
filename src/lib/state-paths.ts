import path from 'node:path';
import { homedir } from 'node:os';

function isEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function isDevelopmentMode(): boolean {
  const explicit = process.env.TMUX_WEB_MODE?.trim().toLowerCase();
  if (explicit === 'development' || explicit === 'dev') return true;
  if (isEnabled(process.env.TMUX_WEB_DEV)) return true;
  return process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
}

export function getDataRoot(): string {
  return isDevelopmentMode()
    ? path.join(homedir(), '.dev', '.tmux-web')
    : path.join(homedir(), '.tmux-web');
}

export function getConfigRoot(): string {
  return isDevelopmentMode()
    ? path.join(homedir(), '.dev', '.config')
    : path.join(homedir(), '.config');
}

export function getSettingsPath(): string {
  return path.join(getConfigRoot(), 'tmux-web', 'settings.json');
}

export function getPluginDir(): string {
  return path.join(getDataRoot(), 'node_modules');
}

export function getExtensionDataDir(extId: string): string {
  return path.join(getDataRoot(), 'extensions', extId);
}
