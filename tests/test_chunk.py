from threegpp_rag.ingest.parse import Section
from threegpp_rag.ingest.chunk import chunk_sections

def test_short_section_becomes_one_chunk():
    secs = [Section("TS 28.111", "4.1", "Alarms", "Short body text.")]
    chunks = chunk_sections(secs)
    assert len(chunks) == 1
    assert chunks[0].id == "TS28.111|4.1|0"
    assert chunks[0].citation == "TS 28.111 §4.1"

def test_long_section_splits_with_overlap():
    body = "\n\n".join(f"Paragraph number {i} with filler text." for i in range(200))
    chunks = chunk_sections([Section("TS 28.552", "5.1", "KPIs", body)], max_chars=500, overlap=100)
    assert len(chunks) > 1
    assert all(len(c.text) <= 700 for c in chunks)
    assert all(c.clause == "5.1" for c in chunks)

def test_table_rows_are_never_split():
    table = "\n".join(f"| row{i} | value{i} |" for i in range(80))
    chunks = chunk_sections([Section("TS 28.552", "5.2", "T", table)], max_chars=300, overlap=0)
    for c in chunks:
        for line in c.text.splitlines():
            if line.startswith("|"):
                assert line.endswith("|"), f"table row was cut: {line!r}"

def test_every_chunk_carries_heading_context():
    chunks = chunk_sections([Section("TS 28.552", "5.1", "Number of attempts", "Body.")])
    assert "5.1" in chunks[0].text and "Number of attempts" in chunks[0].text
