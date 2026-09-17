import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme, resolveTheme } from '../studio/src/theme-data.mjs';

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
  it.each([lightTheme, darkTheme])('keeps foreground and muted copy readable in $mode mode', (theme) => {
    expect(contrast(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('resolves explicit and automatic surfaces while retaining product tokens', () => {
    expect(resolveTheme({ appearance: { surfaceMode: 'dark' } }).mode).toBe('dark');
    expect(resolveTheme({ appearance: { surfaceMode: 'auto', background: '#111827' } }).mode).toBe('dark');
    expect(resolveTheme({ appearance: { surfaceMode: 'auto', background: '#ffffff' } }).mode).toBe('light');
    expect(resolveTheme({ appearance: { surfaceMode: 'dark', background: '#101828', radius: 24, fontFamily: 'Geist, sans-serif' } }))
      .toMatchObject({ mode: 'dark', background: '#101828', radius: 24, font: 'Geist, sans-serif' });
  });
});
