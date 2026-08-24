import type { RoomPhase } from '@room-riot/contracts';
import type { DrawnOutPlayerView } from '@room-riot/drawn-out';
import type { GroupthinkPlayerView } from '@room-riot/groupthink';
import type { HotTakePlayerView } from '@room-riot/hot-take';
import type { SuspectPlayerView } from '@room-riot/suspect';

import type { SupportedGameId } from '../../app/catalog.js';
import type { PlayerGameView } from '../../protocol.js';
import { createPlayerActionKey, shouldDiscardDraft } from '../../state/player-action.js';
import type { PlayerDraft } from '../../state/session-store.js';
import { getPlayerRouteViewModel } from './view-model.js';

export type ControllerLayoutMode = 'action' | 'waiting';
export type ControllerActionKind = 'answer' | 'alibi' | 'vote' | 'draw';

export interface ControllerDeadlineViewModel {
  readonly at: number;
  readonly remainingMs: number;
  readonly remainingSeconds: number;
  readonly label: string;
  readonly accessibleLabel: string;
  readonly urgency: 'normal' | 'soon' | 'expired';
}

export interface ControllerChoiceOption {
  readonly id: string;
  readonly label: string;
}

export type ControllerPrimaryControl =
  | {
      readonly kind: 'text';
      readonly action: 'answer' | 'alibi';
      readonly label: string;
      readonly accessibleLabel: string;
      readonly submitLabel: string;
      readonly placeholder: string;
      readonly multiline: boolean;
      readonly value: string;
      readonly characterLimit: number;
      readonly characterCount: number;
      readonly characterCountLabel: string;
      readonly invalid: boolean;
      readonly disabled: boolean;
    }
  | {
      readonly kind: 'choice';
      readonly action: 'answer' | 'vote';
      readonly label: string;
      readonly accessibleLabel: string;
      readonly submitLabel: string;
      readonly options: readonly ControllerChoiceOption[];
      readonly selectedIds: readonly string[];
      readonly minimumSelections: number;
      readonly maximumSelections: number;
      readonly allowNoMatch: boolean;
      readonly noMatchSelected: boolean;
      readonly disabled: boolean;
    }
  | {
      readonly kind: 'drawing';
      readonly action: 'draw';
      readonly label: string;
      readonly accessibleLabel: string;
      readonly submitLabel: string;
      readonly hasRecoveredDraft: boolean;
      readonly disabled: boolean;
    };

export interface ControllerReceiptViewModel {
  readonly action: ControllerActionKind;
  readonly title: string;
  readonly acceptedLabel: string;
  readonly acceptedValue: string | null;
  readonly nextStep: string;
}

export interface ControllerRetryViewModel {
  readonly attempt: number;
  readonly errorMessage: string;
  readonly label: string;
  readonly accessibleLabel: string;
  readonly preservesDraft: true;
}

export interface ControllerClearViewModel {
  readonly label: string;
  readonly accessibleLabel: string;
  readonly confirmationTitle: string;
  readonly confirmationMessage: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export interface ActionFirstControllerViewModel {
  readonly gameId: SupportedGameId;
  readonly phase: RoomPhase;
  readonly actionKey: string;
  readonly controllerClass: string;
  readonly title: string;
  readonly layoutMode: ControllerLayoutMode;
  readonly artMode: 'collapsed' | 'expanded';
  readonly eyebrow: string;
  readonly instruction: string;
  readonly prompt: string | null;
  readonly deadline: ControllerDeadlineViewModel | null;
  readonly primaryControl: ControllerPrimaryControl | null;
  readonly receipt: ControllerReceiptViewModel | null;
  readonly waitingMessage: string | null;
  readonly retry: ControllerRetryViewModel | null;
  readonly clearDraft: ControllerClearViewModel | null;
}

export type ControllerOperationState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly attempt: number; readonly message: string };

/**
 * Exact value captured from a successful acknowledgement. Some game-private views intentionally
 * expose only `hasVoted`/`hasSubmitted`, so the route retains this until the action/phase changes.
 */
export interface ControllerAcceptedAction {
  readonly phase: RoomPhase;
  readonly action: ControllerActionKind;
  readonly title: string;
  readonly acceptedLabel: string;
  readonly acceptedValue: string;
  readonly nextStep: string;
}

