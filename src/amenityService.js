'use strict';

const { fetchAmenityData, DATASETS } = require('./dataFetcher');
const { cleanAmenities } = require('./dataCleaner');

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance between two lat/lon points in kilometres.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in km
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Fetches, cleans and returns all amenities for a given type.
 *
 * @param {string} type - Amenity type key
 * @returns {Promise<Array>}
 */
async function getAmenities(type) {
  const raw = await fetchAmenityData(type);
  return cleanAmenities(raw, type);
}

/**
 * Returns the `count` nearest amenities of `type` to the given location,
 * each annotated with a `distanceKm` property.
 *
 * @param {string} type       - Amenity type key
 * @param {number} userLat    - User latitude
 * @param {number} userLon    - User longitude
 * @param {number} [count=5]  - Number of results
 * @returns {Promise<Array>}
 */
async function getNearestAmenities(type, userLat, userLon, count = 5) {
  const amenities = await getAmenities(type);

  return amenities
    .map((a) => ({
      ...a,
      distanceKm: haversineKm(userLat, userLon, a.lat, a.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}

/**
 * Returns the nearest amenity of each supported type to the given location.
 * Types with no data are omitted from the result.
 *
 * @param {number} userLat
 * @param {number} userLon
 * @returns {Promise<Object>} Map of type -> nearest amenity
 */
async function getNearestOfEachType(userLat, userLon) {
  const types = Object.keys(DATASETS);
  const results = {};

  await Promise.all(
    types.map(async (type) => {
      try {
        const nearest = await getNearestAmenities(type, userLat, userLon, 1);
        if (nearest.length > 0) {
          results[type] = nearest[0];
        }
      } catch (_err) {
        // Skip types that fail to fetch
      }
    })
  );

  return results;
}

/**
 * Simple grid-based clustering. Amenities within `gridSizeDeg` degrees of
 * each other are grouped into one cluster.
 *
 * @param {Array}  amenities    - Cleaned amenity objects
 * @param {number} gridSizeDeg  - Cell size in degrees (default 0.005 ≈ 500 m)
 * @returns {Array<{ lat: number, lon: number, count: number, amenities: Array }>}
 */
function clusterAmenities(amenities, gridSizeDeg = 0.005) {
  const cells = new Map();

  for (const amenity of amenities) {
    const cellLat = Math.floor(amenity.lat / gridSizeDeg);
    const cellLon = Math.floor(amenity.lon / gridSizeDeg);
    const key = `${cellLat}:${cellLon}`;

    if (!cells.has(key)) {
      cells.set(key, { lat: 0, lon: 0, count: 0, amenities: [] });
    }

    const cell = cells.get(key);
    cell.count += 1;
    cell.lat += amenity.lat;
    cell.lon += amenity.lon;
    cell.amenities.push(amenity);
  }

  return Array.from(cells.values()).map((cell) => ({
    lat: cell.lat / cell.count,
    lon: cell.lon / cell.count,
    count: cell.count,
    amenities: cell.amenities,
  }));
}

/**
 * Returns clusters of a given amenity type within `radiusKm` of the user,
 * sorted by distance to cluster centroid.
 *
 * @param {string} type
 * @param {number} userLat
 * @param {number} userLon
 * @param {number} [radiusKm=2]
 * @param {number} [gridSizeDeg=0.005]
 * @returns {Promise<Array>}
 */
async function getNearbyClusters(type, userLat, userLon, radiusKm = 2, gridSizeDeg = 0.005) {
  const amenities = await getAmenities(type);

  const nearby = amenities.filter(
    (a) => haversineKm(userLat, userLon, a.lat, a.lon) <= radiusKm
  );

  const clusters = clusterAmenities(nearby, gridSizeDeg);

  return clusters
    .map((c) => ({
      ...c,
      distanceKm: haversineKm(userLat, userLon, c.lat, c.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

module.exports = {
  haversineKm,
  getAmenities,
  getNearestAmenities,
  getNearestOfEachType,
  clusterAmenities,
  getNearbyClusters,
};
