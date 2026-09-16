import { Composition, registerRoot } from 'remotion';
import { Demo } from './Demo';
import { example } from './model';
import { buildTimeline, FPS, prepareProject } from './timeline';

function Root() {
  return <Composition id="Democena" component={Demo} defaultProps={example} width={1920} height={1080} fps={FPS} durationInFrames={150}
    calculateMetadata={({ props }) => {
      const project = prepareProject(props);
      const timeline = buildTimeline(project.scenes, FPS);
      return { props: project, durationInFrames: timeline[timeline.length - 1]!.end };
    }} />;
}
registerRoot(Root);
