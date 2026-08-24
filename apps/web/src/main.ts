import type {
  CreateRoomRequest,
  DisplayWatchRequest,
  HostReconnectRequest,
  HostRoomActionRequest,
  HostStartGameRequest,
  JoinRoomRequest,
  PlayerCastVoteRequest,
  PlayerSubmitAnswerRequest,
  PromptMode,
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
  readonly background: string;
  readonly stageArt: string;
  readonly controlRoom: string;
  readonly audience: string;
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
    background: '/assets/groupthink-lab-bg-v2.png',
    stageArt: '/assets/groupthink-reactor-v2.png',
    controlRoom: 'Consensus Lab',
    audience: 'connected minds',
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
    background: '/assets/hot-take-stage-bg-v2.png',
    stageArt: '/assets/hot-take-podium-v2.png',
    controlRoom: 'Live Heat Control',
    audience: 'the audience',
  },
];

function getGameFromPathname(pathname = window.location.pathname): SupportedGameId | null {
  const match = pathname.match(/^\/(?:host|display|play)\/(groupthink|hot-take)$/);
  const gameId = match?.[1];
  return gameId === 'groupthink' || gameId === 'hot-take' ? gameId : null;
}

function buildHostRoute(gameId: SupportedGameId): string {
  return `/host/${gameId}`;
}

function buildDisplayRoute(gameId: SupportedGameId, roomCode: string): string {
  return `/display/${gameId}?room=${encodeURIComponent(roomCode)}`;
}

function buildPlayRoute(gameId: SupportedGameId, roomCode = ''): string {
  const query = roomCode ? `?room=${encodeURIComponent(roomCode)}` : '';
  return `/play/${gameId}${query}`;
}

interface SoundController {
  readonly button: HTMLButtonElement;
  phaseChanged(phase: RoomPhase, gameId?: SupportedGameId | null): void;
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
      : window.location.pathname === routes.play || window.location.pathname.startsWith('/play/')
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
  let activeGame: SupportedGameId = 'groupthink';

  const button = createButton('Enable game audio');
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
    button.textContent = activeGame === 'groupthink' ? 'Lab audio on' : 'Stage audio on';
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
    if (activeGame === 'groupthink') {
      const notes =
        phase === 'winner'
          ? [523, 659, 784, 1047]
          : phase === 'results'
            ? [440, 554, 659]
            : phase === 'input'
              ? [392, 523]
              : [330, 392];
      notes.forEach((frequency, index) =>
        playTone(frequency, index * 0.09, 0.28, index % 2 ? 'triangle' : 'sine', 0.065),
      );
      return;
    }

