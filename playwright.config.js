import { defineConfig, devices } from '@playwright/test';

// `npm test` builds the site first, then these tests run against the production build
// served by `vite preview` under /bible-xref/, as on GitHub Pages.
const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/bible-xref/`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/bible-xref/`,
    reuseExistingServer: !process.env.CI,
  },
});
