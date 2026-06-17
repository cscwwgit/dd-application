"""Threat analysis: computes threat levels and TTE for assets against zones."""
from __future__ import annotations

from app.config import (
    HYSTERESIS_TICKS,
    PREDICTION_HORIZON_SECONDS,
    PROJECTION_STEP_SECONDS,
    TTE_FINE_THRESHOLD_SECONDS,
    WARNING_TTE_THRESHOLD_SECONDS,
)
from app.models import AssetState, ThreatAssessment
from app.services.geo import (
    nearest_zone_distance_m,
    point_in_zone,
    project_point,
)

# Threat level priority order (higher index = higher severity)
_LEVEL_RANK = {"normal": 0, "warning": 1, "critical": 2}


def assess_asset(asset: AssetState, zones: list[dict]) -> ThreatAssessment:
    """
    Calculate threat level and TTE for a single asset against a list of zone dicts.
    Semantics:
      critical  — asset is currently inside any restricted zone
      warning   — asset is outside all zones but projects entry within WARNING_TTE_THRESHOLD_SECONDS
      normal    — neither of the above
    Critical always takes precedence over warning.
    """
    if not zones:
        return ThreatAssessment(
            asset_id=asset.id,
            threat_level="normal",
            nearest_zone_id=None,
            distance_to_nearest_zone_m=None,
            tte_seconds=None,
            reason="no zones defined",
        )

    # Critical check: inside any zone right now (regardless of heading)
    for zone in zones:
        if point_in_zone(asset.lat, asset.lon, zone["geojson"]):
            return ThreatAssessment(
                asset_id=asset.id,
                threat_level="critical",
                nearest_zone_id=zone["id"],
                distance_to_nearest_zone_m=0.0,
                tte_seconds=0.0,
                reason=f"inside zone {zone['name']}",
            )

    # Project forward to find earliest TTE. Project from the origin using
    # cumulative distance (speed x t) so all samples stay consistent.
    # Near-term window is scanned at 1-second resolution so the operator sees a
    # live countdown; the longer horizon is sampled coarsely for efficiency.
    tte: float | None = None
    entry_zone_id: str | None = None

    for t in range(1, TTE_FINE_THRESHOLD_SECONDS + 1):
        lat, lon = project_point(asset.lat, asset.lon, asset.heading_deg, asset.speed_mps * t)
        entry_zone = next((z for z in zones if point_in_zone(lat, lon, z["geojson"])), None)
        if entry_zone is not None:
            tte = float(t)
            entry_zone_id = entry_zone["id"]
            break

    if tte is None:
        for step in range(
            TTE_FINE_THRESHOLD_SECONDS + PROJECTION_STEP_SECONDS,
            PREDICTION_HORIZON_SECONDS + PROJECTION_STEP_SECONDS,
            PROJECTION_STEP_SECONDS,
        ):
            lat, lon = project_point(asset.lat, asset.lon, asset.heading_deg, asset.speed_mps * step)
            entry_zone = next((z for z in zones if point_in_zone(lat, lon, z["geojson"])), None)
            if entry_zone is not None:
                tte = float(step)
                entry_zone_id = entry_zone["id"]
                break

    nearest_id, nearest_dist = nearest_zone_distance_m(asset.lat, asset.lon, zones)

    if tte is not None and tte <= WARNING_TTE_THRESHOLD_SECONDS:
        return ThreatAssessment(
            asset_id=asset.id,
            threat_level="warning",
            nearest_zone_id=entry_zone_id,
            distance_to_nearest_zone_m=nearest_dist,
            tte_seconds=tte,
            reason=f"projected entry in {tte:.0f}s",
        )

    return ThreatAssessment(
        asset_id=asset.id,
        threat_level="normal",
        nearest_zone_id=nearest_id,
        distance_to_nearest_zone_m=nearest_dist,
        tte_seconds=tte,
        reason="no imminent threat",
    )


class ThreatAnalyzer:
    """
    Stateful analyzer that tracks previous threat levels to detect transitions.
    Implements hysteresis: an elevated state only clears after HYSTERESIS_TICKS
    consecutive ticks at the lower level, preventing boundary flapping.
    """

    def __init__(self) -> None:
        self._previous: dict[str, str] = {}       # asset_id -> reported threat level
        self._clear_counts: dict[str, int] = {}   # asset_id -> consecutive lower-level ticks

    def analyze(self, assets: list[AssetState], zones: list[dict]) -> list[ThreatAssessment]:
        return [assess_asset(asset, zones) for asset in assets]

    def apply_hysteresis(self, assessments: list[ThreatAssessment]) -> list[ThreatAssessment]:
        """
        Return assessments with hysteresis applied. An asset will not downgrade
        from a higher threat level until it has observed HYSTERESIS_TICKS consecutive
        ticks at the lower level.
        """
        smoothed: list[ThreatAssessment] = []
        for a in assessments:
            prev = self._previous.get(a.asset_id, "normal")
            raw = a.threat_level

            if _LEVEL_RANK[raw] >= _LEVEL_RANK[prev]:
                # Same level or escalation — apply immediately, reset counter
                self._clear_counts[a.asset_id] = 0
                effective = raw
            else:
                # Potential downgrade — require hysteresis
                count = self._clear_counts.get(a.asset_id, 0) + 1
                self._clear_counts[a.asset_id] = count
                if count >= HYSTERESIS_TICKS:
                    effective = raw
                else:
                    effective = prev  # hold the higher level

            if effective != raw:
                a = ThreatAssessment(
                    asset_id=a.asset_id,
                    threat_level=effective,  # type: ignore[arg-type]
                    nearest_zone_id=a.nearest_zone_id,
                    distance_to_nearest_zone_m=a.distance_to_nearest_zone_m,
                    tte_seconds=a.tte_seconds,
                    reason=a.reason + f" (held {self._clear_counts.get(a.asset_id, 0)}/{HYSTERESIS_TICKS})",
                )
            smoothed.append(a)
        return smoothed

    def get_transitions(
        self, assessments: list[ThreatAssessment]
    ) -> list[tuple[ThreatAssessment, str, str]]:
        """
        Return list of (assessment, old_level, new_level) for assets whose
        effective threat level changed this tick. Updates internal state.
        """
        transitions = []
        for a in assessments:
            old = self._previous.get(a.asset_id, "normal")
            new = a.threat_level
            if old != new:
                transitions.append((a, old, new))
            self._previous[a.asset_id] = new
        return transitions
