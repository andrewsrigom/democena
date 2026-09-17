# Democena · motion studio

An optional presentation layer for silent product demos. Playwright records the bundled original Forma collection application; Remotion turns an editable scene manifest into a video. Project branding is optional and supports a name, tagline, footer and local logo. No Democena watermark is added to generated projects. No account, AI model, voice or external service is involved.

From the repository root, install and build the core first, then:

```bash
npm run studio:install
npm run studio:capture
npm run studio:preview # one still per scene, plus a default preview
npm run studio:render
npm run studio:dev
```

Capture creates `studio/public/captures/forma-<take-id>.webm` and `studio/project.json`. Rendering produces `studio/output/democena.mp4` (1920 × 1080, 30 fps, silent H.264), `output/preview.png`, numbered stills in `output/scenes/`, and `output/storyboard.json` with exact output frame positions. Run these commands from the repository root; npm selects the studio working directory.

## Eight scene types

| Type | Presentation | Editable controls |
| --- | --- | --- |
| `text` | Full-screen text, entering by words or lines | Reveal mode, highlighted phrase |
| `chapter` | A numbered chapter break | Number, heading and supporting text |
| `overview` | A real recording inside an animated browser frame | Clip start and duration |
| `focus` | One element stays clear while the surroundings dim | Viewport rectangle, dim strength and zoom |
| `camera` | Smooth pan/zoom along multiple targets | Timed focus rectangles and zoom levels |
| `annotation` | A frozen recording with an animated connector and note | Freeze time, target and note placement |
| `result` | Final result, or two cropped frames before/after | Result focus, comparison times, crop and labels |
| `outro` | Closing benefit or summary with an optional call to action | Text reveal, highlight and CTA |

Each scene has its own duration and incoming `fade`, `slide` or `none` transition. Reorder the scene array to reorder the story. The same composition powers Studio preview and export, with frame-derived animations and system fonts. Optional `appearance` tokens preserve light or dark product identity, typography, surfaces, borders and radius.

The renderer currently resolves four semantic motion recipes: restrained blur/slide text, a chapter title that becomes persistent context, an evidence-linked scan and focus lock, and an outro that strips presentation layers away before the closing message. They are internal version 2 presets rather than new scene types. MCP capabilities exposes the catalog and each project timeline reports the selected recipe.

See **[the scene authoring guide](../docs/scenes.md)** for the manifest contract, examples, clock behavior and validation. The bundled capture creates nine editable scenes covering all eight types, including both the workspace and its published catalog. Shared blue tokens in `src/theme.ts` match CatalogForge’s palette; Forma uses the same colors and font stack. Existing manifests using `at` timestamps are upgraded in memory when opened; their files are not overwritten.

## Current limits

- This adapter does not yet import existing CLI scenarios automatically.
- Video markers use the first browser-presented frame timestamp as their origin. The presentation timeline is frame-based, but capture-event alignment is approximate; it is not suitable for frame-accurate click effects yet.
- Coordinates assume a fixed viewport. Recapture or update coordinates after scrolling, resizing or changing the application layout.
- Remotion Studio previews scenes and accepts JSON props; there is no custom drag-and-drop scene editor yet.
- Install the core dependencies as well: scripts use its Playwright installation and Chromium binary. FFmpeg/ffprobe must be on PATH.
- Re-running capture replaces the generated manifest, preserving its previous version under `studio/.cache/project-backups/`. Every take has a new recording filename. For an agent workflow that keeps scene edits in place, use MCP `start_capture` then `use_capture`.

Generated projects, recordings and renders remain ignored by Git. The bundled example contains synthetic data. Remotion has [its own license](https://www.remotion.dev/license).

## Agent render inputs

The MCP service calls the same renderer with isolated inputs and outputs. It snapshots the recording and any imported brand logo into the render job:

```bash
node scripts/render.mjs --project /absolute/project.json --public-dir /absolute/media --output /absolute/render-job --still
```

Omit `--still` for MP4 plus previews. Defaults remain `project.json`, `public` and `output` relative to the working directory. The renderer resolves its composition from the installed Studio checkout. Agent jobs always use fresh output directories; the legacy fixed output directory can retain old scene images between runs. See [agents](../docs/agents.md).
