import catalogforge from '../../../examples/benchmarks/catalogforge/project.json';
import forma from '../../../examples/benchmarks/forma/project.json';
import northstar from '../../../examples/benchmarks/northstar/project.json';
import relay from '../../../examples/benchmarks/relay/project.json';
import registry from '../../../examples/motion-registry/project.json';

export const fixtureIds = ['registry', 'forma', 'catalogforge', 'northstar', 'relay'] as const;
export type FixtureId = (typeof fixtureIds)[number];
export const fixtures = {
  registry: { label: 'Registry', project: registry },
  forma: { label: 'Forma', project: forma },
  catalogforge: { label: 'CatalogForge', project: catalogforge },
  northstar: { label: 'Northstar', project: northstar },
  relay: { label: 'Relay', project: relay },
} as const;
