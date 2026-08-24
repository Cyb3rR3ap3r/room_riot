import { randomInt, randomUUID } from 'node:crypto';

import type { ContentMode } from '@room-riot/contracts';
import type { GroupthinkPrompt } from '@room-riot/groupthink';
import type { HotTakePrompt } from '@room-riot/hot-take';

/**
 * Generates a large, local prompt deck for the AI mode.
 *
 * This deliberately has no network dependency: a room should still be playable on a
 * LAN when no cloud AI credentials are configured. It lives behind the server's
 * prompt-loading boundary so a hosted model can replace it later without changing
 * game rules or the client protocol.
 */
export function generateGroupthinkPrompts(
  contentMode: ContentMode,
  count = 40,
): readonly GroupthinkPrompt[] {
  const candidates = shuffle([...GROUPTHINK_PROMPTS, ...(MODE_PROMPTS[contentMode] ?? [])]);
  return candidates.slice(0, Math.max(1, Math.min(count, candidates.length))).map((text) => ({
    id: `ai-groupthink-${randomUUID()}`,
    text,
  }));
}

export function generateHotTakePrompts(
  contentMode: ContentMode,
  count = 40,
): readonly HotTakePrompt[] {
  const candidates = shuffle([...HOT_TAKE_PROMPTS, ...(MODE_HOT_TAKE_PROMPTS[contentMode] ?? [])]);
  return candidates.slice(0, Math.max(1, Math.min(count, candidates.length))).map((prompt) => ({
    id: `ai-hot-take-${randomUUID()}`,
    text: prompt.text,
    kind: prompt.kind,
  }));
}

function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const current = items[index];
    const swap = items[swapIndex];
    if (current !== undefined && swap !== undefined) {
      items[index] = swap;
      items[swapIndex] = current;
    }
  }
  return items;
}

const GROUPTHINK_PROMPTS: readonly string[] = [
  'Name something people forget to pack for a trip.',
  'Name something that is impossible to do quietly.',
  'Name a food that is better cold than hot.',
  'Name something people pretend to understand.',
  'Name a reason someone might be late even when they left early.',
  'Name something that always disappears from a shared kitchen.',
  'Name a job that would be terrible if everyone could read your mind.',
  'Name something people do when they think nobody is watching.',
  'Name an item that is never where you left it.',
  'Name something that makes a room feel instantly awkward.',
  'Name a sound that ruins a peaceful morning.',
  'Name something people buy and then rarely use.',
  'Name a place where whispering makes things more suspicious.',
  'Name something that should come with a warning label.',
  'Name a tiny inconvenience that can ruin an entire day.',
  'Name something people check even when they know nothing changed.',
  'Name a food that is dangerous to eat while wearing white.',
  'Name something that gets more competitive than it needs to be.',
  'Name a phrase that instantly starts an argument.',
  'Name something that is always awkward to carry in public.',
  'Name an excuse people use when they forgot your name.',
  'Name something that looks easy until you try it.',
  'Name an object that has a mysteriously short lifespan.',
  'Name something that should never be sent in a group chat.',
  'Name a place where you would hate to run into your boss.',
  'Name something people keep in a junk drawer.',
  'Name a smell that instantly transports you somewhere else.',
  'Name something that causes a line to move painfully slowly.',
  'Name an activity that sounds relaxing but is actually exhausting.',
  'Name something people say when they are absolutely guessing.',
  'Name a purchase that feels irresponsible but is hard to resist.',
  'Name something that should be illegal before noon.',
  'Name a thing that gets lost between the car and the front door.',
  'Name something that makes everyone suddenly an expert.',
  'Name a place where you should never start a food fight.',
  'Name something that is always one size too small.',
  'Name an item people forget to return.',
  'Name a task that takes three times longer than promised.',
  'Name something that sounds fancy but is actually ordinary.',
  'Name a reason to pretend your phone battery is dead.',
  'Name something people clap for even though nobody asked them to.',
  'Name an everyday object that would be terrifying if it were alive.',
  'Name something that instantly reveals who grew up in the Midwest.',
  'Name a place where you should never wear brand-new shoes.',
  'Name something everyone owns but cannot explain why.',
  'Name a snack that vanishes fastest at a party.',
  'Name something that makes a bad first impression.',
  'Name an occasion where being five minutes early feels suspicious.',
  'Name something you would not want to hear from the next room.',
  'Name a rule people follow only when someone is looking.',
  'Name something that becomes much harder when people give advice.',
  'Name a thing that is funnier when it happens to someone else.',
  'Name something that makes a surprisingly good percussion instrument.',
  'Name an object you would save first in a low-stakes emergency.',
  'Name something you would never buy from a vending machine.',
  'Name a phrase that belongs on a motivational poster but never works.',
  'Name something that makes a date go instantly off the rails.',
  'Name a thing that should have a fast lane but does not.',
  'Name something that people overpack for every vacation.',
  'Name a sound that makes everyone in the room look up.',
];

