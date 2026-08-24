import assert from 'node:assert/strict';
import test from 'node:test';

import { createPageShellComponent } from './page-shell.js';
import { asFake, fakeDocument } from './test-dom.js';

test('page shell updates route copy without recreating header, notice, or content', () => {
  const root = fakeDocument.createElement('root');
  const notice = fakeDocument.createElement('notice');
  const component = createPageShellComponent(root, notice, fakeDocument);
  const fakeRoot = asFake(root);
  const header = fakeRoot.children[0];
  const content = fakeRoot.children[2];

  const first = component.update({
    pageKind: 'player-page',
    title: 'Join the Riot',
    subtitle: 'First render',
  });
  const second = component.update({
    pageKind: 'player-page',
    title: "You're in RAGE",
    subtitle: 'Submission acknowledged',
  });

  assert.equal(fakeRoot.children[0], header);
  assert.equal(fakeRoot.children[1], notice as unknown as object);
  assert.equal(fakeRoot.children[2], content);
  assert.equal(first, second);
  assert.equal(first.content, content as unknown as HTMLElement);
  assert.equal(header!.children[1]!.textContent, "You're in RAGE");
  assert.equal(header!.children[2]!.textContent, 'Submission acknowledged');
});
