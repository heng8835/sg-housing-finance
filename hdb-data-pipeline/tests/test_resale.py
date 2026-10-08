from pathlib import Path

from hdb_pipeline.config import Settings
from hdb_pipeline.sources.resale import fetch_resale_transactions


def settings():
    return Settings(proxy_url=None, data_dir=Path("data"), timeout_s=30)


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakePagedSession:
    """Serves 5 records total in pages of 2 (2 + 2 + 1)."""

    def __init__(self):
        self.records = [
            {"_id": i, "Month": f"2024-0{i}", "Town": "BEDOK", "resale_price": 500000 + i}
            for i in range(1, 6)
        ]
        self.calls = []

    def get(self, url, params=None, **kwargs):
        self.calls.append(params)
        offset, limit = params["offset"], params["limit"]
        page = self.records[offset : offset + limit]
        return FakeResponse({"result": {"records": page, "total": len(self.records)}})


def test_fetch_paginates_until_total(capsys):
    session = FakePagedSession()
    df = fetch_resale_transactions(session, settings(), page_size=2, log=lambda m: None)
    assert len(df) == 5
    assert [c["offset"] for c in session.calls] == [0, 2, 4]


def test_fetch_lowercases_columns():
    session = FakePagedSession()
    df = fetch_resale_transactions(session, settings(), page_size=2, log=lambda m: None)
    assert "month" in df.columns
    assert "town" in df.columns
    assert "Month" not in df.columns


def test_fetch_stops_on_empty_page():
    class EmptyPageSession(FakePagedSession):
        def get(self, url, params=None, **kwargs):
            self.calls.append(params)
            # claims 100 total but returns nothing: must not loop forever
            return FakeResponse({"result": {"records": [], "total": 100}})

    session = EmptyPageSession()
    df = fetch_resale_transactions(session, settings(), page_size=2, log=lambda m: None)
    assert len(df) == 0
    assert len(session.calls) == 1
