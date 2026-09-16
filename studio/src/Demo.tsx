import { AbsoluteFill, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Project, Scene } from './model';
import { cameraFor } from './camera';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const frameWidth = 1170;
const frameLeft = 664;

function Caption({ scene, localFrame, index, total, accent }: { scene: Scene; localFrame: number; index: number; total: number; accent: string }) {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: localFrame, fps, config: { damping: 24, stiffness: 110 } });
  return <div style={{ position: 'absolute', left: 88, top: 316, width: 506, opacity: enter, transform: `translateY(${(1 - enter) * 22}px)` }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: accent, fontSize: 17, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>
      <span style={{ width: 30, height: 2, background: accent }} />{scene.eyebrow}
    </div>
    <h1 style={{ fontSize: 68, fontWeight: 600, letterSpacing: -3, lineHeight: 1.06, margin: '28px 0', whiteSpace: 'pre-line' }}>{scene.title}</h1>
    <p style={{ fontSize: 25, lineHeight: 1.6, color: '#67716c', maxWidth: 450, margin: 0 }}>{scene.body}</p>
    <div style={{ display: 'flex', gap: 8, marginTop: 42 }}>
      {Array.from({ length: total }, (_, i) => <div key={i} style={{ width: i === index ? 42 : 12, height: 5, borderRadius: 5, background: i === index ? accent : '#d4d9d1' }} />)}
    </div>
  </div>;
}

export function Demo(project: Project) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;
  const index = Math.max(0, project.scenes.findLastIndex((scene) => scene.at <= time));
  const scene = project.scenes[index];
  const localFrame = frame - Math.round(scene.at * fps);
  const movement = spring({ frame: localFrame, fps, config: { damping: 28, stiffness: 65 } });
  const entrance = spring({ frame, fps, config: { damping: 26, stiffness: 70 } });
  const ratio = frameWidth / project.viewport.width;
  const frameHeight = project.viewport.height * ratio;
  // Keep the recorded interface together: highlight and video receive the same transform.
  const previous = cameraFor(project.scenes[Math.max(0, index - 1)].focus, project.viewport, frameWidth);
  const next = cameraFor(scene.focus, project.viewport, frameWidth);
  const mix = (a: number, b: number) => a + (b - a) * movement;
  return <AbsoluteFill style={{ background: '#f3f1e9', color: '#202a25', fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', width: 1100, height: 1100, left: 1040, top: -320, borderRadius: '50%', background: '#e1e8dc', opacity: .7 }} />
    <div style={{ position: 'absolute', left: 88, top: 64, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ background: project.accent, width: 36, height: 36, borderRadius: 11, color: '#fff', fontSize: 20, textAlign: 'center', lineHeight: '36px' }}>d</div>
      <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: -1 }}>democena</span>
      <span style={{ marginLeft: 22, paddingLeft: 22, borderLeft: '1px solid #ccd2c8', fontSize: 18, color: '#738074' }}>PRODUCT STORIES, IN MOTION</span>
    </div>
    <Caption key={index} scene={scene} localFrame={localFrame} index={index} total={project.scenes.length} accent={project.accent} />
    <div style={{ position: 'absolute', left: frameLeft, top: 158, width: frameWidth, borderRadius: 18, overflow: 'hidden', background: '#fff', border: '1px solid #d5dacf', boxShadow: '0 40px 85px -25px #23352940, 0 4px 10px #2335290a', opacity: entrance, transform: `translateY(${(1 - entrance) * 30}px)` }}>
      <div style={{ height: 48, background: '#fcfcf8', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8, borderBottom: '1px solid #e2e7de' }}>
        {['#d7a39b', '#ddce93', '#a6bda1'].map((color) => <span key={color} style={{ width: 10, height: 10, borderRadius: 10, background: color }} />)}
        <span style={{ margin: 'auto', paddingRight: 44, color: '#778376', fontSize: 15 }}>{project.title} / a real workflow</span>
      </div>
      <div style={{ width: frameWidth, height: frameHeight, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: frameWidth, height: frameHeight, transform: `translate(${mix(previous.x, next.x)}px, ${mix(previous.y, next.y)}px) scale(${mix(previous.scale, next.scale)})` }}>
          <OffthreadVideo src={staticFile(project.video)} muted trimBefore={Math.round(project.trimBefore * fps)} style={{ width: frameWidth, height: frameHeight, display: 'block' }} />
          {scene.focus ? <div style={{ position: 'absolute', left: scene.focus.x * ratio - 7, top: scene.focus.y * ratio - 7, width: scene.focus.width * ratio + 14, height: scene.focus.height * ratio + 14, boxSizing: 'border-box', border: `3px solid ${project.accent}`, borderRadius: 12, opacity: interpolate(localFrame, [8, 24], [0, 1], clamp), boxShadow: `0 0 0 5px ${project.accent}18`, pointerEvents: 'none' }} /> : null}
        </div>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 88, right: 88, bottom: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 17, color: '#758171' }}>
      <span>REAL CAPTURE &nbsp;·&nbsp; EDITABLE TEXT &nbsp;·&nbsp; NO VOICE REQUIRED</span>
      <span>{String(index + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</span>
    </div>
    <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${100 * (frame + 1) / durationInFrames}%`, background: project.accent }} />
  </AbsoluteFill>;
}
