// Arcs: zooming in to a book keeps the whole Bible on screen (focus plus context).
import { test, expect } from './fixtures.js';
import { chapterPoint, zoomSettled } from './arcs-helpers.js';

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
        // Each step waits for the zoom animation to finish (data-zoom), not for a time.
        await focusLine.getByRole('button', { name: 'Next book: Jeremiah' }).tap();
        await expect(focusLine.locator('strong')).toHaveText('Jeremiah');
        await zoomSettled(page);
        expect(await hash(page)).toBe('#/arcs?zoom=Jer');
        await focusLine.getByRole('button', { name: 'Previous book: Isaiah' }).tap();
        await expect(focusLine.locator('strong')).toHaveText('Isaiah');
        await zoomSettled(page);
        expect(await noSidewaysScroll(page)).toBe(true);
        await focusLine.getByRole('button', { name: 'Show the whole Bible' }).tap();
        await expect(focusLine).toBeHidden();
        await zoomSettled(page);
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
  // Counts redraws of the colour layer straight after the click, then once it settles
  // (the chart's data-zoom says so).
  const zoomAndCount = (page) =>
    page.evaluate(async () => {
      performance.clearMeasures('arcs-draw');
      const stack = document.querySelector('.arcs-stack');
      document.querySelector('.arcs-focus [data-step="1"]').click();
      const atOnce = performance.getEntriesByName('arcs-draw').length;
      while (stack.dataset.zoom !== 'settled') await new Promise((r) => setTimeout(r, 20));
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

  // A frame's timestamp is when the frame began, which on a slow machine can be before the
  // zoom started. The first frame then had a negative t, eased chapters to negative widths,
  // and drew arcs with negative radii (an IndexSizeError, which fails the test). Here every
  // frame reports a time 200ms early.
  test('with frame times from before it started', async ({ page }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((now) => cb(now - 200));
    });
    await page.goto('#/arcs?zoom=Isa');
    await expect(page.locator('.arcs-focus')).toBeVisible();
    await page.locator('.arcs-focus [data-step="1"]').click();
    await expect(page.locator('.arcs-focus strong')).toHaveText('Jeremiah');
    await zoomSettled(page);
  });
});

test.describe('chapter chips for long books', () => {
  test.use({ hasTouch: true });
  const chipsOf = (page) => page.locator('.arcs-focus .arcs-chips');
  // Whether a chip lies wholly inside its scrolling row.
  const inView = (chip) =>
    chip.evaluate((el) => {
      const r = el.getBoundingClientRect(), row = el.parentNode.getBoundingClientRect();
      return r.left >= row.left - 0.5 && r.right <= row.right + 0.5;
    });

  for (const [width, abbr, name, label, chapter] of [
    [390, 'Ps', 'Psalms', 'Psalm', 119],
    [390, 'Isa', 'Isaiah', 'Isaiah', 53],
    [768, 'Ps', 'Psalms', 'Psalm', 119],
  ]) {
    test(`${name} at ${width}px: a chip picks a chapter as a chart tap would`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`#/arcs?zoom=${abbr}`);
      const p = await chapterPoint(page, `${abbr}.1`, abbr);
      expect(p.width).toBeLessThan(8);
      const row = chipsOf(page);
      await expect(row.getByRole('button')).toHaveCount((await page.locator('.arcs-focus strong').textContent()) === 'Psalms' ? 150 : 66);
      const chip = row.getByRole('button', { name: `${label} ${chapter}`, exact: true });
      const box = await chip.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);

      await chip.scrollIntoViewIfNeeded();
      await chip.tap();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#verse-preview strong')).toHaveText(`${label} ${chapter}`);
      await expect(page.locator('#verse-preview')).toContainText('Tap again to read it.');
      await expect(page.locator('canvas.arcs-dim')).toBeVisible(); // the other arcs dimmed
      await expect.poll(() => hash(page)).toBe(`#/arcs?zoom=${abbr}&ch=${abbr}.${chapter}`);

      // A chart tap on another chapter moves the chip selection and scrolls it into view.
      const q = await chapterPoint(page, `${abbr}.2`, abbr);
      await page.touchscreen.tap(q.x, q.y);
      const second = row.getByRole('button', { name: `${label} 2`, exact: true });
      await expect(second).toHaveAttribute('aria-pressed', 'true');
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(() => inView(second)).toBe(true);

      await second.tap();
      await expect.poll(() => hash(page)).toBe(`#/verse/${abbr}.2.1`);
    });
  }

  test('books whose chapters are 8px or wider have no chips', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('#/arcs?zoom=Gen'); // ~11px a chapter
    await expect(page.locator('.arcs-focus strong')).toHaveText('Genesis');
    await expect(chipsOf(page)).toHaveCount(0);
  });

  test('arrow keys move between chips and Enter picks, then opens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('#/arcs?zoom=Ps');
    const row = chipsOf(page);
    await row.getByRole('button', { name: 'Psalm 1', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(':focus')).toHaveAccessibleName('Psalm 3');
    await page.keyboard.press('End');
    await expect(page.locator(':focus')).toHaveAccessibleName('Psalm 150');
    await expect.poll(() => inView(page.locator(':focus'))).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page.locator('#verse-preview strong')).toHaveText('Psalm 149');
    await expect(page.locator('#verse-preview')).toContainText('Press Enter to read it.');
    // One tab stop for the row: the selected chip.
    expect(await row.locator('[tabindex="0"]').count()).toBe(1);
    await page.keyboard.press('Enter');
    await expect.poll(() => hash(page)).toBe('#/verse/Ps.149.1');
  });
});
