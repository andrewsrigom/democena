# Architecture and direction

Democena produces silent demos: real software workflows explained by text and motion.

## Existing capture CLI

`src/` contains the scenario API, Playwright fixtures, in-page overlays, diagnostics, FFmpeg export, and stills. The package and executable are named `democena`; configuration is `democena.config.ts`.

## Optional presentation prototype

`studio/` has a separate dependency installation and lockfile. A small Playwright adapter records the synthetic example without decorative overlays and writes `project.json` plus video under `public/captures/`. A Remotion composition reads that project and renders eight scene types: text, chapter, overview, focus, camera, annotation, result/comparison, and outro. The same composition powers preview and MP4 rendering.

Recorded video remains the visual source. Focus coordinates come from the real page. Text and styling can change without replaying the application. Actions or resulting state changes require another capture.

The capture remains a single continuous video. The version 2 scene manifest separates presentation duration from source timestamps, so text cards do not advance playback and annotations/comparisons can hold actual recorded frames. Incoming transitions overlap neighboring scenes; camera paths use scene-local timestamps. Studio and export share validation and normalize older manifests in memory. See [scene authoring](scenes.md).

The adapter still records approximate event timestamps. Its initial video offset is estimated from the recording duration and capture clock; frame-perfect event timing is not claimed. Do not silently treat these approximate timestamps as ground truth for precise click effects.

## Local agent interface

`mcp/` is an optional package with its own dependency installation. It provides a stdio MCP server and a JSON CLI backed by the same project service. Both reuse the Studio manifest validator and timeline math without importing React or installing Remotion in the core CLI.

Projects live in an explicitly selected workspace. Saves check a content revision, retain the prior manifest, and replace the active manifest atomically. Media imports copy recordings into immutable names and derive metadata through ffprobe. Render jobs snapshot the manifest and media, run in a separate local process, and persist their state and artifacts. A client can disconnect and later inspect its job. The server exposes PNG previews for an agent's visual verification loop.

This is a local trusted-user tool, not a hosted service or a sandbox for hostile local processes. It rejects paths outside its workspace and symbolic links within it, and never accepts shell commands or remote media URLs. Browser capture and frame-accurate event timing remain separate work. See [agent integration](agents.md).

## Next steps

1. Extend the core scenario API with an explicit clean-capture mode and structured focus/cursor events.
2. Align event and video clocks, including navigation and loading intervals.
3. Validate the adapter on another real application and add selectable visual presets.
4. Offer a small scene editor only when real usage shows which controls are needed.

Voice narration, a hosted multi-tenant service, and a general-purpose video editor are outside the initial scope.
