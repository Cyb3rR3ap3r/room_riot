import type {
  CreateRoomActionRequest,
  ContentMode,
  DrawingData,
  DrawnOutMode,
  DisplayWatchRequest,
  HostReconnectRequest,
  HostRemovePlayerRequest,
  HostRoomActionRequest,
  HostStartGameRequest,
  JoinRoomActionRequest,
  PlayerCastVoteRequest,
  PlayerSubmitAnswerRequest,
  PlayerSubmitAlibiRequest,
  PlayerSubmitDrawingRequest,
  PromptMode,
  RoomPhase,
  RoomCode,
  SessionToken,
} from '@room-riot/contracts';

import {
  GAME_CATALOG,
  getGameDefinition,
  type GameDefinition,
  type SupportedGameId,
} from './app/catalog.js';
import {
  createActionFirstControllerComponent,
  type ActionFirstControllerComponent,
} from './components/action-first-controller.js';
import {
  createConnectionNoticeComponent,
  type ConnectionNoticeComponent,
} from './components/connection-notice.js';
import {
  createPageShellComponent,
  type PageParts,
  type PageShellComponent,
} from './components/page-shell.js';
import { createPhaseAwareJoinComponent } from './components/phase-aware-join.js';
import { createRecoveryPanel, type RecoveryActionHandlers } from './components/recovery-panel.js';
import {
  createRecoveryDiagnosticCopy,
  getRecoveryStateForEventError,
  type RecoveryState,
} from './components/recovery-state.js';
import { getPageKind } from './components/presentation.js';
import { createRoomStageShellComponent } from './components/room-stage-shell.js';
import { createRosterComponent, type RosterComponent } from './components/roster.js';
import { createTvDensityLayoutComponent } from './components/tv-density-layout.js';
import { getGamePresentation } from './games/presentation.js';
import { renderPlayerController } from './games/player-controller-registry.js';
import type {
  PlayerControllerDependencies,
  PlayerControllerRenderResult,
} from './games/player-controller.js';
import { renderPublicGameStage } from './games/public-stage-registry.js';
import type {
  HostCreateResponse,
  HostReconnectResponse,
  LeaveRoomResponse,
  PlayerAnswerResponse,
  PlayerJoinResponse,
  PlayerGameView,
  RemovePlayerResponse,
  RoomSnapshot,
  RoomStateResponse,
} from './protocol.js';
import {
  isSuccess,
  parsePlayerGameView,
  parsePlayerStateUpdate,
  parseRoomSnapshot,
} from './protocol.js';
import {
  buildDisplayRoute,
  buildHostRoute,
  buildPlayRoute,
  getGameFromPathname,
  getRoomCodeFromSearch,
  routes,
} from './routes/routes.js';
import { createPhaseAwareJoinViewModel } from './routes/display/join-presentation.js';
import {
  createLiveDisplayDensityViewModel,
  type LiveDisplayDensityViewModel,
} from './routes/display/live-display.js';
import { advanceTvDensityPage, getTvDensityPage } from './routes/display/tv-layout.js';
import { getDisplayRouteViewModel } from './routes/display/view-model.js';
import { getHostRouteViewModel } from './routes/host/view-model.js';
import { getPlayerRouteViewModel } from './routes/player/view-model.js';
import {
  createActionFirstControllerViewModel,
  type ControllerAcceptedAction,
  type ControllerOperationState,
} from './routes/player/controller-view-model.js';
import { getClientActionId } from './state/action-ids.js';
import { clearPendingOperation, getOrCreatePendingOperation } from './state/pending-operations.js';
import { installMotionVisibility } from './state/motion.js';
import {
  createHostMutationKey,
  createPlayerActionKey,
  shouldDiscardDraft,
} from './state/player-action.js';
import {
  readPlayerDraft,
  readRoomSession,
  removePlayerDraft,
  removeRoomSession,
  writePlayerDraft,
  writeRoomSession,
  type PlayerDraft,
} from './state/session-store.js';
import {
  createConnectionStore,
  createDraftStore,
  createPreferenceStore,
  createPrivatePlayerStateStore,
  createPublicSnapshotStore,
  createSessionStore,
  type ConnectionState,
} from './state/store.js';

export { routes } from './routes/routes.js';

const AVATARS = ['😎', '🤡', '👽', '💀', '🤖', '🐸', '👻', '🦆'];
const HOST_STORAGE_KEY = 'room-riot-host-session';
const PLAYER_STORAGE_KEY = 'room-riot-player-session';
const PLAYER_DRAFT_STORAGE_KEY = 'room-riot-player-drafts';
const PENDING_OPERATION_STORAGE_KEY = 'room-riot-pending-operations';
const DISPLAY_PAGE_ROTATION_MS = 6_000;

interface HostSession {
  readonly roomCode: RoomCode;
  readonly hostToken: SessionToken;
  readonly gameId: SupportedGameId;
}

interface PlayerSession {
  readonly roomCode: RoomCode;
  readonly playerId: string;
  readonly playerToken: SessionToken;
  readonly name: string;
  readonly avatar: string;
}

interface JoinDraft {
  roomCode: string;
  name: string;
  avatar: string;
}

interface PersistentNotice {
  readonly message: string;
  readonly isError: boolean;
}

interface GamePicker {
  readonly element: HTMLElement;
  readonly getValue: () => SupportedGameId;
}

interface SoundController {
  readonly button: HTMLButtonElement;
  phaseChanged(phase: RoomPhase, gameId?: SupportedGameId | null): void;
}

function updatePage(
  shell: PageShellComponent,
  titleText: string,
  subtitleText: string,
  gameId: string | null = null,
  clearContent = true,
): PageParts {
  const page = shell.update({
    pageKind: getPageKind(window.location.pathname),
    title: titleText,
    subtitle: subtitleText,
  });
  if (clearContent) page.content.replaceChildren();
  updatePageBrand(page, gameId);
  return page;
}

function updatePageBrand(page: PageParts, gameId: string | null | undefined): void {
  if (!gameId) {
    page.brand.classList.remove('game-brand');
    page.brandLogo.classList.remove('game-logo');
    page.brandLogo.src = '/assets/room-riot-logo.webp';
    page.brandLogo.alt = 'Room Riot';
    return;
  }

  const game = getGameDefinition(gameId);
  page.brand.classList.add('game-brand');
  page.brandLogo.classList.add('game-logo');
  page.brandLogo.src = game.icon;
  page.brandLogo.alt = `${game.label} logo`;
}

function renderConnectionNotice(
  component: ConnectionNoticeComponent,
  status: ConnectionState,
): void {
  component.update(status);
}

function getRecoveryHandlers(
  state: RecoveryState,
  overrides: RecoveryActionHandlers = {},
): RecoveryActionHandlers {
  const reload = (): void => window.location.reload();
  return {
    retry: reload,
    'reload-client': reload,
    'copy-diagnostics': () => {
      void window.navigator.clipboard?.writeText(createRecoveryDiagnosticCopy(state));
    },
    ...overrides,
  };
}

function createSoundController(): SoundController {
  const preferences = createPreferenceStore();
  let context: AudioContext | null = null;
  let previousPhase: RoomPhase | null = null;
  let activeGame: SupportedGameId = 'groupthink';

  const button = createButton('Enable game audio');
  button.className = 'secondary';
  preferences.subscribeSelector(
    (state) => state.soundEnabled,
    (soundEnabled) => {
      if (!soundEnabled) return;
      button.textContent = getGamePresentation(activeGame).audioOnLabel;
    },
  );
  button.addEventListener('click', () => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      button.textContent = 'Sound Unavailable';
      button.disabled = true;
      return;
    }

    context ??= new AudioContextConstructor();
    void context.resume();
    preferences.setState({ soundEnabled: true });
  });

  const playTone = (
    frequency: number,
    offset: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void => {
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + offset;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.type = type;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  const playCue = (phase: RoomPhase): void => {
    const cue = getGamePresentation(activeGame).soundCue(phase);
    cue.notes.forEach((frequency, index) =>
      playTone(frequency, index * cue.spacing, cue.duration, cue.waveform(index), cue.volume),
    );
  };

  return {
    button,
    phaseChanged(phase, gameId) {
      if (gameId) {
        activeGame = gameId;
        if (!preferences.select((state) => state.soundEnabled)) {
          button.textContent = getGamePresentation(gameId).audioEnableLabel;
        }
      }
      if (
        previousPhase &&
        previousPhase !== phase &&
        preferences.select((state) => state.soundEnabled) &&
        context
      ) {
        playCue(phase);
      }
      previousPhase = phase;
    },
  };
}

function setNotice(target: HTMLElement, message: string, isError = false): void {
  target.textContent = message;
  target.classList.toggle('error', isError);
}

function createButton(label: string, type: 'button' | 'submit' = 'button'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = type;
  button.textContent = label;
  return button;
}

function createField(
  labelText: string,
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): HTMLElement {
  const label = document.createElement('label');
  label.className = 'field';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(text, input);
  return label;
}

function createTextInput(value = ''): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  return input;
}

interface DrawingPad {
  readonly element: HTMLElement;
  readonly getDrawing: () => DrawingData;
}

function paintDrawing(canvas: HTMLCanvasElement, drawing: DrawingData | null): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fffdf4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!drawing) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  drawing.strokes.forEach((stroke) => {
    const first = stroke.points[0];
    if (!first) return;
    context.beginPath();
    context.strokeStyle = stroke.color;
    context.lineWidth = Math.max(1, stroke.width * canvas.width);
    context.moveTo(first.x * canvas.width, first.y * canvas.height);
    stroke.points
      .slice(1)
      .forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height));
    context.stroke();
  });
}

function createDrawingPreview(drawing: DrawingData | null, className = ''): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.className = `drawing-canvas drawing-preview ${className}`.trim();
  canvas.setAttribute('aria-label', 'Submitted drawing');
  paintDrawing(canvas, drawing);
  return canvas;
}

