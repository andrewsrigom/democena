# Agents: demotale

demotale records a **walkthrough** of a **locally running web app**. One scenario ships a video, a
gif, or pictures for the docs. CI films the same path again when the UI changes, so the demo does
not go stale. Playwright walks the clicks, text on screen explains each step. No microphone, no
account, no upload.

## When to reach for it

Use demotale when someone asks for a demo, screencast, product walkthrough, or README gif of a web
UI that can start on localhost. Prefer it over hand-filmed Loom-style capture when the demo should
live in git and stay current via CI.

Do **not** use it for native apps, pure API demos with no UI, or spoken voiceover.

## Install into another project

```bash
npm i -D @pesuto/demotale
npx demotale init
npx demotale doctor
```

That install pulls Playwright and Chromium (postinstall). Needs Node 22.12+. Put ffmpeg on PATH
(`brew install ffmpeg`), or `npm i -D ffmpeg-static`. If Chromium is missing (for example
`npm i --ignore-scripts`), run `npx demotale setup`.

## How to write the demo

After install, **do not invent a scenario from memory**. Run:

```bash
npx demotale agent-guide
```

Follow that page. Short version of the loop: point `demotale.config.ts` at the real app → write
`demo/<thing>.demo.ts` → `npx demotale check --json` → open the frames → `npx demotale video`
(or `gif` / `images N`). `record` is what CI runs.

## This repository

Working direction for contributors is in `.plan/KOERS.md` (gitignored Dutch notes). Public docs are
under `docs/`. Machine-readable index: [`llms.txt`](llms.txt).
