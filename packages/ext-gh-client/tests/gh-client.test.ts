import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setExecFileForTests,
  checkGhAuth,
  ghApi,
  parseGhIncludeOutput,
} from '../src/gh-client.js';

const originalEnv = { ...process.env };

function createSpawnMock() {
  return vi.fn<typeof spawn>();
}

function createChild(stdout: string, stderr: string, code: number | null, error?: NodeJS.ErrnoException) {
  const child = new EventEmitter() as ReturnType<typeof spawn> & { stdinInput: string };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.stdinInput = '';
  child.kill = vi.fn() as unknown as ReturnType<typeof spawn>['kill'];
  child.stdin.on('data', (chunk) => {
    child.stdinInput += String(chunk);
  });

  queueMicrotask(() => {
    if (error) {
      child.emit('error', error);
      return;
    }
    if (stdout) child.stdout.write(stdout);
    if (stderr) child.stderr.write(stderr);
    child.emit('close', code);
  });

  return child;
}

function mockSpawnSuccess(mock: ReturnType<typeof createSpawnMock>, stdout: string, stderr = '') {
  mock.mockImplementation(() => createChild(stdout, stderr, 0));
}

function mockSpawnFailure(
  mock: ReturnType<typeof createSpawnMock>,
  err: NodeJS.ErrnoException & { stdout?: string; stderr?: string },
) {
  mock.mockImplementation(() => {
    if (err.code === 'ENOENT') {
      return createChild('', '', null, err);
    }
    return createChild(err.stdout ?? '', err.stderr ?? '', Number(err.code) || 1);
  });
}

afterEach(() => {
  process.env = { ...originalEnv };
  __setExecFileForTests(null);
});

describe('parseGhIncludeOutput', () => {
  it('parses 200 responses with JSON body', () => {
    const stdout = [
      'HTTP/2.0 200 OK',
      'Content-Type: application/json',
      '',
      '{"workflow_runs":[{"id":1}]}',
    ].join('\n');

    expect(parseGhIncludeOutput(stdout)).toEqual({
      status: 200,
      body: { workflow_runs: [{ id: 1 }] },
    });
  });

  it('parses 204 responses with empty body', () => {
    const stdout = 'HTTP/2.0 204 No Content\n\n';
    expect(parseGhIncludeOutput(stdout)).toEqual({ status: 204, body: null });
  });

  it('parses 401 error responses', () => {
    const stdout = [
      'HTTP/2.0 401 Unauthorized',
      'Content-Type: application/json',
      '',
      '{"message":"Bad credentials"}',
    ].join('\n');

    expect(parseGhIncludeOutput(stdout)).toEqual({
      status: 401,
      body: { message: 'Bad credentials' },
    });
  });
});

describe('ghApi', () => {
  let spawnMock: ReturnType<typeof createSpawnMock>;

  beforeEach(() => {
    spawnMock = createSpawnMock();
    __setExecFileForTests(spawnMock);
    delete process.env.GITHUB_PAT;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('calls gh api with --include for GET requests', async () => {
    mockSpawnSuccess(spawnMock, 'HTTP/2.0 200 OK\n\n{"total_count":0}');

    const result = await ghApi('repos/o/r/actions/runs/1');

    expect(spawnMock).toHaveBeenCalledWith(
      'gh',
      ['api', '--include', 'repos/o/r/actions/runs/1'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
    expect(result).toEqual({ status: 200, body: { total_count: 0 } });
  });

  it('calls gh api with POST method and JSON body', async () => {
    mockSpawnSuccess(spawnMock, 'HTTP/2.0 204 No Content\n\n');

    const result = await ghApi('repos/o/r/actions/workflows/ci.yml/dispatches', {
      method: 'POST',
      body: { ref: 'main' },
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'gh',
      ['api', '--include', 'repos/o/r/actions/workflows/ci.yml/dispatches', '-X', 'POST', '--input', '-'],
      expect.objectContaining({ env: expect.any(Object) }),
    );
    const child = spawnMock.mock.results[0]?.value as ReturnType<typeof createChild>;
    expect(child.stdinInput).toBe('{"ref":"main"}');
    expect(result).toEqual({ status: 204, body: null });
  });

  it('maps GITHUB_PAT to GH_TOKEN in subprocess env', async () => {
    process.env.GITHUB_PAT = 'pat_test';
    mockSpawnSuccess(spawnMock, 'HTTP/2.0 200 OK\n\n{}');

    await ghApi('repos/o/r/actions/runs/1');

    const call = spawnMock.mock.calls[0];
    const options = call[2] as { env: NodeJS.ProcessEnv };
    expect(options.env.GH_TOKEN).toBe('pat_test');
  });

  it('does not override existing GH_TOKEN with GITHUB_PAT', async () => {
    process.env.GITHUB_PAT = 'pat_test';
    process.env.GH_TOKEN = 'token_existing';
    mockSpawnSuccess(spawnMock, 'HTTP/2.0 200 OK\n\n{}');

    await ghApi('repos/o/r/actions/runs/1');

    const call = spawnMock.mock.calls[0];
    const options = call[2] as { env: NodeJS.ProcessEnv };
    expect(options.env.GH_TOKEN).toBe('token_existing');
  });

  it('returns 503 when gh is not found', async () => {
    const err = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    mockSpawnFailure(spawnMock, err);

    const result = await ghApi('repos/o/r/actions/runs/1');

    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      error: 'GitHub CLI (gh) not found in PATH. Install gh or set GH_TOKEN/GITHUB_PAT.',
    });
  });

  it('returns 401 for gh auth failures', async () => {
    const err = Object.assign(new Error('auth failed'), {
      code: 1,
      stderr: 'To use GitHub CLI, please run: gh auth login',
    });
    mockSpawnFailure(spawnMock, err);

    const result = await ghApi('repos/o/r/actions/runs/1');

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: 'GitHub CLI is not authenticated. Run `gh auth login` or set GH_TOKEN/GITHUB_PAT.',
    });
  });
});

describe('checkGhAuth', () => {
  let spawnMock: ReturnType<typeof createSpawnMock>;

  beforeEach(() => {
    spawnMock = createSpawnMock();
    __setExecFileForTests(spawnMock);
    delete process.env.GITHUB_PAT;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('returns ok when gh auth status succeeds', async () => {
    mockSpawnSuccess(spawnMock, 'github.com\n  ✓ Logged in to github.com\n');

    await expect(checkGhAuth()).resolves.toEqual({ ok: true });
    expect(spawnMock).toHaveBeenCalledWith(
      'gh',
      ['auth', 'status'],
      expect.any(Object),
    );
  });

  it('returns ok when a token env var is set', async () => {
    process.env.GITHUB_PAT = 'pat_test';
    mockSpawnFailure(spawnMock, Object.assign(new Error('not logged in'), { code: 1, stderr: 'not logged in' }));

    await expect(checkGhAuth()).resolves.toEqual({ ok: true });
  });

  it('returns failure when gh is missing and no token is configured', async () => {
    const err = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    mockSpawnFailure(spawnMock, err);

    const result = await checkGhAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('GitHub CLI (gh) not found in PATH');
    }
  });
});
