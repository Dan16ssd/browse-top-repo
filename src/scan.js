// Static safety scan of skill content before it is handed to an agent.
// Skills are instructions plus scripts that an agent will follow with your permissions,
// so anything that downloads-and-executes, exfiltrates secrets or tries to steer the
// agent away from the user is flagged. This is a heuristic, not a guarantee.
//
// Security and reverse-engineering skills legitimately *talk about* credential stores and
// prompt-injection payloads, so rules marked `code` only fire on lines that act (a command or
// script line), and `quoted` matches inside a string literal are treated as data.

const CMD = /(^\s*(\$|>|#!|sudo\b)|\b(cat|cp|scp|type|tar|zip|curl|wget|base64|Get-Content|open\(|readFile|read_text|fs\.read)\b)/i;
const SCRIPT_EXT = /\.(sh|bash|zsh|ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|rb|pl)$/i;

const RULES = [
  { id: 'pipe-to-shell', severity: 'high', re: /\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/i, msg: 'downloads and pipes into a shell' },
  { id: 'iex-download', severity: 'high', re: /\b(iex|Invoke-Expression)\b[^\n]*(DownloadString|iwr|Invoke-WebRequest|irm|Invoke-RestMethod)/i, msg: 'PowerShell download-and-execute' },
  { id: 'encoded-exec', severity: 'high', re: /(base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh|powershell[^\n]*-e(nc(odedcommand)?)?\s+[A-Za-z0-9+/=]{20,})/i, msg: 'executes encoded payload' },
  { id: 'destructive-rm', severity: 'high', re: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(--no-preserve-root\s+)?(\/|~|\$HOME)(\s|$)/i, msg: 'recursive delete of root or home' },
  { id: 'secret-read', severity: 'high', code: true, re: /(~\/\.ssh\/id_|\.ssh\/id_(rsa|ed25519)|\.aws\/credentials|\.git-credentials|\.claude\/\.credentials|wallet\.dat)/i, msg: 'reads credential files' },
  { id: 'prompt-injection', severity: 'high', quoted: true, re: /(ignore (all )?(previous|prior|above) instructions|do not (tell|inform) the user(?! to\b)|without (asking|telling) the user|hide (this|it) from the user|never (tell|reveal to) the user)/i, msg: 'instructs the agent to deceive or bypass the user' },
  { id: 'disable-safety', severity: 'medium', re: /(--dangerously-skip-permissions|bypassPermissions|--no-verify|--yolo\b)/i, msg: 'disables agent or git safety checks' },
  { id: 'token-exfil', severity: 'medium', code: true, re: /(GITHUB_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY)[^\n]*(curl|fetch|requests\.post|http)/i, msg: 'sends an API token over the network' },
  { id: 'eval-remote', severity: 'medium', re: /\b(eval|exec)\s*\(\s*(requests\.get|urllib|fetch|await fetch)/i, msg: 'evaluates remote code' },
  { id: 'persistence', severity: 'medium', code: true, re: /(crontab\s+-|\/etc\/rc\.local|CurrentVersion\\Run\b|schtasks\s+\/create|launchctl\s+load)/i, msg: 'sets up persistence' },
  { id: 'binary', severity: 'low', test: (f) => /\.(exe|dll|so|dylib|bin|jar)$/i.test(f.path), msg: 'ships a prebuilt binary' },
];

// True when the match sits inside a "..." or '...' string on that line, i.e. it is data
// (an example payload) rather than an instruction.
function insideQuotes(line, index) {
  const before = line.slice(0, index);
  return (before.split('"').length - 1) % 2 === 1 || (before.split("'").length - 1) % 2 === 1;
}

// files: [{ path, content: Buffer }]
export function scanFiles(files) {
  const findings = [];
  for (const f of files) {
    const isScript = SCRIPT_EXT.test(f.path);
    const lines = f.content.subarray(0, 2_000_000).toString('utf8').split(/\r?\n/);
    for (const rule of RULES) {
      if (rule.test) {
        if (rule.test(f)) findings.push({ rule: rule.id, severity: rule.severity, file: f.path, line: 0, msg: rule.msg });
        continue;
      }
      for (let i = 0; i < lines.length; i++) {
        const m = rule.re.exec(lines[i]);
        if (!m) continue;
        if (rule.code && !isScript && !CMD.test(lines[i])) continue;
        if (rule.quoted && insideQuotes(lines[i], m.index)) continue;
        findings.push({ rule: rule.id, severity: rule.severity, file: f.path, line: i + 1, msg: rule.msg, snippet: lines[i].trim().slice(0, 160) });
        break; // one finding per rule per file is enough
      }
    }
  }
  return findings;
}

export const hasHigh = (findings) => findings.some((f) => f.severity === 'high');
