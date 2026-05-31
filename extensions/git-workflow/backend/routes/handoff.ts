import { Hono } from 'hono';
import { ghRepoView } from '@tmux-web/ext-gh-workflow';
import path from 'node:path';
import {
  branchExists,
  buildHandoffBranchName,
  createWorktree,
  ensureLocalBranch,
  isBranchCheckedOut,
  pickUniqueWorktreePath,
  repoRoot,
  resolveMainRepoPath,
} from '../git.js';
import { isPaneReady, paneNotReadyReason } from '../pane-ready.js';
import { capturePaneTail, getActivePaneInfo, sendKeysToPane } from '../tmux.js';
import { fetchSessionStatus } from '../status-service.js';

export const handoffRouter = new Hono();

handoffRouter.post('/handoff', async (c) => {
  const body = await c.req.json<{ session?: string; branch?: string; confirmCreate?: boolean }>();
  const session = body.session?.trim();
  const branch = body.branch?.trim();
  const confirmCreate = body.confirmCreate === true;

  if (!session || !branch) {
    return c.json({ error: 'session and branch are required' }, 400);
  }

  const pane = getActivePaneInfo(session);
  if (!pane) return c.json({ error: 'Could not resolve active tmux pane' }, 404);

  const cwd = pane.panePath;
  if (!cwd) return c.json({ error: 'Could not detect pane working directory' }, 400);

  const root = repoRoot(cwd);
  if (!root) return c.json({ error: 'Not a git repository' }, 400);

  const github = await ghRepoView(cwd);
  if (!github) {
    return c.json({ error: 'Works with GitHub repositories only' }, 400);
  }

  const mainRepoRoot = resolveMainRepoPath(root) ?? root;
  const exists = branchExists(mainRepoRoot, branch);

  if (!exists.exists && !confirmCreate) {
    return c.json({ needsConfirmation: true, branch }, 409);
  }

  let worktreePath: string;
  try {
    worktreePath = pickUniqueWorktreePath(github.org, github.repo);
  } catch (err) {
    return c.json({ error: String((err as Error).message) }, 500);
  }

  let targetBranch = branch;
  try {
    if (exists.exists && exists.source === 'remote') {
      ensureLocalBranch(mainRepoRoot, branch);
    }

    let createBranch = !exists.exists;
    let startPoint: string | undefined;
    if (exists.exists && isBranchCheckedOut(mainRepoRoot, branch)) {
      targetBranch = buildHandoffBranchName(branch, path.basename(worktreePath));
      createBranch = true;
      startPoint = branch;
    }

    createWorktree(mainRepoRoot, worktreePath, targetBranch, createBranch, startPoint);
  } catch (err) {
    return c.json({ error: `git worktree add failed: ${(err as Error).message}` }, 500);
  }

  const screen = capturePaneTail(pane.target, 20);
  const readyInput = {
    alternateOn: pane.alternateOn,
    paneCommand: pane.paneCommand,
    paneScreen: screen,
  };
  const paneReady = isPaneReady(readyInput);
  let cdApplied = false;
  let cdSkippedReason: string | undefined;

  if (paneReady) {
    sendKeysToPane(pane.target, `cd '${worktreePath.replace(/'/g, "'\\''")}'`);
    cdApplied = true;
  } else {
    cdSkippedReason = paneNotReadyReason(readyInput);
  }

  const status = await fetchSessionStatus(session);

  return c.json({
    worktreePath,
    mainRepoPath: mainRepoRoot,
    requestedBranch: branch,
    branch: targetBranch,
    cdApplied,
    cdSkippedReason,
    status,
  });
});
