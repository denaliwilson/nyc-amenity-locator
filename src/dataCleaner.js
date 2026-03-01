'use strict';

const { DATASETS } = require('./dataFetcher');

/**
 * Computes the centroid (average lat/lon) of a GeoJSON MultiPolygon
 * or Polygon by averaging every coordinate in all rings.
 *
 * @param {Object} geom - GeoJSON geometry with `coordinates`
 * @returns {{ lat: number, lon: number } | null}
 */
function centroidOfGeometry(geom) {
  if (!geom || !geom.coordinates) return null;

  let sumLat = 0;
  let sumLon = 0;
  let count = 0;

  function visit(coords) {
    if (typeof coords[0] === 'number') {
      // [lon, lat]
      sumLon += coords[0];
      sumLat += coords[1];
      count += 1;
    } else {
      for (const child of coords) visit(child);
    }
  }

  visit(geom.coordinates);
  if (count === 0) return null;
  return { lat: sumLat / count, lon: sumLon / count };
}

/**
 * Normalizes a raw NYC Open Data row into a consistent amenity object:
 *   { id, type, name, address, lat, lon }
 *
 * Returns null if the row lacks valid coordinates or a name.
 *
 * @param {Object} row   - Raw row from the NYC Open Data API
 * @param {string} type  - Amenity type key (e.g. 'parks', 'libraries')
 * @param {number} index - Row index used to build a fallback id
 * @returns {{ id: string, type: string, name: string, address: string|null, lat: number, lon: number }|null}
 */
function cleanAmenity(row, type, index) {
  const dataset = DATASETS[type];
  if (!dataset) return null;

  // ── Resolve lat / lon ───────────────────────────────────────────────
  let lat, lon;

  if (dataset.geoField) {
    // Coordinates are stored in a GeoJSON geometry field (Point or MultiPolygon)
    const geom = row[dataset.geoField];
    if (!geom) return null;

    if (geom.type === 'Point') {
      // GeoJSON Point: [lon, lat]
      lon = parseFloat(geom.coordinates[0]);
      lat = parseFloat(geom.coordinates[1]);
    } else {
      // Polygon / MultiPolygon – compute centroid
      const c = centroidOfGeometry(geom);
      if (!c) return null;
      lat = c.lat;
      lon = c.lon;
    }
  } else {
    lat = parseFloat(row[dataset.latField]);
    lon = parseFloat(row[dataset.lonField]);
  }

  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < 40.4 || lat > 41.0 || lon < -74.3 || lon > -73.6) return null;

  // ── Name ────────────────────────────────────────────────────────────
  const name = (row[dataset.nameField] || '').trim();
  if (!name) return null;

  // ── Address ─────────────────────────────────────────────────────────
  let address = null;
  if (dataset.addressField) {
    const rawAddress = row[dataset.addressField];
    address =
      rawAddress && typeof rawAddress === 'string'
        ? rawAddress.trim() || null
        : null;
  }

  // Libraries: build address from housenum + streetname
  if (type === 'libraries' && !address) {
    const parts = [row.housenum, row.streetname, row.city].filter(Boolean);
    address = parts.length > 0 ? parts.join(' ') : null;
  }

  const id = row.objectid || row.id || row.station_id || row.fac_id || row.the_geom_webmercator || `${type}_${index}`;

  return {
    id: String(id),
    type,
    name,
    address,
    lat,
    lon,
  };
}

/**
 * Cleans an array of raw rows for a given amenity type.
 * Drops records that fail validation and deduplicates by id.
 *
 * @param {Object[]} rows - Raw rows from NYC Open Data
 * @param {string}   type - Amenity type key
 * @returns {Array<{ id: string, type: string, name: string, address: string|null, lat: number, lon: number }>}
 */
function cleanAmenities(rows, type) {
  const seen = new Set();
  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const amenity = cleanAmenity(rows[i], type, i);
    if (!amenity) continue;
    if (seen.has(amenity.id)) continue;
    seen.add(amenity.id);
    result.push(amenity);
  }

  return result;
}

module.exports = { cleanAmenity, cleanAmenities };
