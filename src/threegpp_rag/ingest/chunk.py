from threegpp_rag.ingest.parse import Section
from threegpp_rag.types import Chunk

def _split_units(body: str) -> list[str]:
    """Split into atomic units: paragraphs, and table rows as whole lines."""
    units: list[str] = []
    for block in body.split("\n\n"):
        if "|" in block and "\n" in block:
            units.extend(block.splitlines())
        else:
            units.append(block)
    return [u for u in units if u.strip()]

def chunk_sections(
    sections: list[Section],
    max_chars: int = 1600,
    overlap: int = 200,
) -> list[Chunk]:
    chunks: list[Chunk] = []
    for sec in sections:
        header = f"[{sec.spec} §{sec.clause}] {sec.title}"
        units = _split_units(sec.body)
        buf: list[str] = []
        size = 0
        idx = 0

        def emit(parts: list[str]) -> None:
            nonlocal idx
            text = header + "\n\n" + "\n".join(parts)
            chunks.append(Chunk(
                id=f"{sec.spec.replace(' ', '')}|{sec.clause}|{idx}",
                text=text, spec=sec.spec, clause=sec.clause, title=sec.title,
            ))
            idx += 1

        for unit in units:
            if buf and size + len(unit) > max_chars:
                emit(buf)
                tail, tail_len = [], 0
                for u in reversed(buf):
                    if tail_len + len(u) > overlap:
                        break
                    tail.insert(0, u)
                    tail_len += len(u)
                buf, size = tail, tail_len
            buf.append(unit)
            size += len(unit)
        if buf:
            emit(buf)
    return chunks
