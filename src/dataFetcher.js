'use strict';

const axios = require('axios');

const NYC_BASE = 'https://data.cityofnewyork.us/resource';

/**
 * NYC Open Data dataset definitions.
 * Each entry maps an amenity type name to its Socrata resource endpoint
 * and the field names used for latitude, longitude, and display name.
 *
 * Some datasets store geometry in a GeoJSON field instead of separate
 * lat/lon columns.  When `geoField` is set the cleaner will extract
 * coordinates from that field (Point → [lon,lat]; MultiPolygon →
 * centroid of all coordinates).
 */
const DATASETS = {
  parks: {
    url: `${NYC_BASE}/enfh-gkve.json`,
    latField: null,
    lonField: null,
    geoField: 'multipolygon',      // centroid computed in dataCleaner
    nameField: 'name311',
    addressField: 'location',
    limit: 1000,
  },
  libraries: {
    url: `${NYC_BASE}/feuq-due4.json`,
    latField: null,
    lonField: null,
    geoField: 'the_geom',          // Point GeoJSON [lon, lat]
    nameField: 'name',
    addressField: null,             // built from housenum + streetname in cleaner
    limit: 500,
  },
  subway_stations: {
    url: 'https://data.ny.gov/resource/39hk-dx4f.json',
    latField: 'gtfs_latitude',
    lonField: 'gtfs_longitude',
    nameField: 'stop_name',
    addressField: null,
    limit: 600,
  },
  hospitals: {
    url: 'https://health.data.ny.gov/resource/vn5v-hh5r.json',
    latField: 'latitude',
    lonField: 'longitude',
    nameField: 'facility_name',
    addressField: 'address1',
    limit: 500,
    extraWhere: "county in ('New York','Bronx','Kings','Queens','Richmond')",
  },
  wifi_hotspots: {
    url: `${NYC_BASE}/yjub-udmw.json`,
    latField: 'latitude',
    lonField: 'longitude',
    nameField: 'name',
    addressField: 'location',
    limit: 1000,
  },
};

/** Simple in-memory TTL cache: { key -> { data, expiresAt } } */
const cache = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns raw rows from NYC Open Data for a given amenity type.
 * Results are cached in memory for CACHE_TTL_MS milliseconds.
 *
 * @param {string} type - Amenity type key (must exist in DATASETS)
 * @returns {Promise<Object[]>} Raw API rows
 */
async function fetchAmenityData(type) {
  const now = Date.now();

  if (cache[type] && cache[type].expiresAt > now) {
    return cache[type].data;
  }

  const dataset = DATASETS[type];
  if (!dataset) {
    throw new Error(`Unknown amenity type: ${type}`);
  }

  const params = {
    $limit: dataset.limit,
  };

  // Build $where – only include lat/lon IS NOT NULL when columns exist.
  const whereParts = [];
  if (dataset.latField && dataset.lonField) {
    whereParts.push(`${dataset.latField} IS NOT NULL AND ${dataset.lonField} IS NOT NULL`);
  }
  if (dataset.extraWhere) {
    whereParts.push(dataset.extraWhere);
  }
  if (whereParts.length > 0) {
    params.$where = whereParts.join(' AND ');
  }

  const response = await axios.get(dataset.url, { params, timeout: 15000 });
  const rows = response.data;

  cache[type] = { data: rows, expiresAt: now + CACHE_TTL_MS };
  return rows;
}

/**
 * Clears the in-memory cache for a specific type or all types.
 *
 * @param {string|null} type - Amenity type to clear, or null to clear all
 */
function clearCache(type = null) {
  if (type) {
    delete cache[type];
  } else {
    Object.keys(cache).forEach((k) => delete cache[k]);
  }
}

module.exports = { fetchAmenityData, clearCache, DATASETS };