function createDrawingPad(
  existing: DrawingData | null = null,
  onChange?: (drawing: DrawingData) => void,
): DrawingPad {
  const wrapper = document.createElement('section');
  wrapper.className = 'drawing-pad';
  const canvas = createDrawingPreview(existing);
  canvas.classList.add('drawing-input');
  canvas.setAttribute('aria-label', 'Drawing canvas');
  const strokes: DrawingData['strokes'][number][] = existing
    ? existing.strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      }))
    : [];
  let activeStroke: DrawingData['strokes'][number] | null = null;
  let color = '#151022';
  let width = 0.012;

  const position = (event: PointerEvent): { x: number; y: number } => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (strokes.length >= 16) return;
    canvas.setPointerCapture(event.pointerId);
    activeStroke = { color, width, points: [position(event)] };
    strokes.push(activeStroke);
    onChange?.({ strokes });
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!activeStroke || !canvas.hasPointerCapture(event.pointerId)) return;
    if (activeStroke.points.length >= 256) return;
    activeStroke.points.push(position(event));
    paintDrawing(canvas, { strokes });
    onChange?.({ strokes });
  });
  const endStroke = (event: PointerEvent): void => {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activeStroke = null;
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  const toolbar = document.createElement('div');
  toolbar.className = 'drawing-toolbar';
  ['#151022', '#ff2ea6', '#12bce8', '#8ee600', '#ffb000', '#7c3cff'].forEach((swatch, index) => {
    const button = createButton('');
    button.className = `drawing-swatch drawing-swatch-${index + 1}`;
    button.setAttribute('aria-label', `Drawing color ${index + 1}`);
    button.setAttribute('aria-pressed', String(swatch === color));
    button.addEventListener('click', () => {
      color = swatch;
      toolbar
        .querySelectorAll<HTMLButtonElement>('.drawing-swatch')
        .forEach((candidate) =>
          candidate.setAttribute('aria-pressed', String(candidate === button)),
        );
    });
    toolbar.append(button);
  });
  const size = document.createElement('select');
  size.setAttribute('aria-label', 'Brush size');
  size.innerHTML =
    '<option value="0.007">Thin</option><option value="0.012" selected>Medium</option><option value="0.022">Chunky</option>';
  size.addEventListener('change', () => {
    width = Number(size.value);
  });
  const undo = createButton('Undo');
  undo.className = 'secondary';
  undo.addEventListener('click', () => {
    strokes.pop();
    paintDrawing(canvas, { strokes });
    onChange?.({ strokes });
  });
  const clear = createButton('Clear');
  clear.className = 'secondary';
  clear.addEventListener('click', () => {
    strokes.splice(0);
    paintDrawing(canvas, { strokes });
    onChange?.({ strokes });
  });
  toolbar.append(size, undo, clear);
  wrapper.append(canvas, toolbar);
  return {
    element: wrapper,
    getDrawing: () => ({ strokes }),
  };
}

function setGameTheme(root: HTMLElement, gameId: string | null | undefined): void {
  root.classList.remove('game-groupthink', 'game-hot-take', 'game-suspect', 'game-drawn-out');
  if (!gameId) {
    delete root.dataset.gameId;
    return;
  }

  const game = getGameDefinition(gameId);
  root.classList.add(`game-${game.id}`);
  root.dataset.gameId = game.id;
}

function createGameArtwork(
  game: GameDefinition,
  className: string,
  eager = false,
): HTMLImageElement {
  const image = document.createElement('img');
  image.className = className;
  image.src = game.icon;
  image.alt = `${game.label} game icon`;
  image.loading = eager ? 'eager' : 'lazy';
  image.decoding = 'async';
  return image;
}

function createAvatarSelect(value = AVATARS[0] ?? '😎'): HTMLSelectElement {
  const select = document.createElement('select');
  AVATARS.forEach((avatar) => {
    const option = document.createElement('option');
    option.value = avatar;
    option.textContent = avatar;
    option.selected = avatar === value;
    select.append(option);
  });
  return select;
}

function createPromptModeSelect(value: PromptMode = 'default'): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = 'prompt-mode';
  const options: readonly { value: PromptMode; label: string }[] = [
    { value: 'default', label: 'Curated prompt deck (recommended)' },
    { value: 'ai', label: 'AI remix (local, always available)' },
  ];
  options.forEach(({ value: optionValue, label }) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    select.append(option);
  });
  return select;
}

function createContentModeSelect(value: ContentMode = 'standard'): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = 'content-mode';
  const options: readonly { value: ContentMode; label: string }[] = [
    { value: 'family', label: 'Family-friendly' },
    { value: 'standard', label: 'Standard' },
    { value: 'after-dark', label: 'After dark' },
  ];
  options.forEach(({ value: optionValue, label }) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    select.append(option);
  });
  return select;
}

function createDrawnOutModeSelect(value: DrawnOutMode = 'classic'): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = 'drawn-out-mode';
  const options: readonly { value: DrawnOutMode; label: string }[] = [
    { value: 'classic', label: 'Classic — draw, then guess' },
    { value: 'telephone', label: 'Telephone — draw and describe chain' },
    { value: 'fake-artist', label: 'Fake Artist — blend in without the prompt' },
  ];
  options.forEach(({ value: optionValue, label }) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    select.append(option);
  });
  return select;
}

function createGamePicker(
  value = 'groupthink',
  onSelect?: (game: GameDefinition) => void,
): GamePicker {
  let selected = getGameDefinition(value);
  const wrapper = document.createElement('section');
  wrapper.className = 'game-picker';
  wrapper.setAttribute('aria-labelledby', 'game-picker-title');

  const heading = document.createElement('div');
  heading.className = 'game-picker-heading';
  const title = document.createElement('h2');
  title.id = 'game-picker-title';
  title.textContent = 'Choose your game';
  const helper = document.createElement('p');
  helper.className = 'muted';
  helper.textContent = 'Pick a vibe. The room will feel it from the first prompt.';
  heading.append(title, helper);

  const options = document.createElement('div');
  options.className = 'game-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'Available games');

  const detail = document.createElement('article');
  detail.className = `game-detail game-${selected.id}`;
  detail.setAttribute('aria-live', 'polite');

  const renderDetail = (): void => {
    detail.replaceChildren();
    detail.className = `game-detail game-${selected.id}`;
    detail.append(createGameArtwork(selected, 'game-art game-art-large', true));

    const copy = document.createElement('div');
    copy.className = 'game-detail-copy';
    const kicker = document.createElement('span');
    kicker.className = 'game-kicker';
    kicker.textContent = selected.kicker;
    const name = document.createElement('h3');
    name.textContent = selected.label;
    const description = document.createElement('p');
    description.textContent = selected.description;
    const facts = document.createElement('ul');
    facts.className = 'game-facts';
    [selected.players, selected.duration, selected.contentRating, selected.controller].forEach(
      (fact) => {
        const item = document.createElement('li');
        item.textContent = fact;
        facts.append(item);
      },
    );
    const mechanics = document.createElement('ol');
    mechanics.className = 'game-mechanics';
    selected.mechanics.forEach((mechanic) => {
      const item = document.createElement('li');
      item.textContent = mechanic;
      mechanics.append(item);
    });
    const format = document.createElement('p');
    format.className = 'game-format';
    format.textContent = `${selected.rounds} · ${selected.pace}`;
    copy.append(kicker, name, description, mechanics, facts, format);
    detail.append(copy);
  };

  GAME_CATALOG.forEach((game) => {
    const option = createButton(game.label);
    option.replaceChildren();
    option.className = `game-option game-${game.id}`;
    option.setAttribute('aria-pressed', String(game.id === selected.id));
    option.addEventListener('click', () => {
      selected = game;
      options.querySelectorAll<HTMLButtonElement>('.game-option').forEach((button) => {
        button.setAttribute('aria-pressed', String(button === option));
        const artwork = button.querySelector<HTMLImageElement>('.game-art-option');
        if (artwork) artwork.loading = button === option ? 'eager' : 'lazy';
      });
      renderDetail();
      onSelect?.(game);
    });

    option.append(createGameArtwork(game, 'game-art game-art-option', game.id === selected.id));
    const copy = document.createElement('span');
    copy.className = 'game-option-copy';
    const label = document.createElement('strong');
    label.textContent = game.label;
    const kicker = document.createElement('span');
    kicker.textContent = game.kicker;
    copy.append(label, kicker);
    option.append(copy);
    options.append(option);
  });

  renderDetail();
  wrapper.append(heading, options, detail);
  return {
    element: wrapper,
    getValue: () => selected.id,
  };
}

function updateCountdown(element: HTMLElement): void {
  const deadlineAt = Number(element.dataset.deadlineAt);
  const prefix = element.dataset.countdownPrefix;
  if (!deadlineAt) return;
  const remainingSeconds = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  if (element.classList.contains('action-first-controller__deadline')) {
    element.textContent = remainingSeconds === 0 ? 'Time is up' : `${remainingSeconds}s left`;
    element.dataset.urgency =
      remainingSeconds === 0 ? 'expired' : remainingSeconds <= 10 ? 'soon' : 'normal';
    element.setAttribute(
      'aria-label',
      remainingSeconds === 0
        ? 'The action deadline has passed'
        : `${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`,
    );
    return;
  }
  if (!prefix) return;
  element.textContent = `${prefix} · ${remainingSeconds}s left`;
}

function createStageArtwork(gameId: SupportedGameId, className = ''): HTMLImageElement {
  const game = getGameDefinition(gameId);
  const presentation = getGamePresentation(gameId);
  const image = document.createElement('img');
  image.className = `stage-art ${className}`.trim();
  image.src = game.stageArt;
  image.alt = presentation.stageArtAlt;
  return image;
}

function createRoomPass(roomCode: string, gameId: SupportedGameId): HTMLElement {
  const game = getGameDefinition(gameId);
  const presentation = getGamePresentation(gameId);
  const panel = document.createElement('aside');
  panel.className = presentation.roomPassClass;
  const eyebrow = document.createElement('span');
  eyebrow.className = 'experience-eyebrow';
  eyebrow.textContent = presentation.roomPassEyebrow;
  const label = document.createElement('span');
  label.className = 'room-pass-label';
  label.textContent = 'Join at this address';
  const address = document.createElement('strong');
  address.className = 'join-address';
  address.textContent = `${window.location.host}${buildPlayRoute(gameId)}`;
  const code = document.createElement('strong');
  code.className = 'room-code';
  code.textContent = roomCode;
  const qr = document.createElement('img');
  qr.className = 'qr';
  qr.alt = `QR code to join ${game.label}`;
  qr.src = `/api/rooms/${encodeURIComponent(roomCode)}/qr.svg`;
  panel.append(eyebrow, label, address, code, qr);
  return panel;
}

