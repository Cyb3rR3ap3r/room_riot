import type { BlankLinePlayerView, BlankLinePublicView } from '@room-riot/blank-line';

import {
  appendWaiting,
  createButton,
  createControllerRoot,
  result,
  type PlayerControllerContext,
  type PlayerControllerDependencies,
  type PlayerControllerRenderResult,
} from '../player-controller.js';

export function renderBlankLinePlayerController(
  context: PlayerControllerContext,
  game: BlankLinePublicView,
  player: BlankLinePlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const root = createControllerRoot(dependencies.document);
  root.classList.add('blank-line-controller-body');
  appendRoleCard(root, player, dependencies);

  if (player.drawing.strokes.length > 0) {
    const shared = dependencies.document.createElement('section');
    shared.className = 'blank-line-controller-preview';
    const label = dependencies.document.createElement('strong');
    label.textContent = 'Shared canvas right now';
    shared.append(label, dependencies.createDrawingPreview(player.drawing, 'controller-drawing'));
    root.append(shared);
  }

  if (player.task === 'draw') return renderOneStroke(context, root, dependencies);
  if (player.task === 'vote' && !player.hasSubmitted) {
    const form = renderVote(context, player, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (game.status === 'results' || game.status === 'complete') {
    appendPersonalReveal(root, game, context, dependencies);
  } else {
    appendWaiting(
      root,
      dependencies.document,
      player.hasSubmitted
        ? 'Ballot sealed. Keep talking and watch the big screen.'
        : 'Watch every stroke and decide what you would add next.',
    );
  }
  return result(root, null);
}

function appendRoleCard(
  root: HTMLElement,
  player: BlankLinePlayerView,
  dependencies: PlayerControllerDependencies,
): void {
  const card = dependencies.document.createElement('section');
  card.className = `blank-line-role-card ${player.isBlank ? 'is-blank' : 'is-informed'}`;
  const eyebrow = dependencies.document.createElement('span');
  eyebrow.textContent = player.isBlank ? 'Classified role' : 'Your secret topic';
  const title = dependencies.document.createElement('h3');
  title.textContent = player.isBlank
    ? 'YOU ARE THE BLANK'
    : (player.privatePrompt ?? 'Topic hidden');
  const instruction = dependencies.document.createElement('p');
  instruction.textContent = player.instruction;
  card.append(eyebrow, title, instruction);
  root.append(card);
}

function renderOneStroke(
  context: PlayerControllerContext,
  root: HTMLElement,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const turnBanner = dependencies.document.createElement('div');
  turnBanner.className = 'blank-line-your-turn';
  turnBanner.textContent = 'MARKER LIVE · Draw exactly one continuous stroke';
  root.append(turnBanner);
  const initial = context.draft?.drawing?.strokes.length === 1 ? context.draft.drawing : null;
  const pad = dependencies.createDrawingPad(
    initial,
    (drawing) => dependencies.saveDraft({ drawing }),
    1,
  );
  const submit = createButton(dependencies.document, 'Commit This Line');
  submit.className = 'blank-line-commit';
  submit.addEventListener('click', () => {
    const drawing = pad.getDrawing();
    if (drawing.strokes.length !== 1 || (drawing.strokes[0]?.points.length ?? 0) < 2) {
      dependencies.showNotice('Draw one continuous line before committing it.', true);
      return;
    }
    dependencies.mutations.submitDrawing({
      drawing,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'draw',
        title: 'Line committed',
        acceptedLabel: 'Shared canvas updated',
        acceptedValue: '1 continuous stroke',
        nextStep: 'The next artist has the marker. Watch how they react to your line.',
      },
    });
  });
  const control = dependencies.document.createElement('section');
  control.className = 'action-first-drawing-control blank-line-one-stroke-control';
  control.append(pad.element, submit);
  root.append(control);
  return result(root, control, pad);
}

function renderVote(
  context: PlayerControllerContext,
  player: BlankLinePlayerView,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form blank-line-ballot';
  const heading = dependencies.document.createElement('h3');
  heading.textContent = 'Who was drawing blind?';
  const helper = dependencies.document.createElement('p');
  helper.textContent = 'Your vote is private. A tied vote lets the Blank escape.';
  helper.className = 'muted';
  const grid = dependencies.document.createElement('div');
  grid.className = 'blank-line-candidate-grid';
  let selectedId = context.draft?.selections?.[0] ?? '';
  const cards: HTMLButtonElement[] = [];
  for (const playerId of player.candidatePlayerIds) {
    const candidate = context.room.players.find(({ id }) => id === playerId);
    const card = createButton(
      dependencies.document,
      `${candidate?.avatar ?? '✎'} ${candidate?.name ?? 'Artist'}`,
    );
    card.className = 'blank-line-candidate';
    card.setAttribute('aria-pressed', String(playerId === selectedId));
    card.addEventListener('click', () => {
      selectedId = playerId;
      dependencies.saveDraft({ selections: [playerId] });
      cards.forEach((candidateCard) =>
        candidateCard.setAttribute('aria-pressed', String(candidateCard === card)),
      );
    });
    cards.push(card);
    grid.append(card);
  }
  const submit = createButton(dependencies.document, 'Seal My Accusation', 'submit');
  form.append(heading, helper, grid, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selectedId) {
      dependencies.showNotice('Choose the artist you think was drawing blind.', true);
      return;
    }
    const selected = context.room.players.find(({ id }) => id === selectedId);
    dependencies.mutations.castVote({
      entryId: selectedId,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'vote',
        title: 'Accusation sealed',
        acceptedLabel: 'Suspected Blank',
        acceptedValue: selected?.name ?? 'Selected artist',
        nextStep: 'Keep your poker face while the other ballots come in.',
      },
    });
  });
  return form;
}

function appendPersonalReveal(
  root: HTMLElement,
  game: BlankLinePublicView,
  context: PlayerControllerContext,
  dependencies: PlayerControllerDependencies,
): void {
  const blank = context.room.players.find(({ id }) => id === game.blankPlayerId);
  const card = dependencies.document.createElement('section');
  card.className = `blank-line-personal-reveal ${game.blankCaught ? 'is-caught' : 'is-escaped'}`;
  const title = dependencies.document.createElement('h3');
  title.textContent = game.blankCaught ? 'The Blank was exposed.' : 'The Blank escaped.';
  const identity = dependencies.document.createElement('strong');
  identity.textContent = `${blank?.avatar ?? '◌'} ${blank?.name ?? 'The Blank'}`;
  const topic = dependencies.document.createElement('p');
  topic.textContent = `Topic: ${game.prompt ?? 'Unknown'}`;
  card.append(title, identity, topic);
  root.append(card);
}
