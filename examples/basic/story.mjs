// Shared original story: actual recorded markers drive the presentation.
export function formaPlan(url) {
  return {
    url,
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
      transition: { type: 'slide', duration: 0.4 },
    },
  ];
}
