from threegpp_rag.db import to_pgvector

def test_to_pgvector_formats_as_bracketed_csv():
    assert to_pgvector([1.0, 2.5, -3.0]) == "[1.0,2.5,-3.0]"

def test_to_pgvector_empty():
    assert to_pgvector([]) == "[]"
