// Download skills from GitHub, scan them, copy them into agent skill folders,
// and track what was installed in ~/.btr/lock.json so `update` and `remove` work.
import fs from 'node:fs';
import path from 'node:path';
import { parseRepoSpec, getRepo, getCommit, getTree, getFile } from './github.js';
import { findSkills, MAX_FILE_BYTES, MAX_SKILL_BYTES } from './skills.js';
import { scanFiles, hasHigh } from './scan.js';
import { resolveTargets, btrHome } from './agents.js';

const lockPath = () => path.join(btrHome(), 'lock.json');

export function readLock() {
  try {
    return JSON.parse(fs.readFileSync(lockPath(), 'utf8'));
  } catch {
    return { version: 1, skills: [] };
  }
}

function writeLock(lock) {
  fs.mkdirSync(btrHome(), { recursive: true });
  fs.writeFileSync(lockPath(), JSON.stringify(lock, null, 2) + '\n');
}

const sameEntry = (a, b) => a.name === b.name && a.scope === b.scope && (a.projectRoot ?? null) === (b.projectRoot ?? null);

// Resolve a repo spec to the skills it contains, without downloading file contents.
export async function resolveSkills(spec, { skills: wantedNames, skillDirs } = {}) {
  const { fullName, skillPath, ref } = parseRepoSpec(spec);
  const repo = await getRepo(fullName);
  const useRef = ref ?? repo.default_branch;
  const commit = await getCommit(fullName, useRef);
  const tree = await getTree(fullName, commit.treeSha);
  let skills = findSkills(tree.entries, repo.name);
  if (!skills.length) throw new Error(`${fullName} has no SKILL.md files${tree.truncated ? ' (tree was truncated by GitHub)' : ''}`);

  const want = [...(wantedNames ?? []), ...(skillPath ? [skillPath] : [])];
  if (skillDirs?.length) skills = skills.filter((s) => skillDirs.includes(s.dir));
  else if (want.length) {
    skills = skills.filter((s) => want.some((w) => w === s.name || w === s.dir || s.dir.endsWith(`/${w}`)));
    if (!skills.length) throw new Error(`No skill matching ${want.join(', ')} in ${fullName}`);
  }
  return { repo, ref: useRef, sha: commit.sha, truncated: tree.truncated, skills };
}

async function download(fullName, sha, skill) {
  let total = 0;
  const files = [];
  for (const f of skill.files) {
    if (f.size > MAX_FILE_BYTES) continue;
    total += f.size;
    if (total > MAX_SKILL_BYTES) throw new Error(`${skill.name} exceeds ${MAX_SKILL_BYTES / 1e6} MB`);
    files.push({ path: f.path, rel: skill.dir ? f.path.slice(skill.dir.length + 1) : f.path, content: await getFile(fullName, sha, f.path) });
  }
  return files;
}

function writeSkill(rootDir, name, files) {
  const dest = path.resolve(rootDir, name);
  // Validate every path before touching disk so a bad file cannot leave a half-written skill.
  const outs = files.map((f) => {
    const out = path.resolve(dest, f.rel);
    if (!out.startsWith(dest + path.sep)) throw new Error(`Refusing path outside skill dir: ${f.rel}`);
    return out;
  });
  fs.rmSync(dest, { recursive: true, force: true });
  files.forEach((f, i) => {
    fs.mkdirSync(path.dirname(outs[i]), { recursive: true });
    fs.writeFileSync(outs[i], f.content);
  });
  return dest;
}

// Step 1 of install: fetch + scan, nothing written yet. Lets the CLI show findings and confirm.
export async function prepareInstall(spec, opts = {}) {
  const resolved = await resolveSkills(spec, opts);
  const prepared = [];
  for (const skill of resolved.skills) {
    const files = await download(resolved.repo.full_name, resolved.sha, skill);
    prepared.push({ skill, files, findings: scanFiles(files) });
  }
  return { ...resolved, prepared };
}

// Step 2: write to agent folders and record in the lock file.
export function commitInstall(prep, { agents, scope = 'user', projectRoot = process.cwd(), force = false } = {}) {
  const targets = resolveTargets(agents, scope, projectRoot);
  const lock = readLock();
  const results = [];

  for (const { skill, files, findings } of prep.prepared) {
    if (hasHigh(findings) && !force) {
      results.push({ name: skill.name, skipped: 'high-severity safety findings (use --force to override)' });
      continue;
    }
    const entry = {
      name: skill.name,
      repo: prep.repo.full_name,
      skillDir: skill.dir,
      ref: prep.ref,
      sha: prep.sha,
      scope,
      projectRoot: scope === 'project' ? path.resolve(projectRoot) : null,
      targets: [],
      findings: findings.length,
      installedAt: new Date().toISOString(),
    };
    const existing = lock.skills.find((e) => sameEntry(e, entry));
    if (existing && existing.repo !== entry.repo && !force) {
      results.push({ name: skill.name, skipped: `already installed from ${existing.repo} (use --force to replace)` });
      continue;
    }
    for (const t of targets) {
      const dest = path.join(t.path, skill.name);
      const managed = existing?.targets.some((x) => x.path === dest);
      if (fs.existsSync(dest) && !managed && !force) {
        results.push({ name: skill.name, agent: t.agent, skipped: `${dest} exists and was not installed by btr (use --force)` });
        continue;
      }
      writeSkill(t.path, skill.name, files);
      entry.targets.push({ agent: t.agent, path: dest });
      results.push({ name: skill.name, agent: t.agent, path: dest });
    }
    // Keep targets from an earlier install that this run did not touch (e.g. a different --agent).
    for (const old of existing?.targets ?? []) if (!entry.targets.some((x) => x.path === old.path)) entry.targets.push(old);
    if (entry.targets.length) lock.skills = [...lock.skills.filter((e) => !sameEntry(e, entry)), entry];
  }
  writeLock(lock);
  return results;
}

// Find lock entries whose upstream ref moved. Returns [{ entry, latest }].
export async function checkUpdates(names = []) {
  const lock = readLock();
  const entries = names.length ? lock.skills.filter((e) => names.includes(e.name)) : lock.skills;
  const out = [];
  for (const entry of entries) {
    try {
      const { sha } = await getCommit(entry.repo, entry.ref);
      out.push({ entry, latest: sha, outdated: sha !== entry.sha });
    } catch (e) {
      out.push({ entry, error: e.message });
    }
  }
  return out;
}

export function removeSkill(name, { scope, projectRoot } = {}) {
  const lock = readLock();
  const match = lock.skills.filter(
    (e) => e.name === name && (!scope || e.scope === scope) && (!projectRoot || e.projectRoot === path.resolve(projectRoot)),
  );
  for (const e of match) for (const t of e.targets) fs.rmSync(t.path, { recursive: true, force: true });
  lock.skills = lock.skills.filter((e) => !match.includes(e));
  writeLock(lock);
  return match;
}
