"""Tests for threat analysis logic."""
from datetime import datetime, timezone

import pytest

from app.models import AssetState
from app.services.threat_analyzer import ThreatAnalyzer, assess_asset

ZONE = {
    "id": "zone-test",
    "name": "Test Zone",
    "geojson": {
        "type": "Polygon",
        "coordinates": [
            [
                [-100.0, 65.0],
                [-90.0, 65.0],
                [-90.0, 70.0],
                [-100.0, 70.0],
                [-100.0, 65.0],
            ]
        ],
    },
}


def make_asset(lat: float, lon: float, heading: float = 0.0, speed: float = 50.0) -> AssetState:
    return AssetState(
        id="test-asset",
        callsign="TEST01",
        asset_type="aircraft",
        lat=lat,
        lon=lon,
        altitude_m=5000.0,
        heading_deg=heading,
        speed_mps=speed,
        threat_level="normal",
        nearest_zone_id=None,
        distance_to_nearest_zone_m=None,
        tte_seconds=None,
        updated_at=datetime.now(timezone.utc),
    )


def test_asset_inside_zone_is_critical():
    """Asset currently inside a zone gets threat_level=critical."""
    asset = make_asset(lat=67.5, lon=-95.0)
    result = assess_asset(asset, [ZONE])
    assert result.threat_level == "critical"
    assert result.tte_seconds == 0.0


def test_asset_outside_zone_far_away_is_normal():
    """Asset far from zone with no trajectory toward it is normal."""
    # Heading away (south), far from zone
    asset = make_asset(lat=50.0, lon=-95.0, heading=180.0, speed=50.0)
    result = assess_asset(asset, [ZONE])
    assert result.threat_level == "normal"


def test_tte_for_asset_heading_toward_zone():
    """Asset heading toward zone returns finite TTE."""
    # Asset just south of zone, heading north toward it
    asset = make_asset(lat=63.0, lon=-95.0, heading=0.0, speed=500.0)
    result = assess_asset(asset, [ZONE])
    assert result.tte_seconds is not None
    assert result.tte_seconds > 0


def test_asset_projected_to_enter_zone_within_threshold_is_warning():
    """Asset projected to enter zone within WARNING_TTE_THRESHOLD_SECONDS gets warning."""
    # Just outside zone to the south, heading north at very high speed
    # so it will cross the 65.0 lat boundary within warning threshold (120s)
    asset = make_asset(lat=64.9, lon=-95.0, heading=0.0, speed=500.0)
    result = assess_asset(asset, [ZONE])
    assert result.threat_level == "warning"
    assert result.tte_seconds is not None
    assert result.tte_seconds <= 120.0


def test_no_zones_returns_normal():
    """With no zones, all assets are normal."""
    asset = make_asset(lat=67.5, lon=-95.0)
    result = assess_asset(asset, [])
    assert result.threat_level == "normal"
    assert result.tte_seconds is None


def test_threat_analyzer_tracks_transitions():
    """ThreatAnalyzer.get_transitions detects level changes."""
    analyzer = ThreatAnalyzer()

    # First tick: asset outside zone, far away
    asset_far = make_asset(lat=50.0, lon=-95.0, heading=180.0, speed=50.0)
    assessments = analyzer.analyze([asset_far], [ZONE])
    transitions = analyzer.get_transitions(assessments)
    # Going from implicit "normal" to "normal" → no transition
    assert len(transitions) == 0

    # Second tick: asset inside zone
    asset_in = make_asset(lat=67.5, lon=-95.0)
    assessments2 = analyzer.analyze([asset_in], [ZONE])
    transitions2 = analyzer.get_transitions(assessments2)
    assert len(transitions2) == 1
    _, old, new = transitions2[0]
    assert old == "normal"
    assert new == "critical"


def test_critical_has_precedence_over_warning():
    """Asset inside zone is always critical, never warning, regardless of heading."""
    # Asset inside zone heading away — should still be critical (not warning or normal)
    asset = make_asset(lat=67.5, lon=-95.0, heading=180.0, speed=500.0)
    result = assess_asset(asset, [ZONE])
    assert result.threat_level == "critical"
    assert result.tte_seconds == 0.0


def test_asset_outside_zone_projected_to_enter_is_warning():
    """Asset outside zone projected to enter within threshold is warning, not critical."""
    asset = make_asset(lat=64.9, lon=-95.0, heading=0.0, speed=500.0)
    result = assess_asset(asset, [ZONE])
    assert result.threat_level == "warning"
    assert result.tte_seconds is not None
    assert result.tte_seconds <= 120.0


def test_asset_inside_zone_remains_critical_even_when_leaving():
    """
    Hysteresis: asset that was critical but moves outside zone still reports
    critical for HYSTERESIS_TICKS ticks before downgrading.
    """
    from app.config import HYSTERESIS_TICKS

    analyzer = ThreatAnalyzer()

    # Establish critical state
    asset_in = make_asset(lat=67.5, lon=-95.0)
    raw = analyzer.analyze([asset_in], [ZONE])
    smoothed = analyzer.apply_hysteresis(raw)
    analyzer.get_transitions(smoothed)
    assert smoothed[0].threat_level == "critical"

    # Now asset leaves zone, heading away (should be normal raw)
    asset_out = make_asset(lat=50.0, lon=-95.0, heading=180.0, speed=10.0)
    held_levels = []
    for _ in range(HYSTERESIS_TICKS + 1):
        raw = analyzer.analyze([asset_out], [ZONE])
        smoothed = analyzer.apply_hysteresis(raw)
        held_levels.append(smoothed[0].threat_level)

    # First HYSTERESIS_TICKS ticks should still be critical (held)
    for i in range(HYSTERESIS_TICKS - 1):
        assert held_levels[i] == "critical", f"tick {i} should be held critical"
    # After enough ticks it should clear
    assert held_levels[-1] == "normal"


def test_asset_exiting_zone_clears_after_hysteresis():
    """Threat level drops to normal exactly after HYSTERESIS_TICKS clear ticks."""
    from app.config import HYSTERESIS_TICKS

    analyzer = ThreatAnalyzer()
    asset_in = make_asset(lat=67.5, lon=-95.0)

    raw = analyzer.analyze([asset_in], [ZONE])
    smoothed = analyzer.apply_hysteresis(raw)
    analyzer.get_transitions(smoothed)

    asset_out = make_asset(lat=50.0, lon=-95.0, heading=180.0, speed=10.0)
    for tick in range(HYSTERESIS_TICKS + 2):
        raw = analyzer.analyze([asset_out], [ZONE])
        smoothed = analyzer.apply_hysteresis(raw)
        analyzer.get_transitions(smoothed)

    # Well past hysteresis window — must be normal
    assert smoothed[0].threat_level == "normal"


def test_zone_created_around_existing_asset_creates_breach():
    """
    assess_asset returns critical immediately when a zone is placed around an asset
    that is already at that position — simulates zone-created-around-asset scenario.
    """
    # Asset is stationary at 67.5, -95 (well inside ZONE)
    asset = make_asset(lat=67.5, lon=-95.0, heading=0.0, speed=0.0)
    result = assess_asset(asset, [ZONE])
    assert result.threat_level == "critical"
    assert result.nearest_zone_id == ZONE["id"]
