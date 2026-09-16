// Modified for Democena (2026): independent fork naming and configuration.
/**
 * Public entry point of democena.
 *
 * A scenario imports `test` and `expect` from here instead of from Playwright: same test runner, one
 * extra fixture. `playwright.config.ts` imports `definePlaywrightConfig`, and `democena.config.ts`
 * imports `defineConfig`.
 */
export { test, expect, Demo, readingTimeMs, slugify } from './demo.js';
export type { DemocenaFixtures, DemocenaOptions, DemoMode, DemoRunOptions } from './demo.js';

export { formatReport, rank, score, parseAriaSnapshot, describeLocator, locatorWords } from './check.js';
export type {
  Candidate,
  CheckFailure,
  CheckFrame,
  CheckReport,
  CheckStep,
  LocatorProbe,
} from './check.js';

export { jsonReport, emitJson } from './report.js';
export type { JsonReport, Problem, CommandName } from './report.js';

export { defineConfig, resolveConfig, loadConfig, findConfigFile, DemocenaConfigError } from './config.js';
export type {
  DemocenaConfig,
  ResolvedConfig,
  LoadedConfig,
  CaptionsConfig,
  StillsConfig,
  VideoConfig,
  VideoFormat,
  Viewport,
} from './config.js';

export { definePlaywrightConfig } from './playwright.js';
export type { PlaywrightConfigOptions } from './playwright.js';

export { defaultTheme, lightTheme, themes, resolveTheme } from './theme.js';
export type { Theme, ThemeInput, ThemeName } from './theme.js';

export { overlayScript, boxesOverlap, pickCaptionEdge, CAPTION_RING_GAP } from './overlay.js';
export type { DemoOverlay, OverlayBox } from './overlay.js';

export { render, findRecordings, hasFfmpeg, ffmpegInstallHint } from './render.js';
export type { Recording, RenderResult, RenderedFile, RenderOptions } from './render.js';

export { join } from './join.js';
export type { JoinResult } from './join.js';

export { toVtt, toTranscript } from './captions.js';
export type { DemoMeta, TimelineEntry, TimelineKind } from './captions.js';

export { planStills, publishStills, stillFileName } from './stills.js';
export type { TakenStill, StillsReport, StillsPlan, StillsFailure } from './stills.js';
