'use strict';

const { cleanAmenity, cleanAmenities } = require('../src/dataCleaner');

// Minimal DATASETS mock so cleanAmenity can resolve field names
jest.mock('../src/dataFetcher', () => ({
  DATASETS: {
    parks: {
      latField: 'latitude',
      lonField: 'longitude',
      nameField: 'name311',
      addressField: 'location',
    },
    libraries: {
      latField: 'latitude',
      lonField: 'longitude',
      nameField: 'name',
      addressField: 'address',
    },
    subway_stations: {
      latField: 'gtfs_latitude',
      lonField: 'gtfs_longitude',
      nameField: 'stop_name',
      addressField: null,
    },
  },
}));

describe('cleanAmenity', () => {
  it('returns a well-formed amenity object for valid input', () => {
    const row = { objectid: '42', name311: 'Central Park', latitude: '40.7829', longitude: '-73.9654', location: '59th to 110th Street' };
    const result = cleanAmenity(row, 'parks', 0);
    expect(result).toEqual({
      id: '42',
      type: 'parks',
      name: 'Central Park',
      address: '59th to 110th Street',
      lat: 40.7829,
      lon: -73.9654,
    });
  });

  it('returns null when latitude is missing', () => {
    const row = { objectid: '1', name311: 'Some Park', longitude: '-73.9' };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null when longitude is missing', () => {
    const row = { objectid: '1', name311: 'Some Park', latitude: '40.7' };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null when name is empty', () => {
    const row = { objectid: '1', name311: '  ', latitude: '40.7', longitude: '-74.0' };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null for coordinates outside NYC bounds (lat too low)', () => {
    const row = { objectid: '1', name311: 'Out of bounds', latitude: '34.0', longitude: '-74.0' };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null for coordinates outside NYC bounds (lon too far west)', () => {
    const row = { objectid: '1', name311: 'Out of bounds', latitude: '40.7', longitude: '-80.0' };
    expect(cleanAmenity(row, 'parks', 0)).toBeNull();
  });

  it('returns null for an unknown amenity type', () => {
    const row = { objectid: '1', name: 'x', latitude: '40.7', longitude: '-74.0' };
    expect(cleanAmenity(row, 'unknown_type', 0)).toBeNull();
  });

  it('falls back to index-based id when objectid is absent', () => {
    const row = { name311: 'Riverside Park', latitude: '40.8010', longitude: '-73.9714' };
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
    const row = { objectid: '2', name311: 'Bryant Park', latitude: '40.7536', longitude: '-73.9832', location: '' };
    const result = cleanAmenity(row, 'parks', 0);
    expect(result.address).toBeNull();
  });
});

describe('cleanAmenities', () => {
  it('filters out invalid rows and keeps valid ones', () => {
    const rows = [
      { objectid: '1', name311: 'Good Park', latitude: '40.75', longitude: '-73.98' },
      { objectid: '2', name311: '', latitude: '40.75', longitude: '-73.98' },      // no name
      { objectid: '3', name311: 'Another Park', latitude: 'bad', longitude: '-73.98' }, // bad lat
      { objectid: '4', name311: 'Third Park', latitude: '40.76', longitude: '-73.97' },
    ];
    const result = cleanAmenities(rows, 'parks');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Good Park');
    expect(result[1].name).toBe('Third Park');
  });

  it('deduplicates by id', () => {
    const rows = [
      { objectid: '5', name311: 'Park A', latitude: '40.75', longitude: '-73.98' },
      { objectid: '5', name311: 'Park A duplicate', latitude: '40.76', longitude: '-73.97' },
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
