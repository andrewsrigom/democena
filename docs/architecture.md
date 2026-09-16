# Architecture and direction

Democena produces silent demos: real software workflows explained by text and motion.

## Existing capture CLI

`src/` contains the scenario API, Playwright fixtures, in-page overlays, diagnostics, FFmpeg export, and stills. The package and executable are named `democena`; configuration is `democena.config.ts`.

## Optional presentation prototype

`studio/` has a separate dependency installation and lockfile. A small Playwright adapter records the synthetic example without decorative overlays and writes `project.json` plus video under `public/captures/`. A Remotion composition reads that project and adds framing, text, progress and camera movement. The same composition powers preview and MP4 rendering.

Recorded video remains the visual source. Focus coordinates come from the real page. Text and styling can change without replaying the application. Actions or resulting state changes require another capture.

The prototype uses a single continuous capture and scene timestamps. Its initial video offset is estimated from the recording duration and capture clock; frame-perfect event timing is not claimed. Do not silently treat these approximate timestamps as ground truth for precise click effects.

## Next steps

1. Extend the core scenario API with an explicit clean-capture mode and structured focus/cursor events.
2. Align event and video clocks, including navigation and loading intervals.
3. Validate the adapter on another real application and add selectable visual presets.
4. Offer a small scene editor only when real usage shows which controls are needed.

Voice narration, a hosted multi-tenant service, and a general-purpose video editor are outside the initial scope.
