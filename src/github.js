// Minimal GitHub REST client using the built-in fetch. Auth comes from
// GITHUB_TOKEN / GH_TOKEN, or falls back to `gh auth token` when the GitHub CLI is logged in.
import { execFileSync } from 'node:child_process';

let cachedToken;

export function getToken() {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!cachedToken) {
    try {
      cachedToken = execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      cachedToken = '';
    }
  }
  return cachedToken;
}

// Called with the wait in seconds when GitHub rate-limits a request; the CLI points it at its logger.
export const hooks = { onRateLimit: (s) => process.stderr.write(`btr: GitHub rate limit, waiting ${s}s\n`) };
const MAX_WAIT_S = 65; // search limits reset every minute; core limits hourly, which we do not wait out

function rateLimitWait(res) {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = Number(res.headers.get('retry-after'));
  if (retryAfter) return retryAfter;
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    return Math.max(1, Number(res.headers.get('x-ratelimit-reset')) - Math.floor(Date.now() / 1000) + 1);
  }
  return null;
}

export async function gh(pathOrUrl, { raw = false, retries = 2 } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  const headers = {
    'User-Agent': 'browse-top-repo',
    Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const wait = rateLimitWait(res);
  if (wait !== null && wait <= MAX_WAIT_S && retries > 0) {
    hooks.onRateLimit(wait);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return gh(pathOrUrl, { raw, retries: retries - 1 });
  }
  if (!res.ok) {
    const body = await res.text();
    let hint = '';
    if (res.status === 403 || res.status === 429) {
      hint = token ? ' (rate limited, try again later)' : ' (rate limited; set GITHUB_TOKEN or run `gh auth login`)';
    }
    let detail = body.slice(0, 200);
    try {
      detail = JSON.parse(body).message ?? detail;
    } catch {
      /* not JSON */
    }
    if (res.status === 404) detail = 'not found (check the owner/repo name, or it may be private)';
    if (res.status === 401) detail = 'bad credentials; check GITHUB_TOKEN or run `gh auth login`';
    const err = new Error(`GitHub ${res.status} ${url.replace('https://api.github.com', '')}: ${detail}${hint}`);
    err.status = res.status;
    throw err;
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

export function parseRepoSpec(spec) {
  // Accepts owner/repo, owner/repo/skill-name, owner/repo@ref, or a github.com URL.
  let s = spec.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  let ref;
  const at = s.indexOf('@');
  if (at !== -1) {
    ref = s.slice(at + 1);
    s = s.slice(0, at);
  }
  s = s.replace(/\/tree\/[^/]+/, ''); // drop /tree/<branch> from pasted URLs
  const parts = s.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) throw new Error(`Invalid repo spec "${spec}", expected owner/repo`);
  return { fullName: `${parts[0]}/${parts[1]}`, skillPath: parts.slice(2).join('/') || undefined, ref };
}

export const getRepo = (fullName) => gh(`/repos/${fullName}`);

export async function getCommit(fullName, ref) {
  const c = await gh(`/repos/${fullName}/commits/${encodeURIComponent(ref)}`);
  return { sha: c.sha, treeSha: c.commit.tree.sha, date: c.commit.committer?.date };
}

export async function getTree(fullName, treeSha) {
  const t = await gh(`/repos/${fullName}/git/trees/${treeSha}?recursive=1`);
  return { entries: t.tree, truncated: t.truncated };
}

export async function getFile(fullName, sha, filePath) {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return gh(`https://raw.githubusercontent.com/${fullName}/${sha}/${encoded}`, { raw: true });
}

export async function searchRepos(query, perPage = 15) {
  const q = encodeURIComponent(query);
  const r = await gh(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}`);
  return r.items;
}

export async function searchUsers(query, perPage = 5) {
  const r = await gh(`/search/users?q=${encodeURIComponent(query)}&per_page=${perPage}`);
  return r.items;
}

// Code search requires authentication; returns [] without a token.
export async function searchCode(query, perPage = 30) {
  if (!getToken()) return [];
  const r = await gh(`/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`);
  return r.items;
}
