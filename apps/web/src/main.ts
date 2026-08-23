import type {
  CreateRoomRequest,
  DisplayWatchRequest,
  HostReconnectRequest,
  HostRoomActionRequest,
  HostStartGameRequest,
  JoinRoomRequest,
  PlayerCastVoteRequest,
  PlayerSubmitAnswerRequest,
  RoomPhase,
  RoomCode,
  SessionToken,
} from '@room-riot/contracts';
import type { PublicRoomState } from '@room-riot/game-engine';
import type { GroupthinkPlayerView, GroupthinkPublicView } from '@room-riot/groupthink';
import type { HotTakeEntryView, HotTakePlayerView } from '@room-riot/hot-take';

import type {
  HostCreateResponse,
  HostReconnectResponse,
  PlayerAnswerResponse,
  PlayerJoinResponse,
  PlayerGameView,
  RoomSnapshot,
  RoomStateResponse,
} from './protocol.js';
import { isSuccess } from './protocol.js';

export const routes = {
  display: '/display',
  host: '/host',
  play: '/play',
} as const;

const AVATARS = ['😎', '🤡', '👽', '💀', '🤖', '🐸', '👻', '🦆'];
const HOST_STORAGE_KEY = 'room-riot-host-session';
const PLAYER_STORAGE_KEY = 'room-riot-player-session';

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

interface PageParts {
  readonly content: HTMLElement;
  readonly notice: HTMLElement;
  readonly brand: HTMLElement;
  readonly brandLogo: HTMLImageElement;
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

type SupportedGameId = 'groupthink' | 'hot-take';

interface GameDefinition {
  readonly id: SupportedGameId;
  readonly label: string;
  readonly kicker: string;
  readonly description: string;
  readonly players: string;
  readonly rounds: string;
  readonly pace: string;
  readonly icon: string;
}

interface GamePicker {
  readonly element: HTMLElement;
  readonly getValue: () => SupportedGameId;
}

const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: 'groupthink',
    label: 'Groupthink',
    kicker: 'Match minds',
    description: 'Give your answer, then see how many people in the room thought the same way.',
    players: '1–12 players',
    rounds: '5 rounds',
    pace: 'Fast · social',
    icon: '/assets/groupthink-icon.png',
  },
  {
    id: 'hot-take',
    label: 'Hot Take',
    kicker: 'Say it louder',
    description: "Drop an anonymous opinion, then vote for the take the room can't ignore.",
    players: '3–12 players',
    rounds: '5 rounds',
    pace: 'Anonymous · spicy',
    icon: '/assets/hot-take-icon.png',
  },
];

function getGameFromPathname(pathname = window.location.pathname): SupportedGameId | null {
  const match = pathname.match(/^\/(?:host|display)\/(groupthink|hot-take)$/);
  const gameId = match?.[1];
  return gameId === 'groupthink' || gameId === 'hot-take' ? gameId : null;
}

function buildHostRoute(gameId: SupportedGameId): string {
  return `/host/${gameId}`;
}

function buildDisplayRoute(gameId: SupportedGameId, roomCode: string): string {
  return `/display/${gameId}?room=${encodeURIComponent(roomCode)}`;
}

interface SoundController {
  readonly button: HTMLButtonElement;
  phaseChanged(phase: RoomPhase): void;
}

function createPage(
  root: HTMLElement,
  titleText: string,
  subtitleText: string,
  gameId: string | null = null,
): PageParts {
  root.replaceChildren();
  const pageKind =
    window.location.pathname === routes.host || window.location.pathname.startsWith('/host/')
      ? 'host-page'
      : window.location.pathname === routes.play
        ? 'player-page'
        : 'display-page';
  root.className = `page ${pageKind}`;

  const header = document.createElement('header');
  header.className = 'page-header';

  const title = document.createElement('div');
  title.className = 'brand';
  const logo = document.createElement('img');
  logo.className = 'brand-logo';
  title.append(logo);

  const heading = document.createElement('h1');
  heading.textContent = titleText;

  const subtitle = document.createElement('p');
  subtitle.className = 'muted';
  subtitle.textContent = subtitleText;

  header.append(title, heading, subtitle);

  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');

  const content = document.createElement('section');
  content.className = 'content';
  const page = { content, notice, brand: title, brandLogo: logo };
  root.append(header, notice, content);
  updatePageBrand(page, gameId);

  return page;
}

