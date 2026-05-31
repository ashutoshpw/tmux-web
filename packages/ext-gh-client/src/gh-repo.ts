import { execFile as nodeExecFile } from 'node:child_process';

export interface GhRepoInfo {
  nameWithOwner: string;
  org: string;
  repo: string;
}

type ExecFileFn = typeof nodeExecFile;
let execFileImpl: ExecFileFn = nodeExecFile;

/** @internal test hook */
export function __setExecFileForRepoTests(fn: ExecFileFn | null): void {
  execFileImpl = fn ?? nodeExecFile;
}

function gitRepoRoot(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFileImpl('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf-8' }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout?.trim() || null);
    });
  });
}

function runGhFromDir(dir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileImpl('gh', args, { cwd: dir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({
        stdout: stdout == null ? '' : String(stdout),
        stderr: stderr == null ? '' : String(stderr),
      });
    });
  });
}

/** Resolve GitHub repo info from a directory (uses git root + gh repo view). */
export async function ghRepoView(cwd: string): Promise<GhRepoInfo | null> {
  const repoRoot = await gitRepoRoot(cwd);
  if (!repoRoot) return null;

  try {
    const { stdout } = await runGhFromDir(repoRoot, [
      'repo', 'view',
      '--json', 'nameWithOwner,name,owner',
    ]);
    const jsonText = stdout.trim();
    if (!jsonText) return null;

    const data = JSON.parse(jsonText) as {
      nameWithOwner?: string;
      name?: string;
      owner?: { login?: string };
    };

    const nameWithOwner = data.nameWithOwner
      ?? (data.owner?.login && data.name ? `${data.owner.login}/${data.name}` : null);
    if (!nameWithOwner) return null;

    const [org, repo] = nameWithOwner.split('/');
    if (!org || !repo) return null;

    return { nameWithOwner, org, repo };
  } catch {
    return null;
  }
}

/** @deprecated use ghRepoView */
export const ghRepoViewFromDir = ghRepoView;
