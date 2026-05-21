import { readFileSync, existsSync } from 'node:fs';
import { writeFile, chmod, mkdir } from 'node:fs/promises';
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

/** Upsert a single key in the data-root .env file. */
export async function upsertEnvVar(key: string, value: string): Promise<string> {
  const envPath = getEnvFilePath();
  const line = `${key}=${value}\n`;

  let content = '';
  if (existsSync(envPath)) {
    content = readFileSync(envPath, 'utf-8');
  }

  const lines = content.length > 0 ? content.split('\n') : [];
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  let found = false;
  const out: string[] = [];

  for (const raw of lines) {
    if (pattern.test(raw)) {
      if (!found) {
        out.push(`${key}=${value}`);
        found = true;
      }
      continue;
    }
    out.push(raw);
  }

  if (!found) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(`${key}=${value}`);
  }

  const body = out.join('\n').replace(/\n*$/, '\n');
  await mkdir(path.dirname(envPath), { recursive: true });
  await writeFile(envPath, body, { mode: 0o600 });
  try {
    await chmod(envPath, 0o600);
  } catch {
    // best-effort on platforms that restrict chmod
  }

  process.env[key] = value;
  return envPath;
}