function createExperienceTopbar(
  gameId: SupportedGameId,
  roomCode: string,
  phase: RoomPhase,
): HTMLElement {
  const game = getGameDefinition(gameId);
  const bar = document.createElement('div');
  bar.className = 'experience-topbar';
  const identity = document.createElement('div');
  identity.className = 'experience-title';
  identity.append(createGameArtwork(game, 'experience-logo'));
  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'experience-eyebrow';
  eyebrow.textContent = game.controlRoom;
  const title = document.createElement('strong');
  title.textContent = game.label;
  copy.append(eyebrow, title);
  identity.append(copy);
  const status = document.createElement('div');
  status.className = 'experience-live-status';
  status.innerHTML = `<span aria-hidden="true"></span><strong>${phase}</strong><small>${roomCode}</small>`;
  bar.append(identity, status);
  return bar;
}

function createPublicGameStage(snapshot: RoomSnapshot, gameId: SupportedGameId): HTMLElement {
  return (
    renderPublicGameStage(snapshot, {
      document,
      createArtwork: createStageArtwork,
      createDrawingPreview,
      now: Date.now,
    }) ?? createLobbyStage(gameId, snapshot.state.phase)
  );
}

function createLobbyStage(gameId: SupportedGameId, phase: RoomPhase): HTMLElement {
  const presentation = getGamePresentation(gameId);
  const stage = document.createElement('main');
  stage.className = presentation.stageClass;
  const artwork = document.createElement('div');
  artwork.className = gameId === 'drawn-out' ? 'drawn-out-canvas-stage' : 'stage-art-wrap';
  artwork.append(createStageArtwork(gameId));
  const copy = document.createElement('div');
  copy.className = gameId === 'drawn-out' ? 'stage-copy drawn-out-stage-copy' : 'stage-copy';
  const cue = document.createElement('span');
  cue.className = 'experience-eyebrow';
  cue.textContent = presentation.stageCue(phase);
  const title = document.createElement('h2');
  title.textContent = presentation.stageLobbyTitle;
  copy.append(cue, title);
  stage.append(artwork, copy);
  return stage;
}

function updateHostExperience(
  shell: ReturnType<typeof createRoomStageShellComponent>,
  roster: RosterComponent,
  snapshot: RoomSnapshot,
  session: HostSession,
): HTMLElement {
  const gameId = getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId ?? session.gameId).id;
  const presentation = getGamePresentation(gameId);
  roster.update(snapshot.state, presentation);
  shell.update({
    shellClass: presentation.shellClass,
    topbar: {
      key: `${gameId}:${session.roomCode}:${snapshot.state.phase}`,
      render: () => createExperienceTopbar(gameId, session.roomCode, snapshot.state.phase),
    },
    roomPass: {
      key: `${gameId}:${session.roomCode}`,
      render: () => createRoomPass(session.roomCode, gameId),
    },
    stage: {
      key: createStageIdentity(snapshot),
      render: () => createPublicGameStage(snapshot, gameId),
    },
    roster: roster.element,
  });
  return shell.element;
}

function updateDisplayExperience(
  shell: ReturnType<typeof createRoomStageShellComponent>,
  roster: RosterComponent,
  join: ReturnType<typeof createPhaseAwareJoinComponent>,
  density: ReturnType<typeof createTvDensityLayoutComponent>,
  snapshot: RoomSnapshot,
  densityView: LiveDisplayDensityViewModel,
  densityPageIndex: number,
): HTMLElement {
  const gameId = getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId).id;
  const presentation = getGamePresentation(gameId);
  roster.update(snapshot.state, presentation);
  const activePlayerCount = snapshot.state.players.filter(
    (player) => player.status !== 'removed',
  ).length;
  const availability =
    activePlayerCount >= snapshot.state.settings.maxPlayers
      ? 'full'
      : snapshot.state.phase === 'lobby'
        ? 'open'
        : 'queued';
  join.update(
    createPhaseAwareJoinViewModel({
      gameId,
      roomCode: snapshot.state.roomCode,
      phase: snapshot.state.phase,
      availability,
      origin: window.location.origin,
      showDuringPlay: true,
    }),
  );

  const publicStage = createPublicGameStage(snapshot, gameId);
  publicStage.classList.add(`density-${densityView.plan.mode}`);
  roster.element.classList.remove('density-regular', 'density-compact', 'density-paged');
  roster.element.classList.add(`density-${densityView.plan.mode}`);
  let stageElement = publicStage;
  let rosterElement = roster.element;
  if (densityView.plan.mode === 'paged') {
    const source = densityView.target === 'stage' ? publicStage : roster.element;
    const content = Array.from(source.querySelectorAll<HTMLElement>(densityView.contentSelector));
    const contentById = Object.fromEntries(
      densityView.plan.pages
        .flatMap((page) => page.items)
        .map((item, index) => [item.id, content[index]])
        .filter((entry): entry is [string, HTMLElement] => Boolean(entry[1])),
    );
    density.update(densityView.plan, densityPageIndex, contentById);
    if (densityView.target === 'stage') stageElement = density.element;
    else rosterElement = density.element;
  }
  shell.update({
    shellClass: presentation.shellClass,
    topbar: {
      key: `${gameId}:${snapshot.state.roomCode}:${snapshot.state.phase}`,
      render: () => createExperienceTopbar(gameId, snapshot.state.roomCode, snapshot.state.phase),
    },
    roomPass: {
      key: 'retained-phase-aware-join',
      render: () => join.element,
    },
    stage: {
      key: `${createStageIdentity(snapshot)}:${densityView.key}:${densityPageIndex}`,
      render: () => stageElement,
    },
    roster: rosterElement,
  });
  shell.element.classList.add(
    `display-density-${densityView.target}`,
    `density-${densityView.plan.mode}`,
  );
  return shell.element;
}

function createStageIdentity(snapshot: RoomSnapshot): string {
  const scoreContext =
    snapshot.state.phase === 'results' || snapshot.state.phase === 'winner'
      ? snapshot.state.players.map(({ id, name, avatar, score }) => ({ id, name, avatar, score }))
      : null;
  return JSON.stringify([snapshot.state.phase, snapshot.game, scoreContext]);
}

