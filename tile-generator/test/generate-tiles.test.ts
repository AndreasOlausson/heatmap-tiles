import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  GAUSSIAN_RADIUS_PIXELS,
  GAUSSIAN_SIGMA_PIXELS,
  TILE_PADDING_PIXELS
} from '../src/config.ts';
import { generateTilesForDataset } from '../src/generate-tiles.ts';
import { createValueDataset } from './helpers/fixtures.ts';
import {
  collectDirectoryHashes,
  createTempDir,
  readJson
} from './helpers/test-io.ts';

test('generateTilesForDataset writes stable metadata and tile output for the baseline gaussian dataset', async (t) => {
  const tempDirectory = await createTempDir(t);
  const outputDirectory = path.join(tempDirectory, 'baseline-output');
  const { metadata, paths } = await generateTilesForDataset(createValueDataset(), {
    outputDirectory
  });

  assert.deepEqual(metadata.kernel, {
    sigmaPixels: GAUSSIAN_SIGMA_PIXELS,
    radiusPixels: GAUSSIAN_RADIUS_PIXELS,
    paddingPixels: TILE_PADDING_PIXELS
  });

  const metadataJson = await readJson<typeof metadata>(paths.metadataPath);
  assert.deepEqual(metadataJson, metadata);

  const hashes = await collectDirectoryHashes(outputDirectory);
  assert.deepEqual(hashes, {
    'metadata.json': 'ae2286746baf7082b7cbe6f74b686041bd40fe91a0944657d0a761ea62b067ec',
    'tiles/10/556/306.png': '428bd2434ba2a6128729006cd79a829bc7bf2559707dfb3886987ea4fafa4cc7'
  });
});

test('generateTilesForDataset is deterministic across repeated runs', async (t) => {
  const tempDirectory = await createTempDir(t);
  const firstOutputDirectory = path.join(tempDirectory, 'run-1');
  const secondOutputDirectory = path.join(tempDirectory, 'run-2');
  const dataset = createValueDataset();

  await generateTilesForDataset(dataset, {
    outputDirectory: firstOutputDirectory
  });
  await generateTilesForDataset(dataset, {
    outputDirectory: secondOutputDirectory
  });

  assert.deepEqual(
    await collectDirectoryHashes(firstOutputDirectory),
    await collectDirectoryHashes(secondOutputDirectory)
  );
});
