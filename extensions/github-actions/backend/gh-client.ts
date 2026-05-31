import { execFile as nodeExecFile, type ExecFileOptions } from 'node:child_process';

type ExecFileFn = typeof nodeExecFile;

let execFileImpl: ExecFileFn = nodeExecFile;

/** @internal test hook */
export function __setExecFileForTests(fn: ExecFileFn | null): void {
  execFileImpl = fn ?? nodeExecFile;
}

export type GhApiResult = { status: number; body: unknown };

function ghEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (env.GITHUB_PAT && !env.GH_TOKEN && !env.GITHUB_TOKEN) {
    env.GH_TOKEN = env.GITHUB_PAT;
  }
  return env;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
}

export function parseGhIncludeOutput(stdout: string): GhApiResult {
  if (!stdout) return { status: 204, body: null };

  const sep = stdout.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const splitIdx = stdout.indexOf(sep);

  if (splitIdx === -1) {
    const statusLine = stdout.trim().split(/\r?\n/)[0] ?? '';
    const statusMatch = statusLine.match(/\s(\d{3})\s/);
    if (statusMatch) {
      return { status: Number(statusMatch[1]), body: null };
    }
    try {
      return { status: 200, body: JSON.parse(stdout.trim()) };
    } catch {
      return { status: 200, body: stdout.trim() };
    }
  }

  const headerBlock = stdout.slice(0, splitIdx);
  const bodyText = stdout.slice(splitIdx + sep.length).trim();
  const statusLine = headerBlock.split(/\r?\n/)[0] ?? '';
  const statusMatch = statusLine.match(/\s(\d{3})\s/);
  const status = statusMatch ? Number(statusMatch[1]) : 200;

  if (!bodyText) return { status, body: null };

  try {
    return { status, body: JSON.parse(bodyText) };
  } catch {
    return { status, body: bodyText };
  }
}

function authErrorMessage(text: string): string | null {
  const lower = text.toLowerCase();
  if (
    lower.includes('gh auth login')
    || lower.includes('not logged in')
    || lower.includes('authentication')
    || lower.includes('no oauth token')
    || lower.includes('gh_token')
  ) {
    return 'GitHub CLI is not authenticated. Run `gh auth login` or set GH_TOKEN/GITHUB_PAT.';
  }
  return null;
}

function ghNotFoundMessage(err: NodeJS.ErrnoException): GhApiResult | null {
  if (err.code === 'ENOENT') {
    return {
      status: 503,
      body: { error: 'GitHub CLI (gh) not found in PATH. Install gh or set GH_TOKEN/GITHUB_PAT.' },
    };
  }
  return null;
}

async function runGh(args: string[], input?: string): Promise<{ stdout: string; stderr: string }> {
  const options: ExecFileOptions & { input?: string } = {
    env: ghEnv(),
    maxBuffer: 10 * 1024 * 1024,
  };
  if (input !== undefined) {
    options.input = input;
  }

  return new Promise((resolve, reject) => {
    execFileImpl('gh', args, options, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({
        stdout: stdout == null ? '' : String(stdout),
        stderr: stderr == null ? '' : String(stderr),
      });
    });
  });
}

export async function ghApi(
  endpoint: string,
  options?: { method?: string; body?: unknown },
): Promise<GhApiResult> {
  const args = ['api', '--include', normalizeEndpoint(endpoint)];
  const method = options?.method?.toUpperCase();

  if (method && method !== 'GET') {
    args.push('-X', method);
  }

  const input = options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  if (input !== undefined) {
    args.push('--input', '-');
  }

  try {
    const { stdout } = await runGh(args, input);
    return parseGhIncludeOutput(stdout);
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const notFound = ghNotFoundMessage(execErr);
    if (notFound) return notFound;

    const combined = `${execErr.stdout ?? ''}\n${execErr.stderr ?? ''}`.trim();
    const authMsg = authErrorMessage(combined);
    if (authMsg) return { status: 401, body: { error: authMsg } };

    if (execErr.stdout?.trim()) {
      const parsed = parseGhIncludeOutput(execErr.stdout);
      if (parsed.status >= 400) return parsed;
    }

    try {
      const body = combined ? JSON.parse(combined) : { error: combined || 'GitHub CLI request failed' };
      return { status: 502, body };
    } catch {
      return { status: 502, body: { error: combined || 'GitHub CLI request failed' } };
    }
  }
}

export async function checkGhAuth(): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await runGh(['auth', 'status']);
    return { ok: true };
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const notFound = ghNotFoundMessage(execErr);
    if (notFound) return { ok: false, reason: String((notFound.body as { error: string }).error) };

    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT) {
      return { ok: true };
    }

    const combined = `${execErr.stdout ?? ''}\n${execErr.stderr ?? ''}`.trim();
    const authMsg = authErrorMessage(combined);
    return {
      ok: false,
      reason: authMsg ?? (combined || 'GitHub CLI authentication check failed'),
    };
  }
}