function renderHost(root: HTMLElement): void {
  const socket = window.io();
  const sound = createSoundController();
  const connectionNotice = createConnectionNoticeComponent(document);
  const pageShell = createPageShellComponent(root, connectionNotice.element, document);
  const experienceShell = createRoomStageShellComponent('host-experience', document);
  const experienceRoster = createRosterComponent(document);
  const connectionStore = createConnectionStore();
  let connectionStatus = connectionStore.getState();
  connectionStore.subscribe((state) => {
    connectionStatus = state;
  });
  const roomFromUrl = getRoomCodeFromSearch(window.location.search);
  const sessionStore = createSessionStore(
    readRoomSession<HostSession>(window.localStorage, HOST_STORAGE_KEY, roomFromUrl),
  );
  let session = sessionStore.getState();
  sessionStore.subscribe((state) => {
    session = state;
  });
  const snapshotStore = createPublicSnapshotStore<RoomSnapshot>();
  let snapshot = snapshotStore.getState();
  snapshotStore.subscribe((state) => {
    snapshot = state;
  });
  let activeNotice: HTMLElement | null = null;
  let protocolNotice: string | null = null;
  let sessionWasReplaced = false;
  let reconnectAttempt = 0;
  let recoveryState: RecoveryState | null = { kind: 'initial-connect', role: 'host' };
  const actionIds = new Map<string, string>();

  const showHostEventError = (error: { readonly code: string }, actionLabel = 'Action'): void => {
    recoveryState = getRecoveryStateForEventError(
      error,
      { role: 'host', roomCode: session?.roomCode },
      actionLabel,
    );
    render();
  };

  const acceptSnapshot = (payload: unknown): boolean => {
    const parsed = parseRoomSnapshot(payload);
    if (!parsed.ok) {
      protocolNotice = parsed.message;
      recoveryState =
        parsed.error === 'incompatible-version'
          ? {
              kind: 'incompatible-client',
              role: 'host',
              roomCode: session?.roomCode,
              errorCode: parsed.error,
            }
          : {
              kind: 'server-unavailable',
              role: 'host',
              roomCode: session?.roomCode,
              errorCode: parsed.error,
            };
      if (activeNotice) setNotice(activeNotice, parsed.message, true);
      render();
      return false;
    }
    return snapshotStore.acceptSnapshot(parsed.value);
  };

  const beginHostAction = (
    key: string,
    button?: HTMLButtonElement,
    restoredActionId?: string,
  ): { actionId: string; finish: () => void } => {
    const actionId = restoredActionId ?? getClientActionId(actionIds, key);
    if (button) button.disabled = true;
    if (activeNotice) setNotice(activeNotice, 'Sending action…', false);
    const timer = window.setTimeout(() => {
      if (button) button.disabled = false;
      if (activeNotice) {
        setNotice(
          activeNotice,
          'The room did not respond. Check the connection, then retry safely.',
          true,
        );
      }
      recoveryState = {
        kind: 'action-timeout',
        role: 'host',
        roomCode: session?.roomCode,
        actionLabel: button?.textContent ?? 'Action',
      };
      render();
    }, 8_000);
    return {
      actionId,
      finish: () => {
        window.clearTimeout(timer);
        if (button) button.disabled = false;
        actionIds.delete(key);
      },
    };
  };

  const render = (): void => {
    const routeGameId = getGameFromPathname(window.location.pathname);
    const page = updatePage(
      pageShell,
      session ? `Room ${session.roomCode}` : 'Start a Riot',
      session
        ? 'Share the display with the room and let everyone join.'
        : 'Create a room to begin.',
      session?.gameId ?? routeGameId,
    );
    activeNotice = page.notice;
    renderConnectionNotice(connectionNotice, connectionStatus);
    if (connectionStatus === 'connected') setNotice(page.notice, '', false);
    if (protocolNotice) setNotice(page.notice, protocolNotice, true);
    if (sessionWasReplaced) {
      setNotice(
        page.notice,
        'This host session moved to another tab or device. Reload this page to take control here.',
        true,
      );
    }
    setGameTheme(root, session?.gameId ?? snapshot?.state.gameId ?? routeGameId);
    if (snapshot) sound.phaseChanged(snapshot.state.phase);

    const currentRoomInUrl = getRoomCodeFromSearch(window.location.search);
    if (
      session &&
      (window.location.pathname === routes.host ||
        currentRoomInUrl !== session.roomCode ||
        getGameFromPathname(window.location.pathname) !== session.gameId)
    ) {
      window.history.replaceState(null, '', buildHostRoute(session.gameId, session.roomCode));
    }

    if (recoveryState) {
      const clearRecovery = (): void => {
        recoveryState = null;
        render();
      };
      const leaveRoom = (): void => {
        const current = session;
        if (current) {
          removeRoomSession<HostSession>(window.localStorage, HOST_STORAGE_KEY, current.roomCode);
          sessionStore.setState(null);
          snapshotStore.setState(null);
          window.history.replaceState(null, '', buildHostRoute(current.gameId));
        }
        recoveryState = null;
        sessionWasReplaced = false;
        render();
      };
      page.content.append(
        createRecoveryPanel(
          recoveryState,
          getRecoveryHandlers(recoveryState, {
            ...(recoveryState.kind === 'action-timeout' ? { retry: clearRecovery } : {}),
            'return-to-launcher': leaveRoom,
            rejoin: leaveRoom,
            'edit-room-code': clearRecovery,
          }),
        ),
      );
      return;
    }

    if (!session) {
      const form = document.createElement('form');
      form.className = 'card form game-launcher';
      let drawnOutModeField: HTMLElement | null = null;
      let updateLauncherGuidance: (() => void) | null = null;
      const gamePicker = createGamePicker(routeGameId ?? 'groupthink', (game) => {
        window.history.replaceState(null, '', buildHostRoute(game.id));
        setGameTheme(root, game.id);
        updatePageBrand(page, game.id);
        if (drawnOutModeField) drawnOutModeField.hidden = game.id !== 'drawn-out';
        updateLauncherGuidance?.();
      });
      form.append(gamePicker.element);
      const contentMode = createContentModeSelect();
      form.append(createField('Content mode', contentMode));
      const drawnOutMode = createDrawnOutModeSelect();
      drawnOutModeField = createField('Drawn Out mode', drawnOutMode);
      drawnOutModeField.hidden = gamePicker.getValue() !== 'drawn-out';
      form.append(drawnOutModeField);
      const promptMode = createPromptModeSelect();
      const promptModeField = createField('Question source', promptMode);
      const promptModeHint = document.createElement('small');
      promptModeHint.className = 'muted';
      promptModeHint.textContent =
        'AI remix creates a fresh shuffled deck from local prompt ingredients, so it works offline on the big screen.';
      promptModeField.append(promptModeHint);
      const advancedSettings = document.createElement('details');
      advancedSettings.className = 'advanced-settings';
      const advancedSummary = document.createElement('summary');
      advancedSummary.textContent = 'Advanced settings';
      const advancedSettingsBody = document.createElement('div');
      advancedSettingsBody.className = 'advanced-settings-body';
      advancedSettingsBody.append(promptModeField);
      advancedSettings.append(advancedSummary, advancedSettingsBody);
      form.append(advancedSettings);
      const actions = document.createElement('div');
      actions.className = 'actions game-launcher-actions';
      const submit = createButton('Create Game', 'submit');
      submit.className = 'create-game-button';
      const guidance = document.createElement('p');
      guidance.className = 'launcher-guidance';
      updateLauncherGuidance = (): void => {
        const selectedGame = getGameDefinition(gamePicker.getValue());
        guidance.textContent = `${selectedGame.players} · Settings stay editable until round one.`;
      };
      updateLauncherGuidance();
      actions.append(guidance, submit);
      form.append(actions);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const gameId = gamePicker.getValue();
        const settings = {
          maxPlayers: getGamePresentation(gameId).getPlayerLimits(
            drawnOutMode.value as DrawnOutMode,
          ).maximum,
          roundCount: 5,
          contentMode: contentMode.value as ContentMode,
          promptMode: promptMode.value as PromptMode,
          drawnOutMode: drawnOutMode.value as DrawnOutMode,
        };
        const pending = getOrCreatePendingOperation(
          window.sessionStorage,
          PENDING_OPERATION_STORAGE_KEY,
          'host:create-room',
          { gameId, settings },
        );
        const action = beginHostAction(
          `host:create-room:${gameId}:${contentMode.value}:${promptMode.value}:${drawnOutMode.value}`,
          submit,
          pending.actionId,
        );
        const request: CreateRoomActionRequest = {
          actionId: action.actionId,
          gameId,
          settings,
        };
        socket.emit('host:create-room', request, (response: HostCreateResponse) => {
          action.finish();
          clearPendingOperation(
            window.sessionStorage,
            PENDING_OPERATION_STORAGE_KEY,
            'host:create-room',
          );
          if (!isSuccess(response)) {
            recoveryState = getRecoveryStateForEventError(
              response.error,
              { role: 'host' },
              'Create game',
            );
            render();
            return;
          }
          const createdSession: HostSession = {
            roomCode: response.roomCode,
            hostToken: response.hostToken,
            gameId,
          };
          sessionStore.setState(createdSession);
          window.history.replaceState(null, '', buildHostRoute(gameId, response.roomCode));
          if (!acceptSnapshot(response.snapshot)) return;
          writeRoomSession(window.localStorage, HOST_STORAGE_KEY, createdSession);
          render();
        });
      });
      page.content.append(form);
      return;
    }

    if (!snapshot) {
      const loading = document.createElement('div');
      loading.className = 'card';
      loading.textContent = 'Reconnecting to the room…';
      page.content.append(loading);
      return;
    }

    const state = snapshot.state;
    const hostMutationKey = (event: string): string =>
      createHostMutationKey(event, session?.roomCode ?? '', state.phase, snapshot?.game);
    const activeGame = getGameDefinition(snapshot.game?.id ?? state.gameId ?? session.gameId).id;
    const hostView = getHostRouteViewModel(
      activeGame,
      state.phase,
      state.players.length,
      state.settings.drawnOutMode,
    );
    setGameTheme(root, activeGame);
    sound.phaseChanged(state.phase, activeGame);
    page.content.append(updateHostExperience(experienceShell, experienceRoster, snapshot, session));

    const controls = document.createElement('div');
    controls.className = 'actions';
    const displayLink = document.createElement('a');
    displayLink.className = 'button secondary';
    displayLink.href = buildDisplayRoute(activeGame, session.roomCode);
    displayLink.target = '_blank';
    displayLink.rel = 'noreferrer';
    displayLink.textContent = 'Open Display';
    controls.className = `actions experience-controls ${hostView.controlsClass}`;
    controls.append(displayLink);
    controls.append(sound.button);

    if (state.phase === 'lobby') {
      const start = createButton(hostView.primaryAction?.label ?? 'Start Game');
      start.disabled = hostView.primaryAction?.disabled ?? false;
      start.addEventListener('click', () => {
        const action = beginHostAction(hostMutationKey('host:start-game'), start);
        const request: HostStartGameRequest = {
          actionId: action.actionId,
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
          gameId: session?.gameId ?? 'groupthink',
        };
        socket.emit('host:start-game', request, (response: RoomStateResponse) => {
          action.finish();
          if (!isSuccess(response)) {
            showHostEventError(response.error, 'Start game');
            return;
          }
          if (!acceptSnapshot(response.snapshot)) return;
          render();
        });
      });
      controls.append(start);
    } else if (state.phase === 'input') {
      const reveal = createButton(hostView.primaryAction?.label ?? 'Reveal Results');
      reveal.addEventListener('click', () => {
        const action = beginHostAction(hostMutationKey('host:reveal-results'), reveal);
        const request: HostRoomActionRequest = {
          actionId: action.actionId,
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:reveal-results', request, (response: RoomStateResponse) => {
          action.finish();
          if (!isSuccess(response)) {
            showHostEventError(response.error, 'Reveal results');
            return;
          }
          if (!acceptSnapshot(response.snapshot)) return;
          render();
        });
      });
      controls.append(reveal);
    } else if (state.phase === 'alibi') {
      const reveal = createButton(hostView.primaryAction?.label ?? 'Close the Alibi Window');
      reveal.addEventListener('click', () => {
        const action = beginHostAction(hostMutationKey('host:reveal-results'), reveal);
        const request: HostRoomActionRequest = {
          actionId: action.actionId,
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:reveal-results', request, (response: RoomStateResponse) => {
          action.finish();
          if (!isSuccess(response)) {
            showHostEventError(response.error, 'Reveal results');
            return;
          }
          if (!acceptSnapshot(response.snapshot)) return;
          render();
        });
      });
      controls.append(reveal);
    } else if (state.phase === 'voting') {
      const reveal = createButton(hostView.primaryAction?.label ?? 'Reveal Results');
      reveal.addEventListener('click', () => {
        const action = beginHostAction(hostMutationKey('host:reveal-results'), reveal);
        const request: HostRoomActionRequest = {
          actionId: action.actionId,
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:reveal-results', request, (response: RoomStateResponse) => {
          action.finish();
          if (!isSuccess(response)) {
            showHostEventError(response.error, 'Reveal results');
            return;
          }
          if (!acceptSnapshot(response.snapshot)) return;
          render();
        });
      });
      controls.append(reveal);
    } else if (state.phase === 'results') {
      const next = createButton(hostView.primaryAction?.label ?? 'Next Round');
      next.addEventListener('click', () => {
        const action = beginHostAction(hostMutationKey('host:next-round'), next);
        const request: HostRoomActionRequest = {
          actionId: action.actionId,
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:next-round', request, (response: RoomStateResponse) => {
          action.finish();
          if (!isSuccess(response)) {
            showHostEventError(response.error, 'Next round');
            return;
          }
          if (!acceptSnapshot(response.snapshot)) return;
          render();
        });
      });
      controls.append(next);
    } else {
      const phase = document.createElement('span');
      phase.className = 'pill';
      phase.textContent = 'WINNER';
      controls.append(phase);
    }

    const closeRoom = createButton('Close Room');
    closeRoom.className = 'secondary';
    closeRoom.addEventListener('click', () => {
      const currentSession = session;
      if (
        !currentSession ||
        !window.confirm('Close this room for everyone? Players will not be able to reconnect.')
      ) {
        return;
      }
      const action = beginHostAction(`host:close-room:${currentSession.roomCode}`, closeRoom);
      socket.emit(
        'host:close-room',
        {
          actionId: action.actionId,
          roomCode: currentSession.roomCode,
          hostToken: currentSession.hostToken,
        },
        (response: LeaveRoomResponse) => {
          action.finish();
          if (!isSuccess(response)) {
            showHostEventError(response.error, 'Close room');
            return;
          }
          sessionStore.setState(null);
          snapshotStore.setState(null);
          removeRoomSession<HostSession>(
            window.localStorage,
            HOST_STORAGE_KEY,
            currentSession.roomCode,
          );
          window.history.replaceState(null, '', buildHostRoute(currentSession.gameId));
          render();
        },
      );
    });
    controls.append(closeRoom);
    page.content.append(controls);

    const removablePlayers = state.players.filter((player) => player.status !== 'removed');
    if (removablePlayers.length > 0) {
      const moderation = document.createElement('section');
      moderation.className = 'card form';
      const heading = document.createElement('h2');
      heading.textContent = 'Room controls';
      const helper = document.createElement('p');
      helper.className = 'muted';
      helper.textContent = 'Remove a player who has left the group or is disrupting the room.';
      const kickActions = document.createElement('div');
      kickActions.className = 'actions';
      removablePlayers.forEach((player) => {
        const kick = createButton(
          player.status === 'disconnected' ? `Skip ${player.name} now` : `Remove ${player.name}`,
        );
        kick.className = 'secondary';
        kick.addEventListener('click', () => {
          if (!session || !window.confirm(`Remove ${player.name} from this room?`)) return;
          const action = beginHostAction(`host:kick-player:${session.roomCode}:${player.id}`, kick);
          const request: HostRemovePlayerRequest = {
            actionId: action.actionId,
            roomCode: session.roomCode,
            hostToken: session.hostToken,
            playerId: player.id,
          };
          socket.emit('host:kick-player', request, (response: RemovePlayerResponse) => {
            action.finish();
            if (!isSuccess(response)) {
              showHostEventError(response.error, 'Remove player');
              return;
            }
            if (!acceptSnapshot(response.snapshot)) return;
            render();
          });
        });
        kickActions.append(kick);
      });
      moderation.append(heading, helper, kickActions);
      page.content.append(moderation);
    }
  };

  socket.on('connect', () => {
    connectionStore.setState('connected');
    reconnectAttempt = 0;
    recoveryState = null;
    if (!session) {
      render();
      return;
    }
    const request: HostReconnectRequest = {
      actionId: window.crypto.randomUUID(),
      roomCode: session.roomCode,
      hostToken: session.hostToken,
    };
    recoveryState = { kind: 'initial-connect', role: 'host', roomCode: session.roomCode };
    render();
    socket.emit('host:reconnect', request, (response: HostReconnectResponse) => {
      if (!isSuccess(response)) {
        recoveryState = getRecoveryStateForEventError(response.error, {
          role: 'host',
          roomCode: session?.roomCode ?? roomFromUrl,
        });
        render();
        return;
      }
      recoveryState = null;
      if (!acceptSnapshot(response.snapshot)) return;
      render();
    });
  });

  socket.on('disconnect', () => {
    if (sessionWasReplaced) {
      if (activeNotice) {
        setNotice(
          activeNotice,
          'This host session moved to another tab or device. Reload this page to take control here.',
          true,
        );
      }
      return;
    }
    connectionStore.setState('reconnecting');
    reconnectAttempt += 1;
    recoveryState = {
      kind: 'reconnecting',
      role: 'host',
      roomCode: session?.roomCode,
      attempt: reconnectAttempt,
    };
    render();
  });

  socket.on('connect_error', () => {
    connectionStore.setState('reconnecting');
    reconnectAttempt += 1;
    recoveryState = {
      kind: 'server-unavailable',
      role: 'host',
      roomCode: session?.roomCode,
      attempt: reconnectAttempt,
    };
    render();
  });

  socket.on('room:state', (nextSnapshot) => {
    const parsed = parseRoomSnapshot(nextSnapshot);
    if (!parsed.ok) {
      acceptSnapshot(nextSnapshot);
      return;
    }
    if (session?.roomCode === parsed.value.state.roomCode) {
      if (!acceptSnapshot(parsed.value)) return;
      render();
    }
  });

  socket.on('room:closed', (notice) => {
    if (session?.roomCode !== notice.roomCode) return;
    const closedSession = session;
    sessionStore.setState(null);
    snapshotStore.setState(null);
    removeRoomSession<HostSession>(window.localStorage, HOST_STORAGE_KEY, closedSession.roomCode);
    window.history.replaceState(null, '', buildHostRoute(closedSession.gameId));
    render();
  });

  socket.on('session:replaced', (notice) => {
    if (session?.roomCode !== notice.roomCode || notice.role !== 'host') return;
    sessionWasReplaced = true;
    connectionStore.setState('connected');
    recoveryState = { kind: 'stale-session', role: 'host', roomCode: session.roomCode };
    render();
  });

  render();
}

