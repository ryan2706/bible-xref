// Shared test setup: every page fails its test if it logs a console error or throws.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  consoleErrors: [
    async ({ context }, use) => {
      const errors = [];
      const watch = (p) => {
        p.on('console', (m) => m.type() === 'error' && errors.push(`${p.url()}: ${m.text()}`));
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
  await context.addInitScript(() => localStorage.setItem('welcome-dismissed', '1'));
}
