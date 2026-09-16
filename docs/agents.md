# Democena for Codex and MCP agents

Use the agent interface to capture an authorized browser workflow, compose an editable demo and iterate from rendered evidence. It is local, optional, and independent of any model vendor. No account, API key, hosted service or upload is needed.

## Install from this checkout

From the repository root, with Node 22.12+:

```bash
npm ci --ignore-scripts
npm run mcp:install
npm run mcp:build
# Needed for previews and video rendering:
npm run studio:install
npx playwright install chromium
```

Install FFmpeg/ffprobe and Chromium's system dependencies as described in the main setup guide. Creating and editing text projects does not require the Studio installation. Importing or adopting media requires ffprobe. Browser capture needs the core Playwright installation and Chromium, but not Remotion.

The package is not published to npm. All commands below use this checkout and absolute paths. Rebuild the MCP package after updating shared scene code.

## Connect Codex

Run this from the same environment as the checkout (for example, inside its WSL distribution):

```bash
codex mcp add democena -- node /absolute/path/to/democena/mcp/dist/mcp/src/index.js --workspace /absolute/path/to/demos
```

For a Windows Codex client launching a WSL checkout, use a verified distribution and absolute Linux paths. Resolve Node with `command -v node` in that distribution and use its absolute path:

```powershell
codex mcp add democena -- wsl.exe -d Ubuntu-20.04 -- /absolute/path/to/node /home/andrews/projects/democena/mcp/dist/mcp/src/index.js --workspace /home/andrews/projects/democena/.democena-agent
```

For clients configured through JSON, the equivalent server entry is:

```json
{
  "mcpServers": {
    "democena": {
      "command": "node",
      "args": ["/absolute/path/to/democena/mcp/dist/mcp/src/index.js", "--workspace", "/absolute/path/to/demos"]
    }
  }
}
```

Launch Node directly. Do not use an npm wrapper that prints banners to the protocol's stdout. Diagnostics use stderr; stdout belongs to MCP. The client controls tool approval. This repository does not alter your Codex configuration during installation.

## Tools

| Tool | Purpose |
| --- | --- |
| `democena_capabilities` | Discover schemas, all eight scene examples and the authoring workflow. |
| `democena_list_projects` | List project IDs, titles and current revisions. |
| `democena_list_jobs` | Recover recent capture and render job IDs after reconnecting. |
| `democena_create_project` | Create a new text project without overwriting an existing ID. |
| `democena_get_project` | Read the complete editable manifest, revision, timeline and warnings. |
| `democena_save_project` | Validate and save the edited manifest with `expectedRevision`. |
| `democena_import_media` | Copy a workspace-local MP4/WebM into the project and inspect its real metadata. |
| `democena_start_capture` | Record a declarative browser plan as a background job; return measured events and mark images. |
| `democena_use_capture` | Adopt a successful take with revision protection, retaining edited scenes. |
| `democena_validate_project` | Validate scene semantics and actual recording metadata. |
| `democena_start_render` | Start an isolated background job in `preview` or `video` mode. |
| `democena_get_job` | Poll persisted job status and retrieve artifact paths or a failure reason. |
| `democena_read_preview` | Return the representative PNG, a scene's PNG or a capture marker as MCP image content. |

Read-only resources: `democena://guide` and `democena://scenes`. Tool successes include `structuredContent` and equivalent JSON text. Failures set `isError` and return an error code and message; malformed protocol arguments are rejected by the SDK.

## Suggested agent workflow

1. Read capabilities. Explore the application and agree on the outcome the demo must show.
2. Create a project with an ID such as `catalog-sharing` and a title.
3. Call `start_capture` with an authorized URL and a plan using real locators and an outcome assertion after the final state-changing action. Poll `get_job`, inspect marker images through `read_preview`, then call `use_capture` with the current project revision. If the client reconnects, use `list_jobs` to recover the job ID. It returns measured event times and focus rectangles, plus viewport and duration from the actual file. Existing recordings can instead be copied to `assets/` and passed to `import_media`.
4. Get the project, replace or extend `project.scenes`, then save the full manifest using its `expectedRevision`. The eight examples from capabilities are authoring templates, not evidence of a real application's coordinates or timestamps.
5. Validate, then start a preview render with the current revision. Poll its job ID at a reasonable interval, for example every 2–5 seconds.
6. Read and inspect relevant scene previews. Adjust copy, focus and timing based on what is visible. Validation does not prove visual quality or application correctness.
7. Start a video render. Return the resulting MP4 path and any remaining limitations.

A useful prompt for Codex:

> Use Democena to create a silent demo of the authorized collection workflow at http://127.0.0.1:4173. Explore the application, record a plan that adds a product and verifies publication, inspect its markers, then adopt the take. Start with a short text panel, show the app, focus on the relevant field, add a paused annotation, show the result and finish with a benefit. Inspect previews before rendering the final MP4. Preserve the existing project edits and report anything you cannot verify from the recording.

Source timestamps are seconds in the recording after `trimBefore`; presentation durations use a separate 30fps clock. Focus and note coordinates are measured in the recorded viewport. Camera path times are scene-local. Annotations require `freeze: true`. Do not infer successful application actions solely from an authored title.

## Browser capture plans

Start Forma separately with `node examples/basic/serve.mjs`, create a project, then pass its returned revision to `start_capture`. A minimal plan can inspect the collection without changing it:

