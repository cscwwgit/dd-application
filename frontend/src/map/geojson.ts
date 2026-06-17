import type { AssetState, HistoryPoint, PredictedPoint, RestrictedZone } from '../api/types';

export function assetsToGeoJSON(assets: AssetState[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: assets.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: {
        id: a.id,
        callsign: a.callsign,
        asset_type: a.asset_type,
        heading_deg: a.heading_deg,
        speed_mps: a.speed_mps,
        altitude_m: a.altitude_m,
        threat_level: a.threat_level,
        tte_seconds: a.tte_seconds,
        distance_to_nearest_zone_m: a.distance_to_nearest_zone_m,
        nearest_zone_id: a.nearest_zone_id,
        updated_at: a.updated_at,
      },
    })),
  };
}

export function zonesToGeoJSON(zones: RestrictedZone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      geometry: z.geojson as GeoJSON.Geometry,
      properties: { id: z.id, name: z.name },
    })),
  };
}

export function historyToGeoJSON(history: HistoryPoint[]): GeoJSON.FeatureCollection {
  if (history.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: history.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      },
    ],
  };
}

export function predictedToGeoJSON(points: PredictedPoint[]): GeoJSON.FeatureCollection {
  if (points.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      },
    ],
  };
}
