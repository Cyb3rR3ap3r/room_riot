import { getGamePlayerLimits } from '@room-riot/contracts';
import type { DrawnOutMode, SupportedGameId } from '@room-riot/contracts';

export type { SupportedGameId } from '@room-riot/contracts';

export interface GameDefinition {
  readonly id: SupportedGameId;
  readonly label: string;
  readonly kicker: string;
  readonly description: string;
  readonly players: string;
  readonly rounds: string;
  readonly pace: string;
  readonly duration: string;
  readonly contentRating: string;
  readonly controller: string;
  readonly mechanics: readonly string[];
  readonly icon: string;
  readonly background: string;
  readonly stageArt: string;
  readonly controlRoom: string;
  readonly audience: string;
}

export const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: 'groupthink',
    label: 'Groupthink',
    kicker: 'Match minds',
    description: 'Give your answer, then see how many people in the room thought the same way.',
    players: getGamePlayerRangeLabel('groupthink'),
    rounds: '5 rounds',
    pace: 'Fast · social',
    duration: '10–15 min',
    contentRating: 'Room-safe prompts',
    controller: 'Text input',
    mechanics: ['Write', 'Reveal together', 'Match the room'],
    icon: '/assets/groupthink-icon.webp',
    background: '/assets/groupthink-lab-bg-v2.webp',
    stageArt: '/assets/groupthink-reactor-v2.webp',
    controlRoom: 'Consensus Lab',
    audience: 'connected minds',
  },
  {
    id: 'hot-take',
    label: 'Hot Take',
    kicker: 'Say it louder',
    description: "Drop an anonymous opinion, then vote for the take the room can't ignore.",
    players: getGamePlayerRangeLabel('hot-take'),
    rounds: '5 rounds',
    pace: 'Anonymous · spicy',
    duration: '15–20 min',
    contentRating: 'Host-curated intensity',
    controller: 'Text + voting',
    mechanics: ['Write anonymously', 'Read the room', 'Vote'],
    icon: '/assets/hot-take-icon.webp',
    background: '/assets/hot-take-stage-bg-v2.webp',
    stageArt: '/assets/hot-take-podium-v2.webp',
    controlRoom: 'Live Heat Control',
    audience: 'the audience',
  },
  {
    id: 'suspect',
    label: 'Suspect',
    kicker: 'Everybody looks guilty',
    description: 'Answer in secret, build an alibi, and accuse the player who fits the clue.',
    players: getGamePlayerRangeLabel('suspect'),
    rounds: '5 rounds',
    pace: 'Deduction · dramatic',
    duration: '20–30 min',
    contentRating: 'Host-curated intensity',
    controller: 'Text + voting',
    mechanics: ['Answer secretly', 'Build an alibi', 'Accuse'],
    icon: '/assets/suspect-icon-v2.webp',
    background: '/assets/suspect-bg-v2.webp',
    stageArt: '/assets/suspect-stage-v2.webp',
    controlRoom: 'Case File Control',
    audience: 'the jury',
  },
  {
    id: 'drawn-out',
    label: 'Drawn Out',
    kicker: 'Art was a mistake',
    description: 'Draw ridiculous prompts, decode ruined art, or hide as the fake artist.',
    players: getGamePlayerRangeLabel('drawn-out'),
    rounds: '5 rounds',
    pace: 'Drawing · chaotic',
    duration: '20–30 min',
    contentRating: 'Room-safe prompts',
    controller: 'Touch drawing',
    mechanics: ['Draw', 'Decode', 'Vote'],
    icon: '/assets/drawn-out-icon-v2.webp',
    background: '/assets/drawn-out-bg-v2.webp',
    stageArt: '/assets/drawn-out-stage-v2.webp',
    controlRoom: 'Sketch Disaster Control',
    audience: 'the art critics',
  },
];

export function getGamePlayerRangeLabel(
  gameId: SupportedGameId,
  drawnOutMode: DrawnOutMode = 'classic',
): string {
  const limits = getGamePlayerLimits(gameId, drawnOutMode);
  return `${limits.minimum}–${limits.maximum} players`;
}

export function isSupportedGameId(value: string | null | undefined): value is SupportedGameId {
  return GAME_CATALOG.some((game) => game.id === value);
}

export function getGameDefinition(gameId: string | null | undefined): GameDefinition {
  return GAME_CATALOG.find((game) => game.id === gameId) ?? GAME_CATALOG[0]!;
}
