import { capturePlanSchema } from './capture-contracts.js';
import { z } from 'zod';
import { prepareProject, buildTimeline, FPS } from '../../studio/src/timeline.js';

const rect = z.strictObject({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() });
const source = z.strictObject({ from: z.number().nonnegative().describe('Seconds in the recording after trimBefore; independent of presentation time.'), freeze: z.boolean().optional() });
const transition = z.strictObject({ type: z.enum(['fade', 'slide', 'none']), duration: z.number().nonnegative() });
const base = { id: z.string().min(1), duration: z.number().positive().max(600), eyebrow: z.string(), title: z.string(), body: z.string(), transition: transition.optional() };
const text = { reveal: z.enum(['words', 'lines']).optional(), highlight: z.string().optional() };
export const sceneSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, ...text, type: z.literal('text') }),
  z.strictObject({ ...base, type: z.literal('chapter'), number: z.string() }),
  z.strictObject({ ...base, type: z.literal('overview'), source }),
  z.strictObject({ ...base, type: z.literal('focus'), source, focus: rect, dim: z.number().min(0).max(0.85).optional(), zoom: z.number().min(1).max(3).optional() }),
  z.strictObject({ ...base, type: z.literal('camera'), source, path: z.array(z.strictObject({ at: z.number().nonnegative(), focus: rect.optional(), zoom: z.number().min(1).max(3).optional() })).min(2) }),
  z.strictObject({ ...base, type: z.literal('annotation'), source: source.extend({ freeze: z.literal(true) }), focus: rect, note: z.strictObject({ text: z.string(), x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive() }) }),
  z.strictObject({ ...base, type: z.literal('result'), source, focus: rect.optional(), comparison: z.strictObject({ before: z.number().nonnegative(), after: z.number().nonnegative(), crop: rect, beforeLabel: z.string(), afterLabel: z.string() }).optional() }),
  z.strictObject({ ...base, ...text, type: z.literal('outro'), cta: z.string().optional() }),
]);
export const projectSchema = z.strictObject({ version: z.literal(2), title: z.string(), accent: z.string().regex(/^#[\da-f]{6}$/i), video: z.string(), sourceDuration: z.number().nonnegative(), trimBefore: z.number().nonnegative(), viewport: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }), scenes: z.array(sceneSchema).min(1).max(100) });
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).describe('Workspace-local identifier, never a path.');
const revision = z.string().regex(/^[a-f0-9]{64}$/).describe('Revision returned by get/create/save; prevents overwriting another edit.');
export const inputs = {
  capabilities: z.strictObject({}),
  list_projects: z.strictObject({}),
  list_jobs: z.strictObject({ projectId: idSchema.optional(), limit: z.number().int().min(1).max(100).default(20) }),
  create_project: z.strictObject({ projectId: idSchema, title: z.string().min(1), accent: z.string().regex(/^#[\da-f]{6}$/i).default('#215acb') }),
  get_project: z.strictObject({ projectId: idSchema }),
  save_project: z.strictObject({ projectId: idSchema, expectedRevision: revision, project: projectSchema }),
  import_media: z.strictObject({ projectId: idSchema, expectedRevision: revision, source: z.string().min(1).describe('Existing video path relative to the configured workspace. No URLs or paths outside it.') }),
  start_capture: z.strictObject({ projectId: idSchema, expectedRevision: revision, plan: capturePlanSchema }),
  use_capture: z.strictObject({ projectId: idSchema, expectedRevision: revision, jobId: idSchema }),
  validate_project: z.strictObject({ projectId: idSchema }),
  start_render: z.strictObject({ projectId: idSchema, expectedRevision: revision, mode: z.enum(['preview', 'video']).default('preview') }),
  get_job: z.strictObject({ jobId: idSchema }),
  read_preview: z.strictObject({ jobId: idSchema, sceneId: z.string().optional().describe('Omit for the representative preview. Use a scene ID for its still, or a capture mark ID for its screenshot.') }),
};
export type Operation = keyof typeof inputs;
export const descriptions: Record<Operation, string> = {
  capabilities: 'Discover all eight scene examples, JSON schemas, workflow, coordinate conventions and current limitations.',
  list_projects: 'List saved Democena projects in the configured workspace.',
  list_jobs: 'List recent capture and render jobs so an agent can recover their IDs after reconnecting.',
  create_project: 'Create a new project with a text opening. Existing projects are never replaced.',
  get_project: 'Read the editable project, revision, timeline and authoring warnings.',
  save_project: 'Validate and atomically save the full edited manifest using optimistic concurrency. Previous revisions are preserved.',
  import_media: 'Probe and copy an existing local recording into a project, deriving duration and viewport from real media. Does not record a browser.',
  start_capture: 'Record an authorized HTTP(S) application with declarative browser actions, assertions and markers. May change application data. Returns a background capture job; poll get_job.',
  use_capture: 'Attach a successful capture to its project with revision protection. Returns real event timestamps, focus rectangles and the updated manifest; does not replace edited scenes.',
  validate_project: 'Validate scene timing, focus bounds and the actual imported recording before rendering. Returns actionable warnings.',
  start_render: 'Start a background preview or MP4 render from an immutable project snapshot. Returns immediately; poll get_job.',
  get_job: 'Read persisted capture/render status and artifact paths. Jobs survive an MCP client disconnect.',
  read_preview: 'Return a capture marker or rendered PNG for visual inspection. Inspect previews before claiming a demo is correct.',
};
export class AgentError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function errorResult(error: unknown) {
  return { ok: false, error: { code: error instanceof AgentError ? error.code : error instanceof z.ZodError ? 'INVALID_ARGUMENTS' : 'OPERATION_FAILED', message: error instanceof Error ? error.message : String(error) } };
}
export function validate(value: unknown) {
  try { return prepareProject(projectSchema.parse(value)); }
  catch (error) { throw new AgentError('INVALID_PROJECT', error instanceof Error ? error.message : String(error)); }
}
export function describeProject(value: unknown) {
  const project = validate(value);
  const timeline = buildTimeline(project.scenes, FPS);
  const warnings: { sceneId: string; code: string; message: string }[] = [];
  for (const s of project.scenes) {
    if ((s.title.length + s.body.length) / 15 > s.duration) warnings.push({ sceneId: s.id, code: 'READING_TIME', message: 'Allow more reading time or shorten the copy; the estimate is 15 characters per second.' });
    if (s.title.length > 70 || ('highlight' in s && (s.highlight?.length ?? 0) > 30)) warnings.push({ sceneId: s.id, code: 'TEXT_LAYOUT', message: 'Long titles or highlights may overflow. Inspect the preview and shorten or split the copy.' });
    if (s.type === 'annotation') warnings.push({ sceneId: s.id, code: 'ANNOTATION_LAYOUT', message: 'Annotation height depends on text; bounds validation alone cannot guarantee it fits. Inspect the preview.' });
  }
  return { project, fps: FPS, durationInFrames: timeline.at(-1)!.end, timeline: timeline.map(({ scene, ...timing }) => ({ id: scene.id, type: scene.type, ...timing })), warnings };
}
export const guide = `Democena agent workflow:
1. Discover capabilities. Explore the real application before scripting its actions.
2. Create a project. For app scenes, start_capture with an authorized URL and a plan that asserts the outcome after its final state-changing action, poll get_job, inspect mark images with read_preview, then use_capture. Use list_jobs to recover a job ID after reconnecting. You may also import_media from the workspace. Never invent screenshots, outcomes, focus coordinates, or source timestamps.
3. get_project, edit the manifest, and save_project with the returned expectedRevision. On REVISION_CONFLICT, read again and reconcile the changes; do not blindly retry with the new revision.
4. Source timestamps and focus/note coordinates are in the recording's viewport. Presentation durations and transitions use a separate 30fps clock. Annotations freeze the recording. Camera path times are scene-local.
5. validate_project, start_render in preview mode, poll get_job, then read_preview for visual inspection. Fix clipping, unreadable copy and inaccurate focus before rendering video.
6. Return artifact paths and observed limitations. Do not claim an application outcome without checking it.
The server captures one browser page through declarative actions and edits/renders recordings. Capture can change real application data: use only authorized workflows. Existing arbitrary TypeScript scenarios are not automatically converted. Media files and prior revisions are preserved. Jobs run locally, no upload or external model is used. Rendering needs the optional Studio installation, Chromium and ffprobe.\n`;
export function capabilities() {
  const base = { id: 'example', duration: 4, eyebrow: '', title: 'Show the outcome', body: '', transition: { type: 'fade', duration: 0.4 } };
  const focus = { x: 300, y: 200, width: 400, height: 150 };
  const source = { from: 0, freeze: true };
  const examples = [
    { ...base, type: 'text', reveal: 'words', highlight: 'outcome' },
    { ...base, type: 'chapter', number: '01' },
    { ...base, type: 'overview', source },
    { ...base, type: 'focus', source, focus, dim: 0.4, zoom: 1.3 },
    { ...base, type: 'camera', source, path: [{ at: 0 }, { at: 2, focus, zoom: 1.4 }] },
    { ...base, type: 'annotation', source, focus, note: { text: 'Review this result', x: 750, y: 250, width: 350 } },
    { ...base, type: 'result', source, comparison: { before: 0, after: 2, crop: focus, beforeLabel: 'Before', afterLabel: 'After' } },
    { ...base, type: 'outro', cta: 'Share your result', reveal: 'lines' },
  ];
  return { guide, projectSchema: z.toJSONSchema(projectSchema), examples, tools: Object.fromEntries(Object.entries(inputs).map(([name, schema]) => [name, { description: descriptions[name as Operation], inputSchema: z.toJSONSchema(schema) }])) };
}
