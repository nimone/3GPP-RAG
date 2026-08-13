import re, sys
from pathlib import Path
import psycopg
from threegpp_rag.config import get_settings
from threegpp_rag.db import connect, to_pgvector
from threegpp_rag.ingest.chunk import chunk_sections
from threegpp_rag.ingest.parse import parse_docx
from threegpp_rag.ingest.parse_openapi import parse_openapi
from threegpp_rag.jina import embed

BATCH = 64

def spec_from_filename(path: Path) -> str:
    """'28552-k30.docx' -> 'TS 28.552'"""
    m = re.match(r"(\d{2})(\d{3})", path.stem)
    if not m:
        raise ValueError(f"Cannot derive spec number from {path.name}")
    return f"TS {m.group(1)}.{m.group(2)}"

def main() -> None:
    files = sorted(Path("data/raw").glob("*.docx"))
    if not files:
        sys.exit("No .docx files in data/raw/")

    all_sections = []
    for f in files:
        spec = spec_from_filename(f)
        secs = parse_docx(f, spec)
        print(f"{f.name}: {len(secs)} sections [{spec}]")
        all_sections.extend(secs)

    for f in sorted(Path("data/raw/openapi").glob("*.yaml")):
        secs = parse_openapi(f)
        print(f"{f.name}: {len(secs)} sections")
        all_sections.extend(secs)

    all_chunks = chunk_sections(all_sections)
    print(f"{len(all_sections)} sections -> {len(all_chunks)} chunks")
    print(f"total {len(all_chunks)} chunks; ~{sum(len(c.text) for c in all_chunks)//4} tokens to embed")

    if input("proceed? [y/N] ").strip().lower() != "y":
        sys.exit("aborted")

    with connect() as conn:
        for i in range(0, len(all_chunks), BATCH):
            batch = all_chunks[i:i + BATCH]
            vectors = embed([c.text for c in batch], "passage")
            with conn.cursor() as cur:
                cur.executemany(
                    """insert into chunks (id, text, spec, clause, title, embedding)
                       values (%s, %s, %s, %s, %s, %s)
                       on conflict (id) do update set
                         text = excluded.text, embedding = excluded.embedding""",
                    [(c.id, c.text, c.spec, c.clause, c.title, to_pgvector(v))
                     for c, v in zip(batch, vectors)],
                )
            conn.commit()
            print(f"  upserted {i + len(batch)}/{len(all_chunks)}")

if __name__ == "__main__":
    main()
