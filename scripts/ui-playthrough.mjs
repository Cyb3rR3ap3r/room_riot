/* global URL, window */

/**
 * Room Riot playthrough audit.
 *
 * Boots a real room per game, joins real players over the live socket, and
 * walks the room through every phase. At each phase it screenshots the host,
 * the display and a player controller at both phone and laptop widths, and runs
 * the same layout checks used by scripts/ui-audit.mjs.
 *
 * Usage: node scripts/ui-playthrough.mjs [baseUrl] [outputDir]
 *   AUDIT_GAMES=groupthink,suspect  limit which games run
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditPage } from './ui-audit-checks.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3000';
const outputRoot = process.argv[3] ?? join(process.cwd(), '.ui-playthrough');

const ALL_GAMES = ['groupthink', 'hot-take', 'suspect', 'drawn-out', 'blank-line', 'wavelength'];
const games = (process.env.AUDIT_GAMES ?? ALL_GAMES.join(',')).split(',').filter(Boolean);

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1440, height: 900 };
const PLAYER_NAMES = ['Alexandra', 'Bo', 'Priyanka', 'Wu'];
const MAX_STEPS = 26;

const report = [];
let shotIndex = 0;

async function capture(page, label, role, game) {
  shotIndex += 1;
  const name = `${game}__${String(shotIndex).padStart(3, '0')}__${label}__${role}.png`;
  const path = join(outputRoot, name);
  await page.screenshot({ path, fullPage: true });
  let result = { defects: [] };
  try {
    result = await page.evaluate(auditPage);
  } catch {
    /* page may be mid-render */
  }
  report.push({ game, label, role, screenshot: path, defects: result.defects });
  return result.defects.length;
}

const text = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/** Fill whatever primary input the current controller exposes and submit. */
async function playerAct(page) {
  // Ready gate in the lobby.
  const ready = page.getByRole('button', { name: /I.m ready/i });
  if (await ready.count()) {
    await ready
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    return 'ready';
  }

  // Drawing surface.
  const canvas = page.locator('canvas[aria-label="Drawing canvas"]');
  if (await canvas.count()) {
    const box = await canvas.first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 12 });
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.8, { steps: 12 });
      await page.mouse.up();
    }
  }

  // Range dial (wavelength).
  const range = page
    .locator('input[type="range"]')
    .filter({ hasNot: page.locator('[aria-label="Game audio volume"]') });
  if (await range.count()) {
    for (const handle of await range.all()) {
      const label = (await handle.getAttribute('aria-label')) ?? '';
      if (/volume|brush/i.test(label)) continue;
      await handle.fill(String(30 + Math.floor(Math.random() * 40))).catch(() => {});
    }
  }

  // Text entry.
  const textbox = page.locator('input[type="text"], textarea').filter({ visible: true });
  const count = await textbox.count();
  for (let i = 0; i < count; i += 1) {
    const field = textbox.nth(i);
    const label =
      ((await field.getAttribute('aria-label')) ?? '') +
      ((await field.getAttribute('placeholder')) ?? '');
    if (/room code|name/i.test(label)) continue;
    if (await field.inputValue()) continue;
    await field.fill('A gloriously questionable answer').catch(() => {});
  }

  // Voting / choice buttons inside the controller.
  const submit = page
    .getByRole('button', { name: /^(submit|send|lock|confirm|cast|vote|accuse|save|done)/i })
    .filter({ visible: true });
  if (await submit.count()) {
    await submit
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    return 'submit';
  }

  const choice = page.locator('.action-first-controller button:visible').filter({
    hasNotText: /clear|retry|leave|got it|undo|redo|sound|haptics|volume/i,
  });
  if (await choice.count()) {
    await choice
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    return 'choice';
  }
  return 'idle';
}

/** Click the host's primary phase-advancing control, if one is offered. */
async function hostAdvance(page) {
  const primary = page
    .getByRole('button', {
      name: /^(start |reveal|next round|close the alibi|continue|begin|score|show )/i,
    })
    .filter({ visible: true });
  if (await primary.count()) {
    const label = await primary.first().innerText();
    await primary
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    return label.trim();
  }
  return null;
}

