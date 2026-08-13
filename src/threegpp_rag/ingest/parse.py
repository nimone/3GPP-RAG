import re
from dataclasses import dataclass
from pathlib import Path
import anydoc

# Real clause heading: markdown '#'s, then dotted number, then title.
# '#' prefix separates genuine headings from TOC lines (plain paragraphs).
HEADING = re.compile(r"^(#+)[ \t]+(\d+(?:\.\d+)*)[ \t]+(\S.*?)[ \t]*$", re.M)

SKIP_TITLES = {"scope", "references", "foreword", "change history",
               "definitions", "abbreviations", "terms"}

@dataclass
class Section:
    spec: str
    clause: str
    title: str
    body: str

def sections_from_markdown(md: str, spec: str) -> list[Section]:
    """Split Markdown into one Section per clause heading.

    Text before the first heading is dropped: cover page and TOC.
    """
    matches = list(HEADING.finditer(md))
    sections: list[Section] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        body = md[start:end].strip()
        if not body:
            continue      # container clause: holds only sub-clauses
        title = m.group(3).strip()
        if title.lower() in SKIP_TITLES:
            continue
        sections.append(Section(spec=spec, clause=m.group(2), title=title, body=body))
    return sections

def parse_docx(path: Path, spec: str) -> list[Section]:
    return sections_from_markdown(anydoc.to_markdown(str(path)), spec)
