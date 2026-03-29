import type { LatLngBounds, TileRange } from './types.js';

export interface WorldPixel {
  x: number;
  y: number;
}

export function projectLngLatToWorldPixels(
  longitude: number,
  latitude: number,
  zoom: number,
  tileSize: number
): WorldPixel {
  const scale = tileSize * 2 ** zoom;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const sinLatitude = Math.sin(latitudeRadians);

  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      (0.5 -
        Math.log((1 + sinLatitude) / (1 - sinLatitude)) /
          (4 * Math.PI)) *
      scale
  };
}

export function boundsToTileRange(bounds: LatLngBounds, zoom: number, tileSize: number): TileRange {
  const topLeft = projectLngLatToWorldPixels(bounds.west, bounds.north, zoom, tileSize);
  const bottomRight = projectLngLatToWorldPixels(bounds.east, bounds.south, zoom, tileSize);

  return {
    minX: Math.floor(topLeft.x / tileSize),
    maxX: Math.floor((bottomRight.x - 1e-6) / tileSize),
    minY: Math.floor(topLeft.y / tileSize),
    maxY: Math.floor((bottomRight.y - 1e-6) / tileSize)
  };
}
