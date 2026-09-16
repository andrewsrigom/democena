# Democena · motion prototype

A small, optional presentation layer. It captures the bundled synthetic Parcel Desk application with Playwright, uses the compact layout in `fixture/index.html`, writes an editable JSON timeline, and renders the recording with Remotion. No account, AI model, voice or external service is involved.

From the repository root, install and build the core first, then:

```bash
npm run studio:install
npm run studio:capture
npm run studio:preview # quick still preview
npm run studio:render
npm run studio:dev
```

The first capture creates `public/captures/parcel.webm` and `project.json` inside this directory. The render command also produces `output/preview.png` and `output/democena.mp4` (1920 × 1080, 30 fps, silent H.264). Run commands from the root as shown; the npm scripts set the studio working directory.

Edit `project.json` to change the title, accent, scene text or focus rectangles. Rectangles use original viewport pixels. Scenes must have increasing `at` values (seconds in the capture), starting at 0 and ending before `duration`. Rendering checks this contract. Re-running capture replaces the generated project and recording; copy your edited manifest before doing so.

The visual layer provides an animated browser frame, three scene captions, subtle pan/zoom, a highlight rectangle, and a progress indicator. Animation is derived from frame numbers so preview and export use the same composition. System fonts avoid external network requests.

## Current limits

- This is an example adapter, not automatic import of arbitrary Demotale/Democena scenarios.
- Capture uses wall-clock scene markers and estimates the leading video offset from the final media duration. This is suitable for a prototype; frame-accurate event synchronization is future work.
- Focus assumes a fixed viewport. There is no responsive reflow or cursor-path interpolation yet.
- Remotion Studio previews the composition; this repository does not yet provide a custom drag-and-drop editor.
- Install the core dependencies as well: the scripts use its Playwright installation and Chromium binary. FFmpeg/ffprobe must be on PATH.

Generated projects, raw captures and renders are ignored by Git. Only the bundled synthetic example is safe to publish without additional review. Remotion has [its own license](https://www.remotion.dev/license).
