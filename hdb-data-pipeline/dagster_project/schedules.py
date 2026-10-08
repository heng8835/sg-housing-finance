"""Scheduling for the resale pipeline (DEC-009).

HDB resale data updates roughly monthly on data.gov.sg; a weekly refresh is
frequent enough to catch that without wasting runs. Change CRON_SCHEDULE below
if a different cadence is wanted.
"""

import dagster as dg

from dagster_project.assets import RESALE_GROUP

resale_job = dg.define_asset_job(
    name="resale_pipeline_job",
    selection=dg.AssetSelection.groups(RESALE_GROUP),
    description="Fetch -> geocode -> enrich -> validate -> export -> sync to Google Sheets.",
)

CRON_SCHEDULE = "0 8 * * 1"  # every Monday 08:00

resale_schedule = dg.ScheduleDefinition(
    name="resale_weekly_schedule",
    job=resale_job,
    cron_schedule=CRON_SCHEDULE,
    execution_timezone="Asia/Singapore",
    description="Weekly resale pipeline run. Requires dagster-daemon running continuously to fire.",
)
