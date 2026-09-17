import { useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import type { Transition } from '../../src/model';
import { Demo } from '../../src/Demo';
import { FPS } from '../../src/timeline';
import {
  motionRecipeIds,
  motionRecipeRegistry,
  transitionPresetRegistry,
  transitionRegistry,
} from '../../src/motion-registry';
import type { MotionRecipeId, TransitionPresetId } from '../../src/motion-registry';
import { fixtureIds, fixtures } from './fixtures';
import type { FixtureId } from './fixtures';
import { catalog, previewFor } from './preview';
import type { CatalogKind, Selected } from './preview';

function initialSelection(): Selected {
  const query = new URLSearchParams(window.location.search);
  const kind = query.get('kind') as CatalogKind | null;
  const id = query.get('id');
  return catalog.some((item) => item.kind === kind && item.id === id) ? { kind: kind!, id: id! } : { kind: 'recipe', id: motionRecipeIds[0] };
}

function initialFixture(): FixtureId {
  const value = new URLSearchParams(window.location.search).get('fixture') as FixtureId | null;
  return value && fixtureIds.includes(value) ? value : 'registry';
}

function selectedItem(selection: Selected) {
  return catalog.find((item) => item.kind === selection.kind && item.id === selection.id) ?? catalog[0]!;
}

function metadataFor(selection: Selected) {
  if (selection.kind === 'recipe') return motionRecipeRegistry[selection.id as MotionRecipeId];
  if (selection.kind === 'preset') return transitionPresetRegistry[selection.id as TransitionPresetId];
  return transitionRegistry[selection.id as Transition['type']];
}

function phaseLabels(selection: Selected) {
  return selection.kind === 'recipe'
    ? motionRecipeRegistry[selection.id as MotionRecipeId].lifecycle
    : ['outgoing', 'handoff', 'incoming', 'settle'] as const;
}

export function App() {
  const [selection, setSelection] = useState<Selected>(initialSelection);
  const [fixtureId, setFixtureId] = useState<FixtureId>(initialFixture);
  const [kind, setKind] = useState<CatalogKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [frame, setFrame] = useState(0);
  const [copied, setCopied] = useState<'link' | 'config' | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const item = selectedItem(selection);
  const preview = useMemo(() => previewFor(selection, fixtures[fixtureId].project, fixtures.registry.project), [selection, fixtureId]);
  const metadata = useMemo(() => metadataFor(selection), [selection]);
  const phases = useMemo(() => phaseLabels(selection), [selection]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog.filter((entry) => (kind === 'all' || entry.kind === kind)
      && (!needle || `${entry.label} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase().includes(needle)));
  }, [kind, search]);

  useEffect(() => {
    const query = new URLSearchParams({ kind: selection.kind, id: selection.id, fixture: fixtureId });
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
    setFrame(0);
  }, [fixtureId, selection]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const update = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    player.addEventListener('frameupdate', update);
    player.addEventListener('seeked', update);
    return () => {
      player.removeEventListener('frameupdate', update);
      player.removeEventListener('seeked', update);
    };
  }, [preview]);

  async function copy(value: string, type: 'link' | 'config') {
    await navigator.clipboard.writeText(value);
    setCopied(type);
    window.setTimeout(() => setCopied((current) => current === type ? null : current), 1600);
  }

  return <div className="shell">
    <aside className="catalog-panel">
      <header className="brand-lockup"><span className="brand-mark">D</span><span><strong>Democena</strong><small>Motion Playbook</small></span></header>
      <label className="search"><span>Search catalog</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Recipe, scene, intent…" /></label>
      <div className="kind-filter" aria-label="Catalog type">
        {(['all', 'recipe', 'transition', 'preset'] as const).map((value) => <button key={value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>{value}</button>)}
      </div>
      <nav className="catalog-list" aria-label="Motion catalog">
        {filtered.map((entry) => <button key={`${entry.kind}:${entry.id}`} className={selection.kind === entry.kind && selection.id === entry.id ? 'catalog-card active' : 'catalog-card'} onClick={() => setSelection({ kind: entry.kind, id: entry.id })}>
          <span className="catalog-kind">{entry.kind}</span><strong>{entry.label}</strong><small>{entry.summary}</small>
        </button>)}
        {filtered.length === 0 ? <p className="empty">No motion entries match this filter.</p> : null}
      </nav>
    </aside>

    <main className="workspace">
      <header className="workspace-header">
        <div><span className="eyebrow">{item.kind} / shared registry</span><h1>{item.label}</h1><p>{item.summary}</p></div>
        <div className="header-actions">
          <label>Fixture<select value={fixtureId} onChange={(event) => setFixtureId(event.target.value as FixtureId)}>{fixtureIds.map((id) => <option key={id} value={id}>{fixtures[id].label}</option>)}</select></label>
          <button onClick={() => copy(window.location.href, 'link')}>{copied === 'link' ? 'Link copied' : 'Copy deep link'}</button>
        </div>
      </header>

      <section className="player-card" aria-label="Motion preview">
        <div className="player-toolbar"><span>{preview.title}</span><span>{preview.durationInFrames} frames · {FPS} fps</span></div>
        <div className="player-stage">
          <Player key={`${selection.kind}:${selection.id}:${fixtureId}`} ref={playerRef} component={Demo} inputProps={preview.project}
            durationInFrames={preview.durationInFrames} compositionWidth={1920} compositionHeight={1080} fps={FPS}
            controls loop acknowledgeRemotionLicense style={{ width: '100%', aspectRatio: '16 / 9' }} />
        </div>
        <div className="scrubber"><span>{String(frame).padStart(3, '0')}</span><input aria-label="Preview frame" type="range" min={0} max={preview.durationInFrames - 1} value={Math.min(frame, preview.durationInFrames - 1)} onChange={(event) => playerRef.current?.seekTo(Number(event.target.value))} /><span>{preview.durationInFrames - 1}</span></div>
        <div className="lifecycle" aria-label="Motion lifecycle">{phases.map((phase, index) => <div key={phase}><i style={{ opacity: .35 + index * .2 }}></i><span>{phase}</span></div>)}</div>
      </section>

      <section className="detail-grid">
        <article className="metadata-card"><header><div><span className="eyebrow">Inspect</span><h2>Registry metadata</h2></div><button onClick={() => copy(JSON.stringify(metadata, null, 2), 'config')}>{copied === 'config' ? 'Copied' : 'Copy JSON'}</button></header><dl>{Object.entries(metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl></article>
        <article className="compatibility-card"><span className="eyebrow">Fixture</span><h2>{fixtures[fixtureId].label}</h2><p>Shared Studio composition, generated local product surface, and deterministic frame controls.</p><div className="badge-row">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><p className="local-note">Local only · silent · no upload</p></article>
      </section>
    </main>
  </div>;
}