function renderPlayer(root: HTMLElement): void {
  const socket = window.io();
  const connectionNotice = createConnectionNoticeComponent(document);
  const pageShell = createPageShellComponent(root, connectionNotice.element, document);
  const controllerRoster = createRosterComponent(document, 'controller-roster');
  const actionFirstController: ActionFirstControllerComponent =
    createActionFirstControllerComponent(document);
  const routeGameId = getGameFromPathname(window.location.pathname);
  const connectionStore = createConnectionStore();
  let connectionStatus = connectionStore.getState();
  connectionStore.subscribe((state) => {
    connectionStatus = state;
  });
  const roomFromUrl = getRoomCodeFromSearch(window.location.search);
  const mostRecentSession = readRoomSession<PlayerSession>(window.localStorage, PLAYER_STORAGE_KEY);
  const sessionStore = createSessionStore(
    readRoomSession<PlayerSession>(window.localStorage, PLAYER_STORAGE_KEY, roomFromUrl),
  );
  let session = sessionStore.getState();
  const snapshotStore = createPublicSnapshotStore<RoomSnapshot>();
  let snapshot = snapshotStore.getState();
  snapshotStore.subscribe((state) => {
    snapshot = state;
  });
  const privatePlayerStore = createPrivatePlayerStateStore<PlayerGameView>();
  let playerState = privatePlayerStore.getState();
  privatePlayerStore.subscribe((state) => {
    playerState = state;
  });
  let activeNotice: HTMLElement | null = null;
  let persistentNotice: PersistentNotice | null = null;
  let sessionWasReplaced = false;
  let reconnectAttempt = 0;
  let recoveryState: RecoveryState | null = { kind: 'initial-connect', role: 'player' };
  const joinDraft: JoinDraft = {
    roomCode: roomFromUrl || session?.roomCode || '',
    name: session?.name ?? mostRecentSession?.name ?? '',
    avatar: session?.avatar ?? mostRecentSession?.avatar ?? AVATARS[0] ?? '😎',
  };
  const draftStore = createDraftStore(
    readPlayerDraft(
      window.sessionStorage,
      PLAYER_DRAFT_STORAGE_KEY,
      session?.roomCode ?? roomFromUrl,
    ),
  );
  let playerDraft = draftStore.getState();
  draftStore.subscribe((state) => {
    playerDraft = state;
  });
  sessionStore.subscribe((state) => {
    session = state;
    draftStore.setState(
      state
        ? readPlayerDraft(window.sessionStorage, PLAYER_DRAFT_STORAGE_KEY, state.roomCode)
        : null,
    );
  });
  let renderedActionKey = '';
  let stateRenderScheduled = false;
  let controllerOperation: ControllerOperationState = { status: 'idle' };
  let acceptedControllerAction: ControllerAcceptedAction | undefined;
  let controllerAttempt = 0;
  let retryControllerAction: (() => void) | null = null;
  let activePlayerControllerRender: PlayerControllerRenderResult | null = null;
  let playerExperienceInitialized = false;
  let leaveButton: HTMLButtonElement | null = null;
  const actionIds = new Map<string, string>();

  const getActionKey = (): string => {
    if (!session || !snapshot) return '';
    return createPlayerActionKey({
      roomCode: session.roomCode,
      gameId: snapshot.state.gameId,
      phase: snapshot.state.phase,
      game: snapshot.game,
      playerState,
    });
  };

  const getControllerModel = (draft: PlayerDraft | null = playerDraft) => {
    if (!session || !snapshot) return null;
    if (acceptedControllerAction?.phase !== snapshot.state.phase) {
      acceptedControllerAction = undefined;
    }
    const gameId = getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId).id;
    return createActionFirstControllerViewModel({
      gameId,
      roomCode: session.roomCode,
      playerId: session.playerId,
      phase: snapshot.state.phase,
      publicGame: snapshot.game,
      playerState,
      draft,
      playerLabels: Object.fromEntries(
        snapshot.state.players.map((player) => [player.id, `${player.avatar} ${player.name}`]),
      ),
      operation: controllerOperation,
      ...(acceptedControllerAction ? { acceptedAction: acceptedControllerAction } : {}),
    });
  };

  const setPlayerNotice = (message: string, isError = false): void => {
    persistentNotice = message ? { message, isError } : null;
    if (activeNotice) setNotice(activeNotice, message, isError);
  };

  const showPlayerEventError = (error: { readonly code: string }, actionLabel = 'Action'): void => {
    recoveryState = getRecoveryStateForEventError(
      error,
      { role: 'player', roomCode: session?.roomCode ?? joinDraft.roomCode },
      actionLabel,
    );
    render();
  };

  const acceptSnapshot = (payload: unknown): boolean => {
    const parsed = parseRoomSnapshot(payload);
    if (!parsed.ok) {
      recoveryState =
        parsed.error === 'incompatible-version'
          ? {
              kind: 'incompatible-client',
              role: 'player',
              roomCode: session?.roomCode ?? joinDraft.roomCode,
              errorCode: parsed.error,
            }
          : {
              kind: 'server-unavailable',
              role: 'player',
              roomCode: session?.roomCode ?? joinDraft.roomCode,
              errorCode: parsed.error,
            };
      setPlayerNotice(parsed.message, true);
      render();
      return false;
    }
    return snapshotStore.acceptSnapshot(parsed.value);
  };

  const acceptPlayerState = (revision: number, payload: unknown): boolean => {
    const parsed = parsePlayerGameView(payload);
    if (!parsed.ok) {
      recoveryState = {
        kind: 'server-unavailable',
        role: 'player',
        roomCode: session?.roomCode ?? joinDraft.roomCode,
        errorCode: parsed.error,
      };
      setPlayerNotice(parsed.message, true);
      render();
      return false;
    }
    return privatePlayerStore.acceptState(revision, parsed.value);
  };

  const beginPending = (button: HTMLButtonElement): (() => void) => {
    const label = button.textContent;
    const isControllerAction = Boolean(button.closest('.action-first-controller'));
    button.disabled = true;
    button.textContent = 'Sending…';
    if (isControllerAction) controllerOperation = { status: 'pending' };
    const timer = window.setTimeout(() => {
      button.disabled = false;
      button.textContent = label;
      setPlayerNotice(
        'The room did not respond. Check your connection, then retry safely — your draft is saved.',
        true,
      );
      if (isControllerAction) {
        controllerAttempt += 1;
        controllerOperation = {
          status: 'failed',
          attempt: controllerAttempt,
          message: 'No acknowledgement arrived. Your saved input is ready to retry.',
        };
      } else {
        recoveryState = {
          kind: 'action-timeout',
          role: 'player',
          roomCode: session?.roomCode ?? joinDraft.roomCode,
          actionLabel: label ?? 'Action',
        };
      }
      render();
    }, 8_000);
    return () => {
      window.clearTimeout(timer);
      button.disabled = false;
      button.textContent = label;
      if (isControllerAction) {
        controllerOperation = { status: 'idle' };
        controllerAttempt = 0;
      }
    };
  };

  const saveDraft = (update: Partial<PlayerDraft>): void => {
    if (!session) return;
    const actionKey = getActionKey();
    const nextDraft: PlayerDraft = {
      ...(playerDraft?.actionKey === actionKey ? playerDraft : { actionKey }),
      ...update,
    };
    draftStore.setState(nextDraft);
    writePlayerDraft(window.sessionStorage, PLAYER_DRAFT_STORAGE_KEY, session.roomCode, nextDraft);
    const clearModel = getControllerModel(nextDraft)?.clearDraft;
    if (clearModel) {
      actionFirstController.clearDraftButton.textContent = clearModel.label;
      actionFirstController.clearDraftButton.setAttribute('aria-label', clearModel.accessibleLabel);
      actionFirstController.clearDraftButton.dataset.confirmationTitle =
        clearModel.confirmationTitle;
      actionFirstController.clearDraftButton.dataset.confirmationMessage =
        clearModel.confirmationMessage;
      actionFirstController.clearDraftButton.hidden = false;
    }
  };

  const clearDraft = (): void => {
    if (session) {
      removePlayerDraft(window.sessionStorage, PLAYER_DRAFT_STORAGE_KEY, session.roomCode);
    }
    draftStore.setState(null);
  };

  actionFirstController.retryButton.addEventListener('click', () => retryControllerAction?.());
  actionFirstController.clearDraftButton.addEventListener('click', () => {
    const title = actionFirstController.clearDraftButton.dataset.confirmationTitle;
    const message = actionFirstController.clearDraftButton.dataset.confirmationMessage;
    if (!window.confirm([title, message].filter(Boolean).join('\n\n'))) return;
    clearDraft();
    controllerOperation = { status: 'idle' };
    controllerAttempt = 0;
    render();
    window.requestAnimationFrame(() => {
      actionFirstController.primarySlot
        .querySelector<HTMLElement>('input, textarea, select, canvas, button')
        ?.focus({ preventScroll: true });
    });
  });

  const scheduleStateRender = (): void => {
    if (stateRenderScheduled) return;
    stateRenderScheduled = true;
    window.setTimeout(() => {
      stateRenderScheduled = false;
      const nextActionKey = getActionKey();
      if (nextActionKey !== renderedActionKey) {
        render();
        return;
      }
      if (snapshot) {
        const currentRoster = root.querySelector<HTMLElement>('.controller-roster');
        if (currentRoster) {
          controllerRoster.update(
            snapshot.state,
            getGamePresentation(getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId).id),
          );
          if (currentRoster !== controllerRoster.element) {
            currentRoster.replaceWith(controllerRoster.element);
          }
        }
      }
    }, 16);
  };

  const join = (
    roomCodeInput: string,
    nameInput: string,
    avatarInput: string,
    notice: HTMLElement,
    submit?: HTMLButtonElement,
  ): void => {
    const roomCode = roomCodeInput.trim().toUpperCase();
    joinDraft.roomCode = roomCode;
    joinDraft.name = nameInput;
    joinDraft.avatar = avatarInput;
    const payload =
      session?.roomCode === roomCode
        ? {
            roomCode,
            name: nameInput,
            avatar: avatarInput,
            playerToken: session.playerToken,
          }
        : { roomCode, name: nameInput, avatar: avatarInput };
    const pending = getOrCreatePendingOperation(
      window.sessionStorage,
      PENDING_OPERATION_STORAGE_KEY,
      'player:join',
      payload,
    );
    const request: JoinRoomActionRequest = { actionId: pending.actionId, ...payload };

    const finishPending = submit ? beginPending(submit) : () => undefined;
    socket.emit('player:join', request, (response: PlayerJoinResponse) => {
      finishPending();
      clearPendingOperation(window.sessionStorage, PENDING_OPERATION_STORAGE_KEY, 'player:join');
      if (!isSuccess(response)) {
        if (response.error.code === 'ROOM_NOT_FOUND' || response.error.code === 'UNAUTHORIZED') {
          const rejectedSession = session;
          sessionStore.setState(null);
          snapshotStore.setState(null);
          privatePlayerStore.setState(null);
          if (rejectedSession) {
            removeRoomSession<PlayerSession>(
              window.localStorage,
              PLAYER_STORAGE_KEY,
              rejectedSession.roomCode,
            );
          }
          recoveryState = getRecoveryStateForEventError(response.error, {
            role: 'player',
            roomCode,
          });
          render();
        } else {
          recoveryState = getRecoveryStateForEventError(
            response.error,
            { role: 'player', roomCode },
            'Join room',
          );
          render();
        }
        return;
      }
      const joinedSession: PlayerSession = {
        roomCode: response.roomCode,
        playerId: response.playerId,
        playerToken: response.playerToken,
        name: nameInput.trim(),
        avatar: avatarInput,
      };
      sessionStore.setState(joinedSession);
      sessionWasReplaced = false;
      recoveryState = null;
      if (!acceptSnapshot(response.snapshot)) return;
      if (!acceptPlayerState(response.snapshot.revision, response.playerState)) return;
      const joinedGame = response.snapshot.state.gameId;
      if (joinedGame) {
        window.history.replaceState(
          null,
          '',
          buildPlayRoute(getGameDefinition(joinedGame).id, response.roomCode),
        );
      }
      writeRoomSession(window.localStorage, PLAYER_STORAGE_KEY, joinedSession);
      persistentNotice = null;
      render();
    });
  };

  const completeControllerMutation = (
    response: PlayerAnswerResponse,
    finishPending: () => void,
    mutationKey: string,
    acceptedAction: ControllerAcceptedAction,
    errorLabel: string,
  ): void => {
    finishPending();
    actionIds.delete(mutationKey);
    if (!isSuccess(response)) {
      showPlayerEventError(response.error, errorLabel);
      return;
    }
    acceptedControllerAction = acceptedAction;
    if (!acceptSnapshot(response.snapshot)) return;
    if (!acceptPlayerState(response.snapshot.revision, response.playerState)) return;
    clearDraft();
    persistentNotice = null;
    render();
  };

  const createPlayerControllerDependencies = (): PlayerControllerDependencies => ({
    document,
    saveDraft,
    showNotice: setPlayerNotice,
    createDrawingPad,
    createDrawingPreview,
    mutations: {
      submitAnswer: (intent) => {
        if (!session) return;
        const finishPending = beginPending(intent.trigger);
        const mutationKey = `player:submit-answer:${getActionKey()}`;
        const request: PlayerSubmitAnswerRequest = {
          actionId: getClientActionId(actionIds, mutationKey),
          roomCode: session.roomCode,
          playerToken: session.playerToken,
          answer: intent.answer,
          ...(intent.targetPlayerId ? { targetPlayerId: intent.targetPlayerId } : {}),
        };
        socket.emit('player:submit-answer', request, (response: PlayerAnswerResponse) =>
          completeControllerMutation(
            response,
            finishPending,
            mutationKey,
            intent.acceptedAction,
            intent.acceptedAction.title.includes('Description') ||
              intent.acceptedAction.title.includes('Choice')
              ? 'Submit alibi'
              : 'Submit answer',
          ),
        );
      },
      castVote: (intent) => {
        if (!session) return;
        const finishPending = beginPending(intent.trigger);
        const mutationKey = `player:cast-vote:${getActionKey()}`;
        const request: PlayerCastVoteRequest = {
          actionId: getClientActionId(actionIds, mutationKey),
          roomCode: session.roomCode,
          playerToken: session.playerToken,
          entryId: intent.entryId,
        };
        const errorLabel =
          intent.acceptedAction.title === 'Vote accepted'
            ? 'Submit drawing'
            : intent.acceptedAction.acceptedLabel === 'Your accusation'
              ? 'Submit answer'
              : 'Cast vote';
        socket.emit('player:cast-vote', request, (response: PlayerAnswerResponse) =>
          completeControllerMutation(
            response,
            finishPending,
            mutationKey,
            intent.acceptedAction,
            errorLabel,
          ),
        );
      },
      submitAlibi: (intent) => {
        if (!session) return;
        const finishPending = beginPending(intent.trigger);
        const mutationKey = `player:submit-alibi:${getActionKey()}`;
        const request: PlayerSubmitAlibiRequest = {
          actionId: getClientActionId(actionIds, mutationKey),
          roomCode: session.roomCode,
          playerToken: session.playerToken,
          alibi: intent.alibi,
        };
        socket.emit('player:submit-alibi', request, (response: PlayerAnswerResponse) =>
          completeControllerMutation(
            response,
            finishPending,
            mutationKey,
            intent.acceptedAction,
            'Cast vote',
          ),
        );
      },
      submitDrawing: (intent) => {
        if (!session) return;
        const finishPending = beginPending(intent.trigger);
        const mutationKey = `player:submit-drawing:${getActionKey()}`;
        const request: PlayerSubmitDrawingRequest = {
          actionId: getClientActionId(actionIds, mutationKey),
          roomCode: session.roomCode,
          playerToken: session.playerToken,
          drawing: intent.drawing,
        };
        socket.emit('player:submit-drawing', request, (response: PlayerAnswerResponse) =>
          completeControllerMutation(
            response,
            finishPending,
            mutationKey,
            intent.acceptedAction,
            'Cast vote',
          ),
        );
      },
    },
  });

  const render = (): void => {
    const previousActionKey = renderedActionKey;
    const nextActionKey = session && snapshot ? getActionKey() : '';
    const retainPlayerExperience =
      playerExperienceInitialized && Boolean(session && snapshot && playerState && !recoveryState);
    const rebuildPlayerController = !retainPlayerExperience || previousActionKey !== nextActionKey;
    const previousControls = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.answer-form input, .answer-form textarea, .answer-form select, .answer-form button, .drawing-pad canvas, .drawing-pad button, .drawing-pad select',
      ),
    );
    const focusedControlIndex = previousControls.indexOf(document.activeElement as HTMLElement);
    const focusedControl =
      focusedControlIndex >= 0 ? previousControls[focusedControlIndex] : undefined;
    const selection =
      focusedControl instanceof HTMLInputElement || focusedControl instanceof HTMLTextAreaElement
        ? { start: focusedControl.selectionStart, end: focusedControl.selectionEnd }
        : null;
    const previousScroll = { x: window.scrollX, y: window.scrollY };
    if (rebuildPlayerController) {
      activePlayerControllerRender?.dispose();
      activePlayerControllerRender = null;
    }
    const page = updatePage(
      pageShell,
      session ? `You're in ${session.roomCode}` : 'Join the Riot',
      session
        ? 'Keep this page open and watch the big screen.'
        : 'Enter the code shown on the display.',
      snapshot?.game?.id ?? snapshot?.state.gameId ?? routeGameId,
      !retainPlayerExperience,
    );
    activeNotice = page.notice;
    renderConnectionNotice(connectionNotice, connectionStatus);
    if (connectionStatus === 'connected') setNotice(page.notice, '', false);
    if (persistentNotice) {
      setNotice(page.notice, persistentNotice.message, persistentNotice.isError);
    }
    setGameTheme(root, snapshot?.state.gameId ?? routeGameId);

    if (recoveryState) {
      playerExperienceInitialized = false;
      const clearRecovery = (): void => {
        recoveryState = null;
        sessionWasReplaced = false;
        render();
      };
      const rejoin = (): void => {
        const rejected = session;
        if (rejected) {
          removeRoomSession<PlayerSession>(
            window.localStorage,
            PLAYER_STORAGE_KEY,
            rejected.roomCode,
          );
        }
        sessionStore.setState(null);
        snapshotStore.setState(null);
        privatePlayerStore.setState(null);
        clearRecovery();
      };
      const retryJoin = (): void => {
        if (joinDraft.roomCode && joinDraft.name) {
          recoveryState = { kind: 'initial-connect', role: 'player', roomCode: joinDraft.roomCode };
          render();
          join(joinDraft.roomCode, joinDraft.name, joinDraft.avatar, page.notice);
        } else {
          clearRecovery();
        }
      };
      page.content.append(
        createRecoveryPanel(
          recoveryState,
          getRecoveryHandlers(recoveryState, {
            retry: recoveryState.kind === 'action-timeout' ? clearRecovery : retryJoin,
            rejoin,
            'edit-room-code': clearRecovery,
            'return-to-launcher': rejoin,
          }),
        ),
      );
      return;
    }

    if (!session) {
      playerExperienceInitialized = false;
      const form = document.createElement('form');
      form.className = routeGameId ? `form themed-join-card join-${routeGameId}` : 'card form';
      if (routeGameId) {
        const game = getGameDefinition(routeGameId);
        const playerView = getPlayerRouteViewModel(routeGameId);
        const intro = document.createElement('div');
        intro.className = 'themed-join-intro';
        intro.append(createGameArtwork(game, 'themed-join-logo'));
        const copy = document.createElement('div');
        const kicker = document.createElement('span');
        kicker.className = 'experience-eyebrow';
        kicker.textContent = playerView.joinKicker;
        const heading = document.createElement('h1');
        heading.textContent = `Join ${game.label}`;
        const helper = document.createElement('p');
        helper.className = 'muted';
        helper.textContent = playerView.joinHelper;
        copy.append(kicker, heading, helper);
        intro.append(copy);
        form.append(intro);
      }
      const roomInput = createTextInput(joinDraft.roomCode);
      roomInput.autocomplete = 'off';
      roomInput.placeholder = 'RAGE';
      roomInput.maxLength = 6;
      const nameInput = createTextInput(joinDraft.name);
      nameInput.autocomplete = 'name';
      nameInput.placeholder = 'Your name';
      const avatarSelect = createAvatarSelect(joinDraft.avatar);
      form.append(
        createField('Room code', roomInput),
        createField('Name', nameInput),
        createField('Avatar', avatarSelect),
      );
      const submit = createButton('Join Room', 'submit');
      form.append(submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!roomInput.value.trim() || !nameInput.value.trim()) {
          setPlayerNotice('Enter a room code and name.', true);
          return;
        }
        join(roomInput.value, nameInput.value, avatarSelect.value, page.notice, submit);
      });
      page.content.append(form);
      return;
    }

    const state = snapshot?.state;
    const actionKey = getActionKey();
    if (actionKey && shouldDiscardDraft(playerDraft, actionKey)) {
      clearDraft();
    }
    renderedActionKey = actionKey;
    const activeGame = snapshot?.game?.id ?? state?.gameId;
    const controllerGame = activeGame ? getGameDefinition(activeGame).id : null;
    const controllerModel = controllerGame && state ? getControllerModel() : null;
    const previousControllerRender = activePlayerControllerRender;
    const controllerRender =
      snapshot && playerState && session
        ? rebuildPlayerController || !activePlayerControllerRender
          ? renderPlayerController(
              snapshot,
              playerState,
              { playerId: session.playerId, draft: playerDraft },
              createPlayerControllerDependencies(),
            )
          : activePlayerControllerRender
        : null;
    const controllerWasRebuilt = controllerRender !== previousControllerRender;
    activePlayerControllerRender = controllerRender;
    const status = controllerRender?.element ?? document.createElement('div');
    if (!controllerRender) {
      status.className = 'action-first-controller__legacy-supplemental';
      const waiting = document.createElement('p');
      waiting.className = 'muted';
      waiting.textContent = state ? 'Look at the big screen.' : 'Connecting to the room…';
      status.append(waiting);
    }
    if (controllerModel) {
      const primaryControl = controllerRender?.primaryControl ?? null;
      if (controllerWasRebuilt) {
        status
          .querySelectorAll<HTMLElement>(
            ':scope > .prompt, :scope > .pill, :scope > .muted, :scope > .drawn-out-instruction, :scope > .drawn-out-private-prompt',
          )
          .forEach((duplicate) => duplicate.remove());
      }
      retryControllerAction = controllerRender?.retry
        ? () => {
            controllerOperation = { status: 'idle' };
            persistentNotice = null;
            controllerRender.retry?.();
          }
        : null;
      actionFirstController.update(controllerModel, {
        ...(primaryControl ? { primaryControl } : {}),
        ...(status.childElementCount > 0 ? { supplemental: status } : {}),
      });
      renderedActionKey = controllerModel.actionKey;
      page.content.append(actionFirstController.element);
      playerExperienceInitialized = true;
    } else {
      retryControllerAction = null;
      page.content.append(status);
    }

    if (snapshot) {
      controllerRoster.update(
        snapshot.state,
        getGamePresentation(getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId).id),
      );
      page.content.append(controllerRoster.element);
    }

    if (!leaveButton) {
      const leave = createButton('Leave Room');
      leave.className = 'secondary';
      leave.addEventListener('click', () => {
        const currentSession = session;
        if (!currentSession) return;
        const finishPending = beginPending(leave);
        socket.emit(
          'player:leave',
          {
            actionId: window.crypto.randomUUID(),
            roomCode: currentSession.roomCode,
            playerToken: currentSession.playerToken,
          },
          (response: LeaveRoomResponse) => {
            finishPending();
            if (!isSuccess(response)) {
              showPlayerEventError(response.error, 'Leave room');
              return;
            }
            const previousGame = getGameDefinition(snapshot?.state.gameId ?? routeGameId).id;
            sessionStore.setState(null);
            snapshotStore.setState(null);
            privatePlayerStore.setState(null);
            removeRoomSession<PlayerSession>(
              window.localStorage,
              PLAYER_STORAGE_KEY,
              currentSession.roomCode,
            );
            removePlayerDraft(
              window.sessionStorage,
              PLAYER_DRAFT_STORAGE_KEY,
              currentSession.roomCode,
            );
            setPlayerNotice('You left the room.', false);
            window.history.replaceState(null, '', buildPlayRoute(previousGame));
            render();
          },
        );
      });
      leaveButton = leave;
    }
    if (leaveButton) page.content.append(leaveButton);

    if (previousActionKey && previousActionKey === actionKey && focusedControlIndex >= 0) {
      window.requestAnimationFrame(() => {
        const controls = root.querySelectorAll<HTMLElement>(
          '.answer-form input, .answer-form textarea, .answer-form select, .answer-form button, .drawing-pad canvas, .drawing-pad button, .drawing-pad select',
        );
        const control = controls[focusedControlIndex];
        control?.focus({ preventScroll: true });
        if (
          selection &&
          (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)
        ) {
          control.setSelectionRange(selection.start, selection.end);
        }
        window.scrollTo(previousScroll.x, previousScroll.y);
      });
    }
  };

  socket.on('connect', () => {
    connectionStore.setState('connected');
    reconnectAttempt = 0;
    recoveryState = null;
    if (!session) {
      render();
      return;
    }
    recoveryState = { kind: 'initial-connect', role: 'player', roomCode: session.roomCode };
    render();
    join(
      session.roomCode,
      session.name,
      session.avatar,
      activeNotice ?? document.createElement('p'),
    );
  });

  socket.on('disconnect', () => {
    if (sessionWasReplaced) {
      setPlayerNotice(
        'This seat moved to another tab or device. Reload this page to take control here.',
        true,
      );
      render();
      return;
    }
    connectionStore.setState('reconnecting');
    reconnectAttempt += 1;
    recoveryState = {
      kind: 'reconnecting',
      role: 'player',
      roomCode: session?.roomCode ?? joinDraft.roomCode,
      attempt: reconnectAttempt,
    };
    if (activeNotice) {
      setNotice(activeNotice, 'Connection lost. Reconnecting automatically…', true);
    }
  });

  socket.on('connect_error', () => {
    connectionStore.setState('reconnecting');
    reconnectAttempt += 1;
    recoveryState = {
      kind: 'server-unavailable',
      role: 'player',
      roomCode: session?.roomCode ?? joinDraft.roomCode,
      attempt: reconnectAttempt,
    };
    if (activeNotice) {
      setNotice(activeNotice, 'Connection lost. Reconnecting automatically…', true);
    }
  });

  socket.on('room:state', (nextSnapshot) => {
    const parsed = parseRoomSnapshot(nextSnapshot);
    if (!parsed.ok) {
      acceptSnapshot(nextSnapshot);
      return;
    }
    if (session?.roomCode === parsed.value.state.roomCode) {
      if (!acceptSnapshot(parsed.value)) return;
      if (playerState && privatePlayerStore.getRevision() !== parsed.value.revision) return;
      scheduleStateRender();
    }
  });

  socket.on('player:state', (update) => {
    const parsed = parsePlayerStateUpdate(update);
    if (!parsed.ok) {
      setPlayerNotice(parsed.message, true);
      return;
    }
    if (
      session?.roomCode !== parsed.value.roomCode ||
      !acceptPlayerState(parsed.value.revision, parsed.value.state)
    )
      return;
    const currentSnapshot = snapshotStore.getState();
    if (!currentSnapshot || currentSnapshot.revision !== parsed.value.revision) return;
    scheduleStateRender();
  });

  socket.on('player:removed', (notice) => {
    if (session?.roomCode !== notice.roomCode) return;
    const removedSession = session;
    const previousGame = getGameDefinition(snapshot?.state.gameId ?? routeGameId).id;
    sessionStore.setState(null);
    snapshotStore.clear();
    privatePlayerStore.setState(null);
    removeRoomSession<PlayerSession>(
      window.localStorage,
      PLAYER_STORAGE_KEY,
      removedSession.roomCode,
    );
    removePlayerDraft(window.sessionStorage, PLAYER_DRAFT_STORAGE_KEY, removedSession.roomCode);
    setPlayerNotice('The host removed you from the room.', true);
    window.history.replaceState(null, '', buildPlayRoute(previousGame));
    render();
  });

  socket.on('room:closed', (notice) => {
    if (session?.roomCode !== notice.roomCode) return;
    const closedSession = session;
    const previousGame = getGameDefinition(snapshot?.state.gameId ?? routeGameId).id;
    sessionStore.setState(null);
    snapshotStore.setState(null);
    privatePlayerStore.setState(null);
    removeRoomSession<PlayerSession>(
      window.localStorage,
      PLAYER_STORAGE_KEY,
      closedSession.roomCode,
    );
    removePlayerDraft(window.sessionStorage, PLAYER_DRAFT_STORAGE_KEY, closedSession.roomCode);
    setPlayerNotice('The host closed the room.', true);
    window.history.replaceState(null, '', buildPlayRoute(previousGame));
    render();
  });

  socket.on('session:replaced', (notice) => {
    if (session?.roomCode !== notice.roomCode || notice.role !== 'player') return;
    sessionWasReplaced = true;
    connectionStore.setState('connected');
    recoveryState = { kind: 'stale-session', role: 'player', roomCode: session.roomCode };
    setPlayerNotice(
      'This seat moved to another tab or device. Reload this page to take control here.',
      true,
    );
    render();
  });

  render();
}

