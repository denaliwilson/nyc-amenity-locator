'use strict';

const { cleanAmenity, cleanAmenities } = require('../src/dataCleaner');

// Minimal DATASETS mock so cleanAmenity can resolve field names
jest.mock('../src/dataFetcher', () => ({
  DATASETS: {
    parks: {
      latField: null,
      lonField: null,
      geoField: 'multipolygon',
      nameField: 'name311',
      addressField: 'location',
    },
    libraries: {
      latField: null,
      lonField: null,
      geoField: 'the_geom',
      nameField: 'name',
      addressField: null,
    },
    subway_stations: {
      latField: 'gtfs_latitude',
      lonField: 'gtfs_longitude',
      nameField: 'stop_name',
      addressField: null,
    },
  },
}));

// Helper: build a MultiPolygon GeoJSON from a single coordinate (simple test polygon)
function simpleMultiPolygon(lon, lat) {
  return { type: 'MultiPolygon', coordinates: [[[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat + 0.001], [lon, lat]]]] };
}

// Helper: build a Point GeoJSON
function geoPoint(lon, lat) {
  return { type: 'Point', coordinates: [lon, lat] };
}

describe('cleanAmenity', () => {
  it('returns a well-formed amenity object for valid input (multipolygon park)', () => {
    const row = { objectid: '42', name311: 'Central Park', multipolygon: simpleMultiPolygon(-73.9654, 40.7829), location: '59th to 110th Street' };
    const result = cleanAmenity(row, 'parks', 0);
    expect(result).not.toBeNull();
    expect(result.id).toBe('42');
    expect(result.type).toBe('parks');
    expect(result.name).toBe('Central Park');
    expect(result.address).toBe('59th to 110th Street');
    expect(result.lat).toBeCloseTo(40.7832, 2);
    expect(result.lon).toBeCloseTo(-73.9651, 2);
  });

  it('returns null when geometry is missing', () => {
    const row = { objectid: '1', name311: 'Some Park' };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null when geometry has no coordinates', () => {
    const row = { objectid: '1', name311: 'Some Park', multipolygon: { type: 'MultiPolygon' } };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null when name is empty', () => {
    const row = { objectid: '1', name311: '  ', multipolygon: simpleMultiPolygon(-74.0, 40.7) };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null for coordinates outside NYC bounds (lat too low)', () => {
    const row = { objectid: '1', name311: 'Out of bounds', multipolygon: simpleMultiPolygon(-74.0, 34.0) };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null for coordinates outside NYC bounds (lon too far west)', () => {
    const row = { objectid: '1', name311: 'Out of bounds', multipolygon: simpleMultiPolygon(-80.0, 40.7) };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null for an unknown amenity type', () => {
    const row = { objectid: '1', name: 'x', latitude: '40.7', longitude: '-74.0' };
    expect(cleanAmenity(row, 'unknown_type', 0)).toBeNull();
  });

  it('falls back to index-based id when objectid is absent', () => {
    const row = { name311: 'Riverside Park', multipolygon: simpleMultiPolygon(-73.9714, 40.8010) };
    const result = cleanAmenity(row, 'parks', 7);
    expect(result.id).toBe('parks_7');
  });

  it('sets address to null when addressField is null (subway_stations)', () => {
    const row = { objectid: '10', stop_name: '42 St-Times Sq', gtfs_latitude: '40.7580', gtfs_longitude: '-73.9855' };
    const result = cleanAmenity(row, 'subway_stations', 0);
    expect(result).not.toBeNull();
    expect(result.address).toBeNull();
  });

  it('sets address to null when the address field value is empty string', () => {
    const row = { objectid: '2', name311: 'Bryant Park', multipolygon: simpleMultiPolygon(-73.9832, 40.7536), location: '' };
    const result = cleanAmenity(row, 'parks', 0);
    expect(result.address).toBeNull();
  });

  it('extracts coordinates from Point GeoJSON (libraries)', () => {
    const row = { name: '53rd Street', housenum: '18', streetname: 'West 53rd Street', city: 'New York', the_geom: geoPoint(-73.9774, 40.7608) };
    const result = cleanAmenity(row, 'libraries', 0);
    expect(result).not.toBeNull();
    expect(result.lat).toBeCloseTo(40.7608, 4);
    expect(result.lon).toBeCloseTo(-73.9774, 4);
    expect(result.address).toBe('18 West 53rd Street New York');
  });
});

describe('cleanAmenities', () => {
  it('filters out invalid rows and keeps valid ones', () => {
    const rows = [
      { objectid: '1', name311: 'Good Park', multipolygon: simpleMultiPolygon(-73.98, 40.75) },
      { objectid: '2', name311: '', multipolygon: simpleMultiPolygon(-73.98, 40.75) },      // no name
      { objectid: '3', name311: 'Another Park' },                                           // no geometry
      { objectid: '4', name311: 'Third Park', multipolygon: simpleMultiPolygon(-73.97, 40.76) },
    ];
    const result = cleanAmenities(rows, 'parks');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Good Park');
    expect(result[1].name).toBe('Third Park');
  });

  it('deduplicates by id', () => {
    const rows = [
      { objectid: '5', name311: 'Park A', multipolygon: simpleMultiPolygon(-73.98, 40.75) },
      { objectid: '5', name311: 'Park A duplicate', multipolygon: simpleMultiPolygon(-73.97, 40.76) },
    ];
    const result = cleanAmenities(rows, 'parks');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Park A');
  });

  it('returns an empty array when all rows are invalid', () => {
    const result = cleanAmenities([{ objectid: '1' }], 'parks');
    expect(result).toHaveLength(0);
  });
});
