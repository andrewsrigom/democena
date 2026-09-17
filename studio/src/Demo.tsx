import { resolveTheme } from './theme';
import type { PresentationTheme } from './theme';
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterScene, Project, Scene } from './model';
import { authoredEntranceOffsetFrames, buildTimeline, DEFAULT_TRANSITION, transitionFrames } from './timeline';
import { ChapterLabel, SceneContent } from './scenes';
import { presentationChromeOpacity } from './presentation-chrome';
import { transitionRegistry, transitionStyleFor } from './motion-registry';
import { sceneComposition } from './composition-registry.mjs';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
function ChromePanel({ theme, opacity }: { theme: PresentationTheme; opacity: number }) {
  return <div style={{ position: 'absolute', inset: 0, borderRadius: 16, opacity, background: theme.background,
    border: `1px solid ${theme.border}`, boxShadow: `0 18px 50px -30px ${theme.shadow}80` }} />;
}
function BrandHeader({ project, theme, backdropOpacity = 0 }: { project: Project; theme: PresentationTheme; backdropOpacity?: number }) {
  const brand = project.branding;
  if (!brand || (!brand.logo && !brand.name && !brand.tagline)) return null;
  const hasIdentity = Boolean(brand.logo || brand.name);
  const backed = backdropOpacity > 0;
  return <div style={{ position: 'absolute', left: backed ? 78 : 96, top: backed ? 40 : 54, display: 'flex', alignItems: 'center', gap: 18,
    height: backed ? 84 : 56, padding: backed ? '0 18px' : 0, boxSizing: 'border-box' }}>
    {backed ? <ChromePanel theme={theme} opacity={backdropOpacity} /> : null}
    {brand.logo ? <Img src={staticFile(brand.logo)} style={{ position: 'relative', maxWidth: 244, maxHeight: 56, width: 'auto', height: 'auto', objectFit: 'contain' }} /> : null}
    {brand.name ? <span style={{ position: 'relative', fontSize: 30, lineHeight: 1, fontWeight: 760, letterSpacing: '-0.04em', color: theme.foreground }}>{brand.name}</span> : null}
    {brand.tagline ? <span style={{ position: 'relative', marginLeft: hasIdentity ? 4 : 0, paddingLeft: hasIdentity ? 22 : 0, borderLeft: hasIdentity ? `1px solid ${theme.border}` : undefined, fontSize: 18, color: theme.muted }}>{brand.tagline}</span> : null}
  </div>;
}
function SceneLayer({ scene, project, theme, first }: { scene: Scene; project: Project; theme: PresentationTheme; first: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transition = scene.transition ?? DEFAULT_TRANSITION;
  const duration = transitionFrames(scene, fps);
  const incomingOverlapFrames = first ? 0 : duration;
  const implementation = transitionRegistry[transition.type].implementation;
  const directional = implementation.kind === 'translate' && !implementation.fade;
  const entranceOffsetFrames = authoredEntranceOffsetFrames(scene, fps, first);
  const enter = duration === 0 || first ? 1 : interpolate(frame, [0, duration], [0, 1], { ...CLAMP,
    easing: directional ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic) });
  const transitionStyle = transitionStyleFor(transition.type, enter);
  return <AbsoluteFill style={{ background: theme.background, ...transitionStyle }}>
    <div style={{ position: 'absolute', width: 1220, height: 1080, right: 0, top: 0, background: `linear-gradient(125deg, ${theme.background}00, ${theme.tint})`, opacity: .9 }} />
    <SceneContent scene={scene} project={project} theme={theme} entranceOffsetFrames={entranceOffsetFrames} incomingOverlapFrames={incomingOverlapFrames} />
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
  const activeComposition = sceneComposition(active.scene);
  const previousComposition = previous ? sceneComposition(previous.scene) : activeComposition;
  const activeChromeVisible = activeComposition.chromeVisible;
  const previousChromeVisible = previousComposition.chromeVisible;
  const activeTransitionFrames = transitionFrames(active.scene, fps);
  const activeEnter = activeTransitionFrames === 0 || index === 0 ? 1 : interpolate(frame - active.from, [0, activeTransitionFrames], [0, 1], CLAMP);
  const chromeOpacity = presentationChromeOpacity(activeChromeVisible, previousChromeVisible, activeEnter);
  const chromeBackdropOpacity = presentationChromeOpacity(activeComposition.chromeBackdropVisible, previousComposition.chromeBackdropVisible, activeEnter);
  const usesBackedChrome = activeComposition.chromeBackdropVisible || previousComposition.chromeBackdropVisible;
  const chapter = project.scenes.slice(0, index).findLast((scene): scene is ChapterScene => scene.type === 'chapter');
  const showsChapterContext = chapter && ['overview', 'focus', 'camera', 'annotation', 'result'].includes(active.scene.type);
  const chapterEnter = interpolate(frame - active.from, [0, Math.max(1, Math.round(fps * .28))], [0, 1], CLAMP);
  return <AbsoluteFill style={{ background: theme.background, color: theme.foreground, fontFamily: theme.font, overflow: 'hidden' }}>
    {timeline.map(({ scene, from, duration }, i) => <Sequence key={scene.id} name={`${String(i + 1).padStart(2, '0')} · ${scene.type} · ${scene.title.replaceAll('\n', ' ')}`} from={from} durationInFrames={duration}>
      <SceneLayer scene={scene} project={project} theme={theme} first={i === 0} />
    </Sequence>)}
    {usesBackedChrome ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, opacity: chromeBackdropOpacity, background: theme.background }} /> : null}
    <div style={{ opacity: chromeOpacity }}>
      <BrandHeader project={project} theme={theme} backdropOpacity={usesBackedChrome ? chromeBackdropOpacity : 0} />
      {showsChapterContext ? <ChapterLabel scene={chapter} accent={project.accent} theme={theme} backdropOpacity={usesBackedChrome ? chromeBackdropOpacity : 0} style={{ opacity: chapterEnter, transform: `translateY(${(1 - chapterEnter) * 8}px)` }} /> : null}
      <div style={{ position: 'absolute', left: usesBackedChrome ? 72 : 96, right: usesBackedChrome ? 72 : 96, bottom: usesBackedChrome ? 46 : 64,
        padding: usesBackedChrome ? '18px 24px' : 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 17, color: theme.muted }}>
        {usesBackedChrome ? <ChromePanel theme={theme} opacity={chromeBackdropOpacity} /> : null}
        <span style={{ position: 'relative' }}>{project.title}{project.branding?.footer ? <> &nbsp; / &nbsp; {project.branding.footer}</> : null}</span>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', gap: 7 }}>{timeline.map(({ scene }, i) => <span key={scene.id} style={{ width: index === i ? 30 : 8, height: 4, borderRadius: 4, background: index === i ? project.accent : theme.border }} />)}</div>
          <span>{String(index + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${100 * (frame + 1) / durationInFrames}%`, background: project.accent }} />
    </div>
  </AbsoluteFill>;
}
