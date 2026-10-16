// The data build must fail, not just warn, on output it shouldn't publish: a JSON file
// over 5 MB or a cross-reference row it can't parse. Each test builds from a copy of
// data-raw/ into its own output folder (DATA_RAW, DATA_OUT), so public/data/ is untouched.
// No browser needed.
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function build(testInfo, { extraRow, maxBytes } = {}) {
  const raw = testInfo.outputPath('raw');
  fs.mkdirSync(raw, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'data-raw', 'kjv.json'), path.join(raw, 'kjv.json'));
  let xrefs = fs.readFileSync(path.join(ROOT, 'data-raw', 'cross_references.txt'), 'utf8');
  if (extraRow) xrefs = xrefs.replace(/\r?\n?$/, `\n${extraRow}\n`);
  fs.writeFileSync(path.join(raw, 'cross_references.txt'), xrefs);
  const env = { ...process.env, DATA_RAW: raw, DATA_OUT: testInfo.outputPath('out') };
  if (maxBytes) env.DATA_MAX_BYTES = String(maxBytes);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-data.mjs')], { env, encoding: 'utf8' });
  return { status: r.status, output: r.stdout + r.stderr };
}

test('the sources build cleanly, with 3 John 1:15 remapped rather than failed', async ({}, testInfo) => {
  const r = build(testInfo);
  expect(r.status, r.output).toBe(0);
  expect(r.output).toContain('"3John.1.15"');
  expect(r.output).toContain('Rows that failed to parse: 0');
});

test('an unparseable cross-reference row fails the build', async ({}, testInfo) => {
  const r = build(testInfo, { extraRow: 'Gen.1.1\tNotABook.1.1\t5' });
  expect(r.status, r.output).not.toBe(0);
  expect(r.output).toContain('unknown verse reference');
});

test('a file over the size limit fails the build', async ({}, testInfo) => {
  const r = build(testInfo, { maxBytes: 2 * 1024 * 1024 }); // search.json is about 4 MB
  expect(r.status, r.output).not.toBe(0);
  expect(r.output).toMatch(/OVER/);
});
