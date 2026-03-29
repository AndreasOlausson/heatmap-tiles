import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  LatLngBounds,
  LngLat,
  MetricConfig,
  PointSample,
  RawImportAdapter,
  RenderMode,
  ScenarioConfig,
  ValueScaleInput,
  ZoomRangeConfig
} from './types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const defaultScenarioDirectory = path.resolve(
  projectRoot,
  '..',
  'demo-scenarios',
  'linkoping-apartment-market'
);

export type ResolvedInputPaths =
  | {
      kind: 'scenario';
      coordsPath: string;
      configPath: string;
    }
  | {
      kind: 'raw';
      sourcePath: string;
      configPath: string;
      adapter: RawImportAdapter;
    };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseMetric(value: unknown): MetricConfig {
  assert(value && typeof value === 'object', 'config.metric must be an object.');
  const metric = value as Record<string, unknown>;
  assert(typeof metric.key === 'string' && metric.key.length > 0, 'config.metric.key must be a non-empty string.');
  assert(typeof metric.label === 'string' && metric.label.length > 0, 'config.metric.label must be a non-empty string.');
  assert(typeof metric.unit === 'string', 'config.metric.unit must be a string.');

  return {
    key: metric.key,
    label: metric.label,
    unit: metric.unit
  };
}

function parseOptionalThresholds(value: unknown, label: string): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  assert(Array.isArray(value), `${label} must be an array when provided.`);
  return value.map((threshold, index) => {
    assert(isFiniteNumber(threshold), `${label}[${index}] must be a finite number.`);
    return threshold;
  });
}

function parseValueScale(value: unknown): ValueScaleInput {
  assert(value && typeof value === 'object', 'config.valueScale must be an object.');
  const valueScale = value as Record<string, unknown>;
  const mode = valueScale.mode ?? 'manual';
  assert(mode === 'manual' || mode === 'percentile', 'config.valueScale.mode must be "manual" or "percentile".');

  if (mode === 'percentile') {
    assert(
      isFiniteNumber(valueScale.lowerPercentile),
      'config.valueScale.lowerPercentile must be a finite number.'
    );
    assert(
      isFiniteNumber(valueScale.upperPercentile),
      'config.valueScale.upperPercentile must be a finite number.'
    );
    assert(
      valueScale.lowerPercentile >= 0 && valueScale.lowerPercentile <= 100,
      'config.valueScale.lowerPercentile must be between 0 and 100.'
    );
    assert(
      valueScale.upperPercentile >= 0 && valueScale.upperPercentile <= 100,
      'config.valueScale.upperPercentile must be between 0 and 100.'
    );
    assert(
      valueScale.lowerPercentile < valueScale.upperPercentile,
      'config.valueScale.lowerPercentile must be less than config.valueScale.upperPercentile.'
    );

    return {
      mode: 'percentile',
      lowerPercentile: valueScale.lowerPercentile,
      upperPercentile: valueScale.upperPercentile,
      thresholds: parseOptionalThresholds(valueScale.thresholds, 'config.valueScale.thresholds')
    };
  }

  assert(isFiniteNumber(valueScale.min), 'config.valueScale.min must be a finite number.');
  assert(isFiniteNumber(valueScale.max), 'config.valueScale.max must be a finite number.');
  assert(
    valueScale.min <= valueScale.max,
    'config.valueScale.min must be less than or equal to config.valueScale.max.'
  );

  return {
    mode: 'manual',
    min: valueScale.min,
    max: valueScale.max,
    thresholds: parseOptionalThresholds(valueScale.thresholds, 'config.valueScale.thresholds')
  };
}

function parseBounds(value: unknown): LatLngBounds | undefined {
  if (value === undefined) {
    return undefined;
  }

  assert(value && typeof value === 'object', 'config.bounds must be an object when provided.');
  const bounds = value as Record<string, unknown>;
  assert(isFiniteNumber(bounds.south), 'config.bounds.south must be a finite number.');
  assert(isFiniteNumber(bounds.west), 'config.bounds.west must be a finite number.');
  assert(isFiniteNumber(bounds.north), 'config.bounds.north must be a finite number.');
  assert(isFiniteNumber(bounds.east), 'config.bounds.east must be a finite number.');
  assert(bounds.south <= bounds.north, 'config.bounds.south must be less than or equal to config.bounds.north.');
  assert(bounds.west <= bounds.east, 'config.bounds.west must be less than or equal to config.bounds.east.');

  return {
    south: bounds.south,
    west: bounds.west,
    north: bounds.north,
    east: bounds.east
  };
}

function parseZoom(value: unknown): ZoomRangeConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  assert(value && typeof value === 'object', 'config.zoom must be an object when provided.');
  const zoom = value as Record<string, unknown>;
  assert(isFiniteNumber(zoom.min), 'config.zoom.min must be a finite number.');
  assert(isFiniteNumber(zoom.max), 'config.zoom.max must be a finite number.');
  assert(Number.isInteger(zoom.min), 'config.zoom.min must be an integer.');
  assert(Number.isInteger(zoom.max), 'config.zoom.max must be an integer.');
  assert(zoom.min >= 0, 'config.zoom.min must be greater than or equal to 0.');
  assert(zoom.max >= 0, 'config.zoom.max must be greater than or equal to 0.');
  assert(zoom.min <= zoom.max, 'config.zoom.min must be less than or equal to config.zoom.max.');

  return {
    min: zoom.min,
    max: zoom.max
  };
}

function parseLngLat(record: Record<string, unknown>, label: string): LngLat {
  const latitude = record.latitude ?? record.lat;
  const longitude = record.longitude ?? record.lng;

  assert(isFiniteNumber(latitude), `${label}.latitude (or .lat) must be a finite number.`);
  assert(isFiniteNumber(longitude), `${label}.longitude (or .lng) must be a finite number.`);

  return [longitude, latitude];
}

