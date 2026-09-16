import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
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
  return <AbsoluteFill style={{ background: '#f3f1e9', opacity: enter, transform: transition.type === 'slide' ? `translateY(${(1 - enter) * 36}px)` : undefined }}>
    <div style={{ position: 'absolute', width: 1100, height: 1100, left: 1040, top: -320, borderRadius: '50%', background: '#e1e8dc', opacity: .7 }} />
    <SceneContent scene={scene} project={project} />
  </AbsoluteFill>;
}
export function Demo(project: Project) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timeline = buildTimeline(project.scenes, fps);
  const index = Math.max(0, timeline.findLastIndex((entry) => entry.from <= frame));
  return <AbsoluteFill style={{ background: '#f3f1e9', color: '#202a25', fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden' }}>
    {timeline.map(({ scene, from, duration }, i) => <Sequence key={scene.id} name={`${String(i + 1).padStart(2, '0')} · ${scene.type} · ${scene.title.replaceAll('\n', ' ')}`} from={from} durationInFrames={duration}>
      <SceneLayer scene={scene} project={project} first={i === 0} />
    </Sequence>)}
    <div style={{ position: 'absolute', left: 88, top: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ background: project.accent, width: 36, height: 36, borderRadius: 11, color: '#fff', fontSize: 20, textAlign: 'center', lineHeight: '36px' }}>d</div>
      <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -1 }}>democena</span>
      <span style={{ marginLeft: 22, paddingLeft: 22, borderLeft: '1px solid #ccd2c8', fontSize: 18, color: '#738074' }}>PRODUCT STORIES, IN MOTION</span>
    </div>
    <div style={{ position: 'absolute', left: 88, right: 88, bottom: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 17, color: '#758171' }}>
      <span>{project.title} &nbsp; / &nbsp; A LITTLE CLARITY GOES A LONG WAY</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div style={{ display: 'flex', gap: 7 }}>{timeline.map(({ scene }, i) => <span key={scene.id} style={{ width: index === i ? 30 : 8, height: 4, borderRadius: 4, background: index === i ? project.accent : '#cfd6cc' }} />)}</div>
        <span>{String(index + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</span>
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${100 * (frame + 1) / durationInFrames}%`, background: project.accent }} />
  </AbsoluteFill>;
}
