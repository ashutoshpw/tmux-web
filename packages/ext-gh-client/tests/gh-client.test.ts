import { execFile, type ExecFile } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setExecFileForTests,
  checkGhAuth,
  ghApi,
  parseGhIncludeOutput,
} from '../src/gh-client.js';

const originalEnv = { ...process.env };

function createExecFileMock() {
  return vi.fn<ExecFile>();
}

function mockExecSuccess(mock: ReturnType<typeof createExecFileMock>, stdout: string, stderr = '') {
  mock.mockImplementation((_file, _args, _options, callback) => {
    callback?.(null, stdout, stderr);
  });
}

function mockExecFailure(
  mock: ReturnType<typeof createExecFileMock>,
  err: NodeJS.ErrnoException & { stdout?: string; stderr?: string },
) {
  mock.mockImplementation((_file, _args, _options, callback) => {
    callback?.(err, err.stdout ?? '', err.stderr ?? '');
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
  let execFileMock: ReturnType<typeof createExecFileMock>;

  beforeEach(() => {
    execFileMock = createExecFileMock();
    __setExecFileForTests(execFileMock as unknown as typeof execFile);
    delete process.env.GITHUB_PAT;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('calls gh api with --include for GET requests', async () => {
    mockExecSuccess(execFileMock, 'HTTP/2.0 200 OK\n\n{"total_count":0}');

    const result = await ghApi('repos/o/r/actions/runs/1');

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['api', '--include', 'repos/o/r/actions/runs/1'],
      expect.objectContaining({ env: expect.any(Object) }),
      expect.any(Function),
    );
    expect(result).toEqual({ status: 200, body: { total_count: 0 } });
  });

  it('calls gh api with POST method and JSON body', async () => {
    mockExecSuccess(execFileMock, 'HTTP/2.0 204 No Content\n\n');

    const result = await ghApi('repos/o/r/actions/workflows/ci.yml/dispatches', {
      method: 'POST',
      body: { ref: 'main' },
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['api', '--include', 'repos/o/r/actions/workflows/ci.yml/dispatches', '-X', 'POST', '--input', '-'],
      expect.objectContaining({ input: '{"ref":"main"}' }),
      expect.any(Function),
    );
    expect(result).toEqual({ status: 204, body: null });
  });

  it('maps GITHUB_PAT to GH_TOKEN in subprocess env', async () => {
    process.env.GITHUB_PAT = 'pat_test';
    mockExecSuccess(execFileMock, 'HTTP/2.0 200 OK\n\n{}');

    await ghApi('repos/o/r/actions/runs/1');

    const call = execFileMock.mock.calls[0];
    const options = call[2] as { env: NodeJS.ProcessEnv };
    expect(options.env.GH_TOKEN).toBe('pat_test');
  });

  it('does not override existing GH_TOKEN with GITHUB_PAT', async () => {
    process.env.GITHUB_PAT = 'pat_test';
    process.env.GH_TOKEN = 'token_existing';
    mockExecSuccess(execFileMock, 'HTTP/2.0 200 OK\n\n{}');

    await ghApi('repos/o/r/actions/runs/1');

    const call = execFileMock.mock.calls[0];
    const options = call[2] as { env: NodeJS.ProcessEnv };
    expect(options.env.GH_TOKEN).toBe('token_existing');
  });

  it('returns 503 when gh is not found', async () => {
    const err = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    mockExecFailure(execFileMock, err);

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
    mockExecFailure(execFileMock, err);

    const result = await ghApi('repos/o/r/actions/runs/1');

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: 'GitHub CLI is not authenticated. Run `gh auth login` or set GH_TOKEN/GITHUB_PAT.',
    });
  });
});

describe('checkGhAuth', () => {
  let execFileMock: ReturnType<typeof createExecFileMock>;

  beforeEach(() => {
    execFileMock = createExecFileMock();
    __setExecFileForTests(execFileMock as unknown as typeof execFile);
    delete process.env.GITHUB_PAT;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('returns ok when gh auth status succeeds', async () => {
    mockExecSuccess(execFileMock, 'github.com\n  ✓ Logged in to github.com\n');

    await expect(checkGhAuth()).resolves.toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith(
      'gh',
      ['auth', 'status'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns ok when a token env var is set', async () => {
    process.env.GITHUB_PAT = 'pat_test';
    mockExecFailure(execFileMock, Object.assign(new Error('not logged in'), { code: 1, stderr: 'not logged in' }));

    await expect(checkGhAuth()).resolves.toEqual({ ok: true });
  });

  it('returns failure when gh is missing and no token is configured', async () => {
    const err = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    mockExecFailure(execFileMock, err);

    const result = await checkGhAuth();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('GitHub CLI (gh) not found in PATH');
    }
  });
});