export interface ActionFirstControllerInput {
  readonly gameId: SupportedGameId;
  readonly roomCode: string;
  readonly playerId: string;
  readonly phase: RoomPhase;
  /** Pass the current public game snapshot to produce the exact key used by the existing draft store. */
  readonly publicGame?: unknown;
  readonly playerState: PlayerGameView | null;
  readonly draft: PlayerDraft | null;
  readonly playerLabels?: Readonly<Record<string, string>>;
  readonly operation?: ControllerOperationState;
  readonly acceptedAction?: ControllerAcceptedAction;
  readonly now?: number;
}

const EMPTY_OPERATION: ControllerOperationState = { status: 'idle' };

export function createActionFirstControllerViewModel(
  input: ActionFirstControllerInput,
): ActionFirstControllerViewModel {
  const state = input.playerState?.id === input.gameId ? input.playerState : null;
  const actionKey = createPlayerActionKey({
    roomCode: input.roomCode,
    gameId: input.gameId,
    phase: input.phase,
    game: input.publicGame ?? state,
    playerState: state,
  });
  const draft = shouldDiscardDraft(input.draft, actionKey) ? null : input.draft;
  const operation = input.operation ?? EMPTY_OPERATION;
  const route = getPlayerRouteViewModel(input.gameId, input.phase);
  const specific = state
    ? createGameState(input.gameId, state, draft, input.playerId, input.playerLabels ?? {})
    : createPhaseFallback(input.phase);
  const primaryControl = setPending(specific.primaryControl, operation.status === 'pending');
  const receiptModel =
    !primaryControl && input.acceptedAction?.phase === input.phase
      ? receipt(
          input.acceptedAction.action,
          input.acceptedAction.title,
          input.acceptedAction.acceptedLabel,
          input.acceptedAction.acceptedValue,
          input.acceptedAction.nextStep,
        )
      : specific.receipt;
  const layoutMode: ControllerLayoutMode = primaryControl ? 'action' : 'waiting';

  return {
    gameId: input.gameId,
    phase: input.phase,
    actionKey,
    controllerClass: route.controllerClass,
    title: route.controllerTitle,
    layoutMode,
    artMode: layoutMode === 'action' ? 'collapsed' : 'expanded',
    eyebrow: primaryControl ? 'Your move' : receiptModel ? 'Locked in' : 'Up next',
    instruction: specific.instruction,
    prompt: specific.prompt,
    deadline: createDeadline(specific.deadlineAt, input.now ?? Date.now()),
    primaryControl,
    receipt: receiptModel,
    waitingMessage: primaryControl ? null : (receiptModel?.nextStep ?? specific.waitingMessage),
    retry:
      operation.status === 'failed'
        ? {
            attempt: Math.max(1, operation.attempt),
            errorMessage: operation.message,
            label: `Retry ${actionLabel(primaryControl?.action ?? receiptModel?.action)}`,
            accessibleLabel: `Retry ${actionLabel(primaryControl?.action ?? receiptModel?.action)}. Your draft is still saved.`,
            preservesDraft: true,
          }
        : null,
    clearDraft: primaryControl && hasDraftContent(draft) ? createClearViewModel() : null,
  };
}

interface GameStateModel {
  readonly instruction: string;
  readonly prompt: string | null;
  readonly deadlineAt: number | null;
  readonly primaryControl: ControllerPrimaryControl | null;
  readonly receipt: ControllerReceiptViewModel | null;
  readonly waitingMessage: string | null;
}

function createGameState(
  gameId: SupportedGameId,
  state: PlayerGameView,
  draft: PlayerDraft | null,
  playerId: string,
  playerLabels: Readonly<Record<string, string>>,
): GameStateModel {
  switch (gameId) {
    case 'groupthink':
      return createGroupthinkState(state as GroupthinkPlayerView, draft);
    case 'hot-take':
      return createHotTakeState(state as HotTakePlayerView, draft, playerId, playerLabels);
    case 'suspect':
      return createSuspectState(state as SuspectPlayerView, draft, playerId, playerLabels);
    case 'drawn-out':
      return createDrawnOutState(state as DrawnOutPlayerView, draft, playerLabels);
  }
}

function createGroupthinkState(
  state: GroupthinkPlayerView,
  draft: PlayerDraft | null,
): GameStateModel {
  if (state.status === 'input' && !state.hasSubmitted) {
    return actionState(
      'Think of the answer the room is most likely to share.',
      state.prompt,
      state.inputDeadlineAt,
      textControl('answer', 'Your thought', 'Lock In My Thought', 'Type your answer…', 500, draft),
    );
  }
  if (state.status === 'input') {
    return receiptState(
      'Your thought is in the reactor.',
      state.prompt,
      state.inputDeadlineAt,
      receipt(
        'answer',
        'Thought accepted',
        'Submitted answer',
        state.ownAnswer,
        'Waiting for every mind to lock in.',
      ),
    );
  }
  return waitingState('Results are on the big screen.', state.prompt, state.inputDeadlineAt);
}

