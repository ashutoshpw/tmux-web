import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tmux-web/ext-gh-workflow', () => ({
	ghApi: vi.fn(),
}));

// storage.ts captures EXT_DATA_DIR at module load, so it must be set before
// the (dynamic) imports below run.
const dataDir = mkdtempSync(join(tmpdir(), 'gha-ext-test-'));
process.env.EXT_DATA_DIR = dataDir;

const dataFile = join(dataDir, 'data.json');
const { getWorkflows, addWorkflow, removeWorkflow } = await import(
	'../extensions/github-actions/backend/storage.js'
);
const { workflowsRouter, parseWorkflowUrl } = await import(
	'../extensions/github-actions/backend/routes/workflows.js'
);
const { dispatchRouter } = await import('../extensions/github-actions/backend/routes/dispatch.js');
const { runsRouter } = await import('../extensions/github-actions/backend/routes/runs.js');
const { ghApi } = await import('@tmux-web/ext-gh-workflow');

const app = new Hono();
app.route('/', workflowsRouter);
app.route('/', dispatchRouter);
app.route('/', runsRouter);

const json = (body: unknown, headers: Record<string, string> = {}) => ({
	method: 'POST',
	body: JSON.stringify(body),
	headers: { 'content-type': 'application/json', ...headers },
});

beforeEach(() => {
	rmSync(dataFile, { force: true });
	vi.mocked(ghApi).mockReset();
});

describe('github-actions storage', () => {
	it('returns an empty list for unknown sessions', async () => {
		await expect(getWorkflows('nope')).resolves.toEqual([]);
	});

	it('adds workflows, deduplicates, and persists to disk', async () => {
		await addWorkflow('main', 'https://github.com/o/r/actions/workflows/ci.yml');
		await addWorkflow('main', 'https://github.com/o/r/actions/workflows/ci.yml');
		await addWorkflow('main', 'https://github.com/o/r/actions/workflows/release.yml');

		await expect(getWorkflows('main')).resolves.toEqual([
			'https://github.com/o/r/actions/workflows/ci.yml',
			'https://github.com/o/r/actions/workflows/release.yml',
		]);
		expect(existsSync(dataFile)).toBe(true);
		const persisted = JSON.parse(readFileSync(dataFile, 'utf-8'));
		expect(persisted.sessions.main).toHaveLength(2);
	});

	it('keeps sessions isolated', async () => {
		await addWorkflow('a', 'https://github.com/o/r/actions/workflows/a.yml');
		await addWorkflow('b', 'https://github.com/o/r/actions/workflows/b.yml');
		await expect(getWorkflows('a')).resolves.toEqual([
			'https://github.com/o/r/actions/workflows/a.yml',
		]);
	});

	it('removes by index and tolerates out-of-range indexes', async () => {
		await addWorkflow('main', 'https://github.com/o/r/actions/workflows/one.yml');
		await addWorkflow('main', 'https://github.com/o/r/actions/workflows/two.yml');

		await removeWorkflow('main', 0);
		await expect(getWorkflows('main')).resolves.toEqual([
			'https://github.com/o/r/actions/workflows/two.yml',
		]);

		await removeWorkflow('main', 99);
		await expect(getWorkflows('main')).resolves.toEqual([
			'https://github.com/o/r/actions/workflows/two.yml',
		]);
	});

	it('treats a corrupt data file as an empty store', async () => {
		writeFileSync(dataFile, '{not json');
		await expect(getWorkflows('main')).resolves.toEqual([]);

		await addWorkflow('main', 'https://github.com/o/r/actions/workflows/ci.yml');
		expect(JSON.parse(readFileSync(dataFile, 'utf-8')).sessions.main).toHaveLength(1);
	});
});

describe('parseWorkflowUrl', () => {
	it('parses owner/repo and workflow file', () => {
		expect(parseWorkflowUrl('https://github.com/o/r/actions/workflows/ci.yml')).toEqual({
			repo: 'o/r',
			workflow: 'ci.yml',
		});
	});

	it('strips query strings and hashes', () => {
		expect(
			parseWorkflowUrl('https://github.com/o/r/actions/workflows/ci.yml?query=graph#anchor'),
		).toEqual({ repo: 'o/r', workflow: 'ci.yml' });
	});

	it('rejects non-workflow and non-GitHub URLs', () => {
		expect(parseWorkflowUrl('https://github.com/o/r')).toBeNull();
		expect(parseWorkflowUrl('https://gitlab.com/o/r/actions/workflows/ci.yml')).toBeNull();
	});
});

