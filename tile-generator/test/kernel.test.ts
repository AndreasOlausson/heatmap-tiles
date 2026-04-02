import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveKernelWeight } from '../src/heatmap.ts';

test('resolveKernelWeight preserves gaussian behavior within and outside the cutoff', () => {
  assert.equal(resolveKernelWeight('gaussian', 0, 10, 2), 1);
  assert.ok(
    Math.abs(
      resolveKernelWeight('gaussian', 25, 10, 2) -
        Math.exp(-25 / (2 * 2 * 2))
    ) < 1e-12
  );
  assert.ok(resolveKernelWeight('gaussian', 100, 10, 2) > 0);
  assert.equal(resolveKernelWeight('gaussian', 101, 10, 2), 0);
});

test('resolveKernelWeight follows the epanechnikov formula and cutoff', () => {
  assert.equal(resolveKernelWeight('epanechnikov', 0, 10), 1);
  assert.equal(resolveKernelWeight('epanechnikov', 25, 10), 0.75);
  assert.ok(Math.abs(resolveKernelWeight('epanechnikov', 99, 10) - 0.01) < 1e-12);
  assert.equal(resolveKernelWeight('epanechnikov', 100, 10), 0);
  assert.equal(resolveKernelWeight('epanechnikov', 121, 10), 0);
});
