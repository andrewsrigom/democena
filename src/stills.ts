/**
 * Docs pictures taken from a scenario.
 *
 * A still is a screenshot of the real page at a moment the author marked, without the overlay. The
 * CLI asks for a count (`demotale images 8`); that count is a promise. If the run delivered a
 * different set, nothing is written to the stills directory — a partial update would leave a hole
 * in the documentation.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface TakenStill {
  /** File-name slug, from `demo.still('order-open')`. */
  name: string;
  /** Absolute path of the temporary PNG the fixture wrote. */
  source: string;
  /** Scenario file, relative to the project root, when known. */
  scenario?: string;
}

export interface StillsReport {
  title: string;
  scenario: string;
  stills: { name: string; file: string }[];
}

export type StillsFailure = 'count' | 'duplicate' | 'missing-file';

export interface StillsPlan {
  ok: boolean;
  failure?: StillsFailure;
  /** Destination file names, in order, when the promise holds. */
  files: { name: string; file: string; source: string }[];
  taken: string[];
  expected: number;
}

/** `01-order-open.png`, padding wide enough that 10 does not sort before 2. */
export function stillFileName(
  index: number,
  name: string,
  count: number,
  numbered: boolean,
): string {
  if (!numbered) return `${name}.png`;
  const width = Math.max(2, String(count).length);
  return `${String(index).padStart(width, '0')}-${name}.png`;
}

function duplicates(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) twice.add(name);
    seen.add(name);
  }
  return [...twice];
}

/**
 * Whether this run may replace the stills directory.
 *
 * The count must match, names must be unique, and every temporary file must still be there. Any of
 * those failing means the documentation is left untouched.
 */
export function planStills(
  taken: readonly TakenStill[],
  expected: number,
  numbered: boolean,
): StillsPlan {
  const names = taken.map((still) => still.name);
  const dupes = duplicates(names);

  if (dupes.length > 0) {
    return { ok: false, failure: 'duplicate', files: [], taken: names, expected };
  }

  if (taken.length !== expected) {
    return { ok: false, failure: 'count', files: [], taken: names, expected };
  }

  const missing = taken.filter((still) => !fs.existsSync(still.source));
  if (missing.length > 0) {
    return { ok: false, failure: 'missing-file', files: [], taken: names, expected };
  }

  return {
    ok: true,
    files: taken.map((still, index) => ({
      name: still.name,
      file: stillFileName(index + 1, still.name, expected, numbered),
      source: still.source,
    })),
    taken: names,
    expected,
  };
}

/**
 * Replace `destDir` with the planned files, or leave it alone.
 *
 * Staging is filled first. The current directory is renamed aside, then staging takes its place.
 * If that swap fails, the aside copy is put back, so a failed publish cannot empty the docs folder.
 */
export function publishStills(
  destDir: string,
  files: readonly { file: string; source: string }[],
): void {
  const parent = path.dirname(destDir);
  fs.mkdirSync(parent, { recursive: true });

  const staging = path.join(parent, `.demotale-stills-${String(process.pid)}`);
  const aside = path.join(parent, `.demotale-stills-prev-${String(process.pid)}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(aside, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  try {
    for (const file of files) {
      fs.copyFileSync(file.source, path.join(staging, file.file));
    }
    if (fs.existsSync(destDir)) fs.renameSync(destDir, aside);
    try {
      fs.renameSync(staging, destDir);
    } catch (error) {
      if (fs.existsSync(aside)) fs.renameSync(aside, destDir);
      throw error;
    }
    fs.rmSync(aside, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
