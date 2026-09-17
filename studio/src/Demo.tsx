import { resolveTheme } from './theme';
import type { PresentationTheme } from './theme';
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterScene, Project, Scene } from './model';
import { buildTimeline, DEFAULT_TRANSITION, transitionFrames } from './timeline';
import { ChapterLabel, SceneContent } from './scenes';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
function BrandHeader({ project, theme }: { project: Project; theme: PresentationTheme }) {
  const brand = project.branding;
  if (!brand || (!brand.logo && !brand.name && !brand.tagline)) return null;
  const hasIdentity = Boolean(brand.logo || brand.name);
  return <div style={{ position: 'absolute', left: 96, top: 54, display: 'flex', alignItems: 'center', gap: 18, height: 56 }}>
    {brand.logo ? <Img src={staticFile(brand.logo)} style={{ maxWidth: 244, maxHeight: 56, width: 'auto', height: 'auto', objectFit: 'contain' }} /> : null}
    {brand.name ? <span style={{ fontSize: 30, lineHeight: 1, fontWeight: 760, letterSpacing: '-0.04em', color: theme.foreground }}>{brand.name}</span> : null}
    {brand.tagline ? <span style={{ marginLeft: hasIdentity ? 4 : 0, paddingLeft: hasIdentity ? 22 : 0, borderLeft: hasIdentity ? `1px solid ${theme.border}` : undefined, fontSize: 18, color: theme.muted }}>{brand.tagline}</span> : null}
  </div>;
}
function SceneLayer({ scene, project, theme, first }: { scene: Scene; project: Project; theme: PresentationTheme; first: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transition = scene.transition ?? DEFAULT_TRANSITION;
  const duration = transitionFrames(scene, fps);
  const directional = transition.type.startsWith('slide-');
  const enter = duration === 0 || first ? 1 : interpolate(frame, [0, duration], [0, 1], { ...CLAMP,
    easing: directional ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic) });
  const transform = transition.type === 'slide' ? `translateY(${(1 - enter) * 36}px)`
    : transition.type === 'slide-up' ? `translateY(${(1 - enter) * 100}%)`
      : transition.type === 'slide-down' ? `translateY(${(enter - 1) * 100}%)`
        : transition.type === 'slide-left' ? `translateX(${(1 - enter) * 100}%)`
          : transition.type === 'slide-right' ? `translateX(${(enter - 1) * 100}%)` : undefined;
  return <AbsoluteFill style={{ background: theme.background, opacity: directional ? 1 : enter, transform }}>
    <div style={{ position: 'absolute', width: 1220, height: 1080, right: 0, top: 0, background: `linear-gradient(125deg, ${theme.background}00, ${theme.tint})`, opacity: .9 }} />
    <SceneContent scene={scene} project={project} theme={theme} />
  </AbsoluteFill>;
}
export function Demo(project: Project) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const theme = resolveTheme(project);
  const timeline = buildTimeline(project.scenes, fps);
  const index = Math.max(0, timeline.findLastIndex((entry) => entry.from <= frame));
  const active = timeline[index]!;
  const previous = timeline[index - 1];
  const activeFullBleed = 'presentation' in active.scene && active.scene.presentation?.layout === 'full-bleed';
  const previousFullBleed = previous && 'presentation' in previous.scene && previous.scene.presentation?.layout === 'full-bleed';
  const activeTransitionFrames = transitionFrames(active.scene, fps);
  const activeEnter = activeTransitionFrames === 0 || index === 0 ? 1 : interpolate(frame - active.from, [0, activeTransitionFrames], [0, 1], CLAMP);
  const chromeOpacity = activeFullBleed ? interpolate(activeEnter, [0, .35], [1, 0], CLAMP)
    : previousFullBleed ? interpolate(activeEnter, [.65, 1], [0, 1], CLAMP) : 1;
  const chapter = project.scenes.slice(0, index).findLast((scene): scene is ChapterScene => scene.type === 'chapter');
  const showsChapterContext = chapter && ['overview', 'focus', 'camera', 'annotation', 'result'].includes(active.scene.type);
  const chapterEnter = interpolate(frame - active.from, [0, Math.max(1, Math.round(fps * .28))], [0, 1], CLAMP);
  return <AbsoluteFill style={{ background: theme.background, color: theme.foreground, fontFamily: theme.font, overflow: 'hidden' }}>
    {timeline.map(({ scene, from, duration }, i) => <Sequence key={scene.id} name={`${String(i + 1).padStart(2, '0')} · ${scene.type} · ${scene.title.replaceAll('\n', ' ')}`} from={from} durationInFrames={duration}>
      <SceneLayer scene={scene} project={project} theme={theme} first={i === 0} />
    </Sequence>)}
    <div style={{ opacity: chromeOpacity }}>
      <BrandHeader project={project} theme={theme} />
      {showsChapterContext ? <ChapterLabel scene={chapter} accent={project.accent} theme={theme} style={{ opacity: chapterEnter, transform: `translateY(${(1 - chapterEnter) * 8}px)` }} /> : null}
      <div style={{ position: 'absolute', left: 96, right: 96, bottom: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 17, color: theme.muted }}>
        <span>{project.title}{project.branding?.footer ? <> &nbsp; / &nbsp; {project.branding.footer}</> : null}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', gap: 7 }}>{timeline.map(({ scene }, i) => <span key={scene.id} style={{ width: index === i ? 30 : 8, height: 4, borderRadius: 4, background: index === i ? project.accent : theme.border }} />)}</div>
          <span>{String(index + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${100 * (frame + 1) / durationInFrames}%`, background: project.accent }} />
    </div>
  </AbsoluteFill>;
}
