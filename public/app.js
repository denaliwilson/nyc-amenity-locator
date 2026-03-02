/* global L */
'use strict';

const API_BASE = '/api';

// ── Map initialisation ──────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true }).setView([40.7128, -74.006], 12);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
}).addTo(map);

// ── State ───────────────────────────────────────────────────────────────────
let userLat = null;
let userLon = null;
let userMarker = null;
let markersLayer = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const typeSelect   = document.getElementById('amenity-type');
const countInput   = document.getElementById('result-count');
const radiusInput  = document.getElementById('cluster-radius');
const btnLocate    = document.getElementById('btn-locate');
const btnSearch    = document.getElementById('btn-search');
const btnCluster   = document.getElementById('btn-cluster');
const btnAllTypes  = document.getElementById('btn-all-types');
const statusMsg    = document.getElementById('status-msg');
const statusBar    = document.getElementById('status-bar');
const resultsList  = document.getElementById('results-list');

// ── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg, state = 'info') {
  statusMsg.textContent = msg;
  statusBar.className = state === 'error' ? 'error' : state === 'loading' ? 'loading' : '';
}

function enableActionButtons(enabled) {
  btnSearch.disabled  = !enabled;
  btnCluster.disabled = !enabled;
  btnAllTypes.disabled = !enabled;
}

function clearMarkers() {
  if (markersLayer) {
    map.removeLayer(markersLayer);
    markersLayer = null;
  }
}

function renderResultsList(items, title) {
  resultsList.innerHTML = '';
  if (!items || items.length === 0) {
    resultsList.innerHTML = '<p class="no-results">No results found.</p>';
    return;
  }
  const header = document.createElement('div');
  header.className = 'results-header';
  header.textContent = title || 'Results';
  resultsList.appendChild(header);
  items.forEach((item) => resultsList.appendChild(item));
}

/** Creates a Leaflet DivIcon for a coloured circle marker */
function colorIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div class="amenity-dot" style="background:${color}"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const TYPE_COLORS = {
  parks:           '#38a169',
  libraries:       '#d69e2e',
  subway_stations: '#e53e3e',
  hospitals:       '#3182ce',
  wifi_hotspots:   '#805ad5',
};

function typeColor(type) {
  return TYPE_COLORS[type] || '#718096';
}

function formatDist(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

// ── Load amenity types ────────────────────────────────────────────────────────
async function loadTypes() {
  try {
    const res = await fetch(`${API_BASE}/types`);
    const data = await res.json();
    typeSelect.innerHTML = '';
    data.types.forEach(({ type, label }) => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = label;
      typeSelect.appendChild(opt);
    });
  } catch (e) {
    typeSelect.innerHTML = '<option value="">Error loading types</option>';
  }
}

