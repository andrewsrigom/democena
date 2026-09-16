# Democena

**Real product workflows. Text that guides. Motion that makes them clear.**

Democena records scripted browser walkthroughs and turns them into silent product demos, GIFs, and documentation images. It is an independent fork of [Demotale](https://github.com/pesuto-dev/demotale), moving toward clean capture and a separate Remotion presentation layer.

**Status: early alpha.** The capture CLI is inherited from Demotale. The optional `studio/` prototype adds a real browser recording, animated typography, a framed viewport, and smooth focus movements. It is a developer tool, not a hosted editor.

![Democena motion prototype showing a real synthetic parcel-tracking workflow](docs/media/preview.png)

## Start locally

Node 22.12+, npm, FFmpeg, and Chromium's system dependencies are required.

```bash
git clone https://github.com/andrewsrigom/democena.git
cd democena
npm ci --ignore-scripts
npx playwright install chromium
npm run build
node dist/cli/index.js --help
npm run example
```

The example runs a public, synthetic parcel-tracking application on localhost. It uses no account, API key, or external model.

## Try the Remotion prototype

```bash
npm run studio:install
npm run studio:capture
npm run studio:render
npm run studio:dev
```

Capture produces a clean browser video plus an editable scene manifest. Render creates `studio/output/democena.mp4`. Studio previews the same composition. Change the text, accent and focus points in `studio/project.json`, then render again without replaying the application.

See [studio/README.md](studio/README.md) for the current capabilities and limits.

## Capture your application

The local package has not been published to npm. Install this checkout into your application, then initialize it:

```bash
npm install --save-dev /absolute/path/to/democena
npx democena init
npx democena agent-guide
```

Write `democena.config.ts` and a scenario that imports `test` and `expect` from `democena`. Existing Demotale scenarios need their package import and config name updated. CLI environment variables use the `DEMOCENA_` prefix.

```bash
npx democena check --json
npx democena video
npx democena images 3
```

The core CLI still renders its in-page overlays. The clean-capture Remotion prototype currently has its own example adapter; it does not yet convert every existing scenario automatically.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
npm --prefix studio run typecheck
```

[Architecture and next steps](docs/architecture.md) · [Writing a scenario](docs/writing-a-scenario.md) · [Upstream origin](UPSTREAM.md)

## License and attribution

Democena's source is Apache-2.0. Original Demotale copyright and notices remain in [LICENSE](LICENSE) and [NOTICE](NOTICE). Democena is maintained independently by andrewsrigom and is not an official Pesuto product.

Remotion and browser/media dependencies retain their own licenses. In particular, Remotion has [its own license](https://www.remotion.dev/license); this repository does not relicense it under Apache-2.0.
