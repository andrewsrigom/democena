import { Freeze, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ReactNode } from 'react';
import type { Focus, Project, Source } from './model';
import type { Camera } from './camera';
import type { PresentationTheme } from './theme';
import { sourceFrame } from './timeline';
import { comparisonLayout } from './layout';

const IDENTITY: Camera = { x: 0, y: 0, scale: 1 };
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export function RecordedVideo({ project, source, width }: { project: Project; source: Source; width: number }) {
  const { fps } = useVideoConfig();
  return <Freeze frame={0} active={source.freeze === true}>
    <OffthreadVideo src={staticFile(project.video)} muted trimBefore={sourceFrame(source, 0, project.trimBefore, fps)}
      style={{ width, height: width * project.viewport.height / project.viewport.width, display: 'block' }} />
  </Freeze>;
}

export function Spotlight({ focus, ratio, accent, dim = 0, scan = false }: { focus: Focus; ratio: number; accent: string; dim?: number; scan?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lockDelay = scan ? 20 : 8;
  const enter = spring({ frame: frame - lockDelay, fps, config: { damping: 26, stiffness: 130 } });
  const scanY = interpolate(frame, [2, 20], [0, (focus.y + focus.height / 2) * ratio], CLAMP);
  const scanOpacity = scan ? interpolate(frame, [0, 3, 18, 24], [0, .9, .9, 0], CLAMP) : 0;
  return <>
    {scan ? <div style={{ position: 'absolute', left: 0, right: 0, top: scanY, height: 2, opacity: scanOpacity,
      background: `linear-gradient(90deg, ${accent}00, ${accent}, ${accent}00)`, boxShadow: `0 0 18px ${accent}`, pointerEvents: 'none' }} /> : null}
    <div style={{ position: 'absolute', left: focus.x * ratio - 7, top: focus.y * ratio - 7,
      width: focus.width * ratio + 14, height: focus.height * ratio + 14, boxSizing: 'border-box',
      border: `3px solid ${accent}`, borderRadius: 12, opacity: enter,
      transform: `scale(${1.08 - enter * .08})`,
      boxShadow: `0 0 0 4000px rgba(8, 18, 32, ${dim}), 0 0 0 5px ${accent}20`, pointerEvents: 'none' }} />
  </>;
}

export function BrowserFrame({ project, source, theme, camera = IDENTITY, focus, dim, scan, children, width = 1170, framed = true }: {
  project: Project; source: Source; theme: PresentationTheme; camera?: Camera; focus?: Focus; dim?: number; scan?: boolean; children?: ReactNode; width?: number; framed?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 30, stiffness: 85 } });
  const ratio = width / project.viewport.width;
  const height = project.viewport.height * ratio;
  return <div style={{ width, borderRadius: framed ? theme.radius : 0, overflow: 'hidden', background: theme.surface, border: framed ? `1px solid ${theme.border}` : undefined,
    boxShadow: framed ? `0 40px 85px -25px ${theme.shadow}55, 0 4px 10px ${theme.shadow}18` : undefined, transform: framed ? `translateY(${(1 - entrance) * 24}px)` : undefined }}>
    {framed ? <div style={{ height: 48, background: theme.tint, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8, borderBottom: `1px solid ${theme.border}`, boxSizing: 'border-box' }}>
      {['#b6c6df', '#93afd7', '#6f95d0'].map((color) => <span key={color} style={{ width: 10, height: 10, borderRadius: 10, background: color }} />)}
      <span style={{ margin: 'auto', paddingRight: 44, color: theme.muted, fontSize: 15 }}>{project.title}</span>
    </div> : null}
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        <RecordedVideo project={project} source={source} width={width} />
        {focus ? <Spotlight focus={focus} ratio={ratio} accent={project.accent} dim={dim} scan={scan} /> : null}
        {children}
      </div>
    </div>
  </div>;
}

/** Crop two actual video frames to the same rectangle so differences are easy to read. */
export function ComparisonFrame({ project, theme, at, crop, label, after }: { project: Project; theme: PresentationTheme; at: number; crop: Focus; label: string; after: boolean }) {
  const width = 1170;
  const clip = comparisonLayout(crop, width);
  return <div style={{ borderRadius: Math.max(10, theme.radius - 2), overflow: 'hidden', border: `1px solid ${after ? project.accent : theme.border}`, background: theme.surface, boxShadow: `0 20px 40px -30px ${theme.shadow}70` }}>
    <div style={{ height: 48, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, background: after ? project.accent : theme.tint, color: after ? '#fff' : theme.muted, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />{label}
    </div>
    <div style={{ width, height: clip.height, position: 'relative', background: theme.background }}>
      <div style={{ position: 'absolute', left: clip.left, width: clip.width, height: clip.height, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: clip.videoLeft, top: clip.videoTop }}>
          <RecordedVideo project={project} source={{ from: at, freeze: true }} width={project.viewport.width * clip.scale} />
        </div>
      </div>
    </div>
  </div>;
}
