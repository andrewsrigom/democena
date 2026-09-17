import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareProject } from '../studio/src/timeline.js';

const root = path.resolve('examples/benchmarks');
const expectedFixtures = ['catalogforge', 'forma', 'northstar', 'relay'];

describe('visual benchmark fixtures', () => {
  it('keeps four portable projects with the required review roles', async () => {
    const directories = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual(expectedFixtures);

    for (const id of directories) {
      const fixture = JSON.parse(await readFile(path.join(root, id, 'fixture.json'), 'utf8')) as { id: string; name: string; rows: unknown[]; panelBounds: { x: number; y: number; width: number; height: number } };
      const rawProject = JSON.parse(await readFile(path.join(root, id, 'project.json'), 'utf8')) as unknown;
      const project = prepareProject(rawProject);

      expect(fixture.id).toBe(id);
      expect(fixture.name.length).toBeGreaterThan(0);
      expect(fixture.rows.length).toBeGreaterThanOrEqual(3);
      expect(project.video).toBe(`captures/${id}.mp4`);
      expect(project.scenes.map((scene) => scene.id)).toEqual(['hook', 'product', 'proof', 'close']);
      expect(project.scenes.map((scene) => scene.type)).toEqual(['text', 'overview', 'focus', 'outro']);
      expect(project.scenes.slice(1).every((scene) => (scene.transition?.duration ?? 0) > 0)).toBe(true);
      expect(project.scenes.find((scene) => scene.id === 'proof')).toMatchObject({ focus: fixture.panelBounds });
    }
  });
});
