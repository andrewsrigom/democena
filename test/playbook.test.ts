import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalog, previewFor, sceneForRecipe } from '../studio/playbook/src/preview.js';

const fixtureIds = ['registry', 'forma', 'catalogforge', 'northstar', 'relay'] as const;
function projectFixture(id: (typeof fixtureIds)[number]) {
  const relative = id === 'registry' ? 'examples/motion-registry/project.json' : `examples/benchmarks/${id}/project.json`;
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')) as unknown;
}
const registry = projectFixture('registry');

describe('Motion Playbook previews', () => {
  it('uses each selected fixture media for every catalog entry', () => {
    for (const fixtureId of fixtureIds) {
      const fixture = projectFixture(fixtureId);
      for (const entry of catalog) {
        const preview = previewFor({ kind: entry.kind, id: entry.id }, fixture, registry);
        expect(preview.project.video).toBe((fixture as { video: string }).video);
        expect(preview.durationInFrames).toBeGreaterThan(0);
      }
    }
  });

  it('demonstrates the standard recipe with its baseline overview implementation', () => {
    for (const fixtureId of fixtureIds) {
      const { scene } = sceneForRecipe('standard-scene-motion', projectFixture(fixtureId), registry);
      expect(scene.type).toBe('overview');
    }
  });
});