async function runGame(browser, game) {
  const phoneCtx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const laptopCtx = await browser.newContext({ viewport: LAPTOP });

  const host = await laptopCtx.newPage();
  await host.goto(`${baseUrl}/host/${game}`, { waitUntil: 'networkidle' });
  await capture(host, 'lobby-setup', 'host-laptop', game);

  await host.getByRole('button', { name: /create game/i }).click();
  await host.waitForFunction(() => /\/host\/[a-z-]+\?room=[A-Z0-9]+/.test(window.location.href), {
    timeout: 20_000,
  });
  const roomCode = new URL(host.url()).searchParams.get('room');
  if (!roomCode) throw new Error(`${game}: no room code`);
  console.log(`  room ${roomCode}`);

  const display = await laptopCtx.newPage();
  await display.goto(`${baseUrl}/display/${game}?room=${roomCode}`, { waitUntil: 'networkidle' });

  // Each player needs an isolated context: sessions are kept in localStorage,
  // so sharing one context would make the second player resume the first.
  const players = [];
  const playerContexts = [];
  for (const [index, name] of PLAYER_NAMES.entries()) {
    const ctx = await browser.newContext(
      index === 0 ? { viewport: PHONE, hasTouch: true } : { viewport: LAPTOP },
    );
    playerContexts.push(ctx);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/play/${game}?room=${roomCode}`, { waitUntil: 'networkidle' });
    const nameField = page.getByPlaceholder('Your name');
    try {
      await nameField.waitFor({ state: 'visible', timeout: 20_000 });
    } catch {
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400);
      throw new Error(`${game}: join form never appeared for ${name}. Page said: ${body}`);
    }
    await nameField.fill(name);
    const roomField = page.getByPlaceholder('RAGE');
    if (!(await roomField.inputValue())) await roomField.fill(roomCode);
    await page.getByRole('button', { name: /join room/i }).click();
    await page.waitForTimeout(700);
    players.push({ page, name, phone: index === 0 });
  }

  await host.waitForTimeout(800);
  await capture(host, 'lobby-filled', 'host-laptop', game);
  await capture(display, 'lobby-filled', 'display-laptop', game);
  await capture(players[0].page, 'lobby-filled', 'player-phone', game);
  await capture(players[1].page, 'lobby-filled', 'player-laptop', game);

  let lastLabel = '';
  for (let step = 0; step < MAX_STEPS; step += 1) {
    for (const player of players) await playerAct(player.page).catch(() => {});
    await host.waitForTimeout(700);
    const advanced = await hostAdvance(host);
    await host.waitForTimeout(900);

    const snapshot = await text(host);
    const phase =
      snapshot.match(
        /\b(Lobby|Writing|Drawing|Voting|Results|Winner|Scoreboard|Reveal|Alibi|Guessing|Tuning)\b/i,
      )?.[1] ?? `step${step}`;
    const label = `${phase.toLowerCase()}-${step}`;
    if (label === lastLabel) continue;
    lastLabel = label;

    await capture(host, label, 'host-laptop', game);
    await capture(display, label, 'display-laptop', game);
    await capture(players[0].page, label, 'player-phone', game);
    await capture(players[1].page, label, 'player-laptop', game);

    if (/winner|final scores|rematch/i.test(snapshot) && step > 3) break;
    if (!advanced && step > 2) {
      // Nothing left to click and no phase change: the room is idle.
      const idle = await Promise.all(players.map((p) => playerAct(p.page).catch(() => 'idle')));
      if (idle.every((r) => r === 'idle')) break;
    }
  }

  await capture(host, 'final', 'host-laptop', game);
  await capture(display, 'final', 'display-laptop', game);
  await capture(players[0].page, 'final', 'player-phone', game);

  await phoneCtx.close();
  await laptopCtx.close();
  for (const ctx of playerContexts) await ctx.close();
}

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const game of games) {
    console.log(`\n▶ ${game}`);
    try {
      await runGame(browser, game);
    } catch (error) {
      console.log(`  FAILED: ${String(error).slice(0, 300)}`);
      report.push({
        game,
        label: 'error',
        role: 'harness',
        error: String(error).slice(0, 300),
        defects: [],
      });
    }
  }
} finally {
  await browser.close();
}

await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));

const byType = new Map();
for (const entry of report) {
  for (const defect of entry.defects ?? []) {
    const key = `${defect.type}|${defect.element}`;
    const bucket = byType.get(key) ?? { count: 0, where: [] };
    bucket.count += 1;
    if (bucket.where.length < 4) bucket.where.push(`${entry.game}/${entry.label}/${entry.role}`);
    byType.set(key, bucket);
  }
}
console.log(`\nPlaythrough audit — ${report.length} captures`);
const sorted = [...byType.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [key, value] of sorted.slice(0, 45)) {
  console.log(`${String(value.count).padStart(4)}x  ${key}`);
  console.log(`        ${value.where.join(', ')}`);
}
console.log(`\nCaptures in ${outputRoot}`);
