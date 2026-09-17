<h1 align="center">
  <img src="docs/media/democena-logo.png" alt="Democena" width="460">
</h1>

<p align="center"><strong>Real product workflows. Text that guides. Motion that makes them clear.</strong></p>

Democena records scripted browser walkthroughs and turns them into silent product demos, GIFs, and documentation images.

**Status: early alpha.** The optional `studio/` adds eight scene types: animated text, chapter breaks, app overview, spotlight focus, camera paths, paused annotations, before/after results, and closing panels. It is a developer tool, not a hosted editor.

![Democena explaining the published Forma collection in a blue CatalogForge-inspired presentation](docs/media/preview.png)

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

The example is **Forma**, an original, synthetic collection app: add a product, publish the collection and open its public catalog. It runs on localhost with no account, API key or external model. Forma and the motion presentation share a CatalogForge-inspired blue palette, white panels and restrained borders.

## Try the Remotion prototype

```bash
npm run studio:install
npm run studio:capture
npm run studio:render
npm run studio:dev
npm run playbook # local motion catalog at http://127.0.0.1:4179
npm run benchmark:transitions # transition matrix, quality report, and A/B viewer
```

Capture produces a clean browser video plus an editable scene manifest. Render creates `studio/output/democena.mp4`. Studio previews the same composition. Change the text, accent, light/dark appearance, product-derived visual tokens, branding and focus points in `studio/project.json`, then render again without replaying the application. Generated projects have no Democena watermark; add a name, tagline, footer or imported logo only when the demo needs them.

Each scene has its own duration and transition. A small semantic motion vocabulary adds restrained text reveals, chapter continuity, evidence-linked focus scanning and a subtractive close. Freeze the recording for an explanation, move between real elements, or compare two recorded states. `npm run studio:preview` exports a still of every scene.

`npm run playbook` opens the local Motion Playbook. Filter the shared recipe and transition catalog, switch product fixtures, scrub the exact Remotion composition, inspect registry metadata and copy a direct link to the selected entry. The Playbook binds only to `127.0.0.1`, generates its synthetic product media locally and does not upload anything.

`npm run benchmark:transitions` renders before, midpoint and settled-after frames for every registered transition. It blocks on blank surfaces, transparent coverage, presentation-chrome flashes or an unsettled after frame, then writes a contact sheet, machine-readable report and interactive A/B viewer under the ignored `studio/output/transition-matrix/` directory.

See the [scene authoring guide](docs/scenes.md) and [studio/README.md](studio/README.md) for controls, examples and current limits.

## Capture your application

The local package has not been published to npm. Install this checkout into your application, then initialize it:

```bash
npm install --save-dev /absolute/path/to/democena
npx democena init
npx democena agent-guide
```

Write `democena.config.ts` and a scenario that imports `test` and `expect` from `democena`. CLI environment variables use the `DEMOCENA_` prefix.

```bash
npx democena check --json
npx democena video
npx democena images 3
```

The core CLI still renders its in-page overlays. The clean-capture Remotion prototype uses a shared declarative browser-capture engine; it does not yet convert every existing scenario automatically.

## Use with Codex or another agent

The optional local MCP server exposes browser capture, project discovery, revisioned Director plans, launch/tour compilation, scene editing, media import, validation and background rendering. Preview jobs produce scene stills, transition frames, a contact sheet, a poster and a machine-readable quality report. The same operations are available through a JSON CLI for agents with terminal access.

```bash
npm run mcp:install
npm run mcp:build
node mcp/dist/mcp/src/cli.js capabilities --workspace "$PWD/.democena-agent"
```

Configure Codex to launch `mcp/dist/mcp/src/index.js` with an explicit workspace. See the [agent and MCP guide](docs/agents.md) for setup and the complete inspect → capture → direct → compile → review → deliver workflow. The reusable [Democena Director skill](skills/democena-director/SKILL.md) keeps claims tied to captured evidence and supports collaborative or autonomous local generation.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:capture
npm --prefix studio run typecheck
```

[Architecture and next steps](docs/architecture.md) · [Writing a scenario](docs/writing-a-scenario.md)

## License and attribution

Licensed under [Apache-2.0](LICENSE). Based on [Demotale](https://github.com/pesuto-dev/demotale); see [NOTICE](NOTICE) for credits and [UPSTREAM.md](UPSTREAM.md) for origin and changes.

Remotion and browser/media dependencies retain their own licenses. In particular, Remotion has [its own license](https://www.remotion.dev/license); this repository does not relicense it under Apache-2.0.
