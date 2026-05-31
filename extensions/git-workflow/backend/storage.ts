import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { PrInfo } from '@tmux-web/ext-gh-workflow';

const DATA_ROOT = process.env.TMUX_WEB_DATA_ROOT
  ?? path.join(os.homedir(), '.tmux-web');

const DATA_DIR  = process.env.EXT_DATA_DIR
  ?? path.join(DATA_ROOT, 'extensions', 'git-workflow');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

export interface PaneCache {
  session: string;
  paneId: string;
  panePath: string;
  windowIndex: number;
  branch: string;
  kind: 'local' | 'worktree';
  mainRepoPath: string | null;
  repoRoot: string;
  github: { nameWithOwner: string; org: string; repo: string };
  changes: { added: number; removed: number };
  dirty: boolean;
  ahead: number;
  behind: number;
  branches: string[];
  paneReady: boolean;
  fetchedAt: number;
  pr?: PrInfo | null;
}

interface Store {
  panes: Record<string, PaneCache>;
}

export function cacheKey(session: string, paneId: string, panePath: string): string {
  return `${session}|${paneId}|${panePath}`;
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(DATA_FILE, 'utf-8'));
  } catch {
    return { panes: {} };
  }
}

async function saveStore(store: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

export async function getCachedPane(key: string): Promise<PaneCache | null> {
  const store = await readStore();
  return store.panes[key] ?? null;
}

export async function setCachedPane(key: string, entry: PaneCache): Promise<void> {
  const store = await readStore();
  store.panes[key] = entry;
  await saveStore(store);
}