function createHotTakeState(
  state: HotTakePlayerView,
  draft: PlayerDraft | null,
  playerId: string,
  playerLabels: Readonly<Record<string, string>>,
): GameStateModel {
  if (state.status === 'input' && !state.hasSubmitted) {
    const control =
      state.promptKind === 'player-targeted'
        ? choiceControl(
            'answer',
            'Choose a player',
            'Drop My Take',
            Object.entries(playerLabels)
              .filter(([id]) => id !== playerId)
              .map(([id, label]) => ({ id, label })),
            draft,
          )
        : textControl('answer', 'Your hot take', 'Drop My Take', 'Type your hot take…', 500, draft);
    return actionState(
      'Make it bold, quick, and worth arguing about.',
      state.prompt,
      state.deadlineAt,
      control,
    );
  }
  if (state.status === 'input') {
    return receiptState(
      'Your take made the stage.',
      state.prompt,
      state.deadlineAt,
      receipt(
        'answer',
        'Take accepted',
        'Submitted take',
        state.ownAnswer,
        'Waiting for the remaining takes.',
      ),
    );
  }
  if (state.status === 'voting' && !state.hasVoted) {
    return actionState(
      'Pick the take that deserves the spotlight.',
      state.prompt,
      state.deadlineAt,
      choiceControl(
        'vote',
        'Take to send to the top',
        'Send It to the Top',
        state.entries.map((entry, index) => ({
          id: entry.entryId,
          label: `Take ${index + 1}: ${entry.answer}`,
        })),
        draft,
      ),
    );
  }
  if (state.status === 'voting') {
    return receiptState(
      'Your vote is counted.',
      state.prompt,
      state.deadlineAt,
      receipt(
        'vote',
        'Vote accepted',
        'Accepted action',
        'Your spotlight vote',
        'Waiting for the remaining votes.',
      ),
    );
  }
  return waitingState('Vote results are on the big screen.', state.prompt, state.deadlineAt);
}

function createSuspectState(
  state: SuspectPlayerView,
  draft: PlayerDraft | null,
  playerId: string,
  playerLabels: Readonly<Record<string, string>>,
): GameStateModel {
  if (state.status === 'input' && !state.hasSubmitted) {
    return actionState(
      'Answer privately. Nobody else can see your choice.',
      state.prompt,
      state.deadlineAt,
      choiceControl(
        'answer',
        'Private answer',
        'Lock My Answer',
        [
          { id: 'yes', label: 'Yes — this applies to me' },
          { id: 'no', label: 'No — not me' },
        ],
        draft,
      ),
    );
  }
  if (state.status === 'input') {
    return receiptState(
      'Your answer is sealed.',
      state.prompt,
      state.deadlineAt,
      receipt(
        'answer',
        'Private answer accepted',
        'Locked answer',
        state.ownAnswer === null ? null : state.ownAnswer ? 'Yes' : 'No',
        'Waiting for the rest of the jury.',
      ),
    );
  }
  if (state.status === 'alibi' && state.canSubmitAlibi && !state.ownAlibi) {
    return actionState(
      'You are accused. Make your case before time runs out.',
      state.prompt,
      state.deadlineAt,
      textControl('alibi', 'Your alibi', 'Submit Alibi', 'Make your case…', 280, draft, true),
    );
  }
  if (state.status === 'alibi' && state.alibiPlayerId === playerId && state.ownAlibi) {
    return receiptState(
      'Your alibi is before the jury.',
      state.prompt,
      state.deadlineAt,
      receipt(
        'alibi',
        'Alibi accepted',
        'Submitted alibi',
        state.ownAlibi,
        'Watch the jury decide.',
      ),
    );
  }
  if (state.status === 'alibi') {
    return waitingState(
      'The accused player is preparing an alibi.',
      state.prompt,
      state.deadlineAt,
    );
  }
  if (state.status === 'voting' && !state.hasVoted) {
    const selectionCount = state.roundType === 'double-trouble' ? 2 : 1;
    return actionState(
      state.roundType === 'most-likely'
        ? 'Choose who fits the prompt best.'
        : 'Name your suspect before the jury closes.',
      state.prompt,
      state.deadlineAt,
      choiceControl(
        'vote',
        state.roundType === 'double-trouble' ? 'Choose two different suspects' : 'Choose a suspect',
        'Submit Accusation',
        state.candidatePlayerIds.map((id) => ({ id, label: playerLabel(id, playerLabels) })),
        draft,
        selectionCount,
        selectionCount,
        state.roundType !== 'most-likely',
      ),
    );
  }
  if (state.status === 'voting') {
    const value = state.ownVoteTargetIds.length
      ? state.ownVoteTargetIds.map((id) => playerLabel(id, playerLabels)).join(' and ')
      : 'No match';
    return receiptState(
      'Your accusation is locked.',
      state.prompt,
      state.deadlineAt,
      receipt(
        'vote',
        'Accusation accepted',
        'Your accusation',
        value,
        'Waiting for the rest of the jury.',
      ),
    );
  }
  return waitingState('The case results are on the big screen.', state.prompt, state.deadlineAt);
}

