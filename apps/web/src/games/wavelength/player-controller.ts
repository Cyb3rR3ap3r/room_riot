import type { WavelengthPlayerView, WavelengthPublicView } from '@room-riot/wavelength';

import {
  appendWaiting,
  createButton,
  createControllerRoot,
  createTextInput,
  result,
  type PlayerControllerContext,
  type PlayerControllerDependencies,
  type PlayerControllerRenderResult,
} from '../player-controller.js';

export function renderWavelengthPlayerController(
  context: PlayerControllerContext,
  game: WavelengthPublicView,
  player: WavelengthPlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const root = createControllerRoot(dependencies.document);
  root.classList.add('wavelength-controller-body');
  root.append(createSignalCard(player, dependencies));

  if (player.task === 'clue') return renderClue(context, root, player, dependencies);
  if (player.task === 'tune') return renderTuner(context, root, player, dependencies);
  if (player.task === 'intercept') return renderIntercept(context, root, dependencies);
  if (game.status === 'results' || game.status === 'complete') {
    appendPersonalResult(root, game, player, dependencies);
  } else {
    appendWaiting(root, dependencies.document, waitingCopy(player));
  }
  return result(root, null);
}

function createSignalCard(
  player: WavelengthPlayerView,
  dependencies: PlayerControllerDependencies,
): HTMLElement {
  const card = dependencies.document.createElement('section');
  card.className = `wavelength-private-card${player.privateTarget === null ? '' : ' is-broadcaster'}`;
  const eyebrow = dependencies.document.createElement('span');
  eyebrow.textContent =
    player.privateTarget === null
      ? player.teamId
        ? `${player.teamId} channel`
        : 'Open channel'
      : 'Broadcaster clearance';
  const poles = dependencies.document.createElement('div');
  poles.className = 'wavelength-mini-poles';
  const left = dependencies.document.createElement('strong');
  left.textContent = player.leftPole;
  const right = dependencies.document.createElement('strong');
  right.textContent = player.rightPole;
  poles.append(left, right);
  card.append(eyebrow, poles);
  if (player.privateTarget !== null && !['results', 'complete'].includes(player.status)) {
    const target = dependencies.document.createElement('div');
    target.className = 'wavelength-private-target';
    target.setAttribute('style', `--target: ${player.privateTarget}%`);
    const dot = dependencies.document.createElement('i');
    dot.setAttribute('aria-hidden', 'true');
    const label = dependencies.document.createElement('b');
    label.textContent = `Hidden signal: ${player.privateTarget}`;
    target.append(dot, label);
    card.append(target);
  }
  const instruction = dependencies.document.createElement('p');
  instruction.textContent = player.instruction;
  card.append(instruction);
  return card;
}

function renderClue(
  context: PlayerControllerContext,
  root: HTMLElement,
  player: WavelengthPlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'answer-form wavelength-clue-form';
  const label = dependencies.document.createElement('label');
  const copy = dependencies.document.createElement('span');
  copy.textContent = 'Send one clue to the room';
  const input = createTextInput(dependencies.document, context.draft?.answer ?? '');
  input.maxLength = 80;
  input.placeholder = 'One idea · no numbers · no pole words';
  input.addEventListener('input', () => dependencies.saveDraft({ answer: input.value }));
  label.append(copy, input);
  const helper = dependencies.document.createElement('small');
  helper.textContent = `${player.leftPole} ↔ ${player.rightPole}`;
  const submit = createButton(dependencies.document, 'Transmit Clue', 'submit');
  form.append(label, helper, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answer = input.value.trim();
    if (!answer) {
      dependencies.showNotice('Enter one clue before transmitting.', true);
      return;
    }
    dependencies.mutations.submitAnswer({
      answer,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'answer',
        title: 'Clue transmitted',
        acceptedLabel: 'Your broadcast',
        acceptedValue: answer,
        nextStep: 'Stay neutral while the receivers debate and tune.',
      },
    });
  });
  root.append(form);
  return result(root, form);
}

