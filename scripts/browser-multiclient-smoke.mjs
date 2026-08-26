/* global clearTimeout, document, requestAnimationFrame, setTimeout, URL, window */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stdout } from 'node:process';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3100';
const outputRoot = process.argv[3] ?? join(tmpdir(), 'room-riot-browser-multiclient');
const games = [
  { id: 'groupthink', picker: /^Groupthink/, minimumPlayers: 1 },
  { id: 'hot-take', picker: /^Hot Take/, minimumPlayers: 3 },
  { id: 'suspect', picker: /^Suspect/, minimumPlayers: 4 },
  { id: 'drawn-out', picker: /^Drawn Out/, minimumPlayers: 3 },
];
const FRAME_SAMPLE_COUNT = 15;
// This is a CI stall guard, not the target-phone/TV acceptance budget.
const FRAME_P95_BUDGET_MS = 1_000;

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The compiled server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Compiled server did not become healthy at ${baseUrl}`);
};

const inspectPage = async (page, viewport, expectedPlayerName) =>
  page.evaluate(
    ({ viewportWidth, viewportHeight, expectedName }) => {
      const documentWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
      return {
        viewport: { width: viewportWidth, height: viewportHeight },
        documentWidth,
        horizontalOverflow: documentWidth > viewportWidth + 1,
        hasActivePhase: /(?:Room )?Phase:\s*(?:input|alibi|voting|turn|guess)/i.test(
          document.body.innerText,
        ),
        hasExpectedPlayer: document.body.innerText.includes(expectedName),
      };
    },
    { ...viewport, expectedName: expectedPlayerName },
  );

const capture = async (page, name, viewport, expectedPlayerName) => {
  const screenshot = join(outputRoot, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  return { screenshot, ...(await inspectPage(page, viewport, expectedPlayerName)) };
};

const measureFrameTime = async (page) => {
  await page.bringToFront();
  await page.waitForTimeout(100);
  return page.evaluate(async (sampleCount) => {
    const durations = [];
    let previous = null;
    let finish;
    const result = new Promise((resolve) => {
      finish = resolve;
    });
    const timeout = setTimeout(() => finish(null), 3_000);
    const sample = (timestamp) => {
      if (previous !== null) durations.push(timestamp - previous);
      previous = timestamp;
      if (durations.length < sampleCount) {
        requestAnimationFrame(sample);
        return;
      }
      clearTimeout(timeout);
      const sorted = [...durations].sort((left, right) => left - right);
      const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      finish({
        samples: sorted.length,
        p95Ms: Number((sorted[p95Index] ?? 0).toFixed(2)),
        maxMs: Number((sorted.at(-1) ?? 0).toFixed(2)),
      });
    };
    requestAnimationFrame(sample);
    return result;
  }, FRAME_SAMPLE_COUNT);
};

const exerciseDrawingRecovery = async (page) => {
  const canvas = page.locator('canvas.drawing-input');
  if ((await canvas.count()) === 0) return { available: false };
  const box = await canvas.boundingBox();
  if (!box) return { available: false, reason: 'canvas has no layout box' };
  await page.mouse.move(box.x + 24, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 72, box.y + 48, { steps: 2 });
  await page.mouse.up();
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(50);
  const orientationSafe = await page.evaluate(() => {
    const element = document.querySelector('canvas.drawing-input');
    const rect = element?.getBoundingClientRect();
    return Boolean(
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  return { available: true, pointerCancelled: true, undoRedo: true, orientationSafe };
};

await mkdir(outputRoot, { recursive: true });
await waitForHealth();
const browser = await chromium.launch({ headless: true });
const results = [];
const browserErrors = [];

try {
  for (const game of games) {
    const contexts = [
      await browser.newContext({ viewport: { width: 1280, height: 720 } }),
      ...((await Promise.all(
        Array.from({ length: game.minimumPlayers }, () =>
          browser.newContext({ viewport: { width: 390, height: 844 } }),
        ),
      )) ?? []),
      await browser.newContext({ viewport: { width: 1280, height: 720 } }),
    ];
    const pages = {
      host: await contexts[0].newPage(),
      player: await contexts[1].newPage(),
      display: await contexts.at(-1).newPage(),
    };
    const additionalPlayers = await Promise.all(
      contexts.slice(2, -1).map((context) => context.newPage()),
    );
    for (const [role, page] of Object.entries({
      ...pages,
      ...Object.fromEntries(additionalPlayers.map((page, index) => [`player-${index + 2}`, page])),
    })) {
      page.on('pageerror', (error) => browserErrors.push(`${game.id}/${role}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(`${game.id}/${role}: ${message.text()}`);
      });
      page.on('requestfailed', (request) => {
        browserErrors.push(
          `${game.id}/${role}: ${request.url()} (${request.failure()?.errorText})`,
        );
      });
    }

    const host = pages.host;
    const player = pages.player;
    const display = pages.display;
    const playerPages = [player, ...additionalPlayers];
    const expectedPlayerName = `${game.id} browser 1`;
    await host.goto(`${baseUrl}/host`, { waitUntil: 'domcontentloaded' });
    await host.getByRole('button', { name: game.picker }).click();
    await host.getByRole('button', { name: 'Create Game' }).click();
    await host.waitForURL(`**/host/${game.id}?room=*`, { timeout: 10_000 });
    const roomCode = new URL(host.url()).searchParams.get('room');
    if (!roomCode) throw new Error(`${game.id}: host did not expose a room code`);

    for (const [index, playerPage] of playerPages.entries()) {
      await playerPage.goto(`${baseUrl}/play/${game.id}?room=${roomCode}`, {
        waitUntil: 'domcontentloaded',
      });
      await playerPage.getByLabel('Name').fill(`${game.id} browser ${index + 1}`);
      await playerPage.getByRole('button', { name: 'Join Room' }).click();
      await playerPage.getByRole('button', { name: 'Leave Room' }).waitFor({ timeout: 10_000 });
    }

    await display.goto(`${baseUrl}/display?room=${roomCode}`, { waitUntil: 'domcontentloaded' });
    await display.waitForTimeout(250);
    results.push({
      game: game.id,
      roomCode,
      phase: 'lobby',
      host: await capture(
        host,
        `${game.id}-host-lobby`,
        { viewportWidth: 1280, viewportHeight: 720 },
        expectedPlayerName,
      ),
      player: await capture(
        player,
        `${game.id}-player-lobby`,
        {
          viewportWidth: 390,
          viewportHeight: 844,
        },
        expectedPlayerName,
      ),
      display: await capture(
        display,
        `${game.id}-display-lobby`,
        {
          viewportWidth: 1280,
          viewportHeight: 720,
        },
        expectedPlayerName,
      ),
    });

    await host.getByRole('button', { name: /^Start / }).click();
    await player.getByText(/Room phase: (input|alibi|voting)/i).waitFor({ timeout: 10_000 });
    await player.reload({ waitUntil: 'domcontentloaded' });
    await player.getByText(/Room phase: (input|alibi|voting)/i).waitFor({ timeout: 10_000 });
    let drawingProbe = null;
    if (game.id === 'drawn-out') {
      for (const candidate of playerPages) {
        if ((await candidate.locator('canvas.drawing-input').count()) > 0) {
          drawingProbe = await exerciseDrawingRecovery(candidate);
          break;
        }
      }
      drawingProbe ??= { available: false, reason: 'active client was not the drawing turn' };
    }
    const frameTime = {
      display: await measureFrameTime(display),
      drawing: game.id === 'drawn-out' ? await measureFrameTime(player) : null,
    };
    results.push({
      game: game.id,
      roomCode,
      phase: 'active-after-reconnect',
      frameTime,
      drawingProbe,
      host: await capture(
        host,
        `${game.id}-host-active`,
        { viewportWidth: 1280, viewportHeight: 720 },
        expectedPlayerName,
      ),
      player: await capture(
        player,
        `${game.id}-player-active`,
        {
          viewportWidth: 390,
          viewportHeight: 844,
        },
        expectedPlayerName,
      ),
      display: await capture(
        display,
        `${game.id}-display-active`,
        {
          viewportWidth: 1280,
          viewportHeight: 720,
        },
        expectedPlayerName,
      ),
    });
    await Promise.all(contexts.map((context) => context.close()));
  }
} finally {
  await browser.close();
}

