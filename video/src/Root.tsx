import { Composition } from 'remotion';
import { BtrReview } from './Video';
import { FPS, timeline } from './theme';

export const Root = () => (
  <Composition id="BtrReview" component={BtrReview} durationInFrames={Math.ceil(timeline.total * FPS)} fps={FPS} width={1920} height={1080} />
);
