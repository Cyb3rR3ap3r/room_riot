import type { DrawingData, RoomPhase, SupportedGameId } from '@room-riot/contracts';
import type { PublicRoomState } from '@room-riot/game-engine';

import type { PlayerDraft } from '../state/session-store.js';
import type { ControllerAcceptedAction } from '../routes/player/controller-view-model.js';

export interface PlayerControllerDomDocument {
  createElement(tagName: string): HTMLElement;
}

export type PlayerDraftPatch = Omit<Partial<PlayerDraft>, 'actionKey'>;

export interface SubmitAnswerIntent {
  readonly answer: string;
  readonly targetPlayerId?: string;
  readonly trigger: HTMLButtonElement;
  readonly acceptedAction: ControllerAcceptedAction;
}

export interface CastVoteIntent {
  readonly entryId: string;
  readonly trigger: HTMLButtonElement;
  readonly acceptedAction: ControllerAcceptedAction;
}

export interface SubmitAlibiIntent {
  readonly alibi: string;
  readonly trigger: HTMLButtonElement;
  readonly acceptedAction: ControllerAcceptedAction;
}

export interface SubmitDrawingIntent {
  readonly drawing: DrawingData;
  readonly trigger: HTMLButtonElement;
  readonly acceptedAction: ControllerAcceptedAction;
}

export interface PlayerMutationHandlers {
  submitAnswer(intent: SubmitAnswerIntent): void;
  castVote(intent: CastVoteIntent): void;
  submitAlibi(intent: SubmitAlibiIntent): void;
  submitDrawing(intent: SubmitDrawingIntent): void;
}

export interface DrawingPadController {
  readonly element: HTMLElement;
  getDrawing(): DrawingData;
  dispose?(): void;
}

export interface PlayerControllerDependencies {
  readonly document: PlayerControllerDomDocument;
  readonly saveDraft: (patch: PlayerDraftPatch) => void;
  readonly showNotice: (message: string, isError: boolean) => void;
  readonly mutations: PlayerMutationHandlers;
  readonly createDrawingPad: (
    initial: DrawingData | null,
    onChange: (drawing: DrawingData) => void,
  ) => DrawingPadController;
  readonly createDrawingPreview: (drawing: DrawingData, className?: string) => HTMLElement;
}

export interface PlayerControllerContext {
  readonly gameId: SupportedGameId;
  readonly phase: RoomPhase;
  readonly playerId: string;
  readonly room: PublicRoomState;
  readonly draft: PlayerDraft | null;
}

export interface PlayerControllerRenderResult {
  readonly element: HTMLElement;
  readonly primaryControl: HTMLElement | null;
  readonly retry: (() => void) | null;
  dispose(): void;
}

export function createControllerRoot(document: PlayerControllerDomDocument): HTMLElement {
  const root = document.createElement('div');
  root.className = 'action-first-controller__legacy-supplemental';
  return root;
}

export function createTextInput(
  document: PlayerControllerDomDocument,
  value: string,
): HTMLInputElement {
  const input = document.createElement('input') as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  return input;
}

export function createButton(
  document: PlayerControllerDomDocument,
  label: string,
  type: 'button' | 'submit' = 'button',
): HTMLButtonElement {
  const button = document.createElement('button') as HTMLButtonElement;
  button.type = type;
  button.textContent = label;
  return button;
}

export function createField(
  document: PlayerControllerDomDocument,
  labelText: string,
  control: HTMLElement,
): HTMLElement {
  const label = document.createElement('label');
  const copy = document.createElement('span');
  copy.textContent = labelText;
  label.append(copy, control);
  return label;
}

export function appendWaiting(
  root: HTMLElement,
  document: PlayerControllerDomDocument,
  message: string,
): void {
  const waiting = document.createElement('p');
  waiting.className = 'muted';
  waiting.textContent = message;
  root.append(waiting);
}

export function result(
  element: HTMLElement,
  primaryControl: HTMLElement | null,
  drawingPad?: DrawingPadController,
): PlayerControllerRenderResult {
  return {
    element,
    primaryControl,
    retry: primaryControl
      ? () => {
          const requestSubmit = (primaryControl as HTMLFormElement).requestSubmit;
          if (typeof requestSubmit === 'function') requestSubmit.call(primaryControl);
          else primaryControl.querySelector<HTMLButtonElement>(':scope > button')?.click();
        }
      : null,
    dispose: () => drawingPad?.dispose?.(),
  };
}
