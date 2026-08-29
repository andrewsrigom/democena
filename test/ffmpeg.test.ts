import { describe, expect, it } from 'vitest';

import { ffmpegInstallHint, ffmpegInstallHintFor, ffmpegMissingFix, ffmpegSourceDetail } from '../src/ffmpeg.js';

describe('ffmpegInstallHintFor', () => {
  it('names the install a person on that OS would actually run', () => {
    expect(ffmpegInstallHintFor('darwin')).toBe('brew install ffmpeg');
    expect(ffmpegInstallHintFor('win32')).toBe('winget install ffmpeg');
    expect(ffmpegInstallHintFor('linux')).toBe('apt install ffmpeg');
  });
});

describe('ffmpegMissingFix', () => {
  it('names a system install and ffmpeg-static, not demotale setup', () => {
    const fix = ffmpegMissingFix();
    expect(fix).toContain(ffmpegInstallHint());
    expect(fix).toContain('npm i -D ffmpeg-static');
    expect(fix).not.toMatch(/demotale setup/);
  });
});

describe('ffmpegSourceDetail', () => {
  it('labels PATH and ffmpeg-static without calling the latter bundled', () => {
    expect(ffmpegSourceDetail('path')).toBe('on PATH');
    expect(ffmpegSourceDetail('ffmpeg-static')).toBe('ffmpeg-static');
  });
});
