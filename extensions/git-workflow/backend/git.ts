import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const GIT_TIMEOUT_MS = 15_000;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

export function repoRoot(cwd: string): string | null {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    return null;
  }
}

export function worktreeRootDir(): string {
  return path.join(os.homedir(), '.worktrees');
}

export function classifyKind(cwd: string): 'local' | 'worktree' {
  const root = worktreeRootDir() + path.sep;
  return cwd.startsWith(root) ? 'worktree' : 'local';
}

export function buildWorktreePath(org: string, repo: string, id: string): string {
  return path.join(worktreeRootDir(), org, repo, id);
}

export function generateWorktreeId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[bytes[i]! % chars.length];
  }
  return out;
}

export function resolveMainRepoPath(repoRootPath: string): string | null {
  try {
    const out = git(['worktree', 'list', '--porcelain'], repoRootPath);
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) {
        return line.slice('worktree '.length).trim();
      }
    }
  } catch {
    // fall through
  }
  return repoRootPath;
}

export function parseCheckedOutBranches(worktreeListPorcelain: string): Set<string> {
  const branches = new Set<string>();
  for (const line of worktreeListPorcelain.split('\n')) {
    if (!line.startsWith('branch ')) continue;
    const ref = line.slice('branch '.length).trim();
    if (ref.startsWith('refs/heads/')) {
      branches.add(ref.slice('refs/heads/'.length));
    }
  }
  return branches;
}

export function isBranchCheckedOut(repoRootPath: string, branch: string): boolean {
  const trimmed = branch.trim();
  if (!trimmed) return false;

  try {
    return parseCheckedOutBranches(git(['worktree', 'list', '--porcelain'], repoRootPath)).has(trimmed);
  } catch {
    return false;
  }
}

export interface GitStatusInfo {
  branch: string;
  dirty: boolean;
  changes: { added: number; removed: number };
  ahead: number;
  behind: number;
}

export function getGitStatus(repoRootPath: string): GitStatusInfo {
  const branch = git(['branch', '--show-current'], repoRootPath) || 'HEAD';

  let added = 0;
  let removed = 0;
  let dirty = false;
  try {
    const porcelain = git(['status', '--porcelain'], repoRootPath);
    if (porcelain) {
      dirty = true;
      for (const line of porcelain.split('\n')) {
        if (!line.trim()) continue;
        const idx = line.slice(0, 2);
        if (idx[0] !== ' ' && idx[0] !== '?') added++;
        if (idx[1] !== ' ' && idx[1] !== '?') removed++;
        if (idx === '??') added++;
      }
    }
  } catch {
    dirty = false;
  }

  let ahead = 0;
  let behind = 0;
  try {
    const ab = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], repoRootPath);
    const [b, a] = ab.split('\t').map((n) => parseInt(n, 10));
    if (Number.isFinite(a)) ahead = a;
    if (Number.isFinite(b)) behind = b;
  } catch {
    // no upstream
  }

  return { branch, dirty, changes: { added, removed }, ahead, behind };
}

export function listBranchNames(repoRootPath: string): string[] {
  try {
    const out = git(['branch', '-a', '--format=%(refname:short)'], repoRootPath);
    const seen = new Set<string>();
    const branches: string[] = [];
    for (const raw of out.split('\n')) {
      let name = raw.trim();
      if (!name) continue;
      if (name.startsWith('origin/')) name = name.slice('origin/'.length);
      if (name === 'HEAD' || name.includes('->')) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      branches.push(name);
    }
    branches.sort((a, b) => a.localeCompare(b));
    return branches;
  } catch {
    return [];
  }
}

export type BranchExistsResult =
  | { exists: true; source: 'local' | 'remote' }
  | { exists: false };

export function branchExists(repoRootPath: string, branch: string): BranchExistsResult {
  const trimmed = branch.trim();
  if (!trimmed) return { exists: false };

  try {
    const local = git(['branch', '--list', trimmed], repoRootPath);
    if (local.trim()) return { exists: true, source: 'local' };
  } catch { /* ignore */ }

  try {
    const remote = git(['ls-remote', '--heads', 'origin', `refs/heads/${trimmed}`], repoRootPath);
    if (remote.trim()) return { exists: true, source: 'remote' };
  } catch { /* ignore */ }

  return { exists: false };
}

export function ensureLocalBranch(repoRootPath: string, branch: string): void {
  try {
    const local = git(['branch', '--list', branch], repoRootPath);
    if (local.trim()) return;
  } catch {
    return;
  }
  execFileSync('git', ['fetch', 'origin', `${branch}:${branch}`], {
    cwd: repoRootPath,
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
  });
}

export function createWorktree(
  mainRepoRoot: string,
  worktreePath: string,
  branch: string,
  createBranch: boolean,
  startPoint?: string,
): void {
  mkdirSync(path.dirname(worktreePath), { recursive: true });
  if (createBranch) {
    const args = ['worktree', 'add', '-b', branch, worktreePath];
    if (startPoint) args.push(startPoint);
    execFileSync('git', args, {
      cwd: mainRepoRoot,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
    });
  } else {
    execFileSync('git', ['worktree', 'add', worktreePath, branch], {
      cwd: mainRepoRoot,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
    });
  }
}

export function buildHandoffBranchName(sourceBranch: string, id: string): string {
  return `tmux-web/${sourceBranch}/${id}`;
}

export function pickUniqueWorktreePath(org: string, repo: string): string {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = buildWorktreePath(org, repo, generateWorktreeId());
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error('Failed to allocate unique worktree directory');
}

export function commitAll(repoRootPath: string, message: string): void {
  git(['add', '-A'], repoRootPath);
  git(['commit', '-m', message], repoRootPath);
}

export function push(repoRootPath: string): void {
  git(['push'], repoRootPath);
}
