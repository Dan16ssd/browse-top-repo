import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Caption } from '@remotion/captions';
import { C, F, captions } from './theme';

type Page = { startMs: number; endMs: number; tokens: { text: string; fromMs: number; toMs: number }[] };

// Group words into on-screen lines that never span two sentences: break after . ? !,
// after a comma once a line has 5 words, or at `max` words. Same rule as the .srt export (max 8).
function toPages(words: Caption[], max: number): Page[] {
  const pages: Page[] = [];
  let cur: Caption[] = [];
  const flush = () => {
    if (!cur.length) return;
    pages.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, tokens: cur.map((w) => ({ text: w.text, fromMs: w.startMs, toMs: w.endMs })) });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    const t = w.text.trim();
    if (/[.?!]$/.test(t) || cur.length >= max || (t.endsWith(',') && cur.length >= Math.min(5, max))) flush();
  }
  flush();
  return pages;
}

// Burned-in subtitles: one short phrase at a time, the word being spoken highlighted.
export const Captions = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Portrait: bigger, shorter lines, raised above the TikTok / Reels caption and username area.
  const portrait = height > width;
  const ms = (frame / fps) * 1000;
  const pages = useMemo(() => toPages(captions, portrait ? 5 : 8), [portrait]);
  // Hold each line until the next starts (max 600 ms) so text does not flicker between words.
  const idx = pages.findIndex((p, i) => ms >= p.startMs && ms < Math.min(p.endMs + 600, pages[i + 1]?.startMs ?? Infinity));
  const page = pages[idx];
  if (!page) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: portrait ? 440 : 56 }}>
      <div
        style={{
          maxWidth: portrait ? 900 : 1500,
          background: 'rgba(8, 12, 17, 0.86)',
          border: `1px solid ${C.rule}`,
          borderRadius: 14,
          padding: '14px 28px',
          fontFamily: F.body,
          fontWeight: 600,
          fontSize: portrait ? 56 : 44,
          lineHeight: 1.3,
          textAlign: 'center',
          color: C.ink,
          whiteSpace: 'pre-wrap',
        }}
      >
        {page.tokens.map((t, i) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          const spoken = ms >= t.toMs;
          return (
            <span key={i} style={{ color: active ? C.accent : spoken ? C.ink : '#c3ccd5' }}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
