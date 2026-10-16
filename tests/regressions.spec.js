// Regression tests for the October 2026 code review's findings, numbered as in the review.
import { test, expect, skipWelcome } from './fixtures.js';

const hash = (page) => page.evaluate(() => location.hash);
// Holds a data file's response back by `ms`, or fails it the first `failures` times.
async function slow(page, file, ms) {
  await page.route(`**/data/${file}`, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}
async function failFirst(page, file, failures = 1) {
  let n = 0;
  await page.route(`**/data/${file}`, (route) => (n++ < failures ? route.abort() : route.continue()));
}

test.describe('#1 malformed hashes', () => {
  for (const bad of ['#/verse/John%E0', '#/arcs?book=100%']) {
    test(`${bad} on load shows the not-found page`, async ({ page }) => {
      await page.goto(bad);
      await expect(page.locator('h1')).toHaveText('Page not found');
    });
  }

  test('navigating to a malformed hash replaces the view', async ({ page }) => {
    await page.goto('#/about');
    await expect(page.locator('h1')).toHaveText('About');
    await page.evaluate(() => (location.hash = '#/verse/John%E0'));
    await expect(page.locator('h1')).toHaveText('Page not found');
  });

  test('query values are decoded once', async ({ page }) => {
    // %2549 decodes to %49 and only a second decode makes it "I".
    await page.goto('#/arcs?book=%2549sa');
    await expect(page.locator('.control-status')).toHaveText(/^[\d,]+ arcs$/);
    await expect(page.locator('#arcs-book')).toHaveValue('');
  });
});

test.describe('#2 Arcs taps on tablets', () => {
  test.use({ hasTouch: true });
  for (const width of [768, 1024]) {
    test(`at ${width}px a tap selects a book, and zooming in lets taps open a chapter`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('#/arcs');
      const stack = page.locator('.arcs-stack');
      await expect(stack).toBeVisible();
      // Where a chapter is on screen, from the chart's own geometry (PAD_X 6, TESTAMENT_GAP 10).
      const chapterPoint = (osisChapter) =>
        page.evaluate(async (want) => {
          const books = await (await fetch('data/books.json')).json();
          const [abbr, n] = want.split('.');
          const book = books.find((b) => b.abbr === abbr);
          const N = books.reduce((s, b) => s + b.chapters, 0);
          const c = book.firstChapter + Number(n) - 1;
          const ntStart = books.find((b) => b.testament === 'NT').firstChapter;
          const el = document.querySelector('.arcs-stack');
          document.querySelector('.arcs-scroll').scrollIntoView({ block: 'center' }); // page-wide, so only scrolls the page
          const r = el.getBoundingClientRect();
          const step = (r.width - 22) / N;
          return { x: r.left + 6 + (c + 0.5) * step + (c >= ntStart ? 10 : 0), y: r.top + r.height * 0.5, step };
        }, osisChapter);

      const p = await chapterPoint('Isa.33');
      expect(p.step).toBeLessThan(4);
      await page.touchscreen.tap(p.x, p.y);
      const line = page.locator('.arcs-chapter');
      await expect(line).toBeVisible();
      await expect(line.locator('strong')).toHaveText('Isaiah');
      await expect(line.getByRole('button', { name: 'Previous book: Song of Solomon' })).toBeVisible();
      await expect(line.getByRole('button', { name: 'Next book: Jeremiah' })).toBeVisible();
      await line.getByRole('button', { name: 'Zoom in to Isaiah' }).tap();
      await expect.poll(() => hash(page)).toContain('zoom=1');

      const q = await chapterPoint('Isa.53');
      expect(q.step).toBeGreaterThanOrEqual(4);
      await page.touchscreen.tap(q.x, q.y);
      await expect(page.locator('#verse-preview strong')).toHaveText('Isaiah 53');
      await page.touchscreen.tap(q.x + 1, q.y); // a second tap a pixel off still hits the chapter
      await expect.poll(() => hash(page)).toBe('#/verse/Isa.53.1');
    });
  }
});

