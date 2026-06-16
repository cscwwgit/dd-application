"""Geospatial utility functions."""
from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_000.0


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in metres between two lat/lon points."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return initial bearing in degrees (0–360) from point 1 to point 2."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def project_point(lat: float, lon: float, heading_deg: float, distance_m: float) -> tuple[float, float]:
    """Project a point forward by distance_m along heading_deg. Returns (lat, lon)."""
    heading_rad = math.radians(heading_deg)
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    angular = distance_m / EARTH_RADIUS_M

    new_lat = math.asin(
        math.sin(lat_rad) * math.cos(angular)
        + math.cos(lat_rad) * math.sin(angular) * math.cos(heading_rad)
    )
    new_lon = lon_rad + math.atan2(
        math.sin(heading_rad) * math.sin(angular) * math.cos(lat_rad),
        math.cos(angular) - math.sin(lat_rad) * math.sin(new_lat),
    )
    return math.degrees(new_lat), math.degrees(new_lon)


def point_in_polygon(lat: float, lon: float, polygon_coords: list[list[float]]) -> bool:
    """
    Ray-casting algorithm to test if (lat, lon) is inside a GeoJSON polygon ring.
    polygon_coords is a list of [lon, lat] pairs (GeoJSON convention).
    """
    x, y = lon, lat
    n = len(polygon_coords)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon_coords[i][0], polygon_coords[i][1]
        xj, yj = polygon_coords[j][0], polygon_coords[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def point_in_zone(lat: float, lon: float, geojson: dict) -> bool:
    """Test if (lat, lon) is inside any ring of a GeoJSON Polygon or MultiPolygon."""
    geom_type = geojson.get("type")
    if geom_type == "Feature":
        return point_in_zone(lat, lon, geojson["geometry"])
    if geom_type == "Polygon":
        coords = geojson["coordinates"]
        return point_in_polygon(lat, lon, coords[0])
    if geom_type == "MultiPolygon":
        for polygon in geojson["coordinates"]:
            if point_in_polygon(lat, lon, polygon[0]):
                return True
    return False


def polygon_boundary_points(polygon_coords: list[list[float]]) -> list[tuple[float, float]]:
    """Return (lat, lon) tuples for all vertices of a polygon ring."""
    return [(c[1], c[0]) for c in polygon_coords]


def nearest_zone_distance_m(
    lat: float, lon: float, zones: list[dict]
) -> tuple[str | None, float | None]:
    """
    Return (zone_id, distance_m) for the nearest zone.
    If inside a zone, distance is 0.
    Approximates zone edge distance by sampling boundary vertices.
    """
    best_id: str | None = None
    best_dist: float | None = None

    for zone in zones:
        if point_in_zone(lat, lon, zone["geojson"]):
            return zone["id"], 0.0

        geom = zone["geojson"]
        geom_type = geom.get("type")
        if geom_type == "Feature":
            geom = geom["geometry"]
            geom_type = geom.get("type")

        rings: list[list[list[float]]] = []
        if geom_type == "Polygon":
            rings = [geom["coordinates"][0]]
        elif geom_type == "MultiPolygon":
            rings = [p[0] for p in geom["coordinates"]]

        for ring in rings:
            for coord in ring:
                d = haversine_distance_m(lat, lon, coord[1], coord[0])
                if best_dist is None or d < best_dist:
                    best_dist = d
                    best_id = zone["id"]

    return best_id, best_dist


def project_path(
    lat: float,
    lon: float,
    heading_deg: float,
    speed_mps: float,
    duration_seconds: int,
    step_seconds: int,
) -> list[tuple[float, float]]:
    """Project a path forward in time. Returns list of (lat, lon) waypoints."""
    points: list[tuple[float, float]] = []
    current_lat, current_lon = lat, lon
    for t in range(step_seconds, duration_seconds + step_seconds, step_seconds):
        dist = speed_mps * step_seconds
        current_lat, current_lon = project_point(current_lat, current_lon, heading_deg, dist)
        points.append((current_lat, current_lon))
    return points


def project_path_turn_rate(
    lat: float,
    lon: float,
    heading_deg: float,
    speed_mps: float,
    turn_rate_deg_per_s: float,
    duration_seconds: int,
    step_seconds: int,
) -> list[tuple[float, float]]:
    """
    Project a curved path by applying a constant turn rate each step.
    Returns list of (lat, lon) waypoints.
    """
    points: list[tuple[float, float]] = []
    current_lat, current_lon = lat, lon
    current_heading = heading_deg
    for _ in range(step_seconds, duration_seconds + step_seconds, step_seconds):
        dist = speed_mps * step_seconds
        current_lat, current_lon = project_point(current_lat, current_lon, current_heading, dist)
        points.append((current_lat, current_lon))
        current_heading = (current_heading + turn_rate_deg_per_s * step_seconds) % 360
    return points
