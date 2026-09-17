// Shared original story: actual recorded markers drive the presentation.
export function formaPlan(url) {
  return {
    url,
    buildIdentity: 'forma-fixture-v1',
    viewport: { width: 1280, height: 800 },
    ready: { testId: 'product-count' },
    redact: ['[data-testid="account"]'],
    typingDelayMs: 55,
    steps: [
      {
        id: 'initial-state',
        action: 'expect',
        target: { testId: 'product-count' },
        text: '3 products',
      },
      {
        id: 'draft',
        action: 'mark',
        target: { testId: 'publish-summary' },
        holdMs: 1000,
      },
      {
        id: 'open-form',
        action: 'click',
        target: { role: 'button', name: 'New product' },
      },
      {
        id: 'name-field',
        action: 'mark',
        target: { label: 'Product name' },
        holdMs: 700,
      },
      {
        id: 'name',
        action: 'fill',
        target: { label: 'Product name' },
        value: 'Arc table lamp',
      },
      {
        id: 'price',
        action: 'fill',
        target: { label: 'Price ($)' },
        value: '129',
      },
      {
        id: 'description',
        action: 'fill',
        target: { label: 'Short description' },
        value: 'Warm light. A softer workspace.',
      },
      {
        id: 'save',
        action: 'click',
        target: { role: 'button', name: 'Save product' },
        holdMs: 700,
      },
      {
        id: 'product-added',
        action: 'expect',
        target: { testId: 'product-count' },
        text: '4 products',
      },
      {
        id: 'publish',
        action: 'click',
        target: { role: 'button', name: 'Publish collection' },
      },
      {
        id: 'published-state',
        action: 'expect',
        target: { testId: 'collection-status' },
        text: 'Published',
        holdMs: 800,
      },
      {
        id: 'published',
        action: 'mark',
        target: { testId: 'publish-summary' },
        holdMs: 1200,
      },
      { id: 'open-catalog', action: 'click', target: { css: '#open-catalog' } },
      {
        id: 'public-result',
        action: 'expect',
        target: { role: 'heading', name: 'Arc table lamp' },
      },
      { id: 'public-catalog', action: 'mark', holdMs: 1500 },
    ],
  };
}
export function formaScenes(capture) {
  const event = (id) => {
    const e = capture.events.find((e) => e.id === id);
    if (!e) throw new Error(`Missing captured marker: ${id}`);
    return e;
  };
  const draft = event('draft'),
    name = event('name-field'),
    price = event('price'),
    save = event('save'),
    publish = event('publish'),
    published = event('published'),
    catalog = event('public-catalog');
  const base = (id, type, duration, eyebrow, title, body) => ({
    id,
    type,
    duration,
    eyebrow,
    title,
    body,
  });
  const freeze = (e) => ({ from: e.at + 0.1, freeze: true });
  return [
    {
      ...base(
        'opening',
        'text',
        4.5,
        'A collection starts with an idea',
        'Good products.\nA story to share.',
        'Bring your collection into focus.',
      ),
      reveal: 'words',
      highlight: 'story',
    },
    {
      ...base(
        'chapter',
        'chapter',
        3.5,
        'Make room for something new',
        'Build your\nnext collection.',
        'Meet Forma. An original Democena example.',
      ),
      number: '01',
      transition: { type: 'slide', duration: 0.4 },
    },
    {
      ...base(
        'overview',
        'overview',
        4,
        'The workspace',
        'Everything,\nin one place.',
        'A clear view of your collection.',
      ),
      source: freeze(draft),
    },
    {
      ...base(
        'focus',
        'focus',
        4,
        'Start with the details',
        'Give it\na name.',
        'Focus on the field that starts the story.',
      ),
      source: freeze(name),
      focus: name.box,
      dim: 0.35,
      zoom: 1.35,
    },
    {
      ...base(
        'camera',
        'camera',
        published.at - name.at + 0.35,
        'Follow the workflow',
        'Create. Save.\nPublish.',
        'Real actions, captured from the application.',
      ),
      source: { from: name.at },
      path: [
        { at: 0, focus: name.box, zoom: 1.25 },
        { at: Math.max(0.5, price.at - name.at), focus: price.box, zoom: 1.35 },
        {
          at: Math.max(price.at - name.at + 0.2, save.at - name.at - 0.3),
          focus: save.box,
          zoom: 1.25,
        },
        { at: publish.at - name.at - 0.1, focus: published.box, zoom: 1.1 },
      ],
    },
    {
      ...base(
        'annotation',
        'annotation',
        5.5,
        'A moment to explain',
        'One link.\nEvery product.',
        'Pause on the result that matters.',
      ),
      source: freeze(published),
      focus: published.box,
      note: {
        text: 'All four products are now available in one shareable catalog.',
        x: 640,
        y: 410,
        width: 520,
      },
    },
    {
      ...base(
        'comparison',
        'result',
        5,
        'See what changed',
        'From draft\nto published.',
        'The same collection. Ready for its audience.',
      ),
      source: freeze(published),
      comparison: {
        before: draft.at + 0.1,
        after: published.at + 0.1,
        crop: draft.box,
        beforeLabel: 'BEFORE · A COLLECTION IN PROGRESS',
        afterLabel: 'AFTER · READY TO SHARE',
      },
    },
    {
      ...base(
        'public-catalog',
        'overview',
        4,
        'The finished experience',
        'A place for\ngood things.',
        'Open the link. Explore the collection.',
      ),
      source: freeze(catalog),
      presentation: { layout: 'full-bleed', caption: 'top-right' },
      transition: { type: 'slide-up', duration: 0.55 },
    },
    {
      ...base(
        'closing',
        'outro',
        4.5,
        'Created with Forma. Told with Democena.',
        'Your collection.\nReady to share.',
        'A real workflow, made clear through motion.',
      ),
      reveal: 'lines',
      highlight: 'Ready to share.',
      cta: 'Make the next step clear',
      transition: { type: 'slide-down', duration: 0.45 },
    },
  ];
}