function createDrawnOutState(
  state: DrawnOutPlayerView,
  draft: PlayerDraft | null,
  playerLabels: Readonly<Record<string, string>>,
): GameStateModel {
  const prompt = state.privatePrompt ?? state.sourceDescription;
  if (state.task === 'draw') {
    return actionState(state.instruction, prompt, state.deadlineAt, {
      kind: 'drawing',
      action: 'draw',
      label: 'Drawing canvas',
      accessibleLabel: 'Drawing canvas for your current turn',
      submitLabel: 'Submit My Strokes',
      hasRecoveredDraft: Boolean(draft?.drawing?.strokes.length),
      disabled: false,
    });
  }
  if (state.task === 'describe' && !state.hasSubmitted) {
    return actionState(
      state.instruction,
      prompt,
      state.deadlineAt,
      textControl(
        'answer',
        'Your description',
        'Pass This Description',
        'Describe this drawing…',
        180,
        draft,
      ),
    );
  }
  if (state.task === 'guess' && !state.hasSubmitted) {
    return actionState(
      state.instruction,
      prompt,
      state.deadlineAt,
      choiceControl(
        'answer',
        'Original prompt',
        'Lock My Choice',
        state.guessOptions.map((option) => ({ id: option.id, label: option.text })),
        draft,
      ),
    );
  }
  if (state.task === 'guess' && state.hasSubmitted) {
    return receiptState(
      state.instruction,
      prompt,
      state.deadlineAt,
      receipt(
        'answer',
        'Choice accepted',
        'Locked choice',
        state.ownGuess,
        'Waiting for the room.',
      ),
    );
  }
  if (state.task === 'vote' && !state.hasSubmitted) {
    return actionState(
      state.instruction,
      prompt,
      state.deadlineAt,
      choiceControl(
        'vote',
        'Suspicious artist',
        'Accuse This Artist',
        state.candidatePlayerIds.map((id) => ({ id, label: playerLabel(id, playerLabels) })),
        draft,
      ),
    );
  }
  if (state.task === 'vote' && state.hasSubmitted) {
    return receiptState(
      state.instruction,
      prompt,
      state.deadlineAt,
      receipt(
        'vote',
        'Accusation accepted',
        'Accused artist',
        state.ownVotePlayerId ? playerLabel(state.ownVotePlayerId, playerLabels) : null,
        'Waiting for the other artists.',
      ),
    );
  }
  return waitingState(
    state.instruction,
    prompt,
    state.deadlineAt,
    state.hasSubmitted ? 'Locked in. Watch the big screen.' : 'Another artist has the marker.',
  );
}

function createPhaseFallback(phase: RoomPhase): GameStateModel {
  const messages: Readonly<Record<RoomPhase, string>> = {
    lobby: 'You are in. The host will start when the room is ready.',
    intro: 'Meet the game on the big screen.',
    prompt: 'Read the prompt on the big screen.',
    input: 'Your private action is loading.',
    alibi: 'The alibi round is on the big screen.',
    voting: 'Your ballot is loading.',
    results: 'Results are on the big screen.',
    scoring: 'Scores are being counted on the big screen.',
    winner: 'The winner is on the big screen.',
  };
  return waitingState(messages[phase], null, null);
}

function actionState(
  instruction: string,
  prompt: string | null,
  deadlineAt: number | null,
  primaryControl: ControllerPrimaryControl,
): GameStateModel {
  return { instruction, prompt, deadlineAt, primaryControl, receipt: null, waitingMessage: null };
}