const MODE_PROMPTS: Record<ContentMode, readonly string[]> = {
  family: [
    'Name a board game that causes the most dramatic rematch.',
    'Name something a kid can turn into a costume.',
    'Name a chore people negotiate to avoid.',
    'Name a song that makes an entire car sing along.',
    'Name something that belongs in a school talent show.',
    'Name a reason a sleepover would end early.',
    'Name a snack that should be its own food group.',
    'Name something a pet would absolutely misunderstand.',
  ],
  standard: [],
  'after-dark': [
    'Name a bad decision that sounds fun after midnight.',
    'Name something people text when they should be asleep.',
    'Name a place where flirting would be a terrible idea.',
    'Name a warning sign people ignore because the story is good.',
    'Name a secret that gets harder to keep after two drinks.',
    'Name an excuse for leaving a party without saying goodbye.',
    'Name something you would never want to explain to a bartender.',
    'Name a date idea that is romantic only in a movie.',
  ],
};

const HOT_TAKE_PROMPTS: readonly { text: string; kind: HotTakePrompt['kind'] }[] = [
  { text: 'What is the most overrated fast-food restaurant?', kind: 'open' },
  { text: 'What household chore should be permanently eliminated?', kind: 'open' },
  { text: 'What is something everyone pretends to like?', kind: 'open' },
  { text: 'What popular trend needs to disappear immediately?', kind: 'open' },
  { text: 'What is the most defensible terrible movie?', kind: 'open' },
  { text: 'What is the worst thing someone can bring to a party?', kind: 'open' },
  { text: 'Which fictional character would be the worst roommate?', kind: 'open' },
  { text: 'What food is only good because of the sauce?', kind: 'open' },
  { text: 'What everyday convenience has made people less capable?', kind: 'open' },
  { text: 'What popular “classic” deserves a serious rewrite?', kind: 'open' },
  { text: 'What is the most overrated tourist attraction?', kind: 'open' },
  { text: 'What social rule should everyone stop pretending to follow?', kind: 'open' },
  { text: 'What is the worst seat in a movie theater?', kind: 'open' },
  { text: 'What food combination should be banned from potlucks?', kind: 'open' },
  { text: 'What is the least useful feature on a modern phone?', kind: 'open' },
  { text: 'What phrase instantly makes a meeting longer?', kind: 'open' },
  { text: 'What is the most suspicious thing to order at breakfast?', kind: 'open' },
  { text: 'Which household appliance has the most attitude?', kind: 'open' },
  { text: 'What is the most overrated “life hack”?', kind: 'open' },
  { text: 'What should never be turned into a flavor of ice cream?', kind: 'open' },
  { text: 'Which fictional world would be miserable to actually live in?', kind: 'open' },
  { text: 'What is the worst possible theme for a birthday party?', kind: 'open' },
  { text: 'What is the most dramatic way to avoid a group text?', kind: 'open' },
  { text: 'What should be replaced by a four-day weekend?', kind: 'open' },
  { text: 'Which famous mascot would be a terrible roommate?', kind: 'open' },
  { text: 'What is the most overrated thing to do on vacation?', kind: 'open' },
  { text: 'What is the worst thing to hear from a restaurant kitchen?', kind: 'open' },
  { text: 'What should be illegal to say before the first coffee?', kind: 'open' },
  { text: 'Which app would cause the most chaos if it vanished tomorrow?', kind: 'open' },
  { text: 'What is the most dramatic way to lose an argument?', kind: 'open' },
  { text: 'Who in this room would be the worst emergency contact?', kind: 'player-targeted' },
  { text: 'Who in this room would accidentally become internet famous?', kind: 'player-targeted' },
  { text: 'Who in this room would thrive in a reality show?', kind: 'player-targeted' },
  { text: 'Who in this room would bring the wrong gift to a wedding?', kind: 'player-targeted' },
  { text: 'Who in this room would survive longest without a phone?', kind: 'player-targeted' },
  { text: 'Who in this room would start a rumor by accident?', kind: 'player-targeted' },
  { text: 'Who in this room would be first to adopt a weird hobby?', kind: 'player-targeted' },
  { text: 'Who in this room would negotiate with a parking ticket?', kind: 'player-targeted' },
];

const MODE_HOT_TAKE_PROMPTS: Record<
  ContentMode,
  readonly { text: string; kind: HotTakePrompt['kind'] }[]
> = {
  family: [
    { text: 'What is the most overrated school lunch?', kind: 'open' },
    { text: 'Which cartoon character would be a terrible babysitter?', kind: 'open' },
    { text: 'What game has the most confusing rules?', kind: 'open' },
    { text: 'Who in this room would win a pillow fight?', kind: 'player-targeted' },
  ],
  standard: [],
  'after-dark': [
    { text: 'What is the biggest red flag on a first date?', kind: 'open' },
    { text: 'What is the worst excuse for leaving a party early?', kind: 'open' },
    { text: 'Who in this room would make the most chaotic ex?', kind: 'player-targeted' },
    { text: 'Who in this room would text an ex at 2 a.m.?', kind: 'player-targeted' },
  ],
};
