import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GIT_TIMEOUT_MS = 15_000;
const MAX_EDITABLE_FILE_BYTES = 512 * 1024;

type GitExecResult = { stdout: string; stderr: string; status: number };

export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | '??';

export interface ChangedFileSummary {
  path: string;
  status: GitFileStatus;
  oldPath?: string | null;
  added: number;
  removed: number;
}

export interface ReviewDirectoryEntry {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  changed: boolean;
}

function runGit(args: string[], cwd: string, allowFailure = false): GitExecResult {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) throw result.error;

  const status = result.status ?? 0;
  const stdout = result.stdout?.trimEnd?.() ?? '';
  const stderr = result.stderr?.trimEnd?.() ?? '';

  if (!allowFailure && status !== 0) {
    throw new Error(stderr || stdout || `git ${args.join(' ')} failed`);
  }

  return { stdout, stderr, status };
}

function git(args: string[], cwd: string): string {
  return runGit(args, cwd).stdout;
}

function slashPath(value: string): string {
  return value.split(path.sep).join('/');
}

function lineCount(content: string): number {
  if (!content) return 0;
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  if (!content.endsWith('\n')) count++;
  return count;
}

function isProbablyBinary(buffer: Buffer): boolean {
  if (buffer.includes(0)) return true;
  const text = buffer.toString('utf-8');
  return text.includes('\uFFFD');
}

function buildToken(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex');
}

function summarizeStatusCode(code: string): GitFileStatus | null {
  if (code === '??') return '??';
  if (code === '!!') return null;
  const flags = code.replace(/\s/g, '');
  if (!flags) return null;
  if (flags.includes('R') || flags.includes('C')) return 'R';
  if (flags.includes('A')) return 'A';
  if (flags.includes('D')) return 'D';
  return 'M';
}

export function parseStatusPorcelain(raw: string): Array<{ path: string; oldPath?: string | null; status: GitFileStatus }> {
  const entries: Array<{ path: string; oldPath?: string | null; status: GitFileStatus }> = [];
  let index = 0;

  while (index < raw.length) {
    const end = raw.indexOf('\0', index);
    if (end === -1) break;

    const record = raw.slice(index, end);
    index = end + 1;
    if (!record) continue;

    const code = record.slice(0, 2);
    const filePath = record.slice(3);
    const status = summarizeStatusCode(code);

    let oldPath: string | null = null;
    if (code.includes('R') || code.includes('C')) {
      const oldEnd = raw.indexOf('\0', index);
      if (oldEnd !== -1) {
        oldPath = raw.slice(index, oldEnd);
        index = oldEnd + 1;
      }
    }

    if (!status) continue;
    if (oldPath === null) entries.push({ path: filePath, status });
    else entries.push({ path: filePath, oldPath, status });
  }

  return entries;
}

function numstatForPath(repoRootPath: string, filePath: string): { added: number; removed: number } {
  const out = runGit(['diff', '--numstat', '--find-renames', 'HEAD', '--', filePath], repoRootPath, true).stdout;
  const line = out.split('\n').find((value) => value.trim() !== '');
  if (!line) return { added: 0, removed: 0 };
  const [addedRaw, removedRaw] = line.split('\t', 3);
  const added = addedRaw === '-' ? 0 : parseInt(addedRaw ?? '0', 10);
  const removed = removedRaw === '-' ? 0 : parseInt(removedRaw ?? '0', 10);
  return {
    added: Number.isFinite(added) ? added : 0,
    removed: Number.isFinite(removed) ? removed : 0,
  };
}

function countUntrackedFileLines(absolutePath: string): { added: number; removed: number } {
  try {
    const buffer = readFileSync(absolutePath);
    if (isProbablyBinary(buffer)) return { added: 0, removed: 0 };
    return { added: lineCount(buffer.toString('utf-8')), removed: 0 };
  } catch {
    return { added: 0, removed: 0 };
  }
}

