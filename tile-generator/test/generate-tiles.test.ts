import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  GAUSSIAN_RADIUS_PIXELS,
  GAUSSIAN_SIGMA_PIXELS,
  TILE_PADDING_PIXELS
} from '../src/config.ts';
import {
  generateTilesForDataset,
  generateTilesFromDatasetPath
} from '../src/generate-tiles.ts';
import { generatePointsFromArgs } from '../src/generate-points.ts';
import { createValueDataset } from './helpers/fixtures.ts';
import {
  collectDirectoryHashes,
  createTempDir,
  readJson,
  writeJson
} from './helpers/test-io.ts';

test('generateTilesForDataset writes stable metadata and tile output for the baseline gaussian dataset', async (t) => {
  const tempDirectory = await createTempDir(t);
  const outputDirectory = path.join(tempDirectory, 'baseline-output');
  const { metadata, paths } = await generateTilesForDataset(createValueDataset(), {
    outputDirectory
  });

  assert.deepEqual(metadata.kernel, {
    type: 'gaussian',
    sigmaPixels: GAUSSIAN_SIGMA_PIXELS,
    radiusPixels: GAUSSIAN_RADIUS_PIXELS,
    paddingPixels: TILE_PADDING_PIXELS
  });

  const metadataJson = await readJson<typeof metadata>(paths.metadataPath);
  assert.deepEqual(metadataJson, metadata);

  const hashes = await collectDirectoryHashes(outputDirectory);
  assert.deepEqual(hashes, {
    'metadata.json': '341404adebd84c4b1dbfd040520394e7f766a1344230062e05eac9f76ae1c3aa',
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

test('generateTilesForDataset is deterministic across repeated epanechnikov runs', async (t) => {
  const tempDirectory = await createTempDir(t);
  const firstOutputDirectory = path.join(tempDirectory, 'epanechnikov-run-1');
  const secondOutputDirectory = path.join(tempDirectory, 'epanechnikov-run-2');
  const dataset = createValueDataset('epanechnikov');

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

test('generate:points -> points.json -> generate:tiles carries kernel through the pipeline', async (t) => {
  const tempDirectory = await createTempDir(t);
  const coordinates = [
    {
      id: 'point-0001',
      latitude: 58.4108,
      longitude: 15.6214,
      value: 20
    },
    {
      id: 'point-0002',
      latitude: 58.4118,
      longitude: 15.6241,
      value: 80
    }
  ];

  async function runScenario(kernel: 'gaussian' | 'epanechnikov') {
    const scenarioDirectory = path.join(tempDirectory, kernel);
    const pointsOutputDirectory = path.join(tempDirectory, `${kernel}-points-output`);
    const tilesOutputDirectory = path.join(tempDirectory, `${kernel}-tiles-output`);

    await writeJson(path.join(scenarioDirectory, 'coords.json'), coordinates);
    await writeJson(path.join(scenarioDirectory, 'config.json'), {
      renderMode: 'value',
      kernel,
      metric: {
        key: 'synthetic_value',
        label: 'Synthetic Value',
        unit: 'u'
      },
      valueScale: {
        min: 0,
        max: 100
      },
      zoom: {
        min: 10,
        max: 10
      },
      bounds: {
        south: 58.4108,
        west: 15.6214,
        north: 58.4118,
        east: 15.6241
      }
    });

    const generatedPoints = await generatePointsFromArgs(
      ['--scenario', scenarioDirectory],
      { outputDirectory: pointsOutputDirectory }
    );
    const generatedTiles = await generateTilesFromDatasetPath(
      generatedPoints.paths.canonicalDatasetPath,
      { outputDirectory: tilesOutputDirectory }
    );

    return {
      pointsJson: await readJson<{ kernel: 'gaussian' | 'epanechnikov' }>(
        generatedPoints.paths.canonicalDatasetPath
      ),
      tileHashes: await collectDirectoryHashes(tilesOutputDirectory),
      metadata: generatedTiles.metadata
    };
  }

  const gaussianRun = await runScenario('gaussian');
  const epanechnikovRun = await runScenario('epanechnikov');

  assert.equal(gaussianRun.pointsJson.kernel, 'gaussian');
  assert.equal(epanechnikovRun.pointsJson.kernel, 'epanechnikov');
  assert.equal(gaussianRun.metadata.kernel.type, 'gaussian');
  assert.equal(epanechnikovRun.metadata.kernel.type, 'epanechnikov');
  assert.notDeepEqual(gaussianRun.tileHashes, epanechnikovRun.tileHashes);
});
