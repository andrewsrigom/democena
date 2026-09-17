# Architecture and direction

Democena produces silent demos: real software workflows explained by text and motion.

## Existing capture CLI

`src/` contains the scenario API, Playwright fixtures, in-page overlays, diagnostics, FFmpeg export, and stills. The package and executable are named `democena`; configuration is `democena.config.ts`.

## Optional presentation prototype

`studio/` has a separate dependency installation and lockfile. A shared Playwright engine in `capture/` records declarative action plans without decorative overlays. The Studio adapter uses the original Forma app and shared story in `examples/basic/` and writes `project.json` plus a uniquely named video under `public/captures/`. A Remotion composition reads that project and renders eight scene types: text, chapter, overview, focus, camera, annotation, result/comparison, and outro. The same composition powers preview and MP4 rendering.

Recorded video remains the visual source. Focus coordinates come from the real page. Text and styling can change without replaying the application. Actions or resulting state changes require another capture.

The capture remains a single continuous video. The version 2 scene manifest separates presentation duration from source timestamps, so text cards do not advance playback and annotations/comparisons can hold actual recorded frames. Incoming transitions overlap neighboring scenes; camera paths use scene-local timestamps. Studio and export share validation and normalize older manifests in memory. See [scene authoring](scenes.md).

The capture clock starts at the timestamp of the first browser-presented screencast frame. Events and marker images include measured viewport rectangles. Frame sampling and action scheduling still make alignment approximate; frame-perfect timing is not claimed. Do not silently treat these approximate timestamps as ground truth for precise click effects.

## Local agent interface

`mcp/` is an optional package with its own dependency installation. It provides a stdio MCP server and a JSON CLI backed by the same project service. Both reuse the Studio manifest validator and timeline math without importing React or installing Remotion in the core CLI.

Projects live in an explicitly selected workspace. Saves check a content revision, retain the prior manifest, and replace the active manifest atomically. Media imports copy recordings into immutable names and derive metadata through ffprobe. Branding is project-owned and optional; logo imports validate local PNG/JPEG/WebP files and store immutable copies. Render jobs snapshot the manifest, recording and logo, run in a separate local process, and persist their state and artifacts. A client can disconnect and later inspect its job. The server exposes PNG scene and transition frames plus JPEG contact sheets and posters for an agent's visual verification loop. Capture jobs run the shared browser engine in a separate process, persist the plan, recording, measured events and marker screenshots, and require explicit adoption with `use_capture`. A failed take never replaces the project. Existing scene edits survive adoption; incompatible timing or viewport bounds are rejected.

## Director layer

`direction/direction.json` is the canonical editorial plan; generated `BRIEF.md` and `STORYBOARD.md` are review views. It has an independent revision and records profile, tone, execution mode, capture fingerprint, evidence, review provenance, poster selection and scene intent. `project.json` remains the only render contract. Compilation checks both revisions and capture evidence, then links the direction to the resulting project revision. A later direct manifest edit is reported as divergence rather than silently overwritten.

The `launch` compiler uses the existing version 2 scene grammar and Remotion renderer. It enforces a 15–25 second story with a hook, real product moment, verified result and closing. A successful capture can be explicitly reused by another tour or launch project; each receives an immutable local media copy with the same evidence fingerprint. Scene packets bind isolated work to exact direction, project and capture revisions; merged drafts return to `draft` for review. Matching nonterminal jobs are resumed by normalized input digest.

Preview jobs create settled scene frames, three inspection frames around each overlapping transition, a contact sheet, selected poster and `quality.json`. Final renders verify H.264 yuv420p, 1920×1080 at 30fps and no audio stream. Automated checks cover authored copy and configured colors; text inside recorded screenshots remains a visual-review responsibility.

This is a local trusted-user tool, not a hosted service or a sandbox for hostile local processes. It rejects paths outside its workspace and symbolic links within it, and never accepts shell commands or remote media imports. Browser plans accept authorized HTTP(S) URLs and a bounded set of actions. They require at least one assertion, close popups, restrict top-level navigation to allowed origins and can load an existing workspace-local authentication state. This is a single-page capture workflow, not arbitrary TypeScript scenario execution. See [agent integration](agents.md).

## Next steps

1. Extend the core scenario API with an explicit clean-capture mode and structured focus/cursor events.
2. Measure residual event/video drift across browsers and navigation intervals before offering precise click effects.
3. Validate the declarative capture plans and the curated motion vocabulary on more real applications before making recipes explicitly selectable in project data.
4. Offer a small scene editor only when real usage shows which controls are needed.

Voice narration, a hosted multi-tenant service, and a general-purpose video editor are outside the initial scope.
