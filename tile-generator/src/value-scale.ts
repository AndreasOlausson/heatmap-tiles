import type { ResolvedValueScaleConfig, ValueScaleInput } from './types.js';

const DEFAULT_THRESHOLD_STEPS = [0, 0.25, 0.5, 0.75, 1];
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundThresholdValue(value: number): number {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 10_000) {
    return Math.round(value / 1_000) * 1_000;
  }
  if (absoluteValue >= 1_000) {
    return Math.round(value / 100) * 100;
  }
  if (absoluteValue >= 100) {
    return Math.round(value / 10) * 10;
  }
  if (absoluteValue >= 10) {
    return Math.round(value);
  }

  return Math.round(value * 10) / 10;
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function buildDefaultThresholds(min: number, max: number): number[] {
  if (max <= min) {
    return [min];
  }

  return uniqueSorted(
    DEFAULT_THRESHOLD_STEPS.map((step, index) => {
      if (index === 0) {
        return min;
      }
      if (index === DEFAULT_THRESHOLD_STEPS.length - 1) {
        return max;
      }

      return clamp(roundThresholdValue(min + (max - min) * step), min, max);
    })
  );
}

function normalizeThresholds(
  rawThresholds: number[] | undefined,
  min: number,
  max: number
): number[] {
  if (!rawThresholds || rawThresholds.length === 0) {
    return buildDefaultThresholds(min, max);
  }

  const thresholds = uniqueSorted(rawThresholds.map((threshold) => clamp(threshold, min, max)));
  return thresholds.length > 0 ? thresholds : buildDefaultThresholds(min, max);
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    throw new Error('Cannot resolve a percentile from an empty dataset.');
  }

  const position = (percentileValue / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  return lowerValue + (upperValue - lowerValue) * fraction;
}

export function resolveValueScale(
  scaleInput: ValueScaleInput,
  values: number[]
): ResolvedValueScaleConfig {
  if (values.length === 0) {
    throw new Error('Cannot resolve a value scale from an empty dataset.');
  }

  if (scaleInput.mode === 'percentile') {
    const sortedValues = [...values].sort((left, right) => left - right);
    let min = percentile(sortedValues, scaleInput.lowerPercentile);
    let max = percentile(sortedValues, scaleInput.upperPercentile);

    if (max <= min) {
      min = sortedValues[0];
      max = sortedValues[sortedValues.length - 1];
    }
    if (max <= min) {
      max = min + 1;
    }

    return {
      mode: 'percentile',
      min,
      max,
      thresholds: normalizeThresholds(scaleInput.thresholds, min, max)
    };
  }

  return {
    mode: 'manual',
    min: scaleInput.min,
    max: scaleInput.max,
    thresholds: normalizeThresholds(scaleInput.thresholds, scaleInput.min, scaleInput.max)
  };
}
