// Modified for Democena (2026): independent fork naming and configuration.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { planStills, publishStills, stillFileName, type TakenStill } from '../src/stills.js';

function png(dir: string, name: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'not a real png');
  return file;
}

describe('stillFileName', () => {
  it('prefixes a zero-padded number so 10 does not sort before 2', () => {
    expect(stillFileName(1, 'order-open', 8, true)).toBe('01-order-open.png');
    expect(stillFileName(10, 'done', 12, true)).toBe('10-done.png');
  });

  it('drops the number when numbering is off, so a docs link stays stable', () => {
    expect(stillFileName(1, 'order-open', 8, false)).toBe('order-open.png');
  });
});

describe('planStills', () => {
  let dir = '';

  afterEach(() => {
    if (dir !== '') fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a run that delivered exactly the promised names', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'democena-stills-'));
    const taken: TakenStill[] = [
      { name: 'home', source: png(dir, 'a.png') },
      { name: 'result', source: png(dir, 'b.png') },
    ];
    const plan = planStills(taken, 2, true);
    expect(plan.ok).toBe(true);
    expect(plan.files.map((file) => file.file)).toEqual(['01-home.png', '02-result.png']);
  });

  it('rejects a count mismatch so a partial set cannot land in the docs', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'democena-stills-'));
    const taken: TakenStill[] = [{ name: 'home', source: png(dir, 'a.png') }];
    const plan = planStills(taken, 2, true);
    expect(plan.ok).toBe(false);
    expect(plan.failure).toBe('count');
    expect(plan.files).toEqual([]);
  });

  it('rejects a duplicated name', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'democena-stills-'));
    const taken: TakenStill[] = [
      { name: 'home', source: png(dir, 'a.png') },
      { name: 'home', source: png(dir, 'b.png') },
    ];
    const plan = planStills(taken, 2, true);
    expect(plan.ok).toBe(false);
    expect(plan.failure).toBe('duplicate');
  });
});

describe('publishStills', () => {
  let dir = '';

  afterEach(() => {
    if (dir !== '') fs.rmSync(dir, { recursive: true, force: true });
  });

  it('leaves the destination alone if a source file is missing', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'democena-stills-'));
    const dest = path.join(dir, 'stills');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, '09-old.png'), 'stale');

    expect(() =>
      publishStills(dest, [{ file: '01-home.png', source: path.join(dir, 'missing.png') }]),
    ).toThrow();

    expect(fs.readFileSync(path.join(dest, '09-old.png'), 'utf8')).toBe('stale');
    expect(fs.existsSync(path.join(dest, '01-home.png'))).toBe(false);
  });

  it('replaces the destination directory, so leftover pictures from a longer run go away', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'democena-stills-'));
    const dest = path.join(dir, 'stills');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, '09-old.png'), 'stale');
    const source = png(dir, 'fresh.png');

    publishStills(dest, [{ file: '01-home.png', source }]);

    expect(fs.existsSync(path.join(dest, '01-home.png'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '09-old.png'))).toBe(false);
  });
});