function listFilesRecursively(rootPath: string): string[] {
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const absolute = path.join(rootPath, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export function repoRoot(cwd: string): string | null {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    return null;
  }
}

export function currentHead(repoRootPath: string): string {
  return git(['rev-parse', 'HEAD'], repoRootPath);
}

function worktreeRootDir(): string {
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
  headSha: string;
  dirty: boolean;
  changes: { added: number; removed: number };
  ahead: number;
  behind: number;
}

export function listChangedFiles(repoRootPath: string): ChangedFileSummary[] {
  const porcelain = runGit(['status', '--porcelain=v1', '-z'], repoRootPath, true).stdout;
  const statusEntries = parseStatusPorcelain(porcelain);

  const files = statusEntries.flatMap((entry) => {
    if (entry.status === '??') {
      const resolved = resolveRepoPath(repoRootPath, entry.path);
      if (existsSync(resolved.absolutePath) && statSync(resolved.absolutePath).isDirectory()) {
        return listFilesRecursively(resolved.absolutePath).map((absolutePath) => {
          const relativePath = slashPath(path.relative(repoRootPath, absolutePath));
          const counts = countUntrackedFileLines(absolutePath);
          return {
            path: relativePath,
            status: entry.status,
            oldPath: entry.oldPath ?? null,
            added: counts.added,
            removed: counts.removed,
          };
        });
      }
    }

    const counts = entry.status === '??'
      ? countUntrackedFileLines(resolveRepoPath(repoRootPath, entry.path).absolutePath)
      : numstatForPath(repoRootPath, entry.path);
    return [{
      path: entry.path,
      status: entry.status,
      oldPath: entry.oldPath ?? null,
      added: counts.added,
      removed: counts.removed,
    }];
  });

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function getGitStatus(repoRootPath: string): GitStatusInfo {
  const branch = git(['branch', '--show-current'], repoRootPath) || 'HEAD';
  const headSha = currentHead(repoRootPath);
  const files = listChangedFiles(repoRootPath);

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

  return {
    branch,
    headSha,
    dirty: files.length > 0,
    changes: {
      added: files.reduce((sum, file) => sum + file.added, 0),
      removed: files.reduce((sum, file) => sum + file.removed, 0),
    },
    ahead,
    behind,
  };
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
  runGit(['fetch', 'origin', `${branch}:${branch}`], repoRootPath);
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
    runGit(args, mainRepoRoot);
  } else {
    runGit(['worktree', 'add', worktreePath, branch], mainRepoRoot);
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

export function resolveRepoPath(repoRootPath: string, relativePath = ''): { absolutePath: string; relativePath: string } {
  const absoluteRoot = path.resolve(repoRootPath);
  const absolutePath = path.resolve(absoluteRoot, relativePath || '.');
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(absoluteRoot + path.sep)) {
    throw new Error('Path escapes repository root');
  }
  const normalized = absolutePath === absoluteRoot ? '' : slashPath(path.relative(absoluteRoot, absolutePath));
  return { absolutePath, relativePath: normalized };
}

export function listRepoTree(repoRootPath: string, relativePath = '', changedFiles: ChangedFileSummary[] = listChangedFiles(repoRootPath)): ReviewDirectoryEntry[] {
  const { absolutePath, relativePath: normalizedPath } = resolveRepoPath(repoRootPath, relativePath);
  const changedPaths = changedFiles.map((file) => file.path);

  const entries = readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.name !== '.git')
    .map((entry) => {
      const entryPath = normalizedPath ? `${normalizedPath}/${entry.name}` : entry.name;
      return {
        path: slashPath(entryPath),
        name: entry.name,
        kind: entry.isDirectory() ? 'dir' as const : 'file' as const,
        changed: changedPaths.some((changedPath) => changedPath === entryPath || changedPath.startsWith(`${entryPath}/`)),
      };
    });

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export function getUnifiedDiff(repoRootPath: string, relativePath: string, status?: GitFileStatus): string {
  const effectiveStatus = status ?? listChangedFiles(repoRootPath).find((file) => file.path === relativePath)?.status;
  if (effectiveStatus === '??') {
    const { absolutePath } = resolveRepoPath(repoRootPath, relativePath);
    return runGit(['diff', '--no-index', '--', '/dev/null', absolutePath], repoRootPath, true).stdout;
  }
  return runGit(['diff', '--find-renames', 'HEAD', '--', relativePath], repoRootPath, true).stdout;
}

export function readTextFile(repoRootPath: string, relativePath: string): {
  content: string;
  token: string;
  size: number;
  editable: boolean;
  reason?: 'binary' | 'too_large';
} {
  const { absolutePath } = resolveRepoPath(repoRootPath, relativePath);
  const buffer = readFileSync(absolutePath);
  const token = buildToken(buffer);

  if (buffer.byteLength > MAX_EDITABLE_FILE_BYTES) {
    return {
      content: '',
      token,
      size: buffer.byteLength,
      editable: false,
      reason: 'too_large',
    };
  }

  if (isProbablyBinary(buffer)) {
    return {
      content: '',
      token,
      size: buffer.byteLength,
      editable: false,
      reason: 'binary',
    };
  }

  return {
    content: buffer.toString('utf-8'),
    token,
    size: buffer.byteLength,
    editable: true,
  };
}

export function saveTextFile(repoRootPath: string, relativePath: string, content: string, token: string): { token: string; size: number } {
  const { absolutePath } = resolveRepoPath(repoRootPath, relativePath);
  const current = readFileSync(absolutePath);
  const currentToken = buildToken(current);
  if (currentToken !== token) {
    throw new Error('File changed on disk');
  }

  writeFileSync(absolutePath, content, 'utf-8');
  const next = readFileSync(absolutePath);
  return { token: buildToken(next), size: next.byteLength };
}

export function restoreTrackedFile(repoRootPath: string, relativePath: string): void {
  runGit(['checkout', '--', relativePath], repoRootPath);
}

export function pathExists(repoRootPath: string, relativePath: string): boolean {
  try {
    const { absolutePath } = resolveRepoPath(repoRootPath, relativePath);
    return existsSync(absolutePath);
  } catch {
    return false;
  }
}

export function isDirectory(repoRootPath: string, relativePath: string): boolean {
  const { absolutePath } = resolveRepoPath(repoRootPath, relativePath);
  return statSync(absolutePath).isDirectory();
}
