import { Composition, registerRoot } from 'remotion';
import { Demo } from './Demo';
import { example } from './model';

function Root() {
  return <Composition id="Democena" component={Demo} defaultProps={example} width={1920} height={1080} fps={30} durationInFrames={540}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.ceil(props.duration * 30)) })} />;
}
registerRoot(Root);
