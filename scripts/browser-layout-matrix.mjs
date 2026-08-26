/* global document, getComputedStyle, setTimeout, window */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stdout } from 'node:process';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3100';
const outputRoot = process.argv[3] ?? join(tmpdir(), 'room-riot-browser-layout');
const viewports = [
  ['phone-portrait-360x640', 360, 640],
  ['phone-portrait-390x844', 390, 844],
  ['phone-landscape-844x390', 844, 390],
  ['display-1280x720', 1280, 720],
  ['display-1920x1080', 1920, 1080],
  ['display-3840x2160', 3840, 2160],
];

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

await mkdir(outputRoot, { recursive: true });
await waitForHealth();
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const [label, width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/host`, { waitUntil: 'networkidle' });
    const screenshot = join(outputRoot, `${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const result = await page.evaluate(
      ({ viewportWidth, viewportHeight }) => {
        const images = [...document.querySelectorAll('img')];
        const createGame = [...document.querySelectorAll('button')].find((button) =>
          /create game/i.test(button.textContent ?? ''),
        );
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        );
        return {
          viewport: { width: viewportWidth, height: viewportHeight },
          documentWidth,
          horizontalOverflow: documentWidth > viewportWidth + 1,
          primaryControlPresent: Boolean(createGame && createGame.textContent?.trim()),
          imagesWithoutAlt: images.filter((image) => !image.getAttribute('alt')?.trim()).length,
          imageCount: images.length,
        };
      },
      { viewportWidth: width, viewportHeight: height },
    );
    results.push({ kind: 'host', label, screenshot, ...result });
    await page.close();
  }

  for (const scenario of [
    { label: 'player-large-text-200-percent', width: 390, height: 844, largeText: true },
    { label: 'player-virtual-keyboard-height', width: 390, height: 480, keyboard: true },
    { label: 'player-safe-area-touch', width: 390, height: 844, safeArea: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/play/groupthink`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Join Room' }).waitFor({ timeout: 10_000 });
    if (scenario.largeText) {
      await page.evaluate(() =>
        document.documentElement.setAttribute('data-room-riot-text-scale', '2'),
      );
    }
    if (scenario.keyboard) {
      await page.getByLabel('Name').fill('Keyboard check');
      await page.getByLabel('Name').focus();
      await page
        .getByRole('button', { name: 'Join Room' })
        .evaluate((button) => button.scrollIntoView({ block: 'center', inline: 'nearest' }));
    }
    const screenshot = join(outputRoot, `${scenario.label}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const result = await page.evaluate(
      ({ checkSafeArea }) => {
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        );
        const actualWidth = window.innerWidth;
        const actualHeight = window.innerHeight;
        const nameInput = document.querySelector('input');
        const joinButton = [...document.querySelectorAll('button')].find((button) =>
          /join room/i.test(button.textContent ?? ''),
        );
        const criticalControls = [nameInput, joinButton].filter(Boolean).map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            hidden: style.display === 'none' || style.visibility === 'hidden',
          };
        });
        return {
          viewport: { width: actualWidth, height: actualHeight },
          documentWidth,
          horizontalOverflow: documentWidth > actualWidth + 1,
          criticalControlsUsable: criticalControls.every(
            (control) => control.width > 0 && control.height > 0 && !control.hidden,
          ),
          primaryControlVisible: criticalControls.at(-1)
            ? criticalControls.at(-1).bottom > 0 && criticalControls.at(-1).top < actualHeight
            : false,
          safeAreaToken: checkSafeArea
            ? getComputedStyle(document.documentElement)
                .getPropertyValue('--space-safe-bottom')
                .trim()
            : null,
        };
      },
      { checkSafeArea: scenario.safeArea },
    );
    results.push({
      kind: 'responsive',
      scenario: scenario.label,
      screenshot,
      ...result,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.flatMap((result) => [
  ...(result.horizontalOverflow ? [`${result.label ?? result.scenario}: horizontal overflow`] : []),
  ...(result.kind === 'host' && !result.primaryControlPresent
    ? [`${result.label}: primary control missing`]
    : []),
  ...(result.kind === 'host' && result.imagesWithoutAlt
    ? [`${result.label}: ${result.imagesWithoutAlt} images lack alt text`]
    : []),
  ...(result.kind === 'responsive' && !result.criticalControlsUsable
    ? [`${result.scenario}: critical controls are hidden or have no usable size`]
    : []),
  ...(result.scenario === 'player-virtual-keyboard-height' && !result.primaryControlVisible
    ? [`${result.scenario}: Join Room is not visible after keyboard-height resize`]
    : []),
  ...(result.scenario === 'player-safe-area-touch' && !result.safeAreaToken
    ? [`${result.scenario}: safe-area token is not present`]
    : []),
]);
const report = { baseUrl, outputRoot, results, failures };
await writeFile(join(outputRoot, 'layout-report.json'), `${JSON.stringify(report, null, 2)}\n`);
stdout.write(`Browser layout matrix: ${JSON.stringify(report)}\n`);
if (failures.length) throw new Error(`Browser layout checks failed: ${failures.join(', ')}`);
