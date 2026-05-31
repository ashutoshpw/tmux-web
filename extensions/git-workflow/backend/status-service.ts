import { ghRepoView, fetchPrForBranch, fetchPrChecks } from '@tmux-web/ext-gh-workflow';
import { capturePaneTail, getActivePaneInfo, type ActivePaneInfo } from './tmux.js';
import { isPaneReady } from './pane-ready.js';
import {
  classifyKind,
  getGitStatus,
  listBranchNames,
  repoRoot,
  resolveMainRepoPath,
} from './git.js';
import { cacheKey, getCachedPane, setCachedPane, type PaneCache } from './storage.js';

export interface StatusResponse {
  isRepo: boolean;
  isGithub: boolean;
  message?: string;
  paneId?: string;
  windowIndex?: number;
  panePath?: string;
  paneReady?: boolean;
  cached?: boolean;
  data?: PaneCache;
}

async function buildPaneCache(session: string, pane: ActivePaneInfo): Promise<StatusResponse> {
  const panePath = pane.panePath;
  if (!panePath) {
    return { isRepo: false, isGithub: false, message: 'Could not detect pane working directory' };
  }

  const root = repoRoot(panePath);
  if (!root) {
    return {
      isRepo: false,
      isGithub: false,
      paneId: pane.paneId,
      windowIndex: pane.windowIndex,
      panePath,
      message: 'Not a git repository',
    };
  }

  const github = await ghRepoView(panePath);
  if (!github) {
    return {
      isRepo: true,
      isGithub: false,
      paneId: pane.paneId,
      windowIndex: pane.windowIndex,
      panePath,
      message: 'Works with GitHub repositories only',
    };
  }

  const screen = capturePaneTail(pane.target, 20);
  const paneReady = isPaneReady({
    alternateOn: pane.alternateOn,
    paneCommand: pane.paneCommand,
    paneScreen: screen,
  });

  const kind = classifyKind(panePath);
  const gitStatus = getGitStatus(root);
  const mainRepoPath = kind === 'worktree' ? resolveMainRepoPath(root) : root;
  const branchSource = mainRepoPath ?? root;

  let pr = null;
  const branch = gitStatus.branch;
  if (branch !== 'main' && branch !== 'master') {
    try {
      const prBase = await fetchPrForBranch(github.nameWithOwner, branch);
      if (prBase) {
        const checks = await fetchPrChecks(github.nameWithOwner, prBase.headSha);
        pr = { ...prBase, checks };
      }
    } catch {
      // PR fetch is best-effort; don't fail the status response
    }
  }

  const entry: PaneCache = {
    session,
    paneId: pane.paneId,
    panePath,
    windowIndex: pane.windowIndex,
    branch,
    kind,
    mainRepoPath,
    repoRoot: root,
    github,
    changes: gitStatus.changes,
    dirty: gitStatus.dirty,
    ahead: gitStatus.ahead,
    behind: gitStatus.behind,
    branches: listBranchNames(branchSource),
    paneReady,
    fetchedAt: Date.now(),
    pr,
  };

  const key = cacheKey(session, pane.paneId, panePath);
  const prev = await getCachedPane(key);
  await setCachedPane(key, entry);

  return {
    isRepo: true,
    isGithub: true,
    paneId: pane.paneId,
    windowIndex: pane.windowIndex,
    panePath,
    paneReady,
    cached: prev !== null,
    data: entry,
  };
}

export async function fetchSessionStatus(session: string): Promise<StatusResponse> {
  const pane = getActivePaneInfo(session);
  if (!pane) {
    return { isRepo: false, isGithub: false, message: 'Could not resolve active tmux pane' };
  }
  return buildPaneCache(session, pane);
}
