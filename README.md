<p align="center"><img src="docs/logo.svg" width="112" alt="btr logo: a magnifying glass over a star"></p>
<h1 align="center">browse-top-repo (<code>btr</code>)</h1>
<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a></p>

Before an agent starts a task, `btr` searches GitHub for agent skills (`SKILL.md`) that fit the task,
ranks the top repos, scans them for unsafe content, and installs the winner into Claude Code, Codex,
Gemini CLI, OpenCode or the shared `~/.agents/skills` folder. `btr update` pulls new upstream versions.

Zero dependencies; Node 18+.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <img alt="btr: skill scout for coding agents" src="docs/images/hero-light.png">
</picture>

**Video review (1 min 47 s, narrated, subtitled):** [16:9](docs/btr-review.mp4) · [9:16 for TikTok / Reels / Shorts](docs/btr-review-vertical.mp4) · subtitles: [docs/btr-review.srt](docs/btr-review.srt)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/demo-dark.png">
  <img alt="btr plan output for an Android reverse-engineering task" src="docs/images/demo-light.png">
</picture>

```sh
npm link                      # makes `btr` available globally (or run node bin/btr.js)
btr self-install              # teach your agents to use btr before starting work

btr plan "reverse engineer an android apk"
btr eval trailofbits/skills "security audit"
btr install cloudflare/security-audit-skill
btr install anthropics/skills --skill pdf --agent claude --scope project
btr auto "pentest my web app"  # plan + install the best match (asks first)
btr update --check && btr update
btr list
btr remove security-audit
```

Write the task in English: `btr` matches English keywords, and almost all skills on GitHub are written in English.

### In Claude Code: `/btr`

`btr self-install` also adds a `/btr` slash command to Claude Code:

```text
/btr make an animated explainer video with remotion   # plan, show the top 3, ask, install
/btr list
/btr update                                           # shows what changed, asks before updating
/btr remove remotion-best-practices
```

Claude runs the plan, shows the top picks with their scores and findings, and installs only after you say yes.

## How a task picks its skills

1. **Classify** the task into domains (reverse-engineering, security, mobile, frontend, backend, devops,
   data, ml, testing, documents) by keyword; edit `DOMAINS` in `src/plan.js` to add more.
2. **Discover** candidates with GitHub repo search (`<domain> claude skill`, `<domain> agent skills`) and,
   when authenticated, code search for `filename:SKILL.md <domain>`. Words that look like a tool name
   (`remotion`, `ghidra`, `playwright`) get their own searches, and `btr` also checks the tool's own
   GitHub org, so official skills like `remotion-dev/skills` are found even when their description
   never names the tool.
3. **Shortlist** by stars + description match, then **evaluate** the top `--top` (default 8) by reading
   their file tree and `SKILL.md` frontmatter.
4. **Score** 0-100:

   | part | weight | measured by |
   |---|---|---|
   | popularity | 30 | log of stars |
   | relevance | 25 | task terms in repo name/description/topics and in each skill's description |
   | skills | 20 | has SKILL.md, and how many have `name` + `description` |
   | freshness | 15 | halves every 180 days since last push |
   | health | 10 | license, not archived, open issues vs stars |
   | official | +10 | published by the tool's own org (e.g. `remotion-dev` for a Remotion task) |
   | penalties | | -40 high-severity content, -10 medium, -5 per trust flag (e.g. 2k+ stars in under 90 days, almost no forks), -15 wrong platform |

5. In multi-skill repos only the skills relevant to the task are suggested.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/scoring-dark.png">
  <img alt="Score weights and penalties" src="docs/images/scoring-light.png">
</picture>

## Safety

Skills are instructions plus scripts that your agent runs with your permissions. Before anything is
written, every downloaded file is scanned for: download-and-execute (`curl | sh`, `iex`), encoded payloads,
`rm -rf ~`, reading credential files, prompt injection ("do not tell the user"), disabling agent safety
flags, token exfiltration, persistence, and bundled binaries. High-severity findings block the install
unless you pass `--force`. Updates are re-scanned. The scanner is a heuristic: security skills often
mention credential paths legitimately, and a clean scan does not prove a skill is safe.

`btr` never overwrites a skill folder it did not create unless you pass `--force`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/scanner-dark.png">
  <img alt="Skills the scanner blocked, and false alarms that were fixed" src="docs/images/scanner-light.png">
</picture>

## Agents and paths

| agent | user scope | project scope |
|---|---|---|
| claude | `~/.claude/skills` | `.claude/skills` |
| codex | `~/.codex/skills` | `.agents/skills` |
| gemini | `~/.gemini/skills` | `.gemini/skills` |
| opencode | `~/.config/opencode/skill` | `.opencode/skill` |
| agents | `~/.agents/skills` | `.agents/skills` |

Without `--agent`, skills go to every agent whose config folder exists. Override or add agents in
`~/.btr/agents.json`:

```json
{ "cursor": { "user": "~/.cursor/skills", "project": ".cursor/skills", "detect": "~/.cursor" } }
```

Installs are tracked in `~/.btr/lock.json` (repo, skill path, ref, commit sha, target folders).

## Auth

Uses `GITHUB_TOKEN` / `GH_TOKEN`, or `gh auth token` if the GitHub CLI is logged in. Unauthenticated use
works but skips code search and hits rate limits quickly.

## Status and benchmark

Early release (v0.1). `npm run bench` runs `plan` for 10 tasks against live GitHub. On 2026-10-31 the
top pick was a good fit for 6 tasks, acceptable for 1, and off-target for 3:

- Strong on specialist tasks: Android RE, web security audit, CTF, Playwright e2e, UI design, pandas.
- Weak on broad tasks where a popular repo with a loosely related skill wins: Kubernetes deploy picked
  `kubeshark`, PDF missed `anthropics/skills`, iOS picked a mobile testing tool. Check `btr plan` output
  before `btr auto` for these.
- A plan takes 3-6 s. Running many in a row hits GitHub's search rate limit (30/min); `btr` waits it out,
  so the 10-task run averaged 12.4 s.
- Naming the tool helps: "... using remotion" finds the official `remotion-dev/skills` and ranks it first.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/benchmark-dark.png">
  <img alt="Benchmark of 10 live tasks" src="docs/images/benchmark-light.png">
</picture>

Known gaps: MCP servers (e.g. REA) are discovered but not registered; Codex/Gemini/OpenCode skill paths
are best guesses and can be overridden in `~/.btr/agents.json`.


## Tests

```sh
npm test        # offline: parsing, scoring, scanner, install/update/remove in a temp home
npm run bench   # live GitHub benchmark
```
