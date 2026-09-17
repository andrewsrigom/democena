import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';
import type { AnnotationScene, ChapterScene, OutroScene, Project, Scene, TextScene } from './model';
import type { PresentationTheme } from './theme';
import { cameraAt, cameraFor } from './camera';
import { BrowserFrame, ComparisonFrame } from './BrowserFrame';
import { AnimatedTitle, Eyebrow } from './typography';
import { browserLayout } from './layout';
import { motionRecipeFor } from './motion-recipes';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
function StripAwayBackdrop({ theme }: { theme: PresentationTheme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panels = [
    { left: 44, top: 176, width: 500, height: 210, exitX: -620 },
    { left: 106, top: 420, width: 620, height: 150, exitX: -760 },
    { left: 1376, top: 150, width: 470, height: 230, exitX: 620 },
    { left: 1260, top: 422, width: 610, height: 168, exitX: 760 },
    { left: 230, top: 684, width: 560, height: 118, exitX: -760 },
    { left: 1130, top: 690, width: 560, height: 118, exitX: 760 },
  ];
  return <>{panels.map((panel, index) => {
    const exit = spring({ frame: frame - index * 2, fps, config: { damping: 24, stiffness: 105 } });
    const { exitX, ...position } = panel;
    return <div key={index} style={{ position: 'absolute', ...position, borderRadius: theme.radius, background: index % 2 ? theme.tint : theme.surface,
      border: `1px solid ${theme.border}`, opacity: 1 - exit, transform: `translateX(${exitX * exit}px) scale(${1 - exit * .04})`,
      boxShadow: `0 18px 40px -30px ${theme.shadow}80` }} />;
  })}</>;
}

function TextPanel({ scene, accent, theme }: { scene: TextScene | OutroScene; accent: string; theme: PresentationTheme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const closing = scene.type === 'outro';
  const enter = spring({ frame: frame - (closing ? 28 : 20), fps, config: { damping: 26 } });
  return <>
    {closing ? <StripAwayBackdrop theme={theme} /> : <div style={{ position: 'absolute', width: 510, height: 560, right: -150, top: 180, border: `1px solid ${accent}28`, borderRadius: 28, background: `${theme.surface}88`, transform: `scale(${0.9 + enter * 0.1})` }} />}
    <div style={{ position: 'absolute', left: 148, right: 148, top: closing ? 250 : 270 }}>
      <Eyebrow accent={accent}>{scene.eyebrow}</Eyebrow>
      <AnimatedTitle text={scene.title} highlight={scene.highlight} reveal={scene.reveal} accent={accent} />
      <p style={{ maxWidth: 1030, color: theme.muted, fontSize: 29, lineHeight: 1.6, margin: '0 0 32px', opacity: enter, transform: `translateY(${(1 - enter) * 18}px)` }}>{scene.body}</p>
      {closing && scene.cta ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 42, padding: '20px 28px', borderRadius: 12, background: accent, color: '#fff', fontSize: 23, opacity: enter, transform: `translateY(${(1 - enter) * 18}px)` }}>{scene.cta}<span>↗</span></div> : null}
    </div>
  </>;
}

