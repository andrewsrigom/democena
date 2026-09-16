import { Freeze, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ReactNode } from 'react';
import type { Focus, Project, Source } from './model';
import type { Camera } from './camera';
import { sourceFrame } from './timeline';
import { comparisonLayout } from './layout';

const IDENTITY: Camera = { x: 0, y: 0, scale: 1 };
export function RecordedVideo({ project, source, width }: { project: Project; source: Source; width: number }) {
  const { fps } = useVideoConfig();
  return <Freeze frame={0} active={source.freeze === true}>
    <OffthreadVideo src={staticFile(project.video)} muted trimBefore={sourceFrame(source, 0, project.trimBefore, fps)}
      style={{ width, height: width * project.viewport.height / project.viewport.width, display: 'block' }} />
  </Freeze>;
}

export function Spotlight({ focus, ratio, accent, dim = 0 }: { focus: Focus; ratio: number; accent: string; dim?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 8, fps, config: { damping: 26 } });
  return <div style={{ position: 'absolute', left: focus.x * ratio - 7, top: focus.y * ratio - 7,
    width: focus.width * ratio + 14, height: focus.height * ratio + 14, boxSizing: 'border-box',
    border: `3px solid ${accent}`, borderRadius: 12, opacity: enter,
    boxShadow: `0 0 0 4000px rgba(16, 29, 24, ${dim}), 0 0 0 5px ${accent}20`, pointerEvents: 'none' }} />;
}

export function BrowserFrame({ project, source, camera = IDENTITY, focus, dim, children, width = 1170 }: {
  project: Project; source: Source; camera?: Camera; focus?: Focus; dim?: number; children?: ReactNode; width?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 30, stiffness: 85 } });
  const ratio = width / project.viewport.width;
  const height = project.viewport.height * ratio;
  return <div style={{ width, borderRadius: 18, overflow: 'hidden', background: '#fff', border: '1px solid #d5dacf',
    boxShadow: '0 40px 85px -25px #23352940, 0 4px 10px #2335290a', transform: `translateY(${(1 - entrance) * 24}px)` }}>
    <div style={{ height: 48, background: '#fcfcf8', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8, borderBottom: '1px solid #e2e7de', boxSizing: 'border-box' }}>
      {['#d7a39b', '#ddce93', '#a6bda1'].map((color) => <span key={color} style={{ width: 10, height: 10, borderRadius: 10, background: color }} />)}
      <span style={{ margin: 'auto', paddingRight: 44, color: '#778376', fontSize: 15 }}>{project.title}</span>
    </div>
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        <RecordedVideo project={project} source={source} width={width} />
        {focus ? <Spotlight focus={focus} ratio={ratio} accent={project.accent} dim={dim} /> : null}
        {children}
      </div>
    </div>
  </div>;
}

/** Crop two actual video frames to the same rectangle so differences are easy to read. */
export function ComparisonFrame({ project, at, crop, label, after }: { project: Project; at: number; crop: Focus; label: string; after: boolean }) {
  const width = 1170;
  const clip = comparisonLayout(crop, width);
  return <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${after ? project.accent : '#d5dacf'}`, background: '#fff', boxShadow: '0 20px 40px -30px #23352950' }}>
    <div style={{ height: 48, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, background: after ? project.accent : '#e7e9e1', color: after ? '#fff' : '#66716b', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />{label}
    </div>
    <div style={{ width, height: clip.height, position: 'relative', background: '#f8fafc' }}>
      <div style={{ position: 'absolute', left: clip.left, width: clip.width, height: clip.height, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: clip.videoLeft, top: clip.videoTop }}>
          <RecordedVideo project={project} source={{ from: at, freeze: true }} width={project.viewport.width * clip.scale} />
        </div>
      </div>
    </div>
  </div>;
}
