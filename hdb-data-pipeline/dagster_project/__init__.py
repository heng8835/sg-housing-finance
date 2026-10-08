"""Dagster orchestration layer for the resale pipeline (DEC-009).

Business logic lives in src/hdb_pipeline/*; everything here is a thin wrapper.
The package adds src/ to sys.path on import so it works regardless of how
Dagster is invoked (dev, dagster-daemon, Task Scheduler) without needing an
editable install or a manually-set PYTHONPATH.
"""

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))
