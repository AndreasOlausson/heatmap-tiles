# heatmap-tiles

A small Leaflet demo plus a static heatmap tile pipeline.

The repository has two parts:

- The repo root contains a Vite app that renders a Leaflet map and overlays pre-generated transparent XYZ tiles.
- [`tile-generator/`](./tile-generator) contains the TypeScript generator that turns point datasets into `metadata.json` and `tiles/{z}/{x}/{y}.png`.

## What It Does

The normal workflow is:

```text
coords.json + config.json -> output/points.json -> output/tiles/{z}/{x}/{y}.png
```

The Leaflet app then reads `metadata.json` from the tile preview server and displays the heatmap plus a generated legend.

Included demo scenarios live under [`demo-scenarios/`](./demo-scenarios):

- `linkoping-apartment-market`
- `linkoping-bird-sightings`
- `iceland-earthquakes`

## Quick Start

Install dependencies in both projects:

```bash
npm install
cd tile-generator
npm install
```

Generate tiles from the default scenario and start the tile preview server:

```bash
cd tile-generator
npm run generate
npm run preview
```

In another terminal, start the Leaflet app from the repo root:

```bash
npm run dev
```

Default local URLs:

- Leaflet app: `http://127.0.0.1:5173`
- Tile preview server: `http://127.0.0.1:3001`

The root app reads tiles from `VITE_TILE_PREVIEW_ORIGIN` and falls back to `http://127.0.0.1:3001`.

## Project Structure

```text
.
├── demo-scenarios/
├── src/                # Leaflet demo app
├── tile-generator/     # Point-to-tile pipeline
├── birds.json          # Raw bird observation input for the birds adapter
└── market-input.json   # Raw market input data used for scenario generation
```

## More Detail

The generator has its own detailed documentation in [tile-generator/README.md](./tile-generator/README.md), including scenario structure, supported adapters, render modes, and tile generation commands.

## License

This project is licensed under Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