function receiptState(
  instruction: string,
  prompt: string | null,
  deadlineAt: number | null,
  accepted: ControllerReceiptViewModel,
): GameStateModel {
  return {
    instruction,
    prompt,
    deadlineAt,
    primaryControl: null,
    receipt: accepted,
    waitingMessage: accepted.nextStep,
  };
}

function waitingState(
  instruction: string,
  prompt: string | null,
  deadlineAt: number | null,
  waitingMessage = instruction,
): GameStateModel {
  return { instruction, prompt, deadlineAt, primaryControl: null, receipt: null, waitingMessage };
}

function textControl(
  action: 'answer' | 'alibi',
  label: string,
  submitLabel: string,
  placeholder: string,
  characterLimit: number,
  draft: PlayerDraft | null,
  multiline = false,
): ControllerPrimaryControl {
  const value = draft?.answer ?? '';
  // Match HTML maxlength and the server schemas, which both count UTF-16 code units.
  const characterCount = value.length;
  return {
    kind: 'text',
    action,
    label,
    accessibleLabel: `${label}, ${characterLimit} character maximum`,
    submitLabel,
    placeholder,
    multiline,
    value,
    characterLimit,
    characterCount,
    characterCountLabel: `${characterCount} of ${characterLimit} characters`,
    invalid: characterCount > characterLimit,
    disabled: characterCount > characterLimit || value.trim().length === 0,
  };
}

function choiceControl(
  action: 'answer' | 'vote',
  label: string,
  submitLabel: string,
  options: readonly ControllerChoiceOption[],
  draft: PlayerDraft | null,
  minimumSelections = 1,
  maximumSelections = 1,
  allowNoMatch = false,
): ControllerPrimaryControl {
  const selectedIds = (draft?.selections ?? (draft?.answer ? [draft.answer] : [])).filter((id) =>
    options.some((option) => option.id === id),
  );
  const noMatchSelected = allowNoMatch && Boolean(draft?.noMatch);
  const selectionCount = noMatchSelected ? minimumSelections : selectedIds.length;
  return {
    kind: 'choice',
    action,
    label,
    accessibleLabel:
      maximumSelections === 1 ? label : `${label}. Select ${minimumSelections} options.`,
    submitLabel,
    options,
    selectedIds,
    minimumSelections,
    maximumSelections,
    allowNoMatch,
    noMatchSelected,
    disabled:
      selectionCount < minimumSelections ||
      selectionCount > maximumSelections ||
      new Set(selectedIds).size !== selectedIds.length,
  };
}

function receipt(
  action: ControllerActionKind,
  title: string,
  acceptedLabel: string,
  acceptedValue: string | null,
  nextStep: string,
): ControllerReceiptViewModel {
  return { action, title, acceptedLabel, acceptedValue, nextStep };
}

function createDeadline(
  deadlineAt: number | null,
  now: number,
): ControllerDeadlineViewModel | null {
  if (deadlineAt === null) return null;
  const remainingMs = Math.max(0, deadlineAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1_000);
  return {
    at: deadlineAt,
    remainingMs,
    remainingSeconds,
    label: remainingSeconds === 0 ? 'Time is up' : `${remainingSeconds}s left`,
    accessibleLabel:
      remainingSeconds === 0
        ? 'The deadline has passed'
        : `${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`,
    urgency: remainingSeconds === 0 ? 'expired' : remainingSeconds <= 10 ? 'soon' : 'normal',
  };
}

function setPending(
  control: ControllerPrimaryControl | null,
  pending: boolean,
): ControllerPrimaryControl | null {
  return control ? { ...control, disabled: control.disabled || pending } : null;
}

function hasDraftContent(draft: PlayerDraft | null): boolean {
  return Boolean(
    draft?.answer || draft?.selections?.length || draft?.noMatch || draft?.drawing?.strokes.length,
  );
}

function createClearViewModel(): ControllerClearViewModel {
  return {
    label: 'Clear draft',
    accessibleLabel: 'Clear the saved draft for this action',
    confirmationTitle: 'Clear this draft?',
    confirmationMessage: 'Your saved input for this action will be removed from this device.',
    confirmLabel: 'Yes, clear draft',
    cancelLabel: 'Keep editing',
  };
}

function actionLabel(action: ControllerActionKind | undefined): string {
  switch (action) {
    case 'answer':
      return 'answer';
    case 'alibi':
      return 'alibi';
    case 'vote':
      return 'vote';
    case 'draw':
      return 'drawing';
    default:
      return 'action';
  }
}

function playerLabel(id: string, labels: Readonly<Record<string, string>>): string {
  return labels[id] ?? 'Unknown player';
}
