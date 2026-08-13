from pathlib import Path
import pytest
from threegpp_rag.ingest.parse import Section, parse_docx, sections_from_markdown

MD = """\
| cover | page |
| --- | --- |
| 3GPP TS 28.111 V19.5.0 | |

5.1.1 Some TOC entry 38
5.1.2 Another TOC entry 39

# 4 Concepts and overview

Fault supervision is described here.

## 4.1 Alarm notifications

An alarm is a notification of a specific event.

| Field | Description |
| --- | --- |
| alarmId | Identifies the alarm |

Trailing text after the table.

## 4.2 Container clause

### 4.2.1 Leaf clause

Leaf body text.
"""

def test_splits_on_heading_clauses():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert [s.clause for s in secs] == ["4", "4.1", "4.2.1"]
    assert secs[0].title == "Concepts and overview"
    assert secs[0].spec == "TS 28.111"

def test_toc_lines_are_not_sections():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert all("TOC entry" not in s.title for s in secs)
    assert "5.1.1" not in [s.clause for s in secs]

def test_cover_table_before_first_heading_is_dropped():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert all("3GPP TS 28.111 V19.5.0" not in s.body for s in secs)

def test_table_preserved_in_document_order():
    secs = sections_from_markdown(MD, "TS 28.111")
    body = next(s for s in secs if s.clause == "4.1").body
    assert "| alarmId | Identifies the alarm |" in body
    assert body.index("An alarm is") < body.index("alarmId") < body.index("Trailing text")

def test_container_clause_with_no_body_is_dropped():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert "4.2" not in [s.clause for s in secs]
    assert "4.2.1" in [s.clause for s in secs]

def test_citation_uses_section_metadata():
    secs = sections_from_markdown(MD, "TS 28.111")
    assert secs[1].spec == "TS 28.111" and secs[1].clause == "4.1"

def test_boilerplate_titles_skipped():
    md = "# 1 Scope\n\nThis document...\n\n# 4 Real content\n\nBody.\n"
    secs = sections_from_markdown(md, "TS 28.111")
    assert [s.clause for s in secs] == ["4"]
