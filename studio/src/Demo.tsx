import { theme } from './theme';
import democenaLogo from '../public/brand/democena-logo.png';
import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Project, Scene } from './model';
import { buildTimeline, DEFAULT_TRANSITION, transitionFrames } from './timeline';
import { SceneContent } from './scenes';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
function SceneLayer({ scene, project, first }: { scene: Scene; project: Project; first: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transition = scene.transition ?? DEFAULT_TRANSITION;
  const duration = transitionFrames(scene, fps);
  const enter = duration === 0 || first ? 1 : interpolate(frame, [0, duration], [0, 1], CLAMP);
  return <AbsoluteFill style={{ background: theme.background, opacity: enter, transform: transition.type === 'slide' ? `translateY(${(1 - enter) * 36}px)` : undefined }}>
    <div style={{ position: 'absolute', width: 1220, height: 1080, right: 0, top: 0, background: 'linear-gradient(125deg, #ffffff00, #eef5ff)', opacity: .9 }} />
    <SceneContent scene={scene} project={project} />
  </AbsoluteFill>;
}
export function Demo(project: Project) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timeline = buildTimeline(project.scenes, fps);
  const index = Math.max(0, timeline.findLastIndex((entry) => entry.from <= frame));
  return <AbsoluteFill style={{ background: theme.background, color: theme.foreground, fontFamily: theme.font, overflow: 'hidden' }}>
    {timeline.map(({ scene, from, duration }, i) => <Sequence key={scene.id} name={`${String(i + 1).padStart(2, '0')} · ${scene.type} · ${scene.title.replaceAll('\n', ' ')}`} from={from} durationInFrames={duration}>
      <SceneLayer scene={scene} project={project} first={i === 0} />
    </Sequence>)}
    <div style={{ position: 'absolute', left: 75, top: 45, display: 'flex', alignItems: 'center', gap: 14 }}>
      <Img src={democenaLogo} style={{ width: 244, height: 'auto' }} />
      <span style={{ marginLeft: 22, paddingLeft: 22, borderLeft: '1px solid #e1e6ed', fontSize: 18, color: theme.muted }}>PRODUCT STORIES, IN MOTION</span>
    </div>
    <div style={{ position: 'absolute', left: 88, right: 88, bottom: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 17, color: theme.muted }}>
      <span>{project.title} &nbsp; / &nbsp; A LITTLE CLARITY GOES A LONG WAY</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', gap: 7 }}>{timeline.map(({ scene }, i) => <span key={scene.id} style={{ width: index === i ? 30 : 8, height: 4, borderRadius: 4, background: index === i ? project.accent : theme.border }} />)}</div>
        <span>{String(index + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</span>
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${100 * (frame + 1) / durationInFrames}%`, background: project.accent }} />
  </AbsoluteFill>;
}
