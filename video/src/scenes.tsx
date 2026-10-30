import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { C, F, cue } from './theme';

// ---- shared bits -------------------------------------------------------------------------

// `v` is true for the portrait (TikTok / Reels) composition. Portrait layouts keep content between
// y=180 and y=1300 so it clears the app's top bar, the captions and the like/comment buttons.
const useT = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  return { frame, fps, v: height > width, pop: (at: number) => spring({ frame: frame - at, fps, config: { damping: 18, mass: 0.7 } }) };
};

const PORTRAIT_PAD = '180px 70px 620px';

const fadeUp = (frame: number, at: number, dist = 24): React.CSSProperties => {
  const p = interpolate(frame, [at, at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

const Stage: React.FC<{ eyebrow: string; title: string; children: React.ReactNode }> = ({ eyebrow, title, children }) => {
  const { frame, v } = useT();
  return (
    <AbsoluteFill style={{ padding: v ? PORTRAIT_PAD : '80px 120px 200px', gap: v ? 34 : 40, display: 'flex', flexDirection: 'column' }}>
      <div style={fadeUp(frame, 0)}>
        <div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: C.accent, marginBottom: 14 }}>{eyebrow}</div>
        <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: v ? 70 : 76, color: C.ink, letterSpacing: -1.5, lineHeight: 1.05 }}>{title}</div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>{children}</div>
    </AbsoluteFill>
  );
};

