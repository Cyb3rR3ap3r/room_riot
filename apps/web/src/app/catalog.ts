import { getGamePlayerLimits } from '@room-riot/contracts';
import type { DrawnOutMode, SupportedGameId } from '@room-riot/contracts';

export type { SupportedGameId } from '@room-riot/contracts';

export interface GameDefinition {
  readonly id: SupportedGameId;
  readonly label: string;
  readonly kicker: string;
  readonly description: string;
  readonly example: string;
  readonly players: string;
  readonly rounds: string;
  readonly pace: string;
  readonly duration: string;
  readonly contentRating: string;
  readonly controller: string;
  readonly mechanics: readonly string[];
  readonly icon: string;
  readonly iconSrcSet: string;
  readonly background: string;
  readonly stageArt: string;
  readonly stageArtSrcSet: string;
  readonly controlRoom: string;
  readonly audience: string;
}

export const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: 'groupthink',
    label: 'Groupthink',
    kicker: 'Match minds',
    description: 'Give your answer, then see how many people in the room thought the same way.',
    example: 'Prompt: “Best late-night snack?” Match the room to score.',
    players: getGamePlayerRangeLabel('groupthink'),
    rounds: '5 rounds',
    pace: 'Fast · social',
    duration: '10–15 min',
    contentRating: 'Room-safe prompts',
    controller: 'Text input',
    mechanics: ['Write', 'Reveal together', 'Match the room'],
    icon: '/assets/groupthink-icon.webp',
    iconSrcSet: '/assets/groupthink-icon-256.webp 256w, /assets/groupthink-icon.webp 512w',
    background: '/assets/groupthink-lab-bg-v2.webp',
    stageArt: '/assets/groupthink-reactor-v2.webp',
    stageArtSrcSet:
      '/assets/groupthink-reactor-v2-480.webp 480w, /assets/groupthink-reactor-v2.webp 1024w',
    controlRoom: 'Consensus Lab',
    audience: 'connected minds',
  },
  {
    id: 'hot-take',
    label: 'Hot Take',
    kicker: 'Say it louder',
    description: "Drop an anonymous opinion, then vote for the take the room can't ignore.",
    example: 'Prompt: “Pineapple belongs on pizza.” Write your take, then vote.',
    players: getGamePlayerRangeLabel('hot-take'),
    rounds: '5 rounds',
    pace: 'Anonymous · spicy',
    duration: '15–20 min',
    contentRating: 'Host-curated intensity',
    controller: 'Text + voting',
    mechanics: ['Write anonymously', 'Read the room', 'Vote'],
    icon: '/assets/hot-take-icon.webp',
    iconSrcSet: '/assets/hot-take-icon-256.webp 256w, /assets/hot-take-icon.webp 512w',
    background: '/assets/hot-take-stage-bg-v2.webp',
    stageArt: '/assets/hot-take-podium-v2.webp',
    stageArtSrcSet:
      '/assets/hot-take-podium-v2-480.webp 480w, /assets/hot-take-podium-v2.webp 1024w',
    controlRoom: 'Live Heat Control',
    audience: 'the audience',
  },
  {
    id: 'suspect',
    label: 'Suspect',
    kicker: 'Everybody looks guilty',
    description: 'Answer in secret, build an alibi, and accuse the player who fits the clue.',
    example: 'Answer privately, defend your story, then name the suspect.',
    players: getGamePlayerRangeLabel('suspect'),
    rounds: '5 rounds',
    pace: 'Deduction · dramatic',
    duration: '20–30 min',
    contentRating: 'Host-curated intensity',
    controller: 'Text + voting',
    mechanics: ['Answer secretly', 'Build an alibi', 'Accuse'],
    icon: '/assets/suspect-icon-v2.webp',
    iconSrcSet: '/assets/suspect-icon-v2-256.webp 256w, /assets/suspect-icon-v2.webp 512w',
    background: '/assets/suspect-bg-v2.webp',
    stageArt: '/assets/suspect-stage-v2.webp',
    stageArtSrcSet: '/assets/suspect-stage-v2-480.webp 480w, /assets/suspect-stage-v2.webp 1024w',
    controlRoom: 'Case File Control',
    audience: 'the jury',
  },
  {
    id: 'drawn-out',
    label: 'Drawn Out',
    kicker: 'Art was a mistake',
    description: 'Draw ridiculous prompts, decode ruined art, or hide as the fake artist.',
    example: 'Draw “a cat astronaut”; the room guesses what survived the chaos.',
    players: getGamePlayerRangeLabel('drawn-out'),
    rounds: '5 rounds',
    pace: 'Drawing · chaotic',
    duration: '20–30 min',
    contentRating: 'Room-safe prompts',
    controller: 'Touch drawing',
    mechanics: ['Draw', 'Decode', 'Vote'],
    icon: '/assets/drawn-out-icon-v2.webp',
    iconSrcSet: '/assets/drawn-out-icon-v2-256.webp 256w, /assets/drawn-out-icon-v2.webp 512w',
    background: '/assets/drawn-out-bg-v2.webp',
    stageArt: '/assets/drawn-out-stage-v2.webp',
    stageArtSrcSet:
      '/assets/drawn-out-stage-v2-480.webp 480w, /assets/drawn-out-stage-v2.webp 1024w',
    controlRoom: 'Sketch Disaster Control',
    audience: 'the art critics',
  },
  {
    id: 'blank-line',
    label: 'Blank Line',
    kicker: 'Draw like you know',
    description:
      'Build one shared drawing, one stroke at a time, while one player draws completely blind.',
    example: 'Everyone sees “a lighthouse” except the Blank. Watch every line and find the bluff.',
    players: getGamePlayerRangeLabel('blank-line'),
    rounds: '5 rounds',
    pace: 'Drawing · deduction',
    duration: '15–25 min',
    contentRating: 'Host-curated intensity',
    controller: 'One-stroke drawing + voting',
    mechanics: ['Draw one line', 'Read the room', 'Expose the Blank'],
    icon: '/assets/blank-line-icon-v1.webp',
    iconSrcSet: '/assets/blank-line-icon-v1-256.webp 256w, /assets/blank-line-icon-v1.webp 512w',
    background: '/assets/blank-line-bg-v1.webp',
    stageArt: '/assets/blank-line-stage-v1.webp',
    stageArtSrcSet:
      '/assets/blank-line-stage-v1-480.webp 480w, /assets/blank-line-stage-v1.webp 1024w',
    controlRoom: 'Blank Line Studio',
    audience: 'the suspicious artists',
  },
  {
    id: 'wavelength',
    label: 'WaveLength',
    kicker: 'Tune into the room',
    description:
      'Decode one clue, lock private signal markers, and see whether the room lands in sync.',
    example: 'Between “barely awake” and “ready for anything,” where does “Sunday sunrise” land?',
    players: getGamePlayerRangeLabel('wavelength'),
    rounds: '7 rounds',
    pace: 'Debate · calibration',
    duration: '15–25 min',
    contentRating: 'Host-curated intensity',
    controller: 'Private signal dial + confidence',
    mechanics: ['Broadcast a clue', 'Tune privately', 'Intercept the drift'],
    icon: '/assets/wavelength-icon-v1.webp',
    iconSrcSet: '/assets/wavelength-icon-v1-256.webp 256w, /assets/wavelength-icon-v1.webp 512w',
    background: '/assets/wavelength-bg-v1.webp',
    stageArt: '/assets/wavelength-stage-v1.webp',
    stageArtSrcSet:
      '/assets/wavelength-stage-v1-480.webp 480w, /assets/wavelength-stage-v1.webp 1024w',
    controlRoom: 'Signal Command',
    audience: 'the live receivers',
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
