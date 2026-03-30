import { TILE_SIZE } from '../../src/config.ts';
import type { ProjectedPointSample } from '../../src/heatmap.ts';
import type { PointSample, PointsDataset } from '../../src/types.ts';

export function createProjectedPointSample(
  value: number,
  worldX = TILE_SIZE / 2 + 0.5,
  worldY = TILE_SIZE / 2 + 0.5,
  id = 'point-0001'
): ProjectedPointSample {
  return {
    point: {
      id,
      latitude: 0,
      longitude: 0,
      value
    },
    worldX,
    worldY
  };
}

export function createValueDataset(): PointsDataset {
  const points: PointSample[] = [
    {
      id: 'point-0001',
      latitude: 58.4108,
      longitude: 15.6214,
      value: 20
    },
    {
      id: 'point-0002',
      latitude: 58.4118,
      longitude: 15.6241,
      value: 80
    }
  ];

  return {
    renderMode: 'value',
    metric: {
      key: 'synthetic_value',
      label: 'Synthetic Value',
      unit: 'u'
    },
    valueScale: {
      mode: 'manual',
      min: 0,
      max: 100,
      thresholds: [0, 25, 50, 75, 100]
    },
    regionBounds: {
      south: 58.4108,
      west: 15.6214,
      north: 58.4118,
      east: 15.6241
    },
    zoom: {
      min: 10,
      max: 10
    },
    summary: {
      count: 2,
      minValue: 20,
      maxValue: 80,
      meanValue: 50
    },
    points
  };
}

export function createDensityDataset(): PointsDataset {
  const points: PointSample[] = [
    {
      id: 'point-0001',
      latitude: 58.4108,
      longitude: 15.6214,
      value: 1
    },
    {
      id: 'point-0002',
      latitude: 58.4114,
      longitude: 15.6223,
      value: 2
    },
    {
      id: 'point-0003',
      latitude: 58.4118,
      longitude: 15.6241,
      value: 1
    }
  ];

  return {
    renderMode: 'density',
    metric: {
      key: 'synthetic_density',
      label: 'Synthetic Density',
      unit: 'count'
    },
    valueScale: {
      mode: 'manual',
      min: 0,
      max: 4,
      thresholds: [0, 1, 2, 3, 4]
    },
    regionBounds: {
      south: 58.4108,
      west: 15.6214,
      north: 58.4118,
      east: 15.6241
    },
    zoom: {
      min: 10,
      max: 10
    },
    summary: {
      count: 3,
      minValue: 1,
      maxValue: 2,
      meanValue: 1
    },
    points
  };
}
