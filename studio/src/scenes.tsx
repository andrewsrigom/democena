import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { AnnotationScene, ChapterScene, OutroScene, Project, Scene, TextScene } from './model';
import { cameraAt, cameraFor } from './camera';
import { BrowserFrame, ComparisonFrame } from './BrowserFrame';
import { AnimatedTitle, Eyebrow } from './typography';
import { browserLayout } from './layout';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
function TextPanel({ scene, accent }: { scene: TextScene | OutroScene; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 20, fps, config: { damping: 26 } });
  const closing = scene.type === 'outro';
  return <>
    <div style={{ position: 'absolute', width: 560, height: 560, right: -100, top: 180, border: `1px solid ${accent}25`, borderRadius: '50%', transform: `scale(${0.9 + enter * 0.1})` }} />
    <div style={{ position: 'absolute', left: 148, right: 148, top: closing ? 250 : 270 }}>
      <Eyebrow accent={accent}>{scene.eyebrow}</Eyebrow>
      <AnimatedTitle text={scene.title} highlight={scene.highlight} reveal={scene.reveal} accent={accent} />
      <p style={{ maxWidth: 1030, color: '#67716c', fontSize: 29, lineHeight: 1.6, margin: '0 0 32px', opacity: enter, transform: `translateY(${(1 - enter) * 18}px)` }}>{scene.body}</p>
      {closing && scene.cta ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 42, padding: '20px 28px', borderRadius: 12, background: accent, color: '#fff', fontSize: 23, opacity: enter, transform: `translateY(${(1 - enter) * 18}px)` }}>{scene.cta}<span>↗</span></div> : null}
    </div>
  </>;
}
function Chapter({ scene, accent }: { scene: ChapterScene; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 30, stiffness: 90 } });
  return <>
    <div style={{ position: 'absolute', right: 105, top: 150, color: accent, opacity: .08, fontSize: 620, lineHeight: 1, letterSpacing: -45, fontWeight: 700, transform: `translateX(${(1 - enter) * 100}px)` }}>{scene.number}</div>
    <div style={{ position: 'absolute', left: 148, top: 334, width: 1330, transform: `translateY(${(1 - enter) * 30}px)` }}>
      <Eyebrow accent={accent}>{`${scene.number} — ${scene.eyebrow}`}</Eyebrow>
      <AnimatedTitle text={scene.title} reveal="lines" accent={accent} style={{ fontSize: 92, maxWidth: 1300 }} />
      <div style={{ width: 130 * enter, height: 4, background: accent, marginBottom: 28 }} />
      <p style={{ color: '#67716c', fontSize: 27, lineHeight: 1.6, maxWidth: 880 }}>{scene.body}</p>
    </div>
  </>;
}
function Caption({ scene, accent }: { scene: Scene; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 4, fps, config: { damping: 24, stiffness: 100 } });
  return <div style={{ position: 'absolute', left: 88, top: 315, width: 506, opacity: enter, transform: `translateY(${(1 - enter) * 22}px)` }}>
    <Eyebrow accent={accent}>{scene.eyebrow}</Eyebrow>
    <h1 style={{ fontSize: 68, fontWeight: 600, letterSpacing: -3, lineHeight: 1.08, margin: '28px 0', whiteSpace: 'pre-line' }}>{scene.title}</h1>
    <p style={{ fontSize: 25, lineHeight: 1.6, color: '#67716c', maxWidth: 450, margin: 0 }}>{scene.body}</p>
    <div style={{ width: 42, height: 4, borderRadius: 4, background: accent, marginTop: 34 }} />
  </div>;
}
function Annotation({ scene, project, width }: { scene: AnnotationScene; project: Project; width: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: frame - 12, fps, config: { damping: 26 } });
  const draw = interpolate(frame, [10, 35], [0, 1], CLAMP);
  const ratio = width / project.viewport.width;
  const { note, focus } = scene;
  const x = focus.x + focus.width / 2;
  const y = focus.y + focus.height / 2;
  const nx = note.x + note.width / 2;
  const ny = note.y + 130;
  return <>
    <svg viewBox={`0 0 ${project.viewport.width} ${project.viewport.height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <path d={`M ${nx} ${ny} C ${nx} ${ny + 60}, ${x} ${y - 60}, ${x} ${y}`} pathLength={1} stroke={project.accent} strokeWidth={3} fill="none" strokeDasharray={1} strokeDashoffset={1 - draw} />
      <circle cx={x} cy={y} r={6} fill={project.accent} opacity={draw} />
    </svg>
    <div style={{ position: 'absolute', left: note.x * ratio, top: note.y * ratio, width: note.width * ratio, boxSizing: 'border-box', padding: '20px 24px', borderRadius: 14,
      background: project.accent, color: '#fff', fontSize: 22, lineHeight: 1.5, boxShadow: '0 12px 30px #182c2830', opacity: appear, transform: `translateY(${(1 - appear) * 12}px)` }}>{note.text}</div>
  </>;
}

export function SceneContent({ scene, project }: { scene: Scene; project: Project }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (scene.type === 'text' || scene.type === 'outro') return <TextPanel scene={scene} accent={project.accent} />;
  if (scene.type === 'chapter') return <Chapter scene={scene} accent={project.accent} />;
  if (scene.type === 'result' && scene.comparison) {
    const c = scene.comparison;
    const after = spring({ frame: frame - 16, fps, config: { damping: 28 } });
    return <><Caption scene={scene} accent={project.accent} />
      <div style={{ position: 'absolute', left: 664, top: 232, width: 1170, display: 'flex', flexDirection: 'column', gap: 32 }}>
        <ComparisonFrame project={project} at={c.before} crop={c.crop} label={c.beforeLabel} after={false} />
        <div style={{ opacity: after, transform: `translateY(${(1 - after) * 22}px)` }}><ComparisonFrame project={project} at={c.after} crop={c.crop} label={c.afterLabel} after /></div>
      </div>
    </>;
  }
  const layout = browserLayout(project.viewport);
  const focus = 'focus' in scene ? scene.focus : undefined;
  const strength = spring({ frame, fps, config: { damping: 30, stiffness: 60 } });
  const target = cameraFor(focus, project.viewport, layout.width, scene.type === 'focus' ? scene.zoom ?? 1.35 : 1.14);
  const camera = scene.type === 'camera' ? cameraAt(scene.path, frame / fps, project.viewport, layout.width)
    : scene.type === 'annotation' ? cameraFor(undefined, project.viewport, layout.width)
    : { scale: 1 + (target.scale - 1) * strength, x: target.x * strength, y: target.y * strength };
  return <><Caption scene={scene} accent={project.accent} />
    <div style={{ position: 'absolute', left: layout.left, top: layout.top }}>
      <BrowserFrame project={project} source={scene.source} width={layout.width} camera={camera} focus={focus}
        dim={scene.type === 'focus' ? scene.dim ?? .38 : scene.type === 'annotation' ? .14 : 0}>
        {scene.type === 'annotation' ? <Annotation scene={scene} project={project} width={layout.width} /> : null}
      </BrowserFrame>
    </div>
  </>;
}
