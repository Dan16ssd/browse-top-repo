#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan } from '../src/plan.js';
import { evaluateRepo, terms } from '../src/evaluate.js';
import { prepareInstall, commitInstall, checkUpdates, readLock, removeSkill } from '../src/install.js';
import { loadAgents, detectAgents, resolveTargets } from '../src/agents.js';
import { hasHigh } from '../src/scan.js';
import { hooks } from '../src/github.js';

const HELP = `btr - browse, evaluate and install top GitHub agent skills

Usage:
  btr plan "<task>"            Find and rank skill repos for a task
  btr eval <owner/repo> ["<task>"]  Score one repo (optionally against a task)
  btr install <owner/repo[/skill][@ref]>  Install skills into your agents
  btr auto "<task>"            plan + install the best match
  btr update [name...]         Re-install skills whose upstream changed (--check to only report)
  btr list                     Show installed skills
  btr remove <name>            Uninstall a skill
  btr agents                   Show supported agents and where skills go
  btr self-install             Install the browse-top-repo skill (and /btr in Claude Code)

Options:
  --agent <a,b>    claude, codex, gemini, opencode, agents (default: detected agents)
  --scope <s>      user (default) or project
  --dir <path>     project root for --scope project (default: cwd)
  --skill <name>   install only these skills from a multi-skill repo (repeatable)
  --top <n>        how many candidates to deep-evaluate (default 8)
  --yes, -y        do not ask for confirmation
  --force          install despite high-severity findings or name conflicts
  --json           machine-readable output
  --quiet, -q      no progress output
`;

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    agent: { type: 'string', multiple: true },
    scope: { type: 'string', default: 'user' },
    dir: { type: 'string' },
    skill: { type: 'string', multiple: true },
    top: { type: 'string', default: '8' },
    yes: { type: 'boolean', short: 'y' },
    force: { type: 'boolean' },
    json: { type: 'boolean' },
    check: { type: 'boolean' },
    quiet: { type: 'boolean', short: 'q' },
    help: { type: 'boolean', short: 'h' },
  },
});

const [cmd, ...args] = positionals;
const agents = opt.agent?.flatMap((a) => a.split(',')).map((a) => a.trim()).filter(Boolean);
const projectRoot = opt.dir ?? process.cwd();
const log = opt.quiet || opt.json ? () => {} : (m) => process.stderr.write(`\x1b[2m${m}\x1b[0m\n`);
hooks.onRateLimit = (s) => log(`GitHub rate limit, waiting ${s}s`);
const out = (x) => process.stdout.write((typeof x === 'string' ? x : JSON.stringify(x, null, 2)) + '\n');

if (!['user', 'project'].includes(opt.scope)) fail(`--scope must be user or project`);

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
const fmtStars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function printRanking(result) {
  out(`Task: ${result.task}`);
  out(`Domains: ${result.domains.join(', ') || '(none matched, using task keywords)'}   candidates found: ${result.considered}\n`);
  out(`${pad('#', 3)}${pad('score', 7)}${pad('stars', 8)}${pad('repo', 52)}${pad('skills', 7)}notes`);
  result.results.forEach((r, i) => {
    const notes = [...r.penalties.filter(([w]) => w.startsWith('built for') || w.startsWith('official')).map(([w]) => w.replace(/:.*/, '')), ...r.flags, ...r.findings.map((f) => `${f.severity}: ${f.msg}`)];
    if (!r.skills.length) notes.unshift('no SKILL.md');
    out(`${pad(i + 1, 3)}${pad(r.score, 7)}${pad(fmtStars(r.stars), 8)}${pad(r.repo, 52)}${pad(r.skills.length, 7)}${notes.join('; ')}`);
  });
  const best = result.results.find((r) => r.skills.length && !hasHigh(r.findings));
  if (best) {
    out(`\nBest: ${best.repo}  ${best.url}`);
    out(`  ${best.description ?? ''}`);
    for (const s of pickSkills(best).slice(0, 8)) out(`  - ${s.name}: ${s.description.slice(0, 110)}`);
    out(`\nInstall: btr install ${best.repo}${pickSkills(best).length < best.skills.length ? pickSkills(best).map((s) => ` --skill ${s.name}`).join('') : ''}`);
  }
}

