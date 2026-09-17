import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { startExample } from '../../examples/basic/app.mjs';
import { formaPlan, formaScenes } from '../../examples/basic/story.mjs';
import { captureBrowser } from '../../capture/browser.mjs';

const app = await startExample();
try {
  const take = `forma-${randomUUID()}`;
  const output = path.resolve('.cache', take);
  const capture = await captureBrowser(formaPlan(app.url), output);
  const sourceDuration = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        capture.recording,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  await mkdir('public/captures', { recursive: true });
  const video = `captures/${take}.webm`;
  await copyFile(capture.recording, path.join('public', video));
  const project = {
    version: 2,
    title: 'Forma — The spring edit',
    accent: '#215acb',
    branding: {
      name: 'Forma',
      tagline: 'COLLECTIONS, IN MOTION',
      footer: 'YOUR COLLECTION, READY TO SHARE',
    },
    appearance: {
      surfaceMode: 'light',
    },
    video,
    sourceDuration,
    trimBefore: 0,
    viewport: capture.viewport,
    scenes: formaScenes(capture),
  };
  // Preserve earlier presentation edits when refreshing the bundled example.
  await mkdir('.cache/project-backups', { recursive: true });
  await copyFile('project.json', `.cache/project-backups/${take}.json`).catch(
    (e) => {
      if (e.code !== 'ENOENT') throw e;
    },
  );
  await writeFile('project.json', JSON.stringify(project, null, 2) + '\n');
  console.log(
    `Captured Forma: ${sourceDuration.toFixed(1)}s, ${capture.events.length} actions/markers, ${project.scenes.length} scenes.`,
  );
} finally {
  await app.close();
}
