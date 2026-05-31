import { spawn as nodeSpawn, type SpawnOptionsWithoutStdio } from 'node:child_process';

type SpawnFn = typeof nodeSpawn;
type GhProcessError = NodeJS.ErrnoException & { stdout?: string; stderr?: string };

let spawnImpl: SpawnFn = nodeSpawn;

/** @internal test hook */
export function __setExecFileForTests(fn: SpawnFn | null): void {
  spawnImpl = fn ?? nodeSpawn;
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

export async function runGh(args: string[], input?: string): Promise<{ stdout: string; stderr: string }> {
  const options: SpawnOptionsWithoutStdio = {
    env: ghEnv(),
  };

  return new Promise((resolve, reject) => {
    const child = spawnImpl('gh', args, options);
    const maxBuffer = 10 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let settled = false;

    function finishWithError(err: GhProcessError): void {
      if (settled) return;
      settled = true;
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    }

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
      if (stdout.length + stderr.length > maxBuffer) {
        child.kill();
        finishWithError(Object.assign(new Error('gh output exceeded max buffer'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }));
      }
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
      if (stdout.length + stderr.length > maxBuffer) {
        child.kill();
        finishWithError(Object.assign(new Error('gh output exceeded max buffer'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }));
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => finishWithError(err));

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code && code !== 0) {
        const err = Object.assign(new Error(`gh exited with code ${code}`), {
          code,
          stdout,
          stderr,
        });
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });

    child.stdin.end(input);
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
