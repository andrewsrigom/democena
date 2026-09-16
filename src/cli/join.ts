// Modified for Democena (2026): independent fork naming and configuration.
/**
 * `democena join` — two parts into one video, without re-encoding.
 */
import { ffmpegMissingFix, hasFfmpeg } from '../ffmpeg.js';
import { join } from '../join.js';
import { megabytes, relative, say, UserFacingError } from './ui.js';

export function joinCommand(positional: string[], root = process.cwd()): number {
  const [first, second, target] = positional;
  if (first === undefined || second === undefined || target === undefined) {
    throw new UserFacingError('usage: democena join <first.mp4> <second.mp4> <target.mp4>');
  }

  if (!hasFfmpeg()) {
    throw new UserFacingError(
      'democena: joining needs ffmpeg, and it is not available.',
      ffmpegMissingFix(),
    );
  }

  const result = join(first, second, target);
  say(`joined: ${relative(result.file, root)} (${megabytes(result.bytes)})`);
  return 0;
}
