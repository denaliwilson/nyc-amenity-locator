# nyc-amenity-locator
Project to quickly and easily find nearby amenities tracked through open data nyc.

## Features

- 🗺️ Interactive Leaflet map centred on New York City
- 📍 One-click geolocation – finds amenities relative to your current position
- 🔍 **Nearest amenities** – returns the *N* closest of any supported type
- ⭐ **Nearest of each type** – shows the single closest park, library, subway station, hospital, and restroom all at once
- 🔵 **Cluster view** – groups amenities in a configurable radius into visual clusters with a count badge
- Data sourced live from the [NYC Open Data API](https://opendata.cityofnewyork.us/) with one-hour in-memory caching

## Supported Amenity Types

| Type | Dataset |
|---|---|
| Parks | `enfh-gkve` (DPR Facilities) |
| Libraries | `p4pf-fyc4` (NYC Libraries) |
| Subway Stations | `kk4q-3rt2` (MTA GTFS Stops) |
| Hospitals | `833h-xwsx` (NYC Health Facilities) |
| Public Restrooms | `hjae-yuav` (NYC Restrooms) |

## Requirements

- Node.js ≥ 18

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. (Optional) copy .env.example and customise
cp .env.example .env

# 3. Start the server
npm start
# → http://localhost:3000
```

Open your browser at **http://localhost:3000**, click **📍 Use My Location**, then use
the controls in the sidebar to search.

## API Reference

All responses are JSON. Coordinate parameters must fall within NYC bounds
(`lat` 40.4–41.0, `lon` -74.3 to -73.6).

### `GET /api/types`
Returns all supported amenity type keys and display labels.

```json
{
  "types": [
    { "type": "parks", "label": "Parks" },
    ...
  ]
}
```

### `GET /api/nearest`

| Param | Required | Description |
|---|---|---|
| `lat` | ✅ | User latitude |
| `lon` | ✅ | User longitude |
| `type` | ❌ | Amenity type. Omit to get nearest of **every** type |
| `count` | ❌ | Number of results (default 5, max 50) |

**With `type`:**
```json
{
  "lat": 40.7128, "lon": -74.006,
  "type": "parks", "count": 3,
  "amenities": [
    { "id": "...", "name": "Battery Park", "address": "...", "lat": 40.70, "lon": -74.01, "distanceKm": 0.42 }
  ]
}
```

**Without `type`** – returns `nearestByType` map:
```json
{
  "lat": 40.7128, "lon": -74.006,
  "nearestByType": {
    "parks":    { ... },
    "libraries": { ... }
  }
}
```

### `GET /api/clusters`

| Param | Required | Description |
|---|---|---|
| `lat` | ✅ | User latitude |
| `lon` | ✅ | User longitude |
| `type` | ✅ | Amenity type |
| `radius` | ❌ | Search radius in km (default 2, max 10) |
| `gridSize` | ❌ | Grid cell size in degrees (default 0.005 ≈ 500 m) |

```json
{
  "lat": 40.7128, "lon": -74.006,
  "type": "parks", "radiusKm": 2,
  "clusters": [
    { "lat": 40.714, "lon": -73.998, "count": 4, "distanceKm": 0.88, "amenities": [ ... ] }
  ]
}
```

## Project Structure

```
nyc-amenity-locator/
├── server.js              # Express entry point
├── src/
│   ├── dataFetcher.js     # NYC Open Data API client with caching
│   ├── dataCleaner.js     # Normalise & validate raw API rows
│   ├── amenityService.js  # Nearest-neighbour & clustering logic
│   └── routes/
│       └── amenities.js   # REST API routes
├── public/
│   ├── index.html         # App shell
│   ├── app.js             # Frontend (Leaflet map + UI)
│   └── styles.css         # Styles
└── tests/
    ├── dataCleaner.test.js
    └── amenityService.test.js
```

## Running Tests

```bash
npm test
```

