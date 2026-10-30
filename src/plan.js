// Task -> domains -> GitHub candidates -> evaluated ranking.
import { searchRepos, searchCode, getRepo } from './github.js';
import { evaluateRepo, terms } from './evaluate.js';

export const DOMAINS = {
  'reverse-engineering': {
    kw: ['reverse', 'decompil', 'disassembl', 'binary', 'ghidra', 'ida pro', 'radare', 'rizin', 'frida', 'malware', 'firmware', 'apk', 'dex', 'unpack', 'obfuscat'],
    queries: ['reverse engineering'],
  },
  security: {
    kw: ['security', 'pentest', 'penetration', 'vulnerab', 'exploit', 'cve', 'audit', 'owasp', 'threat', 'secure', 'ctf', 'fuzz', 'sast', 'red team'],
    queries: ['security audit', 'pentest'],
  },
  frontend: {
    kw: ['frontend', 'front-end', 'react', 'next.js', 'vue', 'svelte', 'css', 'tailwind', 'ui ', 'ux', 'landing page', 'website', 'design system'],
    queries: ['frontend design'],
  },
  backend: {
    kw: ['backend', 'api', 'server', 'database', 'sql', 'postgres', 'graphql', 'rest', 'microservice', 'auth'],
    queries: ['backend api'],
  },
  devops: {
    kw: ['deploy', 'docker', 'kubernetes', 'k8s', 'ci/cd', 'pipeline', 'terraform', 'infra', 'aws', 'gcp', 'azure', 'helm'],
    queries: ['devops'],
  },
  data: {
    kw: ['data ', 'dataset', 'pandas', 'etl', 'analytics', 'csv', 'notebook', 'visualiz', 'dashboard', 'chart'],
    queries: ['data analysis'],
  },
  ml: {
    kw: ['machine learning', ' ml ', 'pytorch', 'tensorflow', 'training', 'fine-tun', 'llm', 'rag', 'embedding', 'agent'],
    queries: ['machine learning'],
  },
  testing: {
    kw: ['test', 'qa', 'e2e', 'playwright', 'cypress', 'tdd', 'coverage'],
    queries: ['testing'],
  },
  mobile: {
    kw: ['android', 'ios', 'mobile', 'swift', 'kotlin', 'flutter', 'react native'],
    queries: ['mobile app'],
  },
  documents: {
    kw: ['pdf', 'docx', 'pptx', 'xlsx', 'spreadsheet', 'presentation', 'slides', 'word document'],
    queries: ['documents pdf'],
  },
};

export function classify(task) {
  const t = ` ${task.toLowerCase()} `;
  return Object.entries(DOMAINS)
    .map(([name, d]) => ({ name, hits: d.kw.filter((k) => t.includes(k)).length }))
    .filter((d) => d.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((d) => d.name);
}

function buildQueries(task, domains) {
  const own = terms(task).slice(0, 4).join(' ');
  const base = [...new Set([own, ...domains.flatMap((d) => DOMAINS[d].queries)])].filter(Boolean);
  const repoQueries = base.flatMap((q) => [`${q} claude skill`, `${q} agent skills`]);
  // Code search is limited to 10 requests/minute, so only the most specific query uses it.
  const codeQueries = base.slice(0, 1).map((q) => `filename:SKILL.md ${q}`);
  return { repoQueries, codeQueries };
}

export async function discover(task, { log = () => {} } = {}) {
  const domains = classify(task);
  const { repoQueries, codeQueries } = buildQueries(task, domains);
  const byName = new Map();

  const errors = [];
  const settle = (label, p) => p.catch((e) => (errors.push(e), log(`  ${label}: ${e.message}`), []));
  log(`searching GitHub (${repoQueries.length + codeQueries.length} queries)`);
  const [repoHits, codeHits] = await Promise.all([
    Promise.all(repoQueries.map((q) => settle(q, searchRepos(q)))),
    Promise.all(codeQueries.map((q) => settle(q, searchCode(q)))),
  ]);
  for (const r of repoHits.flat()) byName.set(r.full_name, r);
  // An empty result because GitHub refused every search must not look like "no skills exist".
  if (errors.length === repoQueries.length) throw new Error(`all GitHub searches failed: ${errors[0].message}`);

  // Code search finds repos whose SKILL.md mentions the domain even when the repo
  // description does not. Its results lack star counts, so hydrate a few.
  const codeOnly = [...new Set(codeHits.flat().map((i) => i.repository.full_name))].filter((n) => !byName.has(n));
  const hydrated = await Promise.all(codeOnly.slice(0, 10).map((n) => getRepo(n).catch(() => null)));
  for (const r of hydrated) if (r) byName.set(r.full_name, r);

  return { domains, candidates: [...byName.values()].filter((r) => !r.archived && !r.fork) };
}

// Cheap pre-ranking from search metadata only, so the expensive tree/SKILL.md
// evaluation runs on a short list.
function preScore(repo, taskTerms) {
  const hay = `${repo.full_name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`.toLowerCase();
  const rel = taskTerms.filter((t) => hay.includes(t)).length / Math.max(1, taskTerms.length);
  const skilly = /skill/.test(hay) ? 0.3 : 0;
  return Math.log10((repo.stargazers_count ?? 0) + 1) / 5 + rel + skilly;
}

export async function plan(task, { top = 8, log = () => {} } = {}) {
  const { domains, candidates } = await discover(task, { log });
  const domainTerms = domains.flatMap((d) => DOMAINS[d].queries.join(' ').split(' '));
  // The user's own words appear twice so they outweigh generic domain words in relevance
  // ("decompile a windows binary" should not prefer an Android skill).
  const own = terms(task);
  const taskTerms = [...own, ...own, ...new Set(domainTerms.filter((t) => !own.includes(t)))];
  const shortlist = candidates
    .map((r) => ({ r, s: preScore(r, taskTerms) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, top)
    .map((x) => x.r);

  log(`evaluating ${shortlist.map((r) => r.full_name).join(', ')}`);
  const evaluated = await Promise.all(
    shortlist.map((repo) => evaluateRepo(repo, taskTerms).catch((e) => (log(`  ${repo.full_name}: ${e.message}`), null))),
  );
  const results = evaluated.filter(Boolean);
  results.sort((a, b) => b.score - a.score);
  return { task, domains, terms: taskTerms, considered: candidates.length, results };
}
