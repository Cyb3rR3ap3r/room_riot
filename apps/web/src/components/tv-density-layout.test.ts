import assert from 'node:assert/strict';
import test from 'node:test';

import { createTvDensityPlan } from '../routes/display/tv-layout.js';
import { asFake, fakeDocument } from './test-dom.js';
import { createTvDensityLayoutComponent } from './tv-density-layout.js';

test('renders one deterministic page into a retained density shell', () => {
  const plan = createTvDensityPlan({
    kind: 'results',
    prompt: 'A long result prompt '.repeat(10),
    viewport: { width: 1280, height: 720 },
    items: Array.from({ length: 12 }, (_, index) => ({
      id: `r${index}`,
      primary: `Result ${index}: ${'long answer '.repeat(10)}`,
      secondary: `${index} votes`,
    })),
  });
  const component = createTvDensityLayoutComponent(fakeDocument);
  component.update(plan, 1);
  const root = asFake(component.element);

  assert.ok(root.classList.contains('density-paged'));
  assert.equal(root.attributes.get('data-page-index'), '1');
  assert.equal(root.attributes.get('data-page-count'), String(plan.pageCount));
  assert.equal(root.attributes.get('data-body-font-px'), '18');
  assert.deepEqual(
    root.children[1]?.children.map((row) => row.attributes.get('data-item-id')),
    plan.pages[1]?.items.map((item) => item.id),
  );
  assert.equal(root.children[3]?.children[1]?.attributes.get('aria-live'), 'polite');
  assert.match(
    asFake(component.previousButton).attributes.get('aria-label') ?? '',
    /previous result page/i,
  );
  assert.match(
    asFake(component.nextButton).attributes.get('aria-label') ?? '',
    /next result page/i,
  );
  assert.equal(root.attributes.get('data-page-rotation-ms'), '6000');
});

test('reuses renderer-owned result nodes instead of flattening game-specific content', () => {
  const plan = createTvDensityPlan({
    kind: 'results',
    viewport: { width: 640, height: 360 },
    items: Array.from({ length: 8 }, (_, index) => ({
      id: `item-${index}`,
      primary: 'Long result content '.repeat(8),
    })),
  });
  const retained = Object.fromEntries(
    plan.pages
      .flatMap((page) => page.items)
      .map((item) => {
        const node = fakeDocument.createElement('li');
        node.textContent = `Renderer content ${item.id}`;
        return [item.id, node];
      }),
  );
  const component = createTvDensityLayoutComponent(fakeDocument);
  component.update(plan, 0, retained);
  const visible = plan.pages[0]!.items;
  const rows = asFake(component.element).children[1]!.children;
  assert.deepEqual(
    rows,
    visible.map((item) => asFake(retained[item.id]!)),
  );
});

test('renders an explicit empty result state', () => {
  const component = createTvDensityLayoutComponent(fakeDocument);
  component.update(createTvDensityPlan({ kind: 'results', items: [] }));
  const root = asFake(component.element);
  assert.equal(root.children[2]?.textContent, 'No results yet.');
  assert.equal(root.children[2]?.attributes.get('role'), 'status');
});
