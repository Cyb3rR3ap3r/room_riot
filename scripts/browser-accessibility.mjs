/* global CSS, document, setTimeout, window */

import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3100';
const routes = [
  '/',
  '/host',
  '/display',
  '/showcase',
  ...['groupthink', 'hot-take', 'suspect', 'drawn-out'].flatMap((gameId) => [
    `/host/${gameId}`,
    `/display/${gameId}`,
    `/play/${gameId}`,
  ]),
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

const auditPage = () => {
  const isVisible = (element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const accessibleName = (element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(attribute)?.trim();
      if (value) return value;
    }
    const id = element.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  };

  const unnamed = [
    ...document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="radio"], [role="switch"]',
    ),
  ]
    .filter(isVisible)
    .filter((element) => !accessibleName(element))
    .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`);

  const imagesWithoutAlt = [...document.images]
    .filter(isVisible)
    .filter((image) => !image.hasAttribute('alt') && image.getAttribute('role') !== 'presentation')
    .map((image) => image.getAttribute('src') ?? 'img');

  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

  return {
    unnamed,
    imagesWithoutAlt,
    duplicateIds,
    hasMain: Boolean(document.querySelector('main, [role="main"]')),
  };
};

await waitForHealth();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });
    try {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const audit = await page.evaluate(auditPage);
      results.push({
        route,
        status: response?.status() ?? null,
        audit,
        consoleErrors,
        failedResponses,
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const failures = results.flatMap(({ route, status, audit, consoleErrors, failedResponses }) => {
  const issues = [];
  if (status !== 200) issues.push(`status=${status}`);
  if (!audit.hasMain) issues.push('missing main landmark');
  if (audit.unnamed.length) issues.push(`unnamed controls: ${audit.unnamed.join(', ')}`);
  if (audit.imagesWithoutAlt.length)
    issues.push(`images without alt: ${audit.imagesWithoutAlt.join(', ')}`);
  if (audit.duplicateIds.length) issues.push(`duplicate ids: ${audit.duplicateIds.join(', ')}`);
  if (failedResponses.length) issues.push(`failed resources: ${failedResponses.join(' | ')}`);
  if (consoleErrors.length) issues.push(`console errors: ${consoleErrors.join(' | ')}`);
  return issues.map((issue) => `${route}: ${issue}`);
});

console.log(
  `Browser accessibility report: ${JSON.stringify({ baseUrl, routes: results, failures })}`,
);
if (failures.length) throw new Error(`Browser accessibility checks failed: ${failures.join('; ')}`);
