import { Composition } from 'remotion';
import { BtrReview } from './Video';
import { FPS, timeline } from './theme';

const frames = Math.ceil(timeline.total * FPS);

export const Root = () => (
  <>
    <Composition id="BtrReview" component={BtrReview} durationInFrames={frames} fps={FPS} width={1920} height={1080} />
    {/* 9:16 for TikTok, Instagram Reels and YouTube Shorts; scenes switch to portrait layouts. */}
    <Composition id="BtrReviewVertical" component={BtrReview} durationInFrames={frames} fps={FPS} width={1080} height={1920} />
  </>
);