// ── Geolocation ───────────────────────────────────────────────────────────────
btnLocate.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported by this browser.', 'error');
    return;
  }
  setStatus('Requesting location…', 'loading');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      placeUserMarker(userLat, userLon);
      setStatus(`Location set: ${userLat.toFixed(5)}, ${userLon.toFixed(5)}`);
      enableActionButtons(true);
    },
    (err) => {
      setStatus(`Location error: ${err.message}`, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

function placeUserMarker(lat, lon) {
  if (userMarker) map.removeLayer(userMarker);
  userMarker = L.marker([lat, lon], {
    icon: L.divIcon({
      className: '',
      html: '<div class="user-dot"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
    zIndexOffset: 1000,
  })
    .addTo(map)
    .bindPopup('<b>You are here</b>')
    .openPopup();
  map.setView([lat, lon], 14);
}

// ── Find nearest ───────────────────────────────────────────────────────────────
btnSearch.addEventListener('click', async () => {
  if (userLat === null) return;
  const type  = typeSelect.value;
  const count = Math.min(parseInt(countInput.value, 10) || 5, 50);

  setStatus(`Fetching ${count} nearest ${type}…`, 'loading');
  clearMarkers();
  resultsList.innerHTML = '';

  try {
    const res  = await fetch(`${API_BASE}/nearest?lat=${userLat}&lon=${userLon}&type=${type}&count=${count}`);
    const data = await res.json();
    if (!res.ok) { setStatus(data.error, 'error'); return; }

    const bounds = [[userLat, userLon]];
    markersLayer = L.markerClusterGroup();

    const cards = data.amenities.map((a) => {
      bounds.push([a.lat, a.lon]);

      const marker = L.marker([a.lat, a.lon], { icon: colorIcon(typeColor(type)) })
        .bindPopup(`<b>${a.name}</b><br>${a.address || ''}<br><i>${formatDist(a.distanceKm)} away</i>`);
      markersLayer.addLayer(marker);

      const card = document.createElement('div');
      card.className = 'result-item';
      card.innerHTML = `
        <div class="ri-type">${type.replace(/_/g, ' ')}</div>
        <div class="ri-name">${a.name}</div>
        ${a.address ? `<div class="ri-addr">${a.address}</div>` : ''}
        <div class="ri-dist">${formatDist(a.distanceKm)} away</div>`;
      card.addEventListener('click', () => {
        map.setView([a.lat, a.lon], 16);
        marker.openPopup();
      });
      return card;
    });

    map.addLayer(markersLayer);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });

    renderResultsList(cards, `${data.amenities.length} Nearest ${type.replace(/_/g, ' ')}`);
    setStatus(`Showing ${data.amenities.length} nearest ${type.replace(/_/g, ' ')}.`);
  } catch (e) {
    setStatus(`Request failed: ${e.message}`, 'error');
  }
});

// ── Show clusters ──────────────────────────────────────────────────────────────
btnCluster.addEventListener('click', async () => {
  if (userLat === null) return;
  const type   = typeSelect.value;
  const radius = parseFloat(radiusInput.value) || 2;

  setStatus(`Fetching clusters of ${type} within ${radius} km…`, 'loading');
  clearMarkers();
  resultsList.innerHTML = '';

  try {
    const res  = await fetch(`${API_BASE}/clusters?lat=${userLat}&lon=${userLon}&type=${type}&radius=${radius}`);
    const data = await res.json();
    if (!res.ok) { setStatus(data.error, 'error'); return; }

    markersLayer = L.layerGroup();
    const cards = data.clusters.map((c) => {
      const circle = L.circleMarker([c.lat, c.lon], {
        radius: Math.min(8 + c.count * 2, 30),
        fillColor: typeColor(type),
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.75,
      }).bindPopup(
        `<b>Cluster of ${c.count} ${type.replace(/_/g, ' ')}</b><br>${formatDist(c.distanceKm)} away`
      );
      markersLayer.addLayer(circle);

      const card = document.createElement('div');
      card.className = 'result-item cluster-item';
      card.innerHTML = `
        <div class="ri-type">Cluster · ${type.replace(/_/g, ' ')}</div>
        <div class="ri-name">${c.count} amenities</div>
        <div class="ri-dist">${formatDist(c.distanceKm)} away</div>`;
      card.addEventListener('click', () => {
        map.setView([c.lat, c.lon], 16);
        circle.openPopup();
      });
      return card;
    });

    map.addLayer(markersLayer);
    renderResultsList(cards, `${data.clusters.length} Clusters within ${radius} km`);
    setStatus(`Showing ${data.clusters.length} cluster(s) of ${type.replace(/_/g, ' ')}.`);
  } catch (e) {
    setStatus(`Request failed: ${e.message}`, 'error');
  }
});

// ── Nearest of each type ───────────────────────────────────────────────────────
btnAllTypes.addEventListener('click', async () => {
  if (userLat === null) return;

  setStatus('Fetching nearest of each amenity type…', 'loading');
  clearMarkers();
  resultsList.innerHTML = '';

  try {
    const res  = await fetch(`${API_BASE}/nearest?lat=${userLat}&lon=${userLon}`);
    const data = await res.json();
    if (!res.ok) { setStatus(data.error, 'error'); return; }

    markersLayer = L.layerGroup();
    const cards = Object.entries(data.nearestByType).map(([type, a]) => {
      const marker = L.marker([a.lat, a.lon], { icon: colorIcon(typeColor(type)) })
        .bindPopup(`<b>${a.name}</b><br><i>${type.replace(/_/g,' ')}</i><br>${formatDist(a.distanceKm)} away`);
      markersLayer.addLayer(marker);

      const card = document.createElement('div');
      card.className = 'result-item';
      card.innerHTML = `
        <div class="ri-type">${type.replace(/_/g, ' ')}</div>
        <div class="ri-name">${a.name}</div>
        ${a.address ? `<div class="ri-addr">${a.address}</div>` : ''}
        <div class="ri-dist">${formatDist(a.distanceKm)} away</div>`;
      card.addEventListener('click', () => {
        map.setView([a.lat, a.lon], 16);
        marker.openPopup();
      });
      return card;
    });

    map.addLayer(markersLayer);
    renderResultsList(cards, 'Nearest of Each Type');
    setStatus(`Showing nearest of ${cards.length} amenity type(s).`);
  } catch (e) {
    setStatus(`Request failed: ${e.message}`, 'error');
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
loadTypes();
