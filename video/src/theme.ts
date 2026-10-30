import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadBody } from '@remotion/google-fonts/IBMPlexSans';
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono';
import timelineJson from '../public/timeline.json';
import captionsJson from '../public/captions.json';
import type { Caption } from '@remotion/captions';

// Same palette and type as the showcase page (dark theme).
export const C = {
  bg: '#10161d',
  sheet: '#161e27',
  ink: '#e4e9ee',
  muted: '#93a0ae',
  rule: '#2a3542',
  accent: '#f08a43',
  term: '#0b1016',
  good: '#5cc48e',
  warn: '#e0b54a',
  bad: '#f0807a',
};

export const F = {
  display: loadDisplay('normal', { weights: ['500', '700', '800'], subsets: ['latin'] }).fontFamily,
  body: loadBody('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily,
  mono: loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily,
};

export const FPS = 30;
export const timeline = timelineJson as { total: number; scenes: { id: string; start: number; duration: number }[] };
export const captions = captionsJson as Caption[];

export const scene = (id: string) => {
  const s = timeline.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};

// Frame (relative to the scene start) at which a word matching `re` is first spoken in that scene,
// so visuals land on the narration. Falls back to `fallback` seconds if the word is not found.
export function cue(sceneId: string, re: RegExp, fallback = 0, nth = 0): number {
  const s = scene(sceneId);
  const from = s.start * 1000;
  const to = (s.start + s.duration) * 1000;
  const hits = captions.filter((w) => w.startMs >= from && w.startMs < to && re.test(w.text.trim()));
  const hit = hits[nth];
  return Math.round(((hit ? hit.startMs - from : fallback * 1000) / 1000) * FPS);
}
