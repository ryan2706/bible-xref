// Smoke tests: each view loads, its main paths work, and shared links restore their state.
import { test, expect, skipWelcome } from './fixtures.js';

const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash));

test.describe('Verse', () => {
  test('home loads on John 3:16 with the welcome band', async ({ page }) => {
    await page.goto('./');
    await expect.poll(() => hash(page)).toBe('#/verse/John.3.16');
    await expect(page.locator('h1')).toContainText('John 3:16');
    await expect(page.locator('.welcome')).toBeVisible();
    await expect(page.locator('.verse-text')).toContainText('For God so loved the world');
    await expect(page.locator('.site-footer')).toContainText('OpenBible.info');
  });

  test('searching "John 3:16" shows the verse and both reference lists', async ({ page, context }) => {
    await skipWelcome(context);
    await page.goto('#/about');
    await page.locator('#search-input').fill('John 3:16');
    await page.locator('#search-input').press('Enter');
    await expect.poll(() => hash(page)).toBe('#/verse/John.3.16');
    await expect(page.locator('h1')).toContainText('John 3:16');
    await expect(page.locator('.verse-text')).toContainText('For God so loved the world');
    await expect(page.getByRole('heading', { name: /^References \d+/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Referenced by \d+/ })).toBeVisible();
    await expect(page.locator('#refs-out-list li')).toHaveCount(10);
    await expect(page.locator('#refs-in-list li')).toHaveCount(10);
  });

  test('previous/next verse crosses Malachi 4:6 → Matthew 1:1', async ({ page, context }) => {
    await skipWelcome(context);
    await page.goto('#/verse/Mal.4.6');
    await expect(page.locator('h1')).toContainText('Malachi 4:6');
    const next = page.locator('.verse-step-next');
    await expect(next.locator('.verse-step-ref')).toHaveText('Matthew 1:1');
    await next.click();
    await expect.poll(() => hash(page)).toBe('#/verse/Matt.1.1');
    await expect(page.locator('h1')).toContainText('Matthew 1:1');
    await expect(page.locator('.verse-step-prev .verse-step-ref')).toHaveText('Malachi 4:6');
    // ← steps back too.
    await page.locator('body').press('ArrowLeft');
    await expect.poll(() => hash(page)).toBe('#/verse/Mal.4.6');
    await expect(page.locator('h1')).toContainText('Malachi 4:6');
  });

  test('clicking a graph dot opens that verse', async ({ page, context }) => {
    await skipWelcome(context);
    await page.goto('#/verse/John.3.16');
    const node = page.locator('svg.graph a.graph-node').first();
    await expect(node).toBeVisible();
    const href = await node.getAttribute('href');
    await node.locator('circle').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(href);
    await expect(page.locator('h1')).not.toContainText('John 3:16');
  });
});

test.describe('Arcs', () => {
  // Non-transparent pixels on the base (colour) canvas.
  const inked = (page) =>
    page.locator('canvas.arcs-base').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    });

  test('renders with the default 50+ votes', async ({ page }) => {
    await page.goto('#/arcs');
    await expect(page.locator('.arcs-votes-value')).toHaveText('50+');
    await expect(page.locator('#arcs-votes')).toHaveValue('50');
    await expect(page.locator('.control-status')).toHaveText(/^[\d,]+ arcs$/);
    expect(await inked(page)).toBeGreaterThan(1000);
    expect(await hash(page)).toBe('#/arcs'); // defaults are left out of the URL
  });

  test('?ch= restores the highlighted chapter', async ({ page }) => {
    await page.goto('#/arcs?ch=Isa.53');
    await expect(page.locator('#verse-preview')).toBeVisible();
    await expect(page.locator('#verse-preview strong')).toHaveText('Isaiah 53');
    expect(await hash(page)).toBe('#/arcs?ch=Isa.53');
  });

  test('?ch= on a phone describes the chapter inline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('#/arcs?ch=Isa.53');
    await expect(page.locator('.arcs-chapter')).toBeVisible();
    await expect(page.locator('.arcs-chapter')).toContainText('Isaiah 53');
    await expect(page.locator('#verse-preview')).toBeHidden();
  });

  test('?book= and ?min= restore the filters', async ({ page }) => {
    await page.goto('#/arcs?min=30&book=Isa');
    await expect(page.locator('.arcs-votes-value')).toHaveText('30+');
    await expect(page.locator('#arcs-book option:checked')).toHaveText('Isaiah');
    await expect(page.locator('.control-status')).toHaveText(/^[\d,]+ arcs? touching Isaiah$/);
    expect(await inked(page)).toBeGreaterThan(100);
    expect(await hash(page)).toBe('#/arcs?min=30&book=Isa');
  });
});

test.describe('Books', () => {
  test('opens on Isaiah with three suggested pairs', async ({ page }) => {
    await page.goto('#/books');
    await expect(page.locator('#books-panel-title')).toHaveText('Isaiah');
    await expect(page.locator('.books-suggest .books-partner')).toHaveCount(3);
    await expect(page.locator('.chord-label').first()).toBeAttached();
    expect(await hash(page)).toBe('#/books'); // the opening selection isn't written to the URL
  });

  test('?pair=Isa-Matt lists verse pairs', async ({ page }) => {
    await page.goto('#/books?pair=Isa-Matt');
    await expect(page.locator('#books-panel-title')).toHaveText('Isaiah and Matthew');
    const pairs = page.locator('.books-pairs > li');
    await expect(pairs.first()).toBeVisible();
    expect(await pairs.count()).toBeGreaterThan(1);
    await expect(pairs.first().locator('.ref-link')).toHaveCount(2);
    await expect(pairs.first().locator('.books-pair-text').first()).not.toBeEmpty();
  });
});

test('About loads its 3 thumbnails', async ({ page }) => {
  await page.goto('#/about');
  await expect(page.locator('h1')).toHaveText('About');
  const thumbs = page.locator('.about-thumb-frame svg');
  await expect(thumbs).toHaveCount(3);
  for (const svg of await thumbs.all()) expect(await svg.locator('*').count()).toBeGreaterThan(10);
});

// The fixture fails a test on any console error; this visits every view, both themes.
for (const scheme of ['light', 'dark']) {
  test(`no console errors on any view (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const route of ['#/verse/John.3.16', '#/arcs', '#/books', '#/about', '#/nowhere']) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
  });
}