// Found while testing #2: opening a pinned chapter removed the focused chart, whose blur
// handler then wrote #/arcs back over the new verse URL, so the app returned to Arcs.
test('#2b opening a pinned chapter with Enter keeps the verse URL', async ({ page }) => {
  await page.goto('#/arcs?ch=Isa.53');
  await expect(page.locator('#verse-preview strong')).toHaveText('Isaiah 53');
  await page.locator('.arcs-scroll').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toContainText('Isaiah 53:1');
  await page.waitForTimeout(300);
  expect(await hash(page)).toBe('#/verse/Isa.53.1');
  await expect(page.locator('h1')).toContainText('Isaiah 53:1');
});

test.describe('#3 focus after navigation', () => {
  test('moves to the heading when nothing else took focus', async ({ page, context }) => {
    await skipWelcome(context);
    await page.goto('#/about');
    await page.getByRole('link', { name: 'Verse', exact: true }).click();
    await expect(page.locator('.graph-section .legend')).toBeVisible();
    await expect(page.locator('h1')).toBeFocused();
  });

  test('stays in the search box if the user went there while the view loaded', async ({ page, context }) => {
    await skipWelcome(context);
    await slow(page, 'xrefs/John.json', 1200);
    await page.goto('#/about');
    await page.getByRole('link', { name: 'Verse', exact: true }).click();
    // The view has started (its heading is in) but its cross-references are held back.
    await expect(page.locator('h1')).toContainText('John 3:16');
    await expect(page.locator('.graph-section .legend')).toHaveCount(0);
    await page.locator('#search-input').focus();
    await expect(page.locator('.graph-section .legend')).toBeVisible();
    await expect(page.locator('#search-input')).toBeFocused();
  });

  test('a slow view finishing after a later navigation leaves focus alone', async ({ page, context }) => {
    await skipWelcome(context);
    await slow(page, 'xrefs/John.json', 1200);
    await page.goto('#/books');
    await expect(page.locator('h1')).toBeVisible();
    await page.getByRole('link', { name: 'Verse', exact: true }).click();
    await page.getByRole('link', { name: 'About', exact: true }).first().click();
    await expect(page.locator('h1')).toHaveText('About');
    await page.locator('#search-input').focus();
    await page.waitForTimeout(1600); // the Verse render finishes in the background
    await expect(page.locator('#search-input')).toBeFocused();
  });
});

test.describe('#4 one failed fetch on the Verse view', () => {
  test.use({ allowedErrors: [/Failed to load resource/] });

  test('failed cross-references keep the verse text and can be retried', async ({ page, context }) => {
    await skipWelcome(context);
    await failFirst(page, 'xrefs/John.json');
    await page.goto('#/verse/John.3.16');
    await expect(page.locator('.verse-text')).toContainText('For God so loved the world');
    const margin = page.locator('.margin-column');
    await expect(margin).toContainText('Couldn’t load the cross-references');
    await margin.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('#refs-out-list li')).toHaveCount(10);
    await expect(page.locator('.graph-section .legend')).toBeVisible();
    await expect(page.locator('.verse-text')).toContainText('For God so loved the world');
  });

  test('failed verse text keeps the cross-references and can be retried', async ({ page, context }) => {
    await skipWelcome(context);
    await failFirst(page, 'verses/John.json');
    await page.goto('#/verse/John.3.16');
    await expect(page.locator('#refs-out-list li')).toHaveCount(10);
    const box = page.locator('.verse-text-box');
    await expect(box).toContainText('Couldn’t load the verse text');
    await box.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.verse-text')).toContainText('For God so loved the world');
    await expect(page.locator('#refs-out-list li')).toHaveCount(10);
  });
});

