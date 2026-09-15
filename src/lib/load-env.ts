import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDataRoot } from './state-paths.js';

export function getEnvFilePath(): string {
  return path.join(getDataRoot(), '.env');
}

/** Load KEY=VALUE pairs from ~/.tmux-web/.env (shell env wins). */
export function loadDotEnv(): void {
  const envPath = getEnvFilePath();
  if (!existsSync(envPath)) return;

  let content: string;
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    return;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