function updatePageBrand(page: PageParts, gameId: string | null | undefined): void {
  if (!gameId) {
    page.brand.classList.remove('game-brand');
    page.brandLogo.classList.remove('game-logo');
    page.brandLogo.src = '/assets/room-riot-logo.png';
    page.brandLogo.alt = 'Room Riot';
    return;
  }

  const game = getGameDefinition(gameId);
  page.brand.classList.add('game-brand');
  page.brandLogo.classList.add('game-logo');
  page.brandLogo.src = game.icon;
  page.brandLogo.alt = `${game.label} logo`;
}

function renderConnectionNotice(page: PageParts, status: ConnectionStatus): void {
  if (status === 'connected') {
    if (!page.notice.classList.contains('error')) page.notice.textContent = '';
    return;
  }

  setNotice(
    page.notice,
    status === 'connecting'
      ? 'Connecting to Room Riot…'
      : 'Connection lost. Reconnecting automatically…',
    status === 'reconnecting',
  );
}

function createSoundController(): SoundController {
  let enabled = false;
  let context: AudioContext | null = null;
  let previousPhase: RoomPhase | null = null;

  const button = createButton('Enable Sound');
  button.className = 'secondary';
  button.addEventListener('click', () => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      button.textContent = 'Sound Unavailable';
      button.disabled = true;
      return;
    }

    context ??= new AudioContextConstructor();
    void context.resume();
    enabled = true;
    button.textContent = 'Sound Enabled';
  });

  return {
    button,
    phaseChanged(phase) {
      if (previousPhase && previousPhase !== phase && enabled && context) {
        const frequency = phase === 'winner' ? 880 : phase === 'results' ? 660 : 520;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.24);
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

function createField(labelText: string, input: HTMLInputElement | HTMLSelectElement): HTMLElement {
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

function getGameDefinition(gameId: string | null | undefined): GameDefinition {
  return GAME_CATALOG.find((game) => game.id === gameId) ?? GAME_CATALOG[0]!;
}

function setGameTheme(root: HTMLElement, gameId: string | null | undefined): void {
  root.classList.remove('game-groupthink', 'game-hot-take');
  if (!gameId) {
    delete root.dataset.gameId;
    return;
  }

  const game = getGameDefinition(gameId);
  root.classList.add(`game-${game.id}`);
  root.dataset.gameId = game.id;
}

function createGameArtwork(game: GameDefinition, className: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = className;
  image.src = game.icon;
  image.alt = `${game.label} game icon`;
  image.loading = 'lazy';
  return image;
}

function appendGameIdentity(container: HTMLElement, gameId: string, kicker = 'Now playing'): void {
  const game = getGameDefinition(gameId);
  const identity = document.createElement('div');
  identity.className = `game-identity game-${game.id}`;
  identity.append(createGameArtwork(game, 'game-art game-art-small'));

  const copy = document.createElement('div');
  copy.className = 'game-identity-copy';
  const label = document.createElement('span');
  label.className = 'game-kicker';
  label.textContent = kicker;
  const title = document.createElement('strong');
  title.textContent = game.label;
  const subtitle = document.createElement('span');
  subtitle.className = 'muted';
  subtitle.textContent = game.kicker;
  copy.append(label, title, subtitle);
  identity.append(copy);
  container.append(identity);
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
    detail.append(createGameArtwork(selected, 'game-art game-art-large'));

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
    [selected.players, selected.rounds, selected.pace].forEach((fact) => {
      const item = document.createElement('li');
      item.textContent = fact;
      facts.append(item);
    });
    copy.append(kicker, name, description, facts);
    detail.append(copy);
  };

  GAME_CATALOG.forEach((game) => {
    const option = createButton(game.label);
    option.className = `game-option game-${game.id}`;
    option.setAttribute('aria-pressed', String(game.id === selected.id));
    option.addEventListener('click', () => {
      selected = game;
      options.querySelectorAll<HTMLButtonElement>('.game-option').forEach((button) => {
        button.setAttribute('aria-pressed', String(button === option));
      });
      renderDetail();
      onSelect?.(game);
    });

    option.append(createGameArtwork(game, 'game-art game-art-option'));
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

function createPlayerList(container: HTMLElement, state: PublicRoomState): void {
  container.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = `Players (${state.players.length}/${state.settings.maxPlayers})`;
  container.append(heading);

  if (state.players.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Waiting for the room to fill up.';
    container.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'player-list';
  state.players.forEach((player) => {
    const item = document.createElement('li');
    const identity = document.createElement('span');
    identity.textContent = `${player.avatar} ${player.name}`;
    const status = document.createElement('span');
    status.className = player.status === 'connected' ? 'connected' : 'muted';
    status.textContent = player.status === 'connected' ? 'READY' : 'OFFLINE';
    item.append(identity, status);
    list.append(item);
  });
  container.append(list);
}

function appendGroupthinkResults(container: HTMLElement, game: GroupthinkPublicView): void {
  if (game.groups.length === 0) return;

  const heading = document.createElement('h2');
  heading.textContent = 'The room thought…';
  container.append(heading);

  const list = document.createElement('ul');
  list.className = 'answer-list';
  game.groups.forEach((group) => {
    const item = document.createElement('li');
    const answer = document.createElement('span');
    answer.textContent = group.answer;
    const score = document.createElement('span');
    score.className = group.points > 0 ? 'connected' : 'muted';
    score.textContent = `${group.count} match${group.count === 1 ? '' : 'es'} · ${group.points} pts`;
    item.append(answer, score);
    list.append(item);
  });
  container.append(list);
}

function appendScoreboard(container: HTMLElement, state: PublicRoomState): void {
  const heading = document.createElement('h2');
  heading.textContent = 'Scoreboard';
  container.append(heading);

  const list = document.createElement('ol');
  list.className = 'player-list scoreboard';
  [...state.players]
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .forEach((player) => {
      const item = document.createElement('li');
      const identity = document.createElement('span');
      identity.textContent = `${player.avatar} ${player.name}`;
      const score = document.createElement('strong');
      score.textContent = `${player.score}`;
      item.append(identity, score);
      list.append(item);
    });
  container.append(list);
}

function appendGroupthinkStatus(container: HTMLElement, snapshot: RoomSnapshot): void {
  const game = snapshot.game;
  if (!game || game.id !== 'groupthink') return;

  const prompt = document.createElement('p');
  prompt.className = 'prompt';
  prompt.textContent = game.prompt;
  container.append(prompt);

  const progress = document.createElement('span');
  progress.className = 'pill';
  const remainingSeconds =
    game.status === 'input' && game.inputDeadlineAt
      ? Math.max(0, Math.ceil((game.inputDeadlineAt - Date.now()) / 1000))
      : null;
  const deadlineText = remainingSeconds === null ? '' : ` · ${remainingSeconds}s left`;
  progress.dataset.deadlineAt = game.inputDeadlineAt ? String(game.inputDeadlineAt) : '';
  progress.dataset.countdownPrefix = `Round ${game.roundNumber}/${game.totalRounds} · ${game.submittedCount}/${game.totalPlayers} answered`;
  progress.textContent = `${progress.dataset.countdownPrefix}${deadlineText}`;
  container.append(progress);
}

function appendHotTakeStatus(container: HTMLElement, snapshot: RoomSnapshot): void {
  const game = snapshot.game;
  if (!game || game.id !== 'hot-take') return;

  const prompt = document.createElement('p');
  prompt.className = 'prompt';
  prompt.textContent = game.prompt;
  container.append(prompt);

  const remainingSeconds = game.deadlineAt
    ? Math.max(0, Math.ceil((game.deadlineAt - Date.now()) / 1000))
    : null;
  const phaseText =
    game.status === 'voting' ? 'Vote now' : `${game.submittedCount}/${game.totalPlayers} answered`;
  const deadlineText = remainingSeconds === null ? '' : ` · ${remainingSeconds}s left`;
  const progress = document.createElement('span');
  progress.className = 'pill';
  progress.dataset.deadlineAt = game.deadlineAt ? String(game.deadlineAt) : '';
  progress.dataset.countdownPrefix = `Round ${game.roundNumber}/${game.totalRounds} · ${phaseText}`;
  progress.textContent = `${progress.dataset.countdownPrefix}${deadlineText}`;
  container.append(progress);
}

function updateCountdown(element: HTMLElement): void {
  const deadlineAt = Number(element.dataset.deadlineAt);
  const prefix = element.dataset.countdownPrefix;
  if (!deadlineAt || !prefix) return;
  const remainingSeconds = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  element.textContent = `${prefix} · ${remainingSeconds}s left`;
}

function appendGameStatus(container: HTMLElement, snapshot: RoomSnapshot): void {
  if (snapshot.game?.id === 'groupthink') appendGroupthinkStatus(container, snapshot);
  if (snapshot.game?.id === 'hot-take') appendHotTakeStatus(container, snapshot);
}

function appendHotTakeEntries(
  container: HTMLElement,
  entries: readonly HotTakeEntryView[],
  title = 'Anonymous answers',
): void {
  if (entries.length === 0) return;

  const heading = document.createElement('h2');
  heading.textContent = title;
  container.append(heading);

  const list = document.createElement('ul');
  list.className = 'answer-list';
  entries.forEach((entry) => {
    const item = document.createElement('li');
    const answer = document.createElement('span');
    answer.textContent = entry.answer;
    if (title === 'Vote results') {
      const score = document.createElement('span');
      score.className = entry.points > 0 ? 'connected' : 'muted';
      score.textContent = `${entry.voteCount} vote${entry.voteCount === 1 ? '' : 's'} · ${entry.points} pts`;
      item.append(answer, score);
    } else {
      item.append(answer);
    }
    list.append(item);
  });
  container.append(list);
}

function isGroupthinkPlayerView(state: PlayerGameView | null): state is GroupthinkPlayerView {
  return state?.id === 'groupthink';
}

function isHotTakePlayerView(state: PlayerGameView | null): state is HotTakePlayerView {
  return state?.id === 'hot-take';
}

function renderHost(root: HTMLElement): void {
  const socket = window.io();
  const sound = createSoundController();
  let connectionStatus: ConnectionStatus = 'connecting';
  let session = readStorage<HostSession>(HOST_STORAGE_KEY);
  let snapshot: RoomSnapshot | null = null;

  const render = (): void => {
    const routeGameId = getGameFromPathname();
    const page = createPage(
      root,
      session ? `Room ${session.roomCode}` : 'Start a Riot',
      session
        ? 'Share the display with the room and let everyone join.'
        : 'Create a room to begin.',
      session?.gameId ?? routeGameId,
    );
    renderConnectionNotice(page, connectionStatus);
    setGameTheme(root, session?.gameId ?? snapshot?.state.gameId ?? routeGameId);
    if (snapshot) sound.phaseChanged(snapshot.state.phase);

    if (session && window.location.pathname === routes.host) {
      window.history.replaceState(null, '', buildHostRoute(session.gameId));
    }

    if (!session) {
      const form = document.createElement('form');
      form.className = 'card form game-launcher';
      const gamePicker = createGamePicker(routeGameId ?? 'groupthink', (game) => {
        window.history.replaceState(null, '', buildHostRoute(game.id));
        setGameTheme(root, game.id);
        updatePageBrand(page, game.id);
      });
      form.append(gamePicker.element);
      const actions = document.createElement('div');
      actions.className = 'actions game-launcher-actions';
      const submit = createButton('Create Game', 'submit');
      submit.className = 'create-game-button';
      actions.append(submit);
      form.append(actions);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit.disabled = true;
        const gameId = gamePicker.getValue();
        const request: CreateRoomRequest = {
          gameId,
          settings: { maxPlayers: 12, roundCount: 5, contentMode: 'standard' },
        };
        socket.emit('host:create-room', request, (response: HostCreateResponse) => {
          submit.disabled = false;
          if (!isSuccess(response)) {
            setNotice(page.notice, response.error.message, true);
            return;
          }
          session = {
            roomCode: response.roomCode,
            hostToken: response.hostToken,
            gameId,
          };
          window.history.replaceState(null, '', buildHostRoute(gameId));
          snapshot = response.snapshot;
          writeStorage(HOST_STORAGE_KEY, session);
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
    setGameTheme(root, state.gameId ?? session.gameId);
    const details = document.createElement('div');
    details.className = 'card room-details';
    const code = document.createElement('strong');
    code.className = 'room-code';
    code.textContent = session.roomCode;
    const joinUrl = `${window.location.origin}/play?room=${encodeURIComponent(session.roomCode)}`;
    const joinText = document.createElement('p');
    joinText.textContent = joinUrl;
    const qr = document.createElement('img');
    qr.className = 'qr';
    qr.alt = 'QR code for joining the room';
    qr.src = `/api/rooms/${encodeURIComponent(session.roomCode)}/qr.svg`;
    details.append(code, qr, joinText);
    page.content.append(details);

    const gameCard = document.createElement('div');
    const activeGame = snapshot.game?.id ?? state.gameId ?? session.gameId;
    gameCard.className = `card phase-card phase-${state.phase} game-${getGameDefinition(activeGame).id}`;
    if (snapshot.game) appendGameIdentity(gameCard, snapshot.game.id);
    if (snapshot.game) appendGameStatus(gameCard, snapshot);
    if (snapshot.game?.id === 'groupthink' && state.phase !== 'input') {
      appendGroupthinkResults(gameCard, snapshot.game);
    }
    if (snapshot.game?.id === 'hot-take' && state.phase !== 'input') {
      appendHotTakeEntries(
        gameCard,
        snapshot.game.entries,
        state.phase === 'results' || state.phase === 'winner' ? 'Vote results' : undefined,
      );
    }
    if (state.phase === 'winner') appendScoreboard(gameCard, state);
    page.content.append(gameCard);

    const players = document.createElement('div');
    players.className = 'card';
    createPlayerList(players, state);
    page.content.append(players);

    const controls = document.createElement('div');
    controls.className = 'actions';
    const displayLink = document.createElement('a');
    displayLink.className = 'button secondary';
    displayLink.href = `/display?room=${encodeURIComponent(session.roomCode)}`;
    displayLink.target = '_blank';
    displayLink.rel = 'noreferrer';
    displayLink.textContent = 'Open Display';
    controls.append(displayLink);
    controls.append(sound.button);

    if (state.phase === 'lobby') {
      const start = createButton(
        `Start ${session.gameId === 'hot-take' ? 'Hot Take' : 'Groupthink'}`,
      );
      start.disabled =
        session.gameId === 'hot-take' ? state.players.length < 3 : state.players.length < 1;
      start.addEventListener('click', () => {
        const request: HostStartGameRequest = {
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
          gameId: session?.gameId ?? 'groupthink',
        };
        socket.emit('host:start-game', request, (response: RoomStateResponse) => {
          if (!isSuccess(response)) {
            setNotice(page.notice, response.error.message, true);
            return;
          }
          snapshot = response.snapshot;
          render();
        });
      });
      controls.append(start);
    } else if (state.phase === 'input') {
      const reveal = createButton(
        session.gameId === 'hot-take' ? 'Reveal Answers' : 'Reveal Results',
      );
      reveal.addEventListener('click', () => {
        const request: HostRoomActionRequest = {
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:reveal-results', request, (response: RoomStateResponse) => {
          if (!isSuccess(response)) {
            setNotice(page.notice, response.error.message, true);
            return;
          }
          snapshot = response.snapshot;
          render();
        });
      });
      controls.append(reveal);
    } else if (state.phase === 'voting') {
      const reveal = createButton('Reveal Votes');
      reveal.addEventListener('click', () => {
        const request: HostRoomActionRequest = {
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:reveal-results', request, (response: RoomStateResponse) => {
          if (!isSuccess(response)) {
            setNotice(page.notice, response.error.message, true);
            return;
          }
          snapshot = response.snapshot;
          render();
        });
      });
      controls.append(reveal);
    } else if (state.phase === 'results') {
      const next = createButton('Score Round');
      next.addEventListener('click', () => {
        const request: HostRoomActionRequest = {
          roomCode: session?.roomCode ?? '',
          hostToken: session?.hostToken ?? '',
        };
        socket.emit('host:next-round', request, (response: RoomStateResponse) => {
          if (!isSuccess(response)) {
            setNotice(page.notice, response.error.message, true);
            return;
          }
          snapshot = response.snapshot;
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

    const reset = createButton('New Room');
    reset.className = 'secondary';
    reset.addEventListener('click', () => {
      session = null;
      snapshot = null;
      window.localStorage.removeItem(HOST_STORAGE_KEY);
      render();
    });
    controls.append(reset);
    page.content.append(controls);
  };

  socket.on('connect', () => {
    connectionStatus = 'connected';
    if (!session) {
      render();
      return;
    }
    const request: HostReconnectRequest = {
      roomCode: session.roomCode,
      hostToken: session.hostToken,
    };
    socket.emit('host:reconnect', request, (response: HostReconnectResponse) => {
      if (!isSuccess(response)) {
        session = null;
        snapshot = null;
        window.localStorage.removeItem(HOST_STORAGE_KEY);
        render();
        return;
      }
      snapshot = response.snapshot;
      render();
    });
  });

  socket.on('disconnect', () => {
    connectionStatus = 'reconnecting';
    render();
  });

  socket.on('connect_error', () => {
    connectionStatus = 'reconnecting';
    render();
  });

  socket.on('room:state', (nextSnapshot) => {
    if (session?.roomCode === nextSnapshot.state.roomCode) {
      snapshot = nextSnapshot;
      render();
    }
  });

  render();
}

function renderPlayer(root: HTMLElement): void {
  const socket = window.io();
  let connectionStatus: ConnectionStatus = 'connecting';
  const roomFromUrl = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  let session = readStorage<PlayerSession>(PLAYER_STORAGE_KEY);
  let snapshot: RoomSnapshot | null = null;
  let playerState: PlayerGameView | null = null;

  const join = (
    roomCodeInput: string,
    nameInput: string,
    avatarInput: string,
    notice: HTMLElement,
  ): void => {
    const roomCode = roomCodeInput.trim().toUpperCase();
    const request: JoinRoomRequest =
      session?.roomCode === roomCode
        ? { roomCode, name: nameInput, avatar: avatarInput, playerToken: session.playerToken }
        : { roomCode, name: nameInput, avatar: avatarInput };

    socket.emit('player:join', request, (response: PlayerJoinResponse) => {
      if (!isSuccess(response)) {
        setNotice(notice, response.error.message, true);
        return;
      }
      session = {
        roomCode: response.roomCode,
        playerId: response.playerId,
        playerToken: response.playerToken,
        name: nameInput.trim(),
        avatar: avatarInput,
      };
      snapshot = response.snapshot;
      playerState = response.playerState;
      writeStorage(PLAYER_STORAGE_KEY, session);
      render();
    });
  };

  const render = (): void => {
    const page = createPage(
      root,
      session ? `You're in ${session.roomCode}` : 'Join the Riot',
      session
        ? 'Keep this page open and watch the big screen.'
        : 'Enter the code shown on the display.',
      snapshot?.game?.id ?? snapshot?.state.gameId,
    );
    renderConnectionNotice(page, connectionStatus);
    setGameTheme(root, snapshot?.state.gameId);

    if (!session) {
      const form = document.createElement('form');
      form.className = 'card form';
      const roomInput = createTextInput(roomFromUrl);
      roomInput.autocomplete = 'off';
      roomInput.placeholder = 'RAGE';
      roomInput.maxLength = 6;
      const nameInput = createTextInput();
      nameInput.autocomplete = 'name';
      nameInput.placeholder = 'Your name';
      const avatarSelect = createAvatarSelect();
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
          setNotice(page.notice, 'Enter a room code and name.', true);
          return;
        }
        submit.disabled = true;
        join(roomInput.value, nameInput.value, avatarSelect.value, page.notice);
      });
      page.content.append(form);
      return;
    }

    const state = snapshot?.state;
    const status = document.createElement('div');
    const activeGame = snapshot?.game?.id ?? state?.gameId;
    status.className = `card center phase-card phase-${state?.phase ?? 'lobby'}${
      activeGame ? ` game-${getGameDefinition(activeGame).id}` : ''
    }`;
    if (activeGame) appendGameIdentity(status, activeGame, 'Your game');
    const statusTitle = document.createElement('h2');
    statusTitle.textContent = state?.phase === 'lobby' ? 'You’re in.' : 'Game in progress';
    status.append(statusTitle);

    if (snapshot?.game?.id === 'groupthink' && isGroupthinkPlayerView(playerState)) {
      appendGroupthinkStatus(status, snapshot);
      if (state?.phase === 'input' && !playerState.hasSubmitted) {
        const form = document.createElement('form');
        form.className = 'answer-form';
        const input = createTextInput();
        input.placeholder = 'Type your answer…';
        input.maxLength = 500;
        const submit = createButton('Submit Answer', 'submit');
        form.append(input, submit);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!input.value.trim() || !session) return;
          submit.disabled = true;
          const request: PlayerSubmitAnswerRequest = {
            roomCode: session.roomCode,
            playerToken: session.playerToken,
            answer: input.value,
          };
          socket.emit('player:submit-answer', request, (response: PlayerAnswerResponse) => {
            submit.disabled = false;
            if (!isSuccess(response)) {
              setNotice(page.notice, response.error.message, true);
              return;
            }
            snapshot = response.snapshot;
            playerState = response.playerState;
            render();
          });
        });
        status.append(form);
      } else if (playerState.hasSubmitted && state?.phase === 'input') {
        const waiting = document.createElement('p');
        waiting.className = 'muted';
        waiting.textContent = `Submitted: “${playerState.ownAnswer ?? ''}” · waiting for the room.`;
        status.append(waiting);
      } else if (state?.phase === 'results' || state?.phase === 'winner') {
        const waiting = document.createElement('p');
        waiting.className = 'muted';
        waiting.textContent = 'Results are on the big screen.';
        status.append(waiting);
        appendGroupthinkResults(status, snapshot.game);
      }
    } else if (snapshot?.game?.id === 'hot-take' && isHotTakePlayerView(playerState)) {
      appendHotTakeStatus(status, snapshot);
      if (state?.phase === 'input' && !playerState.hasSubmitted) {
        const form = document.createElement('form');
        form.className = 'answer-form';
        let textInput: HTMLInputElement | null = null;
        let targetSelect: HTMLSelectElement | null = null;
        if (playerState.promptKind === 'player-targeted') {
          targetSelect = document.createElement('select');
          snapshot.state.players
            .filter((player) => player.id !== session?.playerId)
            .forEach((player) => {
              const option = document.createElement('option');
              option.value = player.id;
              option.textContent = `${player.avatar} ${player.name}`;
              targetSelect?.append(option);
            });
          form.append(createField('Choose a player', targetSelect));
        } else {
          textInput = createTextInput();
          textInput.placeholder = 'Type your hot take…';
          textInput.maxLength = 500;
          form.append(textInput);
        }
        const submit = createButton('Submit Take', 'submit');
        form.append(submit);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!session) return;
          const answer = targetSelect?.value ?? textInput?.value ?? '';
          if (!answer.trim()) return;
          submit.disabled = true;
          const request: PlayerSubmitAnswerRequest = {
            roomCode: session.roomCode,
            playerToken: session.playerToken,
            answer,
            ...(targetSelect?.value ? { targetPlayerId: targetSelect.value } : {}),
          };
          socket.emit('player:submit-answer', request, (response: PlayerAnswerResponse) => {
            submit.disabled = false;
            if (!isSuccess(response)) {
              setNotice(page.notice, response.error.message, true);
              return;
            }
            snapshot = response.snapshot;
            playerState = response.playerState;
            render();
          });
        });
        status.append(form);
      } else if (state?.phase === 'input' && playerState.hasSubmitted) {
        const waiting = document.createElement('p');
        waiting.className = 'muted';
        waiting.textContent = `Submitted: “${playerState.ownAnswer ?? ''}” · waiting for the room.`;
        status.append(waiting);
      } else if (state?.phase === 'voting' && !playerState.hasVoted) {
        const form = document.createElement('form');
        form.className = 'answer-form';
        const select = document.createElement('select');
        playerState.entries.forEach((entry) => {
          const option = document.createElement('option');
          option.value = entry.entryId;
          option.textContent = entry.answer;
          select.append(option);
        });
        form.append(createField('Vote for an answer', select));
        const submit = createButton('Cast Vote', 'submit');
        form.append(submit);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!session || !select.value) return;
          submit.disabled = true;
          const request: PlayerCastVoteRequest = {
            roomCode: session.roomCode,
            playerToken: session.playerToken,
            entryId: select.value,
          };
          socket.emit('player:cast-vote', request, (response: PlayerAnswerResponse) => {
            submit.disabled = false;
            if (!isSuccess(response)) {
              setNotice(page.notice, response.error.message, true);
              return;
            }
            snapshot = response.snapshot;
            playerState = response.playerState;
            render();
          });
        });
        status.append(form);
      } else if (state?.phase === 'voting' && playerState.hasVoted) {
        const waiting = document.createElement('p');
        waiting.className = 'muted';
        waiting.textContent = 'Vote submitted · waiting for the room.';
        status.append(waiting);
      } else if (state?.phase === 'results' || state?.phase === 'winner') {
        const waiting = document.createElement('p');
        waiting.className = 'muted';
        waiting.textContent = 'Vote results are on the big screen.';
        status.append(waiting);
        if (playerState.ownAnswer) {
          const own = document.createElement('p');
          own.className = 'muted';
          own.textContent = `Your answer: “${playerState.ownAnswer}”`;
          status.append(own);
        }
        appendHotTakeEntries(status, playerState.entries, 'Vote results');
      }
    } else {
      const waiting = document.createElement('p');
      waiting.className = 'muted';
      waiting.textContent = state ? 'Look at the big screen.' : 'Connecting to the room…';
      status.append(waiting);
    }
    page.content.append(status);

    if (snapshot) {
      const players = document.createElement('div');
      players.className = 'card';
      createPlayerList(players, snapshot.state);
      page.content.append(players);
    }

    const leave = createButton('Leave Room');
    leave.className = 'secondary';
    leave.addEventListener('click', () => {
      session = null;
      snapshot = null;
      playerState = null;
      window.localStorage.removeItem(PLAYER_STORAGE_KEY);
      render();
    });
    page.content.append(leave);
  };

  socket.on('connect', () => {
    connectionStatus = 'connected';
    if (!session) {
      render();
      return;
    }
    join(session.roomCode, session.name, session.avatar, document.createElement('p'));
  });

  socket.on('disconnect', () => {
    connectionStatus = 'reconnecting';
    render();
  });

  socket.on('connect_error', () => {
    connectionStatus = 'reconnecting';
    render();
  });

  socket.on('room:state', (nextSnapshot) => {
    if (session?.roomCode === nextSnapshot.state.roomCode) {
      snapshot = nextSnapshot;
      render();
    }
  });

  socket.on('player:state', (nextPlayerState) => {
    if (session?.roomCode) {
      playerState = nextPlayerState;
      render();
    }
  });

  render();
}

