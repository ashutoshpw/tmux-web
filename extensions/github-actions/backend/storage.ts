import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const DATA_ROOT = process.env.TMUX_WEB_DATA_ROOT
  ?? path.join(os.homedir(), '.tmux-web');

// Host (tmux-web) injects EXT_DATA_DIR; fallback only matters when running the
// extension standalone for local dev.
const DATA_DIR  = process.env.EXT_DATA_DIR
  ?? path.join(DATA_ROOT, 'extensions', 'github-actions');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

interface Store {
  sessions: Record<string, string[]>;
}

async function read(): Promise<Store> {
  try {
    return JSON.parse(await readFile(DATA_FILE, 'utf-8'));
  } catch {
    return { sessions: {} };
  }
}

async function save(store: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

export async function getWorkflows(session: string): Promise<string[]> {
  const store = await read();
  return store.sessions[session] ?? [];
}

export async function addWorkflow(session: string, url: string): Promise<string[]> {
  const store = await read();
  store.sessions[session] ??= [];
  if (!store.sessions[session].includes(url)) store.sessions[session].push(url);
  await save(store);
  return store.sessions[session];
}

export async function removeWorkflow(session: string, index: number): Promise<string[]> {
  const store = await read();
  store.sessions[session]?.splice(index, 1);
  await save(store);
  return store.sessions[session] ?? [];
}
