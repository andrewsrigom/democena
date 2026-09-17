import type { CompositionLayout } from './model';
import type { PresentationTheme } from './theme';

export function CompositionBackground({ layout, accent, theme }: { layout: CompositionLayout; accent: string; theme: PresentationTheme }) {
  if (layout === 'framed' || layout === 'full-bleed' || layout === 'full-bleed-proof') return null;
  const grid = `linear-gradient(${theme.border}38 1px, transparent 1px), linear-gradient(90deg, ${theme.border}38 1px, transparent 1px)`;
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', inset: 0, opacity: layout === 'product-stage' ? .62 : .38,
      backgroundImage: `${grid}, radial-gradient(circle at 66% 42%, ${accent}25, transparent 44%)`, backgroundSize: '64px 64px', maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 82%, transparent)' }} />
    {layout === 'layered-product' ? <>
      <div style={{ position: 'absolute', left: 180, top: 140, width: 620, height: 620, borderRadius: '50%', background: `${accent}18`, filter: 'blur(44px)' }} />
      <div style={{ position: 'absolute', right: 60, bottom: 20, width: 720, height: 520, borderRadius: '50%', background: theme.tint, filter: 'blur(52px)' }} />
    </> : null}
    {layout === 'detail-crop' ? <div style={{ position: 'absolute', left: 540, top: 96, bottom: 96, width: 1, background: `linear-gradient(${accent}00, ${accent}70, ${accent}00)` }} /> : null}
  </div>;
}

export function CompositionMidground({ layout, accent, theme }: { layout: CompositionLayout; accent: string; theme: PresentationTheme }) {
  if (layout === 'product-stage') return <>
    <div style={{ position: 'absolute', left: 190, right: 190, bottom: 52, height: 160, borderRadius: '50%', background: `radial-gradient(ellipse, ${theme.shadow}28, transparent 68%)`, filter: 'blur(18px)' }} />
    <div style={{ position: 'absolute', left: 250, right: 250, bottom: 75, height: 2, background: `linear-gradient(90deg, ${accent}00, ${accent}55, ${accent}00)` }} />
  </>;
  if (layout === 'layered-product') return <div style={{ position: 'absolute', right: 116, top: 110, width: 780, height: 720, border: `1px solid ${accent}25`, borderRadius: 42, transform: 'rotate(3deg)' }} />;
  return null;
}

export function CompositionForeground({ layout, accent }: { layout: CompositionLayout; accent: string }) {
  if (layout === 'product-stage') return <>
    <div style={{ position: 'absolute', left: 210, top: 100, width: 72, height: 72, borderLeft: `2px solid ${accent}70`, borderTop: `2px solid ${accent}70` }} />
    <div style={{ position: 'absolute', right: 210, bottom: 56, width: 72, height: 72, borderRight: `2px solid ${accent}70`, borderBottom: `2px solid ${accent}70` }} />
  </>;
  if (layout === 'detail-crop') return <div style={{ position: 'absolute', left: 548, top: 210, width: 38, height: 4, borderRadius: 999, background: accent }} />;
  if (layout === 'full-bleed-proof') return <>
    <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 0 2px ${accent}55`, pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', right: 78, top: 76, width: 86, height: 86, borderTop: `3px solid ${accent}`, borderRight: `3px solid ${accent}` }} />
  </>;
  return null;
}