export function formaLaunchDirection(capture, media) {
  const event = (id) => {
    const value = capture.events.find((item) => item.id === id);
    if (!value) throw new Error(`Missing captured marker: ${id}`);
    return value;
  };
  const draft = event('draft');
  const name = event('name-field');
  const result = event('public-result');
  const at = (value) => value.at + 0.1;
  const authored = (claim) => [{ kind: 'authored-copy', claim }];
  const captured = (value, verified = false, rect) => [{ kind: 'capture', timestamp: at(value), markId: value.id, verified, ...(rect ? { rect } : {}) }];
  const scene = (narrativeRole, reason, value, evidence, transitionPreset = 'soft-crossfade') => ({ narrativeRole, reason, expectedSettledAt: 2, evidence, transitionPreset, scene: value });
  return {
    version: 1,
    status: 'reviewed',
    executionMode: 'autonomous',
    profile: 'launch',
    tone: 'polished',
    format: 'landscape-1080p',
    locale: 'en',
    audience: 'Independent catalog teams',
    primaryMessage: 'A collection can move from draft to a shareable result in one clear flow.',
    visualDirection: 'Use concise CatalogForge-inspired typography, restrained motion and real Forma product states.',
    brandSource: 'project',
    authorizedTarget: media.initialRoute,
    facts: ['The capture verifies a fourth product and a public catalog result.'],
    exclusions: ['No narration or synthetic click effects.'],
    privacy: ['Use only the synthetic Forma records.'],
    reviewedBy: 'director',
    reviewedAt: new Date(0).toISOString(),
    captureFingerprint: media.captureFingerprint,
    capture: {
      recordingDigest: media.recordingDigest,
      planDigest: media.planDigest,
      viewport: media.viewport,
      devicePixelRatio: media.devicePixelRatio,
      initialRoute: media.initialRoute,
      buildIdentity: media.buildIdentity,
      events: media.events,
    },
    poster: { sceneId: 'verified-result', sceneLocalTime: 2 },
    scenes: [
      scene('hook', 'Lead with the outcome.', { id: 'launch-hook', type: 'text', duration: 5.2, eyebrow: 'From idea to audience', title: 'A collection,\nready to share.', body: 'One clear flow from draft to published.', reveal: 'words', highlight: 'ready to share.' }, authored('State the approved product benefit.'), 'hard-cut'),
      scene('product-reveal', 'Reveal the real starting state.', { id: 'product-reveal', type: 'overview', duration: 5.2, eyebrow: 'Start with the collection', title: 'Everything,\nin one place.', body: 'See the real workspace before the change.', source: { from: at(draft), freeze: true } }, captured(draft)),
      scene('product-moment', 'Focus on the field that begins the workflow.', { id: 'product-moment', type: 'focus', duration: 5.2, eyebrow: 'Add the detail', title: 'Give it\na name.', body: 'Guide attention without hiding the product.', source: { from: at(name), freeze: true }, focus: name.box, dim: 0.35, zoom: 1.35 }, captured(name, false, name.box), 'restrained-zoom'),
      scene('verified-result', 'Show the assertion-backed public result.', { id: 'verified-result', type: 'overview', duration: 5.2, eyebrow: 'Published', title: 'The result\nis live.', body: 'The captured application confirms the outcome.', source: { from: at(result), freeze: true }, presentation: { layout: 'full-bleed', caption: 'bottom-left' } }, captured(result, true), 'rise-cover'),
      scene('closing', 'Close on the audience benefit.', { id: 'launch-closing', type: 'outro', duration: 5.2, eyebrow: 'Forma', title: 'Ready for\nwhat comes next.', body: 'A catalog with a clear next step.', reveal: 'lines', highlight: 'Ready' }, authored('Restate the approved benefit.'), 'drop-cover'),
    ],
  };
}
