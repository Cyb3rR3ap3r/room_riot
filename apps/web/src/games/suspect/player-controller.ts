import type { SuspectPlayerView, SuspectPublicView } from '@room-riot/suspect';

import {
  appendWaiting,
  createButton,
  createControllerRoot,
  createField,
  result,
  type PlayerControllerContext,
  type PlayerControllerDependencies,
  type PlayerControllerRenderResult,
} from '../player-controller.js';
import { appendSuspectResults } from './public-stage.js';

export function renderSuspectPlayerController(
  context: PlayerControllerContext,
  game: SuspectPublicView,
  player: SuspectPlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const root = createControllerRoot(dependencies.document);
  if (context.phase === 'input' && !player.hasSubmitted) {
    const form = renderPrivateAnswerForm(context, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (context.phase === 'input') {
    appendWaiting(
      root,
      dependencies.document,
      `Private answer locked: ${player.ownAnswer ? 'Yes' : 'No'} · waiting for the room.`,
    );
    return result(root, null);
  }
  if (context.phase === 'alibi' && player.canSubmitAlibi && !player.ownAlibi) {
    const form = renderAlibiForm(context, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (context.phase === 'alibi') {
    appendWaiting(
      root,
      dependencies.document,
      player.alibiPlayerId === context.playerId
        ? 'Your alibi is locked. Watch the jury.'
        : 'The accused player is preparing an alibi.',
    );
    return result(root, null);
  }
  if (context.phase === 'voting' && !player.hasVoted) {
    const form = renderVotingForm(context, player, dependencies);
    root.append(form);
    return result(root, form);
  }
  if (context.phase === 'voting') {
    appendWaiting(root, dependencies.document, 'Accusation locked · waiting for the jury.');
  } else if (context.phase === 'results' || context.phase === 'winner') {
    appendWaiting(root, dependencies.document, 'The case results are on the big screen.');
    appendSuspectResults(root, game, context.room, dependencies);
  }
  return result(root, null);
}

function renderPrivateAnswerForm(
  context: PlayerControllerContext,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form suspect-answer-form';
  const choice = dependencies.document.createElement('select') as HTMLSelectElement;
  for (const [value, label] of [
    ['yes', 'Yes — this applies to me'],
    ['no', 'No — not me'],
  ] as const) {
    const option = dependencies.document.createElement('option') as HTMLOptionElement;
    option.value = value;
    option.textContent = label;
    choice.append(option);
  }
  choice.value = context.draft?.answer ?? 'yes';
  choice.addEventListener('change', () => dependencies.saveDraft({ answer: choice.value }));
  const submit = createButton(dependencies.document, 'Lock My Answer', 'submit');
  form.append(createField(dependencies.document, 'Private answer', choice), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dependencies.mutations.submitAnswer({
      answer: choice.value,
      trigger: submit,
      acceptedAction: {
        phase: 'input',
        action: 'answer',
        title: 'Private answer accepted',
        acceptedLabel: 'Locked answer',
        acceptedValue: choice.value === 'yes' ? 'Yes' : 'No',
        nextStep: 'Waiting for the rest of the jury.',
      },
    });
  });
  return form;
}

function renderAlibiForm(
  context: PlayerControllerContext,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form suspect-alibi-form';
  const textarea = dependencies.document.createElement('textarea') as HTMLTextAreaElement;
  textarea.maxLength = 280;
  textarea.rows = 4;
  textarea.placeholder = 'Make your case in 280 characters…';
  textarea.value = context.draft?.answer ?? '';
  textarea.addEventListener('input', () => dependencies.saveDraft({ answer: textarea.value }));
  const submit = createButton(dependencies.document, 'Submit Alibi', 'submit');
  form.append(createField(dependencies.document, 'Your alibi', textarea), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!textarea.value.trim()) return;
    dependencies.mutations.submitAlibi({
      alibi: textarea.value,
      trigger: submit,
      acceptedAction: {
        phase: 'alibi',
        action: 'alibi',
        title: 'Alibi accepted',
        acceptedLabel: 'Submitted alibi',
        acceptedValue: textarea.value,
        nextStep: 'Watch the jury decide.',
      },
    });
  });
  return form;
}

function renderVotingForm(
  context: PlayerControllerContext,
  player: SuspectPlayerView,
  dependencies: PlayerControllerDependencies,
): HTMLFormElement {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form suspect-vote-form';
  const selects: HTMLSelectElement[] = [];
  const addSelect = (label: string): void => {
    const select = dependencies.document.createElement('select') as HTMLSelectElement;
    for (const playerId of player.candidatePlayerIds) {
      const candidate = context.room.players.find(({ id }) => id === playerId);
      const option = dependencies.document.createElement('option') as HTMLOptionElement;
      option.value = playerId;
      option.textContent = `${candidate?.avatar ?? '🕵️'} ${candidate?.name ?? 'Unknown player'}`;
      select.append(option);
    }
    selects.push(select);
    const savedSelection = context.draft?.selections?.[selects.length - 1];
    if (savedSelection) select.value = savedSelection;
    select.addEventListener('change', () =>
      dependencies.saveDraft({ selections: selects.map(({ value }) => value) }),
    );
    form.append(createField(dependencies.document, label, select));
  };
  if (player.roundType === 'double-trouble') {
    addSelect('First suspect');
    addSelect('Second suspect');
  } else {
    addSelect(player.roundType === 'most-likely' ? 'Most likely' : 'Suspect');
  }

  const noMatch = dependencies.document.createElement('label');
  noMatch.className = 'checkbox-field';
  const noMatchInput = dependencies.document.createElement('input') as HTMLInputElement;
  noMatchInput.type = 'checkbox';
  noMatchInput.checked = context.draft?.noMatch ?? false;
  noMatchInput.addEventListener('change', () =>
    dependencies.saveDraft({
      noMatch: noMatchInput.checked,
      selections: selects.map(({ value }) => value),
    }),
  );
  const noMatchText = dependencies.document.createElement('span');
  noMatchText.textContent = 'No match — call the accusation fake';
  noMatch.append(noMatchInput, noMatchText);
  noMatch.hidden = player.roundType === 'most-likely';
  const submit = createButton(dependencies.document, 'Submit Accusation', 'submit');
  form.append(noMatch, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const targets = noMatchInput.checked ? [] : selects.map(({ value }) => value).filter(Boolean);
    if (
      player.roundType === 'double-trouble' &&
      targets.length === 2 &&
      targets[0] === targets[1]
    ) {
      dependencies.showNotice('Choose two different suspects.', true);
      return;
    }
    if (!targets.length && player.roundType === 'most-likely') {
      dependencies.showNotice('Choose the player who fits best.', true);
      return;
    }
    const entryId =
      targets.length === 0
        ? 'none'
        : targets.length === 1
          ? `player:${targets[0]}`
          : `players:${targets.join(',')}`;
    const selectedNames = targets
      .map(
        (target) => context.room.players.find(({ id }) => id === target)?.name ?? 'Unknown player',
      )
      .join(' and ');
    dependencies.mutations.castVote({
      entryId,
      trigger: submit,
      acceptedAction: {
        phase: 'voting',
        action: 'vote',
        title: 'Accusation accepted',
        acceptedLabel: 'Your accusation',
        acceptedValue: noMatchInput.checked ? 'No match' : selectedNames,
        nextStep: 'Waiting for the rest of the jury.',
      },
    });
  });
  return form;
}