export function ChapterLabel({ scene, accent, theme, style }: { scene: ChapterScene; accent: string; theme: PresentationTheme; style?: CSSProperties }) {
  return <div style={{ position: 'absolute', left: 96, top: 124, display: 'flex', alignItems: 'center', gap: 15, color: theme.foreground, ...style }}>
    <span style={{ display: 'grid', placeItems: 'center', minWidth: 42, height: 26, padding: '0 8px', borderRadius: 999, border: `1px solid ${accent}70`, background: `${accent}18`, color: accent, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>{scene.number}</span>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
      <span style={{ color: theme.muted, fontSize: 13, fontWeight: 750, letterSpacing: 1.6, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{scene.eyebrow}</span>
      <span style={{ color: theme.foreground, fontSize: 21, fontWeight: 650, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{scene.title.replaceAll('\n', ' ')}</span>
    </div>
  </div>;
}

function Chapter({ scene, accent, theme }: { scene: ChapterScene; accent: string; theme: PresentationTheme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 30, stiffness: 90 } });
  const sceneFrames = Math.max(1, Math.round(scene.duration * fps));
  const demote = interpolate(frame, [Math.floor(sceneFrames * .5), Math.max(Math.floor(sceneFrames * .5) + 1, Math.floor(sceneFrames * .8))], [0, 1], CLAMP);
  const heroExit = interpolate(demote, [.62, 1], [0, 1], CLAMP);
  const labelEnter = interpolate(demote, [.5, .92], [0, 1], CLAMP);
  return <>
    <div style={{ position: 'absolute', right: 105, top: 150, color: accent, opacity: .62 * (1 - demote), fontSize: 620, lineHeight: 1, letterSpacing: -45, fontWeight: 700, transform: `translateX(${(1 - enter) * 100 + demote * 80}px)` }}>{scene.number}</div>
    <div style={{ position: 'absolute', left: 148, top: 334, width: 1330, opacity: 1 - heroExit,
      transformOrigin: 'top left', transform: `translate(${demote * -52}px, ${(1 - enter) * 30 + demote * -210}px) scale(${1 - demote * .64})` }}>
      <Eyebrow accent={accent}>{`${scene.number} — ${scene.eyebrow}`}</Eyebrow>
      <AnimatedTitle text={scene.title} reveal="lines" accent={accent} style={{ fontSize: 92, maxWidth: 1300 }} />
      <div style={{ width: 130 * enter, height: 4, background: accent, marginBottom: 28 }} />
      <p style={{ color: theme.muted, fontSize: 27, lineHeight: 1.6, maxWidth: 880, opacity: 1 - demote }}>{scene.body}</p>
    </div>
    <ChapterLabel scene={scene} accent={accent} theme={theme} style={{ opacity: labelEnter, transform: `translateY(${(1 - labelEnter) * 10}px)` }} />
  </>;
}
function Caption({ scene, accent, theme }: { scene: Scene; accent: string; theme: PresentationTheme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 4, fps, config: { damping: 24, stiffness: 100 } });
  return <div style={{ position: 'absolute', left: 96, top: 315, width: 498, opacity: enter, transform: `translateY(${(1 - enter) * 22}px)` }}>
    <Eyebrow accent={accent}>{scene.eyebrow}</Eyebrow>
    <h1 style={{ fontSize: 68, fontWeight: 600, letterSpacing: -3, lineHeight: 1.08, margin: '28px 0', whiteSpace: 'pre-line' }}>{scene.title}</h1>
    <p style={{ fontSize: 25, lineHeight: 1.6, color: theme.muted, maxWidth: 450, margin: 0 }}>{scene.body}</p>
    <div style={{ width: 42, height: 4, borderRadius: 4, background: accent, marginTop: 34 }} />
  </div>;
}
function Annotation({ scene, project, theme, width }: { scene: AnnotationScene; project: Project; theme: PresentationTheme; width: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: frame - 12, fps, config: { damping: 26 } });
  const draw = interpolate(frame, [10, 35], [0, 1], CLAMP);
  const ratio = width / project.viewport.width;
  const { note, focus } = scene;
  const x = focus.x + focus.width / 2;
  const y = focus.y + focus.height / 2;
  const nx = note.x + note.width / 2;
  const ny = note.y;
  const bend = y < ny ? -60 : 60;
  return <>
    <svg viewBox={`0 0 ${project.viewport.width} ${project.viewport.height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <path d={`M ${nx} ${ny} C ${nx} ${ny + bend}, ${x} ${y - bend}, ${x} ${y}`} pathLength={1} stroke={project.accent} strokeWidth={3} fill="none" strokeDasharray={1} strokeDashoffset={1 - draw} />
      <circle cx={x} cy={y} r={6} fill={project.accent} opacity={draw} />
    </svg>
    <div style={{ position: 'absolute', left: note.x * ratio, top: note.y * ratio, width: note.width * ratio, boxSizing: 'border-box', padding: '20px 24px', borderRadius: 14,
      background: project.accent, color: '#fff', fontSize: 22, lineHeight: 1.5, boxShadow: `0 12px 30px ${theme.shadow}55`, opacity: appear, transform: `translateY(${(1 - appear) * 12}px)` }}>{note.text}</div>
  </>;
}

export function SceneContent({ scene, project, theme }: { scene: Scene; project: Project; theme: PresentationTheme }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const recipe = motionRecipeFor(scene);
  if (scene.type === 'text' || scene.type === 'outro') return <TextPanel scene={scene} accent={project.accent} theme={theme} />;
  if (scene.type === 'chapter') return <Chapter scene={scene} accent={project.accent} theme={theme} />;
  if (scene.type === 'result' && scene.comparison) {
    const c = scene.comparison;
    const after = spring({ frame: frame - 16, fps, config: { damping: 28 } });
    return <><Caption scene={scene} accent={project.accent} theme={theme} />
      <div style={{ position: 'absolute', left: 664, top: 232, width: 1160, display: 'flex', flexDirection: 'column', gap: 32 }}>
        <ComparisonFrame project={project} theme={theme} at={c.before} crop={c.crop} label={c.beforeLabel} after={false} />
        <div style={{ opacity: after, transform: `translateY(${(1 - after) * 22}px)` }}><ComparisonFrame project={project} theme={theme} at={c.after} crop={c.crop} label={c.afterLabel} after /></div>
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
  return <><Caption scene={scene} accent={project.accent} theme={theme} />
    <div style={{ position: 'absolute', left: layout.left, top: layout.top }}>
      <BrowserFrame project={project} source={scene.source} theme={theme} width={layout.width} camera={camera} focus={focus} scan={recipe === 'focus-scan-lock'}
        dim={scene.type === 'focus' ? scene.dim ?? .38 : scene.type === 'annotation' ? .14 : 0}>
        {scene.type === 'annotation' ? <Annotation scene={scene} project={project} theme={theme} width={layout.width} /> : null}
      </BrowserFrame>
    </div>
  </>;
}
