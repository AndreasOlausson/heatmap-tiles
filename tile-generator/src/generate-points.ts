import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_ZOOM, MIN_ZOOM } from './config.js';
import { getPointBounds } from './geometry.js';
import {
  loadRawSourcePoints,
  loadScenarioConfig,
  loadScenarioPoints,
  resolveInputPaths
} from './input-loader.js';
import { resolveValueScale } from './value-scale.js';
import type { LatLngBounds, PointsDataset } from './types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const outputDirectory = path.join(projectRoot, 'output');
const canonicalDatasetPath = path.join(outputDirectory, 'points.json');
const compatibilityDatasetPath = path.join(outputDirectory, 'sales.json');

function assertPointsInsideBounds(
  points: PointsDataset['points'],
  bounds: LatLngBounds
): void {
  for (const point of points) {
    if (
      point.latitude < bounds.south ||
      point.latitude > bounds.north ||
      point.longitude < bounds.west ||
      point.longitude > bounds.east
    ) {
      throw new Error(
        `Point ${point.id} is outside the configured bounds in config.json.`
      );
    }
  }
}

async function main(): Promise<void> {
  const resolvedInput = resolveInputPaths(process.argv.slice(2));
  const config = await loadScenarioConfig(resolvedInput.configPath);
  const points =
    resolvedInput.kind === 'raw'
      ? await loadRawSourcePoints(resolvedInput.sourcePath, resolvedInput.adapter)
      : await loadScenarioPoints(resolvedInput.coordsPath, config.renderMode ?? 'value');

  if (resolvedInput.kind === 'raw' && resolvedInput.adapter === 'birds') {
    if (config.renderMode !== 'density') {
      throw new Error('Bird raw import requires config.renderMode = "density".');
    }
  }

  if (config.bounds) {
    assertPointsInsideBounds(points, config.bounds);
  }

  const values = points.map((point) => point.value);
  const totalValue = values.reduce((sum, value) => sum + value, 0);

  const dataset: PointsDataset = {
    renderMode: config.renderMode ?? 'value',
    metric: config.metric,
    valueScale: resolveValueScale(config.valueScale, values),
    regionBounds:
      config.bounds ??
      getPointBounds(points.map((point) => [point.longitude, point.latitude])),
    zoom: config.zoom ?? {
      min: MIN_ZOOM,
      max: MAX_ZOOM
    },
    summary: {
      count: points.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      meanValue: Math.round(totalValue / points.length)
    },
    points
  };

  await mkdir(outputDirectory, { recursive: true });
  const serializedDataset = `${JSON.stringify(dataset, null, 2)}\n`;
  await writeFile(canonicalDatasetPath, serializedDataset, 'utf8');
  await writeFile(compatibilityDatasetPath, serializedDataset, 'utf8');

  console.log(
    `Loaded ${
      resolvedInput.kind === 'raw' ? resolvedInput.sourcePath : resolvedInput.coordsPath
    } with ${resolvedInput.configPath} and wrote ${dataset.summary.count} points to ${canonicalDatasetPath} ` +
      `(dataset ${dataset.summary.minValue}-${dataset.summary.maxValue}, render scale ${dataset.valueScale.mode} ` +
      `${dataset.valueScale.min}-${dataset.valueScale.max} ${dataset.metric.unit}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
