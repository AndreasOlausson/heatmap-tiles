import assert from 'node:assert/strict';
import test from 'node:test';

import { renderHeatmapTile } from '../src/heatmap.ts';
import { createProjectedPointSample } from './helpers/fixtures.ts';
import { sha256 } from './helpers/test-io.ts';

test('renderHeatmapTile keeps a stable gaussian value-mode raster for a centered sample', () => {
  const renderedTile = renderHeatmapTile(
    [createProjectedPointSample(50)],
    {
      tileX: 0,
      tileY: 0,
      renderMode: 'value',
      kernel: 'gaussian',
      valueScale: {
        min: 0,
        max: 100
      }
    }
  );

  assert.equal(renderedTile.maxSupportWeight, 1);
  assert.equal(renderedTile.nonTransparentPixelCount, 7685);
  assert.equal(
    sha256(renderedTile.rgba),
    '2a64648e3285667723efc24aacc7b90e778d50b9f3cd4f3607801a3956577159'
  );
});

test('renderHeatmapTile keeps a stable gaussian density-mode raster for overlapping samples', () => {
  const renderedTile = renderHeatmapTile(
    [
      createProjectedPointSample(1, 128.5, 128.5, 'point-0001'),
      createProjectedPointSample(3, 140.5, 128.5, 'point-0002')
    ],
    {
      tileX: 0,
      tileY: 0,
      renderMode: 'density',
      kernel: 'gaussian',
      valueScale: {
        min: 0,
        max: 4
      }
    }
  );

  assert.equal(Number(renderedTile.maxSupportWeight.toFixed(6)), 1.926986);
  assert.equal(renderedTile.nonTransparentPixelCount, 10037);
  assert.equal(
    sha256(renderedTile.rgba),
    '0d430a28cc89bfebf134ec763b2653ce04690ca2e5de4cdd9d68f3e4d8a98baf'
  );
});

test('renderHeatmapTile leaves tiles fully transparent when all samples are outside the cutoff', () => {
  const renderedTile = renderHeatmapTile(
    [createProjectedPointSample(50, 500.5, 500.5)],
    {
      tileX: 0,
      tileY: 0,
      renderMode: 'value',
      kernel: 'gaussian',
      valueScale: {
        min: 0,
        max: 100
      }
    }
  );

  assert.equal(renderedTile.maxSupportWeight, 0);
  assert.equal(renderedTile.nonTransparentPixelCount, 0);
  assert.equal(
    sha256(renderedTile.rgba),
    '8a39d2abd3999ab73c34db2476849cddf303ce389b35826850f9a700589b4a90'
  );
});

test('renderHeatmapTile keeps a stable epanechnikov value-mode raster for a centered sample', () => {
  const renderedTile = renderHeatmapTile(
    [createProjectedPointSample(50)],
    {
      tileX: 0,
      tileY: 0,
      renderMode: 'value',
      kernel: 'epanechnikov',
      valueScale: {
        min: 0,
        max: 100
      }
    }
  );

  assert.equal(renderedTile.maxSupportWeight, 1);
  assert.equal(renderedTile.nonTransparentPixelCount, 12605);
  assert.equal(
    sha256(renderedTile.rgba),
    '41383905ee6cc0f5941bfaf2ea7b56348a6090b54172410bc43ad69c19930bb0'
  );
});

test('renderHeatmapTile keeps a stable epanechnikov density-mode raster for overlapping samples', () => {
  const renderedTile = renderHeatmapTile(
    [
      createProjectedPointSample(1, 128.5, 128.5, 'point-0001'),
      createProjectedPointSample(3, 140.5, 128.5, 'point-0002')
    ],
    {
      tileX: 0,
      tileY: 0,
      renderMode: 'density',
      kernel: 'epanechnikov',
      valueScale: {
        min: 0,
        max: 4
      }
    }
  );

  assert.equal(Number(renderedTile.maxSupportWeight.toFixed(6)), 1.983471);
  assert.equal(renderedTile.nonTransparentPixelCount, 14163);
  assert.equal(
    sha256(renderedTile.rgba),
    '33b57122a93c07b4218928d97e968ccda1f6a196c8adb9c2a3bfcfd53b0ab67a'
  );
});
