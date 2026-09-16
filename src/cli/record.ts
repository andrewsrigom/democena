// Modified for Democena (2026): independent fork naming and configuration.
/**
 * `democena record` — run the scenarios and turn the result into a video.
 *
 * `video` and `gif` are the same play, asking for one artefact so a person does not get files they
 * did not ask for. `record` is the CI umbrella: one play, whatever the config lists.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from '../config.js';
import type { VideoFormat } from '../config.js';
import { resolvePlaywright } from '../playwright-resolve.js';
import { findRecordings } from '../render.js';
import { emitJson, jsonReport, type CommandName } from '../report.js';
import { flagBoolean, flagNumber, flagString, type Args } from './args.js';
import { renderCommand, runRender } from './render.js';
import { say, UserFacingError } from './ui.js';

const PLAYWRIGHT_CONFIGS = [
  'playwright.config.ts',
  'playwright.config.mts',
  'playwright.config.mjs',
  'playwright.config.js',
];

export function findPlaywrightConfig(root: string): string {
  for (const name of PLAYWRIGHT_CONFIGS) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new UserFacingError(
    'democena: no playwright.config.ts in this directory, so there is nothing to run.',
    'Run "npx democena init" to write one.',
  );
}

/** The Playwright CLI: the project's copy when present, otherwise the one that ships with democena. */
export function resolvePlaywrightCli(root: string): string {
  const resolved = resolvePlaywright(root);
  if (resolved === undefined) {
    throw new UserFacingError(
      'democena: @playwright/test is not installed.',
      'Run "npx democena setup".',
    );
  }
  return resolved.cli;
}

function withPort(baseUrl: string, port: number): string {
  const url = new URL(baseUrl);
  url.port = String(port);
  return url.toString().replace(/\/$/, '');
}

/**
 * The address this run should use, from `--base-url` or `--port`, or nothing to leave the config
 * alone.
 *
 * `--port` moves the port and keeps the rest; `--base-url` replaces the lot, which is what you want
 * when the obstacle is the server rather than the port — checking a scenario against a copy of the
 * app somewhere else, for instance, instead of editing the config and remembering to put it back.
 */
export function resolveBaseUrl(args: Args, configured: string): string | undefined {
  const given = flagString(args, 'base-url');
  if (given !== undefined) {
    try {
      return new URL(given).toString().replace(/\/$/, '');
    } catch {
      throw new UserFacingError(
        `democena: --base-url ${given} is not a URL.`,
        'It needs the scheme too, as in --base-url http://localhost:4173',
      );
    }
  }

  const port = flagNumber(args, 'port');
  return port === undefined ? undefined : withPort(configured, port);
}

export async function playScenarios(
  args: Args,
  root: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ status: number; output: string }> {
  const { config } = await loadConfig(root);
  const playwrightConfig = findPlaywrightConfig(root);
  const cli = resolvePlaywrightCli(root);

  const speed = flagNumber(args, 'speed');
  const slowMo = flagNumber(args, 'slow-mo');
  const baseUrl = resolveBaseUrl(args, config.baseUrl);

  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (speed !== undefined) env['DEMOCENA_SPEED'] = String(speed);
  if (slowMo !== undefined) env['DEMOCENA_SLOWMO'] = String(slowMo);
  if (baseUrl !== undefined) env['DEMOCENA_BASE_URL'] = baseUrl;

  const filter = args.positional[0];
  const playwrightArgs = [
    cli,
    'test',
    '--config',
    playwrightConfig,
    ...(flagBoolean(args, 'headed') ? ['--headed'] : []),
    ...(filter === undefined ? [] : [filter]),
    ...args.rest,
  ];

  const json = flagBoolean(args, 'json');
  const result = spawnSync(process.execPath, playwrightArgs, {
    stdio: json ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    env: json ? { ...env, NO_COLOR: '1', FORCE_COLOR: '0' } : env,
    cwd: root,
  });

  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.toString().trimEnd(),
  };
}

async function reportPlay(
  command: CommandName,
  args: Args,
  played: { status: number; output: string },
  root: string,
  renderOpts: { formats?: VideoFormat[]; captions?: boolean } | undefined,
  noRender: boolean,
): Promise<number> {
  const json = flagBoolean(args, 'json');

  if (json) {
    const recorded = played.status === 0;
    const rendered = recorded && !noRender ? await runRender(root, renderOpts ?? {}) : undefined;
    emitJson(
      jsonReport(
        command,
        recorded && (rendered?.ok ?? true),
        [
          ...(recorded
            ? []
            : [
                {
                  code: 'record-failed' as const,
                  message:
                    'The recording did not finish. Playwright\'s own output is under ' +
                    'result.playwright.output; run "democena check" for the same click path with ' +
                    'the failure spelled out.',
                  fix: 'npx democena check',
                },
              ]),
          ...(rendered?.problems ?? []),
        ],
        {
          playwright: { exitCode: played.status, output: played.output },
          rendered: rendered?.payload,
        },
      ),
    );
    if (played.status !== 0) return played.status;
    if (rendered?.ok === false && rendered.payload.recordings.length === 0) return 1;
    return 0;
  }

  if (played.status !== 0) return played.status;

  if (noRender) {
    say('');
    say('Recorded. Run "democena render" to turn it into a video.');
    return 0;
  }

  say('');
  return renderCommand(root, false, renderOpts);
}

export async function recordCommand(args: Args, root = process.cwd()): Promise<number> {
  const noRender = flagString(args, 'render') === 'false' || flagBoolean(args, 'no-render');
  const played = await playScenarios(args, root);
  return reportPlay('record', args, played, root, undefined, noRender);
}

/** An mp4, and nothing else. */
export async function videoCommand(args: Args, root = process.cwd()): Promise<number> {
  const played = await playScenarios(args, root);
  return reportPlay('video', args, played, root, { formats: ['mp4'] }, false);
}

/**
 * A gif. Reuses the last recording when one is already there, so `video` then `gif` does not play
 * the click path twice.
 */
export async function gifCommand(args: Args, root = process.cwd()): Promise<number> {
  const { config } = await loadConfig(root);
  const existing = findRecordings(path.join(root, config.output, 'raw'));
  const opts = { formats: ['gif'] as VideoFormat[], captions: false };

  if (existing.length === 0 || args.positional[0] !== undefined) {
    const played = await playScenarios(args, root);
    return reportPlay('gif', args, played, root, opts, false);
  }

  const json = flagBoolean(args, 'json');
  if (json) {
    const rendered = await runRender(root, opts);
    emitJson(jsonReport('gif', rendered.ok, rendered.problems, { rendered: rendered.payload }));
    return rendered.payload.recordings.length === 0 ? 1 : 0;
  }

  return renderCommand(root, false, opts);
}
