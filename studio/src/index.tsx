import { Composition, registerRoot } from 'remotion';
import { Demo } from './Demo';
import { example } from './model';
import { buildTimeline, FPS, prepareProject } from './timeline';
import { OUTPUT_CANVAS } from './canvas-geometry.mjs';

function Root() {
  return <Composition id="Democena" component={Demo} defaultProps={example} width={OUTPUT_CANVAS.width} height={OUTPUT_CANVAS.height} fps={FPS} durationInFrames={150}
    calculateMetadata={({ props }) => {
      const project = prepareProject(props);
      const timeline = buildTimeline(project.scenes, FPS);
      return { props: project, durationInFrames: timeline[timeline.length - 1]!.end };
    }} />;
}
registerRoot(Root);
