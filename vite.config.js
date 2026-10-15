import { defineConfig } from 'vite';

// Served from https://ryan2706.github.io/bible-xref/, so every asset and
// fetch URL must live under /bible-xref/ (use import.meta.env.BASE_URL).
export default defineConfig({
  base: '/bible-xref/',
});
