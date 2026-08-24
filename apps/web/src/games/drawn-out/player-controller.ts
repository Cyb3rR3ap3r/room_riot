import type { DrawnOutPlayerView, DrawnOutPublicView } from '@room-riot/drawn-out';

import {
  appendWaiting,
  createButton,
  createControllerRoot,
  createField,
  createTextInput,
  result,
  type PlayerControllerContext,
  type PlayerControllerDependencies,
  type PlayerControllerRenderResult,
} from '../player-controller.js';
import { appendDrawnOutResults } from './public-stage.js';

export function renderDrawnOutPlayerController(
  context: PlayerControllerContext,
  game: DrawnOutPublicView,
  player: DrawnOutPlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const root = createControllerRoot(dependencies.document);
  appendInstruction(root, player, dependencies);
  if (player.task === 'draw') return renderDrawing(context, player, root, dependencies);
  if (player.task === 'describe' || player.task === 'guess') {
    return renderDescriptionOrGuess(context, player, root, dependencies);
  }
  if (player.task === 'vote' && !player.hasSubmitted) {
    const form = renderVote(context, player, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (game.status === 'results' || game.status === 'complete') {
    if (game.drawing) root.append(dependencies.createDrawingPreview(game.drawing));
    appendDrawnOutResults(root, game, context.room, dependencies);
  } else {
    appendWaiting(
      root,
      dependencies.document,
      player.hasSubmitted ? 'Locked in. Watch the big screen.' : 'Another artist has the marker.',
    );
  }
  return result(root, null);
}

function appendInstruction(
  root: HTMLElement,
  player: DrawnOutPlayerView,
  dependencies: PlayerControllerDependencies,
): void {
  const instruction = dependencies.document.createElement('p');
  instruction.className = 'drawn-out-instruction';
  instruction.textContent = player.instruction;
  root.append(instruction);
  if (player.isFakeArtist) {
    const warning = dependencies.document.createElement('p');
    warning.className = 'drawn-out-fake-warning';
    warning.textContent = 'You are the fake artist. Blend in and do not panic.';
    root.append(warning);
  } else if (player.privatePrompt) {
    const prompt = dependencies.document.createElement('p');
    prompt.className = 'prompt drawn-out-private-prompt';
    prompt.textContent = player.privatePrompt;
    root.append(prompt);
  }
}

function renderDrawing(
  context: PlayerControllerContext,
  player: DrawnOutPlayerView,
  root: HTMLElement,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  if (player.mode === 'fake-artist' && player.drawing) {
    const label = dependencies.document.createElement('strong');
    label.textContent = 'Shared drawing so far';
    root.append(label, dependencies.createDrawingPreview(player.drawing, 'controller-drawing'));
  }
  const pad = dependencies.createDrawingPad(context.draft?.drawing ?? null, (drawing) =>
    dependencies.saveDraft({ drawing }),
  );
  const submit = createButton(dependencies.document, 'Submit My Strokes');
  submit.addEventListener('click', () => {
    const drawing = pad.getDrawing();
    if (!drawing.strokes.length) {
      dependencies.showNotice('Add at least one stroke before submitting.', true);
      return;
    }
    dependencies.mutations.submitDrawing({
      drawing,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'draw',
        title: 'Drawing accepted',
        acceptedLabel: 'Submitted drawing',
        acceptedValue: `${drawing.strokes.length} stroke${drawing.strokes.length === 1 ? '' : 's'}`,
        nextStep: 'Your strokes are saved. Watch the chain continue on the big screen.',
      },
    });
  });
  const control = dependencies.document.createElement('div');
  control.className = 'action-first-drawing-control';
  control.append(pad.element, submit);
  return result(root, control, pad);
}

function renderDescriptionOrGuess(
  context: PlayerControllerContext,
  player: DrawnOutPlayerView,
  root: HTMLElement,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  if (player.task === 'describe' && player.drawing) {
    root.append(dependencies.createDrawingPreview(player.drawing, 'controller-drawing'));
  }
  if (player.hasSubmitted) {
    if (player.task === 'guess') {
      appendWaiting(
        root,
        dependencies.document,
        `Choice locked: “${player.ownGuess ?? 'Mystery prompt'}” · waiting for the room.`,
      );
    }
    return result(root, null);
  }

  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className =
    player.task === 'guess'
      ? 'answer-form drawn-out-choice-form'
      : 'answer-form drawn-out-text-form';
  let answer = context.draft?.answer ?? context.draft?.selections?.[0] ?? '';
  if (player.task === 'guess') {
    const legend = dependencies.document.createElement('h3');
    legend.textContent = 'What was the original prompt?';
    const choices = dependencies.document.createElement('div');
    choices.className = 'drawn-out-choice-grid';
    const cards: HTMLButtonElement[] = [];
    for (const [index, option] of player.guessOptions.entries()) {
      const choice = createButton(dependencies.document, `${index + 1}. ${option.text}`);
      choice.className = 'drawn-out-choice';
      choice.setAttribute('aria-pressed', String(option.id === answer));
      choice.addEventListener('click', () => {
        answer = option.id;
        dependencies.saveDraft({ selections: [answer] });
        cards.forEach((card) => card.setAttribute('aria-pressed', String(card === choice)));
      });
      cards.push(choice);
      choices.append(choice);
    }
    form.append(legend, choices);
  } else {
    const input = createTextInput(dependencies.document, answer);
    input.maxLength = 180;
    input.placeholder = 'Describe what you think this is…';
    input.addEventListener('input', () => {
      answer = input.value;
      dependencies.saveDraft({ answer });
    });
    form.append(input);
  }
  const submit = createButton(
    dependencies.document,
    player.task === 'guess' ? 'Lock My Choice' : 'Pass This Description',
    'submit',
  );
  form.append(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!answer.trim()) {
      dependencies.showNotice(
        player.task === 'guess'
          ? 'Choose one of the four prompts first.'
          : 'Add a description first.',
        true,
      );
      return;
    }
    const acceptedGuess =
      player.task === 'guess'
        ? player.guessOptions.find((option) => option.id === answer)?.text
        : undefined;
    dependencies.mutations.submitAnswer({
      answer,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'answer',
        title: player.task === 'guess' ? 'Choice accepted' : 'Description accepted',
        acceptedLabel: player.task === 'guess' ? 'Locked choice' : 'Submitted description',
        acceptedValue: acceptedGuess ?? answer,
        nextStep: 'Your turn is locked. Watch the chain continue on the big screen.',
      },
    });
  });
  root.append(form);
  return result(root, form);
}

function renderVote(
  context: PlayerControllerContext,
  player: DrawnOutPlayerView,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form drawn-out-vote-form';
  const select = dependencies.document.createElement('select') as HTMLSelectElement;
  for (const playerId of player.candidatePlayerIds) {
    const candidate = context.room.players.find(({ id }) => id === playerId);
    const option = dependencies.document.createElement('option') as HTMLOptionElement;
    option.value = playerId;
    option.textContent = `${candidate?.avatar ?? '🎨'} ${candidate?.name ?? 'Player'}`;
    select.append(option);
  }
  select.value = context.draft?.selections?.[0] ?? select.value;
  select.addEventListener('change', () => dependencies.saveDraft({ selections: [select.value] }));
  const submit = createButton(dependencies.document, 'Accuse This Artist', 'submit');
  form.append(createField(dependencies.document, 'Suspicious artist', select), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!select.value) return;
    const selected = context.room.players.find(({ id }) => id === select.value);
    dependencies.mutations.castVote({
      entryId: select.value,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'vote',
        title: 'Accusation accepted',
        acceptedLabel: 'Accused artist',
        acceptedValue: selected?.name ?? 'Selected artist',
        nextStep: 'Waiting for the other artists.',
      },
    });
  });
  return form;
}
