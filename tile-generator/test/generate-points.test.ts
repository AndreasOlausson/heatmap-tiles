import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { MAX_ZOOM, MIN_ZOOM } from '../src/config.ts';
import {
  buildPointsDataset,
  writePointsDataset
} from '../src/generate-points.ts';
import type { PointsDataset } from '../src/types.ts';
import { createTempDir, writeJson } from './helpers/test-io.ts';

test('buildPointsDataset defaults to value mode and derives bounds and zoom', async (t) => {
  const tempDirectory = await createTempDir(t);
  const scenarioDirectory = path.join(tempDirectory, 'scenario');
  const coordsPath = path.join(scenarioDirectory, 'coords.json');
  const configPath = path.join(scenarioDirectory, 'config.json');

  await writeJson(configPath, {
    metric: {
      key: 'price',
      label: 'Price',
      unit: 'SEK'
    },
    valueScale: {
      min: 0,
      max: 100
    }
  });
  await writeJson(coordsPath, [
    {
      id: 'alpha',
      latitude: 58.4,
      longitude: 15.6,
      value: 10
    },
    {
      id: 'beta',
      lat: 58.41,
      lng: 15.62,
      value: 40
    }
  ]);

  const dataset = await buildPointsDataset({
    kind: 'scenario',
    coordsPath,
    configPath
  });

  assert.equal(dataset.renderMode, 'value');
  assert.deepEqual(dataset.regionBounds, {
    south: 58.4,
    west: 15.6,
    north: 58.41,
    east: 15.62
  });
  assert.deepEqual(dataset.zoom, {
    min: MIN_ZOOM,
    max: MAX_ZOOM
  });
  assert.deepEqual(dataset.summary, {
    count: 2,
    minValue: 10,
    maxValue: 40,
    meanValue: 25
  });
  assert.deepEqual(dataset.valueScale.thresholds, [0, 25, 50, 75, 100]);
});

test('buildPointsDataset aggregates bird observations in density mode', async (t) => {
  const tempDirectory = await createTempDir(t);
  const rawSourcePath = path.join(tempDirectory, 'birds.json');
  const configPath = path.join(tempDirectory, 'config.json');

  await writeJson(rawSourcePath, [
    { latitude: 58.4, longitude: 15.6 },
    { lat: 58.4, lng: 15.6 },
    { latitude: 58.401, longitude: 15.602 }
  ]);
  await writeJson(configPath, {
    renderMode: 'density',
    metric: {
      key: 'observations',
      label: 'Observations',
      unit: 'count'
    },
    valueScale: {
      min: 0,
      max: 3
    }
  });

  const dataset = await buildPointsDataset({
    kind: 'raw',
    sourcePath: rawSourcePath,
    configPath,
    adapter: 'birds'
  });

  assert.equal(dataset.renderMode, 'density');
  assert.equal(dataset.summary.count, 2);
  assert.deepEqual(
    dataset.points.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      value: point.value
    })),
    [
      { latitude: 58.4, longitude: 15.6, value: 2 },
      { latitude: 58.401, longitude: 15.602, value: 1 }
    ]
  );
});

test('buildPointsDataset enforces density mode for bird raw imports', async (t) => {
  const tempDirectory = await createTempDir(t);
  const rawSourcePath = path.join(tempDirectory, 'birds.json');
  const configPath = path.join(tempDirectory, 'config.json');

  await writeJson(rawSourcePath, [{ latitude: 58.4, longitude: 15.6 }]);
  await writeJson(configPath, {
    renderMode: 'value',
    metric: {
      key: 'observations',
      label: 'Observations',
      unit: 'count'
    },
    valueScale: {
      min: 0,
      max: 3
    }
  });

  await assert.rejects(
    () =>
      buildPointsDataset({
        kind: 'raw',
        sourcePath: rawSourcePath,
        configPath,
        adapter: 'birds'
      }),
    /Bird raw import requires config\.renderMode = "density"\./
  );
});

test('writePointsDataset writes identical canonical and compatibility datasets', async (t) => {
  const tempDirectory = await createTempDir(t);
  const outputDirectory = path.join(tempDirectory, 'output');
  const dataset: PointsDataset = {
    renderMode: 'value',
    metric: {
      key: 'value',
      label: 'Value',
      unit: 'u'
    },
    valueScale: {
      mode: 'manual',
      min: 0,
      max: 10,
      thresholds: [0, 2.5, 5, 7.5, 10]
    },
    regionBounds: {
      south: 58.4,
      west: 15.6,
      north: 58.41,
      east: 15.62
    },
    zoom: {
      min: 10,
      max: 10
    },
    summary: {
      count: 1,
      minValue: 7,
      maxValue: 7,
      meanValue: 7
    },
    points: [
      {
        id: 'point-0001',
        latitude: 58.4,
        longitude: 15.6,
        value: 7
      }
    ]
  };

  const { canonicalDatasetPath, compatibilityDatasetPath } = await writePointsDataset(dataset, {
    outputDirectory
  });
  const canonicalJson = await readFile(canonicalDatasetPath, 'utf8');
  const compatibilityJson = await readFile(compatibilityDatasetPath, 'utf8');

  assert.equal(canonicalJson, compatibilityJson);
  assert.deepEqual(JSON.parse(canonicalJson), dataset);
});
