"""Push a processed CSV to Google Sheets so Tableau Public can auto-refresh (DEC-006).

Tableau Public has no publishing API and cannot refresh from local files on a
schedule; Google Sheets is the only source type it will auto-sync. This module
overwrites one worksheet with the full contents of a DataFrame on every pipeline
run, so the Sheet always mirrors data/processed/ exactly (see docs/TABLEAU_PUBLISHING.md).

Requires HDB_PIPELINE_GSHEETS_SHEET_ID and a service-account key file (default
secrets/gsheets-service-account.json, gitignored) that has been shared as Editor
on the target Sheet.
"""

import gspread
import pandas as pd
from google.oauth2.service_account import Credentials

from hdb_pipeline.config import Settings

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Google Sheets' hard limit; pushing near/at this size will fail outright.
MAX_CELLS = 10_000_000

# Rows per API call. A large dataset sent as one JSON payload (over a corporate
# proxy) risks request-size/timeout failures well before the 10M-cell sheet limit;
# batching keeps each request small and lets a failed run resume cleanly.
BATCH_ROWS = 5000


class GSheetsNotConfigured(Exception):
    """Raised when the sheet ID or key file is missing, so callers can treat the
    Sheets push as optional (Option A still works without it)."""


def _client(settings: Settings) -> gspread.Client:
    if not settings.gsheets_key_file.exists():
        raise GSheetsNotConfigured(
            f"service account key file not found: {settings.gsheets_key_file}"
        )
    creds = Credentials.from_service_account_file(str(settings.gsheets_key_file), scopes=SCOPES)
    return gspread.authorize(creds)


def push_dataframe(
    df: pd.DataFrame,
    settings: Settings,
    worksheet_name: str = "resale_transactions",
    log=print,
) -> str:
    """Overwrite `worksheet_name` in the configured Sheet with df's full contents.

    Returns the Sheet's URL. Raises GSheetsNotConfigured if no sheet ID is set.
    """
    if not settings.gsheets_sheet_id:
        raise GSheetsNotConfigured("HDB_PIPELINE_GSHEETS_SHEET_ID is not set")

    cell_count = (len(df) + 1) * len(df.columns)  # +1 for the header row
    if cell_count > MAX_CELLS:
        raise ValueError(
            f"{cell_count:,} cells exceeds the Google Sheets limit of {MAX_CELLS:,}; "
            "trim columns or rows before pushing"
        )

    client = _client(settings)
    spreadsheet = client.open_by_key(settings.gsheets_sheet_id)

    try:
        worksheet = spreadsheet.worksheet(worksheet_name)
    except gspread.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(
            title=worksheet_name, rows=len(df) + 1, cols=len(df.columns)
        )

    # NaN/NaT are not JSON-serializable for the Sheets API; blank them out.
    values = [df.columns.tolist()] + df.astype(object).where(df.notna(), "").values.tolist()

    worksheet.clear()
    worksheet.resize(rows=len(values), cols=len(df.columns))

    for start in range(0, len(values), BATCH_ROWS):
        chunk = values[start : start + BATCH_ROWS]
        worksheet.update(
            chunk, range_name=f"A{start + 1}", value_input_option="RAW"
        )
        log(f"  ...wrote rows {start + 1}-{start + len(chunk)} of {len(values)}")

    log(f"pushed {len(df)} rows x {len(df.columns)} cols to worksheet '{worksheet_name}'")
    return spreadsheet.url
