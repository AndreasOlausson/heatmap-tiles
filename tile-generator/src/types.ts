export type LngLat = [longitude: number, latitude: number];

export interface LatLngBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface MetricConfig {
  key: string;
  label: string;
  unit: string;
}

export type RenderMode = 'value' | 'density';
export type ValueScaleMode = 'manual' | 'percentile';
export type RawImportAdapter = 'birds';

export interface ValueScaleConfig {
  min: number;
  max: number;
  thresholds: number[];
}

export interface ManualValueScaleInput {
  mode?: 'manual';
  min: number;
  max: number;
  thresholds?: number[];
}

export interface PercentileValueScaleInput {
  mode: 'percentile';
  lowerPercentile: number;
  upperPercentile: number;
  thresholds?: number[];
}

export type ValueScaleInput = ManualValueScaleInput | PercentileValueScaleInput;

export interface ResolvedValueScaleConfig extends ValueScaleConfig {
  mode: ValueScaleMode;
}

export interface ZoomRangeConfig {
  min: number;
  max: number;
}

export interface ScenarioConfig {
  renderMode?: RenderMode;
  metric: MetricConfig;
  valueScale: ValueScaleInput;
  bounds?: LatLngBounds;
  zoom?: ZoomRangeConfig;
}

export interface PointSample {
  id: string;
  latitude: number;
  longitude: number;
  value: number;
}

export interface PointsDataset {
  renderMode: RenderMode;
  metric: MetricConfig;
  valueScale: ResolvedValueScaleConfig;
  regionBounds: LatLngBounds;
  zoom: ZoomRangeConfig;
  summary: {
    count: number;
    minValue: number;
    maxValue: number;
    meanValue: number;
  };
  points: PointSample[];
}

export interface TileRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PaletteStop {
  position: number;
  color: string;
}

export interface HeatmapMetadata {
  renderMode: RenderMode;
  bounds: LatLngBounds;
  center: {
    latitude: number;
    longitude: number;
  };
  zoom: {
    min: number;
    max: number;
  };
  tileSize: number;
  tilesPath: string;
  pointsPath: string;
  kernel: {
    sigmaPixels: number;
    radiusPixels: number;
    paddingPixels: number;
  };
  confidence: {
    transparentBelowWeight: number;
    mostlyOpaqueAtWeight: number;
  };
  metric: MetricConfig;
  valueScale: ResolvedValueScaleConfig & {
    datasetMin: number;
    datasetMax: number;
  };
  legend: {
    paletteStops: PaletteStop[];
  };
  tileRanges: Record<string, TileRange>;
}
