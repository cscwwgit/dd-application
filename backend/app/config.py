"""Application configuration constants."""
import os

# Simulation area: Canadian Arctic / northern Canada
LAT_MIN = 60.0
LAT_MAX = 75.0
LON_MIN = -130.0
LON_MAX = -60.0

# Asset simulation
NUM_ASSETS = 130
SIMULATION_SEED = 42
TICK_INTERVAL_SECONDS = 1.0

# Threat analysis
PREDICTION_HORIZON_SECONDS = 600  # 10 minutes
PROJECTION_STEP_SECONDS = 10
WARNING_TTE_THRESHOLD_SECONDS = 120  # 2 minutes
TTE_FINE_THRESHOLD_SECONDS = 180  # near-term window scanned at 1-second resolution

# History
HISTORY_WINDOW_SECONDS = 300  # 5 minutes

# Drone
DRONE_SPEED_MPS = 300.0
DRONE_SHADOW_DISTANCE_M = 750.0       # threshold to enter shadowing state (m)
DRONE_SHADOW_STANDOFF_M = 500.0       # standoff behind target (m)
DRONE_WAYPOINT_ARRIVAL_M = 1000.0     # distance to consider waypoint reached (m)

# Threat hysteresis: consecutive clear ticks before downgrading
HYSTERESIS_TICKS = 3

# Database
DB_PATH = os.getenv("DB_PATH", "rzam.db")
