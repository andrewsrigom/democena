// Modified for Democena (2026): independent fork naming and configuration.
import { test, expect } from 'democena';

/**
 * Visual review scenario for democena 0.3.0.
 *
 * Run from the repo root: npm run visual-030
 * Then open the artefacts listed in examples/visual-030/README.md.
 *
 * Each still scrolls to a different part of the page first: three names must mean three pictures.
 */
test('0.3.0 visual review', async ({ page, demo }) => {
  await demo.card('democena 0.3.0', 'Visual review: video, gif, images, caption flip');
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

  await demo.step('First still: the list panel, scrolled into view.', async () => {
    const list = page.getByTestId('item-list');
    await list.scrollIntoViewIfNeeded();
    await expect(list).toBeVisible();
    await demo.still('item-list');
  });

  await demo.step('Save a note, then take a docs still of the form.', async () => {
    await demo.type(page.getByLabel('Short note'), 'Ready for the still');
    await demo.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.getByTestId('saved')).toContainText('Ready for the still');
    await demo.still('form-saved');
  });

  await demo.step('Third still: scroll to the header — account line stays redacted.', async () => {
    await page.locator('header').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Visual review page' })).toBeVisible();
    await demo.still('redaction-check');
  });

  await demo.card('Open the outputs', 'See examples/visual-030/README.md');
});
