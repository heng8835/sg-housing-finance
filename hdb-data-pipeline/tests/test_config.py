from pathlib import Path

from hdb_pipeline.config import DEFAULT_PROXY, get_settings


def clear_env(monkeypatch):
    for var in [
        "HDB_PIPELINE_PROXY",
        "HDB_PIPELINE_DATA_DIR",
        "HDB_PIPELINE_TIMEOUT_S",
        "HDB_PIPELINE_GSHEETS_KEY_FILE",
        "HDB_PIPELINE_GSHEETS_SHEET_ID",
    ]:
        monkeypatch.delenv(var, raising=False)


def test_defaults(monkeypatch):
    clear_env(monkeypatch)
    monkeypatch.setattr("hdb_pipeline.config.load_dotenv", lambda *a, **k: None)  # ignore a local .env
    s = get_settings()
    assert s.proxy_url == DEFAULT_PROXY
    assert s.data_dir.name == "data"
    assert s.data_dir.parent.name == "hdb-data-pipeline"
    assert s.timeout_s == 30


def test_proxy_override(monkeypatch):
    clear_env(monkeypatch)
    monkeypatch.setenv("HDB_PIPELINE_PROXY", "http://other-proxy:8080")
    assert get_settings().proxy_url == "http://other-proxy:8080"


def test_empty_proxy_means_no_proxy(monkeypatch):
    clear_env(monkeypatch)
    monkeypatch.setenv("HDB_PIPELINE_PROXY", "")
    assert get_settings().proxy_url is None
    monkeypatch.setenv("HDB_PIPELINE_PROXY", "   ")
    assert get_settings().proxy_url is None


def test_data_dir_and_timeout_override(monkeypatch, tmp_path):
    clear_env(monkeypatch)
    monkeypatch.setenv("HDB_PIPELINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("HDB_PIPELINE_TIMEOUT_S", "60")
    s = get_settings()
    assert s.data_dir == Path(tmp_path)
    assert s.timeout_s == 60


def test_derived_dirs(monkeypatch, tmp_path):
    clear_env(monkeypatch)
    monkeypatch.setenv("HDB_PIPELINE_DATA_DIR", str(tmp_path))
    s = get_settings()
    assert s.raw_dir == tmp_path / "raw"
    assert s.interim_dir == tmp_path / "interim"
    assert s.processed_dir == tmp_path / "processed"
    assert s.cache_dir == tmp_path / "cache"
    assert s.external_dir == tmp_path / "external"


def test_default_data_dir_points_at_real_repo_data(monkeypatch):
    clear_env(monkeypatch)
    s = get_settings()
    # the repo's existing data tiers must be reachable from the default
    assert s.processed_dir.is_dir()
    assert (s.cache_dir / "hdb_address.csv").exists()


def test_gsheets_defaults_with_no_env_file(monkeypatch, tmp_path):
    # isolate from this repo's real .env (which sets a real sheet ID) by pointing
    # _repo_root at an empty tmp_path
    monkeypatch.setattr("hdb_pipeline.config._repo_root", lambda: tmp_path)
    clear_env(monkeypatch)
    s = get_settings()
    assert s.gsheets_sheet_id is None
    assert s.gsheets_key_file == tmp_path / "secrets" / "gsheets-service-account.json"


def test_gsheets_env_override(monkeypatch, tmp_path):
    clear_env(monkeypatch)
    monkeypatch.setenv("HDB_PIPELINE_GSHEETS_SHEET_ID", "abc123")
    key_file = tmp_path / "custom-key.json"
    monkeypatch.setenv("HDB_PIPELINE_GSHEETS_KEY_FILE", str(key_file))
    s = get_settings()
    assert s.gsheets_sheet_id == "abc123"
    assert s.gsheets_key_file == key_file


def test_dotenv_fills_sheet_id_without_overriding_real_env(monkeypatch, tmp_path):
    (tmp_path / ".env").write_text("HDB_PIPELINE_GSHEETS_SHEET_ID=from-dotenv\n", encoding="utf-8")
    monkeypatch.setattr("hdb_pipeline.config._repo_root", lambda: tmp_path)
    clear_env(monkeypatch)
    assert get_settings().gsheets_sheet_id == "from-dotenv"

    # a real environment variable still wins over .env
    monkeypatch.setenv("HDB_PIPELINE_GSHEETS_SHEET_ID", "from-real-env")
    assert get_settings().gsheets_sheet_id == "from-real-env"
