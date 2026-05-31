import { describe, expect, it } from 'vitest';
import {
  buildWorktreePath,
  classifyKind,
  generateWorktreeId,
} from '../extensions/git-workflow/backend/git.js';
import { cacheKey } from '../extensions/git-workflow/backend/storage.js';
import { isPaneReady, paneNotReadyReason } from '../extensions/git-workflow/backend/pane-ready.js';
import path from 'node:path';
import os from 'node:os';

describe('cacheKey', () => {
  it('combines session, paneId, and path', () => {
    expect(cacheKey('dev', '%1', '/home/user/proj')).toBe('dev|%1|/home/user/proj');
  });
});

describe('classifyKind', () => {
  it('detects worktree paths under ~/.worktrees', () => {
    const wt = path.join(os.homedir(), '.worktrees', 'org', 'repo', 'abc12345');
    expect(classifyKind(wt)).toBe('worktree');
  });

  it('detects local paths outside ~/.worktrees', () => {
    expect(classifyKind('/Users/dev/myproject')).toBe('local');
  });
});

describe('buildWorktreePath', () => {
  it('builds path under ~/.worktrees/org/repo/id', () => {
    const p = buildWorktreePath('acme', 'widget', 'x7k2m9ab');
    expect(p).toBe(path.join(os.homedir(), '.worktrees', 'acme', 'widget', 'x7k2m9ab'));
  });
});

describe('generateWorktreeId', () => {
  it('returns 8 lowercase alphanumeric characters', () => {
    const id = generateWorktreeId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe('isPaneReady', () => {
  it('returns false on alternate screen', () => {
    expect(isPaneReady({ alternateOn: true, paneCommand: 'zsh' })).toBe(false);
  });

  it('returns true for idle shell', () => {
    expect(isPaneReady({ alternateOn: false, paneCommand: 'zsh' })).toBe(true);
  });

  it('returns false when agent interrupt hint is visible', () => {
    expect(isPaneReady({
      alternateOn: false,
      paneCommand: 'zsh',
      paneScreen: 'working...\nesc to interrupt',
    })).toBe(false);
  });

  it('returns reason when not ready', () => {
    expect(paneNotReadyReason({ alternateOn: true, paneCommand: 'vim' }))
      .toContain('alternate screen');
  });
});
