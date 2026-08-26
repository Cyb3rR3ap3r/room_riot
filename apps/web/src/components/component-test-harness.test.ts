import assert from 'node:assert/strict';
import test from 'node:test';

import { getGamePlayerLimits } from '@room-riot/contracts';

import { getGamePresentation } from '../games/presentation.js';
import { PUBLIC_STAGE_RENDERERS } from '../games/public-stage-registry.js';
import { parsePlayerGameView, parseRoomSnapshot } from '../protocol.js';
import {
  createAllGamePhaseFixtures,
  createDrawnOutResultFixture,
  createGamePhaseFixture,
  FIXTURE_POPULATIONS,
  GAME_PHASES,
  LONG_FIXTURE_TEXT,
} from './component-fixtures.js';
import {
  createInteractiveFixtureControl,
  renderComponentFixture,
} from './component-test-harness.js';
import { asInteractive, collectText, InteractiveTestDocument } from './interactive-test-dom.js';
import type { InteractiveTestElement } from './interactive-test-dom.js';
import { createRoomStageShellComponent } from './room-stage-shell.js';

test('fixture generator covers every public/private game status and stress population', () => {
  const fixtures = createAllGamePhaseFixtures();
  const phaseCount = Object.values(GAME_PHASES).reduce((total, phases) => total + phases.length, 0);
  assert.equal(fixtures.length, (phaseCount + 2) * FIXTURE_POPULATIONS.length);
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);

  for (const fixture of fixtures) {
    const publicResult = parseRoomSnapshot(fixture.snapshot);
    assert.equal(publicResult.ok, true, `${fixture.id} public snapshot must satisfy the contract`);
    if (fixture.population === 'zero') {
      assert.equal(fixture.playerState, null, `${fixture.id} has no invented private player`);
    } else {
      const privateResult = parsePlayerGameView(fixture.playerState);
      assert.equal(
        privateResult.ok,
        true,
        `${fixture.id} private snapshot must satisfy the contract`,
      );
      assert.equal(fixture.playerState?.id, fixture.gameId);
    }
  }
});

test('typed public stage registry is exhaustive and identity-safe', () => {
  assert.deepEqual(Object.keys(PUBLIC_STAGE_RENDERERS).sort(), Object.keys(GAME_PHASES).sort());
  for (const [gameId, renderer] of Object.entries(PUBLIC_STAGE_RENDERERS)) {
    assert.equal(renderer.gameId, gameId);
  }
});

test('fixture populations resolve zero, one, game minimum, maximum, and tied density exactly', () => {
  for (const gameId of Object.keys(GAME_PHASES) as (keyof typeof GAME_PHASES)[]) {
    const phase = GAME_PHASES[gameId][0];
    const limits = getGamePlayerLimits(gameId);
    const expected = {
      zero: 0,
      one: 1,
      minimum: limits.minimum,
      maximum: limits.maximum,
      'dense-tie': limits.maximum,
    } as const;
    for (const population of FIXTURE_POPULATIONS) {
      const fixture = createGamePhaseFixture(gameId, phase, population);
      assert.equal(fixture.snapshot.state.players.length, expected[population], fixture.id);
      assert.equal(fixture.snapshot.game?.totalPlayers, expected[population], fixture.id);
    }

    const dense = createGamePhaseFixture(gameId, 'results', 'dense-tie');
    assert.ok(dense.snapshot.game);
    assert.ok(dense.snapshot.game.roundScores.length >= limits.minimum);
    assert.equal(new Set(dense.snapshot.game.roundScores.map((score) => score.points)).size, 1);
  }
});

test('shared components render the complete game fixture matrix and preserve long content verbatim', () => {
  for (const fixture of createAllGamePhaseFixtures()) {
    const ownerDocument = new InteractiveTestDocument();
    const rendered = renderComponentFixture(fixture, ownerDocument);
    const text = collectText(rendered.root);
    assert.match(text, new RegExp(fixture.gameId), fixture.id);
    assert.match(text, new RegExp(fixture.gamePhase), fixture.id);
    const contractContainsLongContent = JSON.stringify({
      snapshot: fixture.snapshot,
      playerState: fixture.playerState,
    }).includes(LONG_FIXTURE_TEXT);
    if (contractContainsLongContent) {
      assert.ok(
        text.includes(LONG_FIXTURE_TEXT),
        `${fixture.id} must not truncate long fixture text`,
      );
    }
    assert.equal(
      asInteractive(rendered.stage).classList.contains(
        getGamePresentation(fixture.gameId).stageClass,
      ),
      true,
      `${fixture.id} uses its production stage class`,
    );
    assert.ok(asInteractive(rendered.controller).attributes.get('data-action-key'));
    assert.equal(
      asInteractive(rendered.recoveryPanel).attributes.get('data-recovery-state'),
      'reconnecting',
    );
    assert.equal(
      asInteractive(rendered.roster).children[1]?.children.length,
      Math.max(1, fixture.snapshot.state.players.length),
      `${fixture.id} renders either all roster rows or one empty state`,
    );
    assert.match(rendered.recoveryDiagnostic, /room=RIOT/);
  }
});

