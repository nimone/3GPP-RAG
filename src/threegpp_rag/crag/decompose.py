import re
from typing import Callable

Scorer = Callable[[str, list[str]], list[float]]

_DECIMAL = re.compile(r"(\d)\.(\d)")
_ABBREVS = ["e.g.", "i.e.", "etc.", "cf.", "vs.", "No.", "Fig.", "Ref."]
_SENTENCE = re.compile(r"[^.!?]+[.!?]+|[^.!?]+$")

def split_into_strips(text: str) -> list[str]:
    """Split into sentence-level strips.

    Decimals and abbreviations are masked first: 3GPP prose is dense with
    'TS 28.552' and '1.5 dB', which naive split on '.' would shred.
    Table rows are yielded whole — a half row is meaningless.
    """
    out: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("|"):
            out.append(line)
            continue
        masked = _DECIMAL.sub(r"\1__DEC__\2", line)
        for a in _ABBREVS:
            masked = masked.replace(a, a.replace(".", "__ABBR__"))
        for frag in _SENTENCE.findall(masked):
            s = frag.strip().replace("__DEC__", ".").replace("__ABBR__", ".")
            if s:
                out.append(s)
    return out

def recompose(query: str, text: str, scorer: Scorer, keep_threshold: float) -> str:
    """Keep only strips scoring above threshold.

    CRAG's knowledge refinement: shrinks context the generator can drift into,
    without discarding the chunk wholesale.
    """
    strips = split_into_strips(text)
    if not strips:
        return ""
    scores = scorer(query, strips)
    return " ".join(s for s, sc in zip(strips, scores) if sc >= keep_threshold)