const Pill: React.FC<{ tone: 'good' | 'warn' | 'bad'; children: React.ReactNode; size?: number }> = ({ tone, children, size = 22 }) => (
  <span style={{ display: 'inline-block', fontFamily: F.body, fontWeight: 600, fontSize: size, color: C[tone], background: `${C[tone]}22`, border: `1px solid ${C[tone]}55`, padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

const typed = (text: string, frame: number, at: number, cps = 28, fps = 30) => text.slice(0, Math.max(0, Math.floor(((frame - at) / fps) * cps)));

const AGENTS = ['Claude Code', 'Codex', 'Gemini CLI', 'OpenCode'];

// ---- 1. title ----------------------------------------------------------------------------

export const Title = () => {
  const { frame, pop, v } = useT();
  const cmd = typed('$ btr plan "your task"', frame, 4, 22);
  const chipsAt = cue('title', /installs/, 7);
  return (
    <AbsoluteFill style={{ padding: v ? PORTRAIT_PAD : '0 160px 160px', justifyContent: 'center', gap: 34 }}>
      <div style={{ fontFamily: F.mono, fontSize: 40, color: C.accent, height: 52 }}>
        {cmd}
        <span style={{ opacity: Math.floor(frame / 15) % 2 ? 0 : 1 }}>▍</span>
      </div>
      <div style={{ ...fadeUp(frame, 18, 40), fontFamily: F.display, fontWeight: 800, fontSize: v ? 130 : 150, lineHeight: 0.98, letterSpacing: -4, color: C.ink }}>
        Skill scout
        <br />
        for coding {v ? <br /> : null}agents
      </div>
      <div style={{ ...fadeUp(frame, cue('title', /Before/, 3)), fontFamily: F.body, fontSize: 40, color: C.muted, maxWidth: 1300 }}>
        Finds the best agent skill on GitHub for your task, checks it is safe, and installs it.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        {AGENTS.map((a, i) => (
          <div key={a} style={{ transform: `scale(${pop(chipsAt + i * 4)})`, fontFamily: F.mono, fontSize: 28, color: C.ink, border: `1px solid ${C.rule}`, background: C.sheet, padding: '10px 22px', borderRadius: 10 }}>
            {a}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---- 2. problem --------------------------------------------------------------------------

const COLS = 12;
const ROWS = 4;
const GOOD = new Set([3, 14, 22, 31, 40, 9, 27]);
const STALE = new Set([1, 6, 12, 17, 20, 25, 29, 35, 38, 44, 46, 5, 33]);
const EVIL = 30;

export const Problem = () => {
  const { frame, pop, v } = useT();
  const goodAt = cue('problem', /excellent/, 3);
  const staleAt = cue('problem', /abandoned/, 4);
  const evilAt = cue('problem', /quietly/, 6);
  const zoom = pop(evilAt + 6);
  return (
    <Stage eyebrow="The problem" title="Thousands of skills. Some are traps.">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${v ? 6 : COLS}, 1fr)`, gap: v ? 12 : 14 }}>
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const appear = pop(4 + ((i * 7) % 30));
          const isGood = GOOD.has(i) && frame >= goodAt;
          const isStale = STALE.has(i) && frame >= staleAt;
          const isEvil = i === EVIL && frame >= evilAt;
          const border = isEvil ? C.bad : isGood ? C.good : C.rule;
          return (
            <div key={i} style={{ height: v ? 78 : 96, borderRadius: 10, border: `2px solid ${border}`, background: isEvil ? `${C.bad}22` : C.sheet, opacity: appear * (isStale ? 0.28 : 1), transform: `scale(${0.85 + 0.15 * appear})`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: F.mono, fontSize: 15, color: isGood ? C.good : isEvil ? C.bad : C.muted }}>SKILL.md</div>
              <div style={{ height: 8, width: '80%', borderRadius: 4, background: C.rule }} />
              <div style={{ height: 8, width: '55%', borderRadius: 4, background: C.rule }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: '50%', top: v ? 280 : 150, transform: `translateX(-50%) scale(${zoom})`, opacity: zoom, background: C.term, border: `2px solid ${C.bad}`, borderRadius: 16, padding: v ? '24px 30px' : '26px 40px', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ fontFamily: F.mono, fontSize: 22, color: C.muted, marginBottom: 10 }}>a real skill, line 689</div>
        <div style={{ fontFamily: F.mono, fontSize: v ? 31 : 40, color: C.bad, whiteSpace: 'nowrap' }}>"privateKey": "$(cat ~/.ssh/id_rsa)"</div>
      </div>
    </Stage>
  );
};

// ---- 3. pipeline -------------------------------------------------------------------------

const STEPS: [string, RegExp, string][] = [
  ['Classify', /classif/i, 'task → domains'],
  ['Search', /search/i, 'repos + SKILL.md code'],
  ['Shortlist', /shortlist/i, 'top 8 by stars + match'],
  ['Score', /scores/i, '0–100 per repo'],
  ['Scan', /scans/i, 'every file, before install'],
  ['Install', /installs/i, 'into each agent + lockfile'],
];

export const Pipeline = () => {
  const { frame, pop, v } = useT();
  const agentsAt = cue('pipeline', /Claude/, 14);
  return (
    <Stage eyebrow="How it works" title="Six steps, task to installed skill">
      <div style={{ display: 'grid', gridTemplateColumns: v ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: v ? '30px 40px' : 26, marginTop: v ? 0 : 50 }}>
        {STEPS.map(([name, re, sub], i) => {
          const at = cue('pipeline', re, 2 + i * 1.5);
          const on = pop(at);
          return (
            <div key={name} style={{ borderTop: `6px solid ${frame >= at ? C.accent : C.rule}`, paddingTop: v ? 16 : 22, opacity: 0.35 + 0.65 * on, transform: `translateY(${(1 - on) * 20}px)` }}>
              <div style={{ fontFamily: F.mono, fontSize: 26, color: C.accent }}>{i + 1}</div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 52 : 56, color: C.ink, marginTop: v ? 4 : 8 }}>{name}</div>
              <div style={{ fontFamily: F.body, fontSize: v ? 29 : 31, color: C.muted, marginTop: v ? 6 : 12, lineHeight: 1.3 }}>{sub}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: v ? 14 : 18, marginTop: v ? 44 : 70, alignItems: 'center' }}>
        <div style={{ ...fadeUp(frame, agentsAt - 6), fontFamily: F.body, fontSize: 30, color: C.muted, marginRight: 10 }}>Installs into</div>
        {AGENTS.map((a, i) => (
          <div key={a} style={{ transform: `scale(${pop(agentsAt + i * 6)})`, fontFamily: F.mono, fontSize: 30, color: C.ink, border: `1px solid ${C.accent}`, background: `${C.accent}18`, padding: '12px 24px', borderRadius: 10 }}>
            {a}
          </div>
        ))}
      </div>
    </Stage>
  );
};

// ---- 4. demo -----------------------------------------------------------------------------

const ROWS_DEMO: [number, string, string, number, string?][] = [
  [94, '8.6k', 'SimoneAvogadro/android-reverse-engineering-skill', 1],
  [85, '10.2k', 'mobile-next/mobile-mcp', 1],
  [81, '43.8k', 'zhaoxuya520/reverse-skill', 89],
  [80, '959', 'alexgaoth/awesome-reverse-engineered', 1],
  [77, '13.9k', 'OrchestratorInc/agent-orchestrator', 13],
  [75, '225', 'index-login/MobileRE-Skill', 6],
  [73, '1.9k', 'yetone/native-feel-skill', 1],
  [72, '9.2k', 'rehan-remade/universal-modder', 39, '9241 stars in 31 days'],
];

export const Demo = () => {
  const { frame, v } = useT();
  const cmd = typed('$ btr plan "reverse engineer an android apk"', frame, 6, 30);
  const foundAt = cue('demo', /^64|sixty/i, 4);
  const winnerAt = cue('demo', /winner/, 8);
  const flagAt = cue('demo', /flags/, 11);
  const row = (i: number) => foundAt + 10 + i * 5;
  // Portrait is too narrow for the stars column, so it is dropped and long lines wrap.
  const mono: React.CSSProperties = { fontFamily: F.mono, fontSize: v ? 24 : 29, whiteSpace: v ? 'pre-wrap' : 'pre' };
  return (
    <AbsoluteFill style={{ padding: v ? '180px 50px 620px' : '70px 120px 200px' }}>
      <div style={{ background: C.term, border: `1px solid ${C.rule}`, borderRadius: 18, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 10, padding: '18px 24px', borderBottom: `1px solid ${C.rule}`, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: '#ffffff22' }} />)}
          <div style={{ fontFamily: F.mono, fontSize: 20, color: C.muted, marginLeft: 12 }}>btr plan · live GitHub</div>
        </div>
        <div style={{ padding: v ? '24px 26px' : '30px 40px', display: 'flex', flexDirection: 'column', gap: v ? 8 : 10 }}>
          <div style={{ ...mono, color: C.accent }}>{cmd}</div>
          <div style={{ ...mono, color: C.ink, ...fadeUp(frame, foundAt, 8) }}>Domains: reverse-engineering, mobile{v ? '\n' : '   '}candidates found: <span style={{ color: C.accent }}>64</span></div>
          <div style={{ ...mono, color: C.muted, marginTop: 14, ...fadeUp(frame, foundAt + 6, 8) }}>{v ? '#  score  repo' : '#  score  stars   repo'}</div>
          {ROWS_DEMO.map(([score, stars, repo, , flag], i) => {
            const win = i === 0 && frame >= winnerAt;
            const flagged = flag && frame >= flagAt;
            return (
              <div key={repo} style={{ ...mono, ...fadeUp(frame, row(i), 8), color: C.ink, background: win ? `${C.good}22` : flagged ? `${C.warn}1c` : 'transparent', borderRadius: 6, margin: '0 -12px', padding: '2px 12px' }}>
                <span style={{ color: C.muted }}>{i + 1}  </span>
                <span style={{ color: win ? C.good : C.ink }}>{String(score).padEnd(7)}</span>
                {v ? null : stars.padEnd(8)}
                {repo}
                {flagged ? <span style={{ color: C.warn }}>{(v ? '\n   ⚑ ' : '   ⚑ ') + flag}</span> : null}
              </div>
            );
          })}
          <div style={{ ...mono, marginTop: 18, color: C.good, ...fadeUp(frame, winnerAt + 6, 8) }}>
            Best: SimoneAvogadro/android-reverse-engineering-skill <span style={{ color: C.muted }}>· 3.0s</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---- 5. scoring --------------------------------------------------------------------------

const WEIGHTS: [string, number, RegExp][] = [
  ['popularity', 30, /popularity/],
  ['relevance', 25, /relevance/],
  ['skill quality', 20, /quality/],
  ['freshness', 15, /freshness/],
  ['repo health', 10, /health/],
  ['unsafe content', -40, /unsafe/],
  ['suspicious stars', -5, /suspicious/],
  ['wrong platform', -15, /wrong/],
];

export const Scoring = () => {
  const { frame, v } = useT();
  return (
    <Stage eyebrow="Scoring" title="Earned points, minus penalties">
      <div style={{ display: 'flex', flexDirection: 'column', gap: v ? 30 : 20, marginTop: 10 }}>
        {WEIGHTS.map(([name, w, re], i) => {
          const at = cue('scoring', re, 1 + i);
          const p = interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const color = w < 0 ? C.bad : C.ink;
          return (
            <div key={name} style={{ display: 'grid', gridTemplateColumns: v ? '280px 1fr 90px' : '330px 1fr 110px', alignItems: 'center', gap: v ? 20 : 28, opacity: 0.3 + 0.7 * p }}>
              <div style={{ fontFamily: F.body, fontSize: v ? 32 : 36, color: C.ink }}>{name}</div>
              <div style={{ height: 34, background: C.sheet, border: `1px solid ${C.rule}`, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(Math.abs(w) / 40) * 100 * p}%`, background: color, borderRadius: 4 }} />
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 36, color, textAlign: 'right' }}>{w > 0 ? `+${w}` : w}</div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

// ---- 6. scanner --------------------------------------------------------------------------

const Finding: React.FC<{ at: number; rule: string; where: string; code: string }> = ({ at, rule, where, code }) => {
  const { frame, v } = useT();
  return (
    <div style={{ ...fadeUp(frame, at, 40), background: C.sheet, border: `2px solid ${C.bad}66`, borderRadius: 16, padding: v ? '22px 26px' : '26px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: v ? 'column' : 'row', gap: v ? 10 : 18, alignItems: v ? 'flex-start' : 'center' }}>
        <Pill tone="bad" size={24}>blocked · {rule}</Pill>
        <span style={{ fontFamily: F.mono, fontSize: 22, color: C.muted }}>{where}</span>
      </div>
      <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 32, color: C.ink }}>{code}</div>
    </div>
  );
};

export const Scanner = () => {
  const { frame, pop } = useT();
  const fixedAt = cue('scanner', /false/, 9);
  return (
    <Stage eyebrow="Safety scanner" title="Caught in testing">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <Finding at={cue('scanner', /sends/, 2)} rule="secret-read" where="kubesphere/kubesphere · SKILL.md:689" code={'"privateKey": "$(cat ~/.ssh/id_rsa)"  → API request'} />
        <Finding at={cue('scanner', /pipes/, 5)} rule="pipe-to-shell" where="RainLib/OfficeCLI-rust · 12 skills" code="curl -fsSL …/install.sh | bash" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginTop: 12, opacity: pop(fixedAt) }}>
          <span style={{ fontFamily: F.body, fontSize: 30, color: C.muted, marginRight: 8 }}>False alarms fixed:</span>
          {['CTF test payload', 'forensics notes', 'Frida advice'].map((t, i) => (
            <span key={t} style={{ transform: `scale(${pop(fixedAt + 6 + i * 5)})` }}>
              <Pill tone="good" size={26}>✓ {t}</Pill>
            </span>
          ))}
        </div>
      </div>
    </Stage>
  );
};

// ---- 7. benchmark ------------------------------------------------------------------------

const BENCH: [string, string, 'good' | 'warn' | 'bad'][] = [
  ['android apk RE', 'android-reverse-engineering-skill', 'good'],
  ['ghidra windows binary', 'ljagiello/ctf-skills', 'warn'],
  ['node.js security audit', 'cloudflare/security-audit-skill', 'good'],
  ['ctf pwn', 'ljagiello/ctf-skills', 'good'],
  ['react + tailwind page', 'refactoring-ui-skill', 'good'],
  ['playwright e2e', 'voidmatcha/e2e-skills', 'good'],
  ['docker → kubernetes', 'kubeshark/kubeshark', 'bad'],
  ['pdf documents', 'latex-document-skill', 'bad'],
  ['pandas csv', 'automated-data-analyst', 'good'],
  ['ios app in swift', 'mobile-next/mobile-mcp', 'bad'],
];
const LABEL = { good: 'strong', warn: 'acceptable', bad: 'missed' };

export const Benchmark = () => {
  const { frame, v: portrait } = useT();
  const at = { good: cue('benchmark', /^six/i, 4), warn: cue('benchmark', /^one/i, 6), bad: cue('benchmark', /missed/, 7) };
  return (
    <Stage eyebrow="Benchmark · 10 live tasks" title="6 strong · 1 acceptable · 3 missed">
      <div style={{ display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1fr 1fr', gap: portrait ? 10 : '12px 40px' }}>
        {BENCH.map(([task, pick, v], i) => {
          const lit = frame >= at[v];
          return (
            <div key={task} style={{ ...fadeUp(frame, 6 + i * 3, 12), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: portrait ? '8px 18px' : '12px 20px', borderRadius: 10, background: C.sheet, border: `1px solid ${lit ? `${C[v]}88` : C.rule}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: F.body, fontSize: portrait ? 26 : 27, color: C.ink }}>{task}</div>
                <div style={{ fontFamily: F.mono, fontSize: 19, color: C.muted, marginTop: 2 }}>{pick}</div>
              </div>
              <div style={{ opacity: lit ? 1 : 0.15 }}>
                <Pill tone={v} size={22}>{LABEL[v]}</Pill>
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

// ---- 8. verdict --------------------------------------------------------------------------

const CHECKS: [string, 'good' | 'warn'][] = [
  ['Install · update · lockfile', 'good'],
  ['Safety scanner + confirmations', 'good'],
  ['20 passing tests, CI on 3 OSes', 'good'],
  ['Ranking on broad tasks', 'warn'],
];

export const Verdict = () => {
  const { frame, pop, v } = useT();
  const stampAt = cue('verdict', /ready/, 6);
  const cmdAt = cue('verdict', /^Run/, 10);
  const stamp = pop(stampAt);
  return (
    <AbsoluteFill style={{ padding: v ? PORTRAIT_PAD : '90px 140px 200px', display: 'grid', gridTemplateColumns: v ? '1fr' : '1fr 1fr', alignContent: v ? 'center' : undefined, gap: 80, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ ...fadeUp(frame, 0), fontFamily: F.mono, fontSize: 24, letterSpacing: 4, color: C.accent }}>VERDICT</div>
        {CHECKS.map(([t, tone], i) => (
          <div key={t} style={{ ...fadeUp(frame, 8 + i * 8), display: 'flex', gap: 20, alignItems: 'center', fontFamily: F.body, fontSize: 38, color: C.ink }}>
            <span style={{ color: C[tone], fontFamily: F.mono, width: 36 }}>{tone === 'good' ? '✓' : '△'}</span>
            {t}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 50, alignItems: 'flex-start' }}>
        <div style={{ transform: `rotate(-4deg) scale(${0.6 + 0.4 * stamp})`, opacity: stamp, border: `6px solid ${C.accent}`, borderRadius: 18, padding: '28px 40px', color: C.accent }}>
          <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 84, lineHeight: 1 }}>Ready for GitHub</div>
          <div style={{ fontFamily: F.mono, fontSize: 34, marginTop: 14 }}>early release · v0.1</div>
        </div>
        <div style={{ ...fadeUp(frame, cmdAt), background: C.term, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '20px 30px', fontFamily: F.mono, fontSize: 40, color: C.ink }}>
          <span style={{ color: C.accent }}>$</span> {typed('btr self-install', frame, cmdAt, 18)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
