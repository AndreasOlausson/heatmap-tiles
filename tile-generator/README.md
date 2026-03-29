# Tile Generator

This sibling project turns point data into static transparent XYZ heatmap tiles for Leaflet.

The active pipeline is:

```text
coords.json + config.json -> output/points.json -> output/tiles/{z}/{x}/{y}.png
```

The current default dataset is a demo scenario under [demo-scenarios/linkoping-apartment-market](/Users/andreasolausson/dev/heatmap-tiles/demo-scenarios/linkoping-apartment-market). The coordinates and values in that scenario are fake, but they are treated exactly like a real imported dataset. The generated tiles are the same as before because the scenario now uses the already-materialized point set.

The generator also supports raw-source adapters for external files that are not already in canonical `coords.json` form. The first adapter is for [birds.json](/Users/andreasolausson/dev/heatmap-tiles/birds.json), which gets aggregated into weighted density points before tiling.

## Install

```bash
cd tile-generator
npm install
```

## Commands

```bash
npm run generate:points
npm run generate:points -- --scenario ../demo-scenarios/linkoping-apartment-market
npm run generate:points -- --coords ../some-data/coords.json --config ../some-data/config.json
npm run generate:points -- --source ../birds.json --adapter birds --config ../demo-scenarios/linkoping-bird-sightings/config.json
npm run generate:tiles
npm run preview
```

`npm run generate:points` loads the default demo scenario and writes `output/points.json`.

`npm run generate:points -- --scenario path/to/scenario-dir` looks for:

- `path/to/scenario-dir/coords.json`
- `path/to/scenario-dir/config.json`

`npm run generate:points -- --coords path/to/coords.json --config path/to/config.json` loads an explicit pair of files.

`npm run generate:points -- --source path/to/raw.json --adapter birds --config path/to/config.json` imports a raw external file through the `birds` adapter, canonicalizes it into `output/points.json`, and then the rest of the tile pipeline stays the same.

`npm run generate:tiles` reads `output/points.json` and writes:

- `output/tiles/{z}/{x}/{y}.png`
- `output/metadata.json`

`npm run preview` starts a small static server on `http://127.0.0.1:3001`.
That server does not render the Leaflet map. It only serves `metadata.json`, `points.json`, and tile PNGs.

## Scenario Structure

Each scenario folder contains exactly two JSON files:

```text
demo-scenarios/
  linkoping-apartment-market/
    config.json
    coords.json
  linkoping-bird-sightings/
    config.json
    coords.json
  iceland-earthquakes/
    config.json
    coords.json
```

## coords.json Rules

`coords.json` should contain only point data.

Supported shapes:

```json
[
  { "id": "point-0001", "latitude": 58.41, "longitude": 15.62, "value": 54000 }
]
```

or:

```json
{
  "points": [
    { "lat": 58.41, "lng": 15.62, "value": 54000 }
  ]
}
```

Current rules:

- in `value` mode, `value` is required
- in `density` mode, `value` or `weight` is optional and defaults to `1`
- latitude keys can be `latitude` or `lat`
- longitude keys can be `longitude` or `lng`
- `id` is optional and auto-generated if missing

## config.json Rules

`config.json` describes how the point file should be interpreted and rendered. It should not contain the actual point list.

Current shape:

```json
{
  "renderMode": "value",
  "metric": {
    "key": "price_per_sqm",
    "label": "Price per sqm",
    "unit": "SEK/m²"
  },
  "valueScale": {
    "mode": "manual",
    "min": 25000,
    "max": 65000,
    "thresholds": [25000, 35000, 45000, 55000, 60000, 65000]
  },
  "zoom": {
    "min": 10,
    "max": 14
  },
  "bounds": {
    "south": 58.362053,
    "west": 15.534133,
    "north": 58.432778,
    "east": 15.71052
  }
}
```

Current config rules:

- `renderMode` currently supports `"value"` and `"density"`
- `metric` is required
- `valueScale` is required
- `zoom` is optional
- `bounds` is optional

If `bounds` is omitted, the generator derives bounds from the imported points. If you want repeatable tile coverage across runs or across edited subsets of the same data, set explicit bounds.
If `zoom` is omitted, the generator falls back to the default global range from [config.ts](/Users/andreasolausson/dev/heatmap-tiles/tile-generator/src/config.ts).

## valueScale

`valueScale` supports two modes:

- `manual`: fixed `min`, `max`, and optional `thresholds`
- `percentile`: `lowerPercentile`, `upperPercentile`, and optional `thresholds`

Examples:

```json
{
  "mode": "manual",
  "min": 25000,
  "max": 65000,
  "thresholds": [25000, 35000, 45000, 55000, 60000, 65000]
}
```

```json
{
  "mode": "percentile",
  "lowerPercentile": 5,
  "upperPercentile": 95
}
```

If `thresholds` are omitted, the generator derives default legend marks from the resolved scale.

## Render Modes

### `value`

Each point contributes a numeric value and the raster uses a Gaussian weighted average:

```text
numerator += weight * value
denominator += weight
outputValue = numerator / denominator
```

This is appropriate for things like price-per-sqm.

### `density`

Each point contributes count or weight into the local field:

```text
density += weight * pointValue
```

This is appropriate for sightings, check-ins, or other hotspot-style data. If your canonical `coords.json` omits `value`, each point counts as `1`. If you import raw bird data through the `birds` adapter, duplicate coordinates are aggregated and the resulting canonical points use the duplicate count as their `value`.

## Heatmap Rasterization

Each point contributes to a weighted field around its projected pixel position using the configured render mode.
In `value` mode, the result is a weighted-average surface. In `density` mode, the result is a hotspot surface where many nearby points reinforce each other and isolated points remain blue or faint.

## Seam Avoidance

Tiles are not blurred in isolation.

Each tile is rendered on a padded raster first:

- nominal tile size: `256x256`
- Gaussian sigma: `22 px`
- effective radius: `66 px`
- padding: `66 px`

The generator accumulates Gaussian support on the padded raster and then crops the center `256x256` region. That keeps blur continuous across tile boundaries and avoids seams.

## Confidence / Transparency

The denominator of the weighted average also acts as a support signal:

- very weak support is fully transparent
- moderate support is heavily faded
- strong overlap becomes mostly opaque
- the middle yellow band gets a small alpha boost so it stays legible on the basemap

The Leaflet app reads palette stops and threshold markers from `output/metadata.json`, so the on-map legend stays aligned with the generated tiles.

## Raw Import Adapters

Raw adapters are for external files that are not already in canonical `coords.json` form.

Current adapter:

- `birds`
  Reads either an array of bird observations or an object with a `birds` array.
  Each observation must contain `lat`/`lng` or `latitude`/`longitude`.
  Duplicate coordinates are aggregated into one canonical point with `value = count`.

Example:

```bash
npm run generate:points -- --source ../birds.json --adapter birds --config ../demo-scenarios/linkoping-bird-sightings/config.json
```

## Preview In Leaflet

There are two local servers in the normal workflow:

- `tile-generator` preview on `http://127.0.0.1:3001`
  This is only the tile/data server.
- repo root Vite app on `http://127.0.0.1:5173`
  This is the actual Leaflet map UI.

From the repo root:

```bash
npm run dev
```

From `tile-generator/`:

```bash
npm run generate
npm run preview
```

Then open `http://127.0.0.1:5173/`.

If you open `http://127.0.0.1:3001/`, you will only see the tile generator output page and file links. That is expected. The existing fullscreen Leaflet frontend fetches `http://127.0.0.1:3001/metadata.json` and overlays the generated transparent tiles on the basemap.
