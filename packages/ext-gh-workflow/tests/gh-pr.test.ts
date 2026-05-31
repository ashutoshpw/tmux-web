import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setExecFileForTests } from '../src/gh-client.js';
import { fetchPrForBranch, fetchPrChecks } from '../src/gh-pr.js';

function createSpawnMock() {
  return vi.fn<typeof spawn>();
}

function createChild(stdout: string, stderr: string, code: number | null) {
  const child = new EventEmitter() as ReturnType<typeof spawn>;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = vi.fn() as unknown as ReturnType<typeof spawn>['kill'];

  queueMicrotask(() => {
    if (stdout) child.stdout.write(stdout);
    if (stderr) child.stderr.write(stderr);
    child.emit('close', code);
  });

  return child;
}

function mockSpawnSuccess(mock: ReturnType<typeof createSpawnMock>, body: unknown) {
  const bodyStr = JSON.stringify(body);
  mock.mockImplementation(() =>
    createChild(`HTTP/2.0 200 OK\nContent-Type: application/json\n\n${bodyStr}`, '', 0),
  );
}

function mockSpawnEmpty(mock: ReturnType<typeof createSpawnMock>) {
  mock.mockImplementation(() =>
    createChild('HTTP/2.0 200 OK\n\n[]', '', 0),
  );
}

afterEach(() => {
  __setExecFileForTests(null);
});

describe('fetchPrForBranch', () => {
  let spawnMock: ReturnType<typeof createSpawnMock>;

  beforeEach(() => {
    spawnMock = createSpawnMock();
    __setExecFileForTests(spawnMock);
  });

  it('returns null when no open PRs exist for the branch', async () => {
    mockSpawnEmpty(spawnMock);

    const result = await fetchPrForBranch('myorg/myrepo', 'feat/my-branch');
    expect(result).toBeNull();
  });

  it('returns PR info when a PR exists', async () => {
    mockSpawnSuccess(spawnMock, [
      {
        number: 42,
        title: 'Add feature X',
        html_url: 'https://github.com/myorg/myrepo/pull/42',
        head: { sha: 'abc123def456' },
      },
    ]);

    const result = await fetchPrForBranch('myorg/myrepo', 'feat/my-branch');
    expect(result).toEqual({
      number: 42,
      title: 'Add feature X',
      url: 'https://github.com/myorg/myrepo/pull/42',
      headSha: 'abc123def456',
    });
  });

  it('passes the correct head filter to the API', async () => {
    mockSpawnEmpty(spawnMock);

    await fetchPrForBranch('myorg/myrepo', 'feat/my-branch');

    expect(spawnMock).toHaveBeenCalledWith(
      'gh',
      ['api', '--include', 'repos/myorg/myrepo/pulls?head=myorg:feat/my-branch&state=open&per_page=1'],
      expect.any(Object),
    );
  });

  it('returns null on a non-200 response', async () => {
    spawnMock.mockImplementation(() =>
      createChild('HTTP/2.0 404 Not Found\n\n{"message":"Not Found"}', '', 0),
    );

    const result = await fetchPrForBranch('myorg/myrepo', 'feat/my-branch');
    expect(result).toBeNull();
  });
});

describe('fetchPrChecks', () => {
  let spawnMock: ReturnType<typeof createSpawnMock>;

  beforeEach(() => {
    spawnMock = createSpawnMock();
    __setExecFileForTests(spawnMock);
  });

  it('returns empty array when no check runs exist', async () => {
    mockSpawnSuccess(spawnMock, { check_runs: [] });

    const result = await fetchPrChecks('myorg/myrepo', 'abc123');
    expect(result).toEqual([]);
  });

  it('maps check runs to PrCheck shape', async () => {
    mockSpawnSuccess(spawnMock, {
      check_runs: [
        {
          name: 'CI / build',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/myorg/myrepo/runs/999',
        },
        {
          name: 'CI / test',
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/myorg/myrepo/runs/1000',
        },
        {
          name: 'CI / lint',
          status: 'in_progress',
          conclusion: null,
          html_url: 'https://github.com/myorg/myrepo/runs/1001',
        },
      ],
    });

    const result = await fetchPrChecks('myorg/myrepo', 'abc123');
    expect(result).toEqual([
      { name: 'CI / build', status: 'completed', conclusion: 'success', url: 'https://github.com/myorg/myrepo/runs/999' },
      { name: 'CI / test', status: 'completed', conclusion: 'failure', url: 'https://github.com/myorg/myrepo/runs/1000' },
      { name: 'CI / lint', status: 'in_progress', conclusion: null, url: 'https://github.com/myorg/myrepo/runs/1001' },
    ]);
  });

  it('returns empty array on a non-200 response', async () => {
    spawnMock.mockImplementation(() =>
      createChild('HTTP/2.0 404 Not Found\n\n{"message":"Not Found"}', '', 0),
    );

    const result = await fetchPrChecks('myorg/myrepo', 'abc123');
    expect(result).toEqual([]);
  });
});
