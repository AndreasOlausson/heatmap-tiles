import type { LatLngBounds, LngLat } from './types.js';

const METERS_PER_LATITUDE_DEGREE = 111_320;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getPolygonBounds(rings: LngLat[][]): LatLngBounds {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const ring of rings) {
    for (const [longitude, latitude] of ring) {
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }
  }

  return { south, west, north, east };
}

export function combineBounds(bounds: LatLngBounds[]): LatLngBounds {
  return bounds.reduce(
    (combined, current) => ({
      south: Math.min(combined.south, current.south),
      west: Math.min(combined.west, current.west),
      north: Math.max(combined.north, current.north),
      east: Math.max(combined.east, current.east)
    }),
    {
      south: Number.POSITIVE_INFINITY,
      west: Number.POSITIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY
    }
  );
}

export function getPointBounds(points: LngLat[]): LatLngBounds {
  if (points.length === 0) {
    throw new Error('Cannot derive bounds from an empty point set.');
  }

  return points.reduce(
    (bounds, [longitude, latitude]) => ({
      south: Math.min(bounds.south, latitude),
      west: Math.min(bounds.west, longitude),
      north: Math.max(bounds.north, latitude),
      east: Math.max(bounds.east, longitude)
    }),
    {
      south: Number.POSITIVE_INFINITY,
      west: Number.POSITIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY
    }
  );
}

export function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function pointInPolygon(point: LngLat, rings: LngLat[][]): boolean {
  if (rings.length === 0 || !pointInRing(point, rings[0])) {
    return false;
  }

  for (let index = 1; index < rings.length; index += 1) {
    if (pointInRing(point, rings[index])) {
      return false;
    }
  }

  return true;
}

export function expandBoundsByMeters(bounds: LatLngBounds, meters: number): LatLngBounds {
  const latitudePadding = meters / METERS_PER_LATITUDE_DEGREE;
  const midpointLatitude = (bounds.south + bounds.north) / 2;
  const metersPerLongitudeDegree =
    Math.cos((midpointLatitude * Math.PI) / 180) * METERS_PER_LATITUDE_DEGREE;
  const longitudePadding = meters / metersPerLongitudeDegree;

  return {
    south: bounds.south - latitudePadding,
    west: bounds.west - longitudePadding,
    north: bounds.north + latitudePadding,
    east: bounds.east + longitudePadding
  };
}

export function metersToLatitudeDegrees(meters: number): number {
  return meters / METERS_PER_LATITUDE_DEGREE;
}

export function metersToLongitudeDegrees(meters: number, latitude: number): number {
  return meters / (Math.cos((latitude * Math.PI) / 180) * METERS_PER_LATITUDE_DEGREE);
}

export function distanceMeters(a: LngLat, b: LngLat): number {
  const longitudeScale =
    Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180) * METERS_PER_LATITUDE_DEGREE;
  const dx = (a[0] - b[0]) * longitudeScale;
  const dy = (a[1] - b[1]) * METERS_PER_LATITUDE_DEGREE;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getBoundsCenter(bounds: LatLngBounds): { latitude: number; longitude: number } {
  return {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2
  };
}