test('fixture matrix passes the production accessibility smoke audit', () => {
  const violations: string[] = [];
  const interactiveTags = new Set(['button', 'input', 'textarea', 'select']);
  const visit = (
    element: InteractiveTestElement,
    fixtureId: string,
    ownerDocument: InteractiveTestDocument,
  ): void => {
    const tag = element.tagName.toLowerCase();
    const hasName = Boolean(
      element.textContent.trim() ||
      element.attributes.get('aria-label') ||
      element.attributes.get('aria-labelledby') ||
      element.attributes.get('title'),
    );
    if (interactiveTags.has(tag) && !hasName) {
      violations.push(`${fixtureId}: ${tag} has no accessible name`);
    }
    if (interactiveTags.has(tag)) {
      element.focus();
      if (ownerDocument.activeElement !== element) {
        violations.push(`${fixtureId}: ${tag} cannot receive keyboard focus`);
      }
    }
    if (tag === 'img' && !element.attributes.has('alt')) {
      violations.push(`${fixtureId}: img has no alt attribute`);
    }
    if (tag === 'progress' && !element.attributes.get('aria-label')) {
      violations.push(`${fixtureId}: progress has no accessible label`);
    }
    element.children.forEach((child) => visit(child, fixtureId, ownerDocument));
  };

  for (const fixture of createAllGamePhaseFixtures()) {
    const ownerDocument = new InteractiveTestDocument();
    const rendered = renderComponentFixture(fixture, ownerDocument);
    visit(asInteractive(rendered.root), fixture.id, ownerDocument);
  }

  assert.deepEqual(violations, []);
});

test('production game renderers expose distinctive dense and empty result states', () => {
  const fixturesAndExpectedCopy = [
    [createGamePhaseFixture('groupthink', 'results', 'dense-tie'), 'Thought clusters'],
    [createGamePhaseFixture('hot-take', 'results', 'dense-tie'), 'The room has spoken'],
    [createGamePhaseFixture('suspect', 'results', 'dense-tie'), 'Case results'],
    [createGamePhaseFixture('drawn-out', 'results', 'dense-tie'), 'Original prompt:'],
    [createDrawnOutResultFixture('telephone', 'dense-tie'), 'Chain description 2'],
    [createDrawnOutResultFixture('fake-artist', 'dense-tie'), 'was the fake artist'],
    [createGamePhaseFixture('groupthink', 'results', 'zero'), 'No matching thoughts'],
    [createGamePhaseFixture('hot-take', 'results', 'zero'), 'No takes reached the stage'],
    [createGamePhaseFixture('suspect', 'results', 'zero'), 'No accusations were cast'],
    [createGamePhaseFixture('drawn-out', 'results', 'zero'), 'No guesses made it'],
  ] as const;

  for (const [fixture, expectedCopy] of fixturesAndExpectedCopy) {
    const rendered = renderComponentFixture(fixture, new InteractiveTestDocument());
    assert.ok(collectText(rendered.stage).includes(expectedCopy), fixture.id);
  }
});

test('retained stage keeps keyboard focus, selection, and draft across unrelated updates', () => {
  const ownerDocument = new InteractiveTestDocument();
  const shell = createRoomStageShellComponent('display-experience', ownerDocument);
  const submissions: string[] = [];
  const control = createInteractiveFixtureControl(ownerDocument, 'round-3:answer', (answer) =>
    submissions.push(answer),
  );
  let stageRenderCount = 0;
  const roster = ownerDocument.createElement('aside');
  const model = (topbarKey: string) => ({
    shellClass: 'fixture-shell',
    topbar: {
      key: topbarKey,
      render: () => ownerDocument.createElement('header'),
    },
    roomPass: { key: 'RIOT', render: () => ownerDocument.createElement('aside') },
    stage: {
      key: 'round-3:answer',
      render: () => {
        stageRenderCount += 1;
        return control.element;
      },
    },
    roster,
  });

  shell.update(model('connected'));
  control.input.value = LONG_FIXTURE_TEXT;
  control.input.selectionStart = 17;
  control.input.selectionEnd = 41;
  control.input.focus();
  asInteractive(control.input).dispatch('input');
  shell.update(model('reconnecting'));
  control.update('round-3:answer');

  assert.equal(stageRenderCount, 1);
  assert.equal(ownerDocument.activeElement, asInteractive(control.input));
  assert.equal(control.input.value, LONG_FIXTURE_TEXT);
  assert.equal(control.input.selectionStart, 17);
  assert.equal(control.input.selectionEnd, 41);
  assert.deepEqual(control.drafts.getState(), {
    actionKey: 'round-3:answer',
    answer: LONG_FIXTURE_TEXT,
  });

  const enter = asInteractive(control.input).dispatch('keydown', { key: 'Enter' });
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(submissions, [LONG_FIXTURE_TEXT]);

  const shiftedEnter = asInteractive(control.input).dispatch('keydown', {
    key: 'Enter',
    shiftKey: true,
  });
  assert.equal(shiftedEnter.defaultPrevented, false);
  assert.deepEqual(submissions, [LONG_FIXTURE_TEXT]);

  asInteractive(control.submit).click();
  assert.deepEqual(submissions, [LONG_FIXTURE_TEXT, LONG_FIXTURE_TEXT]);
});

test('interactive fixture drops a stale draft only when the authoritative action changes', () => {
  const ownerDocument = new InteractiveTestDocument();
  const control = createInteractiveFixtureControl(ownerDocument, 'round-1', () => undefined);
  control.input.value = 'still editing';
  asInteractive(control.input).dispatch('input');
  control.update('round-1');
  assert.equal(control.input.value, 'still editing');
  assert.equal(control.drafts.getState()?.answer, 'still editing');

  control.update('round-2');
  assert.equal(control.input.value, '');
  assert.equal(control.drafts.getState(), null);
});
