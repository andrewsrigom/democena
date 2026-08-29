import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveConfig } from '../src/config.js';
import { render } from '../src/render.js';

vi.mock('../src/ffmpeg.js', () => ({
  hasFfmpeg: () => true,
  runFfmpeg: (args: string[]) => {
    const target = args[args.length - 1];
    if (typeof target === 'string') fs.writeFileSync(target, 'x');
  },
  ffmpegInstallHint: () => 'brew install ffmpeg',
  resolveFfmpeg: () => ({ command: 'ffmpeg', source: 'path' as const }),
}));

describe('render format override', () => {
  let dir = '';

  afterEach(() => {
    if (dir !== '') fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes only the format that was asked for', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demotale-render-'));
    const raw = path.join(dir, 'raw', 'take');
    fs.mkdirSync(raw, { recursive: true });
    fs.writeFileSync(path.join(raw, 'video.webm'), 'webm');

    const config = resolveConfig({ output: dir, video: { formats: ['mp4', 'gif'] } });
    const gifOnly = render(config, dir, { formats: ['gif'], captions: false });

    expect(gifOnly.files.map((file) => path.extname(file.file))).toEqual(['.gif']);
    expect(fs.existsSync(path.join(dir, 'take.mp4'))).toBe(false);
  });
});
