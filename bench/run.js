// Live benchmark: runs `plan` for a fixed set of tasks against GitHub and checks the top pick.
// Usage: node bench/run.js [out.json]
import fs from 'node:fs';
import { plan } from '../src/plan.js';
import { hasHigh } from '../src/scan.js';

// `expect` lists words at least one of which a sensible top pick should mention.
const TASKS = [
  { task: 'reverse engineer an android apk', expect: ['android', 'apk'] },
  { task: 'decompile a windows binary with ghidra', expect: ['ghidra', 'decompil', 'reverse engineer'] },
  { task: 'security audit of a node.js web app', expect: ['security audit', 'vulnerab', 'appsec'] },
  { task: 'solve a ctf pwn challenge', expect: ['ctf', 'pwn'] },
  { task: 'build a react landing page with tailwind', expect: ['react', 'tailwind', 'frontend', 'landing'] },
  { task: 'write playwright e2e tests', expect: ['playwright', 'e2e', 'end-to-end'] },
  { task: 'deploy a docker app to kubernetes', expect: ['kubernetes', 'k8s', 'docker'] },
  { task: 'fill and merge pdf documents', expect: ['pdf'] },
  { task: 'analyze a csv dataset with pandas', expect: ['pandas', 'csv', 'dataframe', 'data analy'] },
  { task: 'build an ios app in swift', expect: ['ios', 'swift'] },
];

const rows = [];
for (const { task, expect } of TASKS) {
  const t0 = Date.now();
  let res;
  try {
    res = await plan(task, { top: 8 });
  } catch (e) {
    rows.push({ task, error: e.message });
    continue;
  }
  const ms = Date.now() - t0;
  const best = res.results.find((r) => r.skills.length && !hasHigh(r.findings));
  const text = best ? `${best.repo} ${best.description ?? ''} ${best.skills.map((s) => `${s.name} ${s.description}`).join(' ')}`.toLowerCase() : '';
  rows.push({
    task,
    seconds: +(ms / 1000).toFixed(1),
    domains: res.domains,
    candidates: res.considered,
    evaluated: res.results.length,
    blocked: res.results.filter((r) => hasHigh(r.findings)).map((r) => r.repo),
    flagged: res.results.filter((r) => r.flags.some((f) => f.includes('star'))).map((r) => r.repo),
    pick: best && { repo: best.repo, score: best.score, stars: best.stars, skills: best.skills.length, url: best.url, description: best.description },
    onTopic: Boolean(best && expect.some((w) => text.includes(w))),
    ranking: res.results.map((r) => ({ repo: r.repo, score: r.score, stars: r.stars, high: hasHigh(r.findings) })),
  });
  const r = rows.at(-1);
  console.log(`${r.onTopic ? 'PASS' : 'MISS'} ${String(r.seconds).padStart(5)}s  ${task.padEnd(42)} -> ${r.pick?.repo ?? '(none)'} (${r.pick?.score ?? '-'})`);
}

const ok = rows.filter((r) => r.onTopic).length;
const avg = rows.filter((r) => r.seconds).reduce((a, r) => a + r.seconds, 0) / rows.length;
console.log(`\non-topic top pick: ${ok}/${rows.length}   avg ${avg.toFixed(1)}s per task`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ date: new Date().toISOString(), rows }, null, 2));
