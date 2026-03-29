import {
  FULL_SUPPORT_WEIGHT,
  GAUSSIAN_RADIUS_PIXELS,
  GAUSSIAN_SIGMA_PIXELS,
  MAX_ALPHA,
  MIN_SUPPORT_WEIGHT,
  TILE_PADDING_PIXELS,
  TILE_SIZE
} from './config.js';
import { clamp } from './geometry.js';
import { samplePalette } from './color-ramp.js';
import type { PointSample, RenderMode } from './types.js';

export interface ProjectedPointSample {
  point: PointSample;
  worldX: number;
  worldY: number;
}

export interface RenderTileOptions {
  tileX: number;
  tileY: number;
  renderMode: RenderMode;
  valueScale: {
    min: number;
    max: number;
  };
}

export interface RenderedTile {
  rgba: Uint8Array;
  maxSupportWeight: number;
  nonTransparentPixelCount: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function gaussianBell(value: number, center: number, sigma: number): number {
  const delta = value - center;
  return Math.exp(-(delta * delta) / (2 * sigma * sigma));
}

export function renderHeatmapTile(
  projectedPoints: ProjectedPointSample[],
  options: RenderTileOptions
): RenderedTile {
  const paddedSize = TILE_SIZE + TILE_PADDING_PIXELS * 2;
  const rasterLength = paddedSize * paddedSize;
  const numerators = new Float32Array(rasterLength);
  const denominators = new Float32Array(rasterLength);

  // Accumulate on a padded raster first, then crop back to 256x256.
  // That keeps Gaussian support continuous across neighboring tiles.
  const originX = options.tileX * TILE_SIZE - TILE_PADDING_PIXELS;
  const originY = options.tileY * TILE_SIZE - TILE_PADDING_PIXELS;
  const maxX = originX + paddedSize;
  const maxY = originY + paddedSize;

  const sigmaSquaredTimesTwo = 2 * GAUSSIAN_SIGMA_PIXELS * GAUSSIAN_SIGMA_PIXELS;
  const radiusSquared = GAUSSIAN_RADIUS_PIXELS * GAUSSIAN_RADIUS_PIXELS;

  for (const projectedPoint of projectedPoints) {
    if (
      projectedPoint.worldX + GAUSSIAN_RADIUS_PIXELS < originX ||
      projectedPoint.worldX - GAUSSIAN_RADIUS_PIXELS >= maxX ||
      projectedPoint.worldY + GAUSSIAN_RADIUS_PIXELS < originY ||
      projectedPoint.worldY - GAUSSIAN_RADIUS_PIXELS >= maxY
    ) {
      continue;
    }

    const startX = Math.max(0, Math.floor(projectedPoint.worldX - GAUSSIAN_RADIUS_PIXELS - originX));
    const endX = Math.min(paddedSize - 1, Math.ceil(projectedPoint.worldX + GAUSSIAN_RADIUS_PIXELS - originX));
    const startY = Math.max(0, Math.floor(projectedPoint.worldY - GAUSSIAN_RADIUS_PIXELS - originY));
    const endY = Math.min(paddedSize - 1, Math.ceil(projectedPoint.worldY + GAUSSIAN_RADIUS_PIXELS - originY));

    for (let localY = startY; localY <= endY; localY += 1) {
      const dy = originY + localY + 0.5 - projectedPoint.worldY;
      const dySquared = dy * dy;

      if (dySquared > radiusSquared) {
        continue;
      }

      for (let localX = startX; localX <= endX; localX += 1) {
        const dx = originX + localX + 0.5 - projectedPoint.worldX;
        const distanceSquared = dx * dx + dySquared;

        if (distanceSquared > radiusSquared) {
          continue;
        }

        const weight = Math.exp(-distanceSquared / sigmaSquaredTimesTwo);
        const rasterIndex = localY * paddedSize + localX;
        numerators[rasterIndex] += weight * projectedPoint.point.value;
        denominators[rasterIndex] += weight;
      }
    }
  }

  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  let maxSupportWeight = 0;
  let nonTransparentPixelCount = 0;
  const valueScaleSpan = Math.max(1e-9, options.valueScale.max - options.valueScale.min);

  for (let tileY = 0; tileY < TILE_SIZE; tileY += 1) {
    for (let tileX = 0; tileX < TILE_SIZE; tileX += 1) {
      const paddedIndex =
        (tileY + TILE_PADDING_PIXELS) * paddedSize + tileX + TILE_PADDING_PIXELS;
      const supportWeight = denominators[paddedIndex];

      maxSupportWeight = Math.max(maxSupportWeight, supportWeight);

      const rgbaIndex = (tileY * TILE_SIZE + tileX) * 4;
      if (supportWeight <= MIN_SUPPORT_WEIGHT) {
        continue;
      }

      const blendedValue =
        options.renderMode === 'density'
          ? numerators[paddedIndex]
          : numerators[paddedIndex] / supportWeight;
      const normalizedValue =
        (blendedValue - options.valueScale.min) / valueScaleSpan;

      const [red, green, blue] = samplePalette(normalizedValue);

      // One isolated point should color the map only faintly. Overlap is what
      // creates confidence, not merely the existence of a single sample.
      const confidence = smoothstep(
        MIN_SUPPORT_WEIGHT,
        FULL_SUPPORT_WEIGHT,
        supportWeight
      );
      const midBandBoost = 0.14 * gaussianBell(normalizedValue, 0.5, 0.12);
      const alpha = clamp(confidence * (MAX_ALPHA + midBandBoost), 0, 0.92);

      rgba[rgbaIndex] = red;
      rgba[rgbaIndex + 1] = green;
      rgba[rgbaIndex + 2] = blue;
      rgba[rgbaIndex + 3] = Math.round(alpha * 255);
      nonTransparentPixelCount += 1;
    }
  }

  return {
    rgba,
    maxSupportWeight,
    nonTransparentPixelCount
  };
}
