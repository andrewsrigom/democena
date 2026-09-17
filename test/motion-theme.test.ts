import { describe, expect, it } from 'vitest';
import { theme } from '../studio/src/theme-data.mjs';

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe('Studio presentation contrast', () => {
  it('keeps foreground and muted copy readable on the presentation background', () => {
    expect(contrast(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5);
  });
});
