// Shared test setup: every page fails its test if it logs a console error or throws.
// Tests that make a fetch fail on purpose allow its message with
// test.use({ allowedErrors: [/Failed to load resource/] }).
// CPU_THROTTLE=4 npx playwright test slows each test's page 4x (Chromium's CPU
// throttling), to mimic a slower CI machine.
import { test as base, expect } from '@playwright/test';

const CPU_THROTTLE = Number(process.env.CPU_THROTTLE) || 1;

export const test = base.extend({
  page: async ({ page }, use) => {
    if (CPU_THROTTLE > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    }
    await use(page);
  },
  allowedErrors: [[], { option: true }],
  consoleErrors: [
    async ({ context, allowedErrors }, use) => {
      const errors = [];
      const watch = (p) => {
        p.on('console', (m) => {
          if (m.type() === 'error' && !allowedErrors.some((re) => re.test(m.text()))) errors.push(`${p.url()}: ${m.text()}`);
        });
        p.on('pageerror', (e) => errors.push(`${p.url()}: ${e}`));
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// Hide the first-visit welcome band (for tests that don't look at it).
export async function skipWelcome(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('welcome-dismissed', '1');
    } catch {} // about:blank has no storage
  });
}
