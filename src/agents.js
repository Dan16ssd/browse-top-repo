// Where each coding agent looks for SKILL.md skills. Paths can be overridden or new
// agents added in ~/.btr/agents.json, e.g. { "cursor": { "user": "~/.cursor/skills", "project": ".cursor/skills", "detect": "~/.cursor" } }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const btrHome = () => process.env.BTR_HOME || path.join(os.homedir(), '.btr');

const DEFAULT_AGENTS = {
  claude: { user: '~/.claude/skills', project: '.claude/skills', detect: '~/.claude' },
  codex: { user: '~/.codex/skills', project: '.agents/skills', detect: '~/.codex' },
  gemini: { user: '~/.gemini/skills', project: '.gemini/skills', detect: '~/.gemini' },
  opencode: { user: '~/.config/opencode/skill', project: '.opencode/skill', detect: '~/.config/opencode' },
  // Shared cross-agent location; only used when asked for explicitly.
  agents: { user: '~/.agents/skills', project: '.agents/skills', detect: null },
};

const expandHome = (p) => (p.startsWith('~') ? path.join(process.env.BTR_USER_HOME || os.homedir(), p.slice(1)) : p);

export function loadAgents() {
  const file = path.join(btrHome(), 'agents.json');
  let overrides = {};
  if (fs.existsSync(file)) overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
  const merged = { ...DEFAULT_AGENTS };
  for (const [k, v] of Object.entries(overrides)) merged[k] = { ...merged[k], ...v };
  return merged;
}

export function detectAgents(agents = loadAgents()) {
  return Object.entries(agents)
    .filter(([, a]) => a.detect && fs.existsSync(expandHome(a.detect)))
    .map(([name]) => name);
}

// Returns [{ agent, path }] skill-root directories for the requested agents and scope.
export function resolveTargets(names, scope = 'user', projectRoot = process.cwd()) {
  const agents = loadAgents();
  const wanted = names?.length ? names : detectAgents(agents);
  if (!wanted.length) throw new Error('No supported agents detected; pass --agent claude (or codex, gemini, opencode, agents)');
  const seen = new Set();
  const targets = [];
  for (const name of wanted) {
    const a = agents[name];
    if (!a) throw new Error(`Unknown agent "${name}". Known: ${Object.keys(agents).join(', ')}`);
    const dir = scope === 'project' ? path.resolve(projectRoot, a.project) : expandHome(a.user);
    if (seen.has(dir)) continue; // codex and agents share .agents/skills in project scope
    seen.add(dir);
    targets.push({ agent: name, path: dir });
  }
  return targets;
}
