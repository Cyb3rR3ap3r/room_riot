import type { HotTakePlayerView, HotTakePublicView } from '@room-riot/hot-take';

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
import { appendHotTakeEntries } from './public-stage.js';

export function renderHotTakePlayerController(
  context: PlayerControllerContext,
  _game: HotTakePublicView,
  player: HotTakePlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const root = createControllerRoot(dependencies.document);
  if (context.phase === 'input' && !player.hasSubmitted) {
    const form = renderAnswerForm(context, player, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (context.phase === 'input' && player.hasSubmitted) {
    appendWaiting(
      root,
      dependencies.document,
      `Submitted: “${player.ownAnswer ?? ''}” · waiting for the room.`,
    );
    return result(root, null);
  }
  if (context.phase === 'voting' && !player.hasVoted) {
    const form = renderVotingForm(context, player, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (context.phase === 'voting') {
    appendWaiting(root, dependencies.document, 'Vote submitted · waiting for the room.');
  } else if (context.phase === 'results' || context.phase === 'winner') {
    appendWaiting(root, dependencies.document, 'Vote results are on the big screen.');
    if (player.ownAnswer) {
      appendWaiting(root, dependencies.document, `Your answer: “${player.ownAnswer}”`);
    }
    appendHotTakeEntries(root, player.entries, 'Vote results', true, dependencies);
  }
  return result(root, null);
}

function renderAnswerForm(
  context: PlayerControllerContext,
  player: HotTakePlayerView,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form heat-answer-form';
  let textInput: HTMLInputElement | null = null;
  let targetSelect: HTMLSelectElement | null = null;
  if (player.promptKind === 'player-targeted') {
    targetSelect = dependencies.document.createElement('select') as HTMLSelectElement;
    for (const candidate of context.room.players.filter(({ id }) => id !== context.playerId)) {
      const option = dependencies.document.createElement('option') as HTMLOptionElement;
      option.value = candidate.id;
      option.textContent = `${candidate.avatar} ${candidate.name}`;
      targetSelect.append(option);
    }
    targetSelect.value = context.draft?.selections?.[0] ?? targetSelect.value;
    targetSelect.addEventListener('change', () =>
      dependencies.saveDraft({ selections: targetSelect ? [targetSelect.value] : [] }),
    );
    form.append(createField(dependencies.document, 'Choose a player', targetSelect));
  } else {
    textInput = createTextInput(dependencies.document, context.draft?.answer ?? '');
    textInput.placeholder = 'Type your hot take…';
    textInput.maxLength = 500;
    textInput.addEventListener('input', () =>
      dependencies.saveDraft({ answer: textInput?.value ?? '' }),
    );
    form.append(textInput);
  }
  const submit = createButton(dependencies.document, 'Drop My Take', 'submit');
  form.append(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answer = targetSelect?.value ?? textInput?.value ?? '';
    if (!answer.trim()) return;
    const selectedTarget = targetSelect
      ? context.room.players.find(({ id }) => id === targetSelect?.value)
      : null;
    dependencies.mutations.submitAnswer({
      answer,
      ...(targetSelect?.value ? { targetPlayerId: targetSelect.value } : {}),
      trigger: submit,
      acceptedAction: {
        phase: 'input',
        action: 'answer',
        title: 'Take accepted',
        acceptedLabel: 'Submitted take',
        acceptedValue: selectedTarget ? `${selectedTarget.avatar} ${selectedTarget.name}` : answer,
        nextStep: 'Waiting for the remaining takes.',
      },
    });
  });
  return form;
}

function renderVotingForm(
  context: PlayerControllerContext,
  player: HotTakePlayerView,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form heat-answer-form vote-card-form';
  const legend = dependencies.document.createElement('h3');
  legend.textContent = 'Which take deserves the spotlight?';
  const choices = dependencies.document.createElement('div');
  choices.className = 'vote-card-grid';
  let selectedEntryId = context.draft?.selections?.[0] ?? '';
  const cards: HTMLButtonElement[] = [];
  for (const [index, entry] of player.entries.entries()) {
    const choice = createButton(dependencies.document, '', 'button');
    choice.className = 'vote-card';
    choice.setAttribute('aria-pressed', String(entry.entryId === selectedEntryId));
    const number = dependencies.document.createElement('span');
    number.textContent = `TAKE ${index + 1}`;
    const answer = dependencies.document.createElement('strong');
    answer.textContent = entry.answer;
    choice.append(number, answer);
    choice.addEventListener('click', () => {
      selectedEntryId = entry.entryId;
      dependencies.saveDraft({ selections: [selectedEntryId] });
      cards.forEach((card) => card.setAttribute('aria-pressed', String(card === choice)));
    });
    cards.push(choice);
    choices.append(choice);
  }
  const submit = createButton(dependencies.document, 'Send It to the Top', 'submit');
  form.append(legend, choices, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selectedEntryId) {
      dependencies.showNotice('Pick a take before voting.', true);
      return;
    }
    const selectedTake = player.entries.find(({ entryId }) => entryId === selectedEntryId)?.answer;
    dependencies.mutations.castVote({
      entryId: selectedEntryId,
      trigger: submit,
      acceptedAction: {
        phase: 'voting',
        action: 'vote',
        title: 'Vote accepted',
        acceptedLabel: 'Selected take',
        acceptedValue: selectedTake ?? 'Your spotlight vote',
        nextStep: 'Waiting for the remaining votes.',
      },
    });
  });
  return form;
}
