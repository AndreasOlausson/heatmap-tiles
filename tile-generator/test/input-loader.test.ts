import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { loadScenarioConfig } from '../src/input-loader.ts';
import { createTempDir, writeJson } from './helpers/test-io.ts';

test('loadScenarioConfig defaults kernel to gaussian when omitted', async (t) => {
  const tempDirectory = await createTempDir(t);
  const configPath = path.join(tempDirectory, 'config.json');

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

  const config = await loadScenarioConfig(configPath);
  assert.equal(config.renderMode, 'value');
  assert.equal(config.kernel, 'gaussian');
});

test('loadScenarioConfig accepts epanechnikov as kernel value', async (t) => {
  const tempDirectory = await createTempDir(t);
  const configPath = path.join(tempDirectory, 'config.json');

  await writeJson(configPath, {
    renderMode: 'density',
    kernel: 'epanechnikov',
    metric: {
      key: 'observations',
      label: 'Observations',
      unit: 'count'
    },
    valueScale: {
      min: 0,
      max: 5
    }
  });

  const config = await loadScenarioConfig(configPath);
  assert.equal(config.renderMode, 'density');
  assert.equal(config.kernel, 'epanechnikov');
});

test('loadScenarioConfig rejects invalid kernel values with a clear error', async (t) => {
  const tempDirectory = await createTempDir(t);
  const configPath = path.join(tempDirectory, 'config.json');

  await writeJson(configPath, {
    kernel: 'triangle',
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

  await assert.rejects(
    () => loadScenarioConfig(configPath),
    /config\.kernel.*gaussian.*epanechnikov/
  );
});
