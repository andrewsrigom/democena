# Democena for Codex and MCP agents

Use the agent interface to turn an existing recording into an editable demo and iterate from rendered evidence. It is local, optional, and independent of any model vendor. No account, API key, hosted service or upload is needed.

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

Install FFmpeg/ffprobe and Chromium's system dependencies as described in the main setup guide. Creating and editing text projects does not require the Studio installation. Importing media requires ffprobe.

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
| `democena_create_project` | Create a new text project without overwriting an existing ID. |
| `democena_get_project` | Read the complete editable manifest, revision, timeline and warnings. |
| `democena_save_project` | Validate and save the edited manifest with `expectedRevision`. |
| `democena_import_media` | Copy a workspace-local MP4/WebM into the project and inspect its real metadata. |
| `democena_validate_project` | Validate scene semantics and actual recording metadata. |
| `democena_start_render` | Start an isolated background job in `preview` or `video` mode. |
| `democena_get_job` | Poll persisted job status and retrieve artifact paths or a failure reason. |
| `democena_read_preview` | Return the representative PNG or a scene's PNG as MCP image content. |

Read-only resources: `democena://guide` and `democena://scenes`. Tool successes include `structuredContent` and equivalent JSON text. Failures set `isError` and return an error code and message; malformed protocol arguments are rejected by the SDK.

## Suggested agent workflow

1. Read capabilities. Explore the application and agree on the outcome the demo must show.
2. Create a project with an ID such as `catalog-sharing` and a title.
3. Obtain an authorized recording through the existing capture workflow or another recording tool. Copy it into the selected workspace, such as `assets/catalog.webm`. Import it with the current project revision. The returned viewport and duration come from the actual file.
4. Get the project, replace or extend `project.scenes`, then save the full manifest using its `expectedRevision`. The eight examples from capabilities are authoring templates, not evidence of a real application's coordinates or timestamps.
5. Validate, then start a preview render with the current revision. Poll its job ID at a reasonable interval, for example every 2–5 seconds.
6. Read and inspect relevant scene previews. Adjust copy, focus and timing based on what is visible. Validation does not prove visual quality or application correctness.
7. Start a video render. Return the resulting MP4 path and any remaining limitations.

A useful prompt for Codex:

> Use Democena to create a silent demo from the recording in assets/catalog.webm. Start with a short text panel, show the app, focus on the relevant field, add a paused annotation, show the result and finish with a benefit. Inspect previews before rendering the final MP4. Preserve the existing project edits and report anything you cannot verify from the recording.

Source timestamps are seconds in the recording after `trimBefore`; presentation durations use a separate 30fps clock. Focus and note coordinates are measured in the recorded viewport. Camera path times are scene-local. Annotations require `freeze: true`. Do not infer successful application actions solely from an authored title.

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

Use tool names without the `democena_` prefix. Pass arguments in a JSON file to avoid shell escaping. Every call writes one JSON result; failures return a nonzero exit code. `read_preview` includes base64 data in CLI JSON, plus the local image path. Render workers run independently after `start_render` exits.

## Persistence and recovery

The selected workspace contains `assets/`, `projects/<id>/` and `jobs/<id>/`. Each project retains `project.json`, old manifests under `revisions/` and imported recordings under `public/captures/`. Each job has a manifest and media snapshot, `job.json`, `render.log` and an isolated `output/` directory.

On `REVISION_CONFLICT`, read the project again and reconcile the changes. Do not blindly retry with a fresh revision. `PROJECT_BUSY` indicates another save; retry after reading the latest state. If a process crashed during a save, a `.write-lock` directory can remain: confirm no writer is running before removing that project's lock. Old revisions can be read locally and saved as a new edit; changing media still requires import.

Jobs have a 20-minute render timeout. `get_job` reports completed artifacts, rendering failures, and detected worker termination. Jobs and imported media are retained; removing them is an explicit local housekeeping operation. They may contain private application data and should stay outside version control. The repository ignores `.democena-agent/` as a convenient local workspace.

## Current boundaries

- The MCP server edits and renders existing recordings. It does not yet drive arbitrary browser capture or automatically convert every core CLI scenario to a clean recording.
- One recording per project; output is currently 1920 × 1080 at 30fps.
- Long titles and annotation layouts still need visual inspection. Authoring warnings highlight these known limitations; the server does not claim to fix them automatically.
- It accepts local MP4/WebM paths inside its workspace, not URLs or arbitrary shell commands. Symlinks inside the workspace are rejected. Run it as a local trusted-user tool; this is not an isolation boundary against another process that can mutate the workspace.
- Multiple render jobs can consume substantial CPU and storage. Agents should render previews first and avoid repeatedly launching jobs while one is already running.

The transport uses the [official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server). Protocol tests exercise an actual stdio client connection, not just direct function calls.
