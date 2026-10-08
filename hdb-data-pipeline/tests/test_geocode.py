from hdb_pipeline.sources.geocode import format_geocode_address


def test_format_geocode_address():
    assert (
        format_geocode_address("406", "ANG MO KIO AVE 10")
        == "406 ANG MO KIO AVE 10 SINGAPORE"
    )


def test_format_geocode_address_strips_and_stringifies():
    assert format_geocode_address(" 15 ", " HOUGANG AVE 3 ") == "15 HOUGANG AVE 3 SINGAPORE"
    assert format_geocode_address(243, "HOUGANG ST 22") == "243 HOUGANG ST 22 SINGAPORE"
