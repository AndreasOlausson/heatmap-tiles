import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MAX_ZOOM, MIN_ZOOM } from './config.js';
import { getPointBounds } from './geometry.js';
import {
  loadRawSourcePoints,
  loadScenarioConfig,
  loadScenarioPoints,
  resolveInputPaths,
  type ResolvedInputPaths
} from './input-loader.js';
import { resolveValueScale } from './value-scale.js';
import type { LatLngBounds, PointsDataset } from './types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const outputDirectory = path.join(projectRoot, 'output');

export interface DatasetWriteOptions {
  outputDirectory?: string;
}

export interface DatasetWritePaths {
  canonicalDatasetPath: string;
  compatibilityDatasetPath: string;
}

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

export async function buildPointsDataset(
  resolvedInput: ResolvedInputPaths
): Promise<PointsDataset> {
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

  return {
    renderMode: config.renderMode ?? 'value',
    kernel: config.kernel,
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
}

export async function writePointsDataset(
  dataset: PointsDataset,
  options: DatasetWriteOptions = {}
): Promise<DatasetWritePaths> {
  const resolvedOutputDirectory = options.outputDirectory ?? outputDirectory;
  const canonicalDatasetPath = path.join(resolvedOutputDirectory, 'points.json');
  const compatibilityDatasetPath = path.join(resolvedOutputDirectory, 'sales.json');

  await mkdir(resolvedOutputDirectory, { recursive: true });
  const serializedDataset = `${JSON.stringify(dataset, null, 2)}\n`;
  await writeFile(canonicalDatasetPath, serializedDataset, 'utf8');
  await writeFile(compatibilityDatasetPath, serializedDataset, 'utf8');

  return {
    canonicalDatasetPath,
    compatibilityDatasetPath
  };
}

export async function generatePointsFromArgs(
  args: string[],
  options: DatasetWriteOptions = {}
): Promise<{
  dataset: PointsDataset;
  paths: DatasetWritePaths;
  resolvedInput: ResolvedInputPaths;
}> {
  const resolvedInput = resolveInputPaths(args);
  const dataset = await buildPointsDataset(resolvedInput);
  const paths = await writePointsDataset(dataset, options);

  return {
    dataset,
    paths,
    resolvedInput
  };
}

function isExecutedDirectly(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && pathToFileURL(path.resolve(entryPoint)).href === metaUrl;
}

async function main(): Promise<void> {
  const { dataset, paths, resolvedInput } = await generatePointsFromArgs(process.argv.slice(2));

  console.log(
    `Loaded ${
      resolvedInput.kind === 'raw' ? resolvedInput.sourcePath : resolvedInput.coordsPath
    } with ${resolvedInput.configPath} and wrote ${dataset.summary.count} points to ${paths.canonicalDatasetPath} ` +
      `(dataset ${dataset.summary.minValue}-${dataset.summary.maxValue}, render scale ${dataset.valueScale.mode} ` +
      `${dataset.valueScale.min}-${dataset.valueScale.max} ${dataset.metric.unit}).`
  );
}

if (isExecutedDirectly(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
