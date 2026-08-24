import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SupportedGameIdSchema } from '@room-riot/contracts';

import {
  GAME_PAGE_ROUTES,
  GAME_REGISTRY_METADATA,
  ServerGameRegistry,
  validateGameRegistry,
} from './game-registry.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('registers a complete package adapter and operational manifest for every supported game', () => {
  assert.doesNotThrow(() => validateGameRegistry());
  assert.deepEqual(
    Object.keys(GAME_REGISTRY_METADATA).sort(),
    [...SupportedGameIdSchema.options].sort(),
  );
  assert.equal(new Set(GAME_PAGE_ROUTES).size, SupportedGameIdSchema.options.length * 3);

  const registry = new ServerGameRegistry();
  for (const gameId of SupportedGameIdSchema.options) {
    const metadata = registry.metadata(gameId);
    assert.equal(metadata.id, gameId);
    assert.equal(metadata.packageName, `@room-riot/${gameId}`);
    assert.ok(metadata.contentModes.includes('family'));
    assert.ok(metadata.contentModes.includes('standard'));
    assert.ok(metadata.contentModes.includes('after-dark'));
    assert.ok(Object.keys(metadata.durationsMs).length > 0);
    assert.ok(Object.values(metadata.durationsMs).every((duration) => duration > 0));
    assert.deepEqual(Object.values(metadata.routes), [
      `/host/${gameId}`,
      `/display/${gameId}`,
      `/play/${gameId}`,
    ]);
  }
});

test('registry metadata validates client, server dependency, and Docker integration surfaces', () => {
  const clientCatalog = readFileSync(resolve(projectRoot, 'apps/web/src/app/catalog.ts'), 'utf8');
  const serverPackage = JSON.parse(
    readFileSync(resolve(projectRoot, 'apps/server/package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
  };
  const dockerfile = readFileSync(resolve(projectRoot, 'Dockerfile'), 'utf8');

  for (const metadata of Object.values(GAME_REGISTRY_METADATA)) {
    assert.match(clientCatalog, new RegExp(`id: ['"]${metadata.integration.clientCatalogId}['"]`));
    assert.equal(serverPackage.dependencies?.[metadata.packageName], 'workspace:*');
    assert.match(
      dockerfile,
      new RegExp(`COPY ${metadata.integration.workspacePath}/package\\.json`),
    );
    assert.match(dockerfile, new RegExp(`${metadata.integration.workspacePath}/dist`));
    assert.match(dockerfile, new RegExp(`${metadata.integration.workspacePath}/content`));
  }
});
