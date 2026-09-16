import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';

export function Eyebrow({ children, accent }: { children: string; accent: string }) {
  return <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: accent, fontSize: 17, fontWeight: 700, letterSpacing: 2.2, textTransform: 'uppercase' }}>
    <span style={{ width: 32, height: 2, background: accent }} />{children}
  </div>;
}

/** Keep a highlighted phrase together while other words enter independently. */
export function AnimatedTitle({ text, highlight, reveal = 'words', accent, style }: {
  text: string; highlight?: string; reveal?: 'words' | 'lines'; accent: string; style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let wordIndex = 0;
  return <h1 style={{ fontSize: 112, lineHeight: 1.12, fontWeight: 600, letterSpacing: -5.5, margin: '28px 0 32px', ...style }}>
    {text.split('\n').map((line, lineIndex) => {
      const parts = highlight && line.includes(highlight) ? line.split(highlight).flatMap((part, i) => i === 0 ? [{ text: part, marked: false }] : [{ text: highlight, marked: true }, { text: part, marked: false }]) : [{ text: line, marked: false }];
      const words = parts.flatMap((part) => part.marked ? [part] : part.text.split(/(\s+)/).filter(Boolean).map((word) => ({ text: word, marked: false })));
      return <div key={lineIndex}>
        {words.map((word, i) => {
          if (/^\s+$/.test(word.text)) return <span key={i}>{word.text}</span>;
          const delay = reveal === 'lines' ? lineIndex * 9 : wordIndex++ * 3;
          const enter = spring({ frame: frame - delay - 4, fps, config: { damping: 24, stiffness: 140 } });
          const mark = spring({ frame: frame - delay - 17, fps, config: { damping: 30, stiffness: 90 } });
          return <span key={i} style={{ display: 'inline-block', position: 'relative', opacity: enter, transform: `translateY(${(1 - enter) * 36}px)`, whiteSpace: 'pre' }}>
            {word.marked ? <span style={{ position: 'absolute', left: -5, right: -5, bottom: '0.08em', height: '0.23em', background: accent, opacity: 0.22, borderRadius: 4, transformOrigin: 'left', transform: `scaleX(${mark})` }} /> : null}
            <span style={{ position: 'relative' }}>{word.text}</span>
          </span>;
        })}
      </div>;
    })}
  </h1>;
}