test('#6 Books stops its resize timer once you navigate away', async ({ page }) => {
  await page.goto('#/books');
  await expect(page.locator('.chord-label').first()).toBeAttached();
  await page.setViewportSize({ width: 1000, height: 900 });
  // Let the ResizeObserver fire and start its 150 ms timer, then leave for a view without canvases.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const drawsAfterLeaving = await page.evaluate(async () => {
    let draws = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      draws++;
      return getContext.apply(this, args);
    };
    location.hash = '#/about';
    await new Promise((r) => setTimeout(r, 400));
    return draws;
  });
  expect(drawsAfterLeaving).toBe(0);
});

test.describe('#8 vote counts in the graph', () => {
  test.beforeEach(({ context }) => skipWelcome(context));
  test('one vote is "1 vote"', async ({ page }) => {
    await page.goto('#/verse/Gen.24.34');
    const labels = await page.locator('svg.graph a.graph-node').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join('\n')).not.toMatch(/\b1 votes/);
    expect(labels.join('\n')).toMatch(/\b1 vote\b/);
  });
  test('thousands have a separator', async ({ page }) => {
    await page.goto('#/verse/Isa.44.3');
    const labels = await page.locator('svg.graph a.graph-node').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(labels.join('\n')).toMatch(/\b1,\d{3} votes/);
    expect(labels.join('\n')).not.toMatch(/\d{4} votes/);
  });
});

test.describe('#9 references are never formatted by hand', () => {
  test('while books.json loads', async ({ page }) => {
    await slow(page, 'books.json', 800);
    await page.goto('#/verse/John.3.16', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.welcome')).toBeVisible();
    // Read straight away, while books.json is still held back (a negative expect would wait it out).
    expect(await page.locator('h1').textContent()).not.toContain('John 3 16');
    expect(await page.locator('.welcome').textContent()).not.toContain('Ps 23:1');
    await expect(page.locator('.welcome')).toContainText('Psalm 23:1');
    await expect(page.locator('h1')).toContainText('John 3:16');
  });

  test.describe('when books.json fails', () => {
    test.use({ allowedErrors: [/Failed to load resource/] });
    test('no hand-made references are left', async ({ page }) => {
      await page.route('**/data/books.json', (route) => route.abort());
      await page.goto('#/verse/John.3.16');
      await expect(page.locator('.verse-text-box')).toContainText('Couldn’t load');
      await expect(page.locator('main')).not.toContainText('Ps 23:1');
      await expect(page.locator('h1')).not.toContainText('John 3 16');
    });
  });
});

// Not reproduced: centre() only runs on a freshly laid-out chart (scrollLeft 0), so its
// scroll always happens and clears the flag. Kept as a guard for the two paths that centre.
test.describe('#7 a scroll after centring a chapter clears its popover', () => {
  test.use({ hasTouch: true });
  test.beforeEach(({ page }) => page.setViewportSize({ width: 1024, height: 1000 }));
  const userScroll = (page) => page.locator('.arcs-scroll').evaluate((s) => (s.scrollLeft -= 300));

  test('opened zoomed in at the end of the Bible', async ({ page }) => {
    await page.goto('#/arcs?zoom=1&ch=Rev.22');
    await expect(page.locator('#verse-preview strong')).toHaveText('Revelation 22');
    await page.waitForTimeout(100);
    await userScroll(page);
    await expect(page.locator('#verse-preview')).toBeHidden();
  });

  test('zoomed out and back in', async ({ page }) => {
    await page.goto('#/arcs?zoom=1&ch=Rev.22');
    await expect(page.locator('#verse-preview strong')).toHaveText('Revelation 22');
    await page.locator('.controls').getByRole('button', { name: 'Show the whole Bible' }).click();
    await page.locator('.controls').getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('#verse-preview strong')).toHaveText('Revelation 22');
    await page.waitForTimeout(100);
    await userScroll(page);
    await expect(page.locator('#verse-preview')).toBeHidden();
  });
});
