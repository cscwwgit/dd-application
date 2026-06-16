"""Tests for geo utility functions."""
import pytest

from app.services.geo import (
    haversine_distance_m,
    point_in_polygon,
    point_in_zone,
    project_point,
)

# A simple square polygon in GeoJSON [lon, lat] format
SQUARE_POLYGON = [
    [-100.0, 65.0],
    [-90.0, 65.0],
    [-90.0, 70.0],
    [-100.0, 70.0],
    [-100.0, 65.0],
]

SQUARE_GEOJSON = {
    "type": "Polygon",
    "coordinates": [SQUARE_POLYGON],
}


def test_point_inside_zone():
    """Point inside the polygon returns True."""
    assert point_in_polygon(67.5, -95.0, SQUARE_POLYGON) is True


def test_point_outside_zone():
    """Point outside the polygon returns False."""
    assert point_in_polygon(50.0, -95.0, SQUARE_POLYGON) is False


def test_point_in_zone_geojson_inside():
    assert point_in_zone(67.5, -95.0, SQUARE_GEOJSON) is True


def test_point_in_zone_geojson_outside():
    assert point_in_zone(50.0, -95.0, SQUARE_GEOJSON) is False


def test_haversine_distance_nonzero():
    """Distance between two distinct points is positive."""
    d = haversine_distance_m(60.0, -100.0, 61.0, -100.0)
    assert d > 0


def test_haversine_distance_zero():
    """Distance from a point to itself is zero."""
    d = haversine_distance_m(65.0, -95.0, 65.0, -95.0)
    assert d == pytest.approx(0.0, abs=1e-6)


def test_project_point_moves_north():
    """Projecting northward increases latitude."""
    lat, lon = project_point(65.0, -95.0, 0.0, 111_000)  # ~1 degree north
    assert lat > 65.0
    assert abs(lon - (-95.0)) < 0.1
