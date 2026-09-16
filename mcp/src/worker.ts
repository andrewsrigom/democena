import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Workspace, atomicJson } from './storage.js';
import { idSchema } from './contracts.js';
import { captureBrowser } from '../../capture/browser.mjs';
import { capturePlanSchema } from './capture-contracts.js';
import { studioDir, type Job } from './service.js';

const [root, rawId] = process.argv.slice(2);
const jobId = idSchema.parse(rawId);
const store = await Workspace.open(root);
const dir = await store.safe(`jobs/${jobId}`);
const file = await store.safe(`jobs/${jobId}/job.json`);
let job = JSON.parse(await readFile(file, 'utf8')) as Job;
try {
  job = { ...job, status: 'running', pid: process.pid };
  await atomicJson(file, job);
  const output = path.join(dir, 'output');
  if (job.mode === 'capture') {
    const plan = capturePlanSchema.parse(
      JSON.parse(await readFile(path.join(dir, 'capture-plan.json'), 'utf8')),
    );
    const storageState = plan.storageState
      ? await store.safe(plan.storageState)
      : undefined;
    const capture = await captureBrowser(plan, output, { storageState });
    job = {
      ...job,
      status: 'succeeded',
      finishedAt: new Date().toISOString(),
      capture,
      artifacts: {
        preview: capture.preview,
        recording: capture.recording,
        events: path.join(output, 'capture.json'),
        scenes: capture.events
          .filter((e) => e.screenshot)
          .map((e) => ({ id: e.id, type: 'capture', output: e.screenshot! })),
      },
    };
  } else {
    const args = [
      path.join(studioDir, 'scripts/render.mjs'),
      '--project',
      path.join(dir, 'project.json'),
      '--public-dir',
      path.join(dir, 'public'),
      '--output',
      output,
    ];
    if (job.mode === 'preview') args.push('--still');
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      args,
      {
        cwd: studioDir,
        timeout: 20 * 60 * 1000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      },
    );
    await writeFile(path.join(dir, 'render.log'), stdout + '\n' + stderr);
    const storyboard = JSON.parse(
      await readFile(path.join(output, 'storyboard.json'), 'utf8'),
    );
    job = {
      ...job,
      status: 'succeeded',
      finishedAt: new Date().toISOString(),
      artifacts: {
        preview: path.join(output, 'preview.png'),
        storyboard: path.join(output, 'storyboard.json'),
        ...(job.mode === 'video'
          ? { video: path.join(output, 'democena.mp4') }
          : {}),
        scenes: storyboard.scenes.map(
          (s: { id: string; type: string; output: string }) => ({
            id: s.id,
            type: s.type,
            output: s.output,
          }),
        ),
      },
    };
  }
} catch (error) {
  const e = error as Error & { stdout?: string; stderr?: string };
  await writeFile(
    path.join(dir, 'render.log'),
    [e.message, e.stdout, e.stderr].filter(Boolean).join('\n'),
  ).catch(() => {});
  job = {
    ...job,
    status: 'failed',
    finishedAt: new Date().toISOString(),
    error: e.message.slice(-6000),
  };
}
await atomicJson(file, job);
