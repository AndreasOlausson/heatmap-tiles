import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PNG } from 'pngjs';

import {
  FULL_SUPPORT_WEIGHT,
  GAUSSIAN_RADIUS_PIXELS,
  GAUSSIAN_SIGMA_PIXELS,
  MIN_SUPPORT_WEIGHT,
  REGION_PADDING_METERS,
  TILE_WRITE_CONCURRENCY,
  TILE_PADDING_PIXELS,
  TILE_SIZE,
  TILES_PATH_TEMPLATE
} from './config.js';
import { PALETTE_STOPS } from './color-ramp.js';
import { expandBoundsByMeters, getBoundsCenter } from './geometry.js';
import { renderHeatmapTile, type ProjectedPointSample } from './heatmap.js';
import { projectLngLatToWorldPixels, boundsToTileRange } from './mercator.js';
import type { HeatmapMetadata, PointsDataset, TileRange } from './types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const outputDirectory = path.join(projectRoot, 'output');
const tilesDirectory = path.join(outputDirectory, 'tiles');
const datasetPath = path.join(outputDirectory, 'points.json');
const metadataPath = path.join(outputDirectory, 'metadata.json');

function createBlankTileBuffer(): Buffer {
  const png = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  png.data = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  return PNG.sync.write(png);
}

interface TileJob {
  tileX: number;
  tileY: number;
  tilePath: string;
}

export interface GenerateTilesOptions {
  outputDirectory?: string;
  logger?: (message: string) => void;
}

export interface GenerateTilesPaths {
  metadataPath: string;
  tilesDirectory: string;
}

async function writeTile(tilePath: string, rgba: Uint8Array): Promise<void> {
  const png = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  png.data = Buffer.from(rgba);
  await writeFile(tilePath, PNG.sync.write(png));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const runnerCount = Math.max(1, Math.min(concurrency, items.length));

  const runners = Array.from({ length: runnerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
}

export async function loadPointsDataset(
  pointsDatasetPath: string
): Promise<PointsDataset> {
  const datasetJson = await readFile(pointsDatasetPath, 'utf8');
  return JSON.parse(datasetJson) as PointsDataset;
}

export async function generateTilesForDataset(
  dataset: PointsDataset,
  options: GenerateTilesOptions = {}
): Promise<{
  metadata: HeatmapMetadata;
  paths: GenerateTilesPaths;
}> {
  const resolvedOutputDirectory = options.outputDirectory ?? outputDirectory;
  const resolvedTilesDirectory = path.join(resolvedOutputDirectory, 'tiles');
  const resolvedMetadataPath = path.join(resolvedOutputDirectory, 'metadata.json');
  const logger = options.logger ?? (() => {});

  const expandedBounds = expandBoundsByMeters(dataset.regionBounds, REGION_PADDING_METERS);
  const center = getBoundsCenter(expandedBounds);
  const transparentTile = createBlankTileBuffer();
  const tileRanges: Record<string, TileRange> = {};

  await mkdir(resolvedTilesDirectory, { recursive: true });

  for (let zoom = dataset.zoom.min; zoom <= dataset.zoom.max; zoom += 1) {
    const projectedPoints: ProjectedPointSample[] = dataset.points.map((point) => {
      const worldPixel = projectLngLatToWorldPixels(
        point.longitude,
        point.latitude,
        zoom,
        TILE_SIZE
      );

      return {
        point,
        worldX: worldPixel.x,
        worldY: worldPixel.y
      };
    });

    const tileRange = boundsToTileRange(expandedBounds, zoom, TILE_SIZE);
    tileRanges[String(zoom)] = tileRange;
    const zoomDirectory = path.join(resolvedTilesDirectory, String(zoom));
    await mkdir(zoomDirectory, { recursive: true });

    const tileJobs: TileJob[] = [];
    for (let tileX = tileRange.minX; tileX <= tileRange.maxX; tileX += 1) {
      const tileColumnDirectory = path.join(zoomDirectory, String(tileX));
      await mkdir(tileColumnDirectory, { recursive: true });

      for (let tileY = tileRange.minY; tileY <= tileRange.maxY; tileY += 1) {
        tileJobs.push({
          tileX,
          tileY,
          tilePath: path.join(tileColumnDirectory, `${tileY}.png`)
        });
      }
    }

    await runWithConcurrency(tileJobs, TILE_WRITE_CONCURRENCY, async (job) => {
      const renderedTile = renderHeatmapTile(projectedPoints, {
        tileX: job.tileX,
        tileY: job.tileY,
        renderMode: dataset.renderMode,
        valueScale: dataset.valueScale
      });

      if (renderedTile.nonTransparentPixelCount === 0) {
        await writeFile(job.tilePath, transparentTile);
        return;
      }

      await writeTile(job.tilePath, renderedTile.rgba);
    });

    logger(`Zoom ${zoom}: wrote ${tileJobs.length} tiles.`);
  }

  const metadata: HeatmapMetadata = {
    renderMode: dataset.renderMode,
    bounds: expandedBounds,
    center,
    zoom: {
      min: dataset.zoom.min,
      max: dataset.zoom.max
    },
    tileSize: TILE_SIZE,
    tilesPath: TILES_PATH_TEMPLATE,
    pointsPath: 'points.json',
    kernel: {
      sigmaPixels: GAUSSIAN_SIGMA_PIXELS,
      radiusPixels: GAUSSIAN_RADIUS_PIXELS,
      paddingPixels: TILE_PADDING_PIXELS
    },
    confidence: {
      transparentBelowWeight: MIN_SUPPORT_WEIGHT,
      mostlyOpaqueAtWeight: FULL_SUPPORT_WEIGHT
    },
    metric: dataset.metric,
    valueScale: {
      ...dataset.valueScale,
      datasetMin: dataset.summary.minValue,
      datasetMax: dataset.summary.maxValue
    },
    legend: {
      paletteStops: PALETTE_STOPS
    },
    tileRanges
  };

  await writeFile(resolvedMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return {
    metadata,
    paths: {
      metadataPath: resolvedMetadataPath,
      tilesDirectory: resolvedTilesDirectory
    }
  };
}

export async function generateTilesFromDatasetPath(
  pointsDatasetPath: string,
  options: GenerateTilesOptions = {}
): Promise<{
  metadata: HeatmapMetadata;
  paths: GenerateTilesPaths;
}> {
  const dataset = await loadPointsDataset(pointsDatasetPath);
  return generateTilesForDataset(dataset, options);
}

function isExecutedDirectly(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && pathToFileURL(path.resolve(entryPoint)).href === metaUrl;
}

async function main(): Promise<void> {
  const result = await generateTilesFromDatasetPath(datasetPath, {
    outputDirectory,
    logger: (message) => console.log(message)
  });
  console.log(`Wrote tile metadata to ${result.paths.metadataPath}.`);
}

if (isExecutedDirectly(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