function renderTuner(
  context: PlayerControllerContext,
  root: HTMLElement,
  player: WavelengthPlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'wavelength-tuner-form';
  const heading = dependencies.document.createElement('h3');
  heading.textContent = player.isGuestReceiver
    ? 'Guest receiver online'
    : 'Lock your private signal';
  const clue = dependencies.document.createElement('blockquote');
  clue.textContent = player.clue ? `“${player.clue}”` : 'Signal incoming…';
  const savedPosition = Number(context.draft?.selections?.[0] ?? 50);
  const savedConfidence = Number(context.draft?.selections?.[1] ?? 2);
  const dial = dependencies.document.createElement('input') as HTMLInputElement;
  dial.type = 'range';
  dial.min = '0';
  dial.max = '100';
  dial.step = '1';
  dial.value = String(Number.isFinite(savedPosition) ? savedPosition : 50);
  dial.className = 'wavelength-private-dial';
  dial.setAttribute(
    'aria-label',
    `Signal position between ${player.leftPole} and ${player.rightPole}`,
  );
  const value = dependencies.document.createElement('output') as HTMLOutputElement;
  value.textContent = dial.value;
  const poles = dependencies.document.createElement('div');
  poles.className = 'wavelength-dial-poles';
  const left = dependencies.document.createElement('span');
  left.textContent = player.leftPole;
  const right = dependencies.document.createElement('span');
  right.textContent = player.rightPole;
  poles.append(left, right);
  let confidence = [1, 2, 3].includes(savedConfidence) ? savedConfidence : 2;
  const confidenceGroup = dependencies.document.createElement('div');
  confidenceGroup.className = 'wavelength-confidence';
  const confidenceButtons = [1, 2, 3].map((level) => {
    const button = createButton(
      dependencies.document,
      level === 1 ? 'Hunch' : level === 2 ? 'Confident' : 'Certain',
    );
    button.setAttribute('aria-pressed', String(confidence === level));
    button.addEventListener('click', () => {
      confidence = level;
      confidenceButtons.forEach((candidate, index) =>
        candidate.setAttribute('aria-pressed', String(index + 1 === confidence)),
      );
      dependencies.saveDraft({ selections: [dial.value, String(confidence)] });
    });
    confidenceGroup.append(button);
    return button;
  });
  dial.addEventListener('input', () => {
    value.textContent = dial.value;
    dependencies.saveDraft({ selections: [dial.value, String(confidence)] });
  });
  const submit = createButton(dependencies.document, 'Lock Receiver', 'submit');
  form.append(heading, clue, value, dial, poles, confidenceGroup, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dependencies.mutations.castVote({
      entryId: `marker:${dial.value}:${confidence}`,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'vote',
        title: 'Receiver locked',
        acceptedLabel: 'Private signal',
        acceptedValue: `${dial.value} · confidence ${confidence}`,
        nextStep: 'Your exact marker stays private until the scan reveal.',
      },
    });
  });
  root.append(form);
  return result(root, form);
}

function renderIntercept(
  context: PlayerControllerContext,
  root: HTMLElement,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const form = dependencies.document.createElement('form') as HTMLFormElement;
  form.className = 'wavelength-intercept-form';
  const heading = dependencies.document.createElement('h3');
  heading.textContent = 'Read their drift';
  const helper = dependencies.document.createElement('p');
  helper.textContent = 'Where is the hidden signal relative to their final lock?';
  const grid = dependencies.document.createElement('div');
  grid.className = 'wavelength-intercept-grid';
  let selected = context.draft?.selections?.[0] ?? '';
  const choices = [
    ['low', 'Signal is higher'],
    ['locked', 'They nailed it'],
    ['high', 'Signal is lower'],
  ] as const;
  const buttons = choices.map(([id, label]) => {
    const button = createButton(dependencies.document, label);
    button.setAttribute('aria-pressed', String(selected === id));
    button.addEventListener('click', () => {
      selected = id;
      buttons.forEach((candidate, index) =>
        candidate.setAttribute('aria-pressed', String(choices[index]?.[0] === selected)),
      );
      dependencies.saveDraft({ selections: [selected] });
    });
    grid.append(button);
    return button;
  });
  const submit = createButton(dependencies.document, 'Seal Intercept', 'submit');
  form.append(heading, helper, grid, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selected) {
      dependencies.showNotice('Choose a drift prediction first.', true);
      return;
    }
    dependencies.mutations.castVote({
      entryId: `intercept:${selected}`,
      trigger: submit,
      acceptedAction: {
        phase: context.phase,
        action: 'vote',
        title: 'Intercept sealed',
        acceptedLabel: 'Your rival read',
        acceptedValue: choices.find(([id]) => id === selected)?.[1] ?? selected,
        nextStep: 'The prediction stays private until the signal scan.',
      },
    });
  });
  root.append(form);
  return result(root, form);
}

function appendPersonalResult(
  root: HTMLElement,
  game: WavelengthPublicView,
  player: WavelengthPlayerView,
  dependencies: PlayerControllerDependencies,
): void {
  const card = dependencies.document.createElement('section');
  card.className = 'wavelength-personal-result';
  const title = dependencies.document.createElement('h3');
  title.textContent = game.result?.distance === 0 ? 'Perfect lock.' : 'Signal revealed.';
  const summary = dependencies.document.createElement('p');
  summary.textContent = `Target ${game.target ?? '—'} · room lock ${game.consensus ?? '—'} · drift ${game.result?.distance ?? '—'}`;
  card.append(title, summary);
  if (player.ownMarker) {
    const own = dependencies.document.createElement('strong');
    own.textContent = `Your marker: ${player.ownMarker.position} · confidence ${player.ownMarker.confidence}`;
    card.append(own);
  }
  root.append(card);
}

function waitingCopy(player: WavelengthPlayerView): string {
  if (player.status === 'clue') return 'The Broadcaster is composing one clean clue.';
  if (player.status === 'tuning') {
    return player.hasSubmitted
      ? 'Receiver locked. Keep your exact position secret until the scan.'
      : 'Talk it out while the active receivers tune.';
  }
  if (player.status === 'intercept') {
    return player.hasSubmitted ? 'Intercept sealed.' : 'The rival channel is reading the drift.';
  }
  return 'Watch the shared display for the signal scan.';
}