    const notes =
      phase === 'winner'
        ? [220, 330, 440, 660]
        : phase === 'results'
          ? [196, 294, 494]
          : phase === 'voting'
            ? [260, 390, 520]
            : [174, 261];
    notes.forEach((frequency, index) =>
      playTone(frequency, index * 0.065, 0.2, index === 0 ? 'sawtooth' : 'square', 0.035),
    );
  };

  return {
    button,
    phaseChanged(phase, gameId) {
      if (gameId) {
        activeGame = gameId;
        if (!enabled) {
          button.textContent = gameId === 'groupthink' ? 'Enable lab audio' : 'Enable stage audio';
        }
      }
      if (previousPhase && previousPhase !== phase && enabled && context) {
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

function createStageArtwork(gameId: SupportedGameId, className = ''): HTMLImageElement {
  const game = getGameDefinition(gameId);
  const image = document.createElement('img');
  image.className = `stage-art ${className}`.trim();
  image.src = game.stageArt;
  image.alt =
    gameId === 'groupthink' ? 'Consensus reactor illustration' : 'Hot Take stage illustration';
  return image;
}

function createProgressMeter(value: number, total: number, label: string): HTMLElement {
  const meter = document.createElement('div');
  meter.className = 'experience-meter';
  const copy = document.createElement('div');
  const title = document.createElement('span');
  title.textContent = label;
  const count = document.createElement('strong');
  count.textContent = `${value}/${total}`;
  copy.append(title, count);
  const track = document.createElement('div');
  track.className = 'experience-meter-track';
  const fill = document.createElement('span');
  fill.style.width = `${total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0}%`;
  track.append(fill);
  meter.append(copy, track);
  return meter;
}

function createRoomPass(roomCode: string, gameId: SupportedGameId): HTMLElement {
  const game = getGameDefinition(gameId);
  const panel = document.createElement('aside');
  panel.className = gameId === 'groupthink' ? 'lab-room-pass' : 'heat-room-pass';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'experience-eyebrow';
  eyebrow.textContent = gameId === 'groupthink' ? 'Mind link active' : 'Backstage access';
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

function createExperienceRoster(state: PublicRoomState, gameId: SupportedGameId): HTMLElement {
  const roster = document.createElement('aside');
  roster.className = gameId === 'groupthink' ? 'mind-roster' : 'audience-roster';
  const heading = document.createElement('div');
  heading.className = 'experience-section-title';
  const title = document.createElement('h2');
  title.textContent = gameId === 'groupthink' ? 'Connected minds' : 'Tonight’s audience';
  const count = document.createElement('span');
  count.textContent = `${state.players.length}/${state.settings.maxPlayers}`;
  heading.append(title, count);
  roster.append(heading);

  const list = document.createElement('ul');
  list.className = gameId === 'groupthink' ? 'mind-grid' : 'audience-grid';
  if (state.players.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'experience-empty';
    empty.textContent = gameId === 'groupthink' ? 'Scanning for minds…' : 'Doors are open…';
    list.append(empty);
  } else {
    state.players.forEach((player, index) => {
      const item = document.createElement('li');
      item.className = player.status === 'connected' ? 'is-connected' : 'is-offline';
      const avatar = document.createElement('span');
      avatar.className = 'roster-avatar';
      avatar.textContent = player.avatar;
      const identity = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = player.name;
      const score = document.createElement('small');
      score.textContent = state.phase === 'lobby' ? `Signal ${index + 1}` : `${player.score} pts`;
      identity.append(name, score);
      item.append(avatar, identity);
      list.append(item);
    });
  }
  roster.append(list);
  return roster;
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

function createGameStage(snapshot: RoomSnapshot, gameId: SupportedGameId): HTMLElement {
  const state = snapshot.state;
  const game = snapshot.game;
  const stage = document.createElement('main');
  stage.className = gameId === 'groupthink' ? 'consensus-stage' : 'heat-stage';

  const artWrap = document.createElement('div');
  artWrap.className = 'stage-art-wrap';
  artWrap.append(createStageArtwork(gameId));
  const stageCopy = document.createElement('div');
  stageCopy.className = 'stage-copy';
  const cue = document.createElement('span');
  cue.className = 'experience-eyebrow';
  cue.textContent =
    gameId === 'groupthink'
      ? state.phase === 'lobby'
        ? 'Calibrating the consensus reactor'
        : 'Consensus reactor online'
      : state.phase === 'lobby'
        ? 'Pre-show'
        : state.phase === 'voting'
          ? 'The vote is live'
          : 'Live on the Hot Take stage';
  const title = document.createElement('h2');
  title.textContent =
    state.phase === 'lobby'
      ? gameId === 'groupthink'
        ? 'Bring every brain into the loop.'
        : 'Get the room ready to bring the heat.'
      : game?.prompt || (gameId === 'groupthink' ? 'Think alike.' : 'Make it spicy.');
  stageCopy.append(cue, title);

  if (game?.id === 'groupthink') {
    stageCopy.append(createProgressMeter(game.submittedCount, game.totalPlayers, 'Mind sync'));
    if (state.phase === 'results' || state.phase === 'winner') {
      const results = document.createElement('section');
      results.className = 'thought-clusters';
      appendGroupthinkResults(results, game);
      stageCopy.append(results);
    }
  } else if (game?.id === 'hot-take') {
    stageCopy.append(
      createProgressMeter(
        game.submittedCount,
        game.totalPlayers,
        state.phase === 'voting' ? 'Takes on stage' : 'Heat building',
      ),
    );
    if (state.phase === 'voting' || state.phase === 'results' || state.phase === 'winner') {
      const entries = document.createElement('section');
      entries.className = 'take-wall';
      appendHotTakeEntries(
        entries,
        game.entries,
        state.phase === 'results' || state.phase === 'winner'
          ? 'The room has spoken'
          : 'Anonymous takes',
      );
      stageCopy.append(entries);
    }
  }

  if (state.phase === 'winner') {
    const scores = document.createElement('section');
    scores.className = 'experience-scoreboard';
    appendScoreboard(scores, state);
    stageCopy.append(scores);
  }
  stage.append(artWrap, stageCopy);
  return stage;
}

function createHostExperience(snapshot: RoomSnapshot, session: HostSession): HTMLElement {
  const gameId = getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId ?? session.gameId).id;
  const shell = document.createElement('section');
  shell.className = `experience-shell host-experience ${gameId === 'groupthink' ? 'consensus-lab' : 'live-heat'}`;
  shell.append(createExperienceTopbar(gameId, session.roomCode, snapshot.state.phase));
  const grid = document.createElement('div');
  grid.className = 'experience-grid';
  grid.append(
    createRoomPass(session.roomCode, gameId),
    createGameStage(snapshot, gameId),
    createExperienceRoster(snapshot.state, gameId),
  );
  shell.append(grid);
  return shell;
}

function createDisplayExperience(snapshot: RoomSnapshot, sound: SoundController): HTMLElement {
  const gameId = getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId).id;
  const shell = document.createElement('section');
  shell.className = `experience-shell display-experience ${gameId === 'groupthink' ? 'consensus-lab' : 'live-heat'}`;
  shell.append(createExperienceTopbar(gameId, snapshot.state.roomCode, snapshot.state.phase));

  const grid = document.createElement('div');
  grid.className = 'experience-grid';
  const roomPass = createRoomPass(snapshot.state.roomCode, gameId);
  roomPass.classList.add('display-room-pass');
  const audio = document.createElement('div');
  audio.className = 'display-audio-control';
  audio.append(sound.button);
  roomPass.append(audio);
  grid.append(
    roomPass,
    createGameStage(snapshot, gameId),
    createExperienceRoster(snapshot.state, gameId),
  );
  shell.append(grid);
  return shell;
}

function fitDisplayExperience(root: HTMLElement): void {
  const experience = root.querySelector<HTMLElement>('.display-experience');
  const content = root.querySelector<HTMLElement>(':scope > .content');
  if (!experience || !content) return;

  const grid = experience.querySelector<HTMLElement>('.experience-grid');
  const topbar = experience.querySelector<HTMLElement>('.experience-topbar');
  if (!grid || !topbar) return;

  // Measure at scale 1. The grid's scrollHeight captures answer walls and rosters
  // that would otherwise be clipped by the viewport's overflow guard.
  experience.style.setProperty('--display-scale', '1');
  const experienceRect = experience.getBoundingClientRect();
  let requiredWidth = Math.max(experience.scrollWidth, grid.scrollWidth, 1);
  let requiredHeight = Math.max(
    experience.scrollHeight,
    topbar.offsetHeight + grid.scrollHeight,
    1,
  );
  experience.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const rect = element.getBoundingClientRect();
    requiredWidth = Math.max(requiredWidth, element.scrollWidth, rect.right - experienceRect.left);
    requiredHeight = Math.max(requiredHeight, rect.top - experienceRect.top + element.scrollHeight);
  });
  const availableWidth = Math.max(content.clientWidth, 1);
  const availableHeight = Math.max(content.clientHeight, 1);
  const scale = Math.min(1, availableWidth / requiredWidth, availableHeight / requiredHeight);
  experience.style.setProperty('--display-scale', scale.toFixed(4));
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
      const promptMode = createPromptModeSelect();
      const promptModeField = createField('Question source', promptMode);
      const promptModeHint = document.createElement('small');
      promptModeHint.className = 'muted';
      promptModeHint.textContent =
        'AI remix creates a fresh shuffled deck from local prompt ingredients, so it works offline on the big screen.';
      promptModeField.append(promptModeHint);
      form.append(promptModeField);
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
          settings: {
            maxPlayers: 12,
            roundCount: 5,
            contentMode: 'standard',
            promptMode: promptMode.value as PromptMode,
          },
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
    const activeGame = getGameDefinition(snapshot.game?.id ?? state.gameId ?? session.gameId).id;
    setGameTheme(root, activeGame);
    sound.phaseChanged(state.phase, activeGame);
    page.content.append(createHostExperience(snapshot, session));

    const controls = document.createElement('div');
    controls.className = 'actions';
    const displayLink = document.createElement('a');
    displayLink.className = 'button secondary';
    displayLink.href = buildDisplayRoute(activeGame, session.roomCode);
    displayLink.target = '_blank';
    displayLink.rel = 'noreferrer';
    displayLink.textContent = 'Open Display';
    controls.className = `actions experience-controls ${activeGame === 'groupthink' ? 'lab-controls' : 'heat-controls'}`;
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
        session.gameId === 'hot-take' ? 'Put the Takes on Stage' : 'Open the Thought Clusters',
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
      const reveal = createButton('Reveal the Hottest Take');
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
      const next = createButton(
        session.gameId === 'hot-take' ? 'Turn Up the Next Round' : 'Sync the Next Round',
      );
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
      const currentSession = session;
      if (currentSession) {
        socket.emit(
          'host:leave',
          {
            roomCode: currentSession.roomCode,
            hostToken: currentSession.hostToken,
          },
          () => undefined,
        );
      }
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
  const routeGameId = getGameFromPathname();
  let connectionStatus: ConnectionStatus = 'connecting';
  const roomFromUrl = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  let session = readStorage<PlayerSession>(PLAYER_STORAGE_KEY);
  let snapshot: RoomSnapshot | null = null;
  let playerState: PlayerGameView | null = null;
  let activeNotice: HTMLElement | null = null;

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
        if (response.error.code === 'ROOM_NOT_FOUND' || response.error.code === 'UNAUTHORIZED') {
          session = null;
          snapshot = null;
          playerState = null;
          window.localStorage.removeItem(PLAYER_STORAGE_KEY);
          render();
        } else {
          setNotice(notice, response.error.message, true);
        }
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
      const joinedGame = response.snapshot.state.gameId;
      if (joinedGame && getGameFromPathname() !== joinedGame) {
        window.history.replaceState(
          null,
          '',
          buildPlayRoute(getGameDefinition(joinedGame).id, response.roomCode),
        );
      }
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
      snapshot?.game?.id ?? snapshot?.state.gameId ?? routeGameId,
    );
    activeNotice = page.notice;
    renderConnectionNotice(page, connectionStatus);
    setGameTheme(root, snapshot?.state.gameId ?? routeGameId);

    if (!session) {
      const form = document.createElement('form');
      form.className = routeGameId ? `form themed-join-card join-${routeGameId}` : 'card form';
      if (routeGameId) {
        const game = getGameDefinition(routeGameId);
        const intro = document.createElement('div');
        intro.className = 'themed-join-intro';
        intro.append(createGameArtwork(game, 'themed-join-logo'));
        const copy = document.createElement('div');
        const kicker = document.createElement('span');
        kicker.className = 'experience-eyebrow';
        kicker.textContent =
          routeGameId === 'groupthink' ? 'Connect your mind' : 'Claim your backstage pass';
        const heading = document.createElement('h1');
        heading.textContent = `Join ${game.label}`;
        const helper = document.createElement('p');
        helper.className = 'muted';
        helper.textContent =
          routeGameId === 'groupthink'
            ? 'Enter the room code and tune into the consensus reactor.'
            : 'Enter the room code and step into tonight’s live audience.';
        copy.append(kicker, heading, helper);
        intro.append(copy);
        form.append(intro);
      }
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
    const controllerGame = activeGame ? getGameDefinition(activeGame).id : null;
    status.className = `controller-shell phase-${state?.phase ?? 'lobby'} ${
      controllerGame === 'hot-take' ? 'live-heat-controller' : 'consensus-controller'
    }`;
    if (controllerGame) {
      const controllerHeader = createExperienceTopbar(
        controllerGame,
        session.roomCode,
        state?.phase ?? 'lobby',
      );
      controllerHeader.classList.add('controller-topbar');
      status.append(controllerHeader);
      const controllerArt = createStageArtwork(controllerGame, 'controller-art');
      status.append(controllerArt);
    }
    const statusTitle = document.createElement('h2');
    statusTitle.textContent =
      state?.phase === 'lobby'
        ? controllerGame === 'hot-take'
          ? 'Your backstage pass is live.'
          : 'Your mind is in the loop.'
        : controllerGame === 'hot-take'
          ? 'The stage is yours.'
          : 'Send a thought to the reactor.';
    status.append(statusTitle);

    if (snapshot?.game?.id === 'groupthink' && isGroupthinkPlayerView(playerState)) {
      appendGroupthinkStatus(status, snapshot);
      if (state?.phase === 'input' && !playerState.hasSubmitted) {
        const form = document.createElement('form');
        form.className = 'answer-form mind-answer-form';
        const input = createTextInput();
        input.placeholder = 'Type your answer…';
        input.maxLength = 500;
        const submit = createButton('Lock In My Thought', 'submit');
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
        form.className = 'answer-form heat-answer-form';
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
        const submit = createButton('Drop My Take', 'submit');
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
        form.className = 'answer-form heat-answer-form vote-card-form';
        const legend = document.createElement('h3');
        legend.textContent = 'Which take deserves the spotlight?';
        const choices = document.createElement('div');
        choices.className = 'vote-card-grid';
        let selectedEntryId = '';
        playerState.entries.forEach((entry, index) => {
          const choice = document.createElement('button');
          choice.type = 'button';
          choice.className = 'vote-card';
          choice.setAttribute('aria-pressed', 'false');
          const number = document.createElement('span');
          number.textContent = `TAKE ${index + 1}`;
          const answer = document.createElement('strong');
          answer.textContent = entry.answer;
          choice.append(number, answer);
          choice.addEventListener('click', () => {
            selectedEntryId = entry.entryId;
            choices.querySelectorAll<HTMLButtonElement>('.vote-card').forEach((card) => {
              card.setAttribute('aria-pressed', String(card === choice));
            });
          });
          choices.append(choice);
        });
        const submit = createButton('Send It to the Top', 'submit');
        form.append(legend, choices, submit);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!session || !selectedEntryId) {
            setNotice(page.notice, 'Pick a take before voting.', true);
            return;
          }
          submit.disabled = true;
          const request: PlayerCastVoteRequest = {
            roomCode: session.roomCode,
            playerToken: session.playerToken,
            entryId: selectedEntryId,
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
      const roomStrip = createExperienceRoster(
        snapshot.state,
        getGameDefinition(snapshot.game?.id ?? snapshot.state.gameId).id,
      );
      roomStrip.classList.add('controller-roster');
      page.content.append(roomStrip);
    }

    const leave = createButton('Leave Room');
    leave.className = 'secondary';
    leave.addEventListener('click', () => {
      const currentSession = session;
      if (currentSession) {
        socket.emit(
          'player:leave',
          {
            roomCode: currentSession.roomCode,
            playerToken: currentSession.playerToken,
          },
          () => undefined,
        );
      }
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
    join(
      session.roomCode,
      session.name,
      session.avatar,
      activeNotice ?? document.createElement('p'),
    );
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
  const fit = (): void => {
    window.requestAnimationFrame(() => fitDisplayExperience(root));
  };
  window.addEventListener('resize', fit, { passive: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(fit);
    observer.observe(root);
  }

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
    const displayGame = getGameDefinition(activeGame).id;
    sound.phaseChanged(state.phase, displayGame);
    page.content.append(createDisplayExperience(snapshot, sound));
    fit();
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
