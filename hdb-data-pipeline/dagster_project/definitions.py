"""Dagster entry point. Discovered via [tool.dagster] module_name in pyproject.toml,
or explicitly with `dagster dev -m dagster_project.definitions`.
"""

import dagster as dg

from dagster_project import assets as assets_module
from dagster_project.schedules import resale_job, resale_schedule

defs = dg.Definitions(
    assets=dg.load_assets_from_modules([assets_module]),
    jobs=[resale_job],
    schedules=[resale_schedule],
)
