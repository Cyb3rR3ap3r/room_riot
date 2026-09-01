import type { RoomSnapshot } from '../../protocol.js';
import {
  createTvDensityPlan,
  type TvDensityItem,
  type TvDensityPlan,
  type TvViewport,
} from './tv-layout.js';

export type LiveDisplayDensityTarget = 'stage' | 'roster';

export interface LiveDisplayDensityViewModel {
  readonly key: string;
  readonly target: LiveDisplayDensityTarget;
  readonly plan: TvDensityPlan;
  /** Ordered renderer-owned nodes that correspond to the plan items. */
  readonly contentSelector: string;
}

export function createLiveDisplayDensityViewModel(
  snapshot: RoomSnapshot,
  viewport: TvViewport,
): LiveDisplayDensityViewModel {
  const result = createResultItems(snapshot);
  const target: LiveDisplayDensityTarget = result ? 'stage' : 'roster';
  const items = result?.items ?? createRosterItems(snapshot);
  const prompt = result?.prompt ?? '';
  const kind = result?.kind ?? 'roster';
  const plan = createTvDensityPlan({ kind, prompt, items, viewport });
  return {
    key: JSON.stringify([target, plan.mode, plan.pageCount, prompt, items]),
    target,
    plan,
    contentSelector: result?.contentSelector ?? ':scope li',
  };
}

interface ResultItems {
  readonly kind: 'results' | 'scores';
  readonly prompt: string;
  readonly items: readonly TvDensityItem[];
  readonly contentSelector: string;
}

function createResultItems(snapshot: RoomSnapshot): ResultItems | null {
  if (snapshot.state.phase === 'winner' || snapshot.state.phase === 'scoring') {
    return {
      kind: 'scores',
      prompt: snapshot.state.phase === 'winner' ? 'Final scoreboard' : 'Scores',
      items: createScoreItems(snapshot),
      contentSelector: '.experience-scoreboard li',
    };
  }
  const game = snapshot.game;
  if (!game) return null;

  if (game.id === 'groupthink' && (game.status === 'results' || game.status === 'complete')) {
    return {
      kind: 'results',
      prompt: game.prompt,
      items: game.groups.map((group, index) => ({
        id: `group:${index}`,
        primary: group.answer,
        secondary:
          group.points > 0
            ? `${group.count} matching player${group.count === 1 ? '' : 's'} → ${group.points} points`
            : 'No matching players → 0 points',
        score: group.points,
      })),
      contentSelector: '.thought-clusters li',
    };
  }
  if (
    game.id === 'hot-take' &&
    (game.status === 'voting' || game.status === 'results' || game.status === 'complete')
  ) {
    return {
      kind: 'results',
      prompt: game.prompt,
      items: game.entries.map((entry) => ({
        id: entry.entryId,
        primary: entry.answer,
        ...(game.status === 'voting'
          ? {}
          : {
              secondary: `${entry.voteCount} vote${entry.voteCount === 1 ? '' : 's'} → ${entry.points} points`,
              score: entry.points,
            }),
      })),
      contentSelector: '.take-wall li',
    };
  }
  if (game.id === 'suspect' && (game.status === 'results' || game.status === 'complete')) {
    return {
      kind: 'results',
      prompt: game.prompt,
      items: game.voteSummary.map((vote, index) => ({
        id: `vote:${index}`,
        primary: vote.targetPlayerIds.length
          ? vote.targetPlayerIds.map((id) => playerName(snapshot, id)).join(' + ')
          : 'No match',
        secondary: `${vote.count} vote${vote.count === 1 ? '' : 's'} → ${sumPlayerPoints(game.roundScores, vote.targetPlayerIds)} target points`,
        score: sumPlayerPoints(game.roundScores, vote.targetPlayerIds),
      })),
      contentSelector: '.suspect-vote-summary li',
    };
  }
  if (game.id === 'drawn-out' && (game.status === 'results' || game.status === 'complete')) {
    if (game.mode === 'telephone') {
      return {
        kind: 'results',
        prompt: game.prompt ?? 'Original prompt',
        items: game.chain.map((entry, index) => ({
          id: `chain:${index}`,
          primary: playerName(snapshot, entry.playerId),
          secondary: `${entry.kind === 'drawing' ? 'Drawing link' : entry.text} → ${playerPoints(game.roundScores, entry.playerId)} points`,
          score: playerPoints(game.roundScores, entry.playerId),
        })),
        contentSelector: '.drawn-out-chain li',
      };
    }
    if (game.mode === 'fake-artist') {
      return {
        kind: 'results',
        prompt: game.prompt ?? 'Fake Artist results',
        items: game.votes.map((vote) => ({
          id: `vote:${vote.playerId}`,
          primary: playerName(snapshot, vote.playerId),
          secondary: `${vote.count} vote${vote.count === 1 ? '' : 's'} → ${playerPoints(game.roundScores, vote.playerId)} points`,
          score: playerPoints(game.roundScores, vote.playerId),
        })),
        contentSelector: '.drawn-out-fake-results li',
      };
    }
    return {
      kind: 'results',
      prompt: game.prompt ?? 'Original prompt',
      items: game.guesses.map((guess) => ({
        id: `guess:${guess.playerId}`,
        primary: guess.text,
        secondary: `${playerName(snapshot, guess.playerId)} · ${guess.correct ? 'Correct' : 'Not quite'} → ${playerPoints(game.roundScores, guess.playerId)} points`,
        score: playerPoints(game.roundScores, guess.playerId),
      })),
      contentSelector: '.drawn-out-guesses li',
    };
  }
  if (game.id === 'blank-line' && (game.status === 'results' || game.status === 'complete')) {
    return {
      kind: 'results',
      prompt: game.prompt ?? 'Blank Line results',
      items: game.voteSummary.map((vote) => ({
        id: `vote:${vote.playerId}`,
        primary: playerName(snapshot, vote.playerId),
        secondary: `${vote.count} accusation${vote.count === 1 ? '' : 's'} → ${playerPoints(game.roundScores, vote.playerId)} points`,
        score: playerPoints(game.roundScores, vote.playerId),
      })),
      contentSelector: '.blank-line-vote-reveal li',
    };
  }
  return null;
}

