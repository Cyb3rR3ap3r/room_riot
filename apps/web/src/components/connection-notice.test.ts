import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectionNoticeComponent } from './connection-notice.js';
import { asFake, fakeDocument } from './test-dom.js';

test('connection notice retains identity and clears only its own recovered message', () => {
  const component = createConnectionNoticeComponent(fakeDocument);
  const element = asFake(component.element);
  component.update('reconnecting');
  assert.equal(element.textContent, 'Connection lost. Reconnecting automatically…');
  assert.equal(element.classList.contains('error'), true);
  component.update('connected');
  assert.equal(element.textContent, '');
  assert.equal(element.classList.contains('error'), false);
  component.update('reconnecting');
  element.textContent = 'A recoverable action error';
  component.update('connected');
  assert.equal(element.textContent, 'A recoverable action error');
  assert.equal(component.element, element as unknown as HTMLElement);
});
