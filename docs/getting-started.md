<!-- Modified for Democena (2026): independent fork naming and configuration. -->
# Getting started

From nothing to a video, a gif, or pictures, in the order it actually happens.

## What you need

- Node 22.12 or later. Below that Node cannot read a TypeScript config file without a build step,
  which is what makes `democena.config.ts` work.
- An application you can start locally.

Playwright and Chromium come with `democena`. Put ffmpeg on PATH
(`brew install ffmpeg`, `apt install ffmpeg`, `winget install ffmpeg`), or add
`npm i -D ffmpeg-static`. Without any ffmpeg a recording still runs and leaves you a webm.

The alpha package is installed from a local, built checkout; it is not published to npm.

## Install

```bash
npm i -D /absolute/path/to/democena
npx democena init
```

`init` writes these and overwrites none of them:

| | |
| --- | --- |
| `democena.config.ts` | Where your app runs, how fast the demo goes, what is never in frame |
| `playwright.config.ts` | Generated from the above. Not meant to be edited |
| `demo/example.demo.ts` | A scenario that records the front page |
| `AGENTS.md` | Five lines pointing at `npx democena agent-guide`. `--no-agent` skips this |
| `.gitignore` lines and npm scripts | Including `.auth/`, which holds a credential |

`--ci` writes `.github/workflows/democena.yml` if that file is not already there. Skip it until
you want CI to re-record; `doctor` will name the command when the file is missing.

If install scripts were skipped, or doctor reports a missing browser: `npx democena setup`.

## Point it at your app

Open `democena.config.ts` and change two things:

```ts
baseUrl: 'http://localhost:4200',
webServer: {
  command: 'npm start',
  url: 'http://localhost:4200',
  reuseExistingServer: false,
},
```

`reuseExistingServer: false` is deliberate. A recording or stills run made against an environment
somebody left running is a take against unknown data, and that has produced a video of an
application correctly refusing to do the thing the video was about. `check` reuses whatever is
already listening.

## Check the machine

```bash
npx democena doctor
```

Ten seconds, one line per thing, and a sentence for anything that is missing. Worth running before
the first recording rather than after twenty minutes of one. It installs nothing. Missing Chromium
is `npx democena setup`. Missing ffmpeg is a system install, or `npm i -D ffmpeg-static`. Missing
CI is `npx democena init --ci`.

## Record

```bash
npx democena video
```

It starts your app, plays the scenario, and renders. You end up with:

```
demo/output/
  raw/                      the webm Playwright wrote, and the sidecar
  a-first-recording.mp4
  a-first-recording.vtt     subtitles
  a-first-recording.md      transcript with timestamps
```

`npx democena gif` adds a gif (reuses this recording). `npx democena images N` writes docs pictures
from `demo.still()` into `demo/stills/`, which belongs in git. `npx democena record` is what CI runs:
one play, whatever `video.formats` lists.

## Watch it being made

```bash
npx democena video --headed
```

The browser is visible while it works. Useful the first few times, and for finding out which of your
selectors does not match what you thought.

## Then

- [Writing a scenario](writing-a-scenario.md) for what to put in the file.
- [Recipes](recipes.md) if your app needs a login, or if the demo has a long wait in the middle.

CI is the same `democena record` as the umbrella locally. `doctor` will tell you if the workflow is missing;
`npx democena init --ci` writes it. A UI change that breaks the click path then turns the job red
instead of shipping a stale video.
