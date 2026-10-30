import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FPS, timeline } from './theme';
import { Captions } from './Captions';
import { Title, Problem, Pipeline, Demo, Scoring, Scanner, Benchmark, Verdict } from './scenes';

const SCENES: Record<string, React.FC> = { title: Title, problem: Problem, pipeline: Pipeline, demo: Demo, scoring: Scoring, scanner: Scanner, benchmark: Benchmark, verdict: Verdict };

// Short cross-fade in and out of every scene.
const Fade: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const Progress = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return <div style={{ position: 'absolute', top: 0, left: 0, height: 6, width: `${(frame / durationInFrames) * 100}%`, background: C.accent }} />;
};

export const BtrReview = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Audio src={staticFile('narration.mp3')} />
    {timeline.scenes.map((s) => {
      const Scene = SCENES[s.id];
      return (
        <Sequence key={s.id} from={Math.round(s.start * FPS)} durationInFrames={Math.round(s.duration * FPS)} name={s.id}>
          <Fade>
            <Scene />
          </Fade>
        </Sequence>
      );
    })}
    <Captions />
    <Progress />
  </AbsoluteFill>
);
