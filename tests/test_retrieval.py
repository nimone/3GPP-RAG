from threegpp_rag.retrieval import rrf_sql, rows_to_chunks

def test_rrf_sql_fuses_both_arms():
    sql = rrf_sql()
    assert "embedding <=>" in sql
    assert "plainto_tsquery" in sql
    assert "1.0 / (60 +" in sql
    assert "full outer join" in sql.lower()

def test_rows_to_chunks_maps_fields():
    rows = [{"id": "a", "text": "t", "spec": "TS 28.552", "clause": "5.1", "title": "KPI"}]
    chunks = rows_to_chunks(rows)
    assert chunks[0].citation == "TS 28.552 §5.1"