describe('workflows routes', () => {
	it('rejects GET without a session', async () => {
		const res = await app.request('/workflows');
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: '`session` is required' });
	});

	it('rejects POST with missing fields', async () => {
		const res = await app.request('/workflows', json({ session: 'main' }));
		expect(res.status).toBe(400);
	});

	it('rejects POST with a non-workflow URL', async () => {
		const res = await app.request('/workflows', json({ session: 'main', url: 'https://x.dev' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Not a valid GitHub Actions workflow URL' });
	});

	it('stores and lists workflow URLs per session', async () => {
		const url = 'https://github.com/o/r/actions/workflows/ci.yml';
		const added = await app.request('/workflows', json({ session: 'main', url }));
		expect(await added.json()).toEqual({ urls: [url] });

		const listed = await app.request('/workflows?session=main');
		expect(await listed.json()).toEqual([url]);
	});

	it('rejects DELETE without an index', async () => {
		const res = await app.request('/workflows?session=main', { method: 'DELETE' });
		expect(res.status).toBe(400);
	});
});

describe('dispatch route', () => {
	it('requires url and ref', async () => {
		const res = await app.request('/dispatch', json({ url: 'https://github.com/o/r/actions/workflows/ci.yml' }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: '`url` and `ref` are required' });
	});

	it('rejects invalid workflow URLs', async () => {
		const res = await app.request('/dispatch', json({ url: 'https://x.dev/wf', ref: 'main' }));
		expect(res.status).toBe(400);
	});

	it('dispatches through ghApi and reports success on 204', async () => {
		vi.mocked(ghApi).mockResolvedValue({ status: 204, body: {} });

		const res = await app.request(
			'/dispatch',
			json({ url: 'https://github.com/o/r/actions/workflows/ci.yml', ref: 'main' }),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(vi.mocked(ghApi)).toHaveBeenCalledWith(
			'repos/o/r/actions/workflows/ci.yml/dispatches',
			{ method: 'POST', body: { ref: 'main' } },
		);
	});

	it('proxies ghApi failures with their status', async () => {
		vi.mocked(ghApi).mockResolvedValue({ status: 422, body: { message: 'No ref' } });

		const res = await app.request(
			'/dispatch',
			json({ url: 'https://github.com/o/r/actions/workflows/ci.yml', ref: 'nope' }),
		);
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ message: 'No ref' });
	});
});

describe('runs routes', () => {
	it('requires url or repo+workflow', async () => {
		const res = await app.request('/runs');
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Provide `url` or both `repo` and `workflow`' });
	});

	it('resolves repo/workflow from a URL and defaults perPage', async () => {
		vi.mocked(ghApi).mockResolvedValue({ status: 200, body: { workflow_runs: [] } });

		await app.request(
			'/runs?url=' + encodeURIComponent('https://github.com/o/r/actions/workflows/ci.yml'),
		);
		const path = vi.mocked(ghApi).mock.calls[0][0] as string;
		expect(path).toContain('repos/o/r/actions/workflows/ci.yml/runs?');
		expect(path).toContain('per_page=5');
		expect(path).not.toContain('branch=');
	});

	it('clamps perPage and forwards branch filters', async () => {
		vi.mocked(ghApi).mockResolvedValue({ status: 200, body: { workflow_runs: [] } });

		await app.request('/runs?repo=o/r&workflow=ci.yml&perPage=50&branch=dev');
		const path = vi.mocked(ghApi).mock.calls[0][0] as string;
		expect(path).toContain('per_page=10');
		expect(path).toContain('branch=dev');
	});

	it('requires repo for run detail routes', async () => {
		expect((await app.request('/runs/123')).status).toBe(400);
		expect((await app.request('/runs/123/jobs')).status).toBe(400);
		expect((await app.request('/runs/123', { method: 'DELETE' })).status).toBe(400);
		const rerun = await app.request('/runs/123/rerun', json({}));
		expect(rerun.status).toBe(400);
	});

	it('reruns a workflow and reports success on 201', async () => {
		vi.mocked(ghApi).mockResolvedValue({ status: 201, body: {} });

		const res = await app.request('/runs/123/rerun', json({ repo: 'o/r' }));
		expect(await res.json()).toEqual({ ok: true, runId: '123' });
		expect(vi.mocked(ghApi)).toHaveBeenCalledWith('repos/o/r/actions/runs/123/rerun', {
			method: 'POST',
		});
	});

	it('cancels a run and reports success on 202', async () => {
		vi.mocked(ghApi).mockResolvedValue({ status: 202, body: {} });

		const res = await app.request('/runs/123?repo=o/r', { method: 'DELETE' });
		expect(await res.json()).toEqual({ ok: true, runId: '123' });
		expect(vi.mocked(ghApi)).toHaveBeenCalledWith('repos/o/r/actions/runs/123/cancel', {
			method: 'POST',
		});
	});
});
