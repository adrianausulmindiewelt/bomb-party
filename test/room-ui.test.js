import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Der Spieltisch enthält die dekorative Club-Raumkulisse', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/karten/karten.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /class="room-decor"/);
  assert.match(html, /class="lamp lamp-left"/);
  assert.match(html, /class="room-monogram"/);
  assert.match(css, /\.room-decor\s*\{/);
  assert.match(css, /\.room-monogram\s*\{/);
});
