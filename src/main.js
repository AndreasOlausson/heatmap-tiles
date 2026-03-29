import './style.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const linkoping = [58.4108, 15.6214];
const tilePreviewOrigin = import.meta.env.VITE_TILE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:3001';

const map = L.map('map', {
  zoomControl: true,
}).setView(linkoping, 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

function formatLegendValue(value) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 10000 && Number.isInteger(value / 1000)) {
    return `${Math.round(value / 1000)}k`;
  }

  const fractionDigits = absoluteValue < 10 ? 1 : 0;
  return new Intl.NumberFormat('sv-SE', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function buildLegendGradient(paletteStops) {
  return `linear-gradient(90deg, ${paletteStops
    .map((stop) => `${stop.color} ${Math.round(stop.position * 1000) / 10}%`)
    .join(', ')})`;
}

function createLegendControl(metadata) {
  const thresholds = metadata.valueScale.thresholds ?? [
    metadata.valueScale.min,
    metadata.valueScale.max,
  ];
  const scaleSpan = Math.max(1, metadata.valueScale.max - metadata.valueScale.min);

  const legendControl = L.control({ position: 'bottomright' });

  legendControl.onAdd = () => {
    const container = L.DomUtil.create('div', 'map-legend');
    const title = L.DomUtil.create('div', 'map-legend-title', container);
    const subtitle = L.DomUtil.create('div', 'map-legend-subtitle', container);
    const bar = L.DomUtil.create('div', 'map-legend-bar', container);
    const scale = L.DomUtil.create('div', 'map-legend-scale', container);

    title.textContent = metadata.metric.label;
    subtitle.textContent = metadata.metric.unit;
    bar.style.backgroundImage = buildLegendGradient(metadata.legend.paletteStops);

    thresholds.forEach((threshold, index) => {
      const marker = L.DomUtil.create('div', 'map-legend-marker', scale);
      const tick = L.DomUtil.create('div', 'map-legend-tick', marker);
      const label = L.DomUtil.create('div', 'map-legend-label', marker);
      const position =
        ((threshold - metadata.valueScale.min) / scaleSpan) *
        100;

      marker.style.left = `${Math.min(100, Math.max(0, position))}%`;
      label.textContent = formatLegendValue(threshold);
      tick.setAttribute('aria-hidden', 'true');

      if (index === 0) {
        marker.classList.add('is-first');
      } else if (index === thresholds.length - 1) {
        marker.classList.add('is-last');
      }
    });

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  };

  return legendControl;
}

async function addHeatmapOverlay() {
  try {
    const metadataResponse = await fetch(`${tilePreviewOrigin}/metadata.json`);
    if (!metadataResponse.ok) {
      throw new Error(`Failed to load heatmap metadata: ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();
    const bounds = [
      [metadata.bounds.south, metadata.bounds.west],
      [metadata.bounds.north, metadata.bounds.east],
    ];

    L.tileLayer(`${tilePreviewOrigin}/${metadata.tilesPath}`, {
      bounds,
      opacity: 0.62,
      minZoom: metadata.zoom.min,
      maxNativeZoom: metadata.zoom.max,
      maxZoom: 19,
      attribution: `${metadata.metric.label} heatmap`,
    }).addTo(map);

    createLegendControl(metadata).addTo(map);

    map.fitBounds(bounds, {
      padding: [24, 24],
    });
  } catch (error) {
    console.info('Heatmap overlay unavailable. Start the tile-generator preview server to load it.', error);
  }
}

addHeatmapOverlay();