function renderDisplay(root: HTMLElement): void {
  const roomCode = getRoomCodeFromSearch(window.location.search);
  const routeGameId = getGameFromPathname(window.location.pathname);
  const displayView = getDisplayRouteViewModel(roomCode, routeGameId);
  const socket = window.io();
  const sound = createSoundController();
  const connectionNotice = createConnectionNoticeComponent(document);
  const pageShell = createPageShellComponent(root, connectionNotice.element, document);
  const experienceShell = createRoomStageShellComponent('display-experience', document);
  const experienceRoster = createRosterComponent(document);
  const displayJoin = createPhaseAwareJoinComponent(document);
  const displayDensity = createTvDensityLayoutComponent(document);
  const displayAudio = document.createElement('div');
  displayAudio.className = 'display-audio-control';
  displayAudio.append(sound.button);
  displayJoin.element.append(displayAudio);
  const connectionStore = createConnectionStore();
  let connectionStatus = connectionStore.getState();
  connectionStore.subscribe((state) => {
    connectionStatus = state;
  });
  const snapshotStore = createPublicSnapshotStore<RoomSnapshot>();
  let snapshot = snapshotStore.getState();
  snapshotStore.subscribe((state) => {
    snapshot = state;
  });
  let roomClosed = false;
  let reconnectAttempt = 0;
  let recoveryState: RecoveryState | null = { kind: 'initial-connect', role: 'display', roomCode };
  let densityPageIndex = 0;
  let densityKey = '';
  let activeDensity: LiveDisplayDensityViewModel | null = null;
  let pageRotationTimer: number | null = null;
  const page = updatePage(pageShell, displayView.title, displayView.subtitle, routeGameId);
  const acceptSnapshot = (payload: unknown): boolean => {
    const parsed = parseRoomSnapshot(payload);
    if (!parsed.ok) {
      recoveryState =
        parsed.error === 'incompatible-version'
          ? { kind: 'incompatible-client', role: 'display', roomCode, errorCode: parsed.error }
          : { kind: 'server-unavailable', role: 'display', roomCode, errorCode: parsed.error };
      setNotice(page.notice, parsed.message, true);
      render();
      return false;
    }
    return snapshotStore.acceptSnapshot(parsed.value);
  };
  root.classList.add('display-page');

  const render = (): void => {
    if (pageRotationTimer !== null) {
      window.clearTimeout(pageRotationTimer);
      pageRotationTimer = null;
    }
    page.content.replaceChildren();
    renderConnectionNotice(connectionNotice, connectionStatus);
    if (connectionStatus === 'connected') setNotice(page.notice, '', false);
    const activeGame = snapshot?.game?.id ?? snapshot?.state.gameId ?? routeGameId;
    setGameTheme(root, activeGame);
    updatePageBrand(page, activeGame);
    if (activeGame && roomCode && getGameFromPathname(window.location.pathname) !== activeGame) {
      window.history.replaceState(
        null,
        '',
        buildDisplayRoute(getGameDefinition(activeGame).id, roomCode),
      );
    }
    if (recoveryState) {
      const returnToLauncher = (): void => {
        window.location.assign(routes.host);
      };
      page.content.append(
        createRecoveryPanel(
          recoveryState,
          getRecoveryHandlers(recoveryState, {
            'return-to-launcher': returnToLauncher,
            'edit-room-code': returnToLauncher,
            rejoin: returnToLauncher,
          }),
        ),
      );
      return;
    }
    if (!roomCode) {
      const empty = document.createElement('div');
      empty.className = 'card center';
      empty.textContent = displayView.emptyMessage;
      page.content.append(empty);
      return;
    }

    if (roomClosed) {
      recoveryState = { kind: 'room-missing', role: 'display', roomCode };
      render();
      return;
    }

    if (!snapshot) {
      const loading = document.createElement('div');
      loading.className = 'card center';
      loading.textContent = 'Connecting to the room…';
      page.content.append(loading);
      return;
    }

    const state = snapshot.state;
    const displayGame = getGameDefinition(activeGame).id;
    sound.phaseChanged(state.phase, displayGame);
    const densityView = createLiveDisplayDensityViewModel(snapshot, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (densityKey !== densityView.key) {
      densityKey = densityView.key;
      densityPageIndex = 0;
    } else {
      densityPageIndex = getTvDensityPage(densityView.plan, densityPageIndex).index;
    }
    activeDensity = densityView;
    page.content.append(
      updateDisplayExperience(
        experienceShell,
        experienceRoster,
        displayJoin,
        displayDensity,
        snapshot,
        densityView,
        densityPageIndex,
      ),
    );
    if (densityView.plan.hasPagination) {
      pageRotationTimer = window.setTimeout(() => {
        densityPageIndex = advanceTvDensityPage(densityView.plan, densityPageIndex);
        render();
      }, DISPLAY_PAGE_ROTATION_MS);
    }
  };

  const showRelativePage = (direction: 1 | -1): void => {
    if (!activeDensity?.plan.hasPagination) return;
    densityPageIndex = advanceTvDensityPage(activeDensity.plan, densityPageIndex, direction);
    render();
  };
  displayDensity.previousButton.addEventListener('click', () => showRelativePage(-1));
  displayDensity.nextButton.addEventListener('click', () => showRelativePage(1));
  window.addEventListener(
    'resize',
    () => {
      window.requestAnimationFrame(render);
    },
    { passive: true },
  );

  socket.on('connect', () => {
    connectionStore.setState('connected');
    reconnectAttempt = 0;
    recoveryState = null;
    if (!roomCode) {
      render();
      return;
    }
    const request: DisplayWatchRequest = { roomCode };
    recoveryState = { kind: 'initial-connect', role: 'display', roomCode };
    render();
    socket.emit('display:watch', request, (response: RoomStateResponse) => {
      if (!isSuccess(response)) {
        recoveryState = getRecoveryStateForEventError(response.error, {
          role: 'display',
          roomCode,
        });
        render();
        return;
      }
      recoveryState = null;
      if (!acceptSnapshot(response.snapshot)) return;
      roomClosed = false;
      render();
    });
  });

  socket.on('disconnect', () => {
    connectionStore.setState('reconnecting');
    reconnectAttempt += 1;
    recoveryState = { kind: 'reconnecting', role: 'display', roomCode, attempt: reconnectAttempt };
    render();
  });

  socket.on('connect_error', () => {
    connectionStore.setState('reconnecting');
    reconnectAttempt += 1;
    recoveryState = {
      kind: 'server-unavailable',
      role: 'display',
      roomCode,
      attempt: reconnectAttempt,
    };
    render();
  });

  socket.on('room:state', (nextSnapshot) => {
    const parsed = parseRoomSnapshot(nextSnapshot);
    if (!parsed.ok) {
      acceptSnapshot(nextSnapshot);
      return;
    }
    if (parsed.value.state.roomCode === roomCode) {
      if (!acceptSnapshot(parsed.value)) return;
      render();
    }
  });

  socket.on('room:closed', (notice) => {
    if (notice.roomCode !== roomCode) return;
    snapshotStore.setState(null);
    roomClosed = true;
    recoveryState = { kind: 'room-missing', role: 'display', roomCode };
    render();
  });

  render();
}

if (typeof document !== 'undefined') {
  installMotionVisibility(document);
  window.setInterval(() => {
    document.querySelectorAll<HTMLElement>('[data-deadline-at]').forEach(updateCountdown);
  }, 1_000);

  const target = document.querySelector<HTMLElement>('#app');
  if (target) {
    if (!window.io) {
      target.textContent = 'Realtime client failed to load.';
    } else if (
      window.location.pathname === routes.host ||
      window.location.pathname.startsWith('/host/')
    ) {
      renderHost(target);
    } else if (
      window.location.pathname === routes.play ||
      window.location.pathname.startsWith('/play/')
    ) {
      renderPlayer(target);
    } else {
      renderDisplay(target);
    }
  }
}
