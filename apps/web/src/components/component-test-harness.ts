import { createDraftStore, type Store } from '../state/store.js';
import { createActionFirstControllerViewModel } from '../routes/player/controller-view-model.js';
import { renderPublicGameStage } from '../games/public-stage-registry.js';
import { createActionFirstControllerComponent } from './action-first-controller.js';
import { createConnectionNoticeComponent } from './connection-notice.js';
import type { GamePhaseFixture } from './component-fixtures.js';
import { createPageShellComponent } from './page-shell.js';
import { createRecoveryPanel } from './recovery-panel.js';
import { createRecoveryStateViewModel } from './recovery-state.js';
import { createRoomStageShellComponent } from './room-stage-shell.js';
import { createRosterComponent } from './roster.js';
import { getGamePresentation } from '../games/presentation.js';

interface DomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface RenderedComponentFixture {
  readonly root: HTMLElement;
  readonly pageContent: HTMLElement;
  readonly stage: HTMLElement;
  readonly roster: HTMLElement;
  readonly controller: HTMLElement;
  readonly recoveryPanel: HTMLElement;
  readonly recoveryDiagnostic: string;
}

/**
 * Dependency-free component fixture renderer used by Node tests and future visual adapters. It
 * composes the same retained page shell, room stage shell, connection notice, and roster used by
 * the browser instead of snapshotting hand-authored markup.
 */
export function renderComponentFixture(
  fixture: GamePhaseFixture,
  ownerDocument: DomDocument,
): RenderedComponentFixture {
  const root = ownerDocument.createElement('main');
  const notice = createConnectionNoticeComponent(ownerDocument);
  notice.update('connected');
  const page = createPageShellComponent(root, notice.element, ownerDocument);
  page.update({
    pageKind: 'display-page',
    title: `${fixture.gameId} fixture`,
    subtitle: `${fixture.gamePhase} · ${fixture.population}`,
  });

  const presentation = getGamePresentation(fixture.gameId);
  const roster = createRosterComponent(ownerDocument, 'fixture-roster');
  roster.update(fixture.snapshot.state, presentation, 1_000);
  const stage = renderPublicGameStage(fixture.snapshot, {
    document: ownerDocument,
    createArtwork: (gameId) => {
      const artwork = textElement(ownerDocument, 'span', `${gameId} artwork`);
      artwork.className = 'stage-art';
      return artwork;
    },
    createDrawingPreview: (drawing, className) => {
      const preview = textElement(
        ownerDocument,
        'figure',
        `${drawing.strokes.length} drawing strokes`,
      );
      preview.className = className;
      return preview;
    },
    now: () => 1_000,
  });
  if (!stage) throw new Error(`Fixture ${fixture.id} does not include a public game view.`);
  const roomStage = createRoomStageShellComponent('display-experience', ownerDocument);
  roomStage.update({
    shellClass: presentation.shellClass,
    topbar: {
      key: `${fixture.gameId}:${fixture.gamePhase}:topbar`,
      render: () => textElement(ownerDocument, 'div', fixture.gamePhase),
    },
    roomPass: {
      key: fixture.snapshot.state.roomCode,
      render: () => textElement(ownerDocument, 'aside', fixture.snapshot.state.roomCode),
    },
    stage: { key: fixture.id, render: () => stage },
    roster: roster.element,
  });
  const recoveryState = {
    kind: 'reconnecting',
    role: 'display',
    roomCode: fixture.snapshot.state.roomCode,
    attempt: 1,
  } as const;
  const recovery = createRecoveryStateViewModel(recoveryState);
  const recoveryPanel = createRecoveryPanel(recoveryState, {}, ownerDocument);
  const controller = createActionFirstControllerComponent(ownerDocument);
  const controllerModel = createActionFirstControllerViewModel({
    gameId: fixture.gameId,
    roomCode: fixture.snapshot.state.roomCode,
    playerId: fixture.snapshot.state.players[0]?.id ?? 'fixture-player',
    phase: fixture.snapshot.state.phase,
    publicGame: fixture.snapshot.game,
    playerState: fixture.playerState,
    draft: null,
    playerLabels: Object.fromEntries(
      fixture.snapshot.state.players.map((player) => [player.id, player.name]),
    ),
    now: 1_000,
  });
  controller.update(
    controllerModel,
    controllerModel.primaryControl
      ? {
          primaryControl: textElement(
            ownerDocument,
            'button',
            controllerModel.primaryControl.submitLabel,
          ),
        }
      : {},
  );
  page.parts.content.replaceChildren(roomStage.element, controller.element, recoveryPanel);

  return {
    root,
    pageContent: page.parts.content,
    stage,
    roster: roster.element,
    controller: controller.element,
    recoveryPanel,
    recoveryDiagnostic: recovery.diagnosticCopy,
  };
}

function textElement(ownerDocument: DomDocument, tagName: string, text: string): HTMLElement {
  const element = ownerDocument.createElement(tagName);
  element.textContent = text;
  return element;
}

export interface FixtureDraft {
  readonly actionKey: string;
  readonly answer: string;
}

export interface InteractiveFixtureControl {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  readonly submit: HTMLButtonElement;
  readonly drafts: Store<FixtureDraft | null>;
  update(actionKey: string): void;
}

interface InteractiveElement extends HTMLElement {
  addEventListener(type: string, listener: (event: Event) => void): void;
}

/** A small production-shaped control for characterizing retained input without a browser DOM. */
export function createInteractiveFixtureControl(
  ownerDocument: DomDocument,
  initialActionKey: string,
  onSubmit: (answer: string) => void,
): InteractiveFixtureControl {
  const element = ownerDocument.createElement('form');
  const input = ownerDocument.createElement('input') as HTMLInputElement;
  const submit = ownerDocument.createElement('button') as HTMLButtonElement;
  submit.textContent = 'Submit';
  submit.setAttribute('type', 'submit');
  const drafts = createDraftStore<FixtureDraft>();
  let actionKey = initialActionKey;

  const preserveDraft = (): void => {
    drafts.setState({ actionKey, answer: input.value });
  };
  const submitDraft = (event: Event): void => {
    event.preventDefault();
    preserveDraft();
    onSubmit(input.value);
  };
  (input as InteractiveElement).addEventListener('input', preserveDraft);
  (input as InteractiveElement).addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) submitDraft(event);
  });
  (element as InteractiveElement).addEventListener('submit', submitDraft);
  element.append(input, submit);

  return {
    element,
    input,
    submit,
    drafts,
    update(nextActionKey) {
      if (nextActionKey === actionKey) {
        input.value = drafts.getState()?.answer ?? input.value;
      } else {
        actionKey = nextActionKey;
        input.value = '';
        drafts.setState(null);
      }
    },
  };
}
