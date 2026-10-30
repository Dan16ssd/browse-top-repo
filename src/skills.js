// Locating and parsing SKILL.md-based skills inside a repository tree.
import path from 'node:path/posix';

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_SKILL_BYTES = 20_000_000;

// Returns [{ name, dir, skillFile, files: [{ path, size }] }] for every SKILL.md in the tree.
export function findSkills(entries, repoName) {
  const blobs = entries.filter((e) => e.type === 'blob');
  const skillFiles = blobs.filter((e) => path.basename(e.path).toLowerCase() === 'skill.md');
  return skillFiles.map((sf) => {
    const dir = path.dirname(sf.path) === '.' ? '' : path.dirname(sf.path);
    const prefix = dir ? `${dir}/` : '';
    const files = blobs
      .filter((b) => b.path.startsWith(prefix))
      // A root-level skill should not swallow the whole repo's other skills or tooling.
      .filter((b) => dir || !b.path.includes('/') || isNestedAsset(b.path))
      .map((b) => ({ path: b.path, size: b.size ?? 0 }));
    return { name: safeName(dir ? path.basename(dir) : repoName), dir, skillFile: sf.path, files };
  });
}

function isNestedAsset(p) {
  return /^(scripts|references|assets|templates|resources|examples)\//.test(p);
}

export function safeName(name) {
  const s = String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
  return s || 'skill';
}

// Tiny YAML-frontmatter reader: handles `key: value`, quoted values and `>`/`|` block scalars.
export function parseFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^[>|][-+]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(value.startsWith('|') ? '\n' : ' ').trim();
    } else {
      value = value.replace(/^(["'])(.*)\1$/, '$2');
    }
    out[kv[1]] = value;
  }
  return out;
}
