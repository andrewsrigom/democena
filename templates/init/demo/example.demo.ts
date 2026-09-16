// Modified for Democena (2026): independent fork naming and configuration.
import { test, expect } from 'democena';

test('A first recording', async ({ page, demo }) => {
  await demo.card('Your app', 'A first recording made by democena');
  // One full page load, at the start. Everything after this happens by clicking, the way a person
  // would: loading a deep URL directly asks the server for assets relative to that path, and in a
  // single-page app that often loads nothing at all.
  await page.goto('/');
  await demo.hideCard();

  await demo.say('Everything you see here is scripted, so it can be recorded again tomorrow.');

  await demo.step('The app opens.', async () => {
    await expect(page).toHaveTitle(/./);
  });

  // Docs pictures: mark the moment after the assertion, then `npx democena images 1`.
  // await demo.still('home');

  // Point at something real and the recording starts being useful:
  //
  // await demo.step('This number comes from our own cache.', async () => {
  //   await demo.spotlight(page.getByTestId('cache-age'), 2400);
  //   await demo.clearSpotlight();
  // });
  //
  // await demo.step('Opening it fetches the record live.', async () => {
  //   await demo.click(page.getByRole('link', { name: 'Open' }));
  //   await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
  // });
});
