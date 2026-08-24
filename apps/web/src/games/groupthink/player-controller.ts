import type { GroupthinkPlayerView, GroupthinkPublicView } from '@room-riot/groupthink';

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
import { appendGroupthinkResults } from './public-stage.js';

export function renderGroupthinkPlayerController(
  context: PlayerControllerContext,
  game: GroupthinkPublicView,
  player: GroupthinkPlayerView,
  dependencies: PlayerControllerDependencies,
): PlayerControllerRenderResult {
  const root = createControllerRoot(dependencies.document);
  if (context.phase === 'input' && !player.hasSubmitted) {
    const form = dependencies.document.createElement('form');
    form.className = 'answer-form mind-answer-form';
    const input = createTextInput(dependencies.document, context.draft?.answer ?? '');
    input.placeholder = 'Type your answer…';
    input.maxLength = 500;
    input.addEventListener('input', () => dependencies.saveDraft({ answer: input.value }));
    const submit = createButton(dependencies.document, 'Lock In My Thought', 'submit');
    form.append(input, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      dependencies.mutations.submitAnswer({
        answer: input.value,
        trigger: submit,
        acceptedAction: {
          phase: 'input',
          action: 'answer',
          title: 'Thought accepted',
          acceptedLabel: 'Submitted answer',
          acceptedValue: input.value,
          nextStep: 'Waiting for every mind to lock in.',
        },
      });
    });
    root.append(form);
    return result(root, form);
  }
  if (context.phase === 'input' && player.hasSubmitted) {
    appendWaiting(
      root,
      dependencies.document,
      `Submitted: “${player.ownAnswer ?? ''}” · waiting for the room.`,
    );
  } else if (context.phase === 'results' || context.phase === 'winner') {
    appendWaiting(root, dependencies.document, 'Results are on the big screen.');
    appendGroupthinkResults(root, game, dependencies);
  }
  return result(root, null);
}
