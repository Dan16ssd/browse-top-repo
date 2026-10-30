// Scores a repository as a skill source for a given task.
import { getRepo, getCommit, getTree, getFile } from './github.js';
import { findSkills, parseFrontmatter } from './skills.js';
import { scanFiles } from './scan.js';

const STOP = new Set('the and for with that this from into about want need make build using use project app task work then them want help some your my our can will should please write create implement develop solve new using good best'.split(' '));

export function terms(text) {
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{2,}/g) ?? [])].filter((t) => !STOP.has(t));
}

const PLATFORMS = ['windows', 'linux', 'macos', 'android', 'ios', 'firmware', 'web'];

const WEIGHTS ={ popularity: 30, relevance: 25, skills: 20, freshness: 15, health: 10 };

function relevance(hay, taskTerms) {
  if (!taskTerms.length) return 0;
  const h = hay.toLowerCase();
  return taskTerms.filter((t) => h.includes(t)).length / taskTerms.length;
}

export function trustFlags(repo, now = Date.now()) {
  const flags = [];
  const stars = repo.stargazers_count ?? 0;
  const ageDays = (now - Date.parse(repo.created_at)) / 86_400_000;
  if (stars > 2000 && ageDays < 90) flags.push(`${stars} stars in ${Math.round(ageDays)} days: check for star farming`);
  if (stars > 1000 && (repo.forks_count ?? 0) / stars < 0.02) flags.push('very few forks for its star count');
  if (!repo.license) flags.push('no license');
  return flags;
}

export function computeScore({ repo, skills, taskTerms, findings, now = Date.now() }) {
  const stars = repo.stargazers_count ?? 0;
  const days = (now - Date.parse(repo.pushed_at)) / 86_400_000;
  const withMeta = skills.filter((s) => s.meta?.name && s.meta?.description);

  const repoHay = `${repo.full_name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`;
  const skillRel = skills.map((s) => relevance(`${s.name} ${s.meta?.description ?? ''}`, taskTerms));
  const parts = {
    popularity: Math.min(1, Math.log10(stars + 1) / 4.5),
    relevance: Math.min(1, 0.6 * relevance(repoHay, taskTerms) + 0.6 * Math.max(0, ...skillRel)),
    skills: skills.length ? 0.5 + 0.5 * (withMeta.length / skills.length) : 0,
    freshness: Math.pow(0.5, Math.max(0, days) / 180),
    health: (repo.license ? 0.4 : 0) + (repo.archived ? 0 : 0.3) + ((repo.open_issues_count ?? 0) <= Math.max(20, stars * 0.05) ? 0.3 : 0),
  };
  let score = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * parts[k], 0);

  const penalties = [];
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  if (high) penalties.push(['unsafe content', -40]);
  if (medium) penalties.push(['risky content', -10]);
  const want = PLATFORMS.filter((p) => taskTerms.includes(p));
  const hay = `${repoHay} ${skills.map((s) => s.meta?.description ?? '').join(' ')}`.toLowerCase();
  const has = PLATFORMS.filter((p) => hay.includes(p));
  if (want.length && has.length && !want.some((p) => has.includes(p))) penalties.push([`built for ${has.join('/')}, not ${want.join('/')}`, -15]);
  const flags = trustFlags(repo, now).filter((f) => f !== 'no license'); // license already in health
  if (flags.length) penalties.push(['trust signals', -5 * flags.length]);
  for (const [, p] of penalties) score += p;

  return { score: Math.max(0, Math.round(score)), parts, penalties, skillRel };
}

// repoOrName: a search result object or "owner/repo". maxSkillsRead caps raw fetches.
export async function evaluateRepo(repoOrName, taskTerms = [], { maxSkillsRead = 12 } = {}) {
  const repo = typeof repoOrName === 'string' ? await getRepo(repoOrName) : repoOrName;
  const commit = await getCommit(repo.full_name, repo.default_branch);
  const tree = await getTree(repo.full_name, commit.treeSha);
  const skills = findSkills(tree.entries, repo.name);

  const docs = await Promise.all(
    skills.slice(0, maxSkillsRead).map(async (s) => {
      try {
        const content = await getFile(repo.full_name, commit.sha, s.skillFile);
        s.meta = parseFrontmatter(content.toString('utf8'));
        return { path: s.skillFile, content };
      } catch {
        s.meta = {};
        return null;
      }
    }),
  );
  const skillDocs = docs.filter(Boolean);
  const findings = scanFiles(skillDocs);
  const { score, parts, penalties, skillRel } = computeScore({ repo, skills, taskTerms, findings });
  skills.forEach((s, i) => (s.relevance = skillRel[i] ?? 0));

  return {
    repo: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    pushedAt: repo.pushed_at,
    license: repo.license?.spdx_id ?? null,
    defaultBranch: repo.default_branch,
    sha: commit.sha,
    truncatedTree: tree.truncated,
    score,
    parts,
    penalties,
    flags: trustFlags(repo),
    findings,
    skills: skills.map((s) => ({
      name: s.name,
      dir: s.dir,
      description: s.meta?.description ?? '',
      files: s.files.length,
      relevance: Math.round((s.relevance ?? 0) * 100) / 100,
    })),
  };
}