function parsePointSample(value: unknown, index: number, renderMode: RenderMode): PointSample {
  assert(value && typeof value === 'object', `coords[${index}] must be an object.`);
  const point = value as Record<string, unknown>;
  const [longitude, latitude] = parseLngLat(point, `coords[${index}]`);
  const rawValue = point.value ?? point.weight;

  if (renderMode === 'value') {
    assert(isFiniteNumber(rawValue), `coords[${index}].value must be a finite number.`);
  } else {
    assert(
      rawValue === undefined || isFiniteNumber(rawValue),
      `coords[${index}].value or .weight must be a finite number when provided.`
    );
  }

  return {
    id:
      typeof point.id === 'string' && point.id.length > 0
        ? point.id
        : `point-${String(index + 1).padStart(4, '0')}`,
    latitude,
    longitude,
    value: rawValue === undefined ? 1 : rawValue
  };
}

function parseCoords(value: unknown, renderMode: RenderMode): PointSample[] {
  let entries: unknown[] | null = null;

  if (Array.isArray(value)) {
    entries = value;
  } else if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).points)) {
    entries = (value as Record<string, unknown>).points as unknown[];
  }

  assert(entries !== null, 'coords JSON must be an array or an object with a points array.');
  assert(entries.length > 0, 'coords JSON must contain at least one point.');
  return entries.map((entry, index) => parsePointSample(entry, index, renderMode));
}

function parseBirdSource(value: unknown): PointSample[] {
  let birds: unknown[] | null = null;

  if (Array.isArray(value)) {
    birds = value;
  } else if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).birds)) {
    birds = (value as Record<string, unknown>).birds as unknown[];
  }

  assert(birds !== null, 'Bird source JSON must be an array or an object with a birds array.');
  assert(birds.length > 0, 'Bird source JSON must contain at least one observation.');

  const counts = new Map<string, { latitude: number; longitude: number; count: number }>();

  for (let index = 0; index < birds.length; index += 1) {
    const entry = birds[index];
    assert(entry && typeof entry === 'object', `birds[${index}] must be an object.`);
    const record = entry as Record<string, unknown>;
    const [longitude, latitude] = parseLngLat(record, `birds[${index}]`);
    const key = `${latitude},${longitude}`;
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, {
      latitude,
      longitude,
      count: 1
    });
  }

  return Array.from(counts.values(), (entry, index) => ({
    id: `point-${String(index + 1).padStart(4, '0')}`,
    latitude: entry.latitude,
    longitude: entry.longitude,
    value: entry.count
  }));
}

export function resolveInputPaths(argv: string[]): ResolvedInputPaths {
  let scenarioDirectory = defaultScenarioDirectory;
  let coordsPath: string | null = null;
  let configPath: string | null = null;
  let sourcePath: string | null = null;
  let adapter: RawImportAdapter | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--scenario') {
      assert(nextValue, '--scenario requires a path.');
      scenarioDirectory = path.resolve(process.cwd(), nextValue);
      index += 1;
      continue;
    }

    if (argument === '--coords') {
      assert(nextValue, '--coords requires a path.');
      coordsPath = path.resolve(process.cwd(), nextValue);
      index += 1;
      continue;
    }

    if (argument === '--config') {
      assert(nextValue, '--config requires a path.');
      configPath = path.resolve(process.cwd(), nextValue);
      index += 1;
      continue;
    }

    if (argument === '--source') {
      assert(nextValue, '--source requires a path.');
      sourcePath = path.resolve(process.cwd(), nextValue);
      index += 1;
      continue;
    }

    if (argument === '--adapter') {
      assert(nextValue, '--adapter requires a value.');
      assert(nextValue === 'birds', '--adapter currently only supports "birds".');
      adapter = 'birds';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (sourcePath || adapter) {
    assert(sourcePath, 'Raw import requires --source.');
    assert(adapter, 'Raw import requires --adapter.');
    assert(configPath, 'Raw import requires --config.');
    assert(!coordsPath, 'Do not combine --coords with --source.');
    return {
      kind: 'raw',
      sourcePath,
      configPath,
      adapter
    };
  }

  return {
    kind: 'scenario',
    coordsPath: coordsPath ?? path.join(scenarioDirectory, 'coords.json'),
    configPath: configPath ?? path.join(scenarioDirectory, 'config.json')
  };
}

export async function loadScenarioConfig(configPath: string): Promise<ScenarioConfig> {
  const json = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(json) as Record<string, unknown>;

  assert(parsed && typeof parsed === 'object', 'Config JSON must be an object.');
  const renderMode = parsed.renderMode ?? 'value';
  assert(
    renderMode === 'value' || renderMode === 'density',
    'config.renderMode currently only supports "value" or "density".'
  );

  return {
    renderMode,
    metric: parseMetric(parsed.metric),
    valueScale: parseValueScale(parsed.valueScale),
    bounds: parseBounds(parsed.bounds),
    zoom: parseZoom(parsed.zoom)
  };
}

export async function loadScenarioPoints(
  coordsPath: string,
  renderMode: RenderMode
): Promise<PointSample[]> {
  const json = await readFile(coordsPath, 'utf8');
  return parseCoords(JSON.parse(json), renderMode);
}

export async function loadRawSourcePoints(
  sourcePath: string,
  adapter: RawImportAdapter
): Promise<PointSample[]> {
  const json = await readFile(sourcePath, 'utf8');
  const parsed = JSON.parse(json);

  if (adapter === 'birds') {
    return parseBirdSource(parsed);
  }

  throw new Error(`Unsupported raw import adapter: ${adapter}`);
}