function renderDisplay(root: HTMLElement): void {
  const roomCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  const routeGameId = getGameFromPathname();
  const socket = window.io();
  const sound = createSoundController();
  let connectionStatus: ConnectionStatus = 'connecting';
  let snapshot: RoomSnapshot | null = null;
  const page = createPage(
    root,
    roomCode
      ? `Room ${roomCode}`
      : routeGameId
        ? `${getGameDefinition(routeGameId).label} Display`
        : 'Display',
    roomCode ? 'Players, grab your phones.' : 'Open this page with a room code to watch a lobby.',
    routeGameId,
  );
  root.classList.add('display-page');

  const render = (): void => {
    page.content.replaceChildren();
    renderConnectionNotice(page, connectionStatus);
    const activeGame = snapshot?.game?.id ?? snapshot?.state.gameId ?? routeGameId;
    setGameTheme(root, activeGame);
    updatePageBrand(page, activeGame);
    if (activeGame && roomCode && getGameFromPathname() !== activeGame) {
      window.history.replaceState(
        null,
        '',
        buildDisplayRoute(getGameDefinition(activeGame).id, roomCode),
      );
    }
    if (!roomCode) {
      const empty = document.createElement('div');
      empty.className = 'card center';
      empty.textContent = 'Use /display?room=CODE after the host creates a room.';
      page.content.append(empty);
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
    const hero = document.createElement('div');
    hero.className = `card center phase-card phase-${state.phase}${
      activeGame ? ` game-${getGameDefinition(activeGame).id}` : ''
    }`;
    if (activeGame) appendGameIdentity(hero, activeGame, 'On the big screen');
    const code = document.createElement('strong');
    code.className = 'room-code';
    code.textContent = state.roomCode;
    const qr = document.createElement('img');
    qr.className = 'qr';
    qr.alt = 'QR code for joining the room';
    qr.src = `/api/rooms/${encodeURIComponent(state.roomCode)}/qr.svg`;
    hero.append(code, qr, sound.button);
    sound.phaseChanged(state.phase);
    if (snapshot.game) appendGameStatus(hero, snapshot);
    page.content.append(hero);

    if (snapshot.game && state.phase !== 'input') {
      const results = document.createElement('div');
      results.className = 'card';
      if (snapshot.game.id === 'groupthink') {
        appendGroupthinkResults(results, snapshot.game);
      } else if (snapshot.game.id === 'hot-take') {
        appendHotTakeEntries(
          results,
          snapshot.game.entries,
          state.phase === 'results' || state.phase === 'winner' ? 'Vote results' : undefined,
        );
      }
      if (state.phase === 'winner') appendScoreboard(results, state);
      page.content.append(results);
    }

    const players = document.createElement('div');
    players.className = 'card';
    createPlayerList(players, state);
    page.content.append(players);
  };

  socket.on('connect', () => {
    connectionStatus = 'connected';
    if (!roomCode) {
      render();
      return;
    }
    const request: DisplayWatchRequest = { roomCode };
    socket.emit('display:watch', request, (response: RoomStateResponse) => {
      if (!isSuccess(response)) {
        setNotice(page.notice, response.error.message, true);
        return;
      }
      snapshot = response.snapshot;
      render();
    });
  });

  socket.on('disconnect', () => {
    connectionStatus = 'reconnecting';
    render();
  });

  socket.on('connect_error', () => {
    connectionStatus = 'reconnecting';
    render();
  });

  socket.on('room:state', (nextSnapshot) => {
    if (nextSnapshot.state.roomCode === roomCode) {
      snapshot = nextSnapshot;
      render();
    }
  });

  render();
}

function readStorage<T>(key: string): T | null {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

if (typeof document !== 'undefined') {
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
    } else if (window.location.pathname === routes.play) {
      renderPlayer(target);
    } else {
      renderDisplay(target);
    }
  }
}
