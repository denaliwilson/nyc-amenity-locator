'use strict';

const { DATASETS } = require('./dataFetcher');

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

  const lat = parseFloat(row[dataset.latField]);
  const lon = parseFloat(row[dataset.lonField]);

  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < 40.4 || lat > 41.0 || lon < -74.3 || lon > -73.6) return null;

  const name = (row[dataset.nameField] || '').trim();
  if (!name) return null;

  const rawAddress = dataset.addressField ? row[dataset.addressField] : null;
  const address =
    rawAddress && typeof rawAddress === 'string'
      ? rawAddress.trim() || null
      : null;

  const id = row.objectid || row.id || row.the_geom_webmercator || `${type}_${index}`;

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
