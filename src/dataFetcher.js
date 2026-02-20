'use strict';

const axios = require('axios');

const BASE_URL = 'https://data.cityofnewyork.us/resource';

/**
 * NYC Open Data dataset definitions.
 * Each entry maps an amenity type name to its Socrata resource endpoint
 * and the field names used for latitude, longitude, and display name.
 */
const DATASETS = {
  parks: {
    url: `${BASE_URL}/enfh-gkve.json`,
    latField: 'latitude',
    lonField: 'longitude',
    nameField: 'name311',
    addressField: 'location',
    limit: 1000,
  },
  libraries: {
    url: `${BASE_URL}/p4pf-fyc4.json`,
    latField: 'latitude',
    lonField: 'longitude',
    nameField: 'name',
    addressField: 'address',
    limit: 500,
  },
  subway_stations: {
    url: `${BASE_URL}/kk4q-3rt2.json`,
    latField: 'gtfs_latitude',
    lonField: 'gtfs_longitude',
    nameField: 'stop_name',
    addressField: null,
    limit: 600,
  },
  hospitals: {
    url: `${BASE_URL}/833h-xwsx.json`,
    latField: 'latitude',
    lonField: 'longitude',
    nameField: 'facility_name',
    addressField: 'location_1_address',
    limit: 300,
  },
  restrooms: {
    url: `${BASE_URL}/hjae-yuav.json`,
    latField: 'latitude',
    lonField: 'longitude',
    nameField: 'name',
    addressField: 'location',
    limit: 500,
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
    $where: `${dataset.latField} IS NOT NULL AND ${dataset.lonField} IS NOT NULL`,
  };

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
