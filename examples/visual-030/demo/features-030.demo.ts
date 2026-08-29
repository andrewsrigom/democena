import { test, expect } from '@pesuto/demotale';

/**
 * Visual review scenario for demotale 0.3.0.
 *
 * Run from the repo root: npm run visual-030
 * Then open the artefacts listed in examples/visual-030/README.md.
 */
test('0.3.0 visual review', async ({ page, demo }) => {
  await demo.card('demotale 0.3.0', 'Visual review: video, gif, images, caption flip');
  await page.goto('/');
  await demo.hideCard();

  await demo.note('Made-up page. Outputs are for eyeballing, not for shipping.');

  await demo.say('The subtitle sits at the top until a spotlight would cover it.');

  await demo.step('Spotlight on the top panel — caption should flip to the bottom.', async () => {
    await demo.spotlight(page.getByTestId('top-target'), 2_800);
    await demo.clearSpotlight();
  });

  await demo.step('Spotlight lower on the page — caption stays at the top.', async () => {
    await demo.spotlight(page.getByTestId('middle-target'), 2_400);
    await demo.clearSpotlight();
  });

  await demo.step('Save a note, then take a docs still without the overlay.', async () => {
    await demo.type(page.getByLabel('Short note'), 'Ready for the still');
    await demo.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.getByTestId('saved')).toContainText('Ready for the still');
    await demo.still('form-saved');
  });

  await demo.step('Second still: the list panel.', async () => {
    await expect(page.getByTestId('item-list')).toBeVisible();
    await demo.still('item-list');
  });

  await demo.step('Third still: redaction still hides the account line.', async () => {
    await demo.still('redaction-check');
  });

  await demo.card('Open the outputs', 'See examples/visual-030/README.md');
});