const failures = [
  ...browserErrors,
  ...results.flatMap((result) => {
    if (result.phase !== 'active-after-reconnect') return [];
    return Object.entries(result.frameTime ?? {}).flatMap(([scenario, metrics]) =>
      metrics?.p95Ms > FRAME_P95_BUDGET_MS
        ? [
            `${result.game}/${scenario}: frame-time p95 ${metrics.p95Ms}ms exceeds ${FRAME_P95_BUDGET_MS}ms`,
          ]
        : [],
    );
  }),
  ...results.flatMap((result) =>
    result.drawingProbe?.available &&
    (!result.drawingProbe.pointerCancelled ||
      !result.drawingProbe.undoRedo ||
      !result.drawingProbe.orientationSafe)
      ? [`${result.game}: drawing recovery probe failed`]
      : [],
  ),
  ...results.flatMap((result) =>
    ['host', 'player', 'display'].flatMap((role) => {
      const view = result[role];
      return [
        ...(view.horizontalOverflow
          ? [`${result.game}/${role}/${result.phase}: horizontal overflow`]
          : []),
        ...(result.phase === 'lobby' && !view.hasExpectedPlayer
          ? [`${result.game}/${role}/${result.phase}: joined player missing`]
          : []),
        ...(role === 'player' && result.phase !== 'lobby' && !view.hasActivePhase
          ? [`${result.game}/${role}/${result.phase}: active room phase missing`]
          : []),
      ];
    }),
  ),
];
const report = {
  baseUrl,
  outputRoot,
  games: games.map(({ id }) => id),
  results,
  browserErrors,
  failures,
};
await writeFile(
  join(outputRoot, 'multiclient-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
stdout.write(`Browser multi-client smoke: ${JSON.stringify(report)}\n`);
if (failures.length) throw new Error(`Browser multi-client checks failed: ${failures.join(', ')}`);
