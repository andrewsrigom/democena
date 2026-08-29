/**
 * `demotale images N` — docs pictures from marked moments in the scenario.
 *
 * N is a promise: the run must deliver exactly that many `demo.still()` calls, with unique names,
 * or nothing is written. A partial set would leave a hole in the documentation.
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../config.js';
import { emitJson, jsonReport, type Problem, type ProblemCode } from '../report.js';
import { planStills, publishStills, type StillsReport, type TakenStill } from '../stills.js';
import { flagBoolean, type Args } from './args.js';
import { playScenarios } from './record.js';
import { relative, say, warn } from './ui.js';

const STILL_HINT =
  'In the scenario, after the assertion that proves the screen, add: await demo.still(\'name\'). ' +
  'Then run `npx demotale agent-guide` and read the stills section.';

/** Every `stills.json` under a directory, oldest first so order follows the run. */
function readStillReports(dir: string): { report: StillsReport; dir: string }[] {
  if (!fs.existsSync(dir)) return [];

  const found: { report: StillsReport; dir: string; at: number }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'stills.json');
    if (!fs.existsSync(file)) continue;
    try {
      found.push({
        report: JSON.parse(fs.readFileSync(file, 'utf8')) as StillsReport,
        dir: path.join(dir, entry.name),
        at: fs.statSync(file).mtimeMs,
      });
    } catch {
      // A half-written report is not worth crashing the command over.
    }
  }

  found.sort((a, b) => a.at - b.at);
  return found.map(({ report, dir: from }) => ({ report, dir: from }));
}

export function parseImagesCount(positional: string[]): { count?: number; filter?: string } {
  const first = positional[0];
  if (first !== undefined && /^[1-9]\d*$/.test(first)) {
    return { count: Number(first), filter: positional[1] };
  }
  return { filter: first };
}

function takenFrom(reports: { report: StillsReport; dir: string }[]): TakenStill[] {
  const taken: TakenStill[] = [];
  for (const { report, dir } of reports) {
    for (const still of report.stills) {
      taken.push({
        name: still.name,
        source: path.join(dir, still.file),
        scenario: report.scenario,
      });
    }
  }
  return taken;
}

function explainFailure(
  failure: 'count' | 'duplicate' | 'missing-file',
  taken: string[],
  expected: number,
): { code: ProblemCode; message: string } {
  switch (failure) {
    case 'count':
      return {
        code: 'stills-count',
        message:
          `Asked for ${String(expected)} still${expected === 1 ? '' : 's'}, ` +
          `the scenario delivered ${String(taken.length)}` +
          `${taken.length === 0 ? '' : ` (${taken.join(', ')})`}. ` +
          'Nothing was written.',
      };
    case 'duplicate':
      return {
        code: 'stills-duplicate',
        message:
          `Two stills used the same name (${taken.join(', ')}). Names have to be unique. ` +
          'Nothing was written.',
      };
    case 'missing-file':
      return {
        code: 'stills-count',
        message: 'A still was named but its picture file was missing. Nothing was written.',
      };
    default: {
      const _never: never = failure;
      return _never;
    }
  }
}

/** Whether this run may replace the stills directory. Failed plays and broken promises write nothing. */
export function shouldWriteStills(playedStatus: number, plan: { ok: boolean }): boolean {
  return playedStatus === 0 && plan.ok;
}

export async function imagesCommand(args: Args, root = process.cwd()): Promise<number> {
  const { count, filter } = parseImagesCount(args.positional);
  const json = flagBoolean(args, 'json');

  if (count === undefined) {
    const message =
      'demotale images needs a count, as in `demotale images 8`. That number is a promise: ' +
      'exactly that many `demo.still()` calls, or nothing is written.';
    if (json) {
      emitJson(
        jsonReport('images', false, [{ code: 'stills-missing', message, fix: STILL_HINT }], {
          stills: [],
        }),
      );
    } else {
      warn(message);
      warn(STILL_HINT);
    }
    return 1;
  }

  const { config } = await loadConfig(root);
  const outputDir = path.resolve(root, config.output, 'images');
  fs.rmSync(outputDir, { recursive: true, force: true });

  const playArgs: Args = {
    ...args,
    positional: filter === undefined ? [] : [filter],
  };
  const extraEnv: NodeJS.ProcessEnv = { DEMOTALE_IMAGES: '1' };

  const played = await playScenarios(playArgs, root, extraEnv);
  const reports = readStillReports(outputDir);
  const taken = takenFrom(reports);
  const plan = planStills(taken, count, config.stills.number);
  const destDir = path.resolve(root, config.stills.dir);

  const problems: Problem[] = [];
  if (played.status !== 0) {
    problems.push({
      code: 'record-failed',
      message: 'The scenario did not finish, so the stills were not written.',
      fix: 'npx demotale check',
    });
  } else if (!plan.ok && plan.failure !== undefined) {
    problems.push({ ...explainFailure(plan.failure, plan.taken, plan.expected), fix: STILL_HINT });
  }

  const ok = shouldWriteStills(played.status, plan);
  if (ok) publishStills(destDir, plan.files);

  if (json) {
    emitJson(
      jsonReport('images', ok, problems, {
        expected: count,
        taken: plan.taken,
        files: ok ? plan.files.map((file) => path.join(destDir, file.file)) : [],
        dir: destDir,
      }),
    );
    return ok ? 0 : 1;
  }

  if (!ok) {
    for (const problem of problems) warn(`demotale images: ${problem.message}`);
    warn(STILL_HINT);
    return 1;
  }

  say(`Wrote ${String(plan.files.length)} stills to ${relative(destDir, root)}/`);
  for (const [index, file] of plan.files.entries()) {
    say(`  ${String(index + 1)}  ${file.name}     ${file.file}`);
  }
  return 0;
}
