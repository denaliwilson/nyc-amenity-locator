'use strict';

const {
  haversineKm,
  getNearestAmenities,
  getNearestOfEachType,
  clusterAmenities,
  getNearbyClusters,
} = require('../src/amenityService');

// Mock dataFetcher so tests never hit the real API
jest.mock('../src/dataFetcher', () => ({
  DATASETS: {
    parks:           { latField: 'latitude', lonField: 'longitude', nameField: 'name311', addressField: 'location', limit: 10 },
    subway_stations: { latField: 'gtfs_latitude', lonField: 'gtfs_longitude', nameField: 'stop_name', addressField: null, limit: 10 },
  },
  fetchAmenityData: jest.fn(),
}));

const { fetchAmenityData } = require('../src/dataFetcher');

// Helper: build a minimal valid parks row
function parkRow(id, name, lat, lon) {
  return { objectid: String(id), name311: name, latitude: String(lat), longitude: String(lon) };
}

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it('returns a positive value for distinct points', () => {
    const dist = haversineKm(40.7128, -74.006, 40.7580, -73.9855);
    expect(dist).toBeGreaterThan(0);
  });

  it('is approximately symmetric', () => {
    const d1 = haversineKm(40.7, -74.0, 40.8, -73.9);
    const d2 = haversineKm(40.8, -73.9, 40.7, -74.0);
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-9);
  });

  it('calculates a known distance correctly (Times Sq → Central Park ≈ 3.1 km)', () => {
    const dist = haversineKm(40.758, -73.9855, 40.7829, -73.9654);
    expect(dist).toBeGreaterThan(2.5);
    expect(dist).toBeLessThan(4.0);
  });
});

describe('getNearestAmenities', () => {
  const userLat = 40.7128;
  const userLon = -74.006;

  beforeEach(() => {
    fetchAmenityData.mockResolvedValue([
      parkRow(1, 'Close Park',  40.7130, -74.006),
      parkRow(2, 'Medium Park', 40.7200, -74.006),
      parkRow(3, 'Far Park',    40.7500, -74.006),
    ]);
  });

  it('returns results sorted by distance ascending', async () => {
    const result = await getNearestAmenities('parks', userLat, userLon, 3);
    expect(result[0].name).toBe('Close Park');
    expect(result[1].name).toBe('Medium Park');
    expect(result[2].name).toBe('Far Park');
  });

  it('respects the count limit', async () => {
    const result = await getNearestAmenities('parks', userLat, userLon, 2);
    expect(result).toHaveLength(2);
  });

  it('annotates results with distanceKm', async () => {
    const result = await getNearestAmenities('parks', userLat, userLon, 1);
    expect(result[0]).toHaveProperty('distanceKm');
    expect(typeof result[0].distanceKm).toBe('number');
  });

  it('returns empty array when no amenities exist', async () => {
    fetchAmenityData.mockResolvedValue([]);
    const result = await getNearestAmenities('parks', userLat, userLon, 5);
    expect(result).toHaveLength(0);
  });
});

describe('getNearestOfEachType', () => {
  it('returns one result per type', async () => {
    fetchAmenityData.mockImplementation((type) => {
      if (type === 'parks') return Promise.resolve([parkRow(1, 'A Park', 40.71, -74.0)]);
      if (type === 'subway_stations') return Promise.resolve([
        { objectid: '10', stop_name: 'Canal St', gtfs_latitude: '40.7185', gtfs_longitude: '-74.0006' },
      ]);
      return Promise.resolve([]);
    });

    const result = await getNearestOfEachType(40.7128, -74.006);
    expect(result).toHaveProperty('parks');
    expect(result).toHaveProperty('subway_stations');
  });

  it('skips types where fetch throws', async () => {
    fetchAmenityData.mockImplementation((type) => {
      if (type === 'parks') return Promise.reject(new Error('API down'));
      return Promise.resolve([{ objectid: '10', stop_name: 'Wall St', gtfs_latitude: '40.7074', gtfs_longitude: '-74.0113' }]);
    });

    const result = await getNearestOfEachType(40.7128, -74.006);
    expect(result).not.toHaveProperty('parks');
    expect(result).toHaveProperty('subway_stations');
  });
});

describe('clusterAmenities', () => {
  // A and B share the same 0.005° grid cell; C is in a different cell
  const amenities = [
    { id: '1', type: 'parks', name: 'A', lat: 40.710, lon: -74.000, address: null },
    { id: '2', type: 'parks', name: 'B', lat: 40.711, lon: -73.999, address: null }, // same cell as A
    { id: '3', type: 'parks', name: 'C', lat: 40.760, lon: -74.000, address: null }, // different cell
  ];

  it('groups nearby amenities into a single cluster', () => {
    const clusters = clusterAmenities(amenities, 0.005);
    expect(clusters).toHaveLength(2);
    const bigCluster = clusters.find((c) => c.count === 2);
    expect(bigCluster).toBeDefined();
  });

  it('cluster centroid is the average of member coordinates', () => {
    const clusters = clusterAmenities(amenities, 0.005);
    const big = clusters.find((c) => c.count === 2);
    expect(big).toBeDefined();
    expect(big.lat).toBeCloseTo((40.710 + 40.711) / 2, 5);
    expect(big.lon).toBeCloseTo((-74.000 + -73.999) / 2, 5);
  });

  it('returns empty array for empty input', () => {
    expect(clusterAmenities([], 0.005)).toHaveLength(0);
  });

  it('each amenity forms its own cluster at tiny grid size', () => {
    const clusters = clusterAmenities(amenities, 0.0001);
    expect(clusters).toHaveLength(3);
  });
});

describe('getNearbyClusters', () => {
  it('only includes amenities within the given radius', async () => {
    fetchAmenityData.mockResolvedValue([
      parkRow(1, 'Near Park',  40.713, -74.006),  // ~0.1 km from user
      parkRow(2, 'Far Park',   40.900, -74.006),  // >10 km from user
    ]);
    const clusters = await getNearbyClusters('parks', 40.7128, -74.006, 2, 0.005);
    expect(clusters.every((c) => c.distanceKm <= 2)).toBe(true);
  });

  it('annotates clusters with distanceKm', async () => {
    fetchAmenityData.mockResolvedValue([parkRow(1, 'Park', 40.713, -74.006)]);
    const clusters = await getNearbyClusters('parks', 40.7128, -74.006, 2, 0.005);
    if (clusters.length > 0) {
      expect(clusters[0]).toHaveProperty('distanceKm');
    }
  });
});
