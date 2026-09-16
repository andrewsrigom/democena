// Original Democena scenario: create a product and publish a synthetic Forma collection.
import { test, expect } from 'democena';

test('Forma — from product to published collection', async ({ page, demo }) => {
  await demo.card('Forma', 'Your collection, ready to share');
  await page.goto('/');
  await expect(page.getByTestId('product-count')).toHaveText('3 products');
  await demo.hideCard();
  await demo.note('Original Democena example · Synthetic products');
  demo.chapter('Make room for something new');
  await demo.step(
    'Start with a collection of thoughtful objects.',
    async () => {
      await demo.spotlight(page.getByTestId('publish-summary'), 1600);
      await demo.clearSpotlight();
      await demo.click(
        page.getByRole('button', { name: 'New product', exact: true }),
      );
    },
  );
  await demo.step('Add the details that make your product yours.', async () => {
    await demo.type(
      page.getByLabel('Product name', { exact: true }),
      'Arc table lamp',
    );
    await demo.type(page.getByLabel('Price ($)', { exact: true }), '129');
    await demo.type(
      page.getByLabel('Short description'),
      'Warm light. A softer workspace.',
    );
    await demo.click(
      page.getByRole('button', { name: 'Save product', exact: true }),
    );
    await expect(page.getByTestId('product-count')).toHaveText('4 products');
    await expect(
      page.getByRole('heading', { name: 'Arc table lamp' }),
    ).toBeVisible();
    await demo.still('product-added');
  });
  demo.chapter('Ready to share');
  await demo.step('Publish your collection with one click.', async () => {
    await demo.click(
      page.getByRole('button', { name: 'Publish collection', exact: true }),
    );
    await expect(page.getByTestId('collection-status')).toHaveText('Published');
    await demo.spotlight(page.getByTestId('publish-summary'), 1800);
    await demo.clearSpotlight();
    await demo.still('collection-published');
  });
  await demo.step(
    'Open the catalog and see the finished collection.',
    async () => {
      await demo.click(
        page.getByRole('link', { name: 'Open catalog', exact: false }),
      );
      await expect(page).toHaveURL(/\/c\/spring-edit$/);
      await expect(page.getByTestId('product-card')).toHaveCount(4);
      await expect(
        page.getByRole('heading', { name: 'Arc table lamp' }),
      ).toBeVisible();
      await demo.still('public-catalog');
    },
  );
  await demo.card(
    'Good things. Ready to share.',
    'Created with Forma. Told with Democena.',
  );
});
