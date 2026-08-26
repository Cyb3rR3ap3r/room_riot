import type { DrawingData, SupportedGameId } from '@room-riot/contracts';
import type { PublicRoomState } from '@room-riot/game-engine';

export interface StageDomDocument {
  createElement(tagName: string): HTMLElement;
}

export interface PublicStageDependencies {
  readonly document: StageDomDocument;
  readonly createArtwork: (gameId: SupportedGameId) => HTMLElement;
  readonly createDrawingPreview: (drawing: DrawingData, className: string) => HTMLElement;
  readonly now: () => number;
  readonly previousScores?: Readonly<Record<string, number>> | null;
  readonly animateScore?: (element: HTMLElement, from: number, to: number) => void;
}

export interface StageFrame {
  readonly element: HTMLElement;
  readonly visual: HTMLElement;
  readonly copy: HTMLElement;
}

export function createStageFrame(
  dependencies: PublicStageDependencies,
  className: string,
  artwork: HTMLElement,
  copyClassName = 'stage-copy',
): StageFrame {
  const element = dependencies.document.createElement('main');
  element.className = className;
  const visual = dependencies.document.createElement('div');
  visual.className = 'stage-art-wrap';
  visual.append(artwork);
  const copy = dependencies.document.createElement('div');
  copy.className = copyClassName;
  element.append(visual, copy);
  return { element, visual, copy };
}

export function appendStageHeading(
  container: HTMLElement,
  dependencies: PublicStageDependencies,
  cueText: string,
  titleText: string,
): void {
  const cue = textElement(dependencies.document, 'span', cueText);
  cue.className = 'experience-eyebrow';
  container.append(cue, textElement(dependencies.document, 'h2', titleText));
}

export function createProgressMeter(
  dependencies: PublicStageDependencies,
  value: number,
  total: number,
  label: string,
): HTMLElement {
  const meter = dependencies.document.createElement('div');
  meter.className = 'experience-meter';
  const copy = dependencies.document.createElement('div');
  copy.append(
    textElement(dependencies.document, 'span', label),
    textElement(dependencies.document, 'strong', `${value}/${total}`),
  );
  const track = dependencies.document.createElement('progress') as HTMLProgressElement;
  track.className = 'experience-meter-track';
  track.max = Math.max(total, 1);
  track.value = Math.max(0, Math.min(value, total));
  track.setAttribute('aria-label', `${label}: ${value} of ${total}`);
  meter.append(copy, track);
  return meter;
}

export function createStatusPill(
  dependencies: PublicStageDependencies,
  prefix: string,
  deadlineAt: number | null,
): HTMLElement {
  const pill = dependencies.document.createElement('span');
  pill.className = 'pill';
  pill.setAttribute('data-countdown-prefix', prefix);
  pill.setAttribute('data-deadline-at', deadlineAt === null ? '' : String(deadlineAt));
  const remainingSeconds =
    deadlineAt === null ? null : Math.max(0, Math.ceil((deadlineAt - dependencies.now()) / 1_000));
  pill.textContent = `${prefix}${remainingSeconds === null ? '' : ` · ${remainingSeconds}s left`}`;
  return pill;
}

export function appendScoreboard(
  container: HTMLElement,
  state: PublicRoomState,
  dependencies: PublicStageDependencies,
): void {
  const section = dependencies.document.createElement('section');
  section.className = 'experience-scoreboard';
  section.append(textElement(dependencies.document, 'h2', 'Scoreboard'));
  const list = dependencies.document.createElement('ol');
  list.className = 'player-list scoreboard';
  const rankedPlayers = [...state.players].sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name),
  );
  for (const player of rankedPlayers) {
    const item = dependencies.document.createElement('li');
    item.append(textElement(dependencies.document, 'span', `${player.avatar} ${player.name}`));
    const score = textElement(dependencies.document, 'strong', String(player.score));
    const previousScore = dependencies.previousScores?.[player.id];
    if (typeof previousScore === 'number' && previousScore !== player.score) {
      score.className = 'score-change';
      score.dataset.scoreFrom = String(previousScore);
      score.dataset.scoreTo = String(player.score);
      dependencies.animateScore?.(score, previousScore, player.score);
    }
    item.append(score);
    list.append(item);
  }
  section.append(list);
  container.append(section);
}

export function textElement(
  document: StageDomDocument,
  tagName: string,
  text: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}