function printEval(r) {
  out(`${r.repo}  score ${r.score}/100  (${fmtStars(r.stars)} stars, ${r.forks} forks, license ${r.license ?? 'none'}, pushed ${r.pushedAt?.slice(0, 10)})`);
  out(`  ${r.description ?? ''}`);
  out(`  breakdown: ${Object.entries(r.parts).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}`);
  for (const [why, p] of r.penalties) out(`  penalty: ${why} ${p}`);
  for (const f of r.flags) out(`  trust: ${f}`);
  for (const f of r.findings) out(`  ${f.severity}: ${f.msg} (${f.file}:${f.line})${f.snippet ? `  ${f.snippet}` : ''}`);
  out(`  skills (${r.skills.length}${r.truncatedTree ? ', tree truncated' : ''}):`);
  for (const s of r.skills.slice(0, 30)) out(`    - ${pad(s.name, 30)} ${s.description.slice(0, 90)}`);
}

// In a large multi-skill repo, prefer the skills that match the task.
function pickSkills(r) {
  if (r.skills.length <= 3) return r.skills;
  const relevant = r.skills.filter((s) => s.relevance > 0).sort((a, b) => b.relevance - a.relevance);
  return relevant.length ? relevant.slice(0, 5) : r.skills;
}

async function confirm(question) {
  if (opt.yes) return true;
  if (!process.stdin.isTTY) fail('not a terminal; re-run with --yes after reviewing the findings above');
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function doInstall(spec, extra = {}) {
  const targets = resolveTargets(extra.agents ?? agents, opt.scope, projectRoot);
  log(`fetching ${spec}`);
  const prep = await prepareInstall(spec, { skills: extra.skills ?? opt.skill, skillDirs: extra.skillDirs });
  if (!opt.json) {
    out(`${prep.repo.full_name}@${prep.sha.slice(0, 7)} -> ${targets.map((t) => `${t.agent} (${t.path})`).join(', ')}`);
    for (const p of prep.prepared) {
      out(`  ${p.skill.name}  ${p.files.length} files${p.findings.length ? '' : '  clean'}`);
      for (const f of p.findings) out(`    ${f.severity}: ${f.msg} (${f.file}:${f.line})${f.snippet ? `  ${f.snippet}` : ''}`);
    }
    out('  Note: skills are instructions and scripts your agent will follow. Review anything you do not recognise.');
  }
  if (!(await confirm('Install?'))) return out('aborted');
  const results = commitInstall(prep, { agents: extra.agents ?? agents, scope: opt.scope, projectRoot, force: opt.force });
  if (opt.json) return out({ repo: prep.repo.full_name, sha: prep.sha, results });
  for (const r of results) out(r.skipped ? `  skipped ${r.name}${r.agent ? ` (${r.agent})` : ''}: ${r.skipped}` : `  installed ${r.name} -> ${r.path}`);
}

async function main() {
  if (opt.help || !cmd) return out(HELP);
  if (!['user', 'project'].includes(opt.scope)) fail('--scope must be user or project');

  switch (cmd) {
    case 'plan': {
      if (!args.length) fail('usage: btr plan "<task>"');
      const result = await plan(args.join(' '), { top: Number(opt.top), log });
      return opt.json ? out(result) : printRanking(result);
    }
    case 'eval': {
      if (!args[0]) fail('usage: btr eval <owner/repo> ["<task>"]');
      const r = await evaluateRepo(args[0].replace(/^https?:\/\/github\.com\//, ''), terms(args.slice(1).join(' ')));
      return opt.json ? out(r) : printEval(r);
    }
    case 'install': {
      if (!args.length) fail('usage: btr install <owner/repo[/skill][@ref]>');
      for (const spec of args) await doInstall(spec);
      return;
    }
    case 'auto': {
      if (!args.length) fail('usage: btr auto "<task>"');
      const result = await plan(args.join(' '), { top: Number(opt.top), log });
      if (!opt.json) printRanking(result);
      const best = result.results.find((r) => r.skills.length && !hasHigh(r.findings));
      if (!best) return out('No safe candidate with skills found.');
      const chosen = pickSkills(best);
      return doInstall(best.repo, { skills: chosen.length < best.skills.length ? chosen.map((s) => s.name) : undefined });
    }
    case 'update': {
      const status = await checkUpdates(args);
      if (!status.length) return out('Nothing installed yet.');
      for (const s of status) {
        const label = `${s.entry.name} (${s.entry.repo}, ${s.entry.scope})`;
        if (s.error) out(`  ${label}: ${s.error}`);
        else if (!s.outdated) out(`  ${label}: up to date`);
        else out(`  ${label}: ${s.entry.sha.slice(0, 7)} -> ${s.latest.slice(0, 7)}`);
      }
      if (opt.check) return;
      for (const s of status.filter((x) => x.outdated)) {
        const e = s.entry;
        const prep = await prepareInstall(`${e.repo}@${e.ref}`, { skillDirs: [e.skillDir] });
        const p = prep.prepared[0];
        if (!p) {
          out(`  ${e.name}: skill no longer exists upstream; run btr remove ${e.name}`);
          continue;
        }
        for (const f of p.findings) out(`    ${f.severity}: ${f.msg} (${f.file}:${f.line})`);
        const agentNames = [...new Set(e.targets.map((t) => t.agent))];
        const res = commitInstall(prep, { agents: agentNames, scope: e.scope, projectRoot: e.projectRoot ?? projectRoot, force: opt.force });
        for (const r of res) out(r.skipped ? `  skipped ${r.name}: ${r.skipped}` : `  updated ${r.name} -> ${r.path}`);
      }
      return;
    }
    case 'list': {
      const lock = readLock();
      if (opt.json) return out(lock);
      if (!lock.skills.length) return out('Nothing installed yet.');
      for (const e of lock.skills) {
        out(`${pad(e.name, 30)} ${pad(`${e.repo}@${e.sha.slice(0, 7)}`, 50)} ${e.scope}  ${e.targets.map((t) => t.agent).join(',')}`);
      }
      return;
    }
    case 'remove': {
      if (!args.length) fail('usage: btr remove <name>');
      for (const name of args) {
        const removed = removeSkill(name, { scope: opt.scope === 'project' ? 'project' : undefined, projectRoot: opt.dir });
        out(removed.length ? `removed ${name} (${removed.flatMap((e) => e.targets.map((t) => t.path)).join(', ')})` : `${name} is not installed by btr`);
      }
      return;
    }
    case 'agents': {
      const all = loadAgents();
      const detected = new Set(detectAgents(all));
      for (const [name, a] of Object.entries(all)) out(`${pad(name, 10)} ${detected.has(name) ? 'detected ' : '         '} user: ${a.user}   project: ${a.project}`);
      return;
    }
    case 'self-install': {
      const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'browse-top-repo');
      for (const t of resolveTargets(agents, opt.scope, projectRoot)) {
        const dest = path.join(t.path, 'browse-top-repo');
        fs.cpSync(src, dest, { recursive: true, force: true });
        out(`installed browse-top-repo -> ${dest}`);
        // Claude Code also gets a /btr slash command next to its skills folder.
        if (t.agent === 'claude') {
          const btr = `node "${fileURLToPath(import.meta.url).split(path.sep).join('/')}"`;
          const tpl = fs.readFileSync(path.join(src, '..', 'commands', 'btr.md'), 'utf8');
          const cmdFile = path.join(path.dirname(t.path), 'commands', 'btr.md');
          fs.mkdirSync(path.dirname(cmdFile), { recursive: true });
          fs.writeFileSync(cmdFile, tpl.replaceAll('{{BTR}}', btr));
          out(`installed /btr command -> ${cmdFile}`);
        }
      }
      return;
    }
    default:
      fail(`unknown command "${cmd}"\n\n${HELP}`);
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${e.message}
`);
  process.exitCode = 1;
});