```json
{
  "projectId": "catalog-sharing",
  "expectedRevision": "<revision from create_project or get_project>",
  "plan": {
    "url": "http://127.0.0.1:4173",
    "ready": {"testId": "product-count"},
    "redact": ["[data-testid=account]"],
    "steps": [
      {"id":"collection-visible","action":"expect","target":{"testId":"product-count"},"text":"3 products"},
      {"id":"collection","action":"mark","target":{"testId":"publish-summary"},"holdMs":1000}
    ]
  }
}
```

Actions: `click`, `fill`, `select` (option label), `press`, `scroll`, `goto`, `wait`, `expect` and `mark`. Targets use `testId`, exact `label`, a supported `role` with exact `name`, or `css`. Plans require unique step IDs and at least one `expect` of text or visibility. A plan that changes application state must also assert an outcome after its final `click`, `fill`, `select`, `press` or `goto`. `mark` produces a PNG; its ID can be passed as `sceneId` to `read_preview`. Use `capabilities` for all fields and bounds, and `examples/basic/story.mjs` for the complete Forma plan and scene composition.

The result includes action `at`/`end` seconds, measured `box` rectangles, verified assertion events, screenshot paths and the recording's clock origin. The clock starts with the first browser-presented screencast frame, but browser sampling and action scheduling still make alignment approximate. Inspect fast interactions in the MP4. A marker verifies what was visible at that point, not the correctness of an entire workflow.

`start_capture` may change real application data. Its MCP tool advertises this and an open-world interaction. Use workflows the user has authorized. `redact` selectors are installed before the initial capture and on navigation. For authenticated applications, `storageState` accepts an existing JSON file inside the workspace; the tool does not handle interactive login or password entry. Keep credentials and recordings out of Git. `allowedOrigins` adds explicit navigation destinations; the starting origin is allowed by default.

Capture alone never edits a project. On success, `use_capture` imports the take using `expectedRevision` and preserves scenes. If existing scene times or rectangles are incompatible with the new take, adoption fails: adapt the project or create a new project before retrying. Failed jobs can be inspected but never adopted.

## JSON CLI alternative

The same service is available when an agent has terminal access:

```bash
node mcp/dist/mcp/src/cli.js capabilities --workspace /absolute/path/to/demos
node mcp/dist/mcp/src/cli.js create_project --workspace /absolute/path/to/demos --input create.json
```

`create.json`:

```json
{"projectId":"catalog-sharing","title":"Share your catalog"}
```

Use tool names without the `democena_` prefix. Pass arguments in a JSON file to avoid shell escaping. Every call writes one JSON result; failures return a nonzero exit code. `read_preview` includes base64 data in CLI JSON, plus the local image path. Capture and render workers run independently after their start command exits.

## Persistence and recovery

The selected workspace contains `assets/`, `projects/<id>/` and `jobs/<id>/`. Each project retains `project.json`, old manifests under `revisions/` and imported recordings under `public/captures/`. Render jobs have a manifest and media snapshot, `job.json`, `render.log` and an isolated `output/` directory. Capture jobs store `capture-plan.json`, `job.json`, and recordings, event metadata and marker images in `output/`. Input plans may include form values, so use synthetic data when preparing public examples.

On `REVISION_CONFLICT`, read the project again and reconcile the changes. Do not blindly retry with a fresh revision. `PROJECT_BUSY` indicates another save; retry after reading the latest state. If a process crashed during a save, a `.write-lock` directory can remain: confirm no writer is running before removing that project's lock. Old revisions can be read locally and saved as a new edit; changing media still requires import.

Renders have a 20-minute timeout. Captures default to two minutes and accept a maximum of three. `list_jobs` returns recent jobs, optionally filtered by project, so a new client can recover their IDs after reconnecting. `get_job` reports completed artifacts, rendering failures, and detected worker termination. Jobs and imported media are retained; removing them is an explicit local housekeeping operation. They may contain private application data and should stay outside version control. The repository ignores `.democena-agent/` as a convenient local workspace.

## Current boundaries

- Capture supports one browser page and declarative actions; it does not automatically convert arbitrary core CLI TypeScript scenarios. Popups are closed. Cross-origin top-level HTTP(S) navigation, including redirects, must be explicitly allowed. This does not restrict ordinary subresource or API requests.
- One recording per project; output is currently 1920 × 1080 at 30fps.
- Long titles and annotation layouts still need visual inspection. Authoring warnings highlight these known limitations; the server does not claim to fix them automatically.
- Media imports accept local MP4/WebM paths inside its workspace. Browser plans accept HTTP(S) URLs; neither interface accepts arbitrary shell commands or JavaScript. Symlinks inside the workspace are rejected. Run it as a local trusted-user tool; this is not an isolation boundary against another process that can mutate the workspace.
- Multiple capture/render jobs can consume substantial CPU and storage. Agents should render previews first and avoid repeatedly launching jobs while one is already running.

The transport uses the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server). Protocol tests exercise an actual stdio client connection, not just direct function calls.

Browser regression checks (`npm run test:capture`) cover actual capture metadata, saved sessions, redaction across navigation, allowed and blocked redirects, rejected password entry and time limits. The end-to-end `node mcp/scripts/smoke.mjs` exercises capture → adoption → scene composition → preview → video through a real MCP client, including disconnects, conflicting edits and failed takes.
