import { ghApi } from './gh-client.js';

export interface PrCheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  url: string;
}

export interface PrInfo {
  number: number;
  title: string;
  url: string;
  headSha: string;
  checks: PrCheck[];
}

interface GhPullRaw {
  number: number;
  title: string;
  html_url: string;
  head: { sha: string };
}

interface GhCheckRunRaw {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

interface GhCheckRunsResponse {
  check_runs: GhCheckRunRaw[];
}

export async function fetchPrForBranch(
  nameWithOwner: string,
  branch: string,
): Promise<Omit<PrInfo, 'checks'> | null> {
  const [org] = nameWithOwner.split('/');
  const result = await ghApi(
    `repos/${nameWithOwner}/pulls?head=${org}:${branch}&state=open&per_page=1`,
  );

  if (result.status !== 200 || !Array.isArray(result.body) || result.body.length === 0) {
    return null;
  }

  const pr = result.body[0] as GhPullRaw;
  if (!pr.number || !pr.title) return null;

  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    headSha: pr.head.sha,
  };
}

export async function fetchPrChecks(
  nameWithOwner: string,
  headSha: string,
): Promise<PrCheck[]> {
  const result = await ghApi(
    `repos/${nameWithOwner}/commits/${headSha}/check-runs?per_page=100`,
  );

  if (result.status !== 200 || !result.body) return [];

  const data = result.body as GhCheckRunsResponse;
  if (!Array.isArray(data.check_runs)) return [];

  return data.check_runs.map((run) => ({
    name: run.name,
    status: run.status as PrCheck['status'],
    conclusion: run.conclusion,
    url: run.html_url,
  }));
}
