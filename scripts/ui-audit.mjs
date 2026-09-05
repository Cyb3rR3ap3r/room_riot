/* global setTimeout */

/**
 * Room Riot UI audit.
 *
 * Walks every public route across a matrix of real device viewports and reports
 * layout defects that make the product feel unfinished: horizontal overflow,
 * clipped text, undersized tap targets, overlapping controls, broken images and
 * off-canvas content. Screenshots are written next to the JSON report so the
 * findings can be reviewed visually.
 *
 * Usage: node scripts/ui-audit.mjs [baseUrl] [outputDir]
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditPage } from './ui-audit-checks.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3000';
const outputRoot = process.argv[3] ?? join(process.cwd(), '.ui-audit');
const only = process.env.AUDIT_ONLY ?? '';

const VIEWPORTS = [
  { label: 'phone-360', width: 360, height: 640, touch: true },
  { label: 'phone-390', width: 390, height: 844, touch: true },
  { label: 'phone-430', width: 430, height: 932, touch: true },
  { label: 'phone-landscape', width: 844, height: 390, touch: true },
  { label: 'tablet-768', width: 768, height: 1024, touch: true },
  { label: 'laptop-1280', width: 1280, height: 720, touch: false },
  { label: 'laptop-1440', width: 1440, height: 900, touch: false },
  { label: 'desktop-1920', width: 1920, height: 1080, touch: false },
];

const GAMES = ['groupthink', 'hot-take', 'suspect', 'drawn-out', 'blank-line', 'wavelength'];

const ROUTES = [
  { label: 'home', path: '/' },
  { label: 'host', path: '/host' },
  { label: 'play', path: '/play' },
  { label: 'display', path: '/display' },
  { label: 'showcase', path: '/showcase' },
  ...GAMES.map((game) => ({ label: `host-${game}`, path: `/host/${game}` })),
  ...GAMES.map((game) => ({ label: `play-${game}`, path: `/play/${game}` })),
];

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      /* server still booting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become healthy at ${baseUrl}`);
};

await mkdir(outputRoot, { recursive: true });
await waitForHealth();

const browser = await chromium.launch({ headless: true });
const report = [];
let totalDefects = 0;

try {
  for (const route of ROUTES) {
    if (only && !route.label.includes(only)) continue;
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.touch,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
      });
      page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));
      try {
        await page.goto(`${baseUrl}${route.path}`, {
          waitUntil: 'networkidle',
          timeout: 20_000,
        });
        await page.waitForTimeout(350);
        const result = await page.evaluate(auditPage);
        const shot = join(outputRoot, `${route.label}__${viewport.label}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        totalDefects += result.defects.length;
        report.push({
          route: route.label,
          path: route.path,
          screenshot: shot,
          consoleErrors,
          ...result,
          viewport: viewport.label,
          viewportSize: result.viewport,
        });
      } catch (error) {
        report.push({
          route: route.label,
          path: route.path,
          viewport: viewport.label,
          error: String(error).slice(0, 300),
          defects: [],
          consoleErrors,
        });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const reportPath = join(outputRoot, 'report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2));

// Aggregate summary for the console.
const byType = new Map();
for (const entry of report) {
  for (const defect of entry.defects ?? []) {
    const bucket = byType.get(defect.type) ?? [];
    bucket.push({ route: entry.route, viewport: entry.viewport, ...defect });
    byType.set(defect.type, bucket);
  }
}

console.log(`\nUI audit — ${report.length} route/viewport combinations, ${totalDefects} defects\n`);
for (const [type, items] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${type}: ${items.length}`);
  const sample = new Map();
  for (const item of items) {
    const key = item.element;
    if (!sample.has(key)) sample.set(key, []);
    sample.get(key).push(`${item.route}@${item.viewport}`);
  }
  for (const [element, where] of [...sample.entries()].slice(0, 12)) {
    console.log(`   ${element}  [${where.length}x] e.g. ${where.slice(0, 3).join(', ')}`);
  }
  if (sample.size > 12) console.log(`   … ${sample.size - 12} more distinct elements`);
  console.log('');
}

const routeErrors = report.filter((entry) => entry.error);
if (routeErrors.length) {
  console.log('Route errors:');
  for (const entry of routeErrors) {
    console.log(`   ${entry.route}@${entry.viewport}: ${entry.error}`);
  }
}

const consoleIssues = report.filter((entry) => (entry.consoleErrors ?? []).length);
if (consoleIssues.length) {
  console.log(`\nConsole errors on ${consoleIssues.length} combinations:`);
  const uniq = new Set();
  for (const entry of consoleIssues) for (const line of entry.consoleErrors) uniq.add(line);
  for (const line of [...uniq].slice(0, 15)) console.log(`   ${line}`);
}

console.log(`\nReport: ${reportPath}`);
