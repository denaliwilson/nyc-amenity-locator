'use strict';

const express = require('express');
const { DATASETS } = require('../dataFetcher');
const {
  getNearestAmenities,
  getNearestOfEachType,
  getNearbyClusters,
} = require('../amenityService');

const router = express.Router();

/**
 * Validate that lat and lon query parameters are finite numbers inside NYC bounds.
 */
function parseCoords(query) {
  const lat = parseFloat(query.lat);
  const lon = parseFloat(query.lon);
  if (!isFinite(lat) || !isFinite(lon)) {
    return { error: 'lat and lon must be valid numbers' };
  }
  if (lat < 40.4 || lat > 41.0 || lon < -74.3 || lon > -73.6) {
    return { error: 'Coordinates appear to be outside New York City bounds' };
  }
  return { lat, lon };
}

/**
 * GET /api/types
 * Returns the list of supported amenity types.
 */
router.get('/types', (req, res) => {
  const types = Object.keys(DATASETS).map((key) => ({
    type: key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
  res.json({ types });
});

/**
 * GET /api/nearest?lat=&lon=&type=&count=
 * Returns the nearest amenities of a single type.
 * Omit `type` to get the single nearest of every type.
 */
router.get('/nearest', async (req, res) => {
  const coords = parseCoords(req.query);
  if (coords.error) {
    return res.status(400).json({ error: coords.error });
  }
  const { lat, lon } = coords;

  const { type } = req.query;
  const count = Math.min(parseInt(req.query.count, 10) || 5, 50);

  try {
    if (!type) {
      const result = await getNearestOfEachType(lat, lon);
      return res.json({ lat, lon, nearestByType: result });
    }

    if (!DATASETS[type]) {
      return res.status(400).json({
        error: `Unknown type "${type}". Use GET /api/types for valid options.`,
      });
    }

    const amenities = await getNearestAmenities(type, lat, lon, count);
    return res.json({ lat, lon, type, count: amenities.length, amenities });
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch data: ${err.message}` });
  }
});

/**
 * GET /api/clusters?lat=&lon=&type=&radius=&gridSize=
 * Returns nearby clusters of a given amenity type.
 */
router.get('/clusters', async (req, res) => {
  const coords = parseCoords(req.query);
  if (coords.error) {
    return res.status(400).json({ error: coords.error });
  }
  const { lat, lon } = coords;

  const { type } = req.query;
  if (!type) {
    return res.status(400).json({ error: '"type" query parameter is required' });
  }
  if (!DATASETS[type]) {
    return res.status(400).json({
      error: `Unknown type "${type}". Use GET /api/types for valid options.`,
    });
  }

  const radiusKm = Math.min(parseFloat(req.query.radius) || 2, 10);
  const gridSize = Math.min(parseFloat(req.query.gridSize) || 0.005, 0.05);

  try {
    const clusters = await getNearbyClusters(type, lat, lon, radiusKm, gridSize);
    return res.json({ lat, lon, type, radiusKm, clusters });
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch data: ${err.message}` });
  }
});

module.exports = router;
