import { clamp } from './geometry.js';
import type { PaletteStop } from './types.js';

type ColorStop = {
  position: number;
  rgb: [number, number, number];
};

const PALETTE: ColorStop[] = [
  { position: 0, rgb: [43, 91, 170] },
  { position: 0.25, rgb: [76, 182, 196] },
  { position: 0.5, rgb: [235, 198, 86] },
  { position: 0.75, rgb: [247, 150, 70] },
  { position: 1, rgb: [182, 34, 48] }
];

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function rgbToHex([red, green, blue]: [number, number, number]): string {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export const PALETTE_STOPS: PaletteStop[] = PALETTE.map((stop) => ({
  position: stop.position,
  color: rgbToHex(stop.rgb)
}));

export function samplePalette(value: number): [number, number, number] {
  const t = clamp(value, 0, 1);

  for (let index = 1; index < PALETTE.length; index += 1) {
    const previous = PALETTE[index - 1];
    const next = PALETTE[index];

    if (t <= next.position) {
      const localT = (t - previous.position) / (next.position - previous.position);
      return [
        Math.round(previous.rgb[0] + (next.rgb[0] - previous.rgb[0]) * localT),
        Math.round(previous.rgb[1] + (next.rgb[1] - previous.rgb[1]) * localT),
        Math.round(previous.rgb[2] + (next.rgb[2] - previous.rgb[2]) * localT)
      ];
    }
  }

  return PALETTE[PALETTE.length - 1].rgb;
}
