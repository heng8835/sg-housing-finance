from pathlib import Path

import pandas as pd
import pytest

from hdb_pipeline.config import Settings
from hdb_pipeline.export import gsheets


def settings(sheet_id="sheet123", key_file=Path("secrets/key.json")):
    return Settings(
        proxy_url=None,
        data_dir=Path("data"),
        timeout_s=30,
        gsheets_key_file=key_file,
        gsheets_sheet_id=sheet_id,
    )


class FakeWorksheet:
    def __init__(self, title):
        self.title = title
        self.cleared = False
        self.resized = None
        self.update_calls = []  # list of (values, kwargs) in call order

    def clear(self):
        self.cleared = True

    def resize(self, rows, cols):
        self.resized = (rows, cols)

    def update(self, values, **kwargs):
        self.update_calls.append((values, kwargs))

    def all_written_rows(self):
        """Reassemble every row written across all batched update() calls, in order."""
        rows = []
        for values, _ in self.update_calls:
            rows.extend(values)
        return rows


class FakeSpreadsheet:
    url = "https://docs.google.com/spreadsheets/d/sheet123"

    def __init__(self, existing_worksheets=()):
        self._worksheets = {w: FakeWorksheet(w) for w in existing_worksheets}
        self.added = []

    def worksheet(self, name):
        if name not in self._worksheets:
            import gspread

            raise gspread.WorksheetNotFound(name)
        return self._worksheets[name]

    def add_worksheet(self, title, rows, cols):
        ws = FakeWorksheet(title)
        self._worksheets[title] = ws
        self.added.append(title)
        return ws


class FakeClient:
    def __init__(self, spreadsheet):
        self.spreadsheet = spreadsheet

    def open_by_key(self, key):
        self.opened_key = key
        return self.spreadsheet


def sample_df():
    return pd.DataFrame({"town": ["BEDOK", "HOUGANG"], "resale_price": [500000, 480000]})


def test_raises_when_sheet_id_missing(monkeypatch):
    monkeypatch.setattr(gsheets, "_client", lambda s: FakeClient(FakeSpreadsheet()))
    with pytest.raises(gsheets.GSheetsNotConfigured):
        gsheets.push_dataframe(sample_df(), settings(sheet_id=None), log=lambda m: None)


def test_raises_when_key_file_missing(tmp_path):
    s = settings(key_file=tmp_path / "does-not-exist.json")
    with pytest.raises(gsheets.GSheetsNotConfigured):
        gsheets.push_dataframe(sample_df(), s, log=lambda m: None)


def test_pushes_header_and_rows_to_existing_worksheet(monkeypatch):
    sheet = FakeSpreadsheet(existing_worksheets=["resale_transactions"])
    monkeypatch.setattr(gsheets, "_client", lambda s: FakeClient(sheet))

    url = gsheets.push_dataframe(sample_df(), settings(), log=lambda m: None)

    ws = sheet._worksheets["resale_transactions"]
    assert ws.cleared
    assert ws.resized == (3, 2)  # 2 data rows + header, 2 cols
    assert ws.all_written_rows() == [
        ["town", "resale_price"],
        ["BEDOK", 500000],
        ["HOUGANG", 480000],
    ]
    assert url == FakeSpreadsheet.url


def test_creates_worksheet_when_missing(monkeypatch):
    sheet = FakeSpreadsheet(existing_worksheets=[])
    monkeypatch.setattr(gsheets, "_client", lambda s: FakeClient(sheet))

    gsheets.push_dataframe(sample_df(), settings(), log=lambda m: None)

    assert sheet.added == ["resale_transactions"]


def test_nan_values_become_blank_strings(monkeypatch):
    sheet = FakeSpreadsheet(existing_worksheets=["resale_transactions"])
    monkeypatch.setattr(gsheets, "_client", lambda s: FakeClient(sheet))

    df = pd.DataFrame({"town": ["BEDOK", None], "latitude": [1.32, float("nan")]})
    gsheets.push_dataframe(df, settings(), log=lambda m: None)

    ws = sheet._worksheets["resale_transactions"]
    assert ws.all_written_rows()[2] == ["", ""]


def test_cell_limit_exceeded_raises_before_any_api_call(monkeypatch):
    called = []
    monkeypatch.setattr(gsheets, "_client", lambda s: called.append(1) or FakeClient(FakeSpreadsheet()))
    monkeypatch.setattr(gsheets, "MAX_CELLS", 4)  # (2 rows + header) * 2 cols = 6 > 4

    with pytest.raises(ValueError, match="exceeds the Google Sheets limit"):
        gsheets.push_dataframe(sample_df(), settings(), log=lambda m: None)
    assert called == []  # never even authenticated


def test_large_dataframe_written_in_batches(monkeypatch):
    sheet = FakeSpreadsheet(existing_worksheets=["resale_transactions"])
    monkeypatch.setattr(gsheets, "_client", lambda s: FakeClient(sheet))
    monkeypatch.setattr(gsheets, "BATCH_ROWS", 10)

    df = pd.DataFrame({"n": list(range(25))})  # 25 data rows + header = 26 values-rows
    gsheets.push_dataframe(df, settings(), log=lambda m: None)

    ws = sheet._worksheets["resale_transactions"]
    # 26 rows at batch size 10 -> 3 calls (10, 10, 6)
    assert [len(v) for v, _ in ws.update_calls] == [10, 10, 6]
    assert [kw["range_name"] for _, kw in ws.update_calls] == ["A1", "A11", "A21"]
    assert ws.all_written_rows() == [["n"]] + [[i] for i in range(25)]


def test_batches_use_raw_input_option(monkeypatch):
    sheet = FakeSpreadsheet(existing_worksheets=["resale_transactions"])
    monkeypatch.setattr(gsheets, "_client", lambda s: FakeClient(sheet))

    gsheets.push_dataframe(sample_df(), settings(), log=lambda m: None)

    ws = sheet._worksheets["resale_transactions"]
    for _, kwargs in ws.update_calls:
        assert kwargs["value_input_option"] == "RAW"
