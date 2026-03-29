export const TILE_SIZE = 256;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 14;
export const TILE_WRITE_CONCURRENCY = 8;

export const GAUSSIAN_SIGMA_PIXELS = 22;
export const GAUSSIAN_RADIUS_PIXELS = Math.ceil(GAUSSIAN_SIGMA_PIXELS * 3);
export const TILE_PADDING_PIXELS = GAUSSIAN_RADIUS_PIXELS;

export const MIN_SUPPORT_WEIGHT = 0.08;
export const FULL_SUPPORT_WEIGHT = 1.35;
export const MAX_ALPHA = 0.82;

export const REGION_PADDING_METERS = 1000;
export const TILES_PATH_TEMPLATE = 'tiles/{z}/{x}/{y}.png';
