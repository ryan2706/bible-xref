// Arcs: zooming in to a book keeps the whole Bible on screen (focus plus context).
import { test, expect } from './fixtures.js';
import { chapterPoint } from './arcs-helpers.js';

const hash = (page) => page.evaluate(() => location.hash);
const noSidewaysScroll = (page) => page.locator('.arcs-scroll').evaluate((s) => s.scrollWidth <= s.clientWidth);

test.describe('zoom with touch', () => {
  test.use({ hasTouch: true });

  for (const width of [390, 768, 1024]) {
    test.describe(`at ${width}px`, () => {
      test.beforeEach(({ page }) => page.setViewportSize({ width, height: 900 }));

      test('Psalms: taps pick chapters, and outside it taps pick books', async ({ page }) => {
        await page.goto('#/arcs?zoom=Ps');
        const focusLine = page.locator('.arcs-focus');
        await expect(focusLine.locator('strong')).toHaveText('Psalms');
        expect(await noSidewaysScroll(page)).toBe(true);

        const p = await chapterPoint(page, 'Ps.23', 'Ps');
        await page.touchscreen.tap(p.x, p.y);
        await expect(page.locator('#verse-preview strong')).toHaveText('Psalm 23');

        // Genesis is squeezed to a fraction of a pixel per chapter: a tap selects the book.
        const g = await chapterPoint(page, 'Gen.10', 'Ps');
        expect(g.width).toBeLessThan(1);
        await page.touchscreen.tap(g.x, g.y);
        const bookLine = page.locator('.arcs-chapter');
        await expect(bookLine.locator('strong')).toHaveText('Genesis');
        await expect(focusLine).toBeHidden();
        await expect(bookLine.getByRole('button', { name: 'Zoom in to Genesis' })).toBeVisible();
      });

      test('Jude: its one chapter gets 16px and opens on a second tap', async ({ page }) => {
        await page.goto('#/arcs?zoom=Jude');
        await expect(page.locator('.arcs-focus strong')).toHaveText('Jude');
        const p = await chapterPoint(page, 'Jude.1', 'Jude');
        expect(p.width).toBe(16);
        await page.touchscreen.tap(p.x, p.y);
        await expect(page.locator('#verse-preview strong')).toHaveText('Jude 1');
        await page.touchscreen.tap(p.x, p.y);
        await expect.poll(() => hash(page)).toBe('#/verse/Jude.1.1');
      });

      test('previous/next move the zoom, and the whole Bible comes back', async ({ page }) => {
        await page.goto('#/arcs?zoom=Isa');
        const focusLine = page.locator('.arcs-focus');
        await focusLine.getByRole('button', { name: 'Next book: Jeremiah' }).tap();
        await expect(focusLine.locator('strong')).toHaveText('Jeremiah');
        expect(await hash(page)).toBe('#/arcs?zoom=Jer');
        await focusLine.getByRole('button', { name: 'Previous book: Isaiah' }).tap();
        await expect(focusLine.locator('strong')).toHaveText('Isaiah');
        expect(await noSidewaysScroll(page)).toBe(true);
        await focusLine.getByRole('button', { name: 'Show the whole Bible' }).tap();
        await expect(focusLine).toBeHidden();
        expect(await hash(page)).toBe('#/arcs');
        expect(await noSidewaysScroll(page)).toBe(true);
      });
    });
  }
});

test('the keyboard keeps its place on the step buttons', async ({ page }) => {
  await page.goto('#/arcs?zoom=Isa');
  await page.locator('.arcs-focus').getByRole('button', { name: 'Next book: Jeremiah' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.arcs-focus strong')).toHaveText('Jeremiah');
  await expect(page.locator(':focus')).toHaveAccessibleName('Next book: Lamentations');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator(':focus')).toHaveText('Show the whole Bible');
  await page.keyboard.press('Enter');
  await expect(page.locator('.arcs-scroll')).toBeFocused();
  await expect(page.locator('#verse-preview')).toBeHidden(); // no chapter picked by the move
});

test('a pinned chapter stays selected while zooming in to its book', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('#/arcs?ch=Isa.53');
  const line = page.locator('.arcs-chapter');
  await expect(line).toContainText('Isaiah 53');
  await line.getByRole('button', { name: 'Zoom in to Isaiah' }).click();
  await expect(page.locator('.arcs-focus strong')).toHaveText('Isaiah');
  await expect(line).toContainText('Isaiah 53');
  await expect.poll(() => hash(page)).toBe('#/arcs?zoom=Isa&ch=Isa.53');
});

test('older zoom=1 links zoom in to the linked chapter’s book', async ({ page }) => {
  await page.goto('#/arcs?zoom=1&ch=Rev.22');
  await expect(page.locator('.arcs-focus strong')).toHaveText('Revelation');
  await expect(page.locator('#verse-preview strong')).toHaveText('Revelation 22');
});

test.describe('the zoom animates', () => {
  // Counts redraws of the colour layer straight after the click, then once it settles.
  const zoomAndCount = (page) =>
    page.evaluate(async () => {
      performance.clearMeasures('arcs-draw');
      document.querySelector('.arcs-focus [data-step="1"]').click();
      const atOnce = performance.getEntriesByName('arcs-draw').length;
      await new Promise((r) => setTimeout(r, 800));
      return { atOnce, settled: performance.getEntriesByName('arcs-draw').length };
    });

  test('over several frames', async ({ page }) => {
    await page.goto('#/arcs?zoom=Isa');
    await expect(page.locator('.arcs-focus')).toBeVisible();
    const { atOnce, settled } = await zoomAndCount(page);
    expect(atOnce).toBe(0);
    expect(settled).toBeGreaterThanOrEqual(2);
  });

  test('but not under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('#/arcs?zoom=Isa');
    await expect(page.locator('.arcs-focus')).toBeVisible();
    const { atOnce, settled } = await zoomAndCount(page);
    expect(atOnce).toBe(1);
    expect(settled).toBe(1);
  });
});
