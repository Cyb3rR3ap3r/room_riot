import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceTvDensityPage,
  createTvDensityPlan,
  getTvDensityPage,
  type TvDensityItem,
} from './tv-layout.js';

const items = (count: number, length = 10): readonly TvDensityItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    primary: `${String(index + 1).padStart(2, '0')} ${'N'.repeat(length)}`,
  }));

test('selects regular, compact, and paged layouts without arbitrary whole-screen scaling', () => {
  const regular = createTvDensityPlan({ kind: 'roster', items: items(4) });
  const compact = createTvDensityPlan({ kind: 'scores', items: items(10) });
  const paged = createTvDensityPlan({ kind: 'results', items: items(12, 90) });

  assert.equal(regular.mode, 'regular');
  assert.equal(compact.mode, 'compact');
  assert.equal(paged.mode, 'paged');
  assert.ok(paged.pageCount > 1);
  assert.deepEqual(
    paged.pages.flatMap((page) => page.items.map((item) => item.id)),
    items(12, 90).map((item) => item.id),
  );
});

test('preserves a 24px body minimum at 1080 equivalent and exact 5% overscan', () => {
  const viewports = [
    { viewport: { width: 1280, height: 720 }, font: 18, horizontal: 64, vertical: 36 },
    { viewport: { width: 1920, height: 1080 }, font: 24, horizontal: 96, vertical: 54 },
    { viewport: { width: 3840, height: 2160 }, font: 48, horizontal: 192, vertical: 108 },
  ] as const;

  for (const fixture of viewports) {
    const plan = createTvDensityPlan({
      kind: 'roster',
      items: items(2),
      viewport: fixture.viewport,
    });
    assert.equal(plan.bodyFontPx, fixture.font);
    assert.deepEqual(plan.overscan, {
      top: fixture.vertical,
      right: fixture.horizontal,
      bottom: fixture.vertical,
      left: fixture.horizontal,
    });
  }
});

test('paginates maximum players, longest content, prompts, and ties deterministically', () => {
  const tiedPlayers: readonly TvDensityItem[] = Array.from({ length: 12 }, (_, index) => ({
    id: `player-${index + 1}`,
    primary: `${'Very Long Player Name '.repeat(4)}${index + 1}`,
    secondary: '1200 points · tied for first place',
    rank: 1,
    score: 1200,
  }));
  const input = {
    kind: 'scores' as const,
    prompt: 'A deliberately long prompt '.repeat(16),
    items: tiedPlayers,
    viewport: { width: 1280, height: 720 },
  };
  const first = createTvDensityPlan(input);
  const second = createTvDensityPlan(input);

  assert.equal(first.mode, 'paged');
  assert.deepEqual(first.pages, second.pages);
  assert.deepEqual(
    first.pages.flatMap((page) => page.items.map(({ id, rank, score }) => ({ id, rank, score }))),
    tiedPlayers.map(({ id, rank, score }) => ({ id, rank, score })),
  );
  assert.equal(getTvDensityPage(first, -99).index, 0);
  assert.equal(getTvDensityPage(first, 99).index, first.pageCount - 1);
});

test('represents empty results as a stable regular page without scrolling', () => {
  const plan = createTvDensityPlan({ kind: 'results', prompt: 'Waiting for votes', items: [] });
  assert.equal(plan.empty, true);
  assert.equal(plan.mode, 'regular');
  assert.equal(plan.pageCount, 1);
  assert.deepEqual(plan.pages[0]?.items, []);
});

test('advances paged layouts cyclically and pins non-paged layouts to page zero', () => {
  const paged = createTvDensityPlan({ kind: 'results', items: items(12, 90) });
  assert.equal(advanceTvDensityPage(paged, 0), 1);
  assert.equal(advanceTvDensityPage(paged, paged.pageCount - 1), 0);
  assert.equal(advanceTvDensityPage(paged, 0, -1), paged.pageCount - 1);

  const regular = createTvDensityPlan({ kind: 'roster', items: items(2) });
  assert.equal(advanceTvDensityPage(regular, 99), 0);
});