function createRosterItems(snapshot: RoomSnapshot): readonly TvDensityItem[] {
  return snapshot.state.players
    .filter((player) => player.status !== 'removed')
    .map((player) => ({
      id: player.id,
      primary: `${player.avatar} ${player.name}`,
      secondary: snapshot.state.phase === 'lobby' ? 'Ready' : `${player.score} pts`,
      score: player.score,
    }));
}

function createScoreItems(snapshot: RoomSnapshot): readonly TvDensityItem[] {
  const sorted = [...snapshot.state.players]
    .filter((player) => player.status !== 'removed')
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  let rank = 0;
  let previousScore: number | null = null;
  return sorted.map((player, index) => {
    if (player.score !== previousScore) rank = index + 1;
    previousScore = player.score;
    return {
      id: player.id,
      primary: `${player.avatar} ${player.name}`,
      secondary: `${player.score} pts`,
      rank,
      score: player.score,
    };
  });
}

function playerName(snapshot: RoomSnapshot, playerId: string): string {
  return snapshot.state.players.find((player) => player.id === playerId)?.name ?? 'Unknown player';
}

function playerPoints(
  scores: readonly { readonly playerId: string; readonly points: number }[],
  playerId: string,
): number {
  return scores.find((score) => score.playerId === playerId)?.points ?? 0;
}

function sumPlayerPoints(
  scores: readonly { readonly playerId: string; readonly points: number }[],
  playerIds: readonly string[],
): number {
  return playerIds.reduce((total, playerId) => total + playerPoints(scores, playerId), 0);
}
